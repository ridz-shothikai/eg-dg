import mongoose from 'mongoose';
import Diagram from '@/models/Diagram';
import connectMongoDB from '@/lib/db';
import { Storage } from '@google-cloud/storage';
import { GoogleAIFileManager } from "@google/generative-ai/server";
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import mime from 'mime-types';
import * as constants from '@/constants';

// --- Constants ---
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
let storage;
let bucket;
try {
    storage = new Storage({ projectId: gcpProjectId, keyFilename: 'sa.json' });
    bucket = storage.bucket(bucketName);
} catch (e) {
    console.error("Failed to initialize Google Cloud Storage:", e);
}


// --- Initialize Gemini File Manager ---
let fileManager = null;
if (geminiApiKey) {
  try {
    fileManager = new GoogleAIFileManager(geminiApiKey);
    console.log("Gemini File Manager initialized for background tasks.");
  } catch(e) {
     console.error("Failed to initialize Gemini File Manager for background tasks:", e);
  }
} else {
    console.warn("Gemini API Key missing, Gemini file operations disabled in background tasks.");
}

// --- Helper: Update Diagram Progress ---
// NOTE: Consider throttling this in a real-world scenario if updates are too frequent
async function updateDiagramProgress(diagramId, progress) {
     try {
        await connectMongoDB();
        const roundedProgress = Math.max(0, Math.min(100, Math.round(progress))); // Ensure 0-100
        await Diagram.findByIdAndUpdate(diagramId, { $set: { uploadProgress: roundedProgress } });
        // console.log(`[BackgroundTask] Updated diagram ${diagramId} progress to ${roundedProgress}%`); // Can be very noisy
    } catch (dbError) {
        console.error(`[BackgroundTask] Failed to update progress for diagram ${diagramId}:`, dbError);
    }
}

// --- Helper: Update Diagram Status ---
async function updateDiagramStatus(diagramId, status, geminiUri = null) {
    try {
        await connectMongoDB();
        const updateData = { processingStatus: status };
        if (geminiUri !== null) { // Only update URI if provided (prevents clearing on failure)
            updateData.geminiFileUri = geminiUri;
        }
        await Diagram.findByIdAndUpdate(diagramId, { $set: updateData });
        console.log(`[BackgroundTask] Updated diagram ${diagramId} status to ${status}` + (geminiUri ? ` with URI ${geminiUri}` : ''));
    } catch (dbError) {
        console.error(`[BackgroundTask] Failed to update status for diagram ${diagramId}:`, dbError);
    }
}

// --- Helper: Download from GCS ---
async function downloadFromGCS(gcsPath, destination) {
    if (!bucket) throw new Error("GCS Bucket not initialized.");
    const fileName = gcsPath.split('/').pop();
    if (!fileName) throw new Error(`Invalid GCS path: ${gcsPath}`);
    console.log(`[BackgroundTask] Downloading ${fileName} from GCS to ${destination}...`);
    await bucket.file(fileName).download({ destination });
    console.log(`[BackgroundTask] Downloaded ${fileName} successfully.`);
    return destination; // Return the path
}

// --- Helper: Upload to Gemini ---
// Added diagramId parameter
async function uploadToGemini(diagramId, filePath, displayName) {
    if (!fileManager) {
        console.warn("[BackgroundTask] Gemini File Manager not available, skipping upload.");
        return null;
    }
    const mimeType = mime.lookup(filePath) || 'application/octet-stream';
    console.log(`[BackgroundTask] Uploading ${displayName} (${mimeType}) to Gemini for diagram ${diagramId}...`);

    // --- Attempt to add progress callback ---
    // NOTE: This assumes the SDK supports an 'onUploadProgress' option.
    // If this option doesn't exist, the callback will simply not be called.
    const uploadOptions = {
        mimeType,
        displayName,
        onUploadProgress: (progressEvent) => {
            // Assuming progressEvent has properties like 'loaded' and 'total'
            if (progressEvent && typeof progressEvent.loaded === 'number' && typeof progressEvent.total === 'number' && progressEvent.total > 0) {
                const percentCompleted = (progressEvent.loaded / progressEvent.total) * 100;
                // Call the helper to update DB (don't await, let it run in background)
                updateDiagramProgress(diagramId, percentCompleted);
            } else if (progressEvent && typeof progressEvent.percent === 'number') {
                 // Alternative: SDK might provide percentage directly
                 updateDiagramProgress(diagramId, progressEvent.percent);
            }
        }
    };
    // --- End progress callback attempt ---

    try {
        // Pass the options object to uploadFile
        const uploadResult = await fileManager.uploadFile(filePath, uploadOptions);

        // Ensure progress is marked as 100% on successful completion
        await updateDiagramProgress(diagramId, 100);

        console.log(`[BackgroundTask] Uploaded ${displayName} to Gemini as: ${uploadResult.file.name}`);
        return uploadResult.file; // Return the file object
    } catch (uploadError) {
         console.error(`[BackgroundTask] Gemini upload failed for ${displayName}:`, uploadError);
         throw uploadError; // Re-throw to be caught by the main function
    }
}

