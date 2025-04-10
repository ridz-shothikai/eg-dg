'use client';

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import { useSession, signOut } from 'next-auth/react';
import { usePathname } from 'next/navigation';

// Placeholder Icon (same as used in pages)
const PlaceholderIcon = ({ className = "w-6 h-6" }) => (
  <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M10 20l4-16m4 4l4 4-4 4M6 16l-4-4 4-4"></path>
  </svg>
);

// List of public routes where the full navigation should appear for logged-out users,
// and a simplified nav (with Dashboard link) for logged-in users.
const publicRoutes = ['/', '/solutions', '/how-it-works', '/use-cases', '/resources'];
// Auth routes are handled separately
const authRoutes = ['/login', '/signup'];

export default function Header() {
  const { data: session, status } = useSession();
  const pathname = usePathname();
  const [firstProjectId, setFirstProjectId] = useState(null);
  const [isLoadingProjects, setIsLoadingProjects] = useState(false);

  const isAuthenticated = status === 'authenticated';
  const isPublicRoute = publicRoutes.includes(pathname);
  const isAuthRoute = authRoutes.includes(pathname);

  // Fetch first project ID only if authenticated and on a public route
  useEffect(() => {
    if (isAuthenticated && isPublicRoute && !firstProjectId && !isLoadingProjects) {
      setIsLoadingProjects(true);
      fetch('/api/projects') // Assuming this endpoint returns user's projects
        .then(res => {
          if (!res.ok) throw new Error('Failed to fetch projects');
          return res.json();
        })
        .then(data => {
          if (data.projects && data.projects.length > 0) {
            setFirstProjectId(data.projects[0]._id); // Get the ID of the first project
          }
        })
        .catch(error => console.error("Error fetching first project ID:", error))
        .finally(() => setIsLoadingProjects(false));
    }
    // Reset if user logs out or navigates away from public routes while logged in
    if (!isAuthenticated || !isPublicRoute) {
        setFirstProjectId(null);
    }
  }, [isAuthenticated, isPublicRoute, firstProjectId, isLoadingProjects]);


  // Don't render header on auth pages (login/signup)
  if (isAuthRoute) {
    return null;
  }

  const dashboardLink = firstProjectId ? `/project/${firstProjectId}` : '/'; // Fallback to home if no projects

  return (
    <header className="sticky top-0 z-50 bg-[#100926] shadow-md">
      <nav className="container mx-auto px-6 py-3 flex justify-between items-center">
        {/* Logo (Always Visible) */}
        <Link href="/" legacyBehavior>
          <a className="text-xl font-bold text-white">
            <span className="inline-flex items-center">
              <PlaceholderIcon className="w-5 h-5 mr-2"/> Engineering Insights
            </span>
          </a>
        </Link>

        {/* Navigation Menu (Conditional) */}
        <div className="hidden md:flex items-center space-x-4">
          {/* Public Links (Show always except on private pages) */}
          {isPublicRoute && (
            <>
              <Link href="/solutions" legacyBehavior><a className={`hover:text-white ${pathname === '/solutions' ? 'text-white font-semibold' : 'text-gray-300'}`}>Solutions</a></Link>
              <Link href="/how-it-works" legacyBehavior><a className={`hover:text-white ${pathname === '/how-it-works' ? 'text-white font-semibold' : 'text-gray-300'}`}>How it Works</a></Link>
              <Link href="/use-cases" legacyBehavior><a className={`hover:text-white ${pathname === '/use-cases' ? 'text-white font-semibold' : 'text-gray-300'}`}>Use Cases</a></Link>
              <Link href="/resources" legacyBehavior><a className={`hover:text-white ${pathname === '/resources' ? 'text-white font-semibold' : 'text-gray-300'}`}>Resources</a></Link>
            </>
          )}

          {/* Auth Links */}
          {isAuthenticated ? (
            <>
              {/* Show Dashboard link only on public pages */}
              {isPublicRoute && (
                 <Link href={dashboardLink} legacyBehavior>
                    <a className="text-gray-300 hover:text-white">Dashboard</a>
                 </Link>
              )}
               {/* Placeholder for User Menu/Logout */}
               <div className="text-gray-300">{session.user.name || session.user.email}</div>
               <button onClick={() => signOut({ callbackUrl: '/' })} className="text-gray-300 hover:text-white">Logout</button>
            </>
          ) : (
            <>
              <Link href="/login" legacyBehavior>
                <a className="text-gray-300 hover:text-white">Login</a>
              </Link>
              <Link href="/signup" legacyBehavior>
                <a className="bg-[#130830] hover:bg-[#1a0f3d] text-white font-bold py-2 px-4 rounded transition duration-300">
                  Get Started
                </a>
              </Link>
            </>
          )}
        </div>

        {/* Mobile Menu Button (Placeholder - Needs implementation) */}
        <div className="md:hidden">
          <button className="text-white">
            <PlaceholderIcon /> {/* Menu Icon */}
          </button>
        </div>
      </nav>
    </header>
  );
}
