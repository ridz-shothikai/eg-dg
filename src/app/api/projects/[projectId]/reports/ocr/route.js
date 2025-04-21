import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth/next';
import { authOptions } from '@/app/api/auth/[...nextauth]/route';
import connectMongoDB from '@/lib/db';
import Project from '@/models/Project';
import Diagram from '@/models/Diagram';
import mongoose from 'mongoose';
import { GoogleGenerativeAI, HarmCategory, HarmBlockThreshold } from "@google/generative-ai";
import mime from 'mime-types';
import { Storage } from '@google-cloud/storage';
import path from 'path'; // Still needed for keyfile path
import * as constants from '@/constants';
import { generateContentWithRetry } from '@/lib/geminiUtils'; // Import the retry helper
import { fetchWithRetry } from '@/lib/fetchUtils'; // Import fetch retry helper for PDF API


const { GOOGLE_AI_STUDIO_API_KEY, GCS_BUCKET_NAME, GOOGLE_CLOUD_PROJECT_ID } = constants;
// Define the new API endpoint
const HTML_TO_PDF_API_URL = 'https://html-text-to-pdf.shothik.ai/convert';

// --- Initialize Gemini Model ---
let gemini = null;
if (GOOGLE_AI_STUDIO_API_KEY) {
  try {
    const genAI = new GoogleGenerativeAI(GOOGLE_AI_STUDIO_API_KEY);
    gemini = genAI.getGenerativeModel({ model: "gemini-2.0-flash" });
    console.log("Gemini model initialized for OCR/PDR reports.");
  } catch (e) {
    console.error("Failed to initialize Gemini components for OCR/PDR reports:", e);
  }
} else {
  console.warn("GOOGLE_AI_STUDIO_API_KEY not set. Report functionality will be disabled.");
}

// --- Initialize GCS Storage ---
let storage = null;
if (GOOGLE_CLOUD_PROJECT_ID && GCS_BUCKET_NAME) {
    try {
        const keyFilePath = path.join(process.cwd(), 'sa.json');
        storage = new Storage({
             projectId: GOOGLE_CLOUD_PROJECT_ID,
             keyFilename: keyFilePath
        });
        console.log(`GCS Storage client initialized using keyfile ${keyFilePath} for bucket: ${GCS_BUCKET_NAME}`);
    } catch(e) {
        console.error("Failed to initialize GCS Storage client:", e);
    }
} else {
    console.warn("GCS_BUCKET_NAME or GOOGLE_CLOUD_PROJECT_ID not set. GCS download functionality will be disabled.");
}

// Define relaxed safety settings
const relaxedSafetySettings = [
  { category: HarmCategory.HARM_CATEGORY_HARASSMENT, threshold: HarmBlockThreshold.BLOCK_ONLY_HIGH },
  { category: HarmCategory.HARM_CATEGORY_HATE_SPEECH, threshold: HarmBlockThreshold.BLOCK_ONLY_HIGH },
  { category: HarmCategory.HARM_CATEGORY_SEXUALLY_EXPLICIT, threshold: HarmBlockThreshold.BLOCK_ONLY_HIGH },
  { category: HarmCategory.HARM_CATEGORY_DANGEROUS_CONTENT, threshold: HarmBlockThreshold.BLOCK_ONLY_HIGH },
];

// --- REMOVED local callGemini helper function ---


// Function to send SSE messages
function sendSseMessage(controller, data, event = 'message') {
  const encoder = new TextEncoder();
  if (event !== 'message') {
    controller.enqueue(encoder.encode(`event: ${event}\n`));
  }
  controller.enqueue(encoder.encode(`data: ${JSON.stringify(data)}\n\n`));
}

