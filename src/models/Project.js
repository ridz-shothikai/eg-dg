import mongoose from 'mongoose';

const ProjectSchema = new mongoose.Schema({
  name: {
    type: String,
    required: [true, 'Please provide a project name.'],
    trim: true,
  },
  description: {
    type: String,
    trim: true,
  },
  // Link to the user who owns/created the project
  owner: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: false, // Make owner optional to allow null for guest projects
  },
  // Temporary identifier for guest-created projects
  guestOwnerId: {
    type: String,
    index: true, // Index for efficient lookup during registration
    sparse: true, // Index only documents that have this field
  },
  // Status could be used for tracking project lifecycle (e.g., 'Active', 'Archived')
  status: {
    type: String,
    enum: ['Active', 'Archived', 'Pending'], // Example statuses
    default: 'Active',
  },
  // Array to hold references to diagrams belonging to this project
  diagrams: [{
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Diagram',
  }],
  createdAt: {
    type: Date,
    default: Date.now,
  },
  updatedAt: {
    type: Date,
    default: Date.now,
  },
  // Store chat history for the project
  chatHistory: [
    {
      role: { type: String, enum: ['user', 'model'], required: true },
      text: { type: String, required: true },
      timestamp: { type: Date, default: Date.now }
    }
  ]
});

// Middleware to update `updatedAt` field before saving
ProjectSchema.pre('save', function(next) {
  this.updatedAt = Date.now();
  next();
});

// Avoid recompiling the model if it already exists
export default mongoose.models.Project || mongoose.model('Project', ProjectSchema);
