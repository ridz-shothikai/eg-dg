import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth/next';
import { authOptions } from '@/app/api/auth/[...nextauth]/route';
import connectMongoDB from '@/lib/db';
import Project from '@/models/Project';
import Diagram from '@/models/Diagram';
import mongoose from 'mongoose';
import { GoogleGenerativeAI, HarmCategory, HarmBlockThreshold } from "@google/generative-ai";
import mime from 'mime-types';
// Removed pdf-lib imports
import { Storage } from '@google-cloud/storage';
import path from 'path'; // Still needed for keyfile path
import * as constants from '@/constants';
// Removed Puppeteer imports


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

// Helper function to call Gemini
async function callGemini(prompt, fileParts = [], applySafetySettings = false) {
    // ... (keep existing callGemini function as is)
    if (!gemini) throw new Error("Gemini model not initialized.");
    try {
        const parts = [{ text: prompt }];
        if (fileParts && fileParts.length > 0) {
            parts.push(...fileParts);
        }
        console.log(`Calling gemini.generateContent (Safety Settings: ${applySafetySettings ? 'Relaxed' : 'Default'})...`);
        const loggableParts = parts.map(part => part.text ? { text: '...' } : { inlineData: { mimeType: part.inlineData.mimeType, data: '...' } });
        console.log("Payload structure:", JSON.stringify([{ role: "user", parts: loggableParts }], null, 2));
        const generationConfig = {};
        const safetySettings = applySafetySettings ? relaxedSafetySettings : undefined;
        const result = await gemini.generateContent({
            contents: [{ role: "user", parts: parts }],
            generationConfig,
            safetySettings
        });
        if (!result.response) {
            console.error("Received no response object from Gemini.");
            throw new Error("Received no response from the generative model.");
        }
        const promptFeedback = result.response.promptFeedback;
        if (promptFeedback?.blockReason) {
            console.warn(`Gemini response blocked due to: ${promptFeedback.blockReason}`, promptFeedback.safetyRatings);
            throw new Error(`Content generation blocked due to: ${promptFeedback.blockReason}`);
        }
        const responseText = result.response.text();
        if (!responseText) {
            console.error("Received empty text response from Gemini without explicit block reason:", JSON.stringify(result.response, null, 2));
            throw new Error("Received an empty text response from the generative model.");
        }
        return responseText;
    } catch (error) {
        console.error("Error calling Gemini:", error);
        if (error.message.includes("400 Bad Request")) {
            const loggableParts = (fileParts || []).map(part => ({ inlineData: { mimeType: part.inlineData.mimeType, data: '...' } }));
            console.error("Parts sent on Bad Request:", JSON.stringify([{ text: prompt }, ...loggableParts], null, 2));
            throw new Error(`Gemini API Bad Request: ${error.message}. Check data format and prompt.`);
        }
        throw error;
    }
}

// --- REMOVED createPdfFromHtml function ---


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

        // --- Prepare Inline Data by Downloading Directly from GCS ---
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
                 console.error(`SSE: Failed to download GCS file ${objectPath} (${diag.fileName}):`, downloadError.message);
                 sendSseMessage(controller, { status: `Skipping ${diag.fileName} (download failed)...` });
            }
        }

        if (fileParts.length === 0) {
             throw new Error("Could not prepare any documents from GCS.");
        }
        sendSseMessage(controller, { status: `Using ${fileParts.length} downloaded files.` });
        // --- End File Preparation ---

        // --- Step 1: Perform OCR ---
        const diagramNamesString = processedDiagramNames.join(', ');
        const ocrPrompt = `Perform OCR on the following document(s): ${diagramNamesString}. Extract all text content accurately. Structure the output clearly, perhaps using markdown headings for each document if multiple are present.`;
        sendSseMessage(controller, { status: 'Performing OCR...' });
        const ocrText = await callGemini(ocrPrompt, fileParts, true);
        if (!ocrText) throw new Error("OCR process returned empty text.");
        sendSseMessage(controller, { status: 'Text extraction complete.' });

        // --- Step 2: Generate PDR Report as HTML ---
        const pdrPrompt = `Based on the following OCR text extracted from engineering diagrams (Project: ${project.name}), generate a professional Preliminary Design Report (PDR) in **HTML format**.

**Instructions for HTML Structure:**
1.  Use standard HTML tags: \`<h1>\`, \`<h2>\`, \`<h3>\` for headings, \`<p>\` for paragraphs, \`<ul>\`/\`<ol>\`/\`<li>\` for lists.
2.  **Crucially, represent any tabular data using proper HTML tables:** \`<table>\`, \`<thead>\`, \`<tbody>\`, \`<tr>\`, \`<th>\`, \`<td>\`. Ensure table headers are clearly defined in \`<thead>\` using \`<th>\`.
3.  Do **NOT** include any Markdown syntax (like \`**\`, \`#\`, \`-\`, \`|\`) in the final HTML output.
4.  Structure the report logically with clear sections (e.g., Introduction, System Overview, Key Components, Specifications, Conclusion). Use appropriate heading levels (\`<h1>\`, \`<h2>\`, etc.).
5.  Ensure the entire output is a single, valid HTML document body content (you don't need to include \`<html>\` or \`<head>\` tags yourself, just the content that would go inside \`<body>\`).

**Content Focus:**
*   Summarize key components identified in the OCR text.
*   Include dimensions, materials, and quantities if mentioned.
*   Capture any obvious design notes or specifications found.

**OCR Text:**
---
${ocrText}
---

Generate the PDR report in HTML format now.`;

        sendSseMessage(controller, { status: 'Generating report summary (HTML)...' });
        let pdrReportHtml = await callGemini(pdrPrompt, [], false);
        if (!pdrReportHtml) throw new Error("PDR generation process returned empty HTML.");

        // --- Clean up Gemini's Markdown code fences ---
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
        sendSseMessage(controller, { status: 'Converting HTML to PDF via API...' });
        let pdfUrl = null;
        try {
            console.log(`Calling HTML to PDF API: ${HTML_TO_PDF_API_URL}`);
            const apiResponse = await fetch(HTML_TO_PDF_API_URL, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ html: pdrReportHtml }), // Use pdrReportHtml here
            });

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

      } catch (error) {
        console.error(`SSE Error for project ${projectId}:`, error);
        try {
            sendSseMessage(controller, { message: error.message || 'An internal error occurred during report generation.' }, 'error');
        } catch (sseError) {
            console.error("SSE Error: Failed to send error message to client:", sseError);
        }

      } finally {
        try {
            controller.close();
            console.log(`SSE stream closed for project ${projectId}`);
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
