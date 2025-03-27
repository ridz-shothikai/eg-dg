import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth/next';
import { authOptions } from '@/app/api/auth/[...nextauth]/route';
import connectMongoDB from '@/lib/db';
import Project from '@/models/Project';
import Diagram from '@/models/Diagram';
import mongoose from 'mongoose';
import { GoogleGenerativeAI } from "@google/generative-ai"; // Import main class from base package
import { GoogleAIFileManager } from "@google/generative-ai/server"; // Import FileManager from server
import mime from 'mime-types';
import { URL } from 'url';
import * as constants from '@/constants';

const { GOOGLE_AI_STUDIO_API_KEY } = constants;

// --- Initialize Gemini Model and File Manager ---
let gemini = null;
let fileManager = null;

if (GOOGLE_AI_STUDIO_API_KEY) {
  try {
    const genAI = new GoogleGenerativeAI(GOOGLE_AI_STUDIO_API_KEY);
    // Use gemini-1.5-flash for multimodal capabilities
    gemini = genAI.getGenerativeModel({ model: "gemini-1.5-flash" });
    fileManager = new GoogleAIFileManager(GOOGLE_AI_STUDIO_API_KEY);
    console.log("Gemini 1.5 Flash model and File Manager initialized for chat.");
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
  if (!gemini || !fileManager) {
     return NextResponse.json({ message: 'Chat functionality is disabled (API key or components missing)' }, { status: 503 });
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

    const diagrams = await Diagram.find({ project: projectId }).select('fileName geminiFileUri processingStatus');
    const activeDiagrams = diagrams.filter(d => d.geminiFileUri && d.processingStatus === 'ACTIVE');

    if (activeDiagrams.length === 0) {
        const processingDiagrams = diagrams.filter(d => d.processingStatus === 'PROCESSING');
        const failedDiagrams = diagrams.filter(d => d.processingStatus === 'FAILED' || !d.geminiFileUri);
        let errorMessage = "No documents are ready for chat.";
        if (processingDiagrams.length > 0) errorMessage = "Some documents are still processing. Please wait a moment and try again.";
        else if (failedDiagrams.length > 0) errorMessage = "Some documents failed to process correctly. Please check the uploads or try again.";
        else if (diagrams.length === 0) errorMessage = "No documents have been uploaded to this project yet.";
        return NextResponse.json({ message: errorMessage }, { status: 503 });
    }

    // --- Diagnostic Check ---
    console.log("Performing diagnostic check on file URIs...");
    let allFilesVerified = true;
    for (const diag of activeDiagrams) {
        try {
            const fileMetadata = await fileManager.getFile(diag.geminiFileUri);
            if (fileMetadata.state !== 'ACTIVE') {
                 console.warn(` -> WARNING: File ${diag.geminiFileUri} is not ACTIVE, state is ${fileMetadata.state}`);
                 allFilesVerified = false; // Require all files to be active
            } else {
                 console.log(` -> SUCCESS: File API found ${diag.geminiFileUri}, State: ACTIVE`);
            }
        } catch (checkError) {
            console.error(` -> ERROR: File API check failed for ${diag.geminiFileUri}:`, checkError.message);
            allFilesVerified = false;
        }
    }
    if (!allFilesVerified) {
         console.error("Aborting chat generation due to file URI verification failures or non-ACTIVE state.");
         return NextResponse.json({ message: "Some documents are not ready or failed processing. Please wait or check uploads." }, { status: 503 });
    }
    console.log("...File URI diagnostic check complete. All required files are ACTIVE.");
    // --- End Diagnostic Check ---

    // --- Construct File Parts using camelCase ---
    const fileParts = activeDiagrams.map(diag => ({
        fileData: { // camelCase
            mimeType: mime.lookup(diag.fileName) || 'application/octet-stream', // camelCase
            fileUri: diag.geminiFileUri // camelCase
        }
    }));

    // --- Format History for startChat ---
    // Needs to alternate user/model roles. Include file context only in the FIRST user message if history is empty.
    const formattedHistory = [];
    if (history && history.length > 0) {
        history.forEach(item => {
            formattedHistory.push({ role: item.role, parts: [{ text: item.text }] });
        });
    } else {
        // If no history, this is the first user message, include file context here.
        formattedHistory.push({
            role: "user",
            parts: [
                ...fileParts, // Add file references to the first message
                { text: `Context: These diagrams (${activeDiagrams.map(d => d.fileName).join(', ')}) are part of project "${project.name}". Now, please answer my question.` }
            ]
        });
    }

    console.log("Starting chat session with Gemini 1.5 Flash...");

    // Use startChat for conversation
    const chatSession = model.startChat({
        history: formattedHistory, // Pass the formatted history
        // generationConfig can be added here if needed
    });

    // Send the new user message (without file parts, as they are in history or first turn)
    const result = await chatSession.sendMessage(message);
    const response = result.response;
    const aiResponseText = response.text();

    // --- Save conversation to DB ---
    try {
      // Save the actual user message and the AI response
      await Project.findByIdAndUpdate(projectId, {
        $push: {
          chatHistory: [
            { role: 'user', text: message }, // The user's current message
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
    // Check for specific Gemini API errors if possible
    if (error.message && error.message.includes("Invalid or unsupported file uri")) {
         return NextResponse.json({ message: "Error referencing document context. It might still be processing or encountered an issue.", error: error.toString() }, { status: 500 });
    }
    return NextResponse.json({ message: errorMessage, error: error.toString() }, { status: 500 });
  }
}
