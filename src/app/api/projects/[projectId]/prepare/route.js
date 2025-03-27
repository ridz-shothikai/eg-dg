import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth/next';
import { authOptions } from '@/app/api/auth/[...nextauth]/route';
import connectMongoDB from '@/lib/db';
import Project from '@/models/Project';
import Diagram from '@/models/Diagram';
import mongoose from 'mongoose';
import { Storage } from '@google-cloud/storage';
import { GoogleAIFileManager } from "@google/generative-ai/server";
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import mime from 'mime-types';
import * as constants from '@/constants';

const {
  MONGODB_URI,
  GOOGLE_CLOUD_PROJECT_ID,
  GCS_BUCKET_NAME,
  GOOGLE_AI_STUDIO_API_KEY,
} = constants;

const gcpProjectId = GOOGLE_CLOUD_PROJECT_ID;
const bucketName = GCS_BUCKET_NAME;
const geminiApiKey = GOOGLE_AI_STUDIO_API_KEY;

// --- Initialize GCS ---
const storage = new Storage({ projectId: gcpProjectId, keyFilename: 'sa.json' });
const bucket = storage.bucket(bucketName);

// --- Initialize Gemini File Manager ---
let fileManager = null;
if (geminiApiKey) {
  try {
    fileManager = new GoogleAIFileManager(geminiApiKey);
    console.log("Gemini File Manager initialized for prepare endpoint.");
  } catch(e) {
     console.error("Failed to initialize Gemini File Manager for prepare endpoint:", e);
  }
}

// --- Helper: Download from GCS ---
async function downloadFromGCS(gcsPath, destination) {
    const fileName = gcsPath.split('/').pop(); // Extract filename from gs://bucket/filename
    if (!fileName) throw new Error(`Invalid GCS path: ${gcsPath}`);

    console.log(`Downloading ${fileName} from GCS to ${destination}...`);
    await bucket.file(fileName).download({ destination });
    console.log(`Downloaded ${fileName} successfully.`);
}

// --- Helper: Upload to Gemini ---
async function uploadToGemini(filePath, displayName) {
    if (!fileManager) {
        console.warn("Gemini File Manager not available, skipping upload.");
        return null;
    }
    const mimeType = mime.lookup(filePath) || 'application/octet-stream';
    console.log(`Uploading ${displayName} (${mimeType}) to Gemini...`);
    const uploadResult = await fileManager.uploadFile(filePath, { mimeType, displayName });
    console.log(`Uploaded ${displayName} to Gemini as: ${uploadResult.file.name}`);
    return uploadResult.file; // Return the file object
}

// --- Helper: Wait for Gemini Files Active ---
async function waitForFilesActive(files) {
  if (!fileManager) return; // Skip if no file manager
  console.log("Waiting for Gemini file processing...");
  for (const file of files) {
    if (!file || !file.name) continue; // Skip if file object is invalid
    let currentFileState = file.state;
    while (currentFileState === "PROCESSING") {
      process.stdout.write(".");
      await new Promise((resolve) => setTimeout(resolve, 5000)); // Poll every 5 seconds
      try {
        const updatedFile = await fileManager.getFile(file.name);
        currentFileState = updatedFile.state;
      } catch (error) {
         console.error(`Error fetching file state for ${file.name}:`, error);
         // Decide how to handle: maybe throw, maybe mark as failed
         currentFileState = "FAILED"; // Assume failure on error
      }
    }
    if (currentFileState !== "ACTIVE") {
      console.warn(`File ${file.name} failed to process or has state ${currentFileState}.`);
      // Optionally update DB status here
    }
  }
  console.log("...file processing check complete.\n");
}


import { URL } from 'url'; // Import URL for parsing

