import { Storage } from '@google-cloud/storage';
import mongoose from 'mongoose';
import Diagram from '@/models/Diagram';
import Project from '@/models/Project'; // Import Project model
import { ImageAnnotatorClient } from '@google-cloud/vision';
import { GoogleGenerativeAI } from "@google/generative-ai";
import { NextResponse } from 'next/server';
import { getServerSession } from "next-auth/next";
import { authOptions } from "@/app/api/auth/[...nextauth]/route";
import fs from 'fs/promises'; // Import fs promises
import path from 'path'; // Import path
import * as constants from '@/constants';

const {
  MONGODB_URI,
  GOOGLE_CLOUD_PROJECT_ID,
  GCS_BUCKET_NAME,
  GOOGLE_AI_STUDIO_API_KEY,
} = constants;

const gcpProjectId = GOOGLE_CLOUD_PROJECT_ID; // Renamed to avoid conflict
const bucketName = GCS_BUCKET_NAME;
const mongodbUri = MONGODB_URI;
const geminiApiKey = GOOGLE_AI_STUDIO_API_KEY;

// Check if Gemini API key is available
if (!geminiApiKey) {
  console.warn("GOOGLE_AI_STUDIO_API_KEY environment variable is not set. Gemini integration will be disabled.");
}

// --- GCS Setup ---
const storage = new Storage({
  projectId: gcpProjectId,
  keyFilename: 'sa.json',
});
const bucket = storage.bucket(bucketName);

// --- Initialize Cloud Vision API client ---
const vision = new ImageAnnotatorClient({
  projectId: gcpProjectId,
  keyFilename: 'sa.json',
});

// --- Initialize Gemini Pro model (for initial summary) ---
let gemini = null;
if (geminiApiKey) {
  try {
    const genAI = new GoogleGenerativeAI(geminiApiKey);
    gemini = genAI.getGenerativeModel({ model: "gemini-pro" });
  } catch (e) {
    console.error("Failed to initialize Gemini model for summary:", e);
  }
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
    throw error;
  }
}

