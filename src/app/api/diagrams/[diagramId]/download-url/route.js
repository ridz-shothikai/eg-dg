import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth/next';
import { authOptions } from '@/app/api/auth/[...nextauth]/route';
import connectMongoDB from '@/lib/db';
import Project from '@/models/Project';
import Diagram from '@/models/Diagram';
import mongoose from 'mongoose';
import { Storage } from '@google-cloud/storage';
import * as constants from '@/constants';
import { URL } from 'url'; // Needed for URL parsing if extracting ID differently

const {
  MONGODB_URI,
  GOOGLE_CLOUD_PROJECT_ID,
  GCS_BUCKET_NAME,
} = constants;

const gcpProjectId = GOOGLE_CLOUD_PROJECT_ID;
const bucketName = GCS_BUCKET_NAME;

// --- Initialize GCS ---
let storage;
let bucket;
try {
  const { GOOGLE_CLOUD_KEYFILE } = constants;
  const storageOptions = { projectId: gcpProjectId };
  if (GOOGLE_CLOUD_KEYFILE) {
    storageOptions.keyFilename = GOOGLE_CLOUD_KEYFILE;
  }
  storage = new Storage(storageOptions);
  bucket = storage.bucket(bucketName);
  console.log("GCS initialized for download URL generation.");
} catch (e) {
  console.error("Failed to initialize Google Cloud Storage for download URL:", e);
}

// GET handler to generate a signed URL for a diagram
export async function GET(request, { params }) { // Use params from context
  const { diagramId } = params; // Get diagramId from dynamic route segment

  if (!diagramId || !mongoose.Types.ObjectId.isValid(diagramId)) {
    return NextResponse.json({ message: 'Invalid Diagram ID' }, { status: 400 });
  }

  if (!bucket) {
    return NextResponse.json({ message: 'GCS not initialized on server' }, { status: 500 });
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
    } else {
      return NextResponse.json({ message: 'Unauthorized' }, { status: 401 });
    }

    await connectMongoDB();

    // 1. Fetch Diagram and its Project to verify ownership/guest access
    const diagram = await Diagram.findById(diagramId).populate('project', '_id owner guestOwnerId'); // Populate necessary project fields

    if (!diagram || !diagram.project) {
      return NextResponse.json({ message: 'Diagram or associated Project not found' }, { status: 404 });
    }

    // 2. Authorization check
    const project = diagram.project;
    if (userId) { // Authenticated user
      if (!project.owner || project.owner.toString() !== userId) {
        return NextResponse.json({ message: 'Forbidden' }, { status: 403 });
      }
    } else if (isGuest) { // Guest user
      if (!project.guestOwnerId || project.guestOwnerId !== guestIdHeader) {
        return NextResponse.json({ message: 'Forbidden (Guest Access Denied)' }, { status: 403 });
      }
    } else {
      // Should not happen due to initial check
      return NextResponse.json({ message: 'Unauthorized' }, { status: 401 });
    }

    // 3. Check if storagePath exists
    if (!diagram.storagePath || !diagram.storagePath.startsWith(`gs://${bucketName}/`)) {
      console.error(`Invalid or missing storagePath for diagram ${diagramId}: ${diagram.storagePath}`);
      return NextResponse.json({ message: 'File storage path is invalid or missing' }, { status: 500 });
    }

    // 4. Generate Signed URL
    const gcsFileName = diagram.storagePath.substring(`gs://${bucketName}/`.length);
    const options = {
      version: 'v4', // Recommended version
      action: 'read',
      expires: Date.now() + 5 * 60 * 1000, // 5 minutes
      // Prompt browser to download with original filename
      responseDisposition: `attachment; filename="${diagram.fileName}"`,
    };

    console.log(`Generating signed URL for GCS file: ${gcsFileName}`);
    const [signedUrl] = await bucket.file(gcsFileName).getSignedUrl(options);
    console.log(`Generated signed URL successfully for diagram ${diagramId}`);

    // 5. Return the Signed URL
    return NextResponse.json({ signedUrl }, { status: 200 });

  } catch (error) {
    console.error(`Error generating signed URL for diagram ${diagramId}:`, error);
    return NextResponse.json({ message: 'Failed to generate download URL', error: error.message }, { status: 500 });
  }
}
