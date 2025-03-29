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
// Removed fs/promises import as it's not used directly here anymore
// import fs from 'fs/promises';
import path from 'path';
import * as constants from '@/constants';
import puppeteerFull from 'puppeteer'; // For local development
import chromium from '@sparticuz/chromium'; // For Vercel/serverless
import puppeteer from 'puppeteer-core'; // Core API used by both


const { GOOGLE_AI_STUDIO_API_KEY, GCS_BUCKET_NAME, GOOGLE_CLOUD_PROJECT_ID } = constants;

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

// --- NEW: Helper function to create PDF from HTML using Puppeteer ---
async function createPdfFromHtml(htmlContent) {
    let browser = null;
    console.log("Generating PDF from HTML using Puppeteer...");
    let executablePath = null; // Define outside try block
    // --- Conditionally determine executablePath ---
    try {
        if (process.env.VERCEL) {
            console.log("Running on Vercel, using @sparticuz/chromium path...");
            executablePath = await chromium.executablePath(); // For Vercel
        } else {
            console.log("Running locally, using puppeteer path...");
            executablePath = puppeteerFull.executablePath(); // For local dev
        }
        console.log(`Using Chromium executable path: ${executablePath}`); // Log the path
    } catch (pathError) {
        console.error("Error getting Chromium executable path:", pathError);
        // Provide more context in the error
        const envType = process.env.VERCEL ? 'Vercel (@sparticuz/chromium)' : 'Local (puppeteer)';
        throw new Error(`Failed to get Chromium executable path for ${envType}: ${pathError.message}`);
    }
    // --- End conditional determination ---

    if (!executablePath) {
         // This error should be more specific now based on the try-catch above
         throw new Error("Chromium executable path could not be determined for the current environment.");
        }

        console.log("Launching browser...");
        const launchOptions = {
            defaultViewport: chromium.defaultViewport,
            executablePath: executablePath, // Use the obtained path
            headless: chromium.headless, // Use headless mode from sparticuz
            ignoreHTTPSErrors: true,
        };

        if (process.env.VERCEL) {
            console.log("Using Vercel-optimized args for Puppeteer launch.");
            launchOptions.args = chromium.args;
        } else {
            console.log("Using minimal args for local Puppeteer launch.");
            // Use a minimal set for local dev, or omit entirely to use puppeteer defaults
            // Example minimal set (adjust if needed):
            launchOptions.args = ['--no-sandbox', '--disable-setuid-sandbox'];
        }

        browser = await puppeteer.launch(launchOptions);
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

        return pdfBytes;
    } catch (error) {
        console.error("Error generating PDF from HTML:", error);
        throw new Error(`Failed to generate PDF using Puppeteer: ${error.message}`);
    } finally {
        if (browser !== null) {
            console.log("Closing browser...");
            await browser.close();
            console.log("Browser closed.");
        }
    }

// --- END NEW ---

// Function to send SSE messages
function sendSseMessage(controller, data, eventName = 'message') { // Renamed parameter
  const encoder = new TextEncoder();
  if (eventName !== 'message') { // Updated usage
    controller.enqueue(encoder.encode(`event: ${eventName}\n`)); // Updated usage
  }
  controller.enqueue(encoder.encode(`data: ${JSON.stringify(data)}\n\n`));
}

// GET handler for SSE connection (BoM Report)
export async function GET(request, { params }) {
  // Attempt to fix "params should be awaited" warning/error
  const awaitedParams = await params;
  const { projectId } = awaitedParams;

  if (!projectId || !mongoose.Types.ObjectId.isValid(projectId)) {
    return new Response("Invalid Project ID", { status: 400 });
  }
  if (!gemini) {
     return new Response("Backend not ready (Gemini)", { status: 503 });
  }
   if (!storage || !GCS_BUCKET_NAME) {
     return new Response("Backend not ready (GCS config missing)", { status: 503 });
  }
  // --- NEW: Check if Puppeteer dependencies are available ---
  if (typeof chromium === 'undefined' || typeof puppeteer === 'undefined') {
      console.error("Puppeteer/Chromium dependencies missing. Ensure 'puppeteer-core' and '@sparticuz/chromium' are installed.");
      return new Response("Backend PDF generation components missing.", { status: 503 });
  }
  // --- END NEW ---

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

  const stream = new ReadableStream({
    async start(controller) {
      console.log(`BoM SSE stream started for project ${projectId}`);
      sendSseMessage(controller, { status: 'Initializing BoM report...' });

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
        const ocrText = await callGemini(ocrPrompt, fileParts, true); // Relaxed safety for OCR
        if (!ocrText) throw new Error("OCR process returned empty text.");
        sendSseMessage(controller, { status: 'Text extraction complete.' });

        // --- Step 2: Generate BoM Report as HTML ---
        // --- UPDATED PROMPT ---
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
        // --- END UPDATED PROMPT ---

        sendSseMessage(controller, { status: 'Generating Bill of Materials (HTML)...' });
        let bomReportHtml = await callGemini(bomPrompt, [], false); // Default safety
        if (!bomReportHtml) throw new Error("BoM generation process returned empty HTML.");

        // --- Clean up Gemini's Markdown code fences ---
        console.log("Cleaning Gemini HTML output...");
        bomReportHtml = bomReportHtml.trim(); // Remove leading/trailing whitespace
        if (bomReportHtml.startsWith('```html')) {
            bomReportHtml = bomReportHtml.substring(7).trimStart(); // Remove ```html and leading newline/space
        }
        if (bomReportHtml.endsWith('```')) {
            bomReportHtml = bomReportHtml.substring(0, bomReportHtml.length - 3).trimEnd(); // Remove ``` and trailing newline/space
        }
        console.log("HTML output cleaned.");
        // --- End cleanup ---

        sendSseMessage(controller, { status: 'BoM generated.' });

        // --- Step 3: Create PDF from HTML ---
        // --- UPDATED CALL ---
        sendSseMessage(controller, { status: 'Creating PDF document from HTML...' });
        const pdfBytes = await createPdfFromHtml(bomReportHtml);
        // --- END UPDATED CALL ---
        sendSseMessage(controller, { status: 'PDF created.' });

        // --- Step 4: Upload PDF to GCS (Temporary) ---
        sendSseMessage(controller, { status: 'Uploading temporary report...' });
        const reportFileName = `temp-reports/bom_report_${projectId}_${Date.now()}.pdf`;
        const gcsReportFile = storage.bucket(GCS_BUCKET_NAME).file(reportFileName);
        await gcsReportFile.save(Buffer.from(pdfBytes), { contentType: 'application/pdf' });

        // --- Step 5: Generate Signed URL ---
        sendSseMessage(controller, { status: 'Generating download link...' });
        const [signedUrl] = await gcsReportFile.getSignedUrl({
            action: 'read',
            expires: Date.now() + 15 * 60 * 1000, // 15 minutes
        });

        // --- Step 6: Send Completion Event ---
        sendSseMessage(controller, { downloadUrl: signedUrl }, 'complete');
        console.log(`BoM SSE stream complete for project ${projectId}. Sent download URL.`);

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
      }
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
