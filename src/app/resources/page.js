import React from 'react';
import Link from 'next/link'; // Import Link for navigation

// Placeholder Icon (can be reused or replaced)
const PlaceholderIcon = ({ className = "w-6 h-6" }) => (
  <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M10 20l4-16m4 4l4 4-4 4M6 16l-4-4 4-4"></path>
  </svg>
);


export default function ResourcesPage() {
  // Header is now rendered by layout.js
  return (
    // Keep base background/text colors here
    <div className="min-h-screen bg-[#0c071a] text-gray-200 font-sans">
      {/* Main Content - Restored container mx-auto */}
      <main className="container mx-auto px-6 py-16"> {/* Restored container mx-auto */}
        <h1 className="text-4xl font-bold text-center text-white mb-16">Resources</h1>

        {/* Resource Categories */}
        <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-8">

          {/* Blog */}
          <div className="bg-[#100926] p-6 rounded-lg shadow-xl border border-[#130830]">
            <div className="flex items-center mb-4">
              <PlaceholderIcon className="w-8 h-8 mr-3 text-[#a78bfa]"/>
              <h2 className="text-2xl font-semibold text-white">Blog</h2>
            </div>
            <p className="text-gray-300 mb-4">
              Stay updated with the latest product news, industry insights, and tips for leveraging AI in engineering.
            </p>
            <a href="#" className="text-blue-400 hover:underline">Visit Blog →</a> {/* Placeholder Link */}
          </div>

          {/* Documentation */}
          <div className="bg-[#100926] p-6 rounded-lg shadow-xl border border-[#130830]">
            <div className="flex items-center mb-4">
              <PlaceholderIcon className="w-8 h-8 mr-3 text-[#a78bfa]"/>
              <h2 className="text-2xl font-semibold text-white">Documentation</h2>
            </div>
            <p className="text-gray-300 mb-4">
              Find detailed guides, API references, and tutorials to help you integrate and use the platform effectively.
            </p>
            <a href="#" className="text-blue-400 hover:underline">Read Docs →</a> {/* Placeholder Link */}
          </div>

          {/* Case Studies */}
          <div className="bg-[#100926] p-6 rounded-lg shadow-xl border border-[#130830]">
            <div className="flex items-center mb-4">
              <PlaceholderIcon className="w-8 h-8 mr-3 text-[#a78bfa]"/>
              <h2 className="text-2xl font-semibold text-white">Case Studies</h2>
            </div>
            <p className="text-gray-300 mb-4">
              Learn how other engineering firms and infrastructure teams are using our platform to save time and improve accuracy.
            </p>
            <a href="#" className="text-blue-400 hover:underline">View Case Studies →</a> {/* Placeholder Link */}
          </div>

          {/* Guides (Optional Addition) */}
          <div className="bg-[#100926] p-6 rounded-lg shadow-xl border border-[#130830]">
            <div className="flex items-center mb-4">
              <PlaceholderIcon className="w-8 h-8 mr-3 text-[#a78bfa]"/>
              <h2 className="text-2xl font-semibold text-white">Guides & Tutorials</h2>
            </div>
            <p className="text-gray-300 mb-4">
              Step-by-step guides on specific features like compliance checking, BoM generation, and advanced chat queries.
            </p>
            <a href="#" className="text-blue-400 hover:underline">Explore Guides →</a> {/* Placeholder Link */}
          </div>

           {/* Support (Optional Addition) */}
           <div className="bg-[#100926] p-6 rounded-lg shadow-xl border border-[#130830]">
            <div className="flex items-center mb-4">
              <PlaceholderIcon className="w-8 h-8 mr-3 text-[#a78bfa]"/>
              <h2 className="text-2xl font-semibold text-white">Support Center</h2>
            </div>
            <p className="text-gray-300 mb-4">
              Find answers to common questions, troubleshoot issues, or contact our support team for assistance.
            </p>
            <a href="#" className="text-blue-400 hover:underline">Get Support →</a> {/* Placeholder Link */}
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
