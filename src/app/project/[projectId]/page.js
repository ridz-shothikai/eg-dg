'use client';

import React, { useState, useEffect } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { useSession } from 'next-auth/react';
import LoadingSpinner from '@/components/LoadingSpinner'; // Import the spinner

// Removed direct DB/Model imports

export default function ProjectDetailPage() {
  const { projectId } = useParams();
  const { data: session, status } = useSession();
  const router = useRouter();
  const [project, setProject] = useState(null);
  const [diagrams, setDiagrams] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    if (status === 'loading') return;
    if (status === 'unauthenticated') {
      router.push('/login');
      return;
    }

    async function fetchData() {
      if (!projectId) return; // Don't fetch if projectId is not available yet

      try {
        setLoading(true);
        setError(null);

        // Fetch Project Details and Diagrams from API
        const response = await fetch(`/api/projects/${projectId}`);

        if (!response.ok) {
          if (response.status === 404) {
            throw new Error('Project not found');
          } else if (response.status === 403) {
            throw new Error('Forbidden: You do not own this project');
          } else {
             const errorData = await response.json();
             throw new Error(errorData.message || 'Failed to fetch project data');
          }
        }

        const data = await response.json();
        setProject(data.project);
        setDiagrams(data.diagrams);

      } catch (err) {
        console.error('Error fetching project data:', err);
        setError(err.message);
      } finally {
        setLoading(false);
      }
    }

    if (status === 'authenticated') {
      fetchData();
    }
  }, [projectId, status, router]); // Dependencies

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-900">
        <LoadingSpinner text="Loading project..." />
      </div>
    );
  }

  if (error) {
    return <div className="min-h-screen flex items-center justify-center bg-gray-900 text-white">Error: {error}</div>;
  }

  if (!project) {
    // This case might be covered by the error state, but added for clarity
    return <div className="min-h-screen flex items-center justify-center bg-gray-900 text-white">Project not found.</div>;
  }

  return (
    <div className="p-8">
      <div className="flex justify-between items-center mb-6">
        <h1 className="text-3xl font-bold">Project: {project.name}</h1>
        <Link href={`/project/${projectId}/upload`}>
          <button className="bg-indigo-600 hover:bg-indigo-500 text-white font-bold py-2 px-4 rounded">
            + Upload Diagram
          </button>
        </Link>
      </div>
      {project.description && <p className="text-gray-400 mb-6">{project.description}</p>}

      <div className="bg-gray-800 rounded-lg shadow p-6">
        <h2 className="text-xl font-semibold mb-4">Diagrams</h2>
        {diagrams.length > 0 ? (
          <ul className="space-y-4">
            {diagrams.map((diagram) => (
              <li key={diagram._id} className="bg-gray-700 p-4 rounded flex justify-between items-center">
                <span className="font-medium">{diagram.fileName}</span>
                <span className="text-gray-400 text-sm">Uploaded: {new Date(diagram.createdAt).toLocaleDateString()}</span>
                <div className="space-x-2">
                  <Link href={`/ocr/${diagram._id}`}><span className="text-blue-400 hover:text-blue-300 cursor-pointer">OCR</span></Link>
                  <Link href={`/bom/${diagram._id}`}><span className="text-green-400 hover:text-green-300 cursor-pointer">BoM</span></Link>
                  <Link href={`/compliance/${diagram._id}`}><span className="text-yellow-400 hover:text-yellow-300 cursor-pointer">Compliance</span></Link>
                  {/* Add Chat link later */}
                </div>
              </li>
            ))}
          </ul>
        ) : (
          <div className="text-center text-gray-400">
            <p>No diagrams uploaded for this project yet.</p>
            <Link href={`/project/${projectId}/upload`}>
              <button className="mt-4 bg-indigo-600 hover:bg-indigo-500 text-white font-bold py-2 px-4 rounded">
                Upload First Diagram
              </button>
            </Link>
          </div>
        )}
      </div>
    </div>
  );
}
