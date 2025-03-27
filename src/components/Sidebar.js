'use client';

import React, { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
import { useSession, signOut } from 'next-auth/react'; // Import signOut
import { useRouter } from 'next/navigation';
import NewProjectModal from './NewProjectModal'; // Import the modal

export default function Sidebar() {
  const { data: session, status } = useSession();
  const [projects, setProjects] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [isModalOpen, setIsModalOpen] = useState(false); // State for modal visibility
  const router = useRouter();

  // Define fetchProjects using useCallback to memoize it
  const fetchProjects = useCallback(async () => {
    if (status === 'authenticated') {
      try {
        setLoading(true);
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
        setLoading(false);
      }
    } else if (status === 'unauthenticated') {
      setLoading(false);
      setProjects([]);
    }
  }, [status]); // Dependency array includes status

  useEffect(() => {
    fetchProjects();
  }, [fetchProjects]);

  const handleCreateProject = async (projectName, description) => {
    // This function is passed to the modal
    try {
      const response = await fetch('/api/projects', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: projectName, description }),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.message || 'Failed to create project');
      }

      const data = await response.json();
      const newProjectId = data.project._id;

      await fetchProjects(); // Refetch projects
      setIsModalOpen(false); // Close modal on success
      router.push(`/project/${newProjectId}/upload`); // Redirect

    } catch (err) {
      console.error('Error creating project:', err);
      // Let the modal display the error by throwing it
      throw err;
    }
  };

  // Only render sidebar content if authenticated
  if (status !== 'authenticated') {
    return null; // Render nothing if not authenticated or loading
  }

  return (
    <React.Fragment>
      <div className="w-64 h-screen bg-[#100926] text-white p-4 flex flex-col border-r border-[#130830]">
        {/* Dashboard Link */}
        <Link href="/" className="mb-4">
          {/* Increased font size */}
          <span className="block text-center text-xl font-semibold p-2 rounded hover:bg-[#130830] cursor-pointer">
            Eng Diagram Insight
          </span>
        </Link>
        <h2 className="text-xl font-semibold mb-4">Projects</h2>
        <button
          onClick={() => setIsModalOpen(true)} // Open the modal
          className="w-full bg-indigo-600 hover:bg-indigo-500 text-white font-bold py-2 px-4 rounded mb-4"
        >
          + New Project
        </button>
        <div className="flex-grow overflow-y-auto">
        {loading && <p>Loading projects...</p>}
        {error && <p className="text-red-500">Error: {error}</p>}
        {!loading && !error && (
          <ul>
            {projects.length > 0 ? (
              projects.map((project) => (
                <li key={project._id} className="mb-2">
                  {/* Link to the project detail page */}
                  <Link href={`/project/${project._id}`}>
                    <span className="block p-2 rounded hover:bg-[#130830] cursor-pointer">
                      {project.name}
                    </span>
                  </Link>
                </li>
              ))
            ) : (
              status === 'authenticated' && <p className="text-gray-400">No projects yet.</p>
            )}
          </ul>
        )}
      </div>
        {/* Logout Button */}
        <div className="mt-auto pt-4 border-t border-[#130830]">
          <button
            onClick={() => signOut({ callbackUrl: '/' })}
            className="w-full bg-red-600 hover:bg-red-500 text-white font-bold py-2 px-4 rounded opacity-80 hover:opacity-100 transition-opacity" // Added opacity
          >
            Logout
          </button>
        </div>
      </div>
      <NewProjectModal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        onCreate={handleCreateProject}
      />
    </React.Fragment>
  );
}
