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
// import { PDFDocument, StandardFonts, rgb } from 'pdf-lib';
import { Storage } from '@google-cloud/storage';
import fs from 'fs/promises'; // Keep fs for reading rules files
import path from 'path';
import * as constants from '@/constants';
import puppeteerFull from 'puppeteer'; // For local development
import chromium from '@sparticuz/chromium'; // For Vercel/serverless
import puppeteer from 'puppeteer-core'; // Core API used by both


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

// --- NEW: Helper function to create PDF from HTML using Puppeteer ---
async function createPdfFromHtml(htmlContent) {
    let browser = null;
    console.log("Generating PDF from HTML using Puppeteer...");
    let executablePath = null;
    try { // Start main try block HERE, encompassing everything
        // --- Determine executablePath and args ---
        // Use environment variable set in Dockerfile if available, otherwise use local puppeteer
        const executablePath = process.env.PUPPETEER_EXECUTABLE_PATH || puppeteerFull.executablePath();
        // Use minimal args for both local and production (safer default)
        const launchArgs = ['--no-sandbox', '--disable-setuid-sandbox'];

        console.log(`Using Chromium executable path: ${executablePath}`);
        console.log(`Using launch args: ${JSON.stringify(launchArgs)}`);
        // --- End determination ---

        if (!executablePath) {
             throw new Error("Chromium executable path could not be determined.");
            }

            console.log("Launching browser...");
            const launchOptions = {
                args: launchArgs,
                // defaultViewport: chromium.defaultViewport, // Use Puppeteer's default
                executablePath: executablePath,
                headless: true, // Default to headless true
                ignoreHTTPSErrors: true,
            };

            browser = await puppeteer.launch(launchOptions); // browser is declared outside try
            console.log("Browser launched.");

            const page = await browser.newPage();
            console.log("New page created.");

            // Add basic styling for better PDF output
            const styledHtml = `
                <!DOCTYPE html>
                <html>
                <head>
                    <meta charset="UTF-8">
                    <style>
                        body { font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; line-height: 1.6; padding: 20px; color: #333; }
                        h1, h2, h3 { margin-bottom: 0.5em; margin-top: 1.5em; color: #110927; }
                        h1 { font-size: 24px; text-align: center; border-bottom: 2px solid #130830; padding-bottom: 10px; margin-bottom: 25px; }
                        h2 { font-size: 20px; border-bottom: 1px solid #eee; padding-bottom: 5px; margin-bottom: 15px; }
                        h3 { font-size: 16px; }
                        p { margin-bottom: 1em; }
                        ul, ol { margin-left: 20px; margin-bottom: 1em; }
                        li { margin-bottom: 0.5em; }
                        table { width: 100%; border-collapse: collapse; margin-top: 1em; margin-bottom: 1em; box-shadow: 0 1px 3px rgba(0,0,0,0.1); }
                        th, td { border: 1px solid #ddd; padding: 10px 12px; text-align: left; vertical-align: top; }
                        th { background-color: #f8f8f8; font-weight: bold; color: #100926; }
                        tbody tr:nth-child(even) { background-color: #fdfdfd; }
                        pre { background-color: #f5f5f5; padding: 10px; border: 1px solid #eee; border-radius: 4px; overflow-x: auto; font-family: 'Courier New', Courier, monospace; }
                    </style>
                </head>
                <body>
                    ${htmlContent}
                </body>
                </html>
            `;

            console.log("Setting page content...");
            await page.setContent(styledHtml, { waitUntil: 'networkidle0' });
            console.log("Page content set.");

            console.log("Generating PDF bytes...");
            const pdfBytes = await page.pdf({
                format: 'A4',
                printBackground: true,
                margin: { top: '1in', right: '1in', bottom: '1in', left: '1in' },
                preferCSSPageSize: true
            });
            console.log("PDF bytes generated.");

            return pdfBytes; // Return from within the main try block
    } catch (error) { // Main catch block now handles all errors from the try
        console.error("Error generating PDF from HTML:", error);
        throw new Error(`Failed to generate PDF using Puppeteer: ${error.message}`);
    } finally {
        if (browser !== null) {
            console.log("Closing browser..."); // Add semicolon
            await browser.close();
            console.log("Browser closed."); // Add semicolon
        }
    }
}
// --- END NEW ---