// --- API Route Handler ---
export async function POST(request) {
  try {
    await connectMongoDB();

    const formData = await request.formData();
    const file = formData.get('file');
    const projectId = formData.get('projectId'); // Get projectId from form data

    if (!file) {
      return NextResponse.json({ message: 'No file uploaded' }, { status: 400 });
    }
    if (!projectId || !mongoose.Types.ObjectId.isValid(projectId)) { // Validate projectId
      return NextResponse.json({ message: 'Project ID is missing or invalid' }, { status: 400 });
    }

    const buffer = Buffer.from(await file.arrayBuffer());
    const fileName = file.name;
    const fileType = fileName.split('.').pop();
    const fileSize = file.size;

    // --- Upload to GCS ---
    const gcsFileName = `${Date.now()}-${fileName}`;
    const gcsFile = bucket.file(gcsFileName);

    await gcsFile.save(buffer, {
      metadata: { contentType: file.type },
    });
    console.log(`File ${fileName} uploaded to GCS as ${gcsFileName}`);
    const storagePath = `gs://${bucketName}/${gcsFileName}`;

    // --- Save copy to local /tmp directory (Vercel writable) ---
    const projectTempDir = '/tmp'; // Use Vercel's writable directory
    await fs.mkdir(projectTempDir, { recursive: true }); // Ensure /tmp exists (usually does, but safe)
    // Use the GCS filename for consistency in the temp dir
    const tempFilePath = path.join(projectTempDir, gcsFileName);
    try {
        await fs.writeFile(tempFilePath, buffer);
        console.log(`File copy saved locally to ${tempFilePath}`);
    } catch (tempSaveError) {
        console.error(`Failed to save file copy to temp directory ${tempFilePath}:`, tempSaveError);
        // Decide if this is a critical error or just a warning
        // For now, log a warning and continue
        console.warn(`Continuing upload process despite failure to save local temp copy.`);
    }
    // --- End save copy ---


    // --- Call Cloud Vision API for OCR ---
    let ocrText = null;
    try {
      // Use GCS path for Vision API
      const [result] = await vision.textDetection(storagePath);
      if (result.fullTextAnnotation) {
        ocrText = result.fullTextAnnotation.text;
        console.log('OCR text extracted successfully.');
      } else {
        console.log('No text detected by OCR.');
        ocrText = '';
      }
    } catch (ocrError) {
      console.error('OCR error:', ocrError);
      // Continue even if OCR fails, just won't have text
    }

    // --- Call Gemini API for initial analysis/summary (Optional) ---
    let geminiResponse = null;
    if (gemini && ocrText) {
      try {
        const prompt = `Summarize the key components, materials, and dimensions mentioned in this OCR text from an engineering diagram:\n\n${ocrText}`;
        const result = await gemini.generateContent(prompt);
        const response = await result.response;
        geminiResponse = response.text(); // Use text() method
        console.log('Gemini initial summary generated.');
      } catch (geminiError) {
        console.error('Gemini summary error:', geminiError);
      }
    } else {
      console.warn("Skipping Gemini initial summary (API key missing or no OCR text).");
    }

    // --- Extract BoM/BoQ data (Placeholder) ---
    let billOfMaterials = null;
    if (ocrText) {
       try {
        const quantityRegex = /(\d+)\s+(.*?)(?=\n|$)/gmi;
        let match;
        const items = [];
        while ((match = quantityRegex.exec(ocrText)) !== null) {
          items.push({ item_name: match[2].trim(), quantity: parseInt(match[1]) });
        }
        billOfMaterials = items;
        console.log('Extracted BoM:', billOfMaterials);
      } catch (bomError) {
        console.error('BoM extraction error:', bomError);
      }
    } else {
      console.warn("OCR text is missing. Skipping BoM extraction.");
    }


    // --- Load Compliance Rules (Placeholder) ---
    let complianceResults = null;
     try {
      const ibcRules = require('@/data/ibc_rules.json');
      complianceResults = [];
      if (billOfMaterials) {
         for (const item of billOfMaterials) {
          const matchingRules = ibcRules.filter(rule => rule.component_type === item.item_name);
          if (matchingRules.length > 0) {
            for (const rule of matchingRules) {
              let isCompliant = false; // Basic check
              complianceResults.push({ item_name: item.item_name, standard: rule.standard, compliant: isCompliant, recommendation: rule.recommendation });
            }
          }
        }
      }
      console.log('Compliance Results:', complianceResults);
    } catch (complianceError) {
      console.error('Compliance check error:', complianceError);
    }


    // --- Get User Session (if available) ---
    let userId = null;
    const session = await getServerSession(authOptions);
    if (session && session.user && session.user.id) {
      userId = session.user.id; // Set userId if session exists
    }

     // --- Verify Project Exists and Ownership/Guest Status ---
     const project = await Project.findById(projectId);
     if (!project) {
       // Clean up GCS file if project is invalid? Maybe not for now.
       return NextResponse.json({ message: 'Project not found' }, { status: 404 });
     }

     // Check ownership based on whether a user is logged in
     let guestId = null; // To store guestId if applicable
     if (userId) {
       // Logged-in user: Check if they own the project
       if (!project.owner || project.owner.toString() !== userId) {
         return NextResponse.json({ message: 'Forbidden: You do not own this project' }, { status: 403 });
       }
     } else {
       // Guest user: Check if the project is a guest project (has guestOwnerId)
       if (!project.guestOwnerId) {
         // If owner is also null, it's an orphaned project - potentially block?
         // For now, treat as forbidden if it's not explicitly a guest project
         return NextResponse.json({ message: 'Forbidden: Project owner information missing' }, { status: 403 });
       }
       // Store the guestId for saving to the diagram
       guestId = project.guestOwnerId;
     }
     // If checks pass, proceed.

    // --- Create Diagram record in MongoDB ---
    const diagramData = {
      fileName: fileName,
      storagePath: storagePath, // Store GCS path
      // geminiFileUri will be added later by the prepare endpoint
      fileType: fileType,
      fileSize: fileSize,
      ocrText: ocrText,
      extractedData: geminiResponse, // Store initial summary
      billOfMaterials: billOfMaterials,
      complianceResults: complianceResults,
      project: projectId,
      uploadedBy: userId, // Will be null for guest uploads
      processingStatus: 'Uploaded', // Initial status
    };

    // Add guestUploaderId if it's a guest upload
    if (guestId) {
      diagramData.guestUploaderId = guestId;
    }

    const newDiagram = new Diagram(diagramData);

    await newDiagram.save();

    // Add diagram reference to the Project document
    await Project.findByIdAndUpdate(projectId, { $push: { diagrams: newDiagram._id } });

    console.log(`File ${fileName} saved to DB for project ${projectId}`);

    return NextResponse.json({ message: 'File uploaded successfully', diagramId: newDiagram._id }, { status: 200 });

  } catch (error) {
    console.error('File upload error:', error);
    const errorMessage = error.message || 'File upload failed';
    const errorDetails = error.stack || error;
    return NextResponse.json({ message: errorMessage, error: errorDetails }, { status: 500 });
  }
}

// --- Configure API route to disable body parsing ---
export const config = {
  api: {
    bodyParser: false,
  },
};
