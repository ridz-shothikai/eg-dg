'use client';

import React, { useState, useEffect, useRef } from 'react'; // Added useRef
import Link from 'next/link';
import { useSession, signOut } from 'next-auth/react';
import { usePathname } from 'next/navigation';
import { UserCircleIcon, ArrowLeftOnRectangleIcon, ChevronDownIcon } from '@heroicons/react/24/outline'; // Added icons

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
  const [isDropdownOpen, setIsDropdownOpen] = useState(false); // State for dropdown
  const dropdownRef = useRef(null); // Ref for dropdown

  const isAuthenticated = status === 'authenticated';
  const isPublicRoute = publicRoutes.includes(pathname);
  const isAuthRoute = authRoutes.includes(pathname);
  const isDashboardRoute = pathname.startsWith('/dashboard'); // Check if it's a dashboard route

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

  // Close dropdown if clicked outside
  useEffect(() => {
    function handleClickOutside(event) {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target)) {
        setIsDropdownOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, [dropdownRef]);


  // Don't render header on auth pages (login/signup)
  if (isAuthRoute) {
    return null;
  }

  // --- NEW: Don't render header on dashboard routes ---
  if (isDashboardRoute) {
    return null;
  }
  // --- End New Check ---

  // Updated dashboardLink to use /dashboard prefix
  const dashboardLink = firstProjectId ? `/dashboard/project/${firstProjectId}` : '/'; // Fallback to home if no projects

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
              {/* User Dropdown Menu */}
              <div className="relative" ref={dropdownRef}>
                <button
                  onClick={() => setIsDropdownOpen(!isDropdownOpen)}
                  className="flex items-center space-x-1 text-gray-300 hover:text-white p-1 rounded transition-colors"
                >
                  <UserCircleIcon className="w-6 h-6" />
                  {/* Optional: Show name on larger screens if desired */}
                  {/* <span className="hidden lg:inline">{session.user.name || session.user.email}</span> */}
                  <ChevronDownIcon className={`w-4 h-4 transition-transform ${isDropdownOpen ? 'rotate-180' : ''}`} />
                </button>

                {/* Dropdown Menu */}
                {isDropdownOpen && (
                  <div className="absolute right-0 mt-2 w-48 bg-gray-800 rounded-md shadow-lg py-1 z-50 border border-gray-700">
                    {/* Display Name/Email */}
                    <div className="px-4 py-2 text-sm text-gray-400 border-b border-gray-700">
                      Signed in as <br/>
                      <strong className="text-gray-200">{session.user.name || session.user.email}</strong>
                    </div>
                    {/* Profile Link */}
                    <Link href="/dashboard/profile">
                      <span className="block px-4 py-2 text-sm text-gray-300 hover:bg-gray-600 hover:text-white cursor-pointer">
                        Profile
                      </span>
                    </Link>
                    {/* Logout Item */}
                    <button
                      onClick={() => signOut({ callbackUrl: '/' })}
                      className="w-full text-left flex items-center px-4 py-2 text-sm text-red-400 hover:bg-gray-600 hover:text-red-300"
                    >
                      <ArrowLeftOnRectangleIcon className="w-4 h-4 mr-2" />
                      Logout
                    </button>
                  </div>
                )}
              </div>
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
