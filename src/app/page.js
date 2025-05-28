'use client'; // Required for hooks

import React, { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import MultiStepProgressBar from '@/components/MultiStepProgressBar'; // Import the new component
import { fetchWithRetry } from '@/lib/fetchUtils'; // Import the retry helper

// Placeholder components for icons (replace with actual icons later)
const PlaceholderIcon = ({ className = "w-6 h-6" }) => (
  <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M10 20l4-16m4 4l4 4-4 4M6 16l-4-4 4-4"></path>
  </svg>
);

export default function HomePage() {
  const router = useRouter();
  const [isUploading, setIsUploading] = useState(false);
  const [uploadError, setUploadError] = useState(null);
  const [uploadStep, setUploadStep] = useState(-1); // -1: idle, 0: creating, 1: uploading, 2: preparing
  const [uploadProgressText, setUploadProgressText] = useState(''); // For dynamic text during multi-upload

  const uploadSteps = ["Creating Project", "Uploading Files", "Preparing Workspace"]; // Changed step 1 name

  // --- Guest Upload Logic (Updated for Multiple Files & Progress) ---
  const handleGuestUpload = async (files) => { // Accept FileList
    if (!files || files.length === 0) return;
    const numFiles = files.length;
    setIsUploading(true);
    setUploadError(null);
    setUploadStep(0); // Start step 0: Creating Project
    setUploadProgressText(''); // Reset dynamic text
    console.log(`Guest upload initiated for ${numFiles} file(s).`);

    try {
      // Generate or retrieve Guest ID
      let guestId = localStorage.getItem('guestId');
      if (!guestId) {
        guestId = `guest_${Date.now()}_${Math.random().toString(36).substring(2, 10)}`;
        localStorage.setItem('guestId', guestId);
        console.log('Generated new guestId:', guestId);
      } else {
        console.log('Using existing guestId:', guestId);
      }

      // Step 1: Create Project with Guest ID (Use first file name for project name) - WITH RETRY
      const firstFileName = files[0].name;
      const projectName = firstFileName.split('.').slice(0, -1).join('.') || `Guest Project - ${Date.now()}`;
      setUploadProgressText('Creating project...');

      const projectResponse = await fetchWithRetry(
        '/api/projects',
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ name: projectName, userId: null, guestId: guestId }),
        },
        3, // maxRetries
        (attempt, max) => { // onRetry callback
          setUploadProgressText(`Creating project (Retrying ${attempt}/${max})...`);
        }
      );

      // Reset progress text after successful attempt or final failure handled below
      setUploadProgressText('Creating project...');

      if (!projectResponse.ok) {
        // Handle non-retryable client errors or final failure after retries
        const errorData = await projectResponse.json().catch(() => ({}));
        throw new Error(errorData.message || `Failed to create project after retries (Status: ${projectResponse.status})`);
      }

      const projectData = await projectResponse.json();
      const projectId = projectData._id;
      if (!projectId) throw new Error('Project ID not received after creation.');
      console.log('Project created:', projectId);
      setUploadStep(1); // Move to step 1: Uploading Files
      setUploadProgressText(`Uploading ${numFiles} file(s)...`); // Update progress text for parallel upload

      // Step 2: Upload all files in parallel using Promise.allSettled - WITH RETRY
      const uploadPromises = Array.from(files).map(async (currentFile) => {
        const baseUploadText = `Uploading ${currentFile.name}`; // Simpler text for parallel
        console.log(`Starting upload for: ${currentFile.name}`);
        const formData = new FormData();
        formData.append('file', currentFile);
        formData.append('projectId', projectId);

        try {
          // Note: The retry progress text won't be very useful here as multiple might retry at once.
          // We'll rely on the final settled status.
          const uploadResponse = await fetchWithRetry(
            '/api/upload',
            { method: 'POST', body: formData },
            3, // maxRetries
             // No specific per-file retry text update needed in parallel mode for simplicity
            (attempt, max) => { console.log(`Retrying upload for ${currentFile.name} (${attempt}/${max})`); }
          );

          if (!uploadResponse.ok) {
            const errorData = await uploadResponse.json().catch(() => ({}));
            // Throw an error to make the promise reject
            throw new Error(errorData.message || `Upload failed for ${currentFile.name} after retries (Status: ${uploadResponse.status})`);
          }
          const result = await uploadResponse.json(); // Assuming API returns some useful data on success
          console.log(`File ${currentFile.name} uploaded successfully.`);
          // Return necessary info for successful uploads if needed later
          return { fileName: currentFile.name, status: 'fulfilled', value: result };
        } catch (fileUploadError) {
          console.error(`Error uploading ${currentFile.name} after retries:`, fileUploadError);
          // Throw the error again or return a specific structure for rejected promises
          // Promise.allSettled expects the promise to reject on failure
           throw { fileName: currentFile.name, status: 'rejected', reason: fileUploadError.message };
        }
      });

      // Wait for all upload promises to settle (either succeed or fail)
      const results = await Promise.allSettled(uploadPromises);

      const failedUploads = results.filter(result => result.status === 'rejected');
      const successfulUploads = results.filter(result => result.status === 'fulfilled');

      console.log(`Uploads settled. Successful: ${successfulUploads.length}, Failed: ${failedUploads.length}`);

      // Handle upload errors if any occurred
      if (failedUploads.length > 0) {
        const errorMessages = failedUploads.map(f => `${f.reason?.fileName || 'Unknown file'}: ${f.reason?.reason || 'Unknown error'}`);
        console.error(`Some files failed to upload:\n${errorMessages.join('\n')}`);
        // Set a general error state - ideally, pass failed file info to the dashboard
        setUploadError(`Failed to upload ${failedUploads.length} file(s). Check console for details.`);
        // Continue to dashboard even with partial success
      }

      if (successfulUploads.length === 0 && failedUploads.length > 0) {
         // If ALL uploads failed after creating project, stop here.
         throw new Error(`All ${failedUploads.length} file uploads failed.`);
      }

      console.log('Proceeding to workspace preparation.');
      setUploadStep(2); // Move to step 2: Preparing Workspace
      setUploadProgressText('Preparing workspace...'); // Update text

      // Short delay before redirect
      await new Promise(resolve => setTimeout(resolve, 500));

      // Updated router push to use /dashboard prefix
      // TODO: Consider passing failedUploads info via router state or query params if needed on dashboard
      router.push(`/dashboard/project/${projectId}`);
    } catch (error) {
      console.error('Guest upload process failed:', error);
      setUploadError(error.message || 'An unexpected error occurred during the upload process.');
      setIsUploading(false);
      setUploadStep(-1); // Reset step on error
      setUploadProgressText(''); // Clear dynamic text
    }
  };

  // --- Scroll Handler Removed ---
  // const handleScrollToUpload = (e) => { ... }; // No longer needed

  // Header is now rendered by layout.js
  // Wrapped content in a div with base styles
  return (
    // Apply base background and text color consistent with other pages
    <div className="bg-[#0c071a] text-gray-200">
      {/* Wrap main content sections in a main tag with container */}
      <main className="container mx-auto px-6 py-16"> {/* Added main tag with container */}
        {/* 2. Hero Section - Removed container/padding from inner div */}
        <section className="bg-[#100926] py-20 md:py-32 -mx-6 -mt-16 mb-16"> {/* Adjust padding/margin */}
          {/* Added items-center to vertically align grid columns */}
          <div className="px-6 grid md:grid-cols-2 gap-12 items-center"> {/* Removed container mx-auto */}
            {/* Left Side: Text - Added flex for vertical centering */}
            <div className="text-center md:text-left flex flex-col justify-center">
              <h1 className="text-4xl md:text-5xl lg:text-6xl font-bold text-white mb-6">
                Understand Any Engineering Diagram in Seconds.
              </h1>
              <p className="text-lg md:text-xl text-gray-300 mb-8">
                AI-powered insights, BoMs, compliance checks, and more — all from your drawings.
              </p>
              <div className="flex flex-col sm:flex-row justify-center md:justify-start space-y-4 sm:space-y-0 sm:space-x-4">
                {/* Removed "Try It Free" button */}
                <Link href="/signup" legacyBehavior>
                  <a className="border border-gray-500 hover:bg-gray-700 text-white font-bold py-3 px-6 rounded transition duration-300 text-center">
                    See a Live Demo
                  </a>
                </Link>
              </div>
            </div>
            {/* Right Side: Guest Upload Section Content Moved Here - Added flex for vertical centering */}
            <div className="mt-10 md:mt-0 flex flex-col justify-center">
              <div className="bg-[#100926] p-8 rounded-lg shadow-xl border border-[#130830]">
                <h2 className="text-2xl font-semibold mb-4 text-center text-white">Upload to Start Analyzing</h2>
                <div className="max-w-md mx-auto">
                  {/* Changed border color to white */}
                  <label htmlFor="guest-file-upload" className="flex justify-center w-full h-32 px-4 transition bg-[#110927] hover:bg-[#130830] border-2 border-white border-dashed rounded-md appearance-none cursor-pointer focus:outline-none items-center text-center">
                    <span className="flex items-center space-x-2">
                      <svg xmlns="http://www.w3.org/2000/svg" className="w-6 h-6 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
                        <path strokeLinecap="round" strokeLinejoin="round" d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
                      </svg>
                      <span className="font-medium text-gray-400">
                        Drop files here, or <span className="text-blue-400 underline">browse</span>
                      </span>
                    </span>
                    {/* Add 'multiple' attribute to allow multiple file selection */}
                    {/* Add 'accept' attribute to specify allowed file types, including .dxf */}
                    <input type="file" id="guest-file-upload" className="hidden" multiple accept=".pdf, .png, .jpg, .jpeg, .dxf, .dwg" onChange={(e) => {
                      if (e.target.files && e.target.files.length > 0) { handleGuestUpload(e.target.files); } // Pass the FileList
                      }} disabled={isUploading} />
                  </label>
                  {/* Replace loading text with progress bar, pass dynamic text */}
                  {isUploading && !uploadError && (
                    <div className="mt-4">
                      <MultiStepProgressBar
                        steps={uploadSteps}
                        currentStepIndex={uploadStep}
                        currentStepTextOverride={uploadProgressText} // Pass dynamic text
                      />
                    </div>
                  )}
                  {uploadError && <p className="text-center text-red-500 mt-4">Error: {uploadError}</p>}
                  <p className="text-xs text-gray-500 mt-2 text-center">Supported formats: PDF, PNG, JPG, DWG, DXF</p>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* 3. Social Proof / Trust Bar - REMOVED */}

        {/* Guest Upload Section - REMOVED */}

        {/* 4. Core Feature Highlights - Removed container/padding from inner div */}
        <section className="py-16 bg-[#100926] -mx-6"> {/* Adjust padding/margin */}
          <div className="px-6"> {/* Removed container mx-auto */}
            <h2 className="text-3xl md:text-4xl font-bold text-center text-white mb-12">The AI Assistant for Every Engineer.</h2>
            <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-8">
              {/* Feature 1 */}
              <div className="bg-[#110927] p-6 rounded-lg border border-[#130830]">
                <PlaceholderIcon className="w-8 h-8 mb-4 text-[#a78bfa]"/> {/* Violet Accent */}
                <h3 className="text-xl font-semibold text-white mb-2">Smart Diagram Analysis</h3>
                <p className="text-gray-400">Detect pipes, beams, annotations, and components automatically.</p>
              </div>
              {/* Feature 2 */}
              <div className="bg-[#110927] p-6 rounded-lg border border-[#130830]">
                <PlaceholderIcon className="w-8 h-8 mb-4 text-[#a78bfa]"/>
                <h3 className="text-xl font-semibold text-white mb-2">Ask in Plain English</h3>
                <p className="text-gray-400">Chat directly with your blueprints and schematics to get instant answers.</p>
              </div>
              {/* Feature 3 */}
              <div className="bg-[#110927] p-6 rounded-lg border border-[#130830]">
                <PlaceholderIcon className="w-8 h-8 mb-4 text-[#a78bfa]"/>
                <h3 className="text-xl font-semibold text-white mb-2">Instant BoM & Reports</h3>
                <p className="text-gray-400">Generate accurate Bills of Materials and reports without manual markups.</p>
              </div>
              {/* Feature 4 */}
              <div className="bg-[#110927] p-6 rounded-lg border border-[#130830]">
                <PlaceholderIcon className="w-8 h-8 mb-4 text-[#a78bfa]"/>
                <h3 className="text-xl font-semibold text-white mb-2">Code Compliance Checks</h3>
                <p className="text-gray-400">Validate designs against IBC, Eurocodes, IS standards, and more.</p>
              </div>
            </div>
          </div>
        </section>

        {/* 5. Workflow Section: How It Works - Removed container/padding from inner div */}
        <section className="py-16 bg-[#0c071a] -mx-6"> {/* Adjust padding/margin */}
          <div className="px-6"> {/* Removed container mx-auto */}
            <h2 className="text-3xl md:text-4xl font-bold text-center text-white mb-12">From Upload to Insights in 3 Easy Steps</h2>
            <div className="grid md:grid-cols-3 gap-8 text-center">
              {/* Step 1 */}
              <div>
                <div className="bg-[#130830] rounded-full w-16 h-16 flex items-center justify-center mx-auto mb-4 text-white font-bold text-2xl">1</div>
                <h3 className="text-xl font-semibold text-white mb-2">Upload Your Drawing</h3>
                <p className="text-gray-400">Supports PDF, PNG, CAD, DWG, DXF, and more formats.</p>
              </div>
              {/* Step 2 */}
              <div>
                <div className="bg-[#130830] rounded-full w-16 h-16 flex items-center justify-center mx-auto mb-4 text-white font-bold text-2xl">2</div>
                <h3 className="text-xl font-semibold text-white mb-2">Ask Any Engineering Question</h3>
                <p className="text-gray-400">Skew angle? Load capacity? Utility conflicts? Get answers fast.</p>
              </div>
              {/* Step 3 */}
              <div>
                <div className="bg-[#130830] rounded-full w-16 h-16 flex items-center justify-center mx-auto mb-4 text-white font-bold text-2xl">3</div>
                <h3 className="text-xl font-semibold text-white mb-2">Download Reports or Export BoMs</h3>
                <p className="text-gray-400">Get structured reports, comparisons, and exportable data.</p>
              </div>
            </div>
          </div>
        </section>

        {/* 6. Use Case Cards - Removed container/padding from inner div */}
        <section className="py-16 bg-[#100926] -mx-6"> {/* Adjust padding/margin */}
          <div className="px-6"> {/* Removed container mx-auto */}
            <h2 className="text-3xl md:text-4xl font-bold text-center text-white mb-12">Built for Every Engineering Discipline</h2>
            <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-8">
              {/* Card 1 */}
              <div className="bg-[#110927] p-6 rounded-lg border border-[#130830] text-center">
                <PlaceholderIcon className="w-10 h-10 mx-auto mb-4 text-[#a78bfa]"/>
                <h3 className="text-xl font-semibold text-white mb-2">Civil / Bridges</h3>
                <p className="text-gray-400 mb-4">Compliance checks, bent analysis, load summaries.</p>
                <a href="#" className="text-blue-400 hover:underline">Explore →</a>
              </div>
              {/* Card 2 */}
              <div className="bg-[#110927] p-6 rounded-lg border border-[#130830] text-center">
                <PlaceholderIcon className="w-10 h-10 mx-auto mb-4 text-[#a78bfa]"/>
                <h3 className="text-xl font-semibold text-white mb-2">Mechanical</h3>
                <p className="text-gray-400 mb-4">Component labeling, assembly guide generation.</p>
                <a href="#" className="text-blue-400 hover:underline">Explore →</a>
              </div>
              {/* Card 3 */}
              <div className="bg-[#110927] p-6 rounded-lg border border-[#130830] text-center">
                <PlaceholderIcon className="w-10 h-10 mx-auto mb-4 text-[#a78bfa]"/>
                <h3 className="text-xl font-semibold text-white mb-2">Oil & Gas</h3>
                <p className="text-gray-400 mb-4">P&ID data extraction, safety checks, equipment lists.</p>
                <a href="#" className="text-blue-400 hover:underline">Explore →</a>
              </div>
              {/* Card 4 */}
              <div className="bg-[#110927] p-6 rounded-lg border border-[#130830] text-center">
                <PlaceholderIcon className="w-10 h-10 mx-auto mb-4 text-[#a78bfa]"/>
                <h3 className="text-xl font-semibold text-white mb-2">Electrical</h3>
                <p className="text-gray-400 mb-4">Circuit diagram parsing, component labeling.</p>
                <a href="#" className="text-blue-400 hover:underline">Explore →</a>
              </div>
            </div>
          </div>
        </section>

        {/* 7. Pricing Section - REMOVED */}

        {/* 8. FAQ Section - Removed container/padding from inner div, kept max-w */}
        <section className="py-16 bg-[#100926] -mx-6"> {/* Adjust padding/margin */}
          <div className="px-6 max-w-3xl mx-auto"> {/* Removed container, added mx-auto */}
            <h2 className="text-3xl md:text-4xl font-bold text-center text-white mb-12">Frequently Asked Questions</h2>
            <div className="space-y-6">
              {/* FAQ Item 1 */}
              <details className="bg-[#110927] p-4 rounded-lg border border-[#130830]">
                <summary className="font-semibold text-white cursor-pointer">What file formats are supported?</summary>
                <p className="text-gray-400 mt-2">We support PDF, PNG, JPG, TIFF, DWG, DXF, and more. Our AI works best with clear vector or high-resolution raster images.</p>
              </details>
              {/* FAQ Item 2 */}
              <details className="bg-[#110927] p-4 rounded-lg border border-[#130830]">
                <summary className="font-semibold text-white cursor-pointer">How accurate is the AI?</summary>
                <p className="text-gray-400 mt-2">Our AI models are trained on vast datasets of engineering diagrams for high accuracy in OCR, component recognition, and data extraction. Accuracy can vary based on diagram quality and complexity.</p>
              </details>
              {/* FAQ Item 3 */}
              <details className="bg-[#110927] p-4 rounded-lg border border-[#130830]">
                <summary className="font-semibold text-white cursor-pointer">Can I upload native CAD drawings?</summary>
                <p className="text-gray-400 mt-2">Yes, we support direct uploads of DWG and DXF files. The system converts them for analysis.</p>
              </details>
              {/* FAQ Item 4 */}
              <details className="bg-[#110927] p-4 rounded-lg border border-[#130830]">
                <summary className="font-semibold text-white cursor-pointer">Do you support version comparisons?</summary>
                <p className="text-gray-400 mt-2">Yes, our platform allows you to upload multiple versions of a diagram and visually compare the differences.</p>
              </details>
            </div>
          </div>
        </section>
      </main> {/* Close main tag */}

      {/* 9. Footer Section - Kept outside main, retains its own container */}
      <footer className="bg-[#100926] border-t border-[#130830]"> {/* Removed mt-16 as main has py-16 */}
        <div className="container mx-auto px-6 py-8">
          <div className="grid md:grid-cols-4 gap-8">
            {/* Logo & Copyright */}
            <div>
              <h3 className="text-lg font-bold text-white mb-2">Engineering Insights</h3>
              <p className="text-gray-400 text-sm">&copy; {new Date().getFullYear()}. All rights reserved.</p>
            </div>
            {/* Links 1 */}
            <div>
              <h4 className="font-semibold text-white mb-3">Product</h4>
              <ul className="space-y-2">
                <li><a href="#" className="text-gray-400 hover:text-white text-sm">How it Works</a></li>
                <li><a href="#" className="text-gray-400 hover:text-white text-sm">Use Cases</a></li>
                <li><a href="#" className="text-gray-400 hover:text-white text-sm">Pricing</a></li>
              </ul>
            </div>
            {/* Links 2 */}
            <div>
              <h4 className="font-semibold text-white mb-3">Resources</h4>
              <ul className="space-y-2">
                <li><a href="#" className="text-gray-400 hover:text-white text-sm">Blog</a></li>
                <li><a href="#" className="text-gray-400 hover:text-white text-sm">Docs</a></li>
                <li><a href="#" className="text-gray-400 hover:text-white text-sm">Case Studies</a></li>
              </ul>
            </div>
            {/* Links 3 & Social */}
            <div>
              <h4 className="font-semibold text-white mb-3">Company</h4>
              <ul className="space-y-2 mb-4">
                <li><a href="#" className="text-gray-400 hover:text-white text-sm">Contact</a></li>
                <li><a href="#" className="text-gray-400 hover:text-white text-sm">Terms of Service</a></li>
                <li><a href="#" className="text-gray-400 hover:text-white text-sm">Privacy Policy</a></li>
              </ul>
              {/* Social Icons Placeholders */}
              <div className="flex space-x-4">
                <a href="#" className="text-gray-400 hover:text-white"><PlaceholderIcon /></a> {/* Twitter */}
                <a href="#" className="text-gray-400 hover:text-white"><PlaceholderIcon /></a> {/* LinkedIn */}
                <a href="#" className="text-gray-400 hover:text-white"><PlaceholderIcon /></a> {/* GitHub */}
              </div>
            </div>
          </div>
        </div>
      </footer>
    </div> // Close the wrapping div
  );
}