// Function to send SSE messages
// Renamed 'event' to 'eventName' to avoid potential conflicts
function sendSseMessage(controller, data, eventName = 'message') {
  const encoder = new TextEncoder();
  if (eventName !== 'message') controller.enqueue(encoder.encode(`event: ${eventName}\n`));
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
        // Keep this simple text format for the prompt
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
  // Attempt to fix "params should be awaited" warning/error
  const awaitedParams = await params;
  const { projectId } = awaitedParams;

  if (!projectId || !mongoose.Types.ObjectId.isValid(projectId)) return new Response("Invalid Project ID", { status: 400 });
  if (!gemini) return new Response("Backend not ready (Gemini)", { status: 503 });
  if (!storage || !GCS_BUCKET_NAME) return new Response("Backend not ready (GCS config missing)", { status: 503 });
  // --- NEW: Check if Puppeteer dependencies are available ---
  if (typeof chromium === 'undefined' || typeof puppeteer === 'undefined') {
      console.error("Puppeteer/Chromium dependencies missing. Ensure 'puppeteer-core' and '@sparticuz/chromium' are installed.");
      return new Response("Backend PDF generation components missing.", { status: 503 });
  }
  // --- END NEW ---

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
                const [fileBuffer] = await storage.bucket(GCS_BUCKET_NAME).file(objectPath).download();
                const base64Data = fileBuffer.toString('base64');
                fileParts.push({ inlineData: { mimeType: mime.lookup(diag.fileName) || 'application/octet-stream', data: base64Data } });
                processedDiagramNames.push(diag.fileName);
                sendSseMessage(controller, { status: `Prepared ${diag.fileName}.` });
            } catch (downloadError) {
                 console.error(`Compliance SSE: Failed to download GCS file ${objectPath} (${diag.fileName}):`, downloadError.message);
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
        const ocrPrompt = `Perform OCR on the following document(s): ${diagramNamesString}. Extract text relevant to components, materials, dimensions, specifications, and safety notes.`;
        sendSseMessage(controller, { status: 'Performing OCR...' });
        const ocrText = await callGemini(ocrPrompt, fileParts, true); // Relaxed safety
        if (!ocrText) throw new Error("OCR failed.");
        sendSseMessage(controller, { status: 'Text extraction complete.' });

        // --- Step 2: Load Compliance Rules ---
        sendSseMessage(controller, { status: 'Loading compliance rules...' });
        const complianceRulesText = await loadComplianceRules();
        if (complianceRulesText.startsWith("Error:")) throw new Error(complianceRulesText);

        // --- Step 3: Generate Compliance Report as HTML ---
        // --- UPDATED PROMPT ---
        const compliancePrompt = `Analyze the following OCR text extracted from engineering diagrams (Project: ${project.name}) against the provided compliance rules (IBC, Eurocodes, IS) and generate a Compliance Report in **HTML format**.

**Instructions for HTML Structure:**
1.  Use standard HTML tags: \`<h1>\`, \`<h2>\`, \`<h3>\` for headings, \`<p>\` for paragraphs, \`<ul>\`/\`<ol>\`/\`<li>\` for lists.
2.  **Crucially, represent compliance checks and results using proper HTML tables:** \`<table>\`, \`<thead>\`, \`<tbody>\`, \`<tr>\`, \`<th>\`, \`<td>\`. Use headers like "Rule/Standard", "Component/Specification", "Status (Compliant/Non-Compliant/Undetermined)", "Reason/Notes".
3.  Do **NOT** include any Markdown syntax (like \`**\`, \`#\`, \`-\`, \`|\`) in the final HTML output.
4.  Structure the report logically with clear sections (e.g., Introduction, Compliance Summary Table, Detailed Findings per Standard). Use appropriate heading levels (\`<h1>\`, \`<h2>\`, etc.).
5.  Ensure the entire output is a single, valid HTML document body content (you don't need to include \`<html>\` or \`<head>\` tags yourself, just the content that would go inside \`<body>\`).

**Content Focus:**
*   Identify components and specifications from the OCR text relevant to the rules.
*   Compare these against the provided rules.
*   For each relevant rule/component, state the compliance status (Compliant, Non-Compliant, Undetermined).
*   Provide specific reasons for the status, citing the rule/standard where possible.

**Compliance Rules:**
---
${complianceRulesText}
---

**OCR Text:**
---
${ocrText}
---

Generate the Compliance Report in HTML format now.`;
        // --- END UPDATED PROMPT ---

        sendSseMessage(controller, { status: 'Analyzing compliance (HTML)...' });
        let complianceReportHtml = await callGemini(compliancePrompt, [], false); // Default safety
        if (!complianceReportHtml) throw new Error("Compliance analysis failed.");

        // --- Clean up Gemini's Markdown code fences ---
        console.log("Cleaning Gemini HTML output...");
        complianceReportHtml = complianceReportHtml.trim(); // Remove leading/trailing whitespace
        if (complianceReportHtml.startsWith('```html')) {
            complianceReportHtml = complianceReportHtml.substring(7).trimStart(); // Remove ```html and leading newline/space
        }
        if (complianceReportHtml.endsWith('```')) {
            complianceReportHtml = complianceReportHtml.substring(0, complianceReportHtml.length - 3).trimEnd(); // Remove ``` and trailing newline/space
        }
        console.log("HTML output cleaned.");
        // --- End cleanup ---

        sendSseMessage(controller, { status: 'Compliance analysis complete.' });

        // --- Step 4: Create PDF from HTML ---
        // --- UPDATED CALL ---
        sendSseMessage(controller, { status: 'Creating PDF document from HTML...' });
        const pdfBytes = await createPdfFromHtml(complianceReportHtml);
        // --- END UPDATED CALL ---
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
