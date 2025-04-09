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
// Removed fs/promises import
import path from 'path';
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
    gemini = genAI.getGenerativeModel({ model: "gemini-2.0-flash" }); // Or a more powerful model if needed for BoM
    console.log("Gemini model initialized for BoM reports.");
  } catch (e) {
    console.error("Failed to initialize Gemini components for BoM reports:", e);
  }
} else {
  console.warn("GOOGLE_AI_STUDIO_API_KEY not set. BoM report functionality will be disabled.");
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
        console.log(`BoM API: GCS Storage client initialized using keyfile ${keyFilePath} for bucket: ${GCS_BUCKET_NAME}`);
    } catch(e) {
        console.error("BoM API: Failed to initialize GCS Storage client:", e);
    }
} else {
    console.warn("BoM API: GCS_BUCKET_NAME or GOOGLE_CLOUD_PROJECT_ID not set. GCS functionality will be disabled.");
}

// Define relaxed safety settings (might be needed for OCR)
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
function sendSseMessage(controller, data, eventName = 'message') {
  const encoder = new TextEncoder();
  if (eventName !== 'message') {
    controller.enqueue(encoder.encode(`event: ${eventName}\n`));
  }
  controller.enqueue(encoder.encode(`data: ${JSON.stringify(data)}\n\n`));
}

// GET handler for SSE connection (BoM Report)
export async function GET(request, { params }) {
  const { projectId } = params;

  if (!projectId || !mongoose.Types.ObjectId.isValid(projectId)) {
    return new Response("Invalid Project ID", { status: 400 });
  }
  if (!gemini) {
     return new Response("Backend not ready (Gemini)", { status: 503 });
  }
   if (!storage || !GCS_BUCKET_NAME) {
     return new Response("Backend not ready (GCS config missing)", { status: 503 });
  }
  // --- REMOVED Puppeteer dependency check ---

  // --- Authorization Check (Session or Guest Header) ---
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
      console.log(`BoM Report API: Guest access attempt with ID: ${effectiveGuestId} (Header: ${guestIdHeader ? 'Yes' : 'No'}, Query: ${guestIdQuery ? 'Yes' : 'No'})`);
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
             console.log(`BoM Report API: Guest ID mismatch: EffectiveID=${effectiveGuestId}, Project=${project.guestOwnerId}`);
             return new Response("Forbidden (Guest Access Denied)", { status: 403 });
        }
    } else {
         return new Response("Unauthorized", { status: 401 });
    }
    // Authorization passed

  } catch (authOrDbError) {
       console.error("BoM SSE Auth/DB Error:", authOrDbError);
       return new Response("Error processing request", { status: 500 });
  }
  // --- End Authorization Check ---


  const stream = new ReadableStream({
    async start(controller) {
      console.log(`BoM SSE stream started for project ${projectId}`);
      sendSseMessage(controller, { status: 'Initializing BoM report...' });

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
                 console.error(`BoM SSE: Failed to download GCS file ${objectPath} (${diag.fileName}):`, downloadError.message);
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
        const ocrPrompt = `Perform OCR on the following document(s): ${diagramNamesString}. Extract all text content accurately. Focus on text relevant to components, materials, dimensions, and quantities.`;
        sendSseMessage(controller, { status: 'Performing OCR...' });
        const ocrText = await callGemini(ocrPrompt, fileParts, true);
        if (!ocrText) throw new Error("OCR process returned empty text.");
        sendSseMessage(controller, { status: 'Text extraction complete.' });

        // --- Step 2: Generate BoM Report as HTML ---
        const bomPrompt = `Based on the following OCR text extracted from engineering diagrams (Project: ${project.name}), generate a detailed Bill of Materials (BoM) in **HTML format**.

**Instructions for HTML Structure:**
1.  Present the BoM primarily as an HTML table (\`<table>\`) with a clear header row (\`<thead>\` containing \`<th>\` elements) and data rows (\`<tbody>\` containing \`<tr>\` with \`<td>\` elements).
2.  Use appropriate table headers like "Item Name", "Quantity", "Dimensions", "Material", "Specifications/Notes", or similar relevant fields based on the extracted data.
3.  Include other relevant information (like project name, date, etc.) using standard HTML tags like \`<h1>\`, \`<h2>\`, \`<p>\`.
4.  Do **NOT** include any Markdown syntax (like \`**\`, \`#\`, \`-\`, \`|\`) in the final HTML output.
5.  Ensure the entire output is a single, valid HTML document body content (you don't need to include \`<html>\` or \`<head>\` tags yourself, just the content that would go inside \`<body>\`).

**Content Focus:**
*   Identify each distinct component mentioned.
*   Extract quantity, dimensions, material, and other specifications for each component.
*   Be comprehensive and accurate based *only* on the provided OCR text.

**OCR Text:**
---
${ocrText}
---

Generate the Bill of Materials report in HTML format now.`;

        sendSseMessage(controller, { status: 'Generating Bill of Materials (HTML)...' });
        let bomReportHtml = await callGemini(bomPrompt, [], false);
        if (!bomReportHtml) throw new Error("BoM generation process returned empty HTML.");

        // --- Clean up Gemini's Markdown code fences ---
        console.log("Cleaning Gemini HTML output...");
        bomReportHtml = bomReportHtml.trim();
        if (bomReportHtml.startsWith('```html')) {
            bomReportHtml = bomReportHtml.substring(7).trimStart();
        }
        if (bomReportHtml.endsWith('```')) {
            bomReportHtml = bomReportHtml.substring(0, bomReportHtml.length - 3).trimEnd();
        }
        console.log("HTML output cleaned.");
        // --- End cleanup ---

        sendSseMessage(controller, { status: 'BoM generated.' });

        // --- Step 3: Convert HTML to PDF using External API ---
        sendSseMessage(controller, { status: 'Converting HTML to PDF via API...' });
        let pdfUrl = null;
        try {
            console.log(`Calling HTML to PDF API: ${HTML_TO_PDF_API_URL}`);
            const apiResponse = await fetch(HTML_TO_PDF_API_URL, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ html: bomReportHtml }),
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
        console.log(`BoM SSE stream complete for project ${projectId}. Sent public URL: ${pdfUrl}`);

      } catch (error) {
        console.error(`BoM SSE Error for project ${projectId}:`, error);
        try {
            sendSseMessage(controller, { message: error.message || 'An internal error occurred during BoM report generation.' }, 'error');
        } catch (sseError) {
            console.error("BoM SSE Error: Failed to send error message:", sseError);
        }
      } finally {
        try {
            controller.close();
            console.log(`BoM SSE stream closed for project ${projectId}`);
        } catch (e) {
             console.error(`BoM SSE Error: Failed to close stream for project ${projectId}:`, e);
        }
      } // Closing brace for finally block
    }
  });

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive',
    },
  });
}
