import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth/next';
import { authOptions } from '@/app/api/auth/[...nextauth]/route';
import connectMongoDB from '@/lib/db';
import Project from '@/models/Project';
import User from '@/models/User'; // Needed for POST

// GET handler to fetch projects for the logged-in user
export async function GET(request) {
  try {
    const session = await getServerSession(authOptions);
    if (!session || !session.user || !session.user.id) {
      return NextResponse.json({ message: 'Unauthorized' }, { status: 401 });
    }
    const userId = session.user.id;

    await connectMongoDB();

    const projects = await Project.find({ owner: userId }).sort({ createdAt: -1 }); // Find projects by owner

    return NextResponse.json({ projects }, { status: 200 });
  } catch (error) {
    console.error('Error fetching projects:', error);
    return NextResponse.json({ message: 'Failed to fetch projects', error: error.message }, { status: 500 });
  }
}

// POST handler to create a new project (supports guest creation)
export async function POST(request) {
  let userId = null; // Default to null for guest users
  try {
    // Attempt to get session, but don't fail immediately if not present
    const session = await getServerSession(authOptions);
    if (session && session.user && session.user.id) {
      userId = session.user.id; // Set userId if session exists
    }

    // Get guestId from the body as well
    const { name, description, guestId } = await request.json();

    // Allow project creation even if userId is null (guest user)
    // The name comes from the request body (frontend sends filename or default)
    if (!name) {
      return NextResponse.json({ message: 'Project name is required' }, { status: 400 });
    }

    await connectMongoDB();

    // Only verify user if userId is present (i.e., not a guest)
    if (userId) {
      const user = await User.findById(userId);
      if (!user) {
          // This case should ideally not happen if session is valid, but good check
          return NextResponse.json({ message: 'Authenticated user not found' }, { status: 404 });
      }
    }

    const projectData = {
      name,
      description: description || '',
      owner: userId, // Will be null for guest users
    };

    // Add guestOwnerId if it's a guest and guestId is provided
    if (!userId && guestId) {
      projectData.guestOwnerId = guestId;
    }

    const newProject = new Project(projectData);

    await newProject.save();

    if (userId) {
      console.log(`New project created: ${name} by user ${userId}`);
    } else if (guestId) {
      console.log(`New guest project created: ${name} with guestId ${guestId}`);
    } else {
       console.log(`New guest project created: ${name} (no guestId provided)`); // Fallback log
    }

    // Return the full project object, including its _id
    return NextResponse.json(newProject, { status: 201 });

  } catch (error) {
    console.error('Error creating project:', error);
    return NextResponse.json({ message: 'Failed to create project', error: error.message }, { status: 500 });
  }
}
