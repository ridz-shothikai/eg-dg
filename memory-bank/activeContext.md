# Active Context: Report Generation Fixes (Puppeteer & Gemini Cleanup)

**Date:** March 29, 2025

**Status:** Resolved issues related to PDF report generation using Puppeteer in different environments (local vs. Vercel) and cleaned up Gemini's HTML output. Addressed Next.js API route parameter handling error.

**Recent Activity:**
- **Puppeteer Environment Compatibility:**
    - Implemented conditional logic in report generation routes (`ocr`, `bom`, `compliance`) to determine Puppeteer's `executablePath`:
        - Uses `puppeteer.executablePath()` (from the full `puppeteer` package) for local development.
        - Uses `chromium.executablePath()` (from `@sparticuz/chromium`) for Vercel deployments.
    - Implemented conditional Puppeteer launch arguments (`args`):
        - Uses a minimal set (`--no-sandbox`, `--disable-setuid-sandbox`) for local development to prevent "Target closed" errors.
        - Uses `chromium.args` for Vercel deployments.
- **Next.js API Route Fix (`sync-files`):**
    - Addressed the "params should be awaited" error by adding `await request.text()` at the start of the `POST` handler as a workaround to ensure context resolution. Reverted to standard `(request, { params })` signature.
- **Gemini HTML Output Cleanup:**
    - Added logic in report generation routes (`ocr`, `bom`, `compliance`) to automatically remove leading ` ```html ` and trailing ` ``` ` Markdown code fences from the HTML content received from Gemini before PDF generation.

**Previous Activity (March 28):**
- **Vercel Deployment Fixes:** Addressed `/tmp` directory usage and switched report/chat routes to download files directly from GCS.
- **Chat Streaming Implementation:** Implemented streaming responses from Gemini in the chat interface.
- **UI Refinements (Chat):** Updated loading indicator and added copy button.

**Current Focus:**
- Verifying the stability and correctness of PDF report generation (OCR, BoM, Compliance) locally and potentially on Vercel after recent fixes.
- Ensuring the `sync-files` route operates correctly without the "params" error.

**Next Steps:**
1.  Thoroughly test report generation (OCR, BoM, Compliance) locally to confirm Puppeteer and cleanup fixes.
2.  Test report generation on a Vercel deployment if possible.
3.  Test file syncing functionality to ensure the `sync-files` route fix is effective.
4.  Address any remaining UI inconsistencies or bugs.
5.  Refine PDF formatting/styling in the report generation API routes.
6.  Continue with Phase 7 tasks (Testing, CI/CD, etc.) once current features are stable.
