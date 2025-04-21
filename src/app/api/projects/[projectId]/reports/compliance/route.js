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
import fs from "fs/promises"; // Keep fs for reading rules files
import mime from "mime-types";
import mongoose from "mongoose";
import { getServerSession } from "next-auth/next";
import path from "path";

// Assuming rules files are correctly placed relative to the project root
const ibcRulesPath = path.join(process.cwd(), "src", "data", "ibc_rules.json");
const eurocodesRulesPath = path.join(
  process.cwd(),
  "src",
  "data",
  "eurocodes_rules.json"
);
const isRulesPath = path.join(process.cwd(), "src", "data", "is_rules.json");

const { GOOGLE_AI_STUDIO_API_KEY, GCS_BUCKET_NAME, GOOGLE_CLOUD_PROJECT_ID } =
  constants;
// Define the new API endpoint
const HTML_TO_PDF_API_URL = "https://html-text-to-pdf.shothik.ai/convert";

// --- Initialize Gemini Model ---
let gemini = null;
if (GOOGLE_AI_STUDIO_API_KEY) {
  try {
    const genAI = new GoogleGenerativeAI(GOOGLE_AI_STUDIO_API_KEY);
    gemini = genAI.getGenerativeModel({ model: "gemini-2.0-flash" }); // Or a more powerful model
    console.log("Gemini model initialized for Compliance reports.");
  } catch (e) {
    console.error(
      "Failed to initialize Gemini components for Compliance reports:",
      e
    );
  }
} else {
  console.warn(
    "GOOGLE_AI_STUDIO_API_KEY not set. Compliance report functionality will be disabled."
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
      `Compliance API: GCS Storage client initialized using keyfile ${keyFilePath} for bucket: ${GCS_BUCKET_NAME}`
    );
  } catch (e) {
    console.error(
      "Compliance API: Failed to initialize GCS Storage client:",
      e
    );
  }
} else {
  console.warn(
    "Compliance API: GCS_BUCKET_NAME or GOOGLE_CLOUD_PROJECT_ID not set. GCS functionality will be disabled."
  );
}

// Define relaxed safety settings
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
  if (eventName !== "message")
    controller.enqueue(encoder.encode(`event: ${eventName}\n`));
  controller.enqueue(encoder.encode(`data: ${JSON.stringify(data)}\n\n`));
}

