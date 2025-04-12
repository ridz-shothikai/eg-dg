import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth/next';
import { authOptions } from '@/app/api/auth/[...nextauth]/route';
import connectMongoDB from '@/lib/db';
import Project from '@/models/Project';
import Diagram from '@/models/Diagram';
import mongoose from 'mongoose';
import { Storage } from '@google-cloud/storage';
import * as constants from '@/constants';
// Removed unused imports: GoogleAIFileManager, fs, path, os, mime, generateContentWithRetry, GoogleGenerativeAI

const {
  MONGODB_URI, // Keep MONGODB_URI for connectMongoDB
  GOOGLE_CLOUD_PROJECT_ID,
  GCS_BUCKET_NAME,
  // Removed unused constants: GOOGLE_CLOUD_PROJECT_ID, GCS_BUCKET_NAME, GOOGLE_AI_STUDIO_API_KEY
} = constants;

// Removed GCS, Gemini File Manager, and Gemini Model initializations


import { URL } from 'url'; // Import URL for parsing

// GET handler to fetch initial project data (NO processing)
export async function GET(request, context) {
  // Workaround: Extract projectId from URL
  const url = new URL(request.url);
  const pathSegments = url.pathname.split('/');
  const projectId = pathSegments[pathSegments.length - 2];

  if (!projectId || !mongoose.Types.ObjectId.isValid(projectId)) {
    return NextResponse.json({ message: 'Invalid Project ID from URL' }, { status: 400 });
  }

  // Removed temp directory logic
  let projectData = null;
  let diagramsData = [];

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
      console.log(`Prepare API (Fast): Guest access attempt with ID: ${guestIdHeader}`);
    } else {
      return NextResponse.json({ message: 'Unauthorized' }, { status: 401 });
    }

    await connectMongoDB();

    // 1. Fetch Project (basic details only) and verify ownership OR guest access
    // DO NOT populate diagrams here for speed
    projectData = await Project.findById(projectId).select('_id name description owner guestOwnerId chatHistory'); // Select only needed fields

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
        return NextResponse.json({ message: 'Unauthorized' }, { status: 401 });
    }

    // --- REMOVED diagram fetching and status calculation ---

    // 2. Return only basic project details and chat history
    console.log(`Prepare API (Details Only) finished for ${projectId}`);
    return NextResponse.json({
        project: { _id: projectData._id, name: projectData.name, description: projectData.description },
        chatHistory: projectData.chatHistory || [],
        // Removed diagrams and preparationStatus from this response
    }, { status: 200 });

  } catch (error) {
    console.error(`Error fetching initial project data for ${projectId}:`, error);
    return NextResponse.json({ message: 'Failed to fetch project data', error: error.message }, { status: 500 });
  }
}
