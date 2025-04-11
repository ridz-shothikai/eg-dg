'use client';

import React from 'react';
import FileUpload from '@/components/FileUpload';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { useSession } from 'next-auth/react';
import { useRouter } from 'next/navigation';
import { useEffect } from 'react';

export default function ProjectUploadPage() {
  const { projectId } = useParams();
  const { data: session, status } = useSession();
  const router = useRouter();

  useEffect(() => {
    if (status === 'loading') return; // Do nothing while loading
    if (status === 'unauthenticated') {
      router.push('/login'); // Redirect to login if not authenticated
    }
    // Add authorization check later: ensure user owns this project
  }, [session, status, router]);

  if (status === 'loading') {
     return <div className="min-h-screen flex items-center justify-center bg-gray-900 text-white">Loading...</div>;
  }

  if (status === 'authenticated') {
    return (
      <div className="min-h-screen bg-gray-900 text-white p-8">
        <div className="max-w-4xl mx-auto">
          <div className="mb-8">
            <Link href={`/project/${projectId}`}> {/* Link back to project page */}
              <span className="text-indigo-400 hover:text-indigo-300">&larr; Back to Project</span>
            </Link>
          </div>
          <h1 className="text-3xl font-bold mb-6 text-center">Upload Documents to Project</h1>
          <p className="text-center text-gray-400 mb-4">Project ID: {projectId}</p>
          {/* Pass multiple=true to FileUpload component if needed, or handle within FileUpload */}
          <FileUpload projectId={projectId} /> {/* Pass projectId */}
        </div>
      </div>
    );
  }

  // Should be redirected by useEffect if unauthenticated
  return null;
}
