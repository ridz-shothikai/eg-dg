import React, { Suspense } from 'react';
import LoginForm from '@/components/LoginForm'; // Import the new client component
import LoadingSpinner from '@/components/LoadingSpinner'; // Import a loading component

// This page component remains a Server Component (or can be client if needed, but Suspense is key)
export default function LoginPage() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-900 text-white">
      <Suspense fallback={<LoadingSpinner text="Loading Login..." />}>
        <LoginForm />
      </Suspense>
    </div>
  );
}
