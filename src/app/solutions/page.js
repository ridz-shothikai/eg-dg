import React from 'react';
import Link from 'next/link'; // Import Link for navigation

// Placeholder Icon (can be reused or replaced)
const PlaceholderIcon = ({ className = "w-6 h-6" }) => (
  <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M10 20l4-16m4 4l4 4-4 4M6 16l-4-4 4-4"></path>
  </svg>
);


export default function SolutionsPage() {
  // Header is now rendered by layout.js
  return (
    // Keep base background/text colors here
    <div className="min-h-screen bg-[#0c071a] text-gray-200 font-sans">
      {/* Main Content - Restored container mx-auto */}
      <main className="container mx-auto px-6 py-16"> {/* Restored container mx-auto */}
        <h1 className="text-4xl font-bold text-center text-white mb-16">Solutions</h1>

        {/* Placeholder Content */}
        <div className="bg-[#100926] p-8 rounded-lg shadow-xl border border-[#130830] space-y-6">
          <p className="text-lg text-gray-300">
            Engineering Insights offers tailored solutions to address the specific challenges faced by different engineering disciplines. Our AI-powered platform transforms how you interact with technical drawings, boosting efficiency and accuracy.
          </p>

          <div>
            <h2 className="text-2xl font-semibold text-white mb-3">Solutions by Discipline:</h2>
            <ul className="list-disc list-inside text-lg text-gray-300 space-y-2">
              <li><strong>Civil Engineering:</strong> Automated compliance checks, structural analysis support, BoQ generation.</li>
              <li><strong>Mechanical Engineering:</strong> Component identification, assembly verification, BoM for manufacturing.</li>
              <li><strong>Electrical Engineering:</strong> Schematic parsing, component listing, connection tracing.</li>
              <li><strong>Oil & Gas:</strong> P&ID data extraction, safety system verification, equipment tagging.</li>
            </ul>
          </div>
           <p className="text-lg text-gray-300">
            Explore our Use Cases page for more detailed examples within each discipline.
          </p>
        </div>
      </main>

      {/* Reusing the same footer structure */}
       <footer className="bg-[#100926] border-t border-[#130830] mt-16">
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
