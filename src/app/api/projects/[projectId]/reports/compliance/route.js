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
import * as constants from '@/constants';

// Assuming rules files are correctly placed relative to the project root
const ibcRulesPath = path.join(process.cwd(), 'src', 'data', 'ibc_rules.json');
const eurocodesRulesPath = path.join(process.cwd(), 'src', 'data', 'eurocodes_rules.json');
const isRulesPath = path.join(process.cwd(), 'src', 'data', 'is_rules.json');


const { GOOGLE_AI_STUDIO_API_KEY, GCS_BUCKET_NAME, GOOGLE_CLOUD_PROJECT_ID } = constants;

// --- Initialize Gemini Model ---
let gemini = null;
if (GOOGLE_AI_STUDIO_API_KEY) {
  try {
    const genAI = new GoogleGenerativeAI(GOOGLE_AI_STUDIO_API_KEY);
    gemini = genAI.getGenerativeModel({ model: "gemini-2.0-flash" }); // Or a more powerful model
    console.log("Gemini model initialized for Compliance reports.");
  } catch (e) {
    console.error("Failed to initialize Gemini components for Compliance reports:", e);
  }
} else {
  console.warn("GOOGLE_AI_STUDIO_API_KEY not set. Compliance report functionality will be disabled.");
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
        console.log(`Compliance API: GCS Storage client initialized using keyfile ${keyFilePath} for bucket: ${GCS_BUCKET_NAME}`);
    } catch(e) {
        console.error("Compliance API: Failed to initialize GCS Storage client:", e);
    }
} else {
    console.warn("Compliance API: GCS_BUCKET_NAME or GOOGLE_CLOUD_PROJECT_ID not set. GCS functionality will be disabled.");
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
        if (fileParts && fileParts.length > 0) { parts.push(...fileParts); }
        console.log(`Calling gemini.generateContent (Safety Settings: ${applySafetySettings ? 'Relaxed' : 'Default'})...`);
        const loggableParts = parts.map(part => part.text ? { text: '...' } : { inlineData: { mimeType: part.inlineData.mimeType, data: '...' } });
        console.log("Payload structure:", JSON.stringify([{ role: "user", parts: loggableParts }], null, 2));
        const generationConfig = {};
        const safetySettings = applySafetySettings ? relaxedSafetySettings : undefined;
        const result = await gemini.generateContent({ contents: [{ role: "user", parts: parts }], generationConfig, safetySettings });
        if (!result.response) { console.error("No response object."); throw new Error("No response."); }
        const promptFeedback = result.response.promptFeedback;
        if (promptFeedback?.blockReason) { console.warn(`Blocked: ${promptFeedback.blockReason}`); throw new Error(`Blocked: ${promptFeedback.blockReason}`); }
        const responseText = result.response.text();
        if (!responseText) { console.error("Empty text response."); throw new Error("Empty response."); }
        return responseText;
    } catch (error) {
        console.error("Error calling Gemini:", error);
        if (error.message.includes("400 Bad Request")) {
             const loggableParts = (fileParts || []).map(part => ({ inlineData: { mimeType: part.inlineData.mimeType, data: '...' } }));
             console.error("Parts sent on Bad Request:", JSON.stringify([{ text: prompt }, ...loggableParts], null, 2));
             throw new Error(`Gemini API Bad Request: ${error.message}. Check data format/prompt.`);
         }
        throw error;
    }
}

