import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth/next';
import { authOptions } from '@/app/api/auth/[...nextauth]/route';
import connectMongoDB from '@/lib/db';
import CustomPrompt from '@/models/CustomPrompt';
import User from '@/models/User'; // Needed to ensure User model is registered if populated

// GET handler to fetch custom prompts for the logged-in user
export async function GET(request) {
  try {
    const session = await getServerSession(authOptions);

    if (!session || !session.user || !session.user.id) {
      return NextResponse.json({ message: 'Unauthorized' }, { status: 401 });
    }

    await connectMongoDB();

    const prompts = await CustomPrompt.find({ user: session.user.id }).sort({ createdAt: -1 }); // Sort by newest first

    return NextResponse.json({ prompts }, { status: 200 });

  } catch (error) {
    console.error('Error fetching custom prompts:', error);
    return NextResponse.json({ message: 'Error fetching custom prompts', error: error.message }, { status: 500 });
  }
}

// POST handler to create a new custom prompt
export async function POST(request) {
  try {
    const session = await getServerSession(authOptions);

    if (!session || !session.user || !session.user.id) {
      return NextResponse.json({ message: 'Unauthorized' }, { status: 401 });
    }

    const { title, prompt } = await request.json();

    // Basic validation
    if (!title || !prompt) {
      return NextResponse.json({ message: 'Title and prompt are required.' }, { status: 400 });
    }
    if (title.length > 100) {
       return NextResponse.json({ message: 'Title cannot exceed 100 characters.' }, { status: 400 });
    }


    await connectMongoDB();

    const newPrompt = new CustomPrompt({
      title: title.trim(),
      prompt: prompt.trim(),
      user: session.user.id,
    });

    await newPrompt.save();

    return NextResponse.json(newPrompt, { status: 201 }); // Return the created prompt

  } catch (error) {
    console.error('Error creating custom prompt:', error);
     // Handle potential validation errors from Mongoose
     if (error.name === 'ValidationError') {
        let errors = {};
        Object.keys(error.errors).forEach((key) => {
            errors[key] = error.errors[key].message;
        });
        return NextResponse.json({ message: 'Validation failed', errors }, { status: 400 });
    }
    return NextResponse.json({ message: 'Error creating custom prompt', error: error.message }, { status: 500 });
  }
}
