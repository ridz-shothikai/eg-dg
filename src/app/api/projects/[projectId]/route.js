import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth/next';
import { authOptions } from '@/app/api/auth/[...nextauth]/route';
import connectMongoDB from '@/lib/db';
import Project from '@/models/Project';
import Diagram from '@/models/Diagram';
import mongoose from 'mongoose';

// GET handler to fetch a specific project and its diagrams
export async function GET(request, context) { // Use context argument
  const projectId = context.params.projectId; // Access projectId from context.params

  if (!projectId || !mongoose.Types.ObjectId.isValid(projectId)) {
    return NextResponse.json({ message: 'Invalid Project ID' }, { status: 400 });
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
      console.log(`Project GET API: Guest access attempt with ID: ${guestIdHeader}`);
    } else {
      // No session and no guest header
      return NextResponse.json({ message: 'Unauthorized' }, { status: 401 });
    }

    await connectMongoDB();

    // Fetch the project
    const project = await Project.findById(projectId);

    if (!project) {
      return NextResponse.json({ message: 'Project not found' }, { status: 404 });
    }

    // Authorization check
    if (userId) { // Authenticated user
        if (!project.owner || project.owner.toString() !== userId) {
             console.log(`User ${userId} attempted to access project ${projectId} owned by ${project.owner?.toString()}`);
             return NextResponse.json({ message: 'Forbidden' }, { status: 403 });
        }
    } else if (isGuest) { // Guest user
        if (!project.guestOwnerId || project.guestOwnerId !== guestIdHeader) {
             console.log(`Project GET API: Guest ID mismatch: Header=${guestIdHeader}, Project=${project.guestOwnerId}`);
             return NextResponse.json({ message: 'Forbidden (Guest Access Denied)' }, { status: 403 });
        }
    } else {
        // Should not happen due to initial check, but safeguard
        return NextResponse.json({ message: 'Unauthorized' }, { status: 401 });
    }

    // Fetch diagrams associated with the project
    const diagrams = await Diagram.find({ project: projectId }).sort({ createdAt: -1 });

    return NextResponse.json({ project, diagrams }, { status: 200 });

  } catch (error) {
    console.error(`Error fetching project ${projectId}:`, error);
    return NextResponse.json({ message: 'Failed to fetch project data', error: error.message }, { status: 500 });
  }
}

// Add PUT/DELETE handlers later if needed for updating/deleting projects
