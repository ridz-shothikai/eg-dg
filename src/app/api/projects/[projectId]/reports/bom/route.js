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

// Helper function to create PDF with final formatting fixes v3
async function createPdf(text) {
    const pdfDoc = await PDFDocument.create();
    const timesRomanFont = await pdfDoc.embedFont(StandardFonts.TimesRoman);
    const timesRomanBoldFont = await pdfDoc.embedFont(StandardFonts.TimesRomanBold);

    let page = pdfDoc.addPage();
    const { width, height } = page.getSize();
    const margin = 50;
    const textWidth = width - 2 * margin;
    const indent = 20; // Indentation for content after bold label

    const normalFontSize = 11;
    const h2FontSize = 16; // For ##
    const h1FontSize = 20; // For #
    const normalLineHeight = normalFontSize * 1.2;
    const h2LineHeight = h2FontSize * 1.2;
    const h1LineHeight = h1FontSize * 1.2;

    let y = height - margin - h1FontSize; // Start lower for potential main title

    // Clean up input text first
    let initialCleanedText = (text || '').replace(/```/g, ''); // Remove backticks first
    // Remove leading "markdown" line, case-insensitive, handling potential whitespace/newlines
    if (initialCleanedText.trim().toLowerCase().startsWith('markdown')) {
        initialCleanedText = initialCleanedText.replace(/^\s*markdown\s*(\r?\n)?/i, '');
    }
    const cleanedText = initialCleanedText.trim();

    const lines = cleanedText.split(/\r?\n/); // Split by newline, handling Windows/Unix

    // Helper to draw wrapped text (handles line breaking) - simplified
    function drawWrappedLine(line, options) {
        const { x, font, size, color, lineHeight: currentLineHeight, availableWidth = textWidth } = options;
        const words = line.split(/(\s+)/); // Split by spaces, keeping spaces
        let currentLine = '';

        for (const word of words) {
            if (!word) continue; // Skip empty strings from split

            const testLine = currentLine + word;
            let testLineWidth = 0;
            try {
                testLineWidth = font.widthOfTextAtSize(testLine, size);
            } catch (e) {
                console.warn(`PDF: Skipping word "${word}" due to width error: ${e.message}`);
                continue;
            }

            if (testLineWidth < availableWidth) {
                currentLine = testLine;
            } else {
                // Line wrap needed
                if (y < margin + currentLineHeight) {
                    page = pdfDoc.addPage();
                    y = height - margin - size; // Reset y for new page
                }
                try {
                    page.drawText(currentLine.trimEnd(), { x, y, size, font, color, lineHeight: currentLineHeight });
                    y -= currentLineHeight;
                } catch (e) {
                    console.warn(`PDF: Skipping line "${currentLine}" due to draw error: ${e.message}`);
                }
                // Start new line with the current word, respecting original x indent
                currentLine = word.trimStart();
            }
        }

        // Draw the last remaining line
        if (currentLine.trim()) {
            if (y < margin + currentLineHeight) {
                page = pdfDoc.addPage();
                y = height - margin - size; // Reset y for new page
            }
            try {
                page.drawText(currentLine.trimEnd(), { x, y, size, font, color, lineHeight: currentLineHeight });
                y -= currentLineHeight;
            } catch (e) {
                console.warn(`PDF: Skipping final line "${currentLine}" due to draw error: ${e.message}`);
            }
        } else if (line.trim() === '') { // Ensure empty lines also advance y
             y -= currentLineHeight;
        }
    } // End of drawWrappedLine helper

    // Process lines from cleaned Gemini output
    for (const line of lines) {
        const trimmedLine = line.trim();
        // More flexible regex for bold label: **Label** : Content or **Label:** Content
        const boldLabelMatch = trimmedLine.match(/^\*\*(.*?)\s*:\*\*\s*(.*)/);

        // Estimate needed height for page break check
        let neededHeight = normalLineHeight;
        if (trimmedLine.startsWith('# ')) neededHeight = h1LineHeight * 1.5;
        else if (trimmedLine.startsWith('## ')) neededHeight = h2LineHeight * 1.5;
        else if (boldLabelMatch) neededHeight = normalLineHeight * (boldLabelMatch[2].trim() ? 1.5 : 1); // Extra space if content follows label
        else if (trimmedLine === '') neededHeight = normalLineHeight;

        // Check page break condition BEFORE drawing anything for the line
        if (y < margin + neededHeight) {
             page = pdfDoc.addPage();
             let resetFontSize = normalFontSize;
             if (trimmedLine.startsWith('# ')) resetFontSize = h1FontSize;
             else if (trimmedLine.startsWith('## ')) resetFontSize = h2FontSize;
             y = height - margin - resetFontSize; // Reset Y based on the type of the first element
        }


        if (trimmedLine.startsWith('# ')) {
             // --- Handle H1 Heading ---
             const headingText = trimmedLine.substring(2).trim();
             y -= h1LineHeight * 0.5; // Space before
             const textWidthH1 = timesRomanBoldFont.widthOfTextAtSize(headingText, h1FontSize);
             const centeredX = (width - textWidthH1) / 2;
             drawWrappedLine(headingText, {
                 x: Math.max(margin, centeredX),
                 font: timesRomanBoldFont,
                 size: h1FontSize,
                 color: rgb(0, 0, 0),
                 lineHeight: h1LineHeight
             });
             // y is decremented by drawWrappedLine

        } else if (trimmedLine.startsWith('## ')) {
            // --- Handle H2 Heading ---
            const headingText = trimmedLine.substring(3).trim();
             y -= h2LineHeight * 0.5; // Space before
            drawWrappedLine(headingText, {
                x: margin,
                font: timesRomanBoldFont,
                size: h2FontSize,
                color: rgb(0, 0, 0),
                lineHeight: h2LineHeight
            });
             // y is decremented by drawWrappedLine

        } else if (boldLabelMatch) {
            // --- Handle Bold Label Line (Simplified Layout) ---
            const label = boldLabelMatch[1].trim() + ":"; // Get label, trim, add colon
            const content = boldLabelMatch[2].trim();

            // Draw label bold at margin
            page.drawText(label, { x: margin, y: y, font: timesRomanBoldFont, size: normalFontSize, color: rgb(0, 0, 0) });
            y -= normalLineHeight; // Move down after drawing label

            // Draw content normal, wrapped, starting on the NEXT line, indented
            if (content) {
                 if (y < margin + normalLineHeight) { // Check page break for content
                     page = pdfDoc.addPage();
                     y = height - margin - normalFontSize;
                 }
                 drawWrappedLine(content, {
                     x: margin + indent, // Indent content
                     font: timesRomanFont,
                     size: normalFontSize,
                     color: rgb(0, 0, 0),
                     lineHeight: normalLineHeight,
                     availableWidth: textWidth - indent // Adjust available width for indent
                 });
                 // y is decremented by drawWrappedLine
            }
             // No extra space needed here, y was already moved down after label or content

        } else if (trimmedLine === '') {
            // --- Handle Empty line (Paragraph break) ---
             // drawWrappedLine now handles advancing y for empty lines
             drawWrappedLine('', { x: margin, font: timesRomanFont, size: normalFontSize, color: rgb(0, 0, 0), lineHeight: normalLineHeight });

        } else {
            // --- Handle Regular paragraph line ---
             drawWrappedLine(trimmedLine, {
                 x: margin,
                 font: timesRomanFont,
                 size: normalFontSize,
                 color: rgb(0, 0, 0),
                 lineHeight: normalLineHeight
             });
              // y is decremented by drawWrappedLine
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
                // Download file content directly into a buffer
                const [fileBuffer] = await storage.bucket(GCS_BUCKET_NAME).file(objectPath).download();
                const base64Data = fileBuffer.toString('base64');
                fileParts.push({ inlineData: { mimeType: mime.lookup(diag.fileName) || 'application/octet-stream', data: base64Data } });
                processedDiagramNames.push(diag.fileName);
                sendSseMessage(controller, { status: `Prepared ${diag.fileName}.` });
            } catch (downloadError) {
                 console.error(`BoM SSE: Failed to download GCS file ${objectPath} (${diag.fileName}):`, downloadError.message);
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
        const ocrPrompt = `Perform OCR on the following document(s): ${diagramNamesString}. Extract all text content accurately. Focus on text relevant to components, materials, dimensions, and quantities.`;
        sendSseMessage(controller, { status: 'Performing OCR...' });
        const ocrText = await callGemini(ocrPrompt, fileParts, true); // Relaxed safety for OCR
        if (!ocrText) throw new Error("OCR process returned empty text.");
        sendSseMessage(controller, { status: 'Text extraction complete.' });

        // --- Step 2: Generate BoM Report ---
        // **Stronger BoM Prompt**
        const bomPrompt = `Based on the following OCR text extracted from engineering diagrams (Project: ${project.name}), generate a detailed Bill of Materials (BoM).
Identify each distinct component mentioned (e.g., beams, columns, pipes, valves, resistors, specific part numbers).
For each component, extract its quantity, dimensions (if specified), material (if specified), and any other relevant specifications found in the text.
Present the BoM in a clear, structured format, preferably like a table or a list with consistent fields for each item (Item Name, Quantity, Dimensions, Material, Specifications/Notes). Be comprehensive and accurate.

OCR Text:
---
${ocrText}
---

Generate the Bill of Materials now.`;
        sendSseMessage(controller, { status: 'Generating Bill of Materials...' });
        const bomReportText = await callGemini(bomPrompt, [], false); // Default safety
        if (!bomReportText) throw new Error("BoM generation process returned empty text.");
        sendSseMessage(controller, { status: 'BoM generated.' });

        // --- Step 3: Create PDF ---
        sendSseMessage(controller, { status: 'Creating PDF document...' });
        const pdfBytes = await createPdf(bomReportText);
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
