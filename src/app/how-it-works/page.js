import React from 'react';
import Link from 'next/link'; // Import Link for navigation

// Placeholder Icon (can be reused or replaced)
const PlaceholderIcon = ({ className = "w-6 h-6" }) => (
  <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M10 20l4-16m4 4l4 4-4 4M6 16l-4-4 4-4"></path>
  </svg>
);


export default function HowItWorksPage() {
  // Header is now rendered by layout.js
  return (
    // Keep base background/text colors here
    <div className="min-h-screen bg-[#0c071a] text-gray-200 font-sans">
      {/* Main Content */}
      <main className="container mx-auto px-6 py-16">
        <h1 className="text-4xl font-bold text-center text-white mb-16">How Engineering Diagram Insights Works</h1>

        {/* Detailed Workflow Steps */}
        <div className="space-y-12">

          {/* Step 1: Upload */}
          <div className="grid md:grid-cols-2 gap-8 items-center">
            <div>
              <div className="bg-[#130830] rounded-full w-16 h-16 flex items-center justify-center mb-4 text-white font-bold text-2xl">1</div>
              <h2 className="text-3xl font-semibold text-white mb-4">Upload Your Drawing</h2>
              <p className="text-lg text-gray-300 mb-4">
                Simply drag and drop or browse to upload your engineering diagrams. We support a wide range of formats including PDF, PNG, JPG, DWG, and DXF.
              </p>
              <p className="text-lg text-gray-300">
                Once uploaded, your file is securely stored, and our system immediately begins the analysis process.
              </p>
            </div>
            <div className="bg-[#100926] p-6 rounded-lg border border-[#130830] aspect-video flex items-center justify-center text-gray-500">
              [Visual Placeholder: Upload Interface Mockup]
            </div>
          </div>

          {/* Step 2: Analyze & Ask */}
          <div className="grid md:grid-cols-2 gap-8 items-center">
            <div className="bg-[#100926] p-6 rounded-lg border border-[#130830] aspect-video flex items-center justify-center text-gray-500 md:order-last">
              [Visual Placeholder: Chat Interface Mockup]
            </div>
            <div>
              <div className="bg-[#130830] rounded-full w-16 h-16 flex items-center justify-center mb-4 text-white font-bold text-2xl">2</div>
              <h2 className="text-3xl font-semibold text-white mb-4">AI Analysis & Natural Language Chat</h2>
              <p className="text-lg text-gray-300 mb-4">
                Our platform utilizes advanced Optical Character Recognition (OCR) powered by Google Cloud Vision to extract text and identify key components within your diagram.
              </p>
              <p className="text-lg text-gray-300 mb-4">
                Leveraging the power of Google's Gemini models, the system analyzes the extracted data and the diagram's structure.
              </p>
              <p className="text-lg text-gray-300">
                You can then interact with your diagram using plain English. Ask specific questions like "What is the material specification for beam B-101?" or "List all safety valves shown" and receive instant, context-aware answers.
              </p>
            </div>
          </div>

          {/* Step 3: Insights & Reports */}
          <div className="grid md:grid-cols-2 gap-8 items-center">
            <div>
              <div className="bg-[#130830] rounded-full w-16 h-16 flex items-center justify-center mb-4 text-white font-bold text-2xl">3</div>
              <h2 className="text-3xl font-semibold text-white mb-4">Generate Reports & Export Data</h2>
              <p className="text-lg text-gray-300 mb-4">
                Go beyond simple Q&A. Automatically generate comprehensive reports such as:
              </p>
              <ul className="list-disc list-inside text-lg text-gray-300 space-y-2 mb-4">
                <li>Bill of Materials (BoM) / Bill of Quantities (BoQ)</li>
                <li>Code Compliance Checks (IBC, Eurocodes, IS Standards, etc.)</li>
                <li>Component Summaries</li>
                <li>Version Comparison Reports</li>
              </ul>
              <p className="text-lg text-gray-300">
                Export extracted data and reports in various formats (CSV, PDF, JSON) for seamless integration into your existing workflows.
              </p>
            </div>
            <div className="bg-[#100926] p-6 rounded-lg border border-[#130830] aspect-video flex items-center justify-center text-gray-500">
              [Visual Placeholder: Report Generation Mockup]
            </div>
          </div>

        </div>
      </main>

      {/* Reusing the same footer structure */}
       <footer className="bg-[#100926] border-t border-[#130830] mt-16">
        <div className="container mx-auto px-6 py-8">
          <div className="grid md:grid-cols-4 gap-8">
            {/* Logo & Copyright */}
            <div>
              <h3 className="text-lg font-bold text-white mb-2">Engineering Diagram Insights</h3>
              <p className="text-gray-400 text-sm">&copy; {new Date().getFullYear()}. All rights reserved.</p>
            </div>
            {/* Links 1 */}
            <div>
              <h4 className="font-semibold text-white mb-3">Product</h4>
              <ul className="space-y-2">
                <li><Link href="/how-it-works" legacyBehavior><a className="text-gray-400 hover:text-white text-sm">How it Works</a></Link></li>
                <li><Link href="/use-cases" legacyBehavior><a className="text-gray-400 hover:text-white text-sm">Use Cases</a></Link></li>
                {/* Pricing removed */}
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
    </div>
  );
}
