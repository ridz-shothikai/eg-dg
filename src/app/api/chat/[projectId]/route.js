import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth/next';
import { authOptions } from '@/app/api/auth/[...nextauth]/route';
import connectMongoDB from '@/lib/db';
import Project from '@/models/Project';
import Diagram from '@/models/Diagram';
import mongoose from 'mongoose';
import { GoogleGenerativeAI } from "@google/generative-ai";
import mime from 'mime-types'; // Import mime-types
import { URL } from 'url'; // Import URL for parsing
import * as constants from '@/constants';

const { GOOGLE_AI_STUDIO_API_KEY } = constants;

// --- Initialize Gemini Pro model ---
let gemini = null;
if (GOOGLE_AI_STUDIO_API_KEY) {
  try {
    const genAI = new GoogleGenerativeAI(GOOGLE_AI_STUDIO_API_KEY);
    // Switch back to gemini-2.0-flash for multimodal capabilities
    gemini = genAI.getGenerativeModel({ model: "gemini-2.0-flash" });
    console.log("Gemini gemini-2.0-flash Flash model initialized for chat.");
  } catch (e) {
    console.error("Failed to initialize Gemini gemini-2.0-flash Flash model for chat:", e);
  }
} else {
  console.warn("GOOGLE_AI_STUDIO_API_KEY not set. Chat functionality will be disabled.");
}

// POST handler for chat messages
export async function POST(request, context) { // Use context
  // Workaround: Extract projectId from URL
  const url = new URL(request.url);
  const pathSegments = url.pathname.split('/');
  const projectId = pathSegments[pathSegments.length - 1]; // Chat endpoint is /api/chat/[projectId]

  const { message, history } = await request.json();

  if (!projectId || !mongoose.Types.ObjectId.isValid(projectId)) {
    return NextResponse.json({ message: 'Invalid Project ID from URL' }, { status: 400 });
  }

  if (!message) {
    return NextResponse.json({ message: 'Message is required' }, { status: 400 });
  }

  if (!gemini) {
     return NextResponse.json({ message: 'Chat functionality is disabled (API key missing)' }, { status: 503 });
  }

  try {
    const session = await getServerSession(authOptions);
    if (!session || !session.user || !session.user.id) {
      return NextResponse.json({ message: 'Unauthorized' }, { status: 401 });
    }
    const userId = session.user.id;

    await connectMongoDB();

    // Fetch the project and verify ownership (important for security)
    const project = await Project.findById(projectId);
    if (!project || project.owner.toString() !== userId) {
      return NextResponse.json({ message: 'Project not found or forbidden' }, { status: 404 });
    }

    // Fetch diagrams for context, specifically the Gemini File URIs
    const diagrams = await Diagram.find({ project: projectId }).select('fileName geminiFileUri');

    // Filter out diagrams that haven't been uploaded to Gemini successfully or are not ACTIVE
    // Note: The 'prepare' endpoint should ideally update the status after waiting.
    const validDiagrams = diagrams.filter(d => d.geminiFileUri); // Add status check if available

    if (validDiagrams.length === 0) {
        // Consider checking diagram statuses if available and providing a more specific message
        return NextResponse.json({ response: "No diagrams ready for chat in this project. Please ensure files were uploaded and processed." }, { status: 200 });
    }

    // --- Construct Parts Array for Gemini ---
    const fileParts = validDiagrams.map(diag => ({
        file_data: { // Use file_data
            mime_type: mime.lookup(diag.fileName) || 'application/octet-stream', // Use mime_type
            file_uri: diag.geminiFileUri // Use file_uri
        }
    }));

    // Basic chat history formatting (needs improvement for robust conversation)
    // Gemini expects history in a specific format: [{ role: "user", parts: [{ text: "..." }] }, { role: "model", parts: [{ text: "..." }] }]
    const formattedHistory = (history || []).map(entry => ({
        role: entry.role, // 'user' or 'model'
        parts: [{ text: entry.text }] // Assuming simple text parts for history
    }));

    // Combine file parts, history, and the new message
    const contents = [
        ...formattedHistory, // Add past messages first
        {
            role: "user",
            parts: [
                ...fileParts, // Add all file references
                { text: `Based on the provided diagram(s) (${validDiagrams.map(d => d.fileName).join(', ')}), answer the following question: ${message}` } // Add the user's question
            ]
        }
    ];

    console.log("Sending content to Gemini gemini-2.0-flash Flash...");
    // console.log("Content:", JSON.stringify(contents, null, 2)); // For debugging

    // Use generateContent for multimodal model
    const result = await gemini.generateContent({
        contents: contents,
        generationConfig: {
            maxOutputTokens: 1000, // Adjust token limit as needed
        },
    });
    const response = result.response;
    const aiResponseText = response.text();

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
      // Don't fail the whole request, just log the error
    }

    return NextResponse.json({ response: aiResponseText }, { status: 200 });

  } catch (error) {
    console.error(`Chat API error for project ${projectId}:`, error);
    // Check for specific Gemini errors if possible
    const errorMessage = error.message || 'Failed to get chat response';
    return NextResponse.json({ message: errorMessage, error: error.toString() }, { status: 500 });
  }
}
