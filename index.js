#!/usr/bin/env node
/**
 * maZoneCEC Canvas Image Backup Utility - Functional Edition
 * A clean, functional approach to canvas-based book backup
 * 
 * @author DeltaGa & Robert56s
 * @version 4.0.0
 */

import { chromium } from 'playwright';
import fs from 'fs/promises';
import fsSync from 'fs';
import path from 'path';
import { PDFDocument } from 'pdf-lib';
import readline from 'readline';
import './loadEnv.js';

// ============================================================================
// CONFIGURATION
// ============================================================================

const config = {
    auth: {
        username: process.env.USER,
        password: process.env.PASS,
        baseUrl: 'https://mazonecec.com/application/login',
    },
    selectors: {
        login: {
            username: 'xpath=//*[@id="content"]/div/div/div/div/div[1]/div/div[3]/div/div[1]/div[2]/div/div[1]/div[1]/div[1]/input',
            password: 'xpath=//*[@id="content"]/div/div/div/div/div[1]/div/div[3]/div/div[1]/div[2]/div/div[1]/div[1]/div[2]/input',
            rememberMe: 'xpath=//*[@id="content"]/div/div/div/div/div[1]/div/div[3]/div/div[1]/div[2]/div/div[1]/div[1]/button[1]',
            connectButton: 'xpath=//*[@id="content"]/div/div/div/div/div[1]/div/div[3]/div/div[1]/div[2]/div/div[1]/div[1]/button[2]',
        },
        navigation: {
            bookContainer: `xpath=//*[@id="content"]/div/div/div/div/div[1]/div/div[2]/div[2]/div/div/div/div/div/div[2]/div[2]/div`,
            bookTitle: (index) => `xpath=//*[@id="content"]/div/div/div/div/div[1]/div/div[2]/div[2]/div/div/div/div/div/div[2]/div[2]/div[${index}]/div/div/div[1]/div[2]/div/div/div/button/span`,
            openBook: (index) => `xpath=//*[@id="content"]/div/div/div/div/div[1]/div/div[2]/div[2]/div/div/div/div/div/div[2]/div[2]/div[${index}]/div/div/div[2]/div/div[2]/div/div[1]/div[1]/div/div[1]/button/img`,
            pageInput: `xpath=/html/body/div/div/div/div/div/div[1]/div/div[1]/div[2]/div/div/div[3]/div[1]/input`,
            nextButton: 'xpath=//*[@id="DocumentContainer"]/div/div[3]/div[2]/div/button',
        },
        viewer: {
            canvas: '.canvasWrapper > canvas:nth-child(1)',
        },
    },
    timeouts: {
        navigation: 3000,
        canvasLoad: 6000,
        pageReload: 5000,
    },
    processing: {
        scaleFactor: 2.0,
        reloadInterval: 10,
    },
    paths: {
        tempDir: './imgs',
        saveDir: './save',
    },
};

// ============================================================================
// UTILITY FUNCTIONS
// ============================================================================

const wait = (ms) => new Promise(resolve => setTimeout(resolve, ms));

const ensureDirs = () => {
    [config.paths.tempDir, config.paths.saveDir].forEach(dir => {
        if (!fsSync.existsSync(dir)) {
            fsSync.mkdirSync(dir, { recursive: true });
        }
    });
};

