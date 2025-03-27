import mongoose from 'mongoose';

const UserSchema = new mongoose.Schema({
  name: {
    type: String,
    // required: [true, 'Please provide a name.'], // Optional: make name required during signup
  },
  email: {
    type: String,
    required: [true, 'Please provide an email.'],
    unique: true, // Ensure emails are unique
    match: [/.+\@.+\..+/, 'Please provide a valid email address.'], // Basic email format validation
  },
  password: {
    type: String,
    // Required only if using credentials provider, not for OAuth providers
    // We'll handle hashing the password before saving in the registration logic (e.g., using bcrypt)
    // select: false, // Optionally hide password by default when querying users
  },
  // Add roles later for authorization (e.g., 'admin', 'user')
  // role: {
  //   type: String,
  //   enum: ['user', 'admin'],
  //   default: 'user',
  // },
  // Timestamps for creation and updates
  createdAt: {
    type: Date,
    default: Date.now,
  },
  updatedAt: {
    type: Date,
    default: Date.now,
  },
  // You might add fields to link to NextAuth accounts if using OAuth providers
  // e.g., provider: String, providerAccountId: String
});

// Middleware to update `updatedAt` field before saving
UserSchema.pre('save', function(next) {
  this.updatedAt = Date.now();
  next();
});

// Avoid recompiling the model if it already exists
export default mongoose.models.User || mongoose.model('User', UserSchema);
