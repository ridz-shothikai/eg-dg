'use client';

import React, { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
import { useSession, signOut } from 'next-auth/react';
import { useRouter, usePathname } from 'next/navigation'; // Import usePathname
import NewProjectModal from './NewProjectModal';
// Import new modal components (will be created in the next step)
import RenameProjectModal from './RenameProjectModal';
import RemoveProjectModal from './RemoveProjectModal';

// Placeholder Icon (assuming it's defined elsewhere or we add it)
const PlaceholderIcon = ({ className = "w-6 h-6" }) => (
  <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M10 20l4-16m4 4l4 4-4 4M6 16l-4-4 4-4"></path>
  </svg>
);

// Helper function to truncate text
const truncateText = (text, maxLength) => {
  if (text.length <= maxLength) {
    return text;
  }
  return text.substring(0, maxLength) + '...';
};


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
  const [isModalOpen, setIsModalOpen] = useState(false); // State for NewProjectModal visibility
  const router = useRouter();

  // State for dropdown and modals
  const [openDropdownId, setOpenDropdownId] = useState(null); // Track which project's dropdown is open
  const [isRenameModalOpen, setIsRenameModalOpen] = useState(false); // State for RenameProjectModal visibility
  const [projectToRename, setProjectToRename] = useState(null); // Store project data for renaming
  const [isRemoveModalOpen, setIsRemoveModalOpen] = useState(false); // State for RemoveProjectModal visibility
  const [projectToRemove, setProjectToRemove] = useState(null); // Store project data for removing

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
                <li key={project._id} className="mb-2 relative"> {/* Added relative positioning for dropdown */}
                  <div className="flex items-center justify-between"> {/* Flex container for name and options */}
                    {/* Link to the project detail page - UPDATED PATH */}
                    <Link href={`/dashboard/project/${project._id}`} className="flex-grow"> {/* Allow link to take available space */}
                      <span className="block p-2 rounded hover:bg-[#130830] cursor-pointer truncate"> {/* Added truncate */}
                        {truncateText(project.name, 20)} {/* Apply custom truncation */}
                      </span>
                    </Link>
                    {/* Three-dot menu button */}
                    <button
                      className="p-2 rounded hover:bg-[#130830] focus:outline-none"
                      onClick={(e) => {
                        e.preventDefault(); // Prevent navigating to project page
                        // Toggle dropdown visibility for this project
                        setOpenDropdownId(openDropdownId === project._id ? null : project._id);
                      }}
                    >
                      {/* Placeholder for three dots icon */}
                      &#x2022;&#x2022;&#x2022; {/* Unicode for ellipsis */}
                    </button>
                  </div>

                  {/* Dropdown Menu */}
                  {openDropdownId === project._id && (
                    <div className="absolute right-0 mt-2 w-48 bg-[#110927] rounded-md shadow-lg z-10"> {/* Positioned dropdown */}
                      <div className="py-1">
                        <button
                          className="block w-full text-left px-4 py-2 text-sm text-gray-300 hover:bg-[#130830]"
                          onClick={() => {
                            // Handle Rename - Open Rename Modal
                            console.log('Rename clicked for', project.name);
                            setProjectToRename(project);
                            setIsRenameModalOpen(true);
                            setOpenDropdownId(null); // Close dropdown
                          }}
                        >
                          Rename
                        </button>
                        <button
                          className="block w-full text-left px-4 py-2 text-sm text-gray-300 hover:bg-[#130830]"
                          onClick={() => {
                            // Handle Remove - Open Remove Modal
                            console.log('Remove clicked for', project.name);
                            setProjectToRemove(project);
                            setIsRemoveModalOpen(true);
                            setOpenDropdownId(null); // Close dropdown
                          }}
                        >
                          Remove
                        </button>
                      </div>
                    </div>
                  )}
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

      {/* Rename Project Modal */}
      <RenameProjectModal
        isOpen={isRenameModalOpen}
        onClose={() => setIsRenameModalOpen(false)}
        project={projectToRename}
        onRename={handleRenameProject} // Implement this function next
      />

      {/* Remove Project Modal */}
      <RemoveProjectModal
        isOpen={isRemoveModalOpen}
        onClose={() => setIsRemoveModalOpen(false)}
        project={projectToRemove}
        onRemove={handleRemoveProject} // Implement this function next
      />
    </React.Fragment>
  );

  // Implement the rename and remove handlers
  async function handleRenameProject(projectId, newName) {
    try {
      const response = await fetch(`/api/projects/${projectId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: newName }),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.message || 'Failed to rename project');
      }

      // Update the projects list in state
      setProjects(projects.map(p =>
        p._id === projectId ? { ...p, name: newName } : p
      ));

      setIsRenameModalOpen(false); // Close modal on success
      setProjectToRename(null); // Clear selected project

    } catch (err) {
      console.error('Error renaming project:', err);
      // Re-throw the error so the modal can display it
      throw err;
    }
  }

  async function handleRemoveProject(projectId) {
    try {
      const response = await fetch(`/api/projects/${projectId}`, {
        method: 'DELETE',
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.message || 'Failed to remove project');
      }

      // Remove the project from the projects list in state
      setProjects(projects.filter(p => p._id !== projectId));

      setIsRemoveModalOpen(false); // Close modal on success
      setProjectToRemove(null); // Clear selected project

      // Optional: Redirect if the removed project was the currently viewed one
      if (currentProjectId === projectId) {
        router.push('/dashboard'); // Redirect to the main dashboard page
      }

    } catch (err) {
      console.error('Error removing project:', err);
      // Re-throw the error so the modal can display it
      throw err;
    }
  }
}
