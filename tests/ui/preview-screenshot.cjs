const { chromium } = require('../../src/frontend/node_modules/@playwright/test');
(async()=>{const browser=await chromium.launch({channel:'chrome'});const page=await browser.newPage({viewport:{width:1440,height:1000}});await page.goto('http://127.0.0.1:5173/?preview=conversation');await page.screenshot({path:'/tmp/beivymate-conversation-preview.png',fullPage:true});await browser.close();})();
