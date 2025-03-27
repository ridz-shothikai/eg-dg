# System Patterns: Shothik AI – Doclyze

## Architecture Overview

Doclyze employs a full-stack architecture using Next.js, leveraging server-side rendering (SSR) and API routes for backend functionality. It integrates several Google Cloud services for core features.

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
    *   The frontend chat UI sends user queries to the backend.
    *   The backend retrieves relevant structured data from MongoDB based on the diagram context.
    *   This data is injected into a prompt template for the Gemini 2.0 API.
    *   Gemini processes the prompt and returns an answer.
    *   The backend relays the answer to the frontend.
7.  **BoM/BoQ Generation:** The backend extracts relevant data points from the structured MongoDB records to generate Bills of Materials/Quantities.
8.  **Compliance Check:** The backend runs extracted component data against predefined rule sets (IBC, Eurocodes, IS) stored or accessed by the backend.
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
-   **Error Handling:** Robust error handling is needed for external API calls (Vision, Gemini) and file processing.
-   **Security:** Authentication and authorization (role-based access) are critical, especially for admin functions and project data access.
