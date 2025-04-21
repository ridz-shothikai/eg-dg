import { authOptions } from "@/app/api/auth/[...nextauth]/route";
import * as constants from "@/constants";
import connectMongoDB from "@/lib/db";
// Removed: import { fetchWithRetry } from "@/lib/fetchUtils";
import { generateContentWithRetry } from "@/lib/geminiUtils"; // Import the retry helper
import { generatePdfFromHtml } from "@/lib/generatePdfFromHtml"; // Import local PDF generator
import Diagram from "@/models/Diagram";
import Project from "@/models/Project";
import { Storage } from "@google-cloud/storage";
import {
  GoogleGenerativeAI,
  HarmBlockThreshold,
  HarmCategory,
} from "@google/generative-ai";
import mime from "mime-types";
import mongoose from "mongoose";
import { getServerSession } from "next-auth/next";
import path from "path";

const { GOOGLE_AI_STUDIO_API_KEY, GCS_BUCKET_NAME, GOOGLE_CLOUD_PROJECT_ID } =
  constants;
// Define the new API endpoint
const HTML_TO_PDF_API_URL = "https://html-text-to-pdf.shothik.ai/convert";

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
  console.warn(
    "GOOGLE_AI_STUDIO_API_KEY not set. BoM report functionality will be disabled."
  );
}

// --- Initialize GCS Storage ---
let storage = null;
if (GOOGLE_CLOUD_PROJECT_ID && GCS_BUCKET_NAME) {
  try {
    const keyFilePath = path.join(process.cwd(), "sa.json");
    storage = new Storage({
      projectId: GOOGLE_CLOUD_PROJECT_ID,
      keyFilename: keyFilePath,
    });
    console.log(
      `BoM API: GCS Storage client initialized using keyfile ${keyFilePath} for bucket: ${GCS_BUCKET_NAME}`
    );
  } catch (e) {
    console.error("BoM API: Failed to initialize GCS Storage client:", e);
  }
} else {
  console.warn(
    "BoM API: GCS_BUCKET_NAME or GOOGLE_CLOUD_PROJECT_ID not set. GCS functionality will be disabled."
  );
}

// Define relaxed safety settings (might be needed for OCR)
const relaxedSafetySettings = [
  {
    category: HarmCategory.HARM_CATEGORY_HARASSMENT,
    threshold: HarmBlockThreshold.BLOCK_ONLY_HIGH,
  },
  {
    category: HarmCategory.HARM_CATEGORY_HATE_SPEECH,
    threshold: HarmBlockThreshold.BLOCK_ONLY_HIGH,
  },
  {
    category: HarmCategory.HARM_CATEGORY_SEXUALLY_EXPLICIT,
    threshold: HarmBlockThreshold.BLOCK_ONLY_HIGH,
  },
  {
    category: HarmCategory.HARM_CATEGORY_DANGEROUS_CONTENT,
    threshold: HarmBlockThreshold.BLOCK_ONLY_HIGH,
  },
];

// --- REMOVED local callGemini helper function ---

