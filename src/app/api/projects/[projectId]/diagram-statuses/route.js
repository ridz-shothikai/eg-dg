import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth/next';
import { authOptions } from '@/app/api/auth/[...nextauth]/route';
import connectMongoDB from '@/lib/db';
import Project from '@/models/Project';
import Diagram from '@/models/Diagram';
import mongoose from 'mongoose';
import { URL } from 'url';

// GET handler to fetch current statuses of diagrams in a project
export async function GET(request, context) {
  // Workaround: Extract projectId from URL
  const url = new URL(request.url);
  const pathSegments = url.pathname.split('/');
  // Assuming URL is like /api/projects/[projectId]/diagram-statuses
  const projectId = pathSegments[pathSegments.length - 2];

  if (!projectId || !mongoose.Types.ObjectId.isValid(projectId)) {
    return NextResponse.json({ message: 'Invalid Project ID from URL' }, { status: 400 });
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
      // console.log(`Diagram Status API: Guest access attempt with ID: ${guestIdHeader}`); // Less verbose logging
    } else {
      return NextResponse.json({ message: 'Unauthorized' }, { status: 401 });
    }

    await connectMongoDB();

    // 1. Fetch Project just to verify ownership/guest access
    // We select only _id, owner, and guestOwnerId for efficiency
    const project = await Project.findById(projectId).select('_id owner guestOwnerId');

    if (!project) {
        return NextResponse.json({ message: 'Project not found' }, { status: 404 });
    }

    // 2. Authorization check
    if (userId) { // Authenticated user
        if (!project.owner || project.owner.toString() !== userId) {
            return NextResponse.json({ message: 'Forbidden' }, { status: 403 });
        }
    } else if (isGuest) { // Guest user
        if (!project.guestOwnerId || project.guestOwnerId !== guestIdHeader) {
             // console.log(`Guest ID mismatch: Header=${guestIdHeader}, Project=${project.guestOwnerId}`); // Less verbose
             return NextResponse.json({ message: 'Forbidden (Guest Access Denied)' }, { status: 403 });
        }
    } else {
        return NextResponse.json({ message: 'Unauthorized' }, { status: 401 });
    }

    // 3. Fetch details needed for rendering the file list and status
    const diagramDetails = await Diagram.find(
        { project: projectId }, // Filter by project ID
        // Select fields needed for display, progress, and download link
        { _id: 1, processingStatus: 1, fileName: 1, createdAt: 1, storagePath: 1, uploadProgress: 1 } // Added uploadProgress
    ).sort({ createdAt: -1 }); // Sort by creation date descending

    // Optionally transform storagePath to gcsUrl if needed (or do this on frontend)
    // For now, returning storagePath directly
    const diagramsWithDetails = diagramDetails.map(d => ({
        _id: d._id,
        processingStatus: d.processingStatus,
        uploadProgress: d.uploadProgress, // Include progress
        fileName: d.fileName,
        createdAt: d.createdAt,
        // Construct GCS URL (assuming standard gs://bucket/file format)
        // Note: This URL might need signing for direct browser access depending on bucket permissions
        gcsUrl: d.storagePath ? `https://storage.googleapis.com/${d.storagePath.substring(5)}` : null
    }));


    // 4. Return the details
    return NextResponse.json(diagramsWithDetails, { status: 200 });
    // Removed duplicate return statement below

  } catch (error) {
    console.error(`Error fetching diagram statuses for project ${projectId}:`, error);
    return NextResponse.json({ message: 'Failed to fetch diagram statuses', error: error.message }, { status: 500 });
  }
}
