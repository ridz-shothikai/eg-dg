'use client';

import React, { useEffect, useState } from 'react';
import Link from 'next/link';
import { useSession } from 'next-auth/react';
import LoadingSpinner from '@/components/LoadingSpinner';

export default function DashboardHomePage() {
  const { data: session, status } = useSession();
  const [projects, setProjects] = useState([]);
  const [loadingProjects, setLoadingProjects] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    const fetchProjects = async () => {
      if (status === 'authenticated') {
        try {
          setLoadingProjects(true);
          setError(null);
          const response = await fetch('/api/projects');
          if (!response.ok) {
            throw new Error('Failed to fetch projects');
          }
          const data = await response.json();
          setProjects(data.projects);
        } catch (err) {
          console.error('Error fetching projects:', err);
          setError(err.message);
        } finally {
          setLoadingProjects(false);
        }
      } else if (status === 'unauthenticated') {
        setLoadingProjects(false);
        setProjects([]); // Clear projects if unauthenticated
      }
    };

    fetchProjects();
  }, [status]); // Re-run when authentication status changes

  if (status === 'loading') {
    return (
      <div className="flex items-center justify-center h-full bg-gray-900">
        <LoadingSpinner text="Loading user data..." size="md" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex items-center justify-center h-full bg-gray-900 text-red-500">
        Error loading dashboard: {error}
      </div>
    );
  }

  // Render content based on whether projects exist
  return (
    <div className="flex flex-col items-center justify-center h-full bg-gray-900 text-white p-6">
      <h1 className="text-4xl font-bold mb-4">Welcome to Engineering Insights</h1>
      <p className="text-lg text-gray-300 mb-8 text-center max-w-2xl">
        Your central hub for analyzing engineering diagrams and extracting valuable insights.
      </p>

      {loadingProjects ? (
        <LoadingSpinner text="Checking for projects..." size="sm" />
      ) : projects.length === 0 ? (
        <div className="flex flex-col items-center">
          <p className="text-xl mb-4">It looks like you don't have any projects yet.</p>
          <Link href="/dashboard/project/new"> {/* Assuming a route for creating new projects */}
             {/* Note: The sidebar already has a "New Project" button that opens a modal.
                 This link could potentially open the same modal or navigate to a dedicated creation page.
                 For now, linking to a hypothetical '/dashboard/project/new' or similar.
                 Alternatively, instruct the user to use the sidebar button. Let's add a note.
             */}
            <button className="bg-indigo-600 hover:bg-indigo-500 text-white font-bold py-3 px-6 rounded-lg text-xl">
              Create Your First Project
            </button>
          </Link>
           <p className="text-sm text-gray-400 mt-2">
             (You can also use the "+ New Project" button in the sidebar)
           </p>
        </div>
      ) : (
        <div className="flex flex-col items-center">
           <p className="text-xl mb-4">Select a project from the sidebar to get started.</p>
           {/* Optional: Add a summary of projects or recent activity here */}
           {/* For now, just directing to the sidebar */}
        </div>
      )}

      {/* Optional: Add more sections like recent activity, tutorials, etc. */}
    </div>
  );
}
