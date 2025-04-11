'use client';

import React, { useState, useEffect } from 'react'; // Added useState, useEffect
import { useSession } from 'next-auth/react'; // Added useSession
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
  // Assuming guest banner height is roughly pt-10 (40px) and header is h-16 (64px -> pt-16)
  const mainPaddingTop = isGuestView ? 'pt-10' : 'pt-16';

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
      {/* Added relative positioning */}
      <div className="flex-grow flex flex-col overflow-hidden relative">
        {/* Conditionally render DashboardHeader */}
        {!isGuestView && (
          <div className="relative z-10"> {/* Wrapper for z-index */}
            <DashboardHeader />
          </div>
        )}

        {/* Page Content - Fills space below header/banner and scrolls */}
        {/* Adjusted padding based on isGuestView */}
        <main className={`absolute inset-0 ${mainPaddingTop} overflow-y-auto p-6`}>
          {children}
        </main>
      </div>
    </div>
  );
}
