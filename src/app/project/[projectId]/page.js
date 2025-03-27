'use client';

import React, { useState, useEffect, useRef } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { useSession } from 'next-auth/react';
import LoadingSpinner from '@/components/LoadingSpinner';
import ReactMarkdown from 'react-markdown';

export default function ProjectDetailPage() {
  const { projectId } = useParams();
  const { data: session, status } = useSession();
  const router = useRouter();
  const [project, setProject] = useState(null);
  const [diagrams, setDiagrams] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [preparationStatus, setPreparationStatus] = useState('loading');
  const [chatHistory, setChatHistory] = useState([]);
  const [chatInput, setChatInput] = useState('');
  const [isChatLoading, setIsChatLoading] = useState(false);
  const [chatError, setChatError] = useState('');
  const [isReportLoading, setIsReportLoading] = useState(false);
  const [reportStatusMessage, setReportStatusMessage] = useState(''); // For SSE status
  const [reportError, setReportError] = useState('');
  const chatContainerRef = useRef(null);
  const eventSourceRef = useRef(null); // Ref to hold the EventSource instance

  // Effect for fetching project data and triggering sync
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
        setPreparationStatus('loading');
        const response = await fetch(`/api/projects/${projectId}/prepare`);
        if (!response.ok) {
          const errorData = await response.json().catch(() => ({}));
          throw new Error(errorData.message || `Failed to fetch project data (Status: ${response.status})`);
        }
        const data = await response.json();
        setProject(data.project);
        setDiagrams(data.diagrams || []);
        setChatHistory(data.chatHistory || []);
        setPreparationStatus(data.preparationStatus || 'failed');

        // Trigger background file sync
        if (data.diagrams && data.diagrams.length > 0) {
          console.log("Triggering background file sync...");
          fetch(`/api/projects/${projectId}/sync-files`, { method: 'POST' })
            .then(async (syncRes) => {
              const syncData = await syncRes.json().catch(() => ({}));
              if (syncRes.ok) {
                console.log(`Sync result: Synced ${syncData.synced}, Skipped ${syncData.skipped}, Errors ${syncData.errors}`);
              } else {
                console.error(`Sync failed: ${syncData.message || syncRes.statusText}`);
              }
            })
            .catch(syncErr => console.error("Error triggering sync:", syncErr));
        }
      } catch (err) {
        console.error('Error preparing project data:', err);
        setPreparationStatus('failed');
        setError(err.message);
      } finally {
        setLoading(false);
      }
    }

    if (status === 'authenticated') {
      fetchData();
    }
  }, [projectId, status, router]);

  // Effect for auto-scrolling chat
  useEffect(() => {
    if (chatContainerRef.current) {
      chatContainerRef.current.scrollTop = chatContainerRef.current.scrollHeight;
    }
  }, [chatHistory]);

  // Cleanup EventSource on component unmount
  useEffect(() => {
    return () => {
      if (eventSourceRef.current) {
        console.log("Closing SSE connection on unmount.");
        eventSourceRef.current.close();
      }
    };
  }, []);

  // --- Report Download Handlers ---
  const handleOcrDownload = () => {
    if (isReportLoading) return;

    setIsReportLoading(true);
    setReportStatusMessage('Connecting...');
    setReportError('');

    // Close existing connection if any
    if (eventSourceRef.current) {
        eventSourceRef.current.close();
    }

    // Create a new EventSource connection
    const eventSource = new EventSource(`/api/projects/${projectId}/reports/ocr`);
    eventSourceRef.current = eventSource; // Store ref

    eventSource.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);
        console.log("SSE message:", data);
        if (data.status) {
          setReportStatusMessage(data.status);
        }
      } catch (e) {
        console.error("Failed to parse SSE message data:", event.data, e);
        setReportStatusMessage('Processing update...'); // Generic update
      }
    };

    eventSource.addEventListener('complete', (event) => {
      console.log("SSE complete event:", event.data);
      try {
        const data = JSON.parse(event.data);
        if (data.downloadUrl) {
          setReportStatusMessage('Report ready! Opening...');
          // Open the download URL in a new tab/window
          window.open(data.downloadUrl, '_blank');
          // Alternative: Create a link and click it (might be blocked by pop-up blockers)
          // const a = document.createElement('a');
          // a.href = data.downloadUrl;
          // a.download = `pdr_report_${projectId}.pdf`; // Suggest filename again
          // document.body.appendChild(a);
          // a.click();
          // a.remove();
        } else {
           throw new Error("Download URL missing in completion event.");
        }
      } catch (e) {
         console.error("Failed to handle SSE complete event:", e);
         setReportError("Failed to process download link.");
      } finally {
         setIsReportLoading(false);
         setReportStatusMessage('');
         eventSource.close(); // Close connection on completion
         eventSourceRef.current = null;
      }
    });

    eventSource.addEventListener('error', (event) => {
       console.error("SSE error event:", event);
       let errorMessage = "Report generation failed.";
       // Attempt to parse error message if sent in data
       if (event.data) {
           try {
               const errorData = JSON.parse(event.data);
               if (errorData.message) {
                   errorMessage = errorData.message;
               }
           } catch (e) {
                console.error("Failed to parse SSE error data:", event.data);
           }
       }
       setReportError(errorMessage);
       setIsReportLoading(false);
       setReportStatusMessage('');
       eventSource.close(); // Close connection on error
       eventSourceRef.current = null;
    });

     eventSource.onerror = (err) => {
        // This handles general connection errors for the EventSource itself
        console.error("EventSource failed:", err);
        if (isReportLoading) { // Only set error if we were actively loading
             setReportError('Connection error during report generation.');
             setIsReportLoading(false);
             setReportStatusMessage('');
        }
        eventSource.close();
        eventSourceRef.current = null;
    };
  };

  // Placeholder handlers
  const handleBomDownload = () => alert('BoM Download TBD');
  const handleComplianceDownload = () => alert('Compliance Download TBD');
  // --- End Report Download Handlers ---


  const handleSendMessage = async () => {
    // ... (keep existing handleSendMessage function as is)
    if (!chatInput.trim() || isChatLoading || preparationStatus !== 'ready') return;
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
        body: JSON.stringify({ message: newMessage.text, history: chatHistory.slice(-6) }),
      });
      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.message || 'Failed to get chat response');
      }
      const data = await response.json();
      setChatHistory([...currentHistory, { role: 'model', text: data.response }]);
    } catch (err) {
      console.error('Chat error:', err);
      setChatError(err.message);
    } finally {
      setIsChatLoading(false);
    }
  };

  // --- Render Logic ---
  if (loading || status === 'loading') {
    return <div className="flex-grow flex items-center justify-center bg-gray-900"><LoadingSpinner text="Loading project..." /></div>;
  }
  if (error && preparationStatus === 'failed') {
    return <div className="flex-grow flex items-center justify-center bg-gray-900 text-white">Error loading project data: {error}</div>;
  }
  if (!project) {
    return <div className="flex-grow flex items-center justify-center bg-gray-900 text-white">Project data unavailable.</div>;
  }

  return (
    <div className="flex flex-col md:flex-row h-full">
      {/* Left Column */}
      <div className="w-full md:w-1/3 lg:w-1/4 p-4 border-r border-gray-700 flex flex-col space-y-6 overflow-y-auto">
        {/* Project Files Section */}
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
                  <div className="flex justify-end space-x-2 mt-1">
                    {/* <button className="text-xs text-blue-400 hover:text-blue-300">Download</button> */}
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

        {/* Project Reports Section */}
        {diagrams.length > 0 && (
          <div>
            <h2 className="text-xl font-semibold mb-3 text-white">Project Reports</h2>
            {reportError && <p className="text-red-500 text-xs mb-2">Report Error: {reportError}</p>}
            <div className="flex flex-col space-y-2">
              <button
                onClick={handleOcrDownload}
                className={`bg-blue-600 hover:bg-blue-500 text-white font-bold py-2 px-4 rounded text-sm cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center min-h-[36px] relative`} // Added relative for potential absolute positioning if needed later
                disabled={isReportLoading}
              >
                {isReportLoading ? (
                  <div className="flex items-center justify-center space-x-2">
                    {/* Pass null to text prop to prevent default spinner text */}
                    <LoadingSpinner size="sm" text={null} /> 
                    <span>{reportStatusMessage || "Generating..."}</span>
                  </div>
                ) : (
                  'OCR Download'
                )}
              </button>
              <button
                onClick={handleBomDownload}
                className="bg-green-600 hover:bg-green-500 text-white font-bold py-2 px-4 rounded text-sm cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
                disabled={isReportLoading}
              >
                BoM Download
              </button>
              <button
                onClick={handleComplianceDownload}
                className="bg-yellow-600 hover:bg-yellow-500 text-white font-bold py-2 px-4 rounded text-sm cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
                disabled={isReportLoading}
              >
                Compliance Download
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Right Column: Chat Interface */}
      <div className="w-full md:w-2/3 lg:w-3/4 p-6 flex flex-col overflow-hidden">
        <h2 className="text-2xl font-semibold mb-4 text-white">Contextual Chat</h2>
        <div className="flex-grow bg-gray-800 rounded-lg shadow p-4 flex flex-col overflow-hidden">
          {preparationStatus === 'loading' ? (
             <div className="flex-grow flex items-center justify-center"><LoadingSpinner text="Preparing documents for chat..." /></div>
          ) : preparationStatus === 'processing' ? (
             <div className="flex-grow flex items-center justify-center text-yellow-400"><LoadingSpinner text="Documents are processing, please wait..." /></div>
          ) : preparationStatus === 'failed' ? (
             <p className="text-red-500 text-center flex-grow flex items-center justify-center">Failed to prepare documents for chat. Please try reloading.</p>
          ) : preparationStatus === 'no_files' ? (
             <p className="text-gray-400 text-center flex-grow flex items-center justify-center">Upload diagrams to enable contextual chat.</p>
          ) : preparationStatus === 'ready' ? (
            <React.Fragment>
              {/* Chat History */}
              <div ref={chatContainerRef} className="flex-grow overflow-y-auto space-y-4 pr-2">
                {chatHistory.map((msg, index) => (
                  <div key={index} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                    <div className={`p-3 rounded-lg max-w-lg prose prose-invert ${msg.role === 'user' ? 'bg-indigo-600 text-white' : 'bg-gray-600 text-white'}`}>
                      {msg.role === 'model' ? <ReactMarkdown>{msg.text}</ReactMarkdown> : msg.text}
                    </div>
                  </div>
                ))}
                 {isChatLoading && <div className="flex justify-start"><div className="p-3 rounded-lg max-w-lg bg-gray-600 text-white"><LoadingSpinner text="Thinking..." /></div></div>}
                 {chatError && <p className="text-red-500 text-sm">Error: {chatError}</p>}
              </div>
              {/* Chat Input */}
              <div className="mt-auto flex pt-4">
                <textarea
                  className="flex-grow p-2 bg-gray-700 rounded-l border border-gray-600 text-white focus:outline-none focus:ring-1 focus:ring-indigo-500 disabled:opacity-70"
                  placeholder="Ask questions about the diagrams..."
                  rows="2"
                  value={chatInput}
                  onChange={(e) => setChatInput(e.target.value)}
                  onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSendMessage(); } }}
                  disabled={isChatLoading || preparationStatus !== 'ready'}
                ></textarea>
                <button
                  className="bg-indigo-600 hover:bg-indigo-500 text-white font-bold p-2 rounded-r disabled:opacity-50"
                  onClick={handleSendMessage}
                  disabled={isChatLoading || !chatInput.trim() || preparationStatus !== 'ready'}
                >
                  Send
                </button>
              </div>
            </React.Fragment>
          ) : null }
        </div>
      </div>
    </div>
  );
}
