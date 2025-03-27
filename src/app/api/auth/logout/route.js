import { signOut } from 'next-auth/react';
import { NextResponse } from 'next/server';
import * as constants from '@/constants';
import connectMongoDB from '@/lib/db';

const { MONGODB_URI } = constants;

export async function POST(request) {
  try {
    // Sign out the user
    await connectMongoDB();
    await signOut();

    // Redirect to the home page after successful logout
    return NextResponse.redirect(new URL('/', request.url));
  } catch (error) {
    console.error('Logout error:', error);
    // Enhanced error logging (include stack trace if available)
    const errorMessage = error.message || 'Logout failed';
    const errorDetails = error.stack || error;

    // Log the detailed error to a file or external service in a production environment
    // Example: logger.error('Logout error', { error: errorDetails });

    return NextResponse.json({ message: errorMessage, error: errorDetails }, { status: 500 });
  }
}
