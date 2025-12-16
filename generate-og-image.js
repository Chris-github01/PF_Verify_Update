/**
 * Generate OG Image from HTML template
 *
 * To generate the og-image.png:
 * 1. Open create-og-image.html in Chrome/Firefox at exactly 1200x630 viewport
 * 2. Take a full-page screenshot
 * 3. Save as public/og-image.png
 *
 * OR use an online tool like:
 * - https://html-to-image.com/
 * - https://www.screely.com/
 *
 * OR install puppeteer and run this script:
 * npm install puppeteer
 * node generate-og-image.js
 */

// Optional automated generation if puppeteer is available
async function generateOGImage() {
  try {
    const puppeteer = require('puppeteer');
    const fs = require('fs');
    const path = require('path');

    const browser = await puppeteer.launch();
    const page = await browser.newPage();

    await page.setViewport({ width: 1200, height: 630 });
    await page.goto(`file://${path.resolve(__dirname, 'create-og-image.html')}`, {
      waitUntil: 'networkidle0'
    });

    await page.screenshot({
      path: path.resolve(__dirname, 'public/og-image.png'),
      type: 'png'
    });

    await browser.close();

    console.log('✓ OG image generated successfully at public/og-image.png');
  } catch (error) {
    console.error('Could not generate image automatically:', error.message);
    console.log('\nManual generation steps:');
    console.log('1. Open create-og-image.html in a browser');
    console.log('2. Set viewport to exactly 1200x630px');
    console.log('3. Take a screenshot');
    console.log('4. Save as public/og-image.png');
  }
}

if (require.main === module) {
  generateOGImage();
}

module.exports = { generateOGImage };
