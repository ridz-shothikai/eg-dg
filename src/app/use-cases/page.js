import React from 'react';
import Link from 'next/link'; // Import Link for navigation

// Placeholder Icon (can be reused or replaced)
const PlaceholderIcon = ({ className = "w-6 h-6" }) => (
  <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M10 20l4-16m4 4l4 4-4 4M6 16l-4-4 4-4"></path>
  </svg>
);


export default function UseCasesPage() {
  // Header is now rendered by layout.js
  return (
    // Keep base background/text colors here
    <div className="min-h-screen bg-[#0c071a] text-gray-200 font-sans">
      {/* Main Content */}
      <main className="container mx-auto px-6 py-16">
        <h1 className="text-4xl font-bold text-center text-white mb-16">Use Cases for Engineering Insights</h1>

        {/* Detailed Use Cases */}
        <div className="space-y-16">

          {/* Civil / Bridges */}
          <section className="bg-[#100926] p-8 rounded-lg shadow-xl border border-[#130830]">
            <div className="flex items-center mb-6">
              <PlaceholderIcon className="w-10 h-10 mr-4 text-[#a78bfa]"/>
              <h2 className="text-3xl font-semibold text-white">Civil Engineering & Bridge Design</h2>
            </div>
            <div className="grid md:grid-cols-2 gap-6 text-lg text-gray-300">
              <div>
                <h3 className="font-semibold text-white mb-2">Automated Compliance Checks:</h3>
                <p className="mb-4">Verify designs against IBC, Eurocodes, IS standards, and local regulations automatically. Identify non-compliant elements early in the design phase.</p>
                <h3 className="font-semibold text-white mb-2">BoM/BoQ Generation:</h3>
                <p className="mb-4">Instantly generate accurate Bills of Materials and Quantities for structural elements (beams, columns, slabs, bents), materials, and finishes.</p>
              </div>
              <div>
                <h3 className="font-semibold text-white mb-2">Rapid Information Retrieval:</h3>
                <p className="mb-4">Quickly find specific details like beam dimensions, reinforcement schedules, material specifications, or bent details using natural language queries.</p>
                <h3 className="font-semibold text-white mb-2">Design Review & Collaboration:</h3>
                <p>Facilitate faster design reviews by allowing team members to easily query diagrams and verify information without manual searching.</p>
              </div>
            </div>
          </section>

          {/* Mechanical Engineering */}
          <section className="bg-[#100926] p-8 rounded-lg shadow-xl border border-[#130830]">
            <div className="flex items-center mb-6">
              <PlaceholderIcon className="w-10 h-10 mr-4 text-[#a78bfa]"/>
              <h2 className="text-3xl font-semibold text-white">Mechanical Engineering</h2>
            </div>
            <div className="grid md:grid-cols-2 gap-6 text-lg text-gray-300">
              <div>
                <h3 className="font-semibold text-white mb-2">Component Identification & Labeling:</h3>
                <p className="mb-4">Automatically identify and label standard mechanical components (valves, pumps, gears, fasteners) in assembly drawings or schematics.</p>
                <h3 className="font-semibold text-white mb-2">Assembly Guide Assistance:</h3>
                <p className="mb-4">Query assembly steps, part numbers, or connection points directly from the drawing to aid manufacturing and maintenance.</p>
              </div>
              <div>
                <h3 className="font-semibold text-white mb-2">BoM for Manufacturing:</h3>
                <p className="mb-4">Generate detailed BoMs including part numbers, quantities, materials, and specifications required for production.</p>
                <h3 className="font-semibold text-white mb-2">Maintenance & Repair:</h3>
                <p>Quickly locate specific components or understand system layouts for faster troubleshooting and repair operations.</p>
              </div>
            </div>
          </section>

          {/* Oil & Gas */}
          <section className="bg-[#100926] p-8 rounded-lg shadow-xl border border-[#130830]">
            <div className="flex items-center mb-6">
              <PlaceholderIcon className="w-10 h-10 mr-4 text-[#a78bfa]"/>
              <h2 className="text-3xl font-semibold text-white">Oil & Gas (P&IDs)</h2>
            </div>
            <div className="grid md:grid-cols-2 gap-6 text-lg text-gray-300">
              <div>
                <h3 className="font-semibold text-white mb-2">P&ID Data Extraction:</h3>
                <p className="mb-4">Automatically extract information from Piping and Instrumentation Diagrams, including equipment tags, line numbers, valve types, and instrument details.</p>
                <h3 className="font-semibold text-white mb-2">Safety & HAZOP Studies:</h3>
                <p className="mb-4">Quickly identify safety-critical equipment, isolation points, and flow paths to support Hazard and Operability studies.</p>
              </div>
              <div>
                <h3 className="font-semibold text-white mb-2">Equipment & Line Lists:</h3>
                <p className="mb-4">Generate comprehensive equipment lists, valve lists, and line lists directly from P&IDs.</p>
                <h3 className="font-semibold text-white mb-2">Operational Troubleshooting:</h3>
                <p>Understand process flows and locate specific instruments or equipment quickly during operational issues.</p>
              </div>
            </div>
          </section>

          {/* Electrical Engineering */}
          <section className="bg-[#100926] p-8 rounded-lg shadow-xl border border-[#130830]">
            <div className="flex items-center mb-6">
              <PlaceholderIcon className="w-10 h-10 mr-4 text-[#a78bfa]"/>
              <h2 className="text-3xl font-semibold text-white">Electrical Engineering</h2>
            </div>
            <div className="grid md:grid-cols-2 gap-6 text-lg text-gray-300">
              <div>
                <h3 className="font-semibold text-white mb-2">Circuit Diagram Parsing:</h3>
                <p className="mb-4">Identify components (resistors, capacitors, ICs), trace connections, and understand circuit logic from schematic diagrams.</p>
                <h3 className="font-semibold text-white mb-2">Component Labeling & BoM:</h3>
                <p className="mb-4">Automatically extract component designators, values, and specifications to generate accurate BoMs for PCB assembly or system wiring.</p>
              </div>
              <div>
                <h3 className="font-semibold text-white mb-2">Wiring & Harness Design:</h3>
                <p className="mb-4">Query connection points, wire types, and terminal numbers from wiring diagrams.</p>
                <h3 className="font-semibold text-white mb-2">Troubleshooting & Maintenance:</h3>
                <p>Quickly locate specific components or trace signals within complex electrical schematics.</p>
              </div>
            </div>
          </section>

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
