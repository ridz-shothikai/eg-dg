import * as constants from "@/constants"; // Assuming constants are accessible like this
import { Storage } from "@google-cloud/storage";
import html_to_pdf from "html-pdf-node";
import path from "path";

const { GCS_BUCKET_NAME, GOOGLE_CLOUD_PROJECT_ID } = constants;

// --- Initialize GCS Storage ---
let storage = null;
if (GOOGLE_CLOUD_PROJECT_ID && GCS_BUCKET_NAME) {
  try {
    const { GOOGLE_CLOUD_KEYFILE } = constants;
    const storageOptions = { projectId: GOOGLE_CLOUD_PROJECT_ID };
    if (GOOGLE_CLOUD_KEYFILE) {
      storageOptions.keyFilename = GOOGLE_CLOUD_KEYFILE;
      console.log(`generatePdfFromHtml: GCS Storage client initialized using keyfile ${GOOGLE_CLOUD_KEYFILE} for bucket: ${GCS_BUCKET_NAME}`);
    } else {
      console.log(`generatePdfFromHtml: GCS Storage client initialized using default credentials (ADC) for bucket: ${GCS_BUCKET_NAME}`);
    }
    storage = new Storage(storageOptions);
  } catch (e) {
    console.error("generatePdfFromHtml: Failed to initialize GCS Storage client:", e);
  }
} else {
  console.warn("generatePdfFromHtml: GCS_BUCKET_NAME or GOOGLE_CLOUD_PROJECT_ID not set. GCS upload will fail.");
}

/**
 * Generates a PDF from HTML, uploads it to GCS, and returns the public URL.
 * @param {string} htmlContent The HTML string to convert.
 * @param {string} projectId The ID of the project for organizing the upload path.
 * @param {string} baseFileName A base name for the PDF file (e.g., 'compliance-report').
 * @param {object} options Optional configuration for html-pdf-node.
 * @returns {Promise<string>} A promise that resolves with the public GCS URL of the PDF.
 */
export const generatePdfFromHtml = async (
  htmlContent,
  projectId,
  baseFileName,
  options = {}
) => {
  if (!storage) {
    throw new Error("GCS Storage client not initialized. Cannot upload PDF.");
  }
  if (!projectId || !baseFileName) {
    throw new Error("projectId and baseFileName are required for PDF upload.");
  }

  // Define default options including margins
  const defaultOptions = {
    format: "A4",
    margin: {
      top: "20mm",
      right: "20mm",
      bottom: "20mm",
      left: "20mm",
    },
    ...options, // Allow overriding defaults with passed options
  };

  const file = { content: htmlContent };
  let pdfBuffer;

  // 1. Generate PDF Buffer
  try {
    console.log(`Generating PDF buffer for ${baseFileName}...`);
    pdfBuffer = await html_to_pdf.generatePdf(file, defaultOptions);
    console.log(`PDF buffer generated successfully.`);
  } catch (error) {
    console.error("Error generating PDF buffer:", error);
    throw new Error("Failed to generate PDF buffer from HTML content.");
  }

  // 2. Upload PDF Buffer to GCS
  const timestamp = Date.now();
  const gcsFileName = `reports/${projectId}/${baseFileName}-${timestamp}.pdf`;
  const gcsFile = storage.bucket(GCS_BUCKET_NAME).file(gcsFileName);

  try {
    console.log(
      `Uploading PDF to GCS at gs://${GCS_BUCKET_NAME}/${gcsFileName}...`
    );
    await gcsFile.save(pdfBuffer, {
      metadata: {
        contentType: "application/pdf",
        // Add any other metadata if needed
      },
      resumable: false, // Use simple upload for smaller files like PDFs
    });
    console.log(`PDF uploaded successfully.`);

    // 3. Make the file public
    console.log(`Making GCS file public...`);
    await gcsFile.makePublic();
    console.log(`GCS file made public.`);

    // 4. Return the public URL
    const publicUrl = gcsFile.publicUrl();
    console.log(`Public URL: ${publicUrl}`);
    return publicUrl;
  } catch (error) {
    console.error(`Error uploading PDF to GCS or making it public:`, error);
    throw new Error(`Failed to upload PDF to GCS: ${error.message}`);
  }
};
