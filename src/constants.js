export const MONGODB_URI = process.env.MONGODB_URI || 'mongodb+srv://Shothik_AI:qFP1zpllgBJ0FHAw@cluster0.69zqaep.mongodb.net/eg-dg?retryWrites=true&w=majority';
export const GOOGLE_CLOUD_PROJECT_ID = process.env.GOOGLE_CLOUD_PROJECT_ID || 'shothikai-gcp';
export const GCS_BUCKET_NAME = process.env.GCS_BUCKET_NAME || 'shothik';
export const GOOGLE_CLOUD_KEYFILE = process.env.GOOGLE_CLOUD_KEYFILE || 'sa.json'; // Added GOOGLE_CLOUD_KEYFILE
export const GOOGLE_AI_STUDIO_API_KEY = process.env.GOOGLE_AI_STUDIO_API_KEY || 'AIzaSyCw2TwH_acyWce57BMJ72yGfNqH0CNQj7g';
export const NEXTAUTH_SECRET = process.env.NEXTAUTH_SECRET || 'YOUR_NEXTAUTH_SECRET_PLACEHOLDER';

// CloudConvert API Key
export const CLOUDCONVERT_API_KEY = process.env.CLOUDCONVERT_API_KEY || '';

// Pinecone Configuration
export const PINECONE_API_KEY = process.env.PINECONE_API_KEY || 'pcsk_6JSRtj_GcYThJiEoT96cuLZYncFR7i6mBs5Adj1qkdqtzsn44Mbs69ymfA7Ezz4uYGtDsJ'; // Replace with your Pinecone API Key
export const PINECONE_ENVIRONMENT = process.env.PINECONE_ENVIRONMENT || 'us-east-1'; // Replace with your Pinecone Environment
export const PINECONE_INDEX_NAME = process.env.PINECONE_INDEX_NAME || 'eg-dg'; // Replace with your Pinecone Index Name
