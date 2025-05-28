import { NextResponse } from 'next/server'; // Keep NextResponse for errors
import { getServerSession } from 'next-auth/next';
import { authOptions } from '@/app/api/auth/[...nextauth]/route';
// Import ReadableStream and TextEncoder if not implicitly available in Next.js Edge Runtime (though this looks like Node)
// No explicit import needed for standard Node.js ReadableStream/TextEncoder in this environment.
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
import { Storage } from '@google-cloud/storage'; // Import Storage
import * as constants from '@/constants';
import { generateContentStreamWithRetry } from '@/lib/geminiUtils'; // Import the stream retry helper
// Import the new function
import { generateContentWithRetry, generateDxfAwareSystemPrompt } from '@/lib/geminiUtils';

// Import RAG utilities
import { generateEmbedding } from '@/lib/embeddingUtils';
import { queryVectors } from '@/lib/pineconeUtils';

const { GOOGLE_AI_STUDIO_API_KEY, GCS_BUCKET_NAME, GOOGLE_CLOUD_PROJECT_ID } = constants; // Added GCS_BUCKET_NAME and GOOGLE_CLOUD_PROJECT_ID

// --- Initialize GCS Storage ---
// Keep GCS storage initialization for potential future use or other functionalities
let storage = null;
if (GOOGLE_CLOUD_PROJECT_ID && GCS_BUCKET_NAME) {
    try {
        const keyFilePath = path.join(process.cwd(), 'sa.json');
        storage = new Storage({
             projectId: GOOGLE_CLOUD_PROJECT_ID,
             keyFilename: keyFilePath
        });
        console.log(`Chat API: GCS Storage client initialized using keyfile ${keyFilePath} for bucket: ${GCS_BUCKET_NAME}`);
    } catch(e) {
        console.error("Chat API: Failed to initialize GCS Storage client:", e);
    }
} else {
    console.warn("Chat API: GCS_BUCKET_NAME or GOOGLE_CLOUD_PROJECT_ID not set. GCS download functionality will be disabled.");
}


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
    // Check for session OR guest header
    const session = await getServerSession(authOptions);
    const guestIdHeader = request.headers.get('X-Guest-ID');
    let userId = null;
    let isGuest = false;

    if (session && session.user && session.user.id) {
      userId = session.user.id;
    } else if (guestIdHeader) {
      isGuest = true;
      console.log(`Chat API: Guest access attempt with ID: ${guestIdHeader}`);
    } else {
      // No session and no guest header
      return NextResponse.json({ message: 'Unauthorized' }, { status: 401 });
    }


    await connectMongoDB();

    // Fetch Project and verify ownership OR guest access
    const project = await Project.findById(projectId);

    if (!project) {
        return NextResponse.json({ message: 'Project not found' }, { status: 404 });
    }

    // Authorization check
    if (userId) { // Authenticated user
        if (!project.owner || project.owner.toString() !== userId) {
            return NextResponse.json({ message: 'Forbidden' }, { status: 403 });
        }
    } else if (isGuest) { // Guest user
        if (!project.guestOwnerId || project.guestOwnerId !== guestIdHeader) {
             console.log(`Chat API: Guest ID mismatch: Header=${guestIdHeader}, Project=${project.guestOwnerId}`);
             return NextResponse.json({ message: 'Forbidden (Guest Access Denied)' }, { status: 403 });
        }
    } else {
        // Should not happen due to initial check, but safeguard
        return NextResponse.json({ message: 'Unauthorized' }, { status: 401 });
    }

    // --- RAG: Query Pinecone for relevant document chunks ---
    console.log(`Chat API: Querying Pinecone for relevant chunks for project ${projectId}...`);
    let retrievedChunks = [];
    let processedDiagramNames = []; // Still need diagram names for the system prompt

    try {
        // Generate embedding for the user's message
        const queryEmbedding = await generateEmbedding(message);

        // Query Pinecone, filtering by projectId
        // Adjust topK as needed to retrieve a suitable number of chunks
        retrievedChunks = await queryVectors(queryEmbedding, 10, { projectId: projectId });

        console.log(`Chat API: Retrieved ${retrievedChunks.length} chunks from Pinecone.`);

        // Extract unique diagram names from retrieved chunks for the system prompt
        const uniqueDiagramIds = [...new Set(retrievedChunks.map(chunk => chunk.metadata.diagramId))];
        if (uniqueDiagramIds.length > 0) {
             const diagramsInContext = await Diagram.find({ _id: { $in: uniqueDiagramIds } }).select('fileName');
             processedDiagramNames = diagramsInContext.map(diag => diag.fileName);
        } else {
             // If no chunks retrieved, still include project name in prompt
             processedDiagramNames = [`Project: ${project.name}`];
        }


    } catch (ragError) {
        console.error(`Error during Pinecone query for project ${projectId}:`, ragError);
        // Decide how to handle RAG errors - maybe proceed without RAG context?
        // For now, log and proceed without RAG context, relying only on chat history.
        console.warn("Proceeding with chat without RAG context due to an error.");
        retrievedChunks = []; // Ensure no chunks are used if there's an error
        processedDiagramNames = [`Project: ${project.name} (Document context unavailable)`]; // Update prompt info
    }
    // --- End RAG Query ---


    // --- Construct Full Conversation History for Each Request ---
    const contents = [];

    // Add previous history turns (text only)
    if (history && history.length > 0) {
        history.forEach(item => {
            contents.push({ role: item.role, parts: [{ text: item.text }] });
        });
    }

    // Prepare context text from retrieved chunks
    let contextTextFromRAG = "";
    if (retrievedChunks.length > 0) {
        contextTextFromRAG = "Document Context:\n";
        retrievedChunks.forEach(chunk => {
            // Include filename and chunk text
            contextTextFromRAG += `--- File: ${chunk.metadata.fileName} (Chunk ${chunk.metadata.chunkIndex}) ---\n${chunk.metadata.text}\n\n`;
        });
        contextTextFromRAG += "---\n"; // Separator
    }


    // Add the current user message WITH RAG context and identity instruction
    const systemInstruction = `You are an AI assistant specialized in analyzing engineering documents for the project "${project.name}". Your purpose is to help users understand these documents. Do not reveal you are Gemini or any other specific model.`;

    // Generate DXF-aware system prompt (still useful for general document understanding)
    const dxfAwarePrompt = generateDxfAwareSystemPrompt(processedDiagramNames);

    const currentUserParts = [
        { text: systemInstruction },
        { text: dxfAwarePrompt }, // Include the DXF-aware prompt
        { text: contextTextFromRAG }, // Include the retrieved RAG context
        { text: `User Query: ${message}` } // Clearly label the user's query
    ];
    contents.push({ role: "user", parts: currentUserParts });

    // Log the structure being sent (optional, for debugging)
    // console.log("Sending contents to Gemini:", JSON.stringify(contents.map(c => ({ role: c.role, parts: c.parts.map(p => p.text ? {text: '...'} : {inlineData: '...'}) })), null, 2));


    console.log("Starting chat stream with Gemini 2.0 Flash (using RAG context)...");

    // --- Use Streaming with generateContentStream ALWAYS ---
    const encoder = new TextEncoder();
    let accumulatedResponse = ""; // To store the full response for DB saving

    const stream = new ReadableStream({
      async start(controller) {
        try {
          // Use generateContentStreamWithRetry to initiate the stream
          const resultStream = await generateContentStreamWithRetry(
              gemini,
              { contents }, // Use the RAG-augmented contents
              3, // maxRetries
              (attempt, max) => {
                  // Optional: Could try to send a retry message, but difficult in plain text stream
                  console.log(`Retrying Gemini stream initiation (${attempt}/${max})...`);
              }
          );

          // Process the stream from Gemini (if initiation succeeded)
          for await (const chunk of resultStream.stream) {
            const chunkText = chunk.text();
            accumulatedResponse += chunkText; // Accumulate text
            controller.enqueue(encoder.encode(chunkText)); // Send chunk to client
          }

          // --- Save full conversation to DB AFTER streaming is complete ---
          try {
            await Project.findByIdAndUpdate(projectId, {
              $push: {
                chatHistory: [
                  { role: 'user', text: message },
                  { role: 'model', text: accumulatedResponse } // Save accumulated response
                ]
              }
            });
            console.log(`Chat history saved for project ${projectId}`);
          } catch (dbError) {
            console.error(`Failed to save chat history for project ${projectId}:`, dbError);
            // Don't necessarily stop the stream, but log the error
          }

          controller.close(); // Close the stream when Gemini is done
        } catch (streamError) {
           // --- Robust Gemini Error Handling ---
           console.error("Error during Gemini stream processing:", streamError);
           let userFriendlyError = "An unexpected error occurred during analysis. Please try again."; // Default message

           // Add specific checks based on potential Gemini errors
           if (streamError.message && streamError.message.includes("RESOURCE_EXHAUSTED")) {
               userFriendlyError = "The analysis service is currently busy. Please try again shortly.";
           } else if (streamError.message && streamError.message.includes("API key not valid")) {
               userFriendlyError = "Chat functionality is temporarily unavailable due to a configuration issue. Please contact support.";
           } else if (streamError.message && (streamError.message.includes("Invalid content") || streamError.message.includes("unsupported format"))) {
               userFriendlyError = "There was an issue processing one or more uploaded files. Please check the file formats or try uploading again.";
           } else if (streamError.message && streamError.message.includes("SAFETY")) { // Check for safety blocks
                userFriendlyError = "The request could not be completed due to content safety guidelines.";
           }
           // Add more specific error checks as needed

           // Try to send the user-friendly error message through the stream with a specific prefix
           try {
                controller.enqueue(encoder.encode(`__CHAT_ERROR__:${userFriendlyError}`));
           } catch (e) { /* Ignore if controller is already closed */ }
           controller.close(); // Ensure stream is closed on error
           // Note: DB saving might not happen if an error occurs mid-stream
        }
      }
    });

    // Return the stream response
    return new Response(stream, {
      headers: {
        'Content-Type': 'text/plain; charset=utf-8', // Use text/plain for simple streaming
        'X-Content-Type-Options': 'nosniff',
      },
    });

  } catch (error) {
    // Catch errors outside the stream start (e.g., initial setup, auth)
    console.error(`Chat API error for project ${projectId} (outside stream):`, error);
    // Provide a generic user-friendly message for non-stream errors
    const userMessage = error.message.startsWith('Failed to load required file') // Check if it's our custom GCS error
        ? error.message
        : 'An unexpected error occurred before starting the chat. Please try again.';
    return NextResponse.json({ message: userMessage }, { status: 500 });
  }
}

// --- Configure API route to disable body parsing ---
export const config = {
api: {
bodyParser: false,
},
};
