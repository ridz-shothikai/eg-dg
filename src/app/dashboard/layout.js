'use client';

import React from 'react';
import Sidebar from '@/components/Sidebar'; // Assuming Sidebar component path
import DashboardHeader from '@/components/DashboardHeader'; // Import the new header component

export default function DashboardLayout({ children }) {
  // We might need session checks here later if Sidebar/Header depend on it directly,
  // but AuthProvider in the root layout should handle the main auth state.

  return (
    <div className="flex h-screen bg-gray-900 text-white">
      {/* Persistent Sidebar */}
      <div className="w-64 flex-shrink-0 bg-gray-800 overflow-y-auto"> {/* Adjust width and bg as needed */}
        <Sidebar />
      </div>

      {/* Main Content Area Wrapper - Added relative positioning */}
      <div className="flex-grow flex flex-col overflow-hidden relative">
        {/* Use the new DashboardHeader component */}
        <DashboardHeader /> {/* Assuming this has a fixed height, e.g., h-16 */}

        {/* Page Content - Fills space below header and scrolls */}
        {/* Added absolute, inset-0, pt-16 (adjust if header height changes), overflow-y-auto */}
        <main className="absolute inset-0 pt-16 overflow-y-auto p-6">
          {children}
        </main>
      </div>
    </div>
  );
}
