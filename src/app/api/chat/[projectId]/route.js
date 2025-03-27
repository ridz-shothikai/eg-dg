import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth/next';
import { authOptions } from '@/app/api/auth/[...nextauth]/route';
import connectMongoDB from '@/lib/db';
import Project from '@/models/Project';
import Diagram from '@/models/Diagram';
import mongoose from 'mongoose';
import { GoogleGenerativeAI } from "@google/generative-ai";
import { GoogleAIFileManager } from "@google/generative-ai/server"; // Correct import path
import mime from 'mime-types';
import { URL } from 'url';
import * as constants from '@/constants';

const { GOOGLE_AI_STUDIO_API_KEY } = constants;

// --- Initialize Gemini Model and File Manager ---
let gemini = null;
let fileManager = null; // Initialize fileManager variable

if (GOOGLE_AI_STUDIO_API_KEY) {
  try {
    const genAI = new GoogleGenerativeAI(GOOGLE_AI_STUDIO_API_KEY);
    // Use gemini-2.0-flash for multimodal capabilities
    gemini = genAI.getGenerativeModel({ model: "gemini-2.0-flash" });
    fileManager = new GoogleAIFileManager(GOOGLE_AI_STUDIO_API_KEY); // Initialize FileManager
    console.log("Gemini gemini-2.0-flash model and File Manager initialized for chat."); // Corrected log
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

  const { message, history } = await request.json();

  if (!projectId || !mongoose.Types.ObjectId.isValid(projectId)) {
    return NextResponse.json({ message: 'Invalid Project ID from URL' }, { status: 400 });
  }
  if (!message) {
    return NextResponse.json({ message: 'Message is required' }, { status: 400 });
  }
  if (!gemini || !fileManager) { // Check fileManager too
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

    // --- Diagnostic Check: Verify URIs with File API before main call ---
    console.log("Performing diagnostic check on file URIs...");
    let allFilesVerified = true;
    for (const diag of activeDiagrams) {
        try {
            console.log(` -> Checking URI: ${diag.geminiFileUri}`);
            const fileMetadata = await fileManager.getFile(diag.geminiFileUri);
            console.log(` -> SUCCESS: File API found ${diag.geminiFileUri}, State: ${fileMetadata.state}`);
            if (fileMetadata.state !== 'ACTIVE') {
                 console.warn(` -> WARNING: File ${diag.geminiFileUri} is not ACTIVE, state is ${fileMetadata.state}`);
                 // Consider setting allFilesVerified = false here if strict active check is needed
            }
        } catch (checkError) {
            console.error(` -> ERROR: File API check failed for ${diag.geminiFileUri}:`, checkError.message);
            allFilesVerified = false; // Mark as failed if any URI check fails
        }
    }
    if (!allFilesVerified) {
         console.error("Aborting chat generation due to file URI verification failures.");
         return NextResponse.json({ message: "Internal error verifying document status. Please try again later." }, { status: 500 });
    }
    console.log("...File URI diagnostic check complete.");
    // --- End Diagnostic Check ---


    const fileParts = activeDiagrams.map(diag => ({
        file_data: {
            mime_type: mime.lookup(diag.fileName) || 'application/octet-stream',
            file_uri: diag.geminiFileUri
        }
    }));

    const formattedHistory = (history || []).map(entry => ({
        role: entry.role,
        parts: [{ text: entry.text }]
    }));

    const contents = [
        ...formattedHistory,
        {
            role: "user",
            parts: [
                ...fileParts,
                { text: `Based on the provided diagram(s) (${activeDiagrams.map(d => d.fileName).join(', ')}), answer the following question: ${message}` }
            ]
        }
    ];

    console.log("Sending content to Gemini gemini-2.0-flash Flash...");
    console.log("Chat API Request Content (abbreviated):", JSON.stringify(contents, (key, value) => {
        if (key === 'text' && typeof value === 'string' && value.length > 100) return value.substring(0, 100) + '...';
        return value;
    }, 2));

    const result = await gemini.generateContent({
        contents: contents,
        generationConfig: { maxOutputTokens: 1000 },
    });
    const response = result.response;
    const aiResponseText = response.text();

    try {
      await Project.findByIdAndUpdate(projectId, {
        $push: { chatHistory: [{ role: 'user', text: message }, { role: 'model', text: aiResponseText }] }
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
