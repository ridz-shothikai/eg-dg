'use client';

import React, { useState, useEffect } from 'react'; // Import useState
import FileUpload from '@/components/FileUpload';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { useSession } from 'next-auth/react';
import { useRouter } from 'next/navigation';

export default function ProjectUploadPage() {
  const { projectId } = useParams();
  const { data: session, status } = useSession();
  const router = useRouter();
  const [isGuestAllowed, setIsGuestAllowed] = useState(false); // State to track allowed guests

  useEffect(() => {
    if (status === 'loading') return; // Do nothing while loading
    if (status === 'unauthenticated') {
      // Check for guestId before redirecting
      const guestId = localStorage.getItem('guestId');
      if (!guestId) {
        router.push('/login'); // Redirect only if unauthenticated AND no guestId
      } else {
        setIsGuestAllowed(true); // Allow rendering if guestId exists
      }
    } else {
      setIsGuestAllowed(false); // Ensure it's false if authenticated or loading
    }
    // Add authorization check later: ensure user owns this project
  }, [session, status, router]);

  if (status === 'loading') {
     return <div className="min-h-screen flex items-center justify-center bg-gray-900 text-white">Loading...</div>;
  }

  // Render if authenticated OR if guest is allowed
  if (status === 'authenticated' || isGuestAllowed) {
    return (
      // Removed flex, flex-col, h-full. Let nested layout handle height/scroll.
      <div className="bg-gray-900 text-white p-8">
        {/* Back link section */}
        <div className="mb-8">
          <Link href={`/dashboard/project/${projectId}`}>
            <span className="text-indigo-400 hover:text-indigo-300">&larr; Back to Project</span>
          </Link>
        </div>
        {/* Removed inner scrollable div wrapper */}
        {/* Centering container */}
        <div className="max-w-4xl mx-auto">
          {/* Removed mb-6 from h1 */}
          <h1 className="text-3xl font-bold text-center">Upload Documents to Project</h1>
          {/* Removed Project ID paragraph */}
          <FileUpload projectId={projectId} /> {/* FileUpload component likely contains the list that needs scrolling */}
        </div>
      </div>
    );
  }

  // Should be redirected by useEffect if unauthenticated
  return null;
}
