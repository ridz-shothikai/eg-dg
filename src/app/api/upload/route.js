import { Storage } from '@google-cloud/storage';
import mongoose from 'mongoose';
import Diagram from '@/models/Diagram';
import Project from '@/models/Project'; // Import Project model
import { ImageAnnotatorClient } from '@google-cloud/vision';
import { GoogleGenerativeAI } from "@google/generative-ai";
import { NextResponse } from 'next/server';
import { getServerSession } from "next-auth/next";
import { authOptions } from "@/app/api/auth/[...nextauth]/route";
import fs from 'fs/promises'; // Import fs promises
import path from 'path'; // Import path
import * as constants from '@/constants';
import { generateContentWithRetry } from '@/lib/geminiUtils';
import { prepareDiagramInBackground } from '@/lib/backgroundTasks'; // Import the background task trigger
import { DxfParser } from 'dxf-parser'; // Import DXF parser
import { convertDwgToDxf } from '@/lib/cloudConvertUtils';

const {
  MONGODB_URI,
  GOOGLE_CLOUD_PROJECT_ID,
  GCS_BUCKET_NAME,
  GOOGLE_AI_STUDIO_API_KEY,
} = constants;

const gcpProjectId = GOOGLE_CLOUD_PROJECT_ID; // Renamed to avoid conflict
const bucketName = GCS_BUCKET_NAME;
const mongodbUri = MONGODB_URI;
const geminiApiKey = GOOGLE_AI_STUDIO_API_KEY;

// Check if Gemini API key is available
if (!geminiApiKey) {
  console.warn("GOOGLE_AI_STUDIO_API_KEY environment variable is not set. Gemini integration will be disabled.");
}

// --- GCS Setup ---
const storage = new Storage({
  projectId: gcpProjectId,
  keyFilename: 'sa.json',
});
const bucket = storage.bucket(bucketName);

// --- Initialize Cloud Vision API client ---
const vision = new ImageAnnotatorClient({
  projectId: gcpProjectId,
  keyFilename: 'sa.json',
});

// --- Initialize Gemini Pro model (for initial summary) ---
let gemini = null;
if (geminiApiKey) {
  try {
    const genAI = new GoogleGenerativeAI(geminiApiKey);
    gemini = genAI.getGenerativeModel({ model: "gemini-2.5-flash-preview-04-17" });
  } catch (e) {
    console.error("Failed to initialize Gemini model for summary:", e);
  }
}

// --- MongoDB Connection ---
async function connectMongoDB() {
  try {
    if (mongoose.connection.readyState !== 1) {
      await mongoose.connect(mongodbUri);
      console.log('Connected to MongoDB');
    }
  } catch (error) {
    console.error('MongoDB connection error:', error);
    throw error;
  }
}