// GET handler for SSE connection
export async function GET(request, { params }) {
  // Attempt to fix "params should be awaited" warning/error
  const awaitedParams = await params;
  const { projectId } = awaitedParams;

  // --- Basic Validation ---
  if (!projectId || !mongoose.Types.ObjectId.isValid(projectId)) {
    return new Response("Invalid Project ID", { status: 400 });
  }
  if (!gemini) {
     return new Response("Backend not ready (Gemini)", { status: 503 });
  }
   if (!storage || !GCS_BUCKET_NAME) {
     return new Response("Backend not ready (GCS)", { status: 503 });
  }
  // Removed check for chromium/puppeteer-core

  // --- Auth Check (Session or Guest Header) ---
  let userId = null;
  let isGuest = false;
  let guestIdHeader = null;
  let project = null;

  try {
    const session = await getServerSession(authOptions);
    guestIdHeader = request.headers.get('X-Guest-ID');
    // --- NEW: Check for guestId query parameter ---
    const url = new URL(request.url);
    const guestIdQuery = url.searchParams.get('guestId');
    // --- END NEW ---

    if (session && session.user && session.user.id) {
      userId = session.user.id;
    // --- UPDATED: Check header OR query parameter ---
    } else if (guestIdHeader || guestIdQuery) {
      // Prioritize header, fallback to query parameter
      const effectiveGuestId = guestIdHeader || guestIdQuery;
      isGuest = true;
      console.log(`OCR Report API: Guest access attempt with ID: ${effectiveGuestId} (Header: ${guestIdHeader ? 'Yes' : 'No'}, Query: ${guestIdQuery ? 'Yes' : 'No'})`);
    } else if (guestIdHeader) {
    } else {
      // Unauthorized if no session AND no guest ID (header or query)
      return new Response("Unauthorized", { status: 401 });
    }

    await connectMongoDB();
    project = await Project.findById(projectId);

    if (!project) {
        return new Response("Project not found", { status: 404 });
    }

    // Verify ownership or guest access
    if (userId) {
        if (!project.owner || project.owner.toString() !== userId) {
             return new Response("Forbidden", { status: 403 });
        }
    } else if (isGuest) {
        // Use the effective guest ID (header or query) for comparison
        const effectiveGuestId = guestIdHeader || guestIdQuery;
        if (!project.guestOwnerId || project.guestOwnerId !== effectiveGuestId) {
             console.log(`OCR Report API: Guest ID mismatch: EffectiveID=${effectiveGuestId}, Project=${project.guestOwnerId}`);
             return new Response("Forbidden (Guest Access Denied)", { status: 403 });
        }
    } else {
         return new Response("Unauthorized", { status: 401 });
    }
    // Authorization passed

  } catch (authOrDbError) {
       console.error("OCR SSE Auth/DB Error:", authOrDbError);
       return new Response("Error processing request", { status: 500 });
  }
  // --- End Authorization Check ---


  // --- Create SSE Stream ---
  const stream = new ReadableStream({
    async start(controller) {
      console.log(`SSE stream started for project ${projectId}`);
      sendSseMessage(controller, { status: 'Initializing report generation...' });

      try {
        if (!project) {
             throw new Error('Project data unavailable after authorization.');
        }

        sendSseMessage(controller, { status: 'Fetching diagram list...' });
        const diagrams = await Diagram.find({
            project: projectId,
            storagePath: { $exists: true, $ne: null, $ne: '' }
        }).select('fileName storagePath');

        if (diagrams.length === 0) {
            throw new Error("No documents with storage paths found.");
        }

        // --- Prepare Inline Data by Downloading Directly from GCS (Fail Fast) ---
        sendSseMessage(controller, { status: `Preparing ${diagrams.length} files from GCS...` });
        const fileParts = [];
        const processedDiagramNames = [];

        for (const diag of diagrams) {
            const gcsPrefix = `gs://${GCS_BUCKET_NAME}/`;
            const objectPath = diag.storagePath.startsWith(gcsPrefix) ? diag.storagePath.substring(gcsPrefix.length) : diag.storagePath;

            try {
                sendSseMessage(controller, { status: `Downloading ${diag.fileName} from GCS...` });
                const [fileBuffer] = await storage.bucket(GCS_BUCKET_NAME).file(objectPath).download();
                const base64Data = fileBuffer.toString('base64');
                fileParts.push({ inlineData: { mimeType: mime.lookup(diag.fileName) || 'application/octet-stream', data: base64Data } });
                processedDiagramNames.push(diag.fileName);
                sendSseMessage(controller, { status: `Prepared ${diag.fileName}.` });
            } catch (downloadError) {
                 console.error(`OCR/PDR SSE: FATAL ERROR downloading GCS file ${objectPath} (${diag.fileName}):`, downloadError.message);
                 // Fail Fast: Send error via SSE and throw to stop execution
                 const userMessage = `Failed to load required file '${diag.fileName}'. Please ensure all project files are accessible and try again.`;
                 sendSseMessage(controller, { message: userMessage }, 'error');
                 throw new Error(userMessage); // Stop the stream processing
            }
        }

        // Check if *any* files were processed (redundant with fail-fast, but safe)
        if (fileParts.length !== diagrams.length) {
             const errMsg = `Mismatch in prepared files. Expected ${diagrams.length}, got ${fileParts.length}.`;
             console.error("OCR/PDR SSE:", errMsg);
             sendSseMessage(controller, { message: "An inconsistency occurred while preparing documents." }, 'error');
             throw new Error(errMsg);
        }
        sendSseMessage(controller, { status: `Using ${fileParts.length} downloaded files.` });
        // --- End File Preparation ---

        // Declare variables needed across steps
        let ocrText = '';
        let pdrReportHtml = '';

        // --- Combined Try Block for Gemini Calls ---
        try {
            // --- Step 1: Perform OCR ---
            const diagramNamesString = processedDiagramNames.join(', ');
            const ocrPrompt = `Perform OCR on the following document(s): ${diagramNamesString}. Extract all text content accurately. Structure the output clearly, perhaps using markdown headings for each document if multiple are present.`;
            sendSseMessage(controller, { status: 'Analyzing key Information...' });

            // Use generateContentWithRetry for OCR
            const ocrResult = await generateContentWithRetry(
                gemini,
                {
                    contents: [{ role: "user", parts: [{ text: ocrPrompt }, ...fileParts] }],
                    safetySettings: relaxedSafetySettings // Apply safety settings for OCR
                },
                3, // maxRetries
                (attempt, max) => sendSseMessage(controller, { status: `Retrying text extraction (${attempt}/${max})...` }) // onRetry callback
            );
            ocrText = ocrResult.response.text(); // Get text from result

            if (!ocrText) throw new Error("OCR process returned empty text after retries."); // Updated error message
            sendSseMessage(controller, { status: 'Text extraction complete.' });

            // --- Step 2: Generate PDR Report as HTML ---
            // Updated Prompt: Instruct AI to use both OCR text and original files
            const pdrPrompt = `Based on the following OCR text extracted from the provided engineering diagram files (Project: ${project.name}), and considering the content of the files themselves, generate a professional Preliminary Design Report (PDR) in **HTML format**.

**Instructions for HTML Structure:**
1.  Use standard HTML tags: \`<h1>\`, \`<h2>\`, \`<h3>\` for headings, \`<p>\` for paragraphs, \`<ul>\`/\`<ol>\`/\`<li>\` for lists.
2.  **Crucially, represent any tabular data using proper HTML tables:** \`<table>\`, \`<thead>\`, \`<tbody>\`, \`<tr>\`, \`<th>\`, \`<td>\`. Ensure table headers are clearly defined in \`<thead>\` using \`<th>\`.
3.  Do **NOT** include any Markdown syntax (like \`**\`, \`#\`, \`-\`, \`|\`) in the final HTML output.
4.  Structure the report logically with clear sections (e.g., Introduction, System Overview, Key Components, Specifications, Conclusion). Use appropriate heading levels (\`<h1>\`, \`<h2>\`, etc.).
5.  Ensure the entire output is a single, valid HTML document body content (you don't need to include \`<html>\` or \`<head>\` tags yourself, just the content that would go inside \`<body>\`).

**Content Focus:**
*   Summarize key components identified in the OCR text and visible in the diagrams.
*   Include dimensions, materials, and quantities if mentioned, cross-referencing OCR text and diagrams.
*   Capture any obvious design notes or specifications found in either source.
*   Provide a coherent overview based on *all* provided information (OCR text and diagram files).

**Provided Diagram Files:**
(Content of files is provided separately in the request parts)

**Extracted OCR Text:**
---
${ocrText}
---

Generate the PDR report in HTML format now, using both the OCR text and the provided diagram files for context.`;

            sendSseMessage(controller, { status: 'Generating report summary ...' });

            // Use generateContentWithRetry for PDR generation
            const pdrResult = await generateContentWithRetry(
                gemini,
                {
                    contents: [{ role: "user", parts: [{ text: pdrPrompt }, ...fileParts] }]
                    // No special safety settings needed here by default
                },
                3, // maxRetries
                (attempt, max) => sendSseMessage(controller, { status: `Retrying report generation (${attempt}/${max})...` }) // onRetry callback
            );
            pdrReportHtml = pdrResult.response.text(); // Get text from result

            if (!pdrReportHtml) throw new Error("PDR generation process returned empty HTML after retries."); // Updated error message
            sendSseMessage(controller, { status: 'Report summary generated.' });

        } catch (geminiError) { // Catch errors from either OCR or PDR generation
            console.error("OCR/PDR SSE: Error during Gemini processing (OCR or PDR):", geminiError);
            let userFriendlyError = "An unexpected error occurred during report generation. Please try again.";
            // Determine if it was OCR or PDR step if possible
            if (geminiError.message && geminiError.message.includes("SAFETY")) {
                userFriendlyError = "Report generation could not be completed due to content safety guidelines.";
            } else if (geminiError.message && (geminiError.message.includes("Invalid content") || geminiError.message.includes("unsupported format"))) {
                userFriendlyError = "There was an issue processing one or more files for the report. Please check the file formats.";
            } else if (geminiError.message && geminiError.message.includes("RESOURCE_EXHAUSTED")) {
                userFriendlyError = "The analysis service is busy. Please try again shortly.";
            } else if (geminiError.message === "OCR process returned empty text.") {
                 userFriendlyError = "Failed to extract text from the documents (OCR). Please check the files.";
            } else if (geminiError.message === "PDR generation process returned empty HTML.") {
                 userFriendlyError = "Failed to generate the report summary based on the extracted text.";
            }
            sendSseMessage(controller, { message: userFriendlyError }, 'error');
            throw geminiError; // Re-throw to be caught by the main try...catch...finally
        }

        // --- Clean up Gemini's Markdown code fences (applied to pdrReportHtml) ---
        console.log("Cleaning Gemini HTML output...");
        pdrReportHtml = pdrReportHtml.trim();
        if (pdrReportHtml.startsWith('```html')) {
            pdrReportHtml = pdrReportHtml.substring(7).trimStart();
        }
        if (pdrReportHtml.endsWith('```')) {
            pdrReportHtml = pdrReportHtml.substring(0, pdrReportHtml.length - 3).trimEnd();
        }
        console.log("HTML output cleaned.");
        // --- End cleanup ---

        sendSseMessage(controller, { status: 'Report summary generated.' });

        // --- Step 3: Convert HTML to PDF using External API ---
        sendSseMessage(controller, { status: 'Applying styles and Preparing PDF...' }); // Updated status message

        // --- Define CSS Styles for PDF ---
        const pdfStyles = `
          body {
            font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
            line-height: 1.6;
            padding: 40px; /* Add padding for margins */
            color: #333;
            background-color: #ffffff; /* Ensure white background */
          }
          h1, h2, h3 {
            margin-bottom: 0.75em;
            margin-top: 1.5em;
            color: #110927; /* Dark purple heading */
            font-weight: 600;
            page-break-after: avoid;
          }
          h1 {
            font-size: 24px;
            text-align: center;
            border-bottom: 2px solid #130830; /* Darker purple border */
            padding-bottom: 10px;
            margin-bottom: 30px;
          }
          h2 {
            font-size: 20px;
            border-bottom: 1px solid #eee;
            padding-bottom: 5px;
            margin-bottom: 20px;
          }
          h3 {
            font-size: 16px;
            margin-bottom: 10px;
          }
          p {
            margin-bottom: 1em;
          }
          ul, ol {
            margin-left: 20px;
            margin-bottom: 1em;
          }
          li {
            margin-bottom: 0.5em;
          }
          table {
            width: 100%;
            border-collapse: collapse;
            margin-top: 1.5em;
            margin-bottom: 1.5em;
            box-shadow: 0 2px 4px rgba(0,0,0,0.05);
            page-break-inside: avoid;
          }
          th, td {
            border: 1px solid #ddd;
            padding: 10px 12px;
            text-align: left;
            vertical-align: top;
            font-size: 14px; /* Slightly smaller table font */
          }
          th {
            background-color: #f2f2f2; /* Lighter grey header */
            font-weight: bold;
            color: #100926; /* Dark purple text */
          }
          tbody tr:nth-child(even) {
            background-color: #f9f9f9; /* Subtle row striping */
          }
          pre { /* Style for code blocks if any */
            background-color: #f5f5f5;
            padding: 10px;
            border: 1px solid #eee;
            border-radius: 4px;
            overflow-x: auto;
            font-family: 'Courier New', Courier, monospace;
          }
          /* Add more styles as needed */
        `;

        // --- Wrap HTML with Styles ---
        const fullHtml = `
          <!DOCTYPE html>
          <html lang="en">
          <head>
              <meta charset="UTF-8">
              <title>Preliminary Design Report</title>
              <style>${pdfStyles}</style>
          </head>
          <body>
              ${pdrReportHtml}
          </body>
          </html>
        `;

        let pdfUrl = null;
        try {
            console.log(`Calling HTML to PDF API: ${HTML_TO_PDF_API_URL}`);
            // Use fetchWithRetry for PDF API call
            const apiResponse = await fetchWithRetry(
                HTML_TO_PDF_API_URL,
                {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ html: fullHtml }), // Send the full styled HTML
                },
                3, // maxRetries
                (attempt, max) => sendSseMessage(controller, { status: `Retrying PDF conversion (${attempt}/${max})...` }) // onRetry callback
            );

            // Reset status after retries finish (success or fail)
            sendSseMessage(controller, { status: 'Applying styles and Preparing PDF...' });

            if (!apiResponse.ok) {
                const errorBody = await apiResponse.text();
                console.error(`HTML to PDF API Error (${apiResponse.status}): ${errorBody}`);
                throw new Error(`HTML to PDF conversion failed with status ${apiResponse.status}.`);
            }

            const result = await apiResponse.json();
            // --- UPDATED: Check for public_url instead of pdf_url ---
            if (!result.public_url) { // Assuming success is implicit if public_url exists
                 console.error("HTML to PDF API did not return public_url:", result);
                 throw new Error("HTML to PDF conversion API call succeeded but response format was invalid (missing public_url).");
            }
            pdfUrl = result.public_url; // Use public_url
            console.log("HTML to PDF API conversion successful. PDF URL:", pdfUrl);
            sendSseMessage(controller, { status: 'PDF conversion complete.' });

        } catch (apiError) {
             console.error("Error calling HTML to PDF API:", apiError);
             throw new Error(`Failed to convert HTML to PDF: ${apiError.message}`);
        }
        // --- End API Call ---

        // --- Step 4: Send Completion Event with Public URL ---
        sendSseMessage(controller, { public_url: pdfUrl }, 'complete'); // Use public_url as requested
        console.log(`OCR/PDR SSE stream complete for project ${projectId}. Sent public URL: ${pdfUrl}`);

      } catch (error) { // Main catch block for the stream start
        console.error(`OCR/PDR SSE Error for project ${projectId}:`, error);
        // Use the user-friendly message if it was generated by our specific handlers, otherwise use a generic one
        const finalErrorMessage = error.message.startsWith('Failed to load required file') || error.message.includes('analysis service') || error.message.includes('content safety') || error.message.includes('processing one or more files')
            ? error.message
            : 'An internal error occurred during report generation.';
        try {
            sendSseMessage(controller, { message: finalErrorMessage }, 'error');
        } catch (sseError) {
            console.error("OCR/PDR SSE Error: Failed to send error message to client:", sseError);
        }

      } finally {
        try {
            controller.close();
            console.log(`OCR/PDR SSE stream closed for project ${projectId}`);
        } catch (e) {
             console.error(`SSE Error: Failed to close stream for project ${projectId}:`, e);
        }
      }
    }
  });

  // Return the stream response
  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive',
    },
  });
}