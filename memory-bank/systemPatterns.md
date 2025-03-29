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

1.  **Authentication:** Users log in/sign up via Firebase Auth or NextAuth (Email/Password, Google, GitHub).
2.  **File Upload:** Diagrams (PDF, PNG, JPG, DWG, DXF) are uploaded via the Next.js frontend, sent to the backend API.
3.  **Storage:** The backend API stores the raw file in Google Cloud Storage (GCS) and creates a record in MongoDB.
4.  **OCR Processing:** The backend triggers Google Cloud Vision API on the stored file.
5.  **Data Extraction & Storage:** Parsed text and identified components from OCR are processed by the backend and stored in a structured format in MongoDB, linked to the diagram record.
6.  **Chat Interaction:**
    *   The frontend chat UI sends user queries to the backend API route (`chat/[projectId]/route.js`).
    *   The backend API downloads the relevant diagram files directly from GCS.
    *   The file data and user query (plus history) are sent to the Gemini 2.0 API using its streaming methods (`generateContentStream`/`sendMessageStream`).
    *   The backend API returns a `ReadableStream` to the frontend.
    *   The frontend reads the stream and updates the UI incrementally.
    *   The backend saves the full conversation to MongoDB after the stream completes.
7.  **BoM/BoQ Generation:**
    *   The backend API route downloads relevant diagrams from GCS.
    *   Uses Gemini for analysis (potentially including OCR) to generate report content in HTML format.
    *   **Cleans the generated HTML** to remove extraneous formatting (e.g., Markdown code fences) added by Gemini.
    *   Creates a temporary PDF from the cleaned HTML using Puppeteer.
    *   Uploads the temporary PDF to GCS.
    *   Returns a signed URL for the PDF via Server-Sent Events (SSE).
8.  **Compliance Check:**
    *   Similar flow to BoM generation, but uses compliance rules and specific prompts for Gemini analysis to generate an HTML report.
    *   **Cleans the generated HTML** to remove extraneous formatting (e.g., Markdown code fences) added by Gemini.
    *   Creates a temporary PDF from the cleaned HTML using Puppeteer.
    *   Uploads the temporary PDF to GCS.
    *   Returns a signed URL for the PDF via Server-Sent Events (SSE).
9.  **Version Comparison:** The backend compares metadata and potentially visual representations (requiring further definition) of two diagram versions stored in MongoDB/GCS.
10. **Knowledge Hub:** Leverages MongoDB's search capabilities (potentially Atlas Search for NLP queries) to query historical project data.

## Application Structure (Pages)

1.  **Login / Signup:** Authentication forms.
2.  **Dashboard:** Project listing, upload initiation, status tracking.
3.  **Upload Page:** File upload interface.
4.  **Diagram Viewer:** Displays diagrams, OCR overlays, version history access.
5.  **Chat with Diagram:** Gemini-powered chat interface with diagram context.
6.  **BoM & BoQ Page:** Tabular display of extracted materials/quantities, editing, export.
7.  **Compliance Checker:** Displays compliance results against selected standards.
8.  **Version Comparison:** Side-by-side view of diagram differences.
9.  **Knowledge Hub:** Search interface for historical data.
10. **Admin & Settings:** User/role management, API configurations.

## Design Considerations

-   **Scalability:** Leveraging serverless functions (Vercel/Cloud Run) and managed cloud services (GCS, MongoDB Atlas, Cloud Vision, AI Studio) aids scalability.
-   **Modularity:** Features like OCR, Chat, BoM generation, and Compliance are distinct modules interacting via the backend API layer.
-   **Data Structure:** A well-defined MongoDB schema is crucial for linking diagrams, parsed data, user context, and project information effectively.
-   **Error Handling:** Robust error handling is needed for external API calls (Vision, Gemini), file processing, GCS operations, stream handling, and PDF generation.
-   **Security:** Authentication and authorization (role-based access) are critical, especially for admin functions and project data access.
-   **Serverless File Handling:** API routes requiring file content (reports, chat) must download files directly from GCS during execution due to the ephemeral nature of the `/tmp` directory in Vercel's serverless environment. Relying on a separate sync process to populate `/tmp` is unreliable.
-   **Environment-Specific Configuration:** PDF generation using Puppeteer requires different configurations (executable path, launch arguments) for local development versus serverless deployment (Vercel) to ensure stability and compatibility. Conditional logic based on `process.env.VERCEL` is used.
-   **API Response Cleaning:** Responses from external APIs (like Gemini) may require cleaning/parsing to remove extraneous formatting (e.g., Markdown code fences) before further processing or display.