// Helper function to create PDF
async function createPdf(text) {
    // ... (keep existing createPdf function as is)
    const pdfDoc = await PDFDocument.create();
    const timesRomanFont = await pdfDoc.embedFont(StandardFonts.TimesRoman);
    let page = pdfDoc.addPage();
    const { width, height } = page.getSize();
    const fontSize = 11; const margin = 50; const textWidth = width - 2 * margin; const lineHeight = fontSize * 1.2; let y = height - margin - fontSize;
    const paragraphs = (text || '').split('\n');
    for (const paragraph of paragraphs) {
        if (paragraph.trim() === '') { if (y < margin + lineHeight) { page = pdfDoc.addPage(); y = height - margin - fontSize; } y -= lineHeight; continue; }
        const words = paragraph.split(/(\s+)/); let currentLine = '';
        for (const word of words) {
            if (!word) continue; const testLine = currentLine + word; let testLineWidth = 0;
            try { testLineWidth = timesRomanFont.widthOfTextAtSize(testLine, fontSize); } catch (e) { console.warn(`PDF: Skip word "${word}": ${e.message}`); continue; }
            if (testLineWidth < textWidth) { currentLine = testLine; }
            else {
                if (y < margin + lineHeight) { page = pdfDoc.addPage(); y = height - margin - fontSize; }
                try { page.drawText(currentLine.trimEnd(), { x: margin, y: y, size: fontSize, font: timesRomanFont, color: rgb(0, 0, 0), lineHeight: lineHeight }); y -= lineHeight; } catch (e) { console.warn(`PDF: Skip line "${currentLine}": ${e.message}`); }
                currentLine = word.trimStart();
            }
        }
        if (currentLine.trim()) {
            if (y < margin + lineHeight) { page = pdfDoc.addPage(); y = height - margin - fontSize; }
            try { page.drawText(currentLine.trimEnd(), { x: margin, y: y, size: fontSize, font: timesRomanFont, color: rgb(0, 0, 0), lineHeight: lineHeight }); y -= lineHeight; } catch (e) { console.warn(`PDF: Skip final line "${currentLine}": ${e.message}`); }
        }
    }
    return await pdfDoc.save();
}

// Function to send SSE messages
function sendSseMessage(controller, data, event = 'message') {
  const encoder = new TextEncoder();
  if (event !== 'message') controller.enqueue(encoder.encode(`event: ${event}\n`));
  controller.enqueue(encoder.encode(`data: ${JSON.stringify(data)}\n\n`));
}

// Function to load compliance rules
async function loadComplianceRules() {
    try {
        const [ibcData, euroData, isData] = await Promise.all([
            fs.readFile(ibcRulesPath, 'utf-8'),
            fs.readFile(eurocodesRulesPath, 'utf-8'),
            fs.readFile(isRulesPath, 'utf-8')
        ]);
        // Combine or structure rules as needed for the prompt
        return `
IBC Rules:
---
${ibcData}
---

Eurocodes Rules:
---
${euroData}
---

IS Rules:
---
${isData}
---
`;
    } catch (error) {
        console.error("Failed to load compliance rules:", error);
        return "Error: Compliance rules could not be loaded."; // Or handle differently
    }
}

