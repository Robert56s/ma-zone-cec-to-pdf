import { chromium, } from 'playwright';
import './loadEnv.js';
import fs from 'fs';

async function timeout(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

async function start() {
    fs.mkdirSync("./output/imgs", { recursive: true });

    const browser = await chromium.launch({ headless: false });
    const page = await browser.newPage();

    await page.goto('https://mazonecec.com/application/login');

    await page.getByTestId('login_input_username').fill(process.env.USER);
    await page.getByTestId('login_input_password').fill(process.env.PASS);
    await page.getByTestId('login_check_remember_me').click();
    await page.getByTestId('login_button_connect').click();

    await page.waitForNavigation();

    await page.getByTestId('bookshelf_component_2666').click();

    await page.waitForNavigation();

    let state = true;
    let pageCount = 1;
    while (state) {
        await page.locator(`.canvasWrapper > canvas:nth-child(1)`).waitFor();
        //wait for 3 sec to load the canvas
        await timeout(3000);

        let img = await page.evaluate(() => {
            return {
                base64: document.getElementsByTagName('canvas')[0].toDataURL("image/png").split(';base64,')[1],
                pdf: document.getElementsByTagName('canvas')[0].toDataURL("application/pdf")
            } 
        });

        await page.pdf({ path: `./output/livre_${pageCount}.pdf`, format: 'A4' });
        console.log(`PDF saved successfully: ./output/livre_${pageCount}.pdf`);

        try {
            await page.getByTestId('next_previous_btn_right_arrow').click();
        } catch (error) {
            state = false;
        }

        pageCount++;
    }
}

start();
