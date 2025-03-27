'use client';

import React, { useEffect, useState } from 'react'; // Import useState
import { useSession, signOut } from 'next-auth/react';
import { useRouter } from 'next/navigation';
import Link from 'next/link'; // Keep Link for project links

// Separate component for authenticated content
const AuthenticatedContent = () => {
  const router = useRouter();
  const [projects, setProjects] = useState([]);
  const [loadingProjects, setLoadingProjects] = useState(true);
  const [projectsError, setProjectsError] = useState(null);

  useEffect(() => {
    async function fetchProjects() {
      try {
        setLoadingProjects(true);
        setProjectsError(null);
        const response = await fetch('/api/projects');
        if (!response.ok) {
          throw new Error('Failed to fetch projects');
        }
        const data = await response.json();
        setProjects(data.projects);
      } catch (err) {
        console.error('Error fetching projects:', err);
        setProjectsError(err.message);
      } finally {
        setLoadingProjects(false);
      }
    }
    fetchProjects();
  }, []); // Fetch projects on component mount

  const handleUploadClick = () => {
    router.push('/upload');
  };

  const handleLogoutClick = () => {
    signOut({ callbackUrl: '/' });
  };

  return (
    <React.Fragment>
      <div className="min-h-screen bg-gray-900 text-white p-8">
        <div className="max-w-7xl mx-auto">
          <div className="flex justify-between items-center mb-8">
            <h1 className="text-3xl font-bold">Dashboard</h1>
            <div>
              {/* Removed Upload New Diagram button */}
              <button
                className="bg-red-600 hover:bg-red-500 text-white font-bold py-2 px-4 rounded"
                onClick={handleLogoutClick}
              >
                Logout
              </button>
            </div>
          </div>

          <div className="bg-gray-800 rounded-lg shadow p-6">
            <h2 className="text-xl font-semibold mb-4">Projects</h2>
            {loadingProjects && <p>Loading projects...</p>}
            {projectsError && <p className="text-red-500">Error: {projectsError}</p>}
            {!loadingProjects && !projectsError && (
              <div className="space-y-4">
                {projects.length > 0 ? (
                  projects.map((project) => (
                    <div key={project._id} className="bg-gray-700 p-4 rounded flex justify-between items-center">
                      <span className="font-medium">{project.name}</span>
                      <span className={`px-2 py-1 rounded text-sm ${
                        project.status === 'Complete' ? 'bg-green-600' :
                        project.status === 'Pending' ? 'bg-yellow-600' : 'bg-gray-600' // Default or other statuses
                      }`}>
                        {project.status || 'N/A'}
                      </span>
                      <span className="text-gray-400 text-sm">Updated: {new Date(project.updatedAt).toLocaleDateString()}</span>
                      {/* Add link to project details page later */}
                      <Link href={`/project/${project._id}`}>
                        <span className="text-indigo-400 hover:text-indigo-300 cursor-pointer">View</span>
                      </Link>
                    </div>
                  ))
                ) : (
                  <p className="text-gray-400">No projects found. Click 'Upload New Diagram' to get started.</p>
                )}
              </div>
            )}
            {/* Add filters and pagination later */}
          </div>
        </div>
      </div>
    </React.Fragment>
  );
};

// Main page component
export default function DashboardPage() {
  const { data: session, status } = useSession();
  const router = useRouter();

  useEffect(() => {
    if (status === 'loading') return; // Do nothing while loading

    if (status === 'unauthenticated') {
      router.push('/login'); // Redirect to login if not authenticated
    }
    // Add admin role check later
    // if (session?.user?.role !== 'admin') {
    //   router.push('/dashboard'); // Redirect non-admins
    // }
  }, [session, status, router]);

  // Render loading state or authenticated content
  return status === 'authenticated' ? <AuthenticatedContent /> : <div className="min-h-screen flex items-center justify-center bg-gray-900 text-white">Loading...</div>;
}
