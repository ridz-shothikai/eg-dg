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

  // Refactored Report States
  const [reportStates, setReportStates] = useState({
    ocr: { isLoading: false, message: '', error: '' },
    bom: { isLoading: false, message: '', error: '' },
    compliance: { isLoading: false, message: '', error: '' },
  });
  const [activeReportType, setActiveReportType] = useState(null); // Track which report is currently running

  const chatContainerRef = useRef(null);
  const eventSourceRef = useRef(null);

  // --- Helper to manage report state ---
  const updateReportState = (reportType, updates) => {
    setReportStates(prev => ({
      ...prev,
      [reportType]: { ...prev[reportType], ...updates },
    }));
  };

  const startReport = (reportType) => {
    if (activeReportType) return false; // Prevent starting another if one is running
    setActiveReportType(reportType);
    // Reset all errors, set loading and message for the specific report
    setReportStates(prev => {
        const newState = {};
        Object.keys(prev).forEach(key => {
            newState[key] = { ...prev[key], error: '', isLoading: key === reportType, message: key === reportType ? 'Connecting...' : '' };
        });
        return newState;
    });
    if (eventSourceRef.current) eventSourceRef.current.close();
    return true;
  };

  const finishReport = (reportType, success = true) => {
    if (eventSourceRef.current) eventSourceRef.current.close();
    eventSourceRef.current = null;
    setActiveReportType(null); // Allow another report to start
    // Clear message, keep error if !success
    updateReportState(reportType, { isLoading: false, message: '' });
    if (!success && !reportStates[reportType].error) {
        // Set a generic error if none was provided by SSE
         updateReportState(reportType, { error: `${reportType.toUpperCase()} generation failed.` });
    }
  };

  const handleSseMessage = (event, reportType) => {
      try {
        const data = JSON.parse(event.data);
        if (data.status) updateReportState(reportType, { message: data.status });
      } catch (e) { updateReportState(reportType, { message: 'Processing update...' }); }
  };

  const handleSseComplete = (event, reportType) => {
      try {
        const data = JSON.parse(event.data);
        if (data.downloadUrl) {
          updateReportState(reportType, { message: 'Report ready! Opening...' });
          window.open(data.downloadUrl, '_blank');
        } else { throw new Error("Download URL missing."); }
        finishReport(reportType, true);
      } catch (e) {
         console.error(`Failed to handle SSE complete event for ${reportType}:`, e);
         updateReportState(reportType, { error: `Failed to process ${reportType.toUpperCase()} download link.` });
         finishReport(reportType, false);
      }
  };

   const handleSseError = (event, reportType) => {
       console.error(`SSE error event for ${reportType}:`, event);
       let errorMessage = `${reportType.toUpperCase()} generation failed.`;
       if (event.data) { try { const d = JSON.parse(event.data); if (d.message) errorMessage = d.message; } catch (e) {} }
       updateReportState(reportType, { error: errorMessage });
       finishReport(reportType, false);
    };

     const handleEventSourceError = (err, reportType) => {
        console.error(`${reportType} EventSource failed:`, err);
        if (activeReportType === reportType) { // Only set error if this report was active
             updateReportState(reportType, { error: `Connection error during ${reportType.toUpperCase()} generation.` });
             finishReport(reportType, false);
        }
         if (eventSourceRef.current) eventSourceRef.current.close();
         eventSourceRef.current = null;
    };
  // --- End Helper Functions ---


  // Effect for fetching project data and triggering sync
  useEffect(() => {
    // ... (fetchData logic remains the same)
    if (status === 'loading') return;
    if (status === 'unauthenticated') { router.push('/login'); return; }
    async function fetchData() {
      if (!projectId) return;
      try {
        setLoading(true); setError(null); setPreparationStatus('loading');
        const response = await fetch(`/api/projects/${projectId}/prepare`);
        if (!response.ok) { const d = await response.json().catch(()=>({})); throw new Error(d.message || `Failed: ${response.status}`); }
        const data = await response.json();
        setProject(data.project); setDiagrams(data.diagrams || []); setChatHistory(data.chatHistory || []); setPreparationStatus(data.preparationStatus || 'failed');
        if (data.diagrams?.length > 0) {
          console.log("Triggering background file sync...");
          fetch(`/api/projects/${projectId}/sync-files`, { method: 'POST' })
            .then(async (res) => { const d=await res.json().catch(()=>({})); if(res.ok) console.log(`Sync: ${d.synced} synced, ${d.skipped} skipped, ${d.errors} errors`); else console.error(`Sync failed: ${d.message||res.statusText}`); })
            .catch(err => console.error("Sync trigger error:", err));
        }
      } catch (err) { console.error('Prep error:', err); setPreparationStatus('failed'); setError(err.message); }
      finally { setLoading(false); }
    }
    if (status === 'authenticated') fetchData();
  }, [projectId, status, router]);

  // Effect for auto-scrolling chat
  useEffect(() => {
    if (chatContainerRef.current) chatContainerRef.current.scrollTop = chatContainerRef.current.scrollHeight;
  }, [chatHistory]);

  // Cleanup EventSource on component unmount
  useEffect(() => {
    return () => { if (eventSourceRef.current) eventSourceRef.current.close(); };
  }, []);

  // --- Report Download Handlers ---
  const handleOcrDownload = () => {
    if (!startReport('ocr')) return;
    const eventSource = new EventSource(`/api/projects/${projectId}/reports/ocr`);
    eventSourceRef.current = eventSource;
    eventSource.onmessage = (e) => handleSseMessage(e, 'ocr');
    eventSource.addEventListener('complete', (e) => handleSseComplete(e, 'ocr'));
    eventSource.addEventListener('error', (e) => handleSseError(e, 'ocr'));
    eventSource.onerror = (e) => handleEventSourceError(e, 'ocr');
  };

  const handleBomDownload = () => {
    if (!startReport('bom')) return;
    const eventSource = new EventSource(`/api/projects/${projectId}/reports/bom`);
    eventSourceRef.current = eventSource;
    eventSource.onmessage = (e) => handleSseMessage(e, 'bom');
    eventSource.addEventListener('complete', (e) => handleSseComplete(e, 'bom'));
    eventSource.addEventListener('error', (e) => handleSseError(e, 'bom'));
    eventSource.onerror = (e) => handleEventSourceError(e, 'bom');
  };

  const handleComplianceDownload = () => {
      if (!startReport('compliance')) return;
      const eventSource = new EventSource(`/api/projects/${projectId}/reports/compliance`); // Point to compliance route
      eventSourceRef.current = eventSource;
      eventSource.onmessage = (e) => handleSseMessage(e, 'compliance');
      eventSource.addEventListener('complete', (e) => handleSseComplete(e, 'compliance'));
      eventSource.addEventListener('error', (e) => handleSseError(e, 'compliance'));
      eventSource.onerror = (e) => handleEventSourceError(e, 'compliance');
  };
  // --- End Report Download Handlers ---


  const handleSendMessage = async () => {
    // ... (keep existing handleSendMessage function as is)
    if (!chatInput.trim() || isChatLoading || preparationStatus !== 'ready') return;
    const newMessage = { role: 'user', text: chatInput };
    const currentHistory = [...chatHistory, newMessage];
    setChatHistory(currentHistory); setChatInput(''); setIsChatLoading(true); setChatError('');
    try {
      const response = await fetch(`/api/chat/${projectId}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ message: newMessage.text, history: chatHistory.slice(-6) }) });
      if (!response.ok) { const d=await response.json().catch(()=>({})); throw new Error(d.message||'Failed'); }
      const data = await response.json();
      setChatHistory([...currentHistory, { role: 'model', text: data.response }]);
    } catch (err) { console.error('Chat error:', err); setChatError(err.message); }
    finally { setIsChatLoading(false); }
  };

  // --- Render Logic ---
  if (loading || status === 'loading') return <div className="flex-grow flex items-center justify-center bg-gray-900"><LoadingSpinner text="Loading project..." /></div>;
  if (error && preparationStatus === 'failed') return <div className="flex-grow flex items-center justify-center bg-gray-900 text-white">Error: {error}</div>;
  if (!project) return <div className="flex-grow flex items-center justify-center bg-gray-900 text-white">Project data unavailable.</div>;

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
            {/* Display general report error if any specific report has an error */}
            {(reportStates.ocr.error || reportStates.bom.error || reportStates.compliance.error) &&
              <p className="text-red-500 text-xs mb-2">
                Report Error: {reportStates.ocr.error || reportStates.bom.error || reportStates.compliance.error}
              </p>
            }
            <div className="flex flex-col space-y-2">
              {/* OCR Button */}
              <button
                onClick={handleOcrDownload}
                className={`bg-blue-600 hover:bg-blue-500 text-white font-bold py-2 px-4 rounded text-sm cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center min-h-[36px] relative`}
                disabled={!!activeReportType} // Disable if any report is generating
              >
                {activeReportType === 'ocr' ? ( // Use activeReportType
                  <div className="flex items-center justify-center space-x-2">
                    <LoadingSpinner size="sm" text={null} />
                    <span>{reportStates.ocr.message || "Generating..."}</span>
                  </div>
                ) : ( 'OCR Download' )}
              </button>
              {/* BoM Button */}
              <button
                onClick={handleBomDownload}
                className="bg-green-600 hover:bg-green-500 text-white font-bold py-2 px-4 rounded text-sm cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center min-h-[36px] relative"
                disabled={!!activeReportType} // Disable if any report is generating
              >
                 {activeReportType === 'bom' ? ( // Use activeReportType
                  <div className="flex items-center justify-center space-x-2">
                    <LoadingSpinner size="sm" text={null} />
                    <span>{reportStates.bom.message || "Generating..."}</span>
                  </div>
                ) : ( 'BoM Download' )}
              </button>
              {/* Compliance Button */}
              <button
                onClick={handleComplianceDownload}
                className="bg-yellow-600 hover:bg-yellow-500 text-white font-bold py-2 px-4 rounded text-sm cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center min-h-[36px] relative"
                disabled={!!activeReportType} // Disable if any report is generating
              >
                 {activeReportType === 'compliance' ? ( // Use activeReportType
                  <div className="flex items-center justify-center space-x-2">
                    <LoadingSpinner size="sm" text={null} />
                    <span>{reportStates.compliance.message || "Generating..."}</span>
                  </div>
                ) : ( 'Compliance Download' )}
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Right Column: Chat Interface */}
      <div className="w-full md:w-2/3 lg:w-3/4 p-6 flex flex-col overflow-hidden">
        <h2 className="text-2xl font-semibold mb-4 text-white">Contextual Chat</h2>
        <div className="flex-grow bg-gray-800 rounded-lg shadow p-4 flex flex-col overflow-hidden">
          {/* ... (rest of chat UI remains the same) ... */}
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
