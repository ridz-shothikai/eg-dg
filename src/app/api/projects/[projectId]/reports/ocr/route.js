import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth/next';
import { authOptions } from '@/app/api/auth/[...nextauth]/route';
import connectMongoDB from '@/lib/db';
import Project from '@/models/Project';
import Diagram from '@/models/Diagram';
import mongoose from 'mongoose';
import { GoogleGenerativeAI, HarmCategory, HarmBlockThreshold } from "@google/generative-ai";
import mime from 'mime-types';
import { PDFDocument, StandardFonts, rgb } from 'pdf-lib';
import { Storage } from '@google-cloud/storage';
import fs from 'fs/promises';
import path from 'path';
import os from 'os'; // Still needed for temp file path
import * as constants from '@/constants';

const { GOOGLE_AI_STUDIO_API_KEY, GCS_BUCKET_NAME, GOOGLE_CLOUD_PROJECT_ID } = constants;

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

// Helper function to create PDF (remains the same)
async function createPdf(text) {
    // ... (keep existing createPdf function as is)
    const pdfDoc = await PDFDocument.create();
    const timesRomanFont = await pdfDoc.embedFont(StandardFonts.TimesRoman);
    let page = pdfDoc.addPage();
    const { width, height } = page.getSize();
    const fontSize = 11;
    const margin = 50;
    const textWidth = width - 2 * margin;
    const lineHeight = fontSize * 1.2;
    let y = height - margin - fontSize;
    const paragraphs = (text || '').split('\n');
    for (const paragraph of paragraphs) {
        if (paragraph.trim() === '') {
            if (y < margin + lineHeight) { page = pdfDoc.addPage(); y = height - margin - fontSize; }
            y -= lineHeight; continue;
        }
        const words = paragraph.split(/(\s+)/);
        let currentLine = '';
        for (const word of words) {
            if (!word) continue;
            const testLine = currentLine + word;
            let testLineWidth = 0;
            try { testLineWidth = timesRomanFont.widthOfTextAtSize(testLine, fontSize); }
            catch (e) { console.warn(`PDF: Skipping word "${word}" due to width error: ${e.message}`); continue; }
            if (testLineWidth < textWidth) { currentLine = testLine; }
            else {
                if (y < margin + lineHeight) { page = pdfDoc.addPage(); y = height - margin - fontSize; }
                try { page.drawText(currentLine.trimEnd(), { x: margin, y: y, size: fontSize, font: timesRomanFont, color: rgb(0, 0, 0), lineHeight: lineHeight }); y -= lineHeight; }
                catch (e) { console.warn(`PDF: Skipping line "${currentLine}" due to draw error: ${e.message}`); }
                currentLine = word.trimStart();
            }
        }
        if (currentLine.trim()) {
            if (y < margin + lineHeight) { page = pdfDoc.addPage(); y = height - margin - fontSize; }
            try { page.drawText(currentLine.trimEnd(), { x: margin, y: y, size: fontSize, font: timesRomanFont, color: rgb(0, 0, 0), lineHeight: lineHeight }); y -= lineHeight; }
            catch (e) { console.warn(`PDF: Skipping final line "${currentLine}" due to draw error: ${e.message}`); }
        }
    }
    const pdfBytes = await pdfDoc.save();
    return pdfBytes;
}

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
  const { projectId } = params;

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

  // --- Auth Check ---
  let session;
  try {
      session = await getServerSession(authOptions);
      if (!session || !session.user || !session.user.id) {
          return new Response("Unauthorized", { status: 401 });
      }
  } catch (authError) {
       console.error("SSE Auth Error:", authError);
       return new Response("Authentication error", { status: 500 });
  }
  const userId = session.user.id;

  // --- Create SSE Stream ---
  const stream = new ReadableStream({
    async start(controller) {
      console.log(`SSE stream started for project ${projectId}`);
      sendSseMessage(controller, { status: 'Initializing report generation...' });

      const tempFilePaths = []; // Keep track for potential cleanup on error *within this request*

      try {
        await connectMongoDB();

        const project = await Project.findById(projectId);
        if (!project || project.owner.toString() !== userId) {
          throw new Error('Project not found or forbidden');
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
        // No need for projectTempDir or tempFilePaths for this approach

        for (const diag of diagrams) {
            const gcsPrefix = `gs://${GCS_BUCKET_NAME}/`;
            const objectPath = diag.storagePath.startsWith(gcsPrefix) ? diag.storagePath.substring(gcsPrefix.length) : diag.storagePath;

            try {
                sendSseMessage(controller, { status: `Downloading ${diag.fileName} from GCS...` });
                // Download file content directly into a buffer
                const [fileBuffer] = await storage.bucket(GCS_BUCKET_NAME).file(objectPath).download();
                const base64Data = fileBuffer.toString('base64');
                fileParts.push({ inlineData: { mimeType: mime.lookup(diag.fileName) || 'application/octet-stream', data: base64Data } });
                processedDiagramNames.push(diag.fileName);
                sendSseMessage(controller, { status: `Prepared ${diag.fileName}.` });
            } catch (downloadError) {
                 console.error(`SSE: Failed to download GCS file ${objectPath} (${diag.fileName}):`, downloadError.message);
                 sendSseMessage(controller, { status: `Skipping ${diag.fileName} (download failed)...` });
                 // Optionally throw an error if any download fails, or just skip
                 // throw new Error(`Failed to download file ${diag.fileName}: ${downloadError.message}`);
            }
        }

        if (fileParts.length === 0) {
             throw new Error("Could not prepare any documents from GCS.");
        }
        sendSseMessage(controller, { status: `Using ${fileParts.length} downloaded files.` });
        // --- End File Preparation ---

    // --- Step 1: Perform OCR ---
    const diagramNamesString = processedDiagramNames.join(', ');
    const ocrPrompt = `Perform OCR on the following document(s): ${diagramNamesString}. Extract all text content accurately. Structure the output clearly, perhaps using markdown headings for each document.`;
    sendSseMessage(controller, { status: 'Performing OCR...' }); // Generic message
    const ocrText = await callGemini(ocrPrompt, fileParts, true); // Relaxed safety
    if (!ocrText) throw new Error("OCR process returned empty text.");
    sendSseMessage(controller, { status: 'Text extraction complete.' }); // Generic message

    // --- Step 2: Generate PDR Report ---
    const pdrPrompt = `Based on the following OCR text extracted from engineering diagrams (Project: ${project.name}), generate a Preliminary Design Report (PDR). Focus on summarizing key components, dimensions, materials (if mentioned), and any obvious design notes or specifications. Structure the report logically with clear headings (e.g., Introduction, System Overview, Key Components, Specifications, Conclusion). Ensure the output is well-formatted text suitable for a PDF report.\n\nOCR Text:\n---\n${ocrText}\n---\n\nGenerate the PDR report now.`;
    sendSseMessage(controller, { status: 'Generating report summary...' }); // Generic message
    const pdrReportText = await callGemini(pdrPrompt, [], false); // Default safety
    if (!pdrReportText) throw new Error("PDR generation process returned empty text.");
    sendSseMessage(controller, { status: 'Report summary generated.' }); // Generic message

        // --- Step 3: Create PDF ---
        sendSseMessage(controller, { status: 'Creating PDF document...' });
        const pdfBytes = await createPdf(pdrReportText);
        sendSseMessage(controller, { status: 'PDF created.' });

        // --- Step 4: Upload PDF to GCS (Temporary) ---
        sendSseMessage(controller, { status: 'Uploading temporary report...' });
        const reportFileName = `temp-reports/pdr_report_${projectId}_${Date.now()}.pdf`;
        const gcsReportFile = storage.bucket(GCS_BUCKET_NAME).file(reportFileName);
        await gcsReportFile.save(Buffer.from(pdfBytes), { contentType: 'application/pdf' });

        // --- Step 5: Generate Signed URL ---
        sendSseMessage(controller, { status: 'Generating download link...' });
        const [signedUrl] = await gcsReportFile.getSignedUrl({
            action: 'read',
            expires: Date.now() + 15 * 60 * 1000, // 15 minutes expiration
        });

        // --- Step 6: Send Completion Event ---
        sendSseMessage(controller, { downloadUrl: signedUrl }, 'complete');
        console.log(`SSE stream complete for project ${projectId}. Sent download URL.`);

      } catch (error) {
        console.error(`SSE Error for project ${projectId}:`, error);
        try {
            // Attempt to send an error event to the client
            sendSseMessage(controller, { message: error.message || 'An internal error occurred during report generation.' }, 'error');
        } catch (sseError) {
            console.error("SSE Error: Failed to send error message to client:", sseError);
        }
        // Optional: Clean up temp files created *during this failed request*
        // Note: This doesn't handle the general cache cleanup
         console.log(`Cleaning up ${tempFilePaths.length} temporary files due to error...`);
         for (const tempPath of tempFilePaths) {
             try { await fs.unlink(tempPath); } catch (e) { /* Ignore cleanup errors */ }
         }

      } finally {
        // Close the stream
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
