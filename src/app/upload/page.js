'use client';

import React from 'react';
import FileUpload from '@/components/FileUpload'; // Using alias @ for src
import Link from 'next/link';
import { useSession } from 'next-auth/react';
import { useRouter } from 'next/navigation';
import { useEffect } from 'react';

export default function UploadPage() {
  const { data: session, status } = useSession();
  const router = useRouter();

   useEffect(() => {
    if (status === 'loading') return; // Do nothing while loading
    if (status === 'unauthenticated') {
      router.push('/login'); // Redirect to login if not authenticated
    }
  }, [session, status, router]);

  if (status === 'authenticated') {
    return (
      <div className="min-h-screen bg-gray-900 text-white p-8">
        <div className="max-w-4xl mx-auto">
          <div className="mb-8">
            <Link href="/dashboard">
              <span className="text-indigo-400 hover:text-indigo-300">&larr; Back to Dashboard</span>
            </Link>
          </div>
          <h1 className="text-3xl font-bold mb-6 text-center">Upload New Diagram</h1>
          <FileUpload />
          {/* Add options later: assign to project, create new project */}
          <div className="mt-8 text-center">
             <button
               // Placeholder onClick - will trigger actual upload process later
               onClick={() => console.log('Trigger upload process...')}
               className="bg-indigo-600 hover:bg-indigo-500 text-white font-bold py-2 px-6 rounded disabled:opacity-50"
               // Disable button if no files are staged (logic to be added based on FileUpload state)
               // disabled={uploadedFiles.length === 0}
             >
              Start Upload
             </button>
          </div>
        </div>
      </div>
    );
  }

  // Optional: Add a loading state UI
  return <div className="min-h-screen flex items-center justify-center bg-gray-900 text-white">Loading...</div>;
}
