# Product Context: Engineering Insights

## Problem Solved

Engineering Insights addresses the manual effort and potential inaccuracies involved in interpreting complex technical diagrams like blueprints and schematics. It aims to automate the extraction of critical engineering information, making it faster and easier for engineers to get insights, check compliance, and manage revisions.

## How It Works

The platform allows users to upload various diagram formats (PDF, images, CAD). It then uses:
1.  **Google Cloud Vision API:** For Optical Character Recognition (OCR) to extract text and identify components.
2.  **Gemini 2.0:** For natural language processing, enabling users to chat with their diagrams, ask specific questions (including predefined civil engineering queries), and generate summaries.

## Key Features & User Experience

-   **Guest Upload & Project Creation:** Users can upload **one or more** diagrams from the landing page without signing up. A temporary guest project is automatically created for the uploaded files, and the user is directed to the project dashboard. Guest data is associated with their account upon registration.
-   **Upload Engine:** Simple drag-and-drop interface for uploading diagrams.
    -   **Landing Page (Guests):** Supports **multiple file uploads** simultaneously. Displays a **multi-step progress bar** ("Creating Project", "Uploading Files [1 of N]...", "Preparing Workspace") during the process.
    -   **Project Page (Authenticated):** Supports uploading files within an existing project context.
-   **Smart Diagram Parsing:** Automatically identifies and labels components (beams, slabs, etc.) and extracts metadata.
-   **Natural Language Chat:** Users can ask questions in plain English about the diagram content (e.g., "What is the bridge ID?", "List all PSC beams"). Provides context-aware answers, streamed in real-time, or indicates if information is not present. Includes an animated zooming dot loading indicator while generating responses. A copy button is provided below each AI response to easily copy the text.
-   **BoM/BoQ Extraction:** Automatically generates Bills of Materials and Quantities with details like item type, quantity, dimensions, and material. Allows manual edits and export (CSV, PDF, JSON).
-   **Compliance Checker:** Validates diagram components against selected standards (IBC, Eurocodes, IS) and provides pass/fail reports.
-   **Diagram Comparison:** Visually highlights differences between two versions of a diagram.
-   **Project Knowledge Hub:** A searchable repository of past diagrams and insights, queryable via natural language.
-   **Project Management (Rename/Remove):** Users can rename and remove projects from the sidebar interface.
-   **Admin & Settings:** User management and integration configuration.

## Target Users

Engineers (Civil, Structural, Mechanical, Electrical), Project Managers, Compliance Officers, and anyone involved in interpreting or managing technical diagrams.