// --- Helper: Wait for Gemini File Active ---
async function waitForFileActive(geminiFile) {
  if (!fileManager || !geminiFile || !geminiFile.name) {
      console.warn("[BackgroundTask] Skipping Gemini file polling (no manager or invalid file).");
      return geminiFile?.state || 'UNKNOWN'; // Return current state or unknown
  }

  let currentFile = geminiFile;
  let attempts = 0;
  const maxAttempts = 24; // Wait up to 2 minutes (24 * 5s) - Increased wait time
  const pollInterval = 5000; // 5 seconds

  console.log(`[BackgroundTask] Waiting for Gemini file ${currentFile.name} (Initial state: ${currentFile.state}). Polling every ${pollInterval / 1000}s...`);

  while (currentFile.state === "PROCESSING" && attempts < maxAttempts) {
    attempts++;
    await new Promise((resolve) => setTimeout(resolve, pollInterval));
    try {
      currentFile = await fileManager.getFile(geminiFile.name);
      console.log(`[BackgroundTask] -> Polled ${currentFile.name}: ${currentFile.state} (Attempt ${attempts}/${maxAttempts})`);
    } catch (error) {
       console.error(`[BackgroundTask] Error polling file state for ${geminiFile.name} (Attempt ${attempts}):`, error);
       // Don't assume failure immediately, maybe a transient API error
       if (attempts >= maxAttempts) {
           console.error(`[BackgroundTask] Max polling attempts reached for ${geminiFile.name}. Assuming failure.`);
           return 'FAILED'; // Assume failure after max attempts with errors
       }
       // Continue polling on error unless max attempts reached
    }
  }

   if (currentFile.state !== "ACTIVE") {
     console.warn(`[BackgroundTask] File ${currentFile.name} did not become ACTIVE. Final state: ${currentFile.state}`);
   } else {
     console.log(`[BackgroundTask] File ${currentFile.name} is ACTIVE.`);
   }

  return currentFile.state; // Return the final state ('ACTIVE', 'FAILED', etc.)
}

// --- Main Background Task Function ---
export async function prepareDiagramInBackground(diagramId) {
    console.log(`[BackgroundTask] Starting preparation for diagram ${diagramId}...`);
    let tempFilePath = null;
    let diagram;

    try {
        await connectMongoDB();
        diagram = await Diagram.findById(diagramId);

        if (!diagram) {
            throw new Error(`Diagram ${diagramId} not found.`);
        }
        if (diagram.processingStatus !== 'PENDING') {
            console.log(`[BackgroundTask] Diagram ${diagramId} status is already ${diagram.processingStatus}. Skipping preparation.`);
            return;
        }

        // 1. Update status to PROCESSING
        await updateDiagramStatus(diagramId, 'PROCESSING');

        // 2. Download from GCS
        const tempDir = path.join(os.tmpdir(), `doclyze_prepare_${diagramId}`);
        await fs.mkdir(tempDir, { recursive: true });
        tempFilePath = path.join(tempDir, diagram.storagePath.split('/').pop());
        await downloadFromGCS(diagram.storagePath, tempFilePath);

        // 3. Upload to Gemini (if available)
        let geminiFile = null;
        let finalStatus = 'FAILED'; // Default to failed unless explicitly set to ACTIVE
        let geminiUri = null;

        if (fileManager) {
            try {
                // Pass diagramId to uploadToGemini
                geminiFile = await uploadToGemini(diagramId, tempFilePath, diagram.fileName);
                if (geminiFile) {
                    geminiUri = geminiFile.name;
                    // Update DB immediately with URI and PROCESSING status from Gemini
                    // Also ensure progress is 100% after successful upload (handled in uploadToGemini now)
                    await updateDiagramStatus(diagramId, geminiFile.state, geminiUri);

                    // 4. Poll for ACTIVE status
                    finalStatus = await waitForFileActive(geminiFile); // Returns 'ACTIVE', 'FAILED', etc.
                } else {
                    console.error(`[BackgroundTask] Gemini upload returned null for ${diagram.fileName}.`);
                    finalStatus = 'FAILED'; // Explicitly failed
                }
            } catch (geminiError) {
                console.error(`[BackgroundTask] Error during Gemini upload/polling for ${diagramId}:`, geminiError);
                finalStatus = 'FAILED'; // Mark as failed on error
                geminiUri = diagram.geminiFileUri; // Keep existing URI if polling failed but upload succeeded initially
            }
        } else {
            console.warn(`[BackgroundTask] Gemini File Manager not initialized. Marking diagram ${diagramId} as FAILED as Gemini processing is required.`);
            finalStatus = 'FAILED'; // Cannot proceed without Gemini
        }

        // 5. Update final status in DB
        await updateDiagramStatus(diagramId, finalStatus, geminiUri);

        console.log(`[BackgroundTask] Finished preparation for diagram ${diagramId} with final status: ${finalStatus}`);

    } catch (error) {
        console.error(`[BackgroundTask] CRITICAL ERROR preparing diagram ${diagramId}:`, error);
        // Attempt to mark as failed in DB if possible
        if (diagramId) {
            await updateDiagramStatus(diagramId, 'FAILED');
        }
    } finally {
        // 6. Clean up temp file
        if (tempFilePath) {
            try {
                await fs.rm(path.dirname(tempFilePath), { recursive: true, force: true }); // Remove the directory
                console.log(`[BackgroundTask] Cleaned up temp directory for ${diagramId}`);
            } catch (cleanupError) {
                console.error(`[BackgroundTask] Failed to clean up temp directory for ${diagramId}:`, cleanupError);
            }
        }
    }
}
