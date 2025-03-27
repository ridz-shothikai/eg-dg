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
    // Revert to gemini-pro for text-based chat
    gemini = genAI.getGenerativeModel({ model: "gemini-pro" });
    console.log("Gemini Pro model initialized for chat.");
  } catch (e) {
    console.error("Failed to initialize Gemini Pro model for chat:", e);
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

    // Fetch diagrams for context, including OCR text
    const diagrams = await Diagram.find({ project: projectId }).select('fileName ocrText extractedData'); // Fetch OCR text again

    // --- Construct Text Context ---
    let diagramContext = "Context from Project Diagrams:\n";
    if (diagrams.length > 0) {
        diagrams.forEach(diag => {
            diagramContext += `--- Diagram: ${diag.fileName} ---\n`;
            if (diag.ocrText) {
                diagramContext += `OCR Text:\n${diag.ocrText.substring(0, 1500)}...\n`; // Limit context size per diagram
            } else {
                diagramContext += "(No OCR text available)\n";
            }
            // Optionally include summary if helpful and available
            // if (diag.extractedData) {
            //      diagramContext += `AI Summary:\n${JSON.stringify(diag.extractedData).substring(0, 500)}...\n`;
            // }
            diagramContext += "---\n";
        });
    } else {
        diagramContext += "No diagrams found for this project.\n";
    }

    // Basic chat history formatting (needs improvement for robust conversation)
    // Gemini expects history in a specific format: [{ role: "user", parts: [{ text: "..." }] }, { role: "model", parts: [{ text: "..." }] }]
    const formattedHistory = (history || []).map(entry => ({
        role: entry.role, // 'user' or 'model'
        parts: [{ text: entry.text }] // Assuming simple text parts for history
        // Removed duplicate line below
    }));

    // Construct the prompt string including context and history
    const prompt = `You are an AI assistant specialized in analyzing engineering diagrams for project "${project.name}".
Use the following context extracted from the project's diagrams to answer the user's question accurately and concisely. If the information isn't in the context, say so.

${diagramContext}

Chat History:
${formattedHistory.map(h => `${h.role}: ${h.parts[0].text}`).join('\n')}

Current User Question: ${message}`;


    console.log("Sending prompt to Gemini Pro...");
    // console.log("Prompt:", prompt); // For debugging

    // Use generateContent for text-only model
    const result = await gemini.generateContent(prompt); // Send the full prompt string
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
