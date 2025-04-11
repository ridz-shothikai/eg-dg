'use client';

import React, { useState, useEffect } from 'react';
import { useSession } from 'next-auth/react';
import Link from 'next/link'; // Import Link for banner
import Sidebar from '@/components/Sidebar';
import DashboardHeader from '@/components/DashboardHeader';

export default function DashboardLayout({ children }) {
  const { data: session, status } = useSession();
  const [isGuestView, setIsGuestView] = useState(false);

  // Check for guest mode only when unauthenticated
  useEffect(() => {
    if (status === 'unauthenticated') {
      // Check localStorage only on client-side after mount
      const storedGuestId = localStorage.getItem('guestId');
      // We assume if guestId exists, they are viewing a project page
      // A more robust check might involve checking the pathname as well
      setIsGuestView(!!storedGuestId);
    } else if (status === 'authenticated') {
      setIsGuestView(false); // Reset if authenticated
    }
    // Add dependency on status to re-check if auth state changes
  }, [status]);

  // Determine main content padding based on guest view and header presence
  // Assuming NARROW guest banner height is roughly pt-8 (32px) and header is h-16 (64px -> pt-16)
  const mainPaddingTop = isGuestView ? 'pt-8' : 'pt-16'; // Adjusted guest padding

  // Don't render layout content until auth status is determined
  if (status === 'loading') {
     // Or return a full-page loading spinner matching the theme
     return <div className="h-screen w-screen bg-gray-900"></div>;
  }

  return (
    <div className="flex h-screen bg-gray-900 text-white">
      {/* Conditionally render Sidebar */}
      {!isGuestView && (
        <div className="w-64 flex-shrink-0 bg-gray-800 overflow-y-auto">
          <Sidebar />
        </div>
      )}

      {/* Main Content Area Wrapper */}
      <div className="flex-grow flex flex-col overflow-hidden relative">
        {/* Conditionally render Guest Banner (Sticky) */}
        {isGuestView && (
          <div className="sticky top-0 left-0 right-0 bg-yellow-600 text-black text-center py-1 px-2 text-xs z-20"> {/* Narrower padding (py-1), smaller text (text-xs), higher z-index */}
            You are viewing this project as a guest. &nbsp;
            <Link href="/signup" className="font-bold underline hover:text-yellow-900">Sign up</Link>
            &nbsp; or &nbsp;
            <Link href="/login" className="font-bold underline hover:text-yellow-900">Log in</Link>
            &nbsp; to save your work permanently.
          </div>
         )}

        {/* Conditionally render DashboardHeader */}
        {!isGuestView && (
          // Added sticky and z-index to header wrapper as well
          <div className="sticky top-0 left-0 right-0 z-10"> {/* Ensure header is also sticky if needed, lower z-index than banner */}
            <DashboardHeader />
          </div>
        )}

        {/* Page Content - Fills space below header/banner and scrolls */}
        {/* Adjusted padding calculation */}
        <main className={`absolute inset-0 ${mainPaddingTop} overflow-y-auto p-6`}>
          {children}
        </main>
      </div>
    </div>
  );
}
