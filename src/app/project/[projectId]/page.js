'use client';

import React, { useState, useEffect } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { useSession } from 'next-auth/react';
import LoadingSpinner from '@/components/LoadingSpinner';

export default function ProjectDetailPage() {
  const { projectId } = useParams();
  const { data: session, status } = useSession();
  const router = useRouter();
  const [project, setProject] = useState(null);
  const [diagrams, setDiagrams] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [chatHistory, setChatHistory] = useState([]); // { role: 'user' | 'model', text: string }[]
  const [chatInput, setChatInput] = useState('');
  const [isChatLoading, setIsChatLoading] = useState(false);
  const [chatError, setChatError] = useState('');

  useEffect(() => {
    if (status === 'loading') return;
    if (status === 'unauthenticated') {
      router.push('/login');
      return;
    }

    async function fetchData() {
      if (!projectId) return;

      try {
        setLoading(true);
        setError(null);
        // Fetch Project Details, Diagrams, and Chat History from Prepare API
        const response = await fetch(`/api/projects/${projectId}/prepare`); // Call prepare endpoint

        if (!response.ok) {
          const errorData = await response.json().catch(() => ({}));
          if (response.status === 404) throw new Error('Project not found');
          if (response.status === 403) throw new Error('Forbidden: You do not own this project');
          throw new Error(errorData.message || `Failed to fetch project data (Status: ${response.status})`);
        }

        const data = await response.json();
        setProject(data.project);
        setDiagrams(data.diagrams || []);
        setChatHistory(data.chatHistory || []); // Set initial chat history

      } catch (err) {
        console.error('Error preparing project data:', err);
        setError(err.message);
      } finally {
        setLoading(false);
      }
    }

    if (status === 'authenticated') {
      fetchData();
    }
  }, [projectId, status, router]); // Dependencies

  // Placeholder handlers for report downloads
  const handleDownloadCombinedReport = () => alert('Combined report download TBD');
  const handleDownloadCostReport = () => alert('Cost report download TBD');

  // Chat message handler
  const handleSendMessage = async () => {
    if (!chatInput.trim() || isChatLoading) return;

    const newMessage = { role: 'user', text: chatInput };
    const currentHistory = [...chatHistory, newMessage];
    setChatHistory(currentHistory);
    setChatInput('');
    setIsChatLoading(true);
    setChatError('');

    try {
      const response = await fetch(`/api/chat/${projectId}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        // Send limited history for context, adjust as needed
        body: JSON.stringify({ message: newMessage.text, history: chatHistory.slice(-6) }),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.message || 'Failed to get chat response');
      }

      const data = await response.json();
      setChatHistory([...currentHistory, { role: 'model', text: data.response }]);

    } catch (err) {
      console.error('Chat error:', err);
      setChatError(err.message);
      // Optionally remove the user's message if the API call failed
      // setChatHistory(chatHistory);
    } finally {
      setIsChatLoading(false);
    }
  };


  if (loading || status === 'loading') {
    return (
      <div className="flex-grow flex items-center justify-center bg-gray-900">
        <LoadingSpinner text="Loading project..." />
      </div>
    );
  }

  if (error) {
    return <div className="flex-grow flex items-center justify-center bg-gray-900 text-white">Error: {error}</div>;
  }

  if (!project) {
    return <div className="flex-grow flex items-center justify-center bg-gray-900 text-white">Project not found.</div>;
  }

  return (
    <div className="flex flex-col md:flex-row h-full"> {/* Main container: flex row on medium+ screens */}

      {/* Left Column: Files & Reports */}
      <div className="w-full md:w-1/3 lg:w-1/4 p-4 border-r border-gray-700 flex flex-col space-y-6 overflow-y-auto">
        <div>
          <h2 className="text-xl font-semibold mb-3 text-white">Project Files</h2>
          <Link href={`/project/${projectId}/upload`}>
            <button className="w-full mb-4 bg-indigo-600 hover:bg-indigo-500 text-white font-bold py-2 px-4 rounded">
              + Upload Diagram
            </button>
          </Link>
          {diagrams.length > 0 ? (
            <ul className="space-y-2">
              {diagrams.map((diagram) => (
                <li key={diagram._id} className="bg-gray-700 p-3 rounded">
                  <p className="font-medium truncate text-sm mb-1" title={diagram.fileName}>{diagram.fileName}</p>
                  <p className="text-xs text-gray-400 mb-2">{new Date(diagram.createdAt).toLocaleDateString()}</p>
                  {/* Add issue badge placeholder */}
                  <div className="flex justify-end space-x-2 mt-1">
                    <button className="text-xs text-blue-400 hover:text-blue-300">Download</button>
                    <Link href={`/ocr/${diagram._id}`}><span className="text-xs text-blue-400 hover:text-blue-300 cursor-pointer">OCR</span></Link>
                    <Link href={`/bom/${diagram._id}`}><span className="text-xs text-green-400 hover:text-green-300 cursor-pointer">BoM</span></Link>
                    <Link href={`/compliance/${diagram._id}`}><span className="text-xs text-yellow-400 hover:text-yellow-300 cursor-pointer">Compliance</span></Link>
                  </div>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-gray-400 text-sm">No diagrams uploaded yet.</p>
          )}
        </div>

        {diagrams.length > 0 && (
          <div>
            <h2 className="text-xl font-semibold mb-3 text-white">Project Reports</h2>
            <div className="flex flex-col space-y-2">
              <button onClick={handleDownloadCombinedReport} className="bg-green-600 hover:bg-green-500 text-white font-bold py-2 px-4 rounded text-sm">
                Download Combined Report (PDF)
              </button>
              <button onClick={handleDownloadCostReport} className="bg-blue-600 hover:bg-blue-500 text-white font-bold py-2 px-4 rounded text-sm">
                Download Cost Estimate (PDF)
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Right Column: Chat Interface */}
      <div className="w-full md:w-2/3 lg:w-3/4 p-6 flex flex-col"> {/* Takes remaining space */}
        <h2 className="text-2xl font-semibold mb-4 text-white">Contextual Chat</h2>
        <div className="flex-grow bg-gray-800 rounded-lg shadow p-4 flex flex-col">
          {diagrams.length > 0 ? (
            <React.Fragment>
              <div className="flex-grow overflow-y-auto mb-4 space-y-4 pr-2">
                {/* Display Chat Messages */}
                {chatHistory.map((msg, index) => (
                  <div key={index} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                    <div className={`p-3 rounded-lg max-w-lg ${
                      msg.role === 'user' ? 'bg-indigo-600 text-white' : 'bg-gray-600 text-white'
                    }`}>
                      {msg.text}
                    </div>
                  </div>
                ))}
                 {isChatLoading && (
                   <div className="flex justify-start">
                     <div className="p-3 rounded-lg max-w-lg bg-gray-600 text-white">
                       <LoadingSpinner text="Thinking..." />
                     </div>
                   </div>
                 )}
                 {chatError && <p className="text-red-500 text-sm">Error: {chatError}</p>}
              </div>
              <div className="mt-auto flex">
                <textarea
                  className="flex-grow p-2 bg-gray-700 rounded-l border border-gray-600 text-white focus:outline-none focus:ring-1 focus:ring-indigo-500 disabled:opacity-70"
                  placeholder="Ask questions about the diagrams..."
                  rows="2"
                  value={chatInput}
                  onChange={(e) => setChatInput(e.target.value)}
                  onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSendMessage(); } }}
                  disabled={isChatLoading}
                ></textarea>
                <button
                  className="bg-indigo-600 hover:bg-indigo-500 text-white font-bold p-2 rounded-r disabled:opacity-50"
                  onClick={handleSendMessage}
                  disabled={isChatLoading || !chatInput.trim()}
                >
                  Send
                </button>
              </div>
            </React.Fragment>
          ) : (
            <p className="text-gray-400 text-center">Upload diagrams to enable contextual chat.</p>
          )}
        </div>
      </div>
    </div>
  );
}
