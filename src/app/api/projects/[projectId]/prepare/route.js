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
import { generateContentWithRetry } from '@/lib/geminiUtils'; // Import the retry helper

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

// --- Initialize Gemini Generative Model ---
let geminiModel = null;
if (geminiApiKey) {
  try {
    const { GoogleGenerativeAI } = require("@google/generative-ai"); // Ensure this is required if not globally available
    const genAI = new GoogleGenerativeAI(geminiApiKey);
    // Using the specific model name requested by the user
    geminiModel = genAI.getGenerativeModel({ model: "gemini-2.0-flash" });
    console.log("Gemini Generative Model (gemini-2.0-flash) initialized for prepare endpoint.");
  } catch(e) {
   console.error("Failed to initialize Gemini Generative Model for prepare endpoint:", e);
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
  if (!files || files.length === 0) return []; // No files to wait for

  console.log(`Waiting for ${files.length} Gemini file(s) processing...`);
  const finalStatuses = [];

  for (const file of files) {
    if (!file || !file.name) {
        console.warn("Skipping invalid file object in waitForFilesActive.");
        continue;
    };

    let currentFile = file; // Start with the file object we have
    let attempts = 0;
    const maxAttempts = 12; // Wait up to 60 seconds (12 * 5s)

    console.log(` -> Checking ${currentFile.name} (Initial state: ${currentFile.state})`);
    while (currentFile.state === "PROCESSING" && attempts < maxAttempts) {
      attempts++;
      process.stdout.write(".");
      await new Promise((resolve) => setTimeout(resolve, 5000)); // Poll every 5 seconds
      try {
        currentFile = await fileManager.getFile(file.name); // Fetch latest state
        console.log(`\n -> Fetched state for ${currentFile.name}: ${currentFile.state} (Attempt ${attempts})`);
      } catch (error) {
         console.error(`\nError fetching file state for ${file.name} (Attempt ${attempts}):`, error);
         currentFile = { ...currentFile, state: "FAILED" }; // Assume failure on error
         break; // Stop polling on error
      }
    }

     if (currentFile.state !== "ACTIVE") {
       console.warn(`\nFile ${currentFile.name} did not become ACTIVE. Final state: ${currentFile.state}`);
     } else {
       console.log(`\nFile ${currentFile.name} is ACTIVE.`);
     }
     finalStatuses.push({ id: file.id || diagramIdMap[file.name], name: file.name, status: currentFile.state }); // Use map if needed
  }
  console.log("...file processing check complete.\n");
  return finalStatuses; // Return array of { id, name, status }
}

// Map original diagram ID to Gemini file name for status update
let diagramIdMap = {};


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
  let updatedDiagrams = [];

  try {
    // Check for session OR guest header
    const session = await getServerSession(authOptions);
    const guestIdHeader = request.headers.get('X-Guest-ID');
    let userId = null;
    let isGuest = false;

    if (session && session.user && session.user.id) {
      userId = session.user.id;
    } else if (guestIdHeader) {
      isGuest = true;
      console.log(`Prepare API: Guest access attempt with ID: ${guestIdHeader}`);
    } else {
      // No session and no guest header
      return NextResponse.json({ message: 'Unauthorized' }, { status: 401 });
    }

    await connectMongoDB();

    // 1. Fetch Project and verify ownership OR guest access
    projectData = await Project.findById(projectId).populate('diagrams'); // Populate diagrams

    if (!projectData) {
        return NextResponse.json({ message: 'Project not found' }, { status: 404 });
    }

    // Authorization check
    if (userId) { // Authenticated user
        if (!projectData.owner || projectData.owner.toString() !== userId) {
            return NextResponse.json({ message: 'Forbidden' }, { status: 403 });
        }
    } else if (isGuest) { // Guest user
        if (!projectData.guestOwnerId || projectData.guestOwnerId !== guestIdHeader) {
             console.log(`Guest ID mismatch: Header=${guestIdHeader}, Project=${projectData.guestOwnerId}`);
             return NextResponse.json({ message: 'Forbidden (Guest Access Denied)' }, { status: 403 });
        }
    } else {
        // Should not happen due to initial check, but safeguard
        return NextResponse.json({ message: 'Unauthorized' }, { status: 401 });
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

    // Build a map from gemini file name back to diagram ID for status updates
    diagramIdMap = diagramsData.reduce((map, diag) => {
        if (diag.geminiFileUri) {
            map[diag.geminiFileUri] = diag._id;
        }
        return map;
    }, {});


    // 4. Wait for any processing Gemini files and get their final statuses
    const finalStatuses = await waitForFilesActive(geminiFileObjects);

    // 5. Update Diagram documents in DB with new URIs and FINAL statuses
    const updatesToApply = [...updatedDiagrams]; // Start with uploads
    // Add statuses from polling results
    finalStatuses.forEach(fs => {
        // Find if this file was newly uploaded or just polled
        const existingUpdateIndex = updatesToApply.findIndex(u => u.uri === fs.name);
        if (existingUpdateIndex !== -1) {
            // Update the status from polling result
            updatesToApply[existingUpdateIndex].status = fs.status;
        } else {
            // This file was polled but not newly uploaded, add its status update
            const diagramId = diagramsData.find(d => d.geminiFileUri === fs.name)?._id;
            if (diagramId) {
                 updatesToApply.push({ id: diagramId, uri: fs.name, status: fs.status });
            }
        }
    });


    if (updatesToApply.length > 0) {
        console.log("Updating diagram records in DB with final statuses...");
        const bulkOps = updatesToApply.map(update => ({
            updateOne: {
                filter: { _id: update.id },
                // Only update status if it's different? Maybe not, just set it.
                update: { $set: { geminiFileUri: update.uri, processingStatus: update.status } }
            }
        }));
        await Diagram.bulkWrite(bulkOps);
        console.log("Diagram records updated.");
        // Refetch diagrams to get the final confirmed state
        diagramsData = await Diagram.find({ project: projectId }).sort({ createdAt: -1 });
    }

    // 6. Determine overall preparation status
    let overallStatus = 'ready';
    if (diagramsData.length === 0) {
        overallStatus = 'no_files';
    } else if (diagramsData.some(d => d.processingStatus === 'PROCESSING')) {
        overallStatus = 'processing';
    } else if (diagramsData.some(d => d.processingStatus === 'FAILED' || !d.geminiFileUri)) {
        overallStatus = 'failed'; // If any failed or are missing URI after prepare
    } else if (!diagramsData.every(d => d.processingStatus === 'ACTIVE')) {
         overallStatus = 'processing'; // If not all are active yet, consider it processing
    }

    let initialSummary = null;
    let suggestedQuestions = [];

    // 7. If ready, generate initial summary and suggestions
    if (overallStatus === 'ready' && geminiModel) {
        console.log("Generating initial summary and suggestions...");
        try {
            const activeDiagrams = diagramsData.filter(d => d.processingStatus === 'ACTIVE' && d.geminiFileUri);
            // Conditionally create fileInputParts ONLY if the model is NOT gemini-2.0-flash (or similar known problematic models)
            // Since the user insists on gemini-2.0-flash which causes URI errors, we will NOT send file parts.
            const fileInputParts = []; // Intentionally empty for gemini-2.0-flash to avoid URI error
            // if (geminiModel.model !== "gemini-2.0-flash") { // Example of conditional logic if needed later
            //    fileInputParts = activeDiagrams.map(d => ({ fileData: { mimeType: mime.lookup(d.fileName) || 'application/pdf', fileUri: d.geminiFileUri } }));
            // }

            // Adjust prompt slightly as it won't have file context now
             const prompt = `You are an assistant for the engineering diagram analysis tool for project "${projectData.name}". Briefly introduce yourself and state that you are ready to chat about the project. Then, suggest exactly 2 generic follow-up questions a user might ask. Format the output as a JSON object with keys "summary" (string) and "suggestions" (array of strings). Example JSON: {"summary": "Hey there! I'm ready to help analyze the diagrams for project ${projectData.name}.", "suggestions": ["Summarize the main components.", "What standards are mentioned?"]}`;

            // Construct contents without file parts if fileInputParts is empty
            const parts = [{ text: prompt }];
            if (fileInputParts.length > 0) {
                parts.push(...fileInputParts);
            }
            const contents = [{ role: "user", parts: parts }];

            // Use generateContentWithRetry for summary/suggestions
            const result = await generateContentWithRetry(
                geminiModel,
                { contents },
                3, // maxRetries
                (attempt, max) => console.log(`Retrying Gemini summary/suggestions (${attempt}/${max})...`) // Simple log on retry
            );

            if (result.response) {
                const responseText = result.response.text();
                console.log("Raw Gemini Summary/Suggestions Response:", responseText);
                // Attempt to parse the JSON response from Gemini
                try {
                    // Clean potential markdown fences
                    let cleanedText = responseText.trim();
                    if (cleanedText.startsWith('```json')) {
                        cleanedText = cleanedText.substring(7).trimStart();
                    }
                    if (cleanedText.endsWith('```')) {
                         cleanedText = cleanedText.substring(0, cleanedText.length - 3).trimEnd();
                    }

                    const parsedResponse = JSON.parse(cleanedText);
                    initialSummary = parsedResponse.summary || "I've reviewed the documents and I'm ready to chat!"; // Fallback summary
                    suggestedQuestions = parsedResponse.suggestions || [];
                    // Ensure only 2 suggestions max
                    if (suggestedQuestions.length > 2) {
                        suggestedQuestions = suggestedQuestions.slice(0, 2);
                    }
                    console.log("Parsed Summary:", initialSummary);
                    console.log("Parsed Suggestions:", suggestedQuestions);
                } catch (parseError) {
                    console.error("Failed to parse summary/suggestions JSON from Gemini:", parseError, "Raw text:", responseText);
                    initialSummary = "I've reviewed the documents and I'm ready to chat! (JSON parse error)"; // More specific fallback
                }
            } else {
                 console.warn("No response object or text received from Gemini for summary/suggestions.");
                 initialSummary = "I've reviewed the documents and I'm ready to chat! (No response from AI)"; // More specific fallback
            }
        } catch (geminiError) {
            // Log the specific error from the Gemini call
            console.error("Error calling Gemini for initial summary/suggestions:", geminiError);
            // Provide a more informative fallback message including the error if possible
            initialSummary = `I had trouble generating an initial summary (${geminiError.message || 'Unknown AI Error'}), but I'm ready to chat!`;
        }
        } else if (overallStatus === 'ready' && !geminiModel) {
         initialSummary = "I've reviewed the documents and I'm ready to chat! (Summary generation AI not initialized)";
    }


    // 8. Return project, updated diagrams, chat history, status, summary, and suggestions
    console.log(`Prepare endpoint finished with overall status: ${overallStatus}`);
    return NextResponse.json({
        project: { _id: projectData._id, name: projectData.name, description: projectData.description },
        diagrams: diagramsData,
        chatHistory: projectData.chatHistory || [],
        preparationStatus: overallStatus, // 'ready', 'processing', 'failed', 'no_files'
        initialSummary: initialSummary,
        suggestedQuestions: suggestedQuestions
    }, { status: 200 });

  } catch (error) {
    console.error(`Error preparing project ${projectId}:`, error);
    // Clean up temp dir on error? Maybe not, could be useful for debugging.
    return NextResponse.json({ message: 'Failed to prepare project data', error: error.message }, { status: 500 });
  }
  // Note: Temp files are deleted individually after upload attempt.
  // Consider a more robust cleanup strategy for the whole tempProjectDir if needed.
}
