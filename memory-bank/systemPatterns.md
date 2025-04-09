# System Patterns: Engineering Diagram Insights

## Architecture Overview

Engineering Diagram Insights employs a full-stack architecture using Next.js, leveraging server-side rendering (SSR) and API routes for backend functionality. It integrates several Google Cloud services for core features.

```mermaid
graph TD
    User[User] --> Frontend[Next.js Frontend (Vercel/GCP)]
    Frontend --> Backend[Next.js API Routes (Vercel/GCP)]
    
    subgraph Backend Services
        Backend --> Auth[Firebase Auth / NextAuth]
        Backend --> DB[MongoDB (Database)]
        Backend --> Storage[Google Cloud Storage]
        Backend --> OCR[Google Cloud Vision API]
        Backend --> AI[Gemini 2.0 API (Google AI Studio)]
    end

    Storage --> OCR
    OCR -- Parsed Text/Data --> Backend
    Backend -- Structured Data --> AI
    AI -- Response --> Backend
    Backend --> DB
    DB --> Backend
    Backend --> Frontend
```

## Key Components & Flow

1.  **Authentication & Guest Access:**
    *   **Registered Users:** Log in/sign up via NextAuth (Email/Password, potentially Google/GitHub later). Session managed by `next-auth`.
    *   **Guest Users:** No explicit login. A unique `guestId` is generated on first interaction (e.g., upload) and stored in the browser's `localStorage`. This `guestId` is sent via a custom `X-Guest-ID` header for API requests requiring temporary authorization.
2.  **File Upload:**
    *   **Guest Upload (Landing Page):** Diagrams uploaded via the root page (`/`). Frontend generates/retrieves `guestId` from `localStorage`. Backend API (`/api/projects`) creates a `Project` with `owner: null` and `guestOwnerId` set to the provided `guestId`. Backend API (`/api/upload`) saves the file to GCS, creates a `Diagram` record linked to the project, setting `uploadedBy: null` and `guestUploaderId` to the `guestOwnerId` from the project. User is redirected to `/project/[projectId]`.
    *   **Authenticated Upload (Project Page):** Diagrams uploaded within a specific project context (`/project/[projectId]/upload`). Backend APIs use the user's session ID to set `owner` and `uploadedBy`.
3.  **Storage:** The backend API stores the raw file in Google Cloud Storage (GCS) and creates a `Project`/`Diagram` record in MongoDB.
4.  **OCR Processing:** The backend triggers Google Cloud Vision API on the stored file.
5.  **Data Extraction & Storage:** Parsed text and identified components from OCR are processed by the backend and stored in a structured format in MongoDB, linked to the diagram record.
6.  **Chat Interaction:**
    *   The frontend chat UI sends user queries to the backend API route (`chat/[projectId]/route.js`).
    *   The backend API downloads the relevant diagram files directly from GCS.
    *   The file data and user query (plus history) are sent to the Gemini 2.0 API using its streaming methods (`generateContentStream`/`sendMessageStream`).
    *   The backend API returns a `ReadableStream` to the frontend.
    *   The frontend reads the stream and updates the UI incrementally.
    *   The backend saves the full conversation to the `Project` document in MongoDB after the stream completes.
    *   **Authorization:** API checks for `next-auth` session first. If none, checks for `X-Guest-ID` header and validates against `project.guestOwnerId`.
7.  **BoM/BoQ Generation:**
    *   **Authorization:** API checks for `next-auth` session first. If none, checks for `X-Guest-ID` header and validates against `project.guestOwnerId`.
    *   The backend API route downloads relevant diagrams from GCS.
    *   Uses Gemini for analysis (potentially including OCR) to generate report content in HTML format.
    *   **Cleans the generated HTML** to remove extraneous formatting (e.g., Markdown code fences) added by Gemini.
    *   **Calls external HTML-to-PDF API** (`https://html-text-to-pdf.shothik.ai/convert`) with the cleaned HTML.
    *   Receives a public PDF URL from the external API.
    *   Returns the `public_url` via Server-Sent Events (SSE).
8.  **Compliance Check:**
    *   **Authorization:** API checks for `next-auth` session first. If none, checks for `X-Guest-ID` header and validates against `project.guestOwnerId`.
    *   Similar flow to BoM generation, but uses compliance rules and specific prompts for Gemini analysis to generate an HTML report.
    *   **Cleans the generated HTML** to remove extraneous formatting (e.g., Markdown code fences) added by Gemini.
    *   **Calls external HTML-to-PDF API** (`https://html-text-to-pdf.shothik.ai/convert`) with the cleaned HTML.
    *   Receives a public PDF URL from the external API.
    *   Returns the `public_url` via Server-Sent Events (SSE).
9.  **OCR/PDR Report Generation:** (Similar flow to BoM/Compliance)
    *   **Authorization:** API checks for `next-auth` session first. If none, checks for `X-Guest-ID` header and validates against `project.guestOwnerId`.
    *   The backend API route downloads relevant diagrams from GCS.
    *   Uses Gemini for OCR and then to generate a Preliminary Design Report (PDR) in HTML format based on the OCR text.
    *   **Cleans the generated HTML** to remove extraneous formatting (e.g., Markdown code fences) added by Gemini.
    *   **Calls external HTML-to-PDF API** (`https://html-text-to-pdf.shothik.ai/convert`) with the cleaned HTML.
    *   Receives a public PDF URL from the external API.
    *   Returns the `public_url` via Server-Sent Events (SSE).
