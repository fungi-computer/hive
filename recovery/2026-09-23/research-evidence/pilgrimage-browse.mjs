import {chromium} from 'playwright';
const browser=await chromium.launch({headless:true,executablePath:'/home/levi/.cache/ms-playwright/chromium_headless_shell-1234/chrome-headless-shell-linux64/chrome-headless-shell',args:['--no-sandbox','--enable-unsafe-swiftshader']});
const page=await browser.newPage({viewport:{width:1440,height:1000},deviceScaleFactor:1});
try {
 const response=await page.goto('https://pilgrimage-b9hznv2uj-tomjohn.vercel.app/play',{waitUntil:'domcontentloaded',timeout:30000});
 await page.waitForTimeout(12000);
 console.log('HTTP',response.status());console.log((await page.locator('body').innerText()).slice(0,5500));
 await page.screenshot({path:'.botanical/research/pilgrimage/live-latest-world.png'});
 console.log('buttons',await page.getByRole('button').allTextContents());
} finally {await browser.close();}
