import mongoose from 'mongoose';

const DiagramSchema = new mongoose.Schema({
  fileName: {
    type: String,
    required: [true, 'Please provide the original file name.'],
  },
  // Store the path/key in Google Cloud Storage
  storagePath: {
    type: String,
    required: [true, 'Storage path is required.'],
    unique: true,
  },
  // URI for the file uploaded to Gemini File API
  geminiFileUri: {
    type: String,
    // Not necessarily unique, could be re-uploaded
  },
  fileType: {
    type: String, // e.g., 'pdf', 'png', 'dwg'
    required: true,
  },
  fileSize: {
    type: Number, // Size in bytes
    required: true,
  },
  // Link to the project this diagram belongs to
  project: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Project',
    required: true, // Re-enable requirement
  },
  // Link to the user who uploaded the diagram
  uploadedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: false, // Make optional for guest uploads
  },
  // Temporary identifier for guest-uploaded diagrams
  guestUploaderId: {
    type: String,
    index: true, // Index for efficient lookup during registration
    sparse: true, // Index only documents that have this field
  },
  // Status of processing (e.g., PENDING, PROCESSING, ACTIVE, FAILED)
  processingStatus: {
    type: String,
    // Added PENDING, PROCESSING, ACTIVE based on background task logic
    enum: ['PENDING', 'PROCESSING', 'ACTIVE', 'FAILED', 'Uploaded', 'OCR Pending', 'OCR Complete', 'Analysis Pending', 'Analysis Complete'],
    default: 'PENDING', // Default to PENDING now
  },
  // Store Gemini upload progress (0-100)
  uploadProgress: {
    type: Number,
    default: 0,
    min: 0,
    max: 100,
  },
  // Store extracted OCR text (can be large, consider alternatives if needed)
  ocrText: {
    type: String,
  },
  // Store structured data from DXF parsing (flexible structure)
  parsedDataJson: {
    type: mongoose.Schema.Types.Mixed, // Allows storing arbitrary JSON-like data
  },
  // Store detailed text representation from DXF parsing for Gemini context
  parsedContentDetailedText: {
    type: String,
  },
  // Store structured data extracted from OCR/Analysis (flexible structure)
  extractedData: {
    type: mongoose.Schema.Types.Mixed, // Allows storing arbitrary JSON-like data
    // Example structure (will evolve based on parsing logic):
    // components: [{ type: 'Beam', id: 'B1', material: 'Concrete', ... }],
    // metadata: { title: 'Sheet 1', revision: 'A', ... }
  },
  // Store BoM/BoQ data if extracted
  billOfMaterials: {
    type: mongoose.Schema.Types.Mixed,
  },
  // Store compliance check results
  complianceResults: {
    type: mongoose.Schema.Types.Mixed,
  },
  // Versioning information (simple example)
  version: {
    type: Number,
    default: 1,
  },
  // Link to previous version if applicable (for comparison feature)
  previousVersion: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Diagram',
  },
  createdAt: {
    type: Date,
    default: Date.now,
  },
  updatedAt: {
    type: Date,
    default: Date.now,
  },
});

// Middleware to update `updatedAt` field before saving
DiagramSchema.pre('save', function(next) {
  this.updatedAt = Date.now();
  next();
});

// Avoid recompiling the model if it already exists
export default mongoose.models.Diagram || mongoose.model('Diagram', DiagramSchema);