const sanitizeFilename = (filename) =>
    filename
        .replace(/[<>:"/\\|?*]/g, '_')
        .replace(/\s+/g, '_')
        .substring(0, 200)
        .trim();

const askQuestion = (query) => {
    const rl = readline.createInterface({
        input: process.stdin,
        output: process.stdout,
    });
    
    return new Promise(resolve => {
        rl.question(query, (answer) => {
            rl.close();
            resolve(answer);
        });
    });
};

// ============================================================================
// BROWSER AUTOMATION
// ============================================================================

const initBrowser = async () => {
    const browser = await chromium.launch({ headless: false });
    const page = await browser.newPage();
    await page.setViewportSize({ width: 1920, height: 1080 });
    return { browser, page };
};

const login = async (page) => {
    await page.goto(config.auth.baseUrl);
    await page.locator(config.selectors.login.username).fill(config.auth.username);
    await page.locator(config.selectors.login.password).fill(config.auth.password);
    await page.locator(config.selectors.login.rememberMe).click();
    await page.locator(config.selectors.login.connectButton).click();
    await page.waitForNavigation();
    console.log('✅ Logged in successfully');
};

const getBookList = async (page) => {
    try {
        // Wait for the book container to load
        await wait(config.timeouts.navigation);
        
        // Get all book elements by counting them
        const bookCount = await page.locator(config.selectors.navigation.bookContainer).count();
        
        const books = [];
        for (let i = 1; i <= bookCount; i++) {
            try {
                const titleLocator = page.locator(config.selectors.navigation.bookTitle(i));
                const title = await titleLocator.innerText({ timeout: 1000 });
                books.push({ index: i, title: title.trim() });
            } catch (e) {
                // Skip if book element doesn't exist
            }
        }
        
        return books;
    } catch (error) {
        console.error('Failed to get book list:', error.message);
        return [];
    }
};

const selectBook = async (page, books) => {
    if (books.length === 0) {
        throw new Error('No books found in your account');
    }
    
    // Display all books with numbers
    console.log('\n📚 Available books:');
    books.forEach((book, idx) => {
        console.log(`${book.title} (${idx + 1})`);
    });
    console.log('');
    
    const choice = await askQuestion('Select book number (or q to quit): ');
    const input = choice.trim().toLowerCase();
    
    // Check for quit
    if (input === 'q' || input === 'quit') {
        return null;
    }
    
    const selectedIndex = parseInt(input) - 1;
    
    if (selectedIndex < 0 || selectedIndex >= books.length || isNaN(selectedIndex)) {
        console.log('Invalid selection, please try again');
        return await selectBook(page, books);
    }
    
    return books[selectedIndex];
};

const openBook = async (page, bookIndex) => {
    await page.locator(config.selectors.navigation.openBook(bookIndex)).click();
    await page.waitForNavigation();
    await wait(config.timeouts.navigation);
    
    // If view is multipage, switch to single page
    try {
        const extraSelector = 'xpath=//*[@id="content"]/div/div/div/div/div[1]/div/div[2]/div[2]/div/div/div/div/div[1]/div/div/div[1]/div[2]/div[2]/div[1]/div/button/div';
        const extraLoc = page.locator(extraSelector);
        if (await extraLoc.count() > 0) {
            try {
                await extraLoc.first().click({ timeout: 2000 });
                await wait(config.timeouts.navigation);
            } catch (clickErr) {
                // ignore click errors and continue
            }
        }
    } catch (err) {
        // ignore detection errors and continue
    }

    // Navigate to cover page
    const pageInput = page.locator(config.selectors.navigation.pageInput);
    await pageInput.fill('C1');
    await pageInput.press('Enter');
    await wait(config.timeouts.navigation);
};

const extractCanvasData = async (page) => {
    await page.locator(config.selectors.viewer.canvas).waitFor();
    await wait(config.timeouts.canvasLoad);
    
    return await page.evaluate((scaleFactor) => {
        const canvas = document.getElementsByTagName('canvas')[0];
        if (!canvas) throw new Error('No canvas found');
        
        const scaledCanvas = document.createElement('canvas');
        scaledCanvas.width = Math.floor(canvas.width * scaleFactor);
        scaledCanvas.height = Math.floor(canvas.height * scaleFactor);
        
        const ctx = scaledCanvas.getContext('2d');
        ctx.imageSmoothingEnabled = true;
        ctx.imageSmoothingQuality = 'high';
        ctx.drawImage(canvas, 0, 0, scaledCanvas.width, scaledCanvas.height);
        
        return scaledCanvas.toDataURL('image/png').split(';base64,')[1];
    }, config.processing.scaleFactor);
};

const goToNextPage = async (page) => {
    try {
        await page.locator(config.selectors.navigation.nextButton).click();
        await wait(config.timeouts.navigation);
        return true;
    } catch (error) {
        return false;
    }
};

const reloadPage = async (page, currentPageNumber) => {
    const pageInput = page.locator(config.selectors.navigation.pageInput);
    const currentPage = await pageInput.inputValue();
    
    await page.reload();
    await wait(config.timeouts.pageReload);
    
    await pageInput.fill(currentPage);
    await pageInput.press('Enter');
    await wait(config.timeouts.navigation);
    
    console.log('🔄 Page reloaded for memory management');
};

// ============================================================================
// FILE OPERATIONS
// ============================================================================

const saveImage = async (pageNumber, base64Data) => {
    const filename = `${pageNumber}.png`;
    const filepath = path.join(config.paths.tempDir, filename);
    await fs.writeFile(filepath, base64Data, 'base64');
    return filepath;
};

const moveToBackup = async (bookName) => {
    const backupPath = path.join(config.paths.saveDir, sanitizeFilename(bookName));
    await fs.mkdir(backupPath, { recursive: true });
    
    const files = await fs.readdir(config.paths.tempDir);
    for (const file of files) {
        const sourcePath = path.join(config.paths.tempDir, file);
        const destPath = path.join(backupPath, file);
        await fs.copyFile(sourcePath, destPath);
    }
    
    return backupPath;
};

const cleanupTemp = async () => {
    try {
        const files = await fs.readdir(config.paths.tempDir);
        await Promise.all(
            files.map(file => fs.unlink(path.join(config.paths.tempDir, file)))
        );
    } catch (error) {
        // Ignore cleanup errors
    }
};

// ============================================================================
// PDF GENERATION
// ============================================================================

const createPDF = async (bookName, pageCount) => {
    const pdfDoc = await PDFDocument.create();
    
    for (let i = 1; i <= pageCount; i++) {
        try {
            const imagePath = path.join(config.paths.tempDir, `${i}.png`);
            const imageData = await fs.readFile(imagePath);
            
            const page = pdfDoc.addPage();
            const image = await pdfDoc.embedPng(imageData);
            
            const { width: imgWidth, height: imgHeight } = image;
            const { width: pageWidth, height: pageHeight } = page.getSize();
            
            const scale = Math.min(pageWidth / imgWidth, pageHeight / imgHeight);
            const drawWidth = imgWidth * scale;
            const drawHeight = imgHeight * scale;
            
            page.drawImage(image, {
                x: (pageWidth - drawWidth) / 2,
                y: (pageHeight - drawHeight) / 2,
                width: drawWidth,
                height: drawHeight,
            });
        } catch (error) {
            console.warn(`⚠️  Failed to add page ${i} to PDF:`, error.message);
        }
    }
    
    const pdfFilename = `${sanitizeFilename(bookName)}.pdf`;
    const pdfBytes = await pdfDoc.save();
    await fs.writeFile(pdfFilename, pdfBytes);
    
    return pdfFilename;
};

// ============================================================================
// MAIN PROCESS
// ============================================================================

const processBook = async (page, bookName) => {
    let pageNumber = 1;
    let hasNextPage = true;
    
    console.log(`\n📖 Processing "${bookName}"...`);
    console.log(`📏 Scale factor: ${config.processing.scaleFactor}x\n`);
    
    while (hasNextPage) {
        try {
            // Reload page periodically for memory management
            if (pageNumber > 1 && pageNumber % config.processing.reloadInterval === 0) {
                await reloadPage(page, pageNumber);
            }
            
            // Extract and save page
            const imageData = await extractCanvasData(page);
            await saveImage(pageNumber, imageData);
            
            console.log(`✓ Page ${pageNumber} saved`);
            
            // Move to next page
            hasNextPage = await goToNextPage(page);
            pageNumber++;
            
        } catch (error) {
            console.error(`❌ Error on page ${pageNumber}:`, error.message);
            
            // Try to continue
            hasNextPage = await goToNextPage(page);
            if (hasNextPage) {
                pageNumber++;
            }
        }
    }
    
    return pageNumber - 1; // Total pages processed
};

const goBackToLibrary = async (page) => {
    try {
        // Click back button or navigate to library
        await page.goBack();
        await wait(config.timeouts.navigation);
    } catch (error) {
        // If goBack fails, try navigating to home
        console.log('Navigating back to library...');
        await page.goto('https://mazonecec.com/application/mylibrary');
        await wait(config.timeouts.navigation);
    }
};

const main = async () => {
    let browser, page;
    
    try {
        // Validate environment
        if (!config.auth.username || !config.auth.password) {
            throw new Error('Missing USER or PASS environment variables');
        }
        
        console.log('🎨 maZoneCEC Canvas Backup Utility v4.0 - Functional Edition');
        console.log('=' .repeat(60));
        
        // Setup
        ensureDirs();
        
        // Initialize browser
        console.log('🚀 Launching browser...');
        ({ browser, page } = await initBrowser());
        
        // Login
        console.log('🔐 Logging in...');
        await login(page);
        
        // Main loop - keep processing books until user quits
        let continueProcessing = true;
        
        while (continueProcessing) {
            try {
                const bookStartTime = Date.now();
                
                // Discover and select book
                console.log('📚 Discovering books...');
                const books = await getBookList(page);
                const selectedBook = await selectBook(page, books);
                
                // Check if user wants to quit
                if (selectedBook === null) {
                    console.log('\n👋 Exiting...');
                    continueProcessing = false;
                    break;
                }
                
                console.log(`\n✓ Selected: "${selectedBook.title}"`);
                
                // Open the book
                console.log('📂 Opening book...');
                await openBook(page, selectedBook.index);
                
                // Process all pages
                const totalPages = await processBook(page, selectedBook.title);
                
                // Generate PDF
                console.log('\n📄 Generating PDF...');
                console.log(`This may take a while please wait...`);
                const pdfFilename = await createPDF(selectedBook.title, totalPages);
                console.log(`✓ PDF saved: ${pdfFilename}`);
                
                // Create backup
                console.log('💾 Creating backup...');
                const backupPath = await moveToBackup(selectedBook.title);
                console.log(`✓ Backup created: ${backupPath}`);
                
                // Summary for this book
                const duration = ((Date.now() - bookStartTime) / 1000).toFixed(2);
                console.log('\n' + '=' .repeat(60));
                console.log('✅ BOOK COMPLETED');
                console.log('=' .repeat(60));
                console.log(`📖 Book: ${selectedBook.title}`);
                console.log(`📄 Pages: ${totalPages}`);
                console.log(`⏱️  Duration: ${duration}s`);
                console.log('=' .repeat(60) + '\n');
                
                // Go back to library for next selection
                await goBackToLibrary(page);
                await cleanupTemp();
                
            } catch (error) {
                console.error('\n⚠️  Error processing book:', error.message);
                console.log('Returning to book selection...\n');
                
                // Try to go back to library to continue
                try {
                    await goBackToLibrary(page);
                } catch (navError) {
                    console.error('Could not return to library. Exiting.');
                    continueProcessing = false;
                }
            }
        }
        
    } catch (error) {
        console.error('\n💥 Error:', error.message);
        process.exit(1);
    } finally {
        if (browser) {
            await browser.close();
        }
        await cleanupTemp();
    }
};

// ============================================================================
// ENTRY POINT
// ============================================================================

main().catch(error => {
    console.error('💥 Fatal error:', error);
    process.exit(1);
});