// Function to load compliance rules
async function loadComplianceRules() {
  try {
    const [ibcData, euroData, isData] = await Promise.all([
      fs.readFile(ibcRulesPath, "utf-8"),
      fs.readFile(eurocodesRulesPath, "utf-8"),
      fs.readFile(isRulesPath, "utf-8"),
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

  if (!projectId || !mongoose.Types.ObjectId.isValid(projectId))
    return new Response("Invalid Project ID", { status: 400 });
  if (!gemini)
    return new Response("Backend not ready (Gemini)", { status: 503 });
  if (!storage || !GCS_BUCKET_NAME)
    return new Response("Backend not ready (GCS config missing)", {
      status: 503,
    });
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
        `Compliance Report API: Guest access attempt with ID: ${effectiveGuestId} (Header: ${
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
          `Compliance Report API: Guest ID mismatch: EffectiveID=${effectiveGuestId}, Project=${project.guestOwnerId}`
        );
        return new Response("Forbidden (Guest Access Denied)", { status: 403 });
      }
    } else {
      return new Response("Unauthorized", { status: 401 });
    }
    // Authorization passed
  } catch (authOrDbError) {
    console.error("Compliance SSE Auth/DB Error:", authOrDbError);
    return new Response("Error processing request", { status: 500 });
  }
  // --- End Authorization Check ---

  const stream = new ReadableStream({
    async start(controller) {
      console.log(`Compliance SSE stream started for project ${projectId}`);
      sendSseMessage(controller, {
        status: "Initializing compliance report...",
      });

      try {
        if (!project) {
          throw new Error("Project data unavailable after authorization.");
        }

        sendSseMessage(controller, { status: "Fetching diagram list..." });
        const diagrams = await Diagram.find({
          project: projectId,
          storagePath: { $exists: true, $ne: null, $ne: "" },
        }).select("fileName storagePath");
        if (diagrams.length === 0) throw new Error("No documents found.");

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
            // --- Explicit MIME Type Check ---
            let detectedMimeType;
            const lowerFileName = diag.fileName.toLowerCase();
            if (lowerFileName.endsWith(".pdf")) {
              detectedMimeType = "application/pdf";
            } else if (lowerFileName.endsWith(".png")) {
              detectedMimeType = "image/png";
            } else if (
              lowerFileName.endsWith(".jpg") ||
              lowerFileName.endsWith(".jpeg")
            ) {
              detectedMimeType = "image/jpeg";
            } else {
              // Fallback to mime.lookup and then generic stream
              detectedMimeType =
                mime.lookup(diag.fileName) || "application/octet-stream";
            }
            // --- End Explicit Check ---
            console.log(
              `Compliance API - File: ${diag.fileName}, Detected MIME Type: ${detectedMimeType}`
            ); // Log filename and MIME type
            fileParts.push({
              inlineData: { mimeType: detectedMimeType, data: base64Data },
            });
            processedDiagramNames.push(diag.fileName);
            sendSseMessage(controller, {
              status: `Prepared ${diag.fileName}.`,
            });
          } catch (downloadError) {
            console.error(
              `Compliance SSE: FATAL ERROR downloading GCS file ${objectPath} (${diag.fileName}):`,
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
          console.error("Compliance SSE:", errMsg);
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

        // Declare variables needed across steps
        let ocrText = "";
        let complianceReportHtml = "";

        // --- Step 1 & 3 Combined Try Block for Gemini Calls ---
        try {
          // --- Step 1: Perform OCR ---
          const diagramNamesString = processedDiagramNames.join(", ");
          const ocrPrompt = `Perform OCR on the following document(s): ${diagramNamesString}. Extract text relevant to components, materials, dimensions, specifications, and safety notes.`;
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

          // --- Step 2: Load Compliance Rules ---
          sendSseMessage(controller, { status: "Loading compliance rules..." });
          const complianceRulesText = await loadComplianceRules();
          if (complianceRulesText.startsWith("Error:"))
            throw new Error(complianceRulesText); // Propagate rule loading error

          // --- Step 3: Generate Compliance Report as HTML ---
          // Updated Prompt: Instruct AI to use both OCR text and original files
          const compliancePrompt = `Analyze the following OCR text extracted from the provided engineering diagram files (Project: ${project.name}), and considering the content of the files themselves, against the provided compliance rules (IBC, Eurocodes, IS) and generate a Compliance Report in **HTML format**.

**Instructions for HTML Structure:**
1.  Use standard HTML tags: \`<h1>\`, \`<h2>\`, \`<h3>\` for headings, \`<p>\` for paragraphs, \`<ul>\`/\`<ol>\`/\`<li>\` for lists.
2.  **Crucially, represent compliance checks and results using proper HTML tables:** \`<table>\`, \`<thead>\`, \`<tbody>\`, \`<tr>\`, \`<th>\`, \`<td>\`. Use headers like "Rule/Standard", "Component/Specification", "Status (Compliant/Non-Compliant/Undetermined)", "Reason/Notes".
3.  Do **NOT** include any Markdown syntax (like \`**\`, \`#\`, \`-\`, \`|\`) in the final HTML output.
4.  Structure the report logically with clear sections (e.g., Introduction, Compliance Summary Table, Detailed Findings per Standard). Use appropriate heading levels (\`<h1>\`, \`<h2>\`, etc.).
5.  Ensure the entire output is a single, valid HTML document body content (you don't need to include \`<html>\` or \`<head>\` tags yourself, just the content that would go inside \`<body>\`).

**Content Focus:**
*   Identify components and specifications from the OCR text and diagrams relevant to the rules.
*   Compare these against the provided rules, using both OCR text and diagram content for context.
*   For each relevant rule/component, state the compliance status (Compliant, Non-Compliant, Undetermined).
*   Provide specific reasons for the status, citing the rule/standard and referencing details from the OCR text or diagrams where possible.
*   Be comprehensive based on *all* provided information (OCR text, diagram files, and rules).

**Provided Diagram Files:**
(Content of files is provided separately in the request parts)

**Compliance Rules:**
---
${complianceRulesText}
---

**Extracted OCR Text:**
---
${ocrText}
---

Generate the Compliance Report in HTML format now, using the OCR text, the provided diagram files, and the compliance rules for context.`;

          sendSseMessage(controller, { status: "Analyzing compliance..." });

          // Use generateContentWithRetry for Compliance analysis
          const complianceResult = await generateContentWithRetry(
            gemini,
            {
              contents: [
                {
                  role: "user",
                  parts: [{ text: compliancePrompt }, ...fileParts],
                },
              ],
              // No special safety settings needed here by default
            },
            3, // maxRetries
            (attempt, max) =>
              sendSseMessage(controller, {
                status: `Retrying compliance analysis (${attempt}/${max})...`,
              }) // onRetry callback
          );
          complianceReportHtml = complianceResult.response.text(); // Get text from result

          if (!complianceReportHtml)
            throw new Error("Compliance analysis failed after retries."); // Updated error message
          sendSseMessage(controller, {
            status: "Compliance analysis complete.",
          });
        } catch (geminiError) {
          // Catch errors from either OCR or Compliance generation
          console.error(
            "Compliance SSE: Error during Gemini processing (OCR or Compliance):",
            geminiError
          );
          let userFriendlyError =
            "An unexpected error occurred during analysis. Please try again.";
          // Determine if it was OCR or Compliance step if possible (less critical now)
          if (geminiError.message && geminiError.message.includes("SAFETY")) {
            userFriendlyError =
              "Analysis could not be completed due to content safety guidelines.";
          } else if (
            geminiError.message &&
            (geminiError.message.includes("Invalid content") ||
              geminiError.message.includes("unsupported format"))
          ) {
            userFriendlyError =
              "There was an issue processing one or more files for analysis. Please check the file formats.";
          } else if (
            geminiError.message &&
            geminiError.message.includes("RESOURCE_EXHAUSTED")
          ) {
            userFriendlyError =
              "The analysis service is busy. Please try again shortly.";
          } else if (
            geminiError.message === "OCR process returned empty text."
          ) {
            userFriendlyError =
              "Failed to extract text from the documents (OCR). Please check the files.";
          } else if (geminiError.message === "Compliance analysis failed.") {
            userFriendlyError =
              "Failed to generate the compliance analysis based on the extracted text.";
          }
          sendSseMessage(controller, { message: userFriendlyError }, "error");
          throw geminiError; // Re-throw to be caught by the main try...catch...finally
        }

        // --- Clean up Gemini's Markdown code fences (applied to complianceReportHtml) ---
        console.log("Cleaning Gemini HTML output...");
        complianceReportHtml = complianceReportHtml.trim();
        if (complianceReportHtml.startsWith("```html")) {
          complianceReportHtml = complianceReportHtml.substring(7).trimStart();
        }
        if (complianceReportHtml.endsWith("```")) {
          complianceReportHtml = complianceReportHtml
            .substring(0, complianceReportHtml.length - 3)
            .trimEnd();
        }
        console.log("HTML output cleaned.");
        // --- End cleanup ---

        sendSseMessage(controller, { status: "Compliance analysis complete." });

        // --- Step 4: Convert HTML to PDF using External API ---
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
              <title>Compliance Report</title>
              <style>${pdfStyles}</style>
          </head>
          <body>
              ${complianceReportHtml}
          </body>
          </html>
        `;

        let pdfUrl = null;
        try {
          sendSseMessage(controller, { status: "Generating PDF locally..." });
          pdfUrl = await generatePdfFromHtml(
            fullHtml,
            projectId,
            "compliance-report" // Base filename
            // Pass PDF generation options here if needed, e.g., { format: 'Letter' }
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

        // --- Step 5: Send Completion Event with Public URL ---
        sendSseMessage(controller, { public_url: pdfUrl }, "complete"); // Use public_url as requested
        console.log(
          `Compliance SSE stream complete for project ${projectId}. Sent public URL: ${pdfUrl}`
        );
      } catch (error) {
        // This is the main catch block for the stream start
        console.error(`Compliance SSE Error for project ${projectId}:`, error);
        // Use the user-friendly message if it was generated by our specific handlers, otherwise use a generic one
        const finalErrorMessage =
          error.message.startsWith("Failed to load required file") ||
          error.message.includes("analysis service") ||
          error.message.includes("content safety") ||
          error.message.includes("processing one or more files")
            ? error.message
            : "An internal error occurred during compliance report generation.";
        try {
          sendSseMessage(controller, { message: finalErrorMessage }, "error");
        } catch (sseError) {
          console.error(
            "Compliance SSE Error: Failed to send error message:",
            sseError
          );
        }
      } finally {
        try {
          controller.close();
          console.log(`Compliance SSE stream closed for project ${projectId}`);
        } catch (e) {
          console.error(`Compliance SSE Error: Failed to close stream:`, e);
        }
      }
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
    },
  });
}
