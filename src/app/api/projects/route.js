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

// POST handler to create a new project
export async function POST(request) {
  try {
    const session = await getServerSession(authOptions);
    if (!session || !session.user || !session.user.id) {
      return NextResponse.json({ message: 'Unauthorized' }, { status: 401 });
    }
    const userId = session.user.id;

    const { name, description } = await request.json();

    if (!name) {
      return NextResponse.json({ message: 'Project name is required' }, { status: 400 });
    }

    await connectMongoDB();

    // Verify user exists (optional but good practice)
    const user = await User.findById(userId);
    if (!user) {
        return NextResponse.json({ message: 'User not found' }, { status: 404 });
    }

    const newProject = new Project({
      name,
      description: description || '',
      owner: userId,
    });

    await newProject.save();

    console.log(`New project created: ${name} by user ${userId}`);

    return NextResponse.json({ message: 'Project created successfully', project: newProject }, { status: 201 });

  } catch (error) {
    console.error('Error creating project:', error);
    return NextResponse.json({ message: 'Failed to create project', error: error.message }, { status: 500 });
  }
}