10. **User Registration & Guest Data Association:**
    *   User signs up via `/signup`. Frontend sends `guestId` (if present in `localStorage`) along with registration details to `/api/auth/register`.
    *   Backend creates the `User`. If `guestId` was provided, it finds all `Project` and `Diagram` documents matching the `guestOwnerId`/`guestUploaderId`.
    *   Updates matching documents to set the `owner`/`uploadedBy` to the new user's ID and removes the `guestOwnerId`/`guestUploaderId`.
    *   Frontend clears `guestId` from `localStorage` on successful registration.
11. **Version Comparison:** (Assumed requires login) The backend compares metadata/visuals of two diagram versions.
12. **Knowledge Hub:** (Assumed requires login) Leverages MongoDB search to query historical project data.

## Application Structure (Layout & Pages)

-   **Layout (`src/app/layout.js`):** Wraps all pages. Includes `<AuthProvider>`, `<Header>`, and `<Sidebar>`. Contains a main wrapper `div` (`flex-grow flex flex-col w-full`) holding the `Header` and the main content area (`<main>`). The `<main>` element uses `flex-grow overflow-y-auto`.
-   **Header Component (`src/components/Header.js`):** Client component. Renders conditionally based on route and auth status. Shows full nav for unauthenticated users, simplified nav + Dashboard link for authenticated users on public routes, and minimal nav (Logo, User/Logout) for authenticated users on private routes. Fetches first project ID for Dashboard link.
-   **Sidebar Component (`src/components/Sidebar.js`):** Client component. Renders project list and navigation *only* if user is authenticated AND not on a public/auth route.
-   **Public Pages:**
    1.  **`/` (Landing Page):** Main marketing page, includes Hero section with guest upload, Features, Workflow, Use Cases, FAQ. Relies on Layout for Header.
    2.  **`/solutions`:** Details on solutions offered (Placeholder). Relies on Layout for Header.
    3.  **`/how-it-works`:** Detailed explanation of the platform workflow. Relies on Layout for Header.
    4.  **`/use-cases`:** Examples for different engineering disciplines. Relies on Layout for Header.
    5.  **`/resources`:** Links to blog, docs, case studies. Relies on Layout for Header.
-   **Auth Pages:**
    6.  **`/login` / `/signup`:** Authentication forms. Header is not rendered on these pages.
-   **Private Pages (Require Auth or Guest Auth):**
    7.  **`/project/[projectId]` (Dashboard):** Main project workspace. Displays diagrams, chat interface, report generation options. Handles both authenticated and guest access (via `X-Guest-ID` header and `localStorage`). Shows guest banner if applicable. Relies on Layout for Header (simplified view) and Sidebar.
    8.  **`/project/[projectId]/upload`:** Authenticated file upload interface. Relies on Layout for Header (simplified view) and Sidebar.
-   **(Future/TBD):** Diagram Viewer, BoM Page, Compliance Page, Version Comparison Page, Knowledge Hub Interface, Admin/Settings.

## Design Considerations

-   **Scalability:** Leveraging serverless functions (Vercel/Cloud Run) and managed cloud services (GCS, MongoDB Atlas, Cloud Vision, AI Studio) aids scalability.
-   **Modularity:** Features like OCR, Chat, BoM generation, and Compliance are distinct modules interacting via the backend API layer.
-   **Data Structure:** A well-defined MongoDB schema is crucial for linking diagrams, parsed data, user context, and project information effectively.
-   **Error Handling:** Robust error handling is needed for external API calls (Vision, Gemini), file processing, GCS operations, stream handling, and PDF generation.
-   **Security:** Authentication (NextAuth) and authorization (role-based access for logged-in users, guest ID validation for temporary access) are critical.
-   **Guest Authorization:** Uses a combination of `localStorage` on the client and a custom `X-Guest-ID` HTTP header checked by backend APIs against `guestOwnerId` in the `Project` model for temporary, project-specific access. Guest data is associated with a user account upon registration.
-   **Serverless File Handling:** API routes requiring file content (chat) must download files directly from GCS during execution. Report generation relies on Gemini analysis and an external PDF conversion API.
-   **External PDF API:** PDF generation for reports (BoM, Compliance, OCR/PDR) is handled by calling the `https://html-text-to-pdf.shothik.ai/convert` API with the generated HTML. This removes the need for Puppeteer/Chromium dependencies and GCS uploads for temporary PDFs within the application.
-   **API Response Cleaning:** Responses from external APIs (like Gemini) may require cleaning/parsing to remove extraneous formatting (e.g., Markdown code fences) before further processing or display.
-   **Local Development:** A `docker-compose.yml` file is used to orchestrate the local development environment, building the `development` stage from the `Dockerfile` and mounting local source code.
