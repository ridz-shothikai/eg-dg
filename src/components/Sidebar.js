'use client';

import React, { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
import { useSession, signOut } from 'next-auth/react';
import { useRouter, usePathname } from 'next/navigation'; // Import usePathname
import NewProjectModal from './NewProjectModal';

// Placeholder Icon (assuming it's defined elsewhere or we add it)
const PlaceholderIcon = ({ className = "w-6 h-6" }) => (
  <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M10 20l4-16m4 4l4 4-4 4M6 16l-4-4 4-4"></path>
  </svg>
);


// List of public routes where the sidebar should NOT be shown
const publicRoutes = ['/', '/solutions', '/how-it-works', '/use-cases', '/resources'];
// Auth routes are also public in terms of layout
const authRoutes = ['/login', '/signup'];

export default function Sidebar() {
  const { data: session, status } = useSession();
  const pathname = usePathname(); // Get current path
  const [projects, setProjects] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [isModalOpen, setIsModalOpen] = useState(false); // State for modal visibility
  const router = useRouter();

  // Function to create default project and redirect
  const createAndRedirectToDefaultProject = useCallback(async () => {
    console.log("No projects found, creating default project...");
    try {
      const response = await fetch('/api/projects', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: 'My First Project' }), // Default name
      });
      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.message || 'Failed to create default project');
      }
      const newProject = await response.json();
      console.log("Default project created:", newProject);
      // Redirect to the new project page - UPDATED PATH
      router.push(`/dashboard/project/${newProject._id}`);
    } catch (err) {
      console.error('Error creating default project:', err);
      // Handle error appropriately - maybe show a message to the user?
      // For now, just log it and the user will see "No projects yet"
      setError('Could not create initial project.');
    }
  }, [router]); // Add router to dependency array

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

        // If no projects are found, create a default one and redirect
        if (data.projects.length === 0) {
          // No need to await here, let it run in the background and redirect
          createAndRedirectToDefaultProject();
        }

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
    // Add createAndRedirectToDefaultProject to dependency array
  }, [status, createAndRedirectToDefaultProject]);

  useEffect(() => {
    // Only fetch projects if authenticated
    if (status === 'authenticated') {
        fetchProjects();
    }
  }, [status, fetchProjects]); // Add status here too

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

      console.log("Found Project", data);

      const newProjectId = data._id;

      await fetchProjects(); // Refetch projects
      setIsModalOpen(false); // Close modal on success
      // Redirect to the new project upload page - UPDATED PATH
      router.push(`/dashboard/project/${newProjectId}/upload`);

    } catch (err) {
      console.error('Error creating project:', err);
      // Let the modal display the error by throwing it
      throw err;
    }
  };

  // Only render sidebar content if authenticated
  if (status !== 'authenticated') {
    return null; // Render nothing if not authenticated
  }

  // Define isAuthenticated based on session status
  const isAuthenticated = status === 'authenticated';

  // Check if the current route is public or an auth route
  const isPublicOrAuthRoute = publicRoutes.includes(pathname) || authRoutes.includes(pathname);

  // Render nothing if authenticated but on a public/auth route
  if (isAuthenticated && isPublicOrAuthRoute) {
    return null;
  }

  // --- Get current project ID and name ---
  let currentProjectId = null;
  let currentProjectName = 'Dashboard'; // Default title
  const projectPathMatch = pathname.match(/^\/dashboard\/project\/([a-zA-Z0-9]+)/);
  if (projectPathMatch) {
    currentProjectId = projectPathMatch[1];
    const currentProject = projects.find(p => p._id === currentProjectId);
    if (currentProject) {
      currentProjectName = currentProject.name;
    }
  }
  // --- End get current project ---


  // Render sidebar only if authenticated AND on a private route
  return (
    <React.Fragment>
      <div className="w-64 h-screen bg-[#100926] text-white p-4 flex flex-col border-r border-[#130830]">
        {/* Logo and Current Project Name */}
        <Link href={"/"} className="mb-4 block p-2 rounded hover:bg-[#130830]">
          <div className="flex items-center space-x-2">
             <PlaceholderIcon className="w-5 h-5 flex-shrink-0"/>
             <span className="text-lg font-semibold truncate" title={currentProjectName}>
               {/* {currentProjectName} */}
               Engineering Insights
             </span>
          </div>
        </Link>

        <h2 className="text-lg font-semibold mb-2 mt-2">Projects</h2> {/* Adjusted margin/size */}
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
                  {/* Link to the project detail page - UPDATED PATH */}
                  <Link href={`/dashboard/project/${project._id}`}>
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
