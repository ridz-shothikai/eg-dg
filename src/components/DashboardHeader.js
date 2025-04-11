'use client';

import React, { useState, useEffect, useRef } from 'react';
import { useSession, signOut } from 'next-auth/react';
import Link from 'next/link';
import { UserCircleIcon, ArrowLeftOnRectangleIcon, ChevronDownIcon } from '@heroicons/react/24/outline'; // Example icons

export default function DashboardHeader() {
  const { data: session, status } = useSession();
  const [isDropdownOpen, setIsDropdownOpen] = useState(false);
  const dropdownRef = useRef(null); // Ref to detect clicks outside

  // Close dropdown if clicked outside
  useEffect(() => {
    function handleClickOutside(event) {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target)) {
        setIsDropdownOpen(false);
      }
    }
    // Bind the event listener
    document.addEventListener("mousedown", handleClickOutside);
    return () => {
      // Unbind the event listener on clean up
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, [dropdownRef]);

  if (status === 'loading') {
    return (
      <header className="bg-gray-700 p-4 shadow-md flex justify-end items-center h-16">
        {/* Placeholder while loading session */}
        <div className="animate-pulse h-8 w-24 bg-gray-600 rounded"></div>
      </header>
    );
  }

  // Decide what to show based on session
  const userDisplay = session?.user?.name || session?.user?.email || 'User';

  return (
    <header className="bg-gray-700 p-4 shadow-md flex justify-between items-center h-16 flex-shrink-0">
      {/* Left side - Placeholder for potential future content like Project Name */}
      <div>
        {/* <h1 className="text-xl font-semibold text-white">Project Name</h1> */}
      </div>

      {/* Right side - User Dropdown (Only show if authenticated) */}
      {status === 'authenticated' && (
        <div className="relative" ref={dropdownRef}>
          <button
            onClick={() => setIsDropdownOpen(!isDropdownOpen)}
          className="flex items-center space-x-2 text-white hover:bg-gray-600 p-2 rounded transition-colors"
        >
          <UserCircleIcon className="w-6 h-6" />
          <span className="hidden md:inline">{userDisplay}</span> {/* Show name/email on larger screens */}
          <ChevronDownIcon className={`w-4 h-4 transition-transform ${isDropdownOpen ? 'rotate-180' : ''}`} />
        </button>

        {/* Dropdown Menu */}
        {isDropdownOpen && (
          <div className="absolute right-0 mt-2 w-48 bg-gray-800 rounded-md shadow-lg py-1 z-50 border border-gray-700">
            {/* Profile Item - Updated Link */}
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
      )}
      {/* Placeholder for Login/Signup if needed for guests? Or handled by banner? */}
      {status === 'unauthenticated' && (
        <div>
          {/* Optionally add Login/Signup links here if needed, though the banner might suffice */}
        </div>
      )}
    </header>
  );
}
