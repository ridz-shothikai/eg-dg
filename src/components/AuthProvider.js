'use client'; // This component uses context, so it must be a Client Component

import { SessionProvider } from 'next-auth/react';
import React from 'react';

export default function AuthProvider({ children, session }) {
  // The session prop is recommended for server-side rendering optimization,
  // but SessionProvider can also fetch the session client-side.
  return (
    <SessionProvider session={session}>
      {children}
    </SessionProvider>
  );
}
