'use client'; // Make the page component client-side for hooks

import React, { Suspense, useEffect } from 'react';
import { useSession } from 'next-auth/react';
import { useRouter } from 'next/navigation';
import LoginForm from '@/components/LoginForm';
import LoadingSpinner from '@/components/LoadingSpinner';

export default function LoginPage() {
  const { data: session, status } = useSession();
  const router = useRouter();

  useEffect(() => {
    // Redirect to dashboard if user is already authenticated
    if (status === 'authenticated') {
      router.push('/'); // Redirect to root (dashboard)
    }
  }, [status, router]);

  // Show loading while session status is being determined
  if (status === 'loading') {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-900">
        <LoadingSpinner text="Checking session..." />
      </div>
    );
  }

  // Only render login form if not authenticated
  if (status === 'unauthenticated') {
    return (
      // Added flex-grow to make this div fill the space within the main layout's flex container
      <div className="min-h-screen flex flex-grow items-center justify-center bg-gray-900 text-white">
        <Suspense fallback={<LoadingSpinner text="Loading Login..." />}>
          <LoginForm />
        </Suspense>
      </div>
    );
  }

  // Return null or a placeholder if authenticated (should be redirected anyway)
  return null;
}
