# Active Context: Layout Refactor & Guest Flow Implementation

**Date:** April 9, 2025 (Evening Update)

**Status:** Replaced Puppeteer PDF generation with external API for reports. Fixed guest user authorization for report downloads. Resolved various layout issues on static pages and landing page. Adjusted landing page upload UI styling.

**Recent Activity (April 9 - Evening):**
- **Report Generation Refactor:**
    - Modified BoM, Compliance, and OCR/PDR API routes (`/api/projects/[projectId]/reports/...`) to remove Puppeteer dependency.
    - Implemented calls to external HTML-to-PDF API (`https://html-text-to-pdf.shothik.ai/convert`) in report routes.
    - Updated report routes to embed CSS styles within the HTML sent to the external API for professional PDF formatting.
    - Updated report routes to correctly parse the `public_url` from the external API response.
- **Guest Authorization Fix:**
    - Updated report API routes to accept `guestId` via query parameter as a fallback for the `X-Guest-ID` header.
    - Updated frontend project page (`/project/[projectId]/page.js`) report download handlers to append `guestId` query parameter when in guest mode, fixing `401` errors for guests.
- **Layout & UI Fixes:**
    - Resolved layout inconsistencies between landing page and other static pages by ensuring consistent use of a wrapping `<main>` tag with `container mx-auto`.
    - Fixed issues causing unwanted scrollbars/black bars on static pages by adjusting flexbox properties in `layout.js`.
    - Updated landing page (`/`) file upload area styling: made dashed border always visible (white color) and added background change on hover for inner area feedback.
- **Chat UI Refinements:**
    - Implemented dynamic width calculation for the chat input area in `ProjectDetailPage` (`page.js`), passing the width to `ChatInterface`. (Initial implementation + user refinement using `setInterval` for robustness and `resize` listener).
    - Implemented auto-scrolling for the chat history in `ChatInterface` (`ChatInterface.js`) on new messages.
    - Adjusted scrollbar styling in `ChatInterface` for a thinner, rounded appearance.
    - Adjusted `maxHeight` of the chat history container in `ChatInterface` for layout refinement.

**Previous Activity (April 9 - Afternoon):**
- **Layout Refactor:** Created reusable `Header` and `Sidebar` components with conditional rendering. Implemented guest user workflow basics (ID generation, storage, header). Adjusted loading spinner. Redesigned landing page structure. Created placeholder static pages.
- **Dependency Updates & Docker:** Updated major dependencies. Simplified Docker setup.

**Current Focus:**
- Verifying the fixes for report generation (both functionality and PDF styling).
- Confirming guest user report downloads work correctly.
- Testing landing page UI interactions (upload area hover/border).
- Testing chat UI functionality (dynamic width, auto-scroll, styling).

**Next Steps:**
1.  Thoroughly test report generation for authenticated and guest users.
2.  Test layout consistency across all static pages.
3.  Begin populating content for the `/solutions`, `/how-it-works`, `/use-cases`, and `/resources` pages.
4.  Replace placeholder assets (logo, icons) when available.
5.  Address any regressions from recent changes.
