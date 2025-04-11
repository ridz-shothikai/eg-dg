import { NextResponse } from 'next/server';
import { getServerSession } from "next-auth/next";
import { authOptions } from "@/app/api/auth/[...nextauth]/route"; // Adjust path as needed
import User from '@/models/User'; // Assuming User model path
import dbConnect from '@/lib/db'; // Assuming dbConnect utility path
import bcrypt from 'bcryptjs';

export async function PATCH(request) {
  const session = await getServerSession(authOptions);

  if (!session || !session.user || !session.user.id) {
    return NextResponse.json({ message: 'Unauthorized' }, { status: 401 });
  }

  try {
    await dbConnect();

    const userId = session.user.id;
    const body = await request.json();
    const { name, currentPassword, newPassword } = body;

    // Find the user
    const user = await User.findById(userId);
    if (!user) {
      return NextResponse.json({ message: 'User not found' }, { status: 404 });
    }

    const updates = {};

    // Update name if provided and different
    if (name && name !== user.name) {
      updates.name = name;
    }

    // Update password if provided
    if (newPassword && currentPassword) {
      // Verify current password
      const isMatch = await bcrypt.compare(currentPassword, user.password);
      if (!isMatch) {
        return NextResponse.json({ message: 'Incorrect current password' }, { status: 400 });
      }
      // Hash new password
      const salt = await bcrypt.genSalt(10);
      updates.password = await bcrypt.hash(newPassword, salt);
    } else if (newPassword && !currentPassword) {
        // Prevent setting new password without current password verification
         return NextResponse.json({ message: 'Current password is required to set a new password' }, { status: 400 });
    }

    // Check if there are any updates to perform
    if (Object.keys(updates).length === 0) {
      return NextResponse.json({ message: 'No changes provided' }, { status: 400 });
    }

    // Apply updates
    const updatedUser = await User.findByIdAndUpdate(userId, updates, { new: true }).select('-password'); // Exclude password from response

    if (!updatedUser) {
       return NextResponse.json({ message: 'Failed to update profile' }, { status: 500 });
    }

    // Note: Updating the session directly from API route is complex.
    // The client-side `update` function from `useSession` is preferred after a successful API call.

    return NextResponse.json({ message: 'Profile updated successfully', user: updatedUser }, { status: 200 });

  } catch (error) {
    console.error('Profile update error:', error);
    return NextResponse.json({ message: 'Internal Server Error' }, { status: 500 });
  }
}

// Optional: Add GET handler if you want to fetch profile data via API
// export async function GET(request) { ... }
