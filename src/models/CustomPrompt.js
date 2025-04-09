import mongoose, { Schema } from 'mongoose';

const customPromptSchema = new Schema(
  {
    title: {
      type: String,
      required: [true, 'Title is required.'],
      trim: true,
      maxlength: [100, 'Title cannot be more than 100 characters'],
    },
    prompt: {
      type: String,
      required: [true, 'Prompt text is required.'],
      trim: true,
    },
    user: {
      type: Schema.Types.ObjectId,
      ref: 'User', // Reference to the User model
      required: true,
      index: true, // Add index for faster querying by user
    },
  },
  { timestamps: true } // Automatically add createdAt and updatedAt fields
);

// Avoid recompiling the model if it already exists
const CustomPrompt = mongoose.models.CustomPrompt || mongoose.model('CustomPrompt', customPromptSchema);

export default CustomPrompt;
