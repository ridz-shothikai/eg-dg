import NextAuth from 'next-auth';
import CredentialsProvider from 'next-auth/providers/credentials';
// Import other providers like Google, GitHub later if needed
// Import GoogleProvider from 'next-auth/providers/google';
import * as constants from '@/constants';
import connectMongoDB from '@/lib/db';
import User from '@/models/User';
import bcrypt from 'bcryptjs';

const { MONGODB_URI, NEXTAUTH_SECRET } = constants;

export const authOptions = { // Add export here
  providers: [
    CredentialsProvider({
      // The name to display on the sign in form (e.g. 'Sign in with...')
      name: 'Credentials',
      // The credentials is used to generate a suitable form on the sign in page.
      credentials: {
        email: { label: "Email", type: "email", placeholder: "you@example.com" },
        password: { label: "Password", type: "password" }
      },
      async authorize(credentials, req) {
        const { email, password } = credentials;

        try {
          await connectMongoDB();

          const user = await User.findOne({ email }).select('+password'); // Explicitly select password

          if (!user) {
            console.log("No user found with email:", email);
            return null;
          }

          const isPasswordValid = await bcrypt.compare(password, user.password);

          if (!isPasswordValid) {
            console.log("Invalid password for user:", email);
            return null;
          }

          // Omit the password from the user object that will be in the JWT
          // const { password: _password, ...userWithoutPassword } = user.toObject(); // Previous approach

          console.log("Authorization successful for:", email);
          // Explicitly return the object structure expected by the jwt callback
          return {
            id: user._id.toString(),
            email: user.email,
            name: user.name // Include other fields as needed
            // role: user.role
          };

        } catch (error) {
          console.error("Authorization error:", error);
          // Enhanced error logging (include stack trace if available)
          const errorMessage = error.message || 'Authorization failed';
          const errorDetails = error.stack || error;

          // Log the detailed error to a file or external service in a production environment
          // Example: logger.error('Authorization error', { error: errorDetails });

          return null; // Or throw an error if appropriate
        }
      }
    }),
    // Add Google/GitHub providers here later, configured with client IDs/secrets
    // GoogleProvider({
    //   clientId: process.env.GOOGLE_CLIENT_ID,
    //   clientSecret: process.env.GOOGLE_CLIENT_SECRET,
    // }),
  ],
  // Define custom pages if needed (optional)
  // pages: {
  //   signIn: '/login',
  //   // signOut: '/auth/signout',
  //   // error: '/auth/error', // Error code passed in query string as ?error=
  //   // verifyRequest: '/auth/verify-request', // (used for email/magic link sign in)
  //   // newUser: '/auth/new-user' // New users will be directed here on first sign in (leave the property out if not of interest)
  // },
  session: {
    // Use JSON Web Tokens for session strategy
    strategy: 'jwt',
  },
  // Secret for JWT signing and encryption
  // IMPORTANT: Replace 'YOUR_NEXTAUTH_SECRET' with a real secret generated via `openssl rand -base64 32`
  // Store it in your .env.local file as NEXTAUTH_SECRET
  secret: NEXTAUTH_SECRET || 'YOUR_NEXTAUTH_SECRET_PLACEHOLDER',

  // Callbacks can be used to control what happens during actions
  callbacks: {
    async jwt({ token, user }) {
      // Persist the user id from the authorize callback to the JWT token
      if (user) {
        token.id = user.id; // Use user.id as returned by authorize
        // Add other user properties like role if needed
        // token.role = user.role;
      }
      return token;
    },
    async session({ session, token }) {
      // Send properties to the client, like user id and role from the JWT token
      if (token && session.user) {
        session.user.id = token.id;
        // session.user.role = token.role;
      }
      return session;
    },
  },
};

const handler = NextAuth(authOptions);

export { handler as GET, handler as POST };

// --- Environment Variables Required ---
// Create a .env.local file in the root directory and add:
// NEXTAUTH_URL=http://localhost:3000  (Replace with your actual deployment URL in production)
// NEXTAUTH_SECRET=your_generated_secret (Generate with `openssl rand -base64 32`)
// GOOGLE_CLIENT_ID=your_google_client_id (If using Google provider)
// GOOGLE_CLIENT_SECRET=your_google_client_secret (If using Google provider)
// MONGODB_URI=your_mongodb_connection_string (Needed for database adapter/user lookup)
