import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth/next';
import { authOptions } from '@/app/api/auth/[...nextauth]/route';
import connectMongoDB from '@/lib/db';
import Project from '@/models/Project';
import Diagram from '@/models/Diagram';
import mongoose from 'mongoose';
import { Storage } from '@google-cloud/storage';
import fs from 'fs/promises';
import path from 'path';
import * as constants from '@/constants';

const { GCS_BUCKET_NAME, GOOGLE_CLOUD_PROJECT_ID, GOOGLE_CLOUD_KEYFILE } = constants;

// --- Initialize GCS Storage ---
let storage = null;
if (GOOGLE_CLOUD_PROJECT_ID && GCS_BUCKET_NAME) {
    try {
        const { GOOGLE_CLOUD_KEYFILE } = constants;
        const storageOptions = { projectId: GOOGLE_CLOUD_PROJECT_ID };
        if (GOOGLE_CLOUD_KEYFILE) {
            storageOptions.keyFilename = GOOGLE_CLOUD_KEYFILE;
            console.log(`Sync API: GCS Storage client initialized using keyfile ${GOOGLE_CLOUD_KEYFILE} for bucket: ${GCS_BUCKET_NAME}`);
        } else {
            console.log(`Sync API: GCS Storage client initialized using default credentials (ADC) for bucket: ${GCS_BUCKET_NAME}`);
        }
        storage = new Storage(storageOptions);
    } catch (e) {
        console.error("Sync API: Failed to initialize GCS Storage client:", e);
    }
} else {
    console.warn("Sync API: GCS_BUCKET_NAME or GOOGLE_CLOUD_PROJECT_ID not set. GCS download functionality will be disabled.");
}

// POST handler for syncing files to local temp cache
export async function POST(request, { params }) {
    // Await params before accessing properties
    const awaitedParams = await params;
    const { projectId } = awaitedParams;
    // Consume body *after* accessing params if needed, though likely not necessary for sync
    // await request.text();

    if (!projectId || !mongoose.Types.ObjectId.isValid(projectId)) {
        return NextResponse.json({ message: 'Invalid Project ID' }, { status: 400 });
    }
    if (!storage || !GCS_BUCKET_NAME) {
        return NextResponse.json({ message: 'File sync is disabled (GCS not initialized)' }, { status: 503 });
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
            console.log(`Sync Files API: Guest access attempt with ID: ${guestIdHeader}`);
        } else {
            // No session and no guest header
            return NextResponse.json({ message: 'Unauthorized' }, { status: 401 });
        }

        await connectMongoDB();

        // Fetch Project and verify ownership OR guest access
        const project = await Project.findById(projectId);

        if (!project) {
            return NextResponse.json({ message: 'Project not found' }, { status: 404 });
        }

        // Authorization check
        if (userId) { // Authenticated user
            if (!project.owner || project.owner.toString() !== userId) {
                return NextResponse.json({ message: 'Forbidden' }, { status: 403 });
            }
        } else if (isGuest) { // Guest user
            if (!project.guestOwnerId || project.guestOwnerId !== guestIdHeader) {
                console.log(`Sync Files API: Guest ID mismatch: Header=${guestIdHeader}, Project=${project.guestOwnerId}`);
                return NextResponse.json({ message: 'Forbidden (Guest Access Denied)' }, { status: 403 });
            }
        } else {
            return NextResponse.json({ message: 'Unauthorized' }, { status: 401 }); // Should not happen
        }
        // Authorization passed

        // Fetch diagrams ensuring storagePath exists
        const diagrams = await Diagram.find({
            project: projectId,
            storagePath: { $exists: true, $ne: null, $ne: '' }
        }).select('fileName storagePath');

        if (diagrams.length === 0) {
            console.log(`Sync API: No documents with storage paths found for project ${projectId}. Nothing to sync.`);
            return NextResponse.json({ message: "No documents found to sync.", synced: 0, skipped: 0, errors: 0 }, { status: 200 });
        }

        // --- Check local /tmp and download missing files ---
        console.log(`Sync API: Checking/Syncing ${diagrams.length} files for project ${projectId} to local /tmp...`);
        const projectTempDir = '/tmp'; // Use Vercel's writable directory
        await fs.mkdir(projectTempDir, { recursive: true }); // Ensure /tmp exists (usually does, but safe)

        let syncedCount = 0;
        let skippedCount = 0;
        let errorCount = 0;

        for (const diag of diagrams) {
            // Derive the expected local temp filename (must match upload logic)
            const gcsPrefix = `gs://${GCS_BUCKET_NAME}/`;
            const objectPath = diag.storagePath.startsWith(gcsPrefix)
                ? diag.storagePath.substring(gcsPrefix.length)
                : diag.storagePath;
            const expectedTempFileName = objectPath; // Use the GCS object path as the filename in temp
            const tempFilePath = path.join(projectTempDir, expectedTempFileName);

            try {
                // Check if file already exists locally
                await fs.access(tempFilePath);
                console.log(` -> Skipping: File already exists locally at ${tempFilePath}`);
                skippedCount++;
            } catch (accessError) {
                // File doesn't exist locally, download it
                if (accessError.code === 'ENOENT') {
                    try {
                        console.log(` -> Downloading GCS object: ${objectPath} to local temp: ${tempFilePath}`);
                        await storage.bucket(GCS_BUCKET_NAME).file(objectPath).download({ destination: tempFilePath });
                        console.log(` -> SUCCESS: Synced ${diag.fileName}`);
                        syncedCount++;
                    } catch (downloadError) {
                        console.error(` -> ERROR: Failed to download GCS file ${objectPath} (${diag.fileName}):`, downloadError.message);
                        errorCount++;
                    }
                } else {
                    // Other error accessing file path
                    console.error(` -> ERROR: Checking local file ${tempFilePath}:`, accessError.message);
                    errorCount++;
                }
            }
        }

        console.log(`Sync API: Sync complete for project ${projectId}. Synced: ${syncedCount}, Skipped: ${skippedCount}, Errors: ${errorCount}`);
        return NextResponse.json({ message: "Sync check complete.", synced: syncedCount, skipped: skippedCount, errors: errorCount }, { status: 200 });

    } catch (error) {
        console.error(`Sync API error for project ${projectId}:`, error);
        const errorMessage = error.message || 'Failed to sync files';
        return NextResponse.json({ message: errorMessage, error: error.toString() }, { status: 500 });
    }
}
