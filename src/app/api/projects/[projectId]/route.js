import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth/next';
import { authOptions } from '@/app/api/auth/[...nextauth]/route';
import connectMongoDB from '@/lib/db';
import Project from '@/models/Project';
import Diagram from '@/models/Diagram';
import mongoose from 'mongoose';
import { Storage } from '@google-cloud/storage'; // Import Storage
import { GOOGLE_CLOUD_PROJECT_ID, GCS_BUCKET_NAME, GOOGLE_CLOUD_KEYFILE } from '../../../../constants'; // Import constants

// Initialize Google Cloud Storage
const storage = new Storage({
  projectId: GOOGLE_CLOUD_PROJECT_ID,
  keyFilename: GOOGLE_CLOUD_KEYFILE,
});
const bucket = storage.bucket(GCS_BUCKET_NAME);

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

// PUT handler to rename a project
export async function PUT(request, context) {
  const projectId = context.params.projectId;

  if (!projectId || !mongoose.Types.ObjectId.isValid(projectId)) {
    return NextResponse.json({ message: 'Invalid Project ID' }, { status: 400 });
  }

  try {
    const session = await getServerSession(authOptions);
    const guestIdHeader = request.headers.get('X-Guest-ID');
    let userId = null;
    let isGuest = false;

    if (session && session.user && session.user.id) {
      userId = session.user.id;
    } else if (guestIdHeader) {
      isGuest = true;
    } else {
      return NextResponse.json({ message: 'Unauthorized' }, { status: 401 });
    }

    await connectMongoDB();

    const project = await Project.findById(projectId);

    if (!project) {
      return NextResponse.json({ message: 'Project not found' }, { status: 404 });
    }

    // Authorization check
    if (userId) {
      if (!project.owner || project.owner.toString() !== userId) {
        return NextResponse.json({ message: 'Forbidden' }, { status: 403 });
      }
    } else if (isGuest) {
      if (!project.guestOwnerId || project.guestOwnerId !== guestIdHeader) {
        return NextResponse.json({ message: 'Forbidden (Guest Access Denied)' }, { status: 403 });
      }
    } else {
      return NextResponse.json({ message: 'Unauthorized' }, { status: 401 });
    }

    const { name: newName } = await request.json();

    if (!newName || typeof newName !== 'string' || newName.trim().length === 0) {
      return NextResponse.json({ message: 'Invalid project name provided' }, { status: 400 });
    }

    project.name = newName.trim();
    await project.save();

    console.log(`Project ${projectId} renamed to "${newName}"`);
    return NextResponse.json({ message: 'Project renamed successfully', project }, { status: 200 });

  } catch (error) {
    console.error(`Error renaming project ${projectId}:`, error);
    return NextResponse.json({ message: 'Failed to rename project', error: error.message }, { status: 500 });
  }
}

// DELETE handler to remove a project and its associated diagrams/files
export async function DELETE(request, context) {
  const projectId = context.params.projectId;

  if (!projectId || !mongoose.Types.ObjectId.isValid(projectId)) {
    return NextResponse.json({ message: 'Invalid Project ID' }, { status: 400 });
  }

  try {
    const session = await getServerSession(authOptions);
    const guestIdHeader = request.headers.get('X-Guest-ID');
    let userId = null;
    let isGuest = false;

    if (session && session.user && session.user.id) {
      userId = session.user.id;
    } else if (guestIdHeader) {
      isGuest = true;
    } else {
      return NextResponse.json({ message: 'Unauthorized' }, { status: 401 });
    }

    await connectMongoDB();

    const project = await Project.findById(projectId);

    if (!project) {
      return NextResponse.json({ message: 'Project not found' }, { status: 404 });
    }

    // Authorization check
    if (userId) {
      if (!project.owner || project.owner.toString() !== userId) {
        return NextResponse.json({ message: 'Forbidden' }, { status: 403 });
      }
    } else if (isGuest) {
      if (!project.guestOwnerId || project.guestOwnerId !== guestIdHeader) {
        return NextResponse.json({ message: 'Forbidden (Guest Access Denied)' }, { status: 403 });
      }
    } else {
      return NextResponse.json({ message: 'Unauthorized' }, { status: 401 });
    }

    // Find and delete associated diagrams and their GCS files
    const diagrams = await Diagram.find({ project: projectId });

    for (const diagram of diagrams) {
      if (diagram.storagePath) {
        try {
          const file = bucket.file(diagram.storagePath);
          await file.delete();
          console.log(`Deleted GCS file: ${diagram.storagePath}`);
        } catch (gcsError) {
          // Log GCS deletion errors but don't stop the process
          console.error(`Failed to delete GCS file ${diagram.storagePath}:`, gcsError);
        }
      }
      // Delete the diagram document from MongoDB
      await Diagram.findByIdAndDelete(diagram._id);
      console.log(`Deleted Diagram document: ${diagram._id}`);
    }

    // Finally, delete the project document from MongoDB
    await Project.findByIdAndDelete(projectId);
    console.log(`Deleted Project document: ${projectId}`);

    return NextResponse.json({ message: 'Project removed successfully' }, { status: 200 });

  } catch (error) {
    console.error(`Error removing project ${projectId}:`, error);
    return NextResponse.json({ message: 'Failed to remove project', error: error.message }, { status: 500 });
  }
}
