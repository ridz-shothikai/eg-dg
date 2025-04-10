'use client'; // Required for useState and useRouter hooks

import React, { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation'; // Import useRouter for redirection
// Placeholder for a potential Logo component or direct image import
// import Image from 'next/image';
// Placeholder for the FileUpload component - might need adaptation
// import FileUpload from '@/components/FileUpload';

export default function LondonLandingPage() {
  const router = useRouter();
  const [isUploading, setIsUploading] = useState(false);
  const [uploadError, setUploadError] = useState(null);

  // Function to handle the guest upload and project creation logic
  const handleGuestUpload = async (file) => {
    if (!file) return;

    setIsUploading(true);
    setUploadError(null);
    console.log('Guest upload initiated for file:', file.name);

    try {
      // Step 1: Create a new project
      // Use filename without extension as project name, or a default
      const projectName = file.name.split('.').slice(0, -1).join('.') || `Guest Project - ${Date.now()}`;
      const projectResponse = await fetch('/api/projects', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        // Sending null for userId, assuming backend handles guest creation
        body: JSON.stringify({ name: projectName, userId: null }),
      });

      if (!projectResponse.ok) {
        const errorData = await projectResponse.json();
        throw new Error(errorData.message || 'Failed to create project');
      }

      const projectData = await projectResponse.json();
      const projectId = projectData._id; // Assuming the API returns the project object with _id

      if (!projectId) {
        throw new Error('Project ID not received after creation.');
      }

      console.log('Project created successfully:', projectId);

      // Step 2: Upload the file to the newly created project
      const formData = new FormData();
      formData.append('file', file);
      formData.append('projectId', projectId); // Add projectId to the form data

      const uploadResponse = await fetch('/api/upload', { // Use the standard upload endpoint
        method: 'POST',
        body: formData,
        // Note: Don't set Content-Type header when using FormData, browser does it
      });

      if (!uploadResponse.ok) {
        const errorData = await uploadResponse.json();
        throw new Error(errorData.message || 'File upload failed');
      }

      const uploadData = await uploadResponse.json();
      console.log('File uploaded successfully:', uploadData);

      // Step 3: Redirect to the project dashboard
      router.push(`/project/${projectId}`);

    } catch (error) {
      console.error('Guest upload failed:', error);
      setUploadError(error.message || 'An unexpected error occurred.');
      setIsUploading(false); // Ensure loading state is reset on error
    }
    // No need to set isUploading to false on success, as redirection happens
  };

  return (
    <div className="min-h-screen bg-[#0c071a] text-white">
      {/* Header */}
      <header className="bg-[#100926] p-4 shadow-md">
        <div className="container mx-auto flex justify-between items-center">
          {/* Left side can be empty or have navigation if needed later */}
          <div></div>

          {/* Right side: Logo and Login Button */}
          <div className="flex items-center space-x-4">
            <Link href="/login" legacyBehavior>
              <a className="bg-[#130830] hover:bg-[#12082c] text-white font-bold py-2 px-4 rounded transition duration-300">
                Login
              </a>
            </Link>
            {/* Placeholder for Logo - Assuming text for now */}
            <div className="text-xl font-bold">
              {/* <Image src="/path/to/logo.svg" alt="Logo" width={100} height={40} /> */}
              EngineeringDiagramInsights
            </div>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="container mx-auto p-8">
        <h1 className="text-4xl font-bold text-center mb-12">Unlock Insights from Your Engineering Diagrams</h1>

        {/* Feature Highlights Section */}
        <section className="mb-16">
          <h2 className="text-3xl font-semibold mb-8 text-center">Platform Features</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
            {/* Feature 1: Smart Parsing */}
            <div className="bg-[#110927] p-6 rounded-lg shadow-lg border border-[#130830]">
              <h3 className="text-xl font-bold mb-3">Smart Diagram Parsing</h3>
              <p className="text-gray-300">Automatically identify components, extract text, and understand the structure of your technical drawings using advanced OCR and AI.</p>
            </div>
            {/* Feature 2: Natural Language Chat */}
            <div className="bg-[#110927] p-6 rounded-lg shadow-lg border border-[#130830]">
              <h3 className="text-xl font-bold mb-3">Chat with Your Diagrams</h3>
              <p className="text-gray-300">Ask questions in plain English and get instant, context-aware answers directly from your uploaded diagrams.</p>
            </div>
            {/* Feature 3: BoM Generation */}
            <div className="bg-[#110927] p-6 rounded-lg shadow-lg border border-[#130830]">
              <h3 className="text-xl font-bold mb-3">Automated BoM/BoQ</h3>
              <p className="text-gray-300">Generate accurate Bills of Materials and Quantities automatically, saving hours of manual effort.</p>
            </div>
             {/* Feature 4: Compliance Checks */}
             <div className="bg-[#110927] p-6 rounded-lg shadow-lg border border-[#130830]">
              <h3 className="text-xl font-bold mb-3">Compliance Validation</h3>
              <p className="text-gray-300">Check your designs against industry standards like IBC, Eurocodes, and IS codes quickly and efficiently.</p>
            </div>
             {/* Feature 5: Diagram Comparison */}
             <div className="bg-[#110927] p-6 rounded-lg shadow-lg border border-[#130830]">
              <h3 className="text-xl font-bold mb-3">Version Comparison</h3>
              <p className="text-gray-300">Easily track changes and compare different revisions of your diagrams side-by-side.</p>
            </div>
             {/* Feature 6: Knowledge Hub */}
             <div className="bg-[#110927] p-6 rounded-lg shadow-lg border border-[#130830]">
              <h3 className="text-xl font-bold mb-3">Project Knowledge Hub</h3>
              <p className="text-gray-300">Build a searchable repository of all your project diagrams and extracted insights.</p>
            </div>
          </div>
        </section>

        {/* Guest Upload Section */}
        <section className="bg-[#100926] p-8 rounded-lg shadow-xl border border-[#130830]">
          <h2 className="text-3xl font-semibold mb-6 text-center">Get Started Instantly</h2>
          <p className="text-center text-gray-300 mb-8">Upload your first diagram as a guest user. We'll automatically create a project and take you to your dashboard.</p>
          <div className="max-w-md mx-auto">
            {/* Basic file input */}
            <input
              id="guest-file-upload"
              type="file"
              className="block w-full text-sm text-gray-400
                         file:mr-4 file:py-2 file:px-4
                         file:rounded-full file:border-0
                         file:text-sm file:font-semibold
                         file:bg-[#130830] file:text-white
                         hover:file:bg-[#12082c] cursor-pointer"
              onChange={(e) => {
                if (e.target.files && e.target.files[0]) {
                  handleGuestUpload(e.target.files[0]);
                }
              }}
              disabled={isUploading} // Disable input while uploading
            />
            {/* Loading and Error States */}
            {isUploading && (
              <p className="text-center text-blue-400 mt-4">Uploading and creating project...</p>
            )}
            {uploadError && (
              <p className="text-center text-red-500 mt-4">Error: {uploadError}</p>
            )}
            {/* <FileUpload onUploadSuccess={handleGuestUpload} projectId={null} isGuestUpload={true} /> */}
            <p className="text-xs text-gray-500 mt-2 text-center">Supported formats: PDF, PNG, JPG, DWG, DXF</p>
          </div>
        </section>
      </main>

      {/* Footer (Optional) */}
      <footer className="bg-[#100926] p-4 mt-16 text-center text-gray-500 text-sm">
        &copy; {new Date().getFullYear()} Engineering Insights. All rights reserved.
      </footer>
    </div>
  );
}