// Function to send SSE messages
function sendSseMessage(controller, data, eventName = "message") {
  const encoder = new TextEncoder();
  if (eventName !== "message") {
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
    return new Response("Backend not ready (GCS config missing)", {
      status: 503,
    });
  }
  // --- REMOVED Puppeteer dependency check ---

  // --- Authorization Check (Session or Guest Header) ---
  let userId = null;
  let isGuest = false;
  let guestIdHeader = null;
  let project = null;

  try {
    const session = await getServerSession(authOptions);
    guestIdHeader = request.headers.get("X-Guest-ID");
    // --- NEW: Check for guestId query parameter ---
    const url = new URL(request.url);
    const guestIdQuery = url.searchParams.get("guestId");
    // --- END NEW ---

    if (session && session.user && session.user.id) {
      userId = session.user.id;
      // --- UPDATED: Check header OR query parameter ---
    } else if (guestIdHeader || guestIdQuery) {
      // Prioritize header, fallback to query parameter
      const effectiveGuestId = guestIdHeader || guestIdQuery;
      isGuest = true;
      console.log(
        `BoM Report API: Guest access attempt with ID: ${effectiveGuestId} (Header: ${
          guestIdHeader ? "Yes" : "No"
        }, Query: ${guestIdQuery ? "Yes" : "No"})`
      );
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
        console.log(
          `BoM Report API: Guest ID mismatch: EffectiveID=${effectiveGuestId}, Project=${project.guestOwnerId}`
        );
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

  const sseStream = new ReadableStream({
    // Renamed variable
    async start(controller) {
      console.log(`BoM SSE stream started for project ${projectId}`);
      sendSseMessage(controller, { status: "Initializing BoM report..." });

      try {
        if (!project) {
          throw new Error("Project data unavailable after authorization.");
        }

        sendSseMessage(controller, { status: "Fetching diagram list..." });
        const diagrams = await Diagram.find({
          project: projectId,
          storagePath: { $exists: true, $ne: null, $ne: "" },
        }).select("fileName storagePath");

        if (diagrams.length === 0) {
          throw new Error("No documents with storage paths found.");
        }

        // --- Prepare Inline Data by Downloading Directly from GCS (Fail Fast) ---
        sendSseMessage(controller, {
          status: `Preparing ${diagrams.length} files from GCS...`,
        });
        const fileParts = [];
        const processedDiagramNames = [];

        for (const diag of diagrams) {
          const gcsPrefix = `gs://${GCS_BUCKET_NAME}/`;
          const objectPath = diag.storagePath.startsWith(gcsPrefix)
            ? diag.storagePath.substring(gcsPrefix.length)
            : diag.storagePath;

          try {
            sendSseMessage(controller, {
              status: `Downloading ${diag.fileName} from GCS...`,
            });
            const [fileBuffer] = await storage
              .bucket(GCS_BUCKET_NAME)
              .file(objectPath)
              .download();
            const base64Data = fileBuffer.toString("base64");
            fileParts.push({
              inlineData: {
                mimeType:
                  mime.lookup(diag.fileName) || "application/octet-stream",
                data: base64Data,
              },
            });
            processedDiagramNames.push(diag.fileName);
            sendSseMessage(controller, {
              status: `Prepared ${diag.fileName}.`,
            });
          } catch (downloadError) {
            console.error(
              `BoM SSE: FATAL ERROR downloading GCS file ${objectPath} (${diag.fileName}):`,
              downloadError.message
            );
            // Fail Fast: Send error via SSE and throw to stop execution
            const userMessage = `Failed to load required file '${diag.fileName}'. Please ensure all project files are accessible and try again.`;
            sendSseMessage(controller, { message: userMessage }, "error");
            throw new Error(userMessage); // Stop the stream processing
          }
        }

        // Check if *any* files were processed (redundant with fail-fast, but safe)
        if (fileParts.length !== diagrams.length) {
          const errMsg = `Mismatch in prepared files. Expected ${diagrams.length}, got ${fileParts.length}.`;
          console.error("BoM SSE:", errMsg);
          sendSseMessage(
            controller,
            { message: "An inconsistency occurred while preparing documents." },
            "error"
          );
          throw new Error(errMsg);
        }
        sendSseMessage(controller, {
          status: `Using ${fileParts.length} downloaded files.`,
        });
        // --- End File Preparation ---

        let ocrText = "";
        // --- Step 1: Perform OCR with Error Handling ---
        try {
          const diagramNamesString = processedDiagramNames.join(", ");
          const ocrPrompt = `Perform OCR on the following document(s): ${diagramNamesString}. Extract all text content accurately. Focus on text relevant to components, materials, dimensions, and quantities.`;
          sendSseMessage(controller, {
            status: "Analyzing key Information...",
          });

          // Use generateContentWithRetry for OCR
          const ocrResult = await generateContentWithRetry(
            gemini,
            {
              contents: [
                { role: "user", parts: [{ text: ocrPrompt }, ...fileParts] },
              ],
              safetySettings: relaxedSafetySettings, // Apply safety settings for OCR
            },
            3, // maxRetries
            (attempt, max) =>
              sendSseMessage(controller, {
                status: `Retrying text extraction (${attempt}/${max})...`,
              }) // onRetry callback
          );
          ocrText = ocrResult.response.text(); // Get text from result

          if (!ocrText)
            throw new Error("OCR process returned empty text after retries."); // Updated error message
          sendSseMessage(controller, { status: "Text extraction complete." });
        } catch (ocrError) {
          console.error("BoM SSE: Error during Gemini OCR call:", ocrError);
          let userFriendlyError =
            "An unexpected error occurred during text extraction (OCR). Please try again.";
          if (ocrError.message && ocrError.message.includes("SAFETY")) {
            userFriendlyError =
              "Text extraction could not be completed due to content safety guidelines.";
          } else if (
            ocrError.message &&
            (ocrError.message.includes("Invalid content") ||
              ocrError.message.includes("unsupported format"))
          ) {
            userFriendlyError =
              "There was an issue processing one or more files for text extraction. Please check the file formats.";
          } else if (
            ocrError.message &&
            ocrError.message.includes("RESOURCE_EXHAUSTED")
          ) {
            userFriendlyError =
              "The analysis service is busy during text extraction. Please try again shortly.";
          }
          sendSseMessage(controller, { message: userFriendlyError }, "error");
          throw ocrError; // Stop processing
        }

        let bomReportHtml = "";
        // --- Step 2: Generate BoM Report as HTML with Error Handling ---
        try {
          // Updated Prompt: Instruct AI to use both OCR text and original files
          const bomPrompt = `Based on the following OCR text extracted from the provided engineering diagram files (Project: ${project.name}), and considering the content of the files themselves, generate a detailed Bill of Materials (BoM) in **HTML format**.

**Instructions for HTML Structure:**
1.  Present the BoM primarily as an HTML table (\`<table>\`) with a clear header row (\`<thead>\` containing \`<th>\` elements) and data rows (\`<tbody>\` containing \`<tr>\` with \`<td>\` elements).
2.  Use appropriate table headers like "Item Name", "Quantity", "Dimensions", "Material", "Specifications/Notes", or similar relevant fields based on the extracted data.
3.  Include other relevant information (like project name, date, etc.) using standard HTML tags like \`<h1>\`, \`<h2>\`, \`<p>\`.
4.  Do **NOT** include any Markdown syntax (like \`**\`, \`#\`, \`-\`, \`|\`) in the final HTML output.
5.  Ensure the entire output is a single, valid HTML document body content (you don't need to include \`<html>\` or \`<head>\` tags yourself, just the content that would go inside \`<body>\`).

**Content Focus:**
*   Identify each distinct component mentioned in the OCR text and visible in the diagrams.
*   Extract quantity, dimensions, material, and other specifications for each component, using both the OCR text and direct analysis of the diagrams if possible.
*   Cross-reference information between the OCR text and the diagrams for accuracy.
*   Be comprehensive and accurate based on *all* provided information (OCR text and diagram files).

**Provided Diagram Files:**
(Content of files is provided separately in the request parts)

**Extracted OCR Text:**
---
${ocrText}
---

Generate the Bill of Materials report in HTML format now, using both the OCR text and the provided diagram files for context.`;

          sendSseMessage(controller, {
            status: "Generating Bill of Materials ...",
          });

          // Use generateContentWithRetry for BoM generation
          const bomResult = await generateContentWithRetry(
            gemini,
            {
              contents: [
                { role: "user", parts: [{ text: bomPrompt }, ...fileParts] },
              ],
              // No special safety settings needed here by default
            },
            3, // maxRetries
            (attempt, max) =>
              sendSseMessage(controller, {
                status: `Retrying BoM generation (${attempt}/${max})...`,
              }) // onRetry callback
          );
          bomReportHtml = bomResult.response.text(); // Get text from result

          if (!bomReportHtml)
            throw new Error(
              "BoM generation process returned empty HTML after retries."
            ); // Updated error message
        } catch (bomError) {
          console.error(
            "BoM SSE: Error during Gemini BoM generation call:",
            bomError
          );
          let userFriendlyError =
            "An unexpected error occurred while generating the Bill of Materials. Please try again.";
          if (bomError.message && bomError.message.includes("SAFETY")) {
            userFriendlyError =
              "Bill of Materials generation could not be completed due to content safety guidelines.";
          } else if (
            bomError.message &&
            bomError.message.includes("RESOURCE_EXHAUSTED")
          ) {
            userFriendlyError =
              "The analysis service is busy during BoM generation. Please try again shortly.";
          }
          sendSseMessage(controller, { message: userFriendlyError }, "error");
          throw bomError; // Stop processing
        }

        // --- Clean up Gemini's Markdown code fences ---
        console.log("Cleaning Gemini HTML output...");
        bomReportHtml = bomReportHtml.trim();
        if (bomReportHtml.startsWith("```html")) {
          bomReportHtml = bomReportHtml.substring(7).trimStart();
        }
        if (bomReportHtml.endsWith("```")) {
          bomReportHtml = bomReportHtml
            .substring(0, bomReportHtml.length - 3)
            .trimEnd();
        }
        console.log("HTML output cleaned.");
        // --- End cleanup ---

        sendSseMessage(controller, { status: "BoM generated." });

        // --- Step 3: Convert HTML to PDF using External API ---
        sendSseMessage(controller, {
          status: "Applying styles and Preparing PDF...",
        }); // Updated status message

        // --- Define CSS Styles for PDF ---
        const pdfStyles = `
          body {
            font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
            line-height: 1.6;
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
              <title>Bill of Materials Report</title>
              <style>${pdfStyles}</style>
          </head>
          <body>
              ${bomReportHtml}
          </body>
          </html>
        `;

        let pdfUrl = null;
        try {
          sendSseMessage(controller, { status: "Generating PDF locally..." });
          pdfUrl = await generatePdfFromHtml(
            fullHtml,
            projectId,
            "bom-report" // Base filename
            // Pass PDF generation options here if needed
          );
          console.log(
            "Local PDF generation and GCS upload successful. PDF URL:",
            pdfUrl
          );
          sendSseMessage(controller, { status: "PDF generation complete." });
        } catch (pdfError) {
          console.error("Error generating or uploading PDF locally:", pdfError);
          throw new Error(`Failed to generate/upload PDF: ${pdfError.message}`);
        }
        // --- End API Call ---

        // --- Step 4: Send Completion Event with Public URL ---
        sendSseMessage(controller, { public_url: pdfUrl }, "complete"); // Use public_url as requested
        console.log(
          `BoM SSE stream complete for project ${projectId}. Sent public URL: ${pdfUrl}`
        );
      } catch (error) {
        console.error(`BoM SSE Error for project ${projectId}:`, error);
        try {
          sendSseMessage(
            controller,
            {
              message:
                error.message ||
                "An internal error occurred during BoM report generation.",
            },
            "error"
          );
        } catch (sseError) {
          console.error(
            "BoM SSE Error: Failed to send error message:",
            sseError
          );
        }
      } finally {
        try {
          controller.close();
          console.log(`BoM SSE stream closed for project ${projectId}`);
        } catch (e) {
          console.error(
            `BoM SSE Error: Failed to close stream for project ${projectId}:`,
            e
          );
        }
      } // Closing brace for finally block
    },
  });

  return new Response(sseStream, {
    // Use renamed variable
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
    },
  });
}
