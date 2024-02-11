import { chromium } from 'playwright';
import './loadEnv.js';
import fs from 'fs';
import path from 'path';

async function timeout(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

async function start() {
    fs.mkdirSync("./imgs", { recursive: true });

    const browser = await chromium.launch({ headless: false });
    const page = await browser.newPage();

    await page.goto('https://mazonecec.com/application/login');

    await page.getByTestId('login_input_username').fill(process.env.USER);
    await page.getByTestId('login_input_password').fill(process.env.PASS);
    await page.getByTestId('login_check_remember_me').click();
    await page.getByTestId('login_button_connect').click();

    await page.waitForNavigation();

    let bookName = await page.locator(`xpath=//*[@id="content"]/div/div/div/div/div[1]/div/div[2]/div[2]/div/div/div/div/div/div[2]/div[2]/div/div/div/div[1]/div[2]/div/div/div/button/span`).innerText();

    await page.locator(`xpath=//*[@id="content"]/div/div/div/div/div[1]/div/div[2]/div[2]/div/div/div/div/div/div[2]/div[2]/div/div/div/div[2]/div/div[2]/div/div[1]/div[1]/div/div[1]/button`).click();

    await page.waitForNavigation();

    const pageInput = await page.locator(`xpath=//*[@id="content"]/div/div/div/div/div[1]/div/div[1]/div[2]/div/div/div[3]/div[1]/input`);
    await pageInput.fill('C1');
    await pageInput.press('Enter');

    console.log(`Saving "${bookName}" pages...`);

    let state = true;
    let pageCount = 1;
    while (state) {
        await page.locator(`.canvasWrapper > canvas:nth-child(1)`).waitFor();
        //wait for 6 sec to load the canvas
        await timeout(6000);

        let img = await page.evaluate(() => {
            return {
                base64: document.getElementsByTagName('canvas')[0].toDataURL("image/png").split(';base64,')[1],
                canvas: document.getElementsByTagName('canvas')[0]
            } 
        });

        // Write base64 data as PNG image
        fs.writeFileSync(`./imgs/${pageCount}.png`, img.base64, 'base64');
        console.log(`Page ${pageCount} saved to ./imgs/${pageCount}.png`);

        
        try {
            await page.getByTestId('next_previous_btn_right_arrow').click();
        } catch (error) {
            state = false;
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

// start();
saveProgress('test');
