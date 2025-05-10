# System Patterns: Engineering Insights

## Architecture Overview

Engineering Insights employs a full-stack architecture using Next.js, leveraging server-side rendering (SSR) and API routes for backend functionality. It integrates several Google Cloud services for core features.

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
    *   **Guest Upload (Landing Page):** User selects **one or more** diagrams via the root page (`/`). Frontend generates/retrieves `guestId` from `localStorage`. Frontend calls backend API (`/api/projects`) **once** to create a `Project` with `owner: null` and `guestOwnerId` set to the provided `guestId`. Frontend then **loops through each selected file**, calling the backend API (`/api/upload`) for **each file** individually, passing the created `projectId`. The `/api/upload` route saves the file to GCS and creates a `Diagram` record linked to the project, setting `uploadedBy: null` and `guestUploaderId` to the `guestOwnerId` from the project. After all files are processed, the user is redirected to `/project/[projectId]`. Frontend displays a multi-step progress bar during this process.
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
    *   **Project Management:** The API route also handles `PUT` requests for renaming projects and `DELETE` requests for removing projects and their associated data (diagrams and GCS files), with appropriate authorization checks.
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

## Application Structure (Layout & Pages) - Updated April 11

-   **Root Layout (`src/app/layout.js`):** Wraps all pages. Includes only `<AuthProvider>` and basic `<html>`/`<body>` structure. The main `<Header>` component is included here but handles its own visibility.
-   **Dashboard Layout (`src/app/dashboard/layout.js`):** Wraps all pages under the `/dashboard` route. Defines the persistent dashboard structure:
    -   Includes `<Sidebar>` component (fixed width, left).
    -   Includes `<DashboardHeader>` component (top bar within main area).
    -   Provides the main content area (`<main>`) for nested pages.
-   **Header Component (`src/components/Header.js`):** Client component rendered by the root layout. **Hides itself** if the current `pathname` starts with `/dashboard` or matches auth routes (`/login`, `/signup`). Shows full public navigation or login/signup buttons otherwise. Fetches first project ID for the "Dashboard" link (points to `/dashboard/project/[id]`).
-   **DashboardHeader Component (`src/components/DashboardHeader.js`):** Client component rendered by the dashboard layout. Contains dashboard-specific elements, including a user dropdown menu with profile/logout options.
-   **Sidebar Component (`src/components/Sidebar.js`):** Client component rendered by the dashboard layout. Displays project list (links point to `/dashboard/project/[id]`) and navigation. Includes logic for creating a default project if none exist (redirects to `/dashboard/project/[id]`).
-   **Public Pages (Use Root Layout + Header):**
    1.  **`/` (Landing Page):** Main marketing page, includes Hero section with guest upload (redirects to `/dashboard/project/[id]`), Features, Workflow, Use Cases, FAQ.
    2.  **`/solutions`, `/how-it-works`, `/use-cases`, `/resources`:** Placeholder static pages.
-   **Auth Pages (Use Root Layout, Header hides itself):**
    3.  **`/login` / `/signup`:** Authentication forms.
-   **Dashboard Pages (Use Dashboard Layout):**
    4.  **`/dashboard/project/[projectId]`:** Main project workspace. Displays diagrams (with serial numbers, download links, wrapped text), chat interface, report generation options. Handles guest access.
    5.  **`/dashboard/project/[projectId]/upload`:** Authenticated file upload interface.
-   **(Future/TBD):** Diagram Viewer, BoM Page, Compliance Page, Version Comparison Page, Knowledge Hub Interface, Admin/Settings (likely under `/dashboard`).

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