// GET handler for SSE connection (Compliance Report)
export async function GET(request, { params }) {
  const { projectId } = params;

  if (!projectId || !mongoose.Types.ObjectId.isValid(projectId)) return new Response("Invalid Project ID", { status: 400 });
  if (!gemini) return new Response("Backend not ready (Gemini)", { status: 503 });
  if (!storage || !GCS_BUCKET_NAME) return new Response("Backend not ready (GCS config missing)", { status: 503 });

  let session;
  try {
      session = await getServerSession(authOptions);
      if (!session?.user?.id) return new Response("Unauthorized", { status: 401 });
  } catch (authError) { console.error("SSE Auth Error:", authError); return new Response("Auth error", { status: 500 }); }
  const userId = session.user.id;

  const stream = new ReadableStream({
    async start(controller) {
      console.log(`Compliance SSE stream started for project ${projectId}`);
      sendSseMessage(controller, { status: 'Initializing compliance report...' });

      try {
        await connectMongoDB();
        const project = await Project.findById(projectId);
        if (!project || project.owner.toString() !== userId) throw new Error('Project not found or forbidden');

        sendSseMessage(controller, { status: 'Fetching diagram list...' });
        const diagrams = await Diagram.find({ project: projectId, storagePath: { $exists: true, $ne: null, $ne: '' } }).select('fileName storagePath');
        if (diagrams.length === 0) throw new Error("No documents found.");

        // --- Prepare Inline Data by Downloading Directly from GCS ---
        sendSseMessage(controller, { status: `Preparing ${diagrams.length} files from GCS...` });
        const fileParts = [];
        const processedDiagramNames = [];

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
                 console.error(`Compliance SSE: Failed to download GCS file ${objectPath} (${diag.fileName}):`, downloadError.message);
                 sendSseMessage(controller, { status: `Skipping ${diag.fileName} (download failed)...` });
                 // Optionally throw an error if any download fails, or just skip
            }
        }

        if (fileParts.length === 0) {
             throw new Error("Could not prepare any documents from GCS.");
        }
        sendSseMessage(controller, { status: `Using ${fileParts.length} downloaded files.` });
        // --- End File Preparation ---

        // --- Step 1: Perform OCR ---
        const diagramNamesString = processedDiagramNames.join(', ');
        const ocrPrompt = `Perform OCR on the following document(s): ${diagramNamesString}. Extract text relevant to components, materials, dimensions, specifications, and safety notes.`;
        sendSseMessage(controller, { status: 'Performing OCR...' });
        const ocrText = await callGemini(ocrPrompt, fileParts, true); // Relaxed safety
        if (!ocrText) throw new Error("OCR failed.");
        sendSseMessage(controller, { status: 'Text extraction complete.' });

        // --- Step 2: Load Compliance Rules ---
        sendSseMessage(controller, { status: 'Loading compliance rules...' });
        const complianceRulesText = await loadComplianceRules();
        if (complianceRulesText.startsWith("Error:")) throw new Error(complianceRulesText);

        // --- Step 3: Generate Compliance Report ---
        const compliancePrompt = `Analyze the following OCR text extracted from engineering diagrams (Project: ${project.name}) against the provided compliance rules (IBC, Eurocodes, IS).
Identify components and specifications mentioned in the OCR text.
Compare these against the rules. For each relevant rule, state whether the diagram appears compliant, non-compliant, or if compliance cannot be determined from the text. Provide specific reasons and cite the rule/standard where possible.
Structure the report clearly, perhaps sectioned by standard or component type.

Compliance Rules:
---
${complianceRulesText}
---

OCR Text:
---
${ocrText}
---

Generate the Compliance Report now.`;
        sendSseMessage(controller, { status: 'Analyzing compliance...' });
        const complianceReportText = await callGemini(compliancePrompt, [], false); // Default safety
        if (!complianceReportText) throw new Error("Compliance analysis failed.");
        sendSseMessage(controller, { status: 'Compliance analysis complete.' });

        // --- Step 4: Create PDF ---
        sendSseMessage(controller, { status: 'Creating PDF document...' });
        const pdfBytes = await createPdf(complianceReportText);
        sendSseMessage(controller, { status: 'PDF created.' });

        // --- Step 5: Upload PDF to GCS (Temporary) ---
        sendSseMessage(controller, { status: 'Uploading temporary report...' });
        const reportFileName = `temp-reports/compliance_report_${projectId}_${Date.now()}.pdf`;
        const gcsReportFile = storage.bucket(GCS_BUCKET_NAME).file(reportFileName);
        await gcsReportFile.save(Buffer.from(pdfBytes), { contentType: 'application/pdf' });

        // --- Step 6: Generate Signed URL ---
        sendSseMessage(controller, { status: 'Generating download link...' });
        const [signedUrl] = await gcsReportFile.getSignedUrl({ action: 'read', expires: Date.now() + 15 * 60 * 1000 });

        // --- Step 7: Send Completion Event ---
        sendSseMessage(controller, { downloadUrl: signedUrl }, 'complete');
        console.log(`Compliance SSE stream complete for project ${projectId}.`);

      } catch (error) {
        console.error(`Compliance SSE Error for project ${projectId}:`, error);
        try { sendSseMessage(controller, { message: error.message || 'Internal error during compliance report generation.' }, 'error'); }
        catch (sseError) { console.error("Compliance SSE Error: Failed to send error message:", sseError); }
      } finally {
        try { controller.close(); console.log(`Compliance SSE stream closed for project ${projectId}`); }
        catch (e) { console.error(`Compliance SSE Error: Failed to close stream:`, e); }
      }
    }
  });

  return new Response(stream, { headers: { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache', 'Connection': 'keep-alive' } });
}
