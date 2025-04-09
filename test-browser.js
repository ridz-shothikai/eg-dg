const puppeteer = require('puppeteer-core'); // Use puppeteer-core

(async () => {
  console.log('Starting Puppeteer test...');

  // Use system-installed Chromium on Alpine
  const executablePath = '/usr/bin/chromium-browser';
  const launchArgs = ['--no-sandbox', '--disable-setuid-sandbox'];

  console.log(`Using system Chromium executable path: ${executablePath}`);
  console.log(`Using launch args: ${JSON.stringify(launchArgs)}`);

  let browser = null;
  try {
    console.log('Launching browser...');
    browser = await puppeteer.launch({
      executablePath: executablePath, // Specify path
      args: launchArgs,
      headless: true,
    });

    console.log('Browser launched successfully!');

    const version = await browser.version();
    console.log(`Browser version: ${version}`);

    // Optional: Test navigation
    // console.log('Opening new page...');
    // const page = await browser.newPage();
    // console.log('Navigating to example.com...');
    // await page.goto('https://example.com', { waitUntil: 'networkidle0' });
    // console.log(`Page title: ${await page.title()}`);
    // await page.close();
    // console.log('Page closed.');

  } catch (error) {
    console.error('Error during Puppeteer test:', error);
    process.exitCode = 1; // Indicate failure
  } finally {
    if (browser) {
      console.log('Closing browser...');
      await browser.close();
      console.log('Browser closed.');
    }
    console.log('Puppeteer test finished.');
  }
})();
