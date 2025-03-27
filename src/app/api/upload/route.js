import { Storage } from '@google-cloud/storage';
import mongoose from 'mongoose';
import Diagram from '@/models/Diagram';
import { ImageAnnotatorClient } from '@google-cloud/vision'; // Import Cloud Vision API
import { GoogleGenerativeAI } from "@google/generative-ai"; // Import Gemini API
import { NextResponse } from 'next/server'; // Recommended way to send responses in Next.js App Router
import { getServerSession } from "next-auth/next"; // Import getServerSession
import { authOptions } from "@/app/api/auth/[...nextauth]/route"; // Import authOptions
import * as constants from '@/constants';

const {
  MONGODB_URI,
  GOOGLE_CLOUD_PROJECT_ID,
  GCS_BUCKET_NAME,
  GOOGLE_AI_STUDIO_API_KEY,
} = constants;

const projectId = GOOGLE_CLOUD_PROJECT_ID;
const bucketName = GCS_BUCKET_NAME;
const mongodbUri = MONGODB_URI;
const geminiApiKey = GOOGLE_AI_STUDIO_API_KEY;

// Check if Gemini API key is available
if (!geminiApiKey) {
  console.warn("GOOGLE_AI_STUDIO_API_KEY environment variable is not set. Gemini integration will be disabled.");
}

// --- GCS Setup ---
// Initialize GCS client using the service account key (from sa.json)
const storage = new Storage({
  projectId: projectId,
  keyFilename: 'sa.json', // Assuming sa.json is in the root directory (adjust path if needed)
});
const bucket = storage.bucket(bucketName);

// --- Initialize Cloud Vision API client ---
const vision = new ImageAnnotatorClient({
  projectId: projectId,
  keyFilename: 'sa.json', // Assuming sa.json is in the root directory (adjust path if needed)
});

// --- Initialize Gemini Pro model ---
let gemini = null;
if (geminiApiKey) {
  const genAI = new GoogleGenerativeAI(geminiApiKey);
  gemini = genAI.getGenerativeModel({ model: "gemini-pro" });
}

// --- MongoDB Connection ---
async function connectMongoDB() {
  try {
    if (mongoose.connection.readyState !== 1) {
      await mongoose.connect(mongodbUri);
      console.log('Connected to MongoDB');
    }
  } catch (error) {
    console.error('MongoDB connection error:', error);
    throw error; // Re-throw to be caught by the handler
  }
}