// GET handler to prepare project data (download, upload to Gemini, get history)
export async function GET(request, context) { // Keep context for potential future use, but extract from URL
  // Workaround: Extract projectId from URL
  const url = new URL(request.url);
  const pathSegments = url.pathname.split('/');
  // Assuming URL is like /api/projects/[projectId]/prepare
  const projectId = pathSegments[pathSegments.length - 2];

  if (!projectId || !mongoose.Types.ObjectId.isValid(projectId)) {
    return NextResponse.json({ message: 'Invalid Project ID from URL' }, { status: 400 });
  }

  const tempProjectDir = path.join(os.tmpdir(), `doclyze_project_${projectId}`);
  let projectData = null;
  let diagramsData = [];
  let updatedDiagrams = []; // To track diagrams needing DB update

  try {
    const session = await getServerSession(authOptions);
    if (!session || !session.user || !session.user.id) {
      return NextResponse.json({ message: 'Unauthorized' }, { status: 401 });
    }
    const userId = session.user.id;

    await connectMongoDB();

    // 1. Fetch Project and verify ownership
    projectData = await Project.findById(projectId).populate('diagrams'); // Populate diagrams
    if (!projectData || projectData.owner.toString() !== userId) {
      return NextResponse.json({ message: 'Project not found or forbidden' }, { status: 404 });
    }

    diagramsData = projectData.diagrams || [];

    // 2. Ensure temp directory exists
    await fs.mkdir(tempProjectDir, { recursive: true });

    // 3. Process each diagram: Check local, download if missing, upload to Gemini if needed
    const geminiFilesToUpload = [];
    const geminiFileObjects = []; // Store file objects returned by Gemini

    for (const diagram of diagramsData) {
      const localFilePath = path.join(tempProjectDir, diagram.fileName);
      let needsGeminiUpload = !diagram.geminiFileUri; // Upload if no URI

      try {
        // Check if file exists locally
        await fs.access(localFilePath);
        console.log(`File ${diagram.fileName} found locally.`);
      } catch {
        // File not found locally, download from GCS
        console.log(`File ${diagram.fileName} not found locally, downloading...`);
        await downloadFromGCS(diagram.storagePath, localFilePath);
        needsGeminiUpload = true; // Need to upload if just downloaded
      }

      // Upload to Gemini if needed
      if (needsGeminiUpload && fileManager) {
         try {
            const geminiFile = await uploadToGemini(localFilePath, diagram.fileName);
            if (geminiFile) {
                diagram.geminiFileUri = geminiFile.name; // Update URI in memory
                diagram.processingStatus = geminiFile.state; // Update status
                updatedDiagrams.push({ id: diagram._id, uri: geminiFile.name, status: geminiFile.state });
                geminiFileObjects.push(geminiFile); // Keep track for waiting
            } else {
                 diagram.processingStatus = 'Failed'; // Mark as failed if upload returns null
                 updatedDiagrams.push({ id: diagram._id, uri: null, status: 'Failed' });
            }
         } catch (uploadError) {
             console.error(`Failed to upload ${diagram.fileName} to Gemini:`, uploadError);
             diagram.processingStatus = 'Failed';
             updatedDiagrams.push({ id: diagram._id, uri: null, status: 'Failed' });
         }
      } else if (diagram.geminiFileUri && fileManager) {
          // If URI exists, check its status (optional, but good practice)
          try {
              const existingFile = await fileManager.getFile(diagram.geminiFileUri);
              if (existingFile.state === 'PROCESSING') {
                  geminiFileObjects.push(existingFile); // Add to wait list
              } else if (existingFile.state !== 'ACTIVE') {
                   console.warn(`Existing Gemini file ${diagram.geminiFileUri} is not ACTIVE (${existingFile.state}). Re-uploading.`);
                   // Optionally trigger re-upload here
              }
          } catch (fetchError) {
               console.error(`Error fetching existing Gemini file ${diagram.geminiFileUri}:`, fetchError);
               // Handle error, maybe trigger re-upload
          }
      }
    }

    // 4. Wait for any processing Gemini files
    await waitForFilesActive(geminiFileObjects);

    // 5. Update Diagram documents in DB with new URIs/statuses
    if (updatedDiagrams.length > 0) {
        console.log("Updating diagram records in DB...");
        const bulkOps = updatedDiagrams.map(update => ({
            updateOne: {
                filter: { _id: update.id },
                update: { $set: { geminiFileUri: update.uri, processingStatus: update.status } }
            }
        }));
        await Diagram.bulkWrite(bulkOps);
        console.log("Diagram records updated.");
        // Refetch diagrams to ensure the response has the latest URIs
        diagramsData = await Diagram.find({ project: projectId }).sort({ createdAt: -1 });
    }


    // 6. Return project, updated diagrams, and chat history
    return NextResponse.json({
        project: { _id: projectData._id, name: projectData.name, description: projectData.description }, // Send necessary project fields
        diagrams: diagramsData, // Send updated diagram data
        chatHistory: projectData.chatHistory || [] // Send chat history
    }, { status: 200 });

  } catch (error) {
    console.error(`Error preparing project ${projectId}:`, error);
    // Clean up temp dir on error? Maybe not, could be useful for debugging.
    return NextResponse.json({ message: 'Failed to prepare project data', error: error.message }, { status: 500 });
  }
  // Note: Temp files are deleted individually after upload attempt.
  // Consider a more robust cleanup strategy for the whole tempProjectDir if needed.
}
