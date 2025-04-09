import mongoose from 'mongoose';
import bcrypt from 'bcryptjs';
import User from '@/models/User';
import Project from '@/models/Project'; // Import Project model
import Diagram from '@/models/Diagram'; // Import Diagram model
import { NextResponse } from 'next/server';
import * as constants from '@/constants';

const { MONGODB_URI } = constants;
const mongodbUri = MONGODB_URI; // User-provided connection string

async function connectMongoDB() {
  try {
    if (mongoose.connection.readyState !== 1) {
      await mongoose.connect(mongodbUri);
      console.log('Connected to MongoDB');
    }
  } catch (error) {
    console.error('MongoDB connection error:', error);
    throw error; // Re-throw to be caught by the handler
  }
}

export async function POST(request) {
  try {
    await connectMongoDB();

    // Extract guestId along with other fields
    const { name, email, password, guestId } = await request.json();

    if (!email || !password) {
      return NextResponse.json({ message: 'Email and password are required' }, { status: 400 });
    }

    // Check if the email is already registered
    const existingUser = await User.findOne({ email });
    if (existingUser) {
      return NextResponse.json({ message: 'Email already registered' }, { status: 400 });
    }

    // Hash the password
    const hashedPassword = await bcrypt.hash(password, 10); // 10 is the salt rounds

    // Create a new user
    const newUser = new User({
      name: name, // Optional name field
      email: email,
      password: hashedPassword,
    });

    await newUser.save();
    const newUserId = newUser._id; // Get the new user's ID

    console.log(`New user registered: ${email} with ID: ${newUserId}`);

    // --- Associate Guest Data ---
    if (guestId) {
      console.log(`Associating data for guestId: ${guestId} with userId: ${newUserId}`);
      try {
        // Update Projects
        const projectUpdateResult = await Project.updateMany(
          { guestOwnerId: guestId },
          { $set: { owner: newUserId }, $unset: { guestOwnerId: "" } }
        );
        console.log(`Projects updated for guestId ${guestId}:`, projectUpdateResult);

        // Update Diagrams
        const diagramUpdateResult = await Diagram.updateMany(
          { guestUploaderId: guestId },
          { $set: { uploadedBy: newUserId }, $unset: { guestUploaderId: "" } }
        );
        console.log(`Diagrams updated for guestId ${guestId}:`, diagramUpdateResult);

      } catch (assocError) {
        console.error(`Error associating guest data for guestId ${guestId} with userId ${newUserId}:`, assocError);
        // Log the error but don't fail the registration
      }
    }
    // --- End Associate Guest Data ---


    // Sign in the user after successful registration
    // const result = await signIn('credentials', {
    //   redirect: false, // Don't redirect automatically, handle it manually
    //   email: email,
    //   password: password,
    // });

    // if (result?.error) {
    //   console.error("Auto-login failed:", result.error);
    //   return NextResponse.json({ message: 'User registered successfully, but auto-login failed.', error: result.error }, { status: 201 });
    // }

    // Redirect to dashboard after successful signup and auto-login
    return NextResponse.json({ message: 'User registered successfully', redirect: '/dashboard' }, { status: 201 });

  } catch (error) {
    console.error('Registration error:', error);
    // Enhanced error logging (include stack trace if available)
    const errorMessage = error.message || 'Registration failed';
    const errorDetails = error.stack || error;

    // Log the detailed error to a file or external service in a production environment
    // Example: logger.error('Registration error', { error: errorDetails });

    return NextResponse.json({ message: errorMessage, error: errorDetails }, { status: 500 });
  }
}
