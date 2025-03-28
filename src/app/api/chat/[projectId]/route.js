import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth/next';
import { authOptions } from '@/app/api/auth/[...nextauth]/route';
import connectMongoDB from '@/lib/db';
import Project from '@/models/Project';
import Diagram from '@/models/Diagram';
import mongoose from 'mongoose';
import { GoogleGenerativeAI } from "@google/generative-ai";
// Removed GoogleAIFileManager
import mime from 'mime-types';
import { URL } from 'url';
import fs from 'fs/promises'; // Import fs promises
import path from 'path'; // Import path
import * as constants from '@/constants';

const { GOOGLE_AI_STUDIO_API_KEY, GCS_BUCKET_NAME } = constants; // Added GCS_BUCKET_NAME

// --- Initialize Gemini Model ---
let gemini = null;
// Removed fileManager initialization

if (GOOGLE_AI_STUDIO_API_KEY) {
  try {
    const genAI = new GoogleGenerativeAI(GOOGLE_AI_STUDIO_API_KEY);
    gemini = genAI.getGenerativeModel({ model: "gemini-2.0-flash" });
    // Removed fileManager initialization
    console.log("Gemini 2.0 Flash model initialized for chat.");
  } catch (e) {
    console.error("Failed to initialize Gemini components for chat:", e);
  }
} else {
  console.warn("GOOGLE_AI_STUDIO_API_KEY not set. Chat functionality will be disabled.");
}

// POST handler for chat messages
export async function POST(request, context) {
  // Workaround: Extract projectId from URL
  const url = new URL(request.url);
  const pathSegments = url.pathname.split('/');
  const projectId = pathSegments[pathSegments.length - 1];

  const { message, history } = await request.json(); // history is the previous conversation turns

  if (!projectId || !mongoose.Types.ObjectId.isValid(projectId)) {
    return NextResponse.json({ message: 'Invalid Project ID from URL' }, { status: 400 });
  }
  if (!message) {
    return NextResponse.json({ message: 'Message is required' }, { status: 400 });
  }
  if (!gemini) { // Removed fileManager check
     return NextResponse.json({ message: 'Chat functionality is disabled (Gemini not initialized)' }, { status: 503 });
  }

  try {
    const session = await getServerSession(authOptions);
    if (!session || !session.user || !session.user.id) {
      return NextResponse.json({ message: 'Unauthorized' }, { status: 401 });
    }
    const userId = session.user.id;

    await connectMongoDB();

    const project = await Project.findById(projectId);
    if (!project || project.owner.toString() !== userId) {
      return NextResponse.json({ message: 'Project not found or forbidden' }, { status: 404 });
    }

    // Fetch diagrams using storagePath
    const diagrams = await Diagram.find({
        project: projectId,
        storagePath: { $exists: true, $ne: null, $ne: '' }
    }).select('fileName storagePath'); // Select storagePath

    if (diagrams.length === 0) {
        // Handle cases with no diagrams
        return NextResponse.json({ message: "No documents found for this project to chat with." }, { status: 503 });
    }

    // --- Prepare File Parts from Local Cache ---
    console.log(`Chat API: Preparing ${diagrams.length} files for project ${projectId} from local /tmp cache...`);
    const fileParts = [];
    const processedDiagramNames = [];
    const projectTempDir = '/tmp'; // Use Vercel's writable directory

    for (const diag of diagrams) {
        // Derive the expected local temp filename (must match upload/sync logic)
        const gcsPrefix = `gs://${GCS_BUCKET_NAME}/`;
        const objectPath = diag.storagePath.startsWith(gcsPrefix)
            ? diag.storagePath.substring(gcsPrefix.length)
            : diag.storagePath;
        const tempFilePath = path.join(projectTempDir, objectPath);

        try {
            console.log(` -> Reading local temp file: ${tempFilePath}`);
            const fileBuffer = await fs.readFile(tempFilePath);
            const base64Data = fileBuffer.toString('base64');

            fileParts.push({
                inlineData: {
                    mimeType: mime.lookup(diag.fileName) || 'application/octet-stream',
                    data: base64Data
                }
            });
            processedDiagramNames.push(diag.fileName);
            console.log(` -> SUCCESS: Prepared inlineData for ${diag.fileName} from local cache.`);

        } catch (readError) {
            if (readError.code === 'ENOENT') {
                console.warn(` -> WARNING: File not found in local cache: ${tempFilePath}. Skipping for chat context. Trigger sync if needed.`);
            } else {
                console.error(` -> ERROR: Failed to read local file ${tempFilePath} (${diag.fileName}):`, readError.message);
            }
            // Continue to next file, but don't add this one
        }
    }

    if (fileParts.length === 0) {
         console.error(`Chat API: Could not prepare any files from local cache for project ${projectId}.`);
         // Inform user that files might still be syncing or missing
         return NextResponse.json({ message: "Documents might still be preparing or are missing. Please try again shortly." }, { status: 503 });
    }
    console.log(`...Chat file preparation complete. Using ${fileParts.length} files from local cache.`);
    // --- End File Preparation ---


    // --- Format History for startChat ---
    const formattedHistory = [];
    if (history && history.length > 0) {
        history.forEach(item => {
            formattedHistory.push({ role: item.role, parts: [{ text: item.text }] });
        });
    }

    // Construct the initial user message part, including context and file parts if it's the start of the conversation
    const contextText = `Context: These diagrams (${processedDiagramNames.join(', ')}) are part of project "${project.name}". Now, please answer my question.`;
    const initialUserParts = history && history.length > 0 ? [{ text: message }] : [...fileParts, { text: contextText }, { text: message }];

    // If history exists, add the current message. If not, the initialUserParts already contain the first message.
    if (history && history.length > 0) {
        formattedHistory.push({ role: "user", parts: [{ text: message }] });
    } else {
        // For a new chat, the history starts with the combined initial prompt
         formattedHistory.push({ role: "user", parts: initialUserParts.filter(p => !p.inlineData) }); // History shouldn't contain file data itself
         // The actual file data is sent in the *first* message only
    }


    console.log("Starting chat session with Gemini 2.0 Flash...");

    // Use startChat for conversation if history exists
    // Otherwise, send the initial message directly with file parts
    let aiResponseText;
    if (history && history.length > 0) {
        const chatSession = gemini.startChat({
            history: formattedHistory.slice(0, -1), // Pass history *before* the current user message
        });
        const result = await chatSession.sendMessage(message); // Send only the current message text
        aiResponseText = result.response.text();
    } else {
        // Send the initial message including file parts
        const result = await gemini.generateContent(initialUserParts);
        aiResponseText = result.response.text();
    }


    // --- Save conversation to DB ---
    try {
      await Project.findByIdAndUpdate(projectId, {
        $push: {
          chatHistory: [
            { role: 'user', text: message },
            { role: 'model', text: aiResponseText }
          ]
        }
      });
      console.log(`Chat history saved for project ${projectId}`);
    } catch (dbError) {
      console.error(`Failed to save chat history for project ${projectId}:`, dbError);
    }

    return NextResponse.json({ response: aiResponseText }, { status: 200 });

  } catch (error) {
    console.error(`Chat API error for project ${projectId}:`, error);
    const errorMessage = error.message || 'Failed to get chat response';
    return NextResponse.json({ message: errorMessage, error: error.toString() }, { status: 500 });
  }
}
