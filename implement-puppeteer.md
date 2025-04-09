# Implementing Puppeteer on Alpine Linux (GitHub Codespace)

This document outlines the successful steps taken to configure and run Puppeteer for PDF generation within an Alpine Linux environment, specifically targeting the setup found in a GitHub Codespace for this project. The primary challenge addressed was the `spawn ENOENT` error, caused by missing system dependencies for Chromium.

---

## **Final Working Configuration**

1.  **Identify the Environment:** Confirmed the GitHub Codespace environment uses Alpine Linux via the `apk update` command.

2.  **Install System Dependencies:** Installed Chromium and its required shared libraries using Alpine's package manager (`apk`). The following command includes `chromium` itself and a comprehensive list of libraries needed for it to run, even headlessly:
    ```bash
    sudo apk add --no-cache \
      chromium \
      nss \
      freetype \
      harfbuzz \
      ttf-freefont \
      fontconfig \
      dbus-libs \
      expat \
      libstdc++ \
      libgcc \
      libx11 \
      libxext \
      libxrender \
      libxtst \
      libxrandr \
      libxfixes \
      libxi \
      libxcursor \
      libxdamage \
      libxcomposite \
      libxshmfence \
      alsa-lib \
      cups-libs \
      cairo \
      gdk-pixbuf \
      glib \
      gtk+3.0 \
      pango \
      mesa-gbm
      # Note: 'at-spi2-atk' and 'atk' were not found in standard repos and were omitted.
    ```
    *This command should be run directly on the Linux system or added to the `.devcontainer/devcontainer.json` post-create commands or a custom Dockerfile if rebuilding the Codespace environment.*

3.  **Use `puppeteer-core`:** Since Chromium is installed via the system package manager (`apk`), the project must use the `puppeteer-core` package, which does *not* bundle its own browser. This was configured in `package.json`:
    ```json
    // package.json (relevant part)
    "dependencies": {
      // ... other dependencies
      "puppeteer-core": "^24.4.0",
      // ... other dependencies
    }
    ```
    Ensure `puppeteer` (the full package) is *not* listed in `dependencies` or `devDependencies`. Run `npm install` after modifying `package.json`.

4.  **Specify Executable Path:** Code using Puppeteer must explicitly point to the system-installed Chromium executable. The standard path on Alpine after installing the `chromium` package is `/usr/bin/chromium-browser`.
    ```javascript
    // Example from ocr/route.js and test-browser.js
    const puppeteer = require('puppeteer-core');

    const executablePath = '/usr/bin/chromium-browser';
    const launchArgs = ['--no-sandbox', '--disable-setuid-sandbox']; // Necessary args

    const browser = await puppeteer.launch({
        executablePath: executablePath,
        args: launchArgs,
        headless: true
    });
    ```

5.  **Verification:** A test script (`test-browser.js`) was created and successfully executed using `node test-browser.js`, confirming the browser could be launched with this configuration.

---

## **Troubleshooting Steps Taken**

*   Initial attempts assumed a Debian/Ubuntu environment (`apt-get`), which failed.
*   Identified Alpine Linux via `apk update`.
*   Iteratively installed dependencies using `apk add`, removing packages not found in the repositories (`at-spi2-atk`, `atk`).
*   Switched between `puppeteer` and `puppeteer-core` in `package.json` and corresponding code (`ocr/route.js`, `test-browser.js`) to match the installation strategy (system-installed vs. bundled).
*   Used `test-browser.js` to isolate and confirm the Puppeteer launch mechanism.

---

This setup ensures that the PDF generation feature relies on the stable, system-managed Chromium installation within the Alpine Linux environment.
