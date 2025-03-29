# Tech Context: Engineering Diagram Insights

## Core Technologies

| Component        | Technology                      | Notes                                                                                                |
| :--------------- | :------------------------------ | :--------------------------------------------------------------------------------------------------- |
| Frontend/Backend | Next.js (Fullstack)             | Using App Router, API Routes for backend logic.                                                      |
| Database         | MongoDB                         | Likely hosted on MongoDB Atlas for scalability.                                                      |
| Storage          | Google Cloud Storage (GCS)      | For storing uploaded diagram files.                                                                  |
| OCR              | Google Cloud Vision API         | For text extraction from diagrams. (Note: Gemini also used for OCR in reports).                      |
| AI Model         | Gemini 2.0 via Google AI Studio | For natural language chat, report generation (BoM, Compliance, PDR), and potentially other analysis. |
| Authentication   | Firebase Auth / NextAuth        | Provides options for email/pass & social logins (Google, GitHub).                                    |
| PDF Generation   | Puppeteer / Chromium            | Uses `puppeteer` (local dev), `puppeteer-core`, and `@sparticuz/chromium` (Vercel) for PDF reports. |
| Hosting          | Vercel / GCP Cloud Run          | Vercel is ideal for Next.js; Cloud Run as an alternative.                                            |

## Development Environment & Tooling

-   **Language:** JavaScript (as inferred from Next.js setup files like `.js`, `.mjs`)
-   **Package Manager:** npm (inferred from `package-lock.json`)
-   **Linting/Formatting:** ESLint (inferred from `eslint.config.mjs`), likely Prettier (standard with Next.js)
-   **CSS:** Tailwind CSS (inferred from `postcss.config.mjs` and `globals.css`), PostCSS
-   **Version Control:** Git (assumed standard practice)
-   **Dev Dependencies:** Includes `puppeteer` for local PDF generation testing.

## Key Integrations

-   **Google Cloud Platform (GCP):** Vision API, Cloud Storage, potentially Cloud Run. Requires GCP project setup and API keys.
-   **Google AI Studio:** Access to Gemini 2.0 model. Requires API key.
-   **Firebase:** For Authentication. Requires Firebase project setup.
-   **NextAuth:** Alternative/complementary auth library.
-   **Puppeteer Ecosystem:** `@sparticuz/chromium` for Vercel compatibility.
-   **(Future):** AutoCAD, Google Drive, Jira APIs for potential integrations mentioned in goals.

## Color Palette & Theme

**Primary Colors:**

-   Black: `#000000`
-   Very Dark Purple: `#110927`
-   Deep Midnight Blue: `#100926`
-   Dark Indigo: `#13092d`
-   Dark Violet: `#130830`

**Shades & Accents:**

-   Near Black: `#010101`
-   Very Dark Blue: `#0c071a`
-   Almost Black: `#020104`
-   Deep Purple: `#12082c`

**Theme Usage:**

-   **Backgrounds:** Use `#0c071a`, `#100926`, or `#110927`
-   **Primary Text:** Use white or light gray over dark backgrounds
-   **Buttons/Accents:** Use `#130830` and `#12082c` with hover transitions
-   **Borders/Shadows:** Use `#020104` or `#010101` for subtle outlines