// --- API Route Handler ---
export async function POST(request) {
  try {
    await connectMongoDB(); // Ensure MongoDB connection

    const formData = await request.formData();
    const file = formData.get('file');
    const projectId = formData.get('projectId'); // Get projectId from form data

    if (!file) {
      return NextResponse.json({ message: 'No file uploaded' }, { status: 400 });
    }
    if (!projectId) {
      return NextResponse.json({ message: 'Project ID is missing' }, { status: 400 });
    }

    const buffer = Buffer.from(await file.arrayBuffer());
    const fileName = file.name;
    const fileType = fileName.split('.').pop(); // Extract extension
    const fileSize = file.size;

    // --- Upload to GCS ---
    const gcsFileName = `${Date.now()}-${fileName}`; // Unique file name in GCS
    const gcsFile = bucket.file(gcsFileName);

    await gcsFile.save(buffer, {
      metadata: {
        contentType: file.type, // Use the file's declared MIME type
      },
    });

    const storagePath = `gs://${bucketName}/${gcsFileName}`; // Construct GCS path

    // --- Call Cloud Vision API for OCR ---
    let ocrText = null;
    try {
      const [result] = await vision.textDetection(`gs://${bucketName}/${gcsFileName}`);
      // Check if fullTextAnnotation exists before accessing its text property
      if (result.fullTextAnnotation) {
        ocrText = result.fullTextAnnotation.text;
        console.log('OCR text extracted successfully.');
      } else {
        console.log('No text detected by OCR.');
        ocrText = ''; // Assign empty string if no text is detected
      }
    } catch (ocrError) {
      console.error('OCR error:', ocrError);
      // Consider whether to still save the Diagram record even if OCR fails
    }

    // --- Call Gemini API for analysis ---
    let geminiResponse = null;
    if (gemini && ocrText) {
      try {
        const prompt = `You are a civil engineering AI assistant. Analyze the following text extracted from a bridge diagram and extract key information:\n\n${ocrText}\n\nProvide a summary of the diagram, including key components, materials, and dimensions.`;

        const result = await gemini.generateContent(prompt);
        const response = await result.response;
        geminiResponse = response.candidates[0].content.parts[0].text;
        console.log('Gemini response:', geminiResponse);
      } catch (geminiError) {
        console.error('Gemini API error:', geminiError);
        // Consider whether to still save the Diagram record even if Gemini fails
      }
    } else {
      console.warn("Gemini API key not set or OCR text is missing. Skipping Gemini analysis.");
    }

    // --- Extract BoM/BoQ data (Placeholder - improve with NLP) ---
    let billOfMaterials = null;
    if (ocrText) {
      try {
        // Simple regex-based extraction (example)
        const quantityRegex = /(\d+)\s+(.*?)(?=\n|$)/gmi; // Matches quantity and item name
        let match;
        const items = [];

        while ((match = quantityRegex.exec(ocrText)) !== null) {
          const quantity = parseInt(match[1]);
          const itemName = match[2].trim();
          items.push({ item_name: itemName, quantity: quantity });
        }

        billOfMaterials = items;
        console.log('Extracted BoM:', billOfMaterials);

      } catch (bomError) {
        console.error('BoM extraction error:', bomError);
      }
    } else {
      console.warn("OCR text is missing. Skipping BoM extraction.");
    }

    // --- Load Compliance Rules (Placeholder - IBC for now) ---
    let complianceResults = null;
    try {
      const ibcRules = require('@/data/ibc_rules.json'); // Load IBC rules
      complianceResults = [];

      if (billOfMaterials) {
        for (const item of billOfMaterials) {
          const matchingRules = ibcRules.filter(rule => rule.component_type === item.item_name);

          if (matchingRules.length > 0) {
            for (const rule of matchingRules) {
              // Basic rule checking (improve with more sophisticated logic)
              let isCompliant = false;
              if (rule.property === 'material' && item.item_name === rule.component_type) {
                isCompliant = (item.item_name === rule.rule);
              }

              complianceResults.push({
                item_name: item.item_name,
                standard: rule.standard,
                compliant: isCompliant,
                recommendation: rule.recommendation,
              });
            }
          }
        }
      }

      console.log('Compliance Results:', complianceResults);

    } catch (complianceError) {
      console.error('Compliance check error:', complianceError);
    }

    // --- Get User Session ---
    const session = await getServerSession(authOptions);
    console.log("Session in /api/upload:", JSON.stringify(session, null, 2)); // Log the session object
    if (!session || !session.user || !session.user.id) { // Check specifically for session.user.id
      console.error("Unauthorized or user ID missing in session:", session);
      return NextResponse.json({ message: 'Unauthorized' }, { status: 401 });
    }
    const userId = session.user.id;

    // --- Create Diagram record in MongoDB ---
    const newDiagram = new Diagram({
      fileName: fileName,
      storagePath: storagePath,
      fileType: fileType,
      fileSize: fileSize,
      ocrText: ocrText, // Save OCR text
      extractedData: geminiResponse, // Save Gemini response
      billOfMaterials: billOfMaterials, // Save BoM data
      complianceResults: complianceResults,
      project: projectId, // Use the projectId from form data
      uploadedBy: userId, // Add the user ID
      // Other fields will default to their schema values
    });

    await newDiagram.save();

    console.log(`File ${fileName} uploaded to GCS and saved to MongoDB`);

    return NextResponse.json({ message: 'File uploaded successfully', diagramId: newDiagram._id }, { status: 200 });

  } catch (error) {
    console.error('File upload error:', error);
    // Enhanced error logging (include stack trace if available)
    const errorMessage = error.message || 'File upload failed';
    const errorDetails = error.stack || error; // Include stack trace if available

    // Log the detailed error to a file or external service in a production environment
    // Example: logger.error('File upload error', { error: errorDetails });

    return NextResponse.json({ message: errorMessage, error: errorDetails }, { status: 500 });
  }
}

// --- Configure API route to disable body parsing ---
export const config = {
  api: {
    bodyParser: false, // Let FormData handle the parsing
  },
};

// --- Reminder about Environment Variables ---
// 1. Create a .env.local file in the root directory
// 2. Add the following variables (replace with your actual values):
//    MONGODB_URI=your_mongodb_connection_string
//    GOOGLE_CLOUD_PROJECT_ID=your_gcp_project_id
//    GCS_BUCKET_NAME=your_gcs_bucket_name
// 3. Ensure the sa.json file (service account key) is in the root directory or adjust the path in the code.