// --- API Route Handler ---
export async function POST(request) {
  try {
    await connectMongoDB();

    const formData = await request.formData();
    const file = formData.get('file');
    const projectId = formData.get('projectId'); // Get projectId from form data

    if (!file) {
      return NextResponse.json({ message: 'No file uploaded' }, { status: 400 });
    }
    if (!projectId || !mongoose.Types.ObjectId.isValid(projectId)) { // Validate projectId
      return NextResponse.json({ message: 'Project ID is missing or invalid' }, { status: 400 });
    }

    // Declare guestId at the top level of the function scope
    let guestId = null;

    const buffer = Buffer.from(await file.arrayBuffer());
    const fileName = file.name;
    const fileNameWithoutExtension = fileName.replace(/\.[^/.]+$/, ""); // removing extention from the file name
    console.log(fileNameWithoutExtension, "fileNameWithoutExtension")
    let fileType = fileName.split('.').pop()?.toLowerCase(); // Get file type and convert to lowercase
    const fileSize = file.size;

    // --- Upload to GCS ---
    const gcsFileName = `${Date.now()}-${fileName}`;
    const gcsFile = bucket.file(gcsFileName);

    await gcsFile.save(buffer, {
      metadata: { contentType: file.type },
    });
    console.log(`File ${fileName} uploaded to GCS as ${gcsFileName}`);
    const storagePath = `gs://${bucketName}/${gcsFileName}`;

    // --- Save copy to local /tmp directory (Vercel writable) ---
    const projectTempDir = '/tmp'; // Use Vercel's writable directory
    await fs.mkdir(projectTempDir, { recursive: true }); // Ensure /tmp exists (usually does, but safe)
    // Use the GCS filename for consistency in the temp dir
    const tempFilePath = path.join(projectTempDir, gcsFileName);
    try {
        await fs.writeFile(tempFilePath, buffer);
        console.log(`File copy saved locally to ${tempFilePath}`);
    } catch (tempSaveError) {
        console.error(`Failed to save file copy to temp directory ${tempFilePath}:`, tempSaveError);
        // Decide if this is a critical error or just a warning
        // For now, log a warning and continue
        console.warn(`Continuing upload process despite failure to save local temp copy.`);
    }
    // --- End save copy ---


    let ocrText = null;
    let parsedDataJson = null;
    let parsedContentDetailedText = null;
    let geminiResponse = null; // Keep this for potential future use or if we add a DXF specific summary

    let originalFileType = fileType; // Store the original file type
    let processedTempFilePath = tempFilePath; // Store the path to the processed file

    // --- Handle DWG files by converting to DXF first ---
    if (fileType === 'dwg') {
     try {
      console.log('Converting DWG file to DXF format...');
      // Create a directory for the converted file
      const convertedDir = path.join(projectTempDir, 'converted');
      await fs.mkdir(convertedDir, { recursive: true });

      // Get the file name without extension
      const convertedFilePath = path.join(convertedDir, `${path.basename(fileName, '.dwg')}.dxf`);

      // Convert DWG to DXF
      processedTempFilePath = await convertDwgToDxf(tempFilePath, convertedDir, fileNameWithoutExtension);

      // Update file type to DXF for furthur processing
      originalFileType = 'dwg'; // Keep track of the original file format
      fileType = 'dxf'; // PProcess as DXF

      console.log(`DWG file converted to DXF: ${processedTempFilePath}`);
     } catch (conversionError) {
      console.log('DWG to DXF conversion error:', conversionError);
      return NextResponse.json({
        message: 'Failed to convert DWG file to DXF format',
        error: conversionError.message,
      }, { status: 500 });
     }
    }

    if (fileType === 'dxf') {
        console.log('Processing DXF file...');
        try {
          // Read the DXF file content
          const dxfContent = await fs.readFile(processedTempFilePath, 'utf-8');
          
            const parser = new DxfParser();
            const dxfData = parser.parseSync(dxfContent); // dxf-parser expects a string
            parsedDataJson = dxfData; // Store the structured data

            // --- Generate Detailed Text Representation from DXF Data ---
            let textSummary = 'DXF File Analysis:\n\n';

            // Basic summary
            textSummary += `Summary:\n`;
            textSummary += `- File Name: ${fileName}\n`;
            textSummary += `- File Size: ${(fileSize / 1024).toFixed(2)} KB\n`;
            textSummary += `- Layers: ${Object.keys(dxfData.tables?.layer?.layers || {}).length}\n`;
            textSummary += `- Entities: ${dxfData.entities?.length || 0}\n`;

            // Header information
            if (dxfData.header) {
                textSummary += `\nHeader Information:\n`;
                textSummary += `- Drawing Units: ${dxfData.header.INSUNITS || 'Not specified'}\n`;
                textSummary += `- Drawing Extents: (${dxfData.header.EXTMIN?.x || 0}, ${dxfData.header.EXTMIN?.y || 0}) to (${dxfData.header.EXTMAX?.x || 0}, ${dxfData.header.EXTMAX?.y || 0})\n`;

                // Add more header information as needed
                if (dxfData.header.ACADVER) {
                    textSummary += `- AutoCAD Version: ${dxfData.header.ACADVER}\n`;
                }
            }

            // Add Layer details
            textSummary += `\nLayers:\n`;
            if (dxfData.tables?.layer?.layers) {
                for (const layerName in dxfData.tables.layer.layers) {
                    const layer = dxfData.tables.layer.layers[layerName];
                    textSummary += `- Layer Name: ${layer.name} (Color: ${layer.color}, Visible: ${!layer.hidden})\n`;
                }
            } else {
                textSummary += `- No layer information found\n`;
            }

            // Entity analysis
            if (dxfData.entities && dxfData.entities.length > 0) {
                // Count entities by type
                const entityCounts = {};
                const textEntities = [];
                const dimensionEntities = [];
                const insertEntities = [];
                const lineEntities = [];
                const circleEntities = [];
                const arcEntities = [];
                const polylineEntities = [];

                for (const entity of dxfData.entities) {
                    entityCounts[entity.type] = (entityCounts[entity.type] || 0) + 1;

                    // Collect specific entity types for detailed analysis
                    if (entity.type === 'TEXT' || entity.type === 'MTEXT') {
                        textEntities.push(entity);
                    } else if (entity.type === 'DIMENSION') {
                        dimensionEntities.push(entity);
                    } else if (entity.type === 'INSERT') {
                        insertEntities.push(entity);
                    } else if (entity.type === 'LINE') {
                        lineEntities.push(entity);
                    } else if (entity.type === 'CIRCLE') {
                        circleEntities.push(entity);
                    } else if (entity.type === 'ARC') {
                        arcEntities.push(entity);
                    } else if (entity.type === 'POLYLINE' || entity.type === 'LWPOLYLINE') {
                        polylineEntities.push(entity);
                    }
                }

                // Entity type summary
                textSummary += `\nEntity Types:\n`;
                for (const type in entityCounts) {
                    textSummary += `- ${type}: ${entityCounts[type]}\n`;
                }

                // Text content (important for Gemini to understand labels)
                if (textEntities.length > 0) {
                    textSummary += `\nText Content:\n`;
                    textEntities.forEach(entity => {
                        const text = entity.text || entity.string || 'No text content';
                        textSummary += `- "${text}" (Layer: ${entity.layer}, Position: ${entity.position?.x.toFixed(2)}, ${entity.position?.y.toFixed(2)})\n`;
                    });
                }

                // Dimensions (important for measurements)
                if (dimensionEntities.length > 0) {
                    textSummary += `\nDimensions:\n`;
                    dimensionEntities.forEach(entity => {
                        const measurement = entity.measurement || entity.actual_measurement || 'Unknown';
                        textSummary += `- Value: ${measurement} (Layer: ${entity.layer})\n`;
                    });
                }

                // Block references
                if (insertEntities.length > 0) {
                    textSummary += `\nBlock References:\n`;
                    insertEntities.forEach(entity => {
                        textSummary += `- Block: ${entity.name}, Insertion Point: (${entity.position?.x.toFixed(2)}, ${entity.position?.y.toFixed(2)}) (Layer: ${entity.layer})\n`;
                    });
                }

                // Geometric analysis (sample of key elements)
                // Lines
                if (lineEntities.length > 0) {
                    textSummary += `\nLine Sample (first 10 of ${lineEntities.length}):\n`;
                    lineEntities.slice(0, 10).forEach(entity => {
                        textSummary += `- Line from (${entity.vertices[0].x.toFixed(2)}, ${entity.vertices[0].y.toFixed(2)}) to (${entity.vertices[1].x.toFixed(2)}, ${entity.vertices[1].y.toFixed(2)}) (Layer: ${entity.layer})\n`;
                    });
                }

                // Circles
                if (circleEntities.length > 0) {
                    textSummary += `\nCircle Sample (first 10 of ${circleEntities.length}):\n`;
                    circleEntities.slice(0, 10).forEach(entity => {
                        textSummary += `- Circle at (${entity.center.x.toFixed(2)}, ${entity.center.y.toFixed(2)}) with radius ${entity.radius.toFixed(2)} (Layer: ${entity.layer})\n`;
                    });
                }
            } else {
                textSummary += `\nNo entities found in the DXF file.\n`;
            }

            // Add information about blocks if available
            if (dxfData.blocks && Object.keys(dxfData.blocks).length > 0) {
                textSummary += `\nBlocks:\n`;
                for (const blockName in dxfData.blocks) {
                    const block = dxfData.blocks[blockName];
                    textSummary += `- Block Name: ${block.name}, Entities: ${block.entities?.length || 0}\n`;
                }
            }

            parsedContentDetailedText = textSummary;
            console.log('DXF parsed and detailed text representation generated.');

            // Add information about original format if converted
            if (originalFileType === 'dwg') {
              parsedContentDetailedText += '\n\nNote: This file was originally uploaded as a DWG file and automatically converted to DXF format for processing.';
            }

        } catch (parseError) {
            console.error('DXF parsing error:', parseError);
            parsedDataJson = { error: parseError.message };
            parsedContentDetailedText = `Error parsing DXF file: ${parseError.message}`;
        }

        // Skip OCR and synchronous Gemini summary for DXF
        ocrText = null;
        geminiResponse = null;
    } else { // <-- Added else for image processing try/catch
      // --- Existing logic for image files (OCR and synchronous Gemini summary) ---
      try { // <-- Inner try block for image processing
        // --- Call Cloud Vision API for OCR ---
        try {
          // Use GCS path for Vision API
          const [result] = await vision.textDetection(storagePath);
          if (result.fullTextAnnotation) {
            ocrText = result.fullTextAnnotation.text;
            console.log('OCR text extracted successfully.');
          } else {
            console.log('No text detected by OCR.');
            ocrText = '';
          }
        } catch (ocrError) {
          console.error('OCR error:', ocrError);
          // Continue even if OCR fails, just won't have text
        }

        // --- Call Gemini API for initial analysis/summary (Optional) ---
        if (gemini && ocrText) {
          try {
            const prompt = `Summarize the key components, materials, and dimensions mentioned in this OCR text from an engineering diagram:\n\n${ocrText}`;
            // Use generateContentWithRetry for the summary
            const result = await generateContentWithRetry(
                gemini,
                prompt, // Simple text prompt
                3, // maxRetries
                (attempt, max) => console.log(`Retrying Gemini summary (${attempt}/${max})...`) // Simple log on retry
            );
            const response = result.response; // Result is already awaited
            geminiResponse = response.text(); // Use text() method
            console.log('Gemini initial summary generated.');
          } catch (geminiError) {
            console.error('Gemini summary error:', geminiError);
          }
        } else {
      console.warn("Skipping synchronous Gemini initial summary.");
        }
        // --- End existing logic ---
      } catch (innerError) { // <-- Inner catch block for image processing
          console.error('Error during image file processing:', innerError);
          // Decide how to handle inner errors - maybe set a specific status or message
          // For now, just log and continue, the main catch will handle overall failure
      }
    }


// --- REMOVED Synchronous BoM/Compliance Extraction ---
// These will be handled by the background task


// --- Get User Session (if available) ---
let userId = null;
const session = await getServerSession(authOptions);
if (session && session.user && session.user.id) {
userId = session.user.id; // Set userId if session exists
}

 // --- Verify Project Exists and Ownership/Guest Status ---
 const project = await Project.findById(projectId);
 if (!project) {
   // Clean up GCS file if project is invalid? Maybe not for now.
   return NextResponse.json({ message: 'Project not found' }, { status: 404 });
 }

 // Check ownership based on whether a user is logged in or it's a guest upload
 if (userId) {
   // Logged-in user: Check if they own the project
   if (!project.owner || project.owner.toString() !== userId) {
     return NextResponse.json({ message: 'Forbidden: You do not own this project' }, { status: 403 });
   }
 } else {
   // Guest user: Check if the project is a guest project (has guestOwnerId)
   if (!project.guestOwnerId) {
     // If owner is also null, it's an orphaned project - potentially block?
     // For now, treat as forbidden if it's not explicitly a guest project
     return NextResponse.json({ message: 'Forbidden: Project owner information missing' }, { status: 403 });
   }
   // Store the guestId for saving to the diagram
   guestId = project.guestOwnerId;
 }

// --- Create Diagram record in MongoDB ---
const diagramData = {
fileName: fileName,
storagePath: storagePath,
fileType: originalFileType || fileType, // Stroe the original file type
fileSize: fileSize,
project: projectId,
uploadedBy: userId, // Will be null for guest uploads
processingStatus: 'PENDING', // Set initial status to PENDING
// Add parsed data fields
parsedDataJson: parsedDataJson,
parsedContentDetailedText: parsedContentDetailedText,
// ocrText and geminiResponse are included if processed for image files
ocrText: ocrText,
geminiInitialSummary: geminiResponse, // Store the initial summary if generated
};

// Add guestUploaderId if it's a guest upload
if (guestId) {
diagramData.guestUploaderId = guestId;
}

const newDiagram = new Diagram(diagramData);

await newDiagram.save();

// Add diagram reference to the Project document
await Project.findByIdAndUpdate(projectId, { $push: { diagrams: newDiagram._id } });

console.log(`File ${fileName} saved to DB for project ${projectId} with status PENDING.`);

// --- Trigger background preparation task (DO NOT await this) ---
prepareDiagramInBackground(newDiagram._id.toString())
  .then(() => console.log(`Background preparation initiated for diagram ${newDiagram._id}`))
  .catch(err => console.error(`Failed to initiate background preparation for diagram ${newDiagram._id}:`, err));
// --- End trigger ---

// Return immediately after saving and triggering
return NextResponse.json({ message: 'File upload accepted, processing started.', diagramId: newDiagram._id }, { status: 202 }); // Use 202 Accepted status

} catch (error) { // <-- Outer catch block for the whole function
  console.error('File upload error:', error);
  const errorMessage = error.message || 'File upload failed';
  const errorDetails = error.stack || error;
  return NextResponse.json({ message: errorMessage, error: errorDetails }, { status: 500 });
}
}

// --- Configure API route to disable body parsing ---
export const config = {
api: {
bodyParser: false,
},
};