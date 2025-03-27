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
    const session = await getServerSession(authOptions);
    if (!session || !session.user || !session.user.id) {
      return NextResponse.json({ message: 'Unauthorized' }, { status: 401 });
    }
    const userId = session.user.id;

    await connectMongoDB();

    // Fetch the project and verify ownership
    const project = await Project.findById(projectId);

    if (!project) {
      return NextResponse.json({ message: 'Project not found' }, { status: 404 });
    }

    // Ensure the logged-in user owns the project
    if (project.owner.toString() !== userId) {
        console.log(`User ${userId} attempted to access project ${projectId} owned by ${project.owner.toString()}`);
        return NextResponse.json({ message: 'Forbidden' }, { status: 403 });
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
