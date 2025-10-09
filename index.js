import { chromium } from 'playwright';
import './loadEnv.js';
import fs from 'fs';
import path from 'path';
import { PDFDocument, StandardFonts, rgb } from 'pdf-lib'
import readline from 'node:readline';

const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
});

async function timeout(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

async function start() {
    fs.mkdirSync("./imgs", { recursive: true });

    const browser = await chromium.launch({ headless: false });
    const page = await browser.newPage();

    await page.setDefaultTimeout(120_000);
    await page.goto('https://mazonecec.com/application/login');

    await page.locator('xpath=//*[@id="content"]/div/div/div/div/div[1]/div/div[3]/div/div[1]/div[2]/div/div[1]/div[1]/div[1]/input').fill(process.env.USER);
    await page.locator('xpath=//*[@id="content"]/div/div/div/div/div[1]/div/div[3]/div/div[1]/div[2]/div/div[1]/div[1]/div[2]/input').fill(process.env.PASS);
    await page.locator('xpath=//*[@id="content"]/div/div/div/div/div[1]/div/div[3]/div/div[1]/div[2]/div/div[1]/div[1]/button[1]/div').click();
    await page.locator('xpath=//*[@id="content"]/div/div/div/div/div[1]/div/div[3]/div/div[1]/div[2]/div/div[1]/div[1]/button[2]').click();

    await page.waitForNavigation();

    let bookName;
    await rl.question(`\nSelect the book you want to copy. Enter the book name when you're done: `, fuck => {
        bookName = fuck
        rl.close();
    });

    await page.waitForNavigation();

    console.log("...")
    await timeout(5000);

    const pageInput = await page.locator(`xpath=//*[@id="content"]/div/div/div/div/div[1]/div/div[1]/div[2]/div/div/div[3]/div[1]/input`);
    await pageInput.waitFor();
    await timeout(3000);
    await pageInput.fill('C1');
    await pageInput.press('Enter');
    await timeout(3000);

    console.log(`Saving "${bookName}" pages...`);

    const pdfDoc = await PDFDocument.create()

    let state = true;
    let pageCount = 1;
    while (state) {
        await page.locator(`.canvasWrapper > canvas:nth-child(1)`).waitFor();
        //wait for 6 sec to load the canvas
        await timeout(6000);

        let img = await page.evaluate(() => {
            return {
                base64: document.getElementsByTagName('canvas')[0].toDataURL("image/png").split(';base64,')[1],
                // canvas: document.getElementsByTagName('canvas')[0]
            } 
        });

        // Write base64 data as PNG image
        fs.writeFileSync(`./imgs/${pageCount}.png`, img.base64, 'base64');
        console.log(`Page ${pageCount} saved to ./imgs/${pageCount}.png`);

        const pdfPage = await pdfDoc.addPage();
        
        // Create PDFImage object from the image data
        const image = await pdfDoc.embedPng(img.base64);

        // Draw the image on the PDF page
        await pdfPage.drawImage(image, {
            x: 0,
            y: 0,
            width: pdfPage.getWidth(),
            height: pdfPage.getHeight(),
        });
        
        try {
            await page.locator('xpath=/html/body/div/div/div/div/div/div[1]/div/div[2]/div[2]/div/div/div/div/div[1]/div/div/div/div/div[1]/div/div[3]/div[2]/div/button').click();
        } catch (error) {
            state = false;
            const pdfBytes = await pdfDoc.save()
            fs.writeFileSync(`./${bookName}.pdf`, pdfBytes);
            console.log(`All pages saved to ${bookName}.pdf`);
            await browser.close();
            await saveProgress(bookName);
        }
        
        if (pageCount % 10 === 0) {
            await page.reload();
        }

        pageCount++;
    }
}

async function saveProgress(bookName) {
    const savePath = `./save/${bookName}`;
    fs.mkdirSync(savePath, { recursive: true });

    const imgFiles = fs.readdirSync('./imgs');
    for (const imgFile of imgFiles) {
        const sourcePath = path.join('./imgs', imgFile);
        const destinationPath = path.join(savePath, imgFile);
        fs.renameSync(sourcePath, destinationPath);
    }

    console.log(`All images moved to ${savePath}`);
}

async function makePDF(bookName) {

    console.log(`Creating PDF for ${bookName}...`);

    const pdfDoc = await PDFDocument.create()

    const imgFiles = await fs.readdirSync('./imgs');
    console.log(imgFiles.length)

    for (let i = 1; i < imgFiles.length; i++) {
        const sourcePath = path.join('./imgs', `${i}.png`);
        console.log(sourcePath)

        const pdfPage = await pdfDoc.addPage();

        const uint8Array = await fs.readFileSync(sourcePath)

        // Create PDFImage object from the image data
        const image = await pdfDoc.embedPng(uint8Array);

        // Draw the image on the PDF page
        await pdfPage.drawImage(image, {
            x: 0,
            y: 0,
            width: pdfPage.getWidth(),
            height: pdfPage.getHeight(),
        });
        console.log(`Page ${i} added to PDF`);
    }

    const pdfBytes = await pdfDoc.save()
    await fs.writeFileSync(`./${bookName}.pdf`, pdfBytes);
    console.log(`All pages saved to ${bookName}.pdf`);
}



start();
// makePDF('test');
