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
import { generateContentWithRetry } from '@/lib/geminiUtils';
import { prepareDiagramInBackground } from '@/lib/backgroundTasks'; // Import the background task trigger

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
    gemini = genAI.getGenerativeModel({ model: "gemini-2.5-flash-preview-04-17" });
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
        // Use generateContentWithRetry for the summary
        const result = await generateContentWithRetry(
            gemini,
            prompt, // Simple text prompt
            3, // maxRetries
            (attempt, max) => console.log(`Retrying Gemini summary (${attempt}/${max})...`) // Simple log on retry
        );
        const response = result.response; // Result is already awaited
        geminiResponse = response.text(); // Use text() method
        console.log('Gemini initial summary generated.');
      } catch (geminiError) {
        console.error('Gemini summary error:', geminiError);
      }
    } else {
  console.warn("Skipping synchronous Gemini initial summary.");
    }

    // --- REMOVED Synchronous BoM/Compliance Extraction ---
    // These will be handled by the background task


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
      storagePath: storagePath,
      // geminiFileUri, ocrText, extractedData, billOfMaterials, complianceResults will be added by background task
      fileType: fileType,
      fileSize: fileSize,
      project: projectId,
      uploadedBy: userId, // Will be null for guest uploads
      processingStatus: 'PENDING', // Set initial status to PENDING
    };

    // Add guestUploaderId if it's a guest upload
    if (guestId) {
      diagramData.guestUploaderId = guestId;
    }

    const newDiagram = new Diagram(diagramData);

    await newDiagram.save();

    // Add diagram reference to the Project document
    await Project.findByIdAndUpdate(projectId, { $push: { diagrams: newDiagram._id } });

    console.log(`File ${fileName} saved to DB for project ${projectId} with status PENDING.`);

    // --- Trigger background preparation task (DO NOT await this) ---
    prepareDiagramInBackground(newDiagram._id.toString())
      .then(() => console.log(`Background preparation initiated for diagram ${newDiagram._id}`))
      .catch(err => console.error(`Failed to initiate background preparation for diagram ${newDiagram._id}:`, err));
    // --- End trigger ---

    // Return immediately after saving and triggering
    return NextResponse.json({ message: 'File upload accepted, processing started.', diagramId: newDiagram._id }, { status: 202 }); // Use 202 Accepted status

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
