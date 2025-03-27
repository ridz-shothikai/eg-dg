'use client'; // Need client component for useSession

import React, { useEffect, useState } from 'react';
import Link from 'next/link';
import { useSession } from 'next-auth/react';
import { useRouter } from 'next/navigation';
import LoadingSpinner from '@/components/LoadingSpinner'; // Import the spinner

// Component for Unauthenticated users (Landing Page)
const LandingPage = () => (
  <div className="min-h-screen flex flex-col items-center justify-center bg-[#0c071a] text-white p-8">
    <main className="text-center">
      <h1 className="text-4xl font-bold mb-4">Welcome to Engineering Diagram Insights</h1>
      <p className="text-lg text-gray-300 mb-8">
        AI-Powered Engineering Diagram Analysis
      </p>
      <div className="space-x-4">
        <Link href="/login">
          <span className="bg-[#130830] hover:bg-[#12082c] text-white font-bold py-2 px-4 rounded cursor-pointer">
            Login
          </span>
        </Link>
        {/* Removed Sign Up button */}
      </div>
    </main>
    <footer className="absolute bottom-8 text-gray-500">
      © {new Date().getFullYear()} Shothik AI
    </footer>
  </div>
);

// Component for Authenticated users (Welcome/Features)
const DashboardContent = () => {
  const { data: session } = useSession(); // Get session data for welcome message

  return (
    <div className="p-8 text-white"> {/* Padding for main content area */}
      <h1 className="text-3xl font-bold mb-6">Engineering Insights</h1>
      <div className="bg-gray-800 rounded-lg shadow p-6">
        <h2 className="text-2xl font-semibold mb-4">Doclyze Features</h2>
        <ul className="list-disc list-inside space-y-2 text-gray-300">
          <li>Create projects to organize your diagrams.</li>
          <li>Upload engineering diagrams (PDF, PNG, JPG, DWG, DXF).</li>
          <li>Automatic OCR (Text Extraction) from diagrams.</li>
          <li>AI-powered analysis and summarization (using Gemini).</li>
          <li>Bill of Materials (BoM/BoQ) extraction.</li>
          <li>Compliance checking against standards (e.g., IBC).</li>
          <li>Centralized Knowledge Hub for searching across diagrams.</li>
          <li>(Coming Soon) Diagram version comparison.</li>
          <li>(Coming Soon) Integrations with Google Drive & Jira.</li>
        </ul>
        <p className="mt-6 text-gray-400">
          Select a project from the sidebar to view its diagrams, or create a new project to get started.
        </p>
      </div>
    </div>
  );
};

// Main Home Page Component
export default function HomePage() {
  const { data: session, status } = useSession();

  if (status === 'loading') {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-900">
        <LoadingSpinner text="Loading session..." />
      </div>
    );
  }

  if (status === 'authenticated') {
    // User is logged in, show Dashboard content (Sidebar is handled by layout)
    return <DashboardContent />;
  }

  // User is not logged in, show Landing Page
  return <LandingPage />;
}
