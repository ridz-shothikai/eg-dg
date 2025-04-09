'use client';

import React, { useState, useEffect, useRef } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { useSession } from 'next-auth/react';
import LoadingSpinner from '@/components/LoadingSpinner';
import ReactMarkdown from 'react-markdown';

// Simple SVG Copy Icon component
const CopyIcon = ({ className = "w-4 h-4" }) => (
  <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className={className}>
    <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 17.25v3.375c0 .621-.504 1.125-1.125 1.125h-9.75a1.125 1.125 0 0 1-1.125-1.125V7.875c0-.621.504-1.125 1.125-1.125H6.75a9.06 9.06 0 0 1 1.5.124m7.5 10.376h3.375c.621 0 1.125-.504 1.125-1.125V11.25c0-4.46-3.243-8.161-7.5-8.876a9.06 9.06 0 0 0-1.5-.124H9.375c-.621 0-1.125.504-1.125 1.125v3.5m7.5 0v-3.5m0 3.5c-1.313 0-2.5-.388-3.5-.995m3.5.995c1.313 0 2.5.388 3.5.995m-3.5-.995V11.25m0 6.75a9.063 9.063 0 0 1-3.5-.995M12.75 2.25H9.375a1.125 1.125 0 0 0-1.125 1.125v9.75c0 .621.504 1.125 1.125 1.125h9.75c.621 0 1.125-.504 1.125-1.125V7.875a1.125 1.125 0 0 0-1.125-1.125H13.5m0-3.375V6.75" />
  </svg>
);

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
  const [copiedIndex, setCopiedIndex] = useState(null);
  const [initialSummary, setInitialSummary] = useState(null);
  const [suggestedQuestions, setSuggestedQuestions] = useState([]);
  const [guestId, setGuestId] = useState(null); // State for guest ID
  const [isGuestMode, setIsGuestMode] = useState(false); // State to track guest mode

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
        // --- UPDATED: Check for public_url ---
        if (data.public_url) {
          updateReportState(reportType, { message: 'Report ready! Opening...' });
          window.open(data.public_url, '_blank'); // Use public_url
        } else { throw new Error("Public URL missing in complete event."); } // Updated error message
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


  // Effect to check for guestId if unauthenticated
  useEffect(() => {
    if (status === 'unauthenticated') {
      const storedGuestId = localStorage.getItem('guestId');
      if (storedGuestId) {
        console.log('Guest ID found in localStorage:', storedGuestId);
        setGuestId(storedGuestId);
        setIsGuestMode(true); // Indicate guest mode
      } else {
        // No session and no guest ID, redirect to login
        console.log('Unauthenticated and no guest ID found, redirecting to login.');
        router.push('/login');
      }
    } else if (status === 'authenticated') {
      setIsGuestMode(false); // Ensure guest mode is off if authenticated
    }
  }, [status, router]);


  // Effect for fetching project data and triggering sync (updated for guest mode)
  useEffect(() => {
    if (status === 'loading') return; // Wait until session status is determined

    // Determine if we should fetch (either authenticated or guest mode with guestId)
    const shouldFetch = status === 'authenticated' || (status === 'unauthenticated' && guestId);

    if (!shouldFetch) {
        // If unauthenticated and guestId hasn't been set yet by the other effect, wait.
        // If guestId check failed in the other effect, redirection already happened.
        return;
    }

    async function fetchData() {
      if (!projectId) return;
      try {
        setLoading(true); setError(null); setPreparationStatus('loading');

        // Prepare headers: Add guest ID header if in guest mode
        const headers = {};
        if (isGuestMode && guestId) {
          headers['X-Guest-ID'] = guestId;
        }
        // Note: next-auth session cookie is sent automatically by the browser

        const response = await fetch(`/api/projects/${projectId}/prepare`, { headers });

        if (response.status === 401 || response.status === 403) {
            // Handle unauthorized/forbidden, potentially redirect guest to login
            setError("Access denied. Please log in or ensure you have access.");
            setPreparationStatus('failed');
            if (isGuestMode) {
                // Maybe clear guestId if it's invalid for this project? Or just redirect.
                router.push('/login?error=guest_access_denied');
            } else {
                 router.push('/login?error=auth_required');
            }
            return; // Stop further processing
        }

        if (!response.ok) { const d = await response.json().catch(()=>({})); throw new Error(d.message || `Failed: ${response.status}`); }
        const data = await response.json();
        setProject(data.project);
        setDiagrams(data.diagrams || []);
        setChatHistory(data.chatHistory || []);
        setPreparationStatus(data.preparationStatus || 'failed');
        setInitialSummary(data.initialSummary || null); // Set initial summary
        setSuggestedQuestions(data.suggestedQuestions || []); // Set suggested questions

        if (data.diagrams?.length > 0) {
          console.log("Triggering background file sync...");
          fetch(`/api/projects/${projectId}/sync-files`, { method: 'POST' })
            .then(async (res) => { const d=await res.json().catch(()=>({})); if(res.ok) console.log(`Sync: ${d.synced} synced, ${d.skipped} skipped, ${d.errors} errors`); else console.error(`Sync failed: ${d.message||res.statusText}`); })
            .catch(err => console.error("Sync trigger error:", err));
        }
      } catch (err) {
          console.error('Prep error:', err);
          setPreparationStatus('failed');
          setError(err.message || "Failed to load project data.");
      } finally {
          setLoading(false);
      }
    }

    fetchData();
    // Depend on guestId as well, so fetch runs when guestId is set
  }, [projectId, status, router, guestId, isGuestMode]);


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
    // Append guestId if in guest mode
    const url = isGuestMode && guestId
      ? `/api/projects/${projectId}/reports/ocr?guestId=${guestId}`
      : `/api/projects/${projectId}/reports/ocr`;
    const eventSource = new EventSource(url);
    eventSourceRef.current = eventSource;
    eventSource.onmessage = (e) => handleSseMessage(e, 'ocr');
    eventSource.addEventListener('complete', (e) => handleSseComplete(e, 'ocr'));
    eventSource.addEventListener('error', (e) => handleSseError(e, 'ocr'));
    eventSource.onerror = (e) => handleEventSourceError(e, 'ocr');
  };

  const handleBomDownload = () => {
    if (!startReport('bom')) return;
    // Append guestId if in guest mode
    const url = isGuestMode && guestId
      ? `/api/projects/${projectId}/reports/bom?guestId=${guestId}`
      : `/api/projects/${projectId}/reports/bom`;
    const eventSource = new EventSource(url);
    eventSourceRef.current = eventSource;
    eventSource.onmessage = (e) => handleSseMessage(e, 'bom');
    eventSource.addEventListener('complete', (e) => handleSseComplete(e, 'bom'));
    eventSource.addEventListener('error', (e) => handleSseError(e, 'bom'));
    eventSource.onerror = (e) => handleEventSourceError(e, 'bom');
  };

  const handleComplianceDownload = () => {
      if (!startReport('compliance')) return;
      // Append guestId if in guest mode
      const url = isGuestMode && guestId
        ? `/api/projects/${projectId}/reports/compliance?guestId=${guestId}`
        : `/api/projects/${projectId}/reports/compliance`;
      const eventSource = new EventSource(url); // Point to compliance route with potential query param
      eventSourceRef.current = eventSource;
      eventSource.onmessage = (e) => handleSseMessage(e, 'compliance');
      eventSource.addEventListener('complete', (e) => handleSseComplete(e, 'compliance'));
      eventSource.addEventListener('error', (e) => handleSseError(e, 'compliance'));
      eventSource.onerror = (e) => handleEventSourceError(e, 'compliance');
  };
  // --- End Report Download Handlers ---


  const handleSendMessage = async () => {
    if (!chatInput.trim() || isChatLoading || preparationStatus !== 'ready') return;

    const userMessage = { role: 'user', text: chatInput };
    const currentInput = chatInput; // Store input before clearing
    setChatInput(''); // Clear input immediately

    // Add user message and a placeholder for the model's streaming response
    const modelPlaceholderIndex = chatHistory.length + 1;
    setChatHistory(prev => [...prev, userMessage, { role: 'model', text: '' }]);
    setIsChatLoading(true);
    setChatError('');

    try {
      // Prepare headers: Add guest ID header if in guest mode
      const headers = { 'Content-Type': 'application/json' };
      if (isGuestMode && guestId) {
        headers['X-Guest-ID'] = guestId;
      }

      const response = await fetch(`/api/chat/${projectId}`, {
        method: 'POST',
        headers: headers,
        // Send previous history excluding the placeholder we just added
        body: JSON.stringify({ message: currentInput, history: chatHistory.slice(-6) })
      });

       if (response.status === 401 || response.status === 403) {
           throw new Error("Access denied. Please log in."); // Simplified error for chat
       }

      if (!response.ok) {
        // Try to get error message from JSON, fallback to status text
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.message || `Request failed: ${response.statusText}`);
      }

      // --- Handle Streaming Response ---
      if (!response.body) {
        throw new Error("Streaming response not supported or body is missing.");
      }

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let done = false;
      let accumulatedText = ""; // Keep track locally if needed, but primarily update state

      while (!done) {
        const { value, done: readerDone } = await reader.read();
        done = readerDone;
        if (value) {
          const chunk = decoder.decode(value, { stream: true });
          accumulatedText += chunk; // Accumulate locally if needed for final save check
          // Update the placeholder message in the state
          setChatHistory(prev => {
            const newHistory = [...prev];
            // Ensure the placeholder exists before trying to update
            if (newHistory[modelPlaceholderIndex] && newHistory[modelPlaceholderIndex].role === 'model') {
                 newHistory[modelPlaceholderIndex] = { ...newHistory[modelPlaceholderIndex], text: newHistory[modelPlaceholderIndex].text + chunk };
            } else {
                // Handle edge case where placeholder might not be there (shouldn't happen with current logic)
                console.warn("Model placeholder not found at index", modelPlaceholderIndex);
                // Optionally add a new message if placeholder is missing
                // newHistory.push({ role: 'model', text: chunk });
            }

            return newHistory;
          });
        }
      }
      // --- End Streaming Handling ---

    } catch (err) {
      console.error('Chat error:', err);
      setChatError(err.message);
      // Optionally remove the placeholder if an error occurred before any response
      setChatHistory(prev => prev.filter((_, index) => index !== modelPlaceholderIndex || prev[modelPlaceholderIndex]?.text));
    } finally {
      setIsChatLoading(false);
      // Ensure chat scrolls down after streaming finishes
       setTimeout(() => {
           if (chatContainerRef.current) {
               chatContainerRef.current.scrollTop = chatContainerRef.current.scrollHeight;
           }
       }, 100); // Small delay to allow final render
    }
  };

  // Function to handle copying text
  const handleCopy = (text, index) => {
    navigator.clipboard.writeText(text).then(() => {
      setCopiedIndex(index); // Set the index of the copied message
      setTimeout(() => setCopiedIndex(null), 1500); // Reset after 1.5 seconds
    }).catch(err => {
      console.error('Failed to copy text: ', err);
    });
  };

  // --- Handler for Suggested Question Click ---
  const handleSuggestionClick = (question) => {
    if (isChatLoading || preparationStatus !== 'ready') return; // Don't allow if chat is busy or not ready
    setChatInput(question);
    // Use a timeout to allow state to update before sending message
    setTimeout(() => {
        handleSendMessage();
    }, 0);
  };
  // --- End Handler ---

  // --- Render Logic ---
  // Show specific loading state while guestId is being checked
  if (status === 'unauthenticated' && !guestId && !error) {
     // Removed flex-grow, main layout handles expansion. Added w-full h-full for centering within main.
     return <div className="w-full h-full flex items-center justify-center bg-gray-900"><LoadingSpinner text="Checking guest access..." size="md" /></div>;
  }

  // Removed flex-grow, main layout handles expansion. Added w-full h-full for centering within main.
  if (loading || status === 'loading') return <div className="w-full h-full flex items-center justify-center bg-gray-900"><LoadingSpinner text="Loading project..." size="md" /></div>;
  // Removed flex-grow, main layout handles expansion. Added w-full h-full for centering within main.
  if (error) return <div className="w-full h-full flex items-center justify-center bg-gray-900 text-white p-4 text-center">Error: {error}</div>;
  // Removed flex-grow, main layout handles expansion. Added w-full h-full for centering within main.
  if (!project) return <div className="w-full h-full flex items-center justify-center bg-gray-900 text-white">Project data unavailable.</div>;


  return (
    // Removed h-full, layout.js handles height expansion via flex-grow on main
    <div className="flex flex-col md:flex-row relative flex-grow"> {/* Added flex-grow here to ensure it fills the main container */}
       {/* Guest Mode Banner */}
       {isGuestMode && (
        <div className="absolute top-0 left-0 right-0 bg-yellow-600 text-black text-center p-2 text-sm z-10">
          You are viewing this project as a guest. &nbsp;
          <Link href="/signup" className="font-bold underline hover:text-yellow-900">Sign up</Link>
          &nbsp; or &nbsp;
          <Link href="/login" className="font-bold underline hover:text-yellow-900">Log in</Link>
          &nbsp; to save your work permanently.
        </div>
      )}

      {/* Left Column */}
      {/* Added pt-10 if guest mode to avoid banner overlap */}
      <div className={`w-full md:w-1/3 lg:w-1/4 p-4 border-r border-gray-700 flex flex-col space-y-6 overflow-y-auto ${isGuestMode ? 'pt-12' : ''}`}>
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
                  {/* Removed individual file action links */}
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
                    <LoadingSpinner size="sm" text={null} /> {/* Restored text prop (as null) */}
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
                    <LoadingSpinner size="sm" text={null} /> {/* Restored text prop (as null) */}
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
                    <LoadingSpinner size="sm" text={null} /> {/* Restored text prop (as null) */}
                    <span>{reportStates.compliance.message || "Generating..."}</span>
                  </div>
                ) : ( 'Compliance Download' )}
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Right Column: Chat Interface */}
       {/* Added pt-10 if guest mode to avoid banner overlap */}
       {/* Ensure this outer div allows the inner content to flex and fill height */}
      <div className={`w-full md:w-2/3 lg:w-3/4 p-6 flex flex-col ${isGuestMode ? 'pt-12' : ''}`}>
        <h2 className="text-2xl font-semibold mb-4 text-white flex-shrink-0">Chat for Insights</h2> {/* Prevent title from shrinking */}
        {/* Main chat container - takes remaining space, flex column */}
        <div className="flex-grow bg-gray-800 rounded-lg shadow p-4 flex flex-col relative"> {/* Removed overflow-hidden */}

          {/* Loading Spinner Overlay */}
          {(preparationStatus === 'loading' || preparationStatus === 'processing') && (
            <div className="absolute inset-0 flex items-center justify-center bg-gray-800 bg-opacity-80 z-10 rounded-lg">
              <LoadingSpinner text={preparationStatus === 'loading' ? "Preparing documents for chat..." : "Documents are processing, please wait..."} />
            </div>
          )}

          {/* Chat Content (History and Input) - Rendered only when ready */}
          {preparationStatus === 'ready' && (
            <React.Fragment>
              {/* Inner container for chat history - THIS part scrolls */}
              <div ref={chatContainerRef} className="flex-grow overflow-y-auto space-y-4 pr-2 mb-4"> {/* Kept flex-grow and overflow-y-auto */}
                {/* Display Initial Summary if available and history is empty */}
                {initialSummary && chatHistory.length === 0 && (
                  <div className="flex flex-col items-start"> {/* Model message style */}
                    <div className="p-3 rounded-lg max-w-lg prose prose-invert bg-gray-600 text-white">
                       <ReactMarkdown>{initialSummary}</ReactMarkdown>
                    </div>
                    {/* Suggested Questions Buttons */}
                    {suggestedQuestions.length > 0 && (
                      <div className="mt-3 flex flex-col space-y-2 self-start w-full max-w-lg">
                        {suggestedQuestions.map((q, i) => (
                          <button
                            key={i}
                            onClick={() => handleSuggestionClick(q)}
                            disabled={isChatLoading}
                            className="bg-gray-700 hover:bg-gray-600 text-indigo-300 text-sm text-left p-2 rounded border border-gray-600 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                          >
                            {q}
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                )}

                {/* Display Regular Chat History */}
                {chatHistory.map((msg, index) => {
                  const isModel = msg.role === 'model';
                  // Check if this specific message is the loading placeholder
                  const isLoadingPlaceholder = isModel && msg.text === '' && isChatLoading && index === chatHistory.length - 1;

                  return (
                    // Container for each message row (bubble + optional copy button)
                    <div key={index} className={`flex flex-col ${msg.role === 'user' ? 'items-end' : 'items-start'}`}>
                      {/* Message Bubble */}
                      <div className={`p-3 rounded-lg max-w-lg prose prose-invert ${msg.role === 'user' ? 'bg-indigo-600 text-white' : 'bg-gray-600 text-white'} ${isLoadingPlaceholder ? 'flex items-center justify-center' : ''}`}>
                        {isLoadingPlaceholder ? (
                          <div className="w-3 h-3 bg-gray-400 rounded-full animate-zoom"></div>
                        ) : isModel ? (
                          <ReactMarkdown>{msg.text}</ReactMarkdown>
                        ) : (
                          msg.text
                        )}
                      </div>
                      {/* Add Copy button UNDER completed model messages */}
                      {isModel && !isLoadingPlaceholder && msg.text && (
                        <button
                          onClick={() => handleCopy(msg.text, index)}
                          className="mt-1 p-1 rounded text-gray-400 hover:text-white hover:bg-gray-700 transition-colors" // Removed absolute, opacity, group-hover
                          title={copiedIndex === index ? "Copied!" : "Copy text"}
                        >
                          <CopyIcon className="w-4 h-4" />
                        </button>
                      )}
                    </div>
                  );
                 })}
                 {/* Chat Error Message */}
                 {chatError && <p className="text-red-500 text-sm mt-2 self-start">{chatError}</p>}
              </div>
              {/* Input area - Fixed at the bottom */}
              <div className="flex-shrink-0 flex pt-4 border-t border-gray-700"> {/* Added flex-shrink-0 */}
                <textarea
                  className="flex-grow p-2 bg-gray-700 rounded-l border border-gray-600 text-white focus:outline-none focus:ring-1 focus:ring-indigo-500 disabled:opacity-70 resize-none"
                  placeholder="Ask questions about the diagrams..."
                  rows="2"
                  value={chatInput}
                  onChange={(e) => setChatInput(e.target.value)}
                  onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSendMessage(); } }}
                  disabled={isChatLoading || preparationStatus !== 'ready'} // Keep this check
                ></textarea>
                <button
                  className="bg-indigo-600 hover:bg-indigo-500 text-white font-bold p-2 rounded-r disabled:opacity-50 flex items-center justify-center"
                  onClick={handleSendMessage}
                  disabled={isChatLoading || !chatInput.trim() || preparationStatus !== 'ready'} // Keep this check
                >
                  Send
                </button>
              </div>
            </React.Fragment>
          )}

          {/* Status Messages (Failed / No Files) - Rendered when applicable */}
          {preparationStatus === 'failed' && (
             <div className="flex-grow flex items-center justify-center">
                <p className="text-red-500 text-center">Failed to prepare documents for chat. Please try reloading.</p>
             </div>
          )}
          {preparationStatus === 'no_files' && (
             <div className="flex-grow flex items-center justify-center">
                <p className="text-gray-400 text-center">Upload diagrams to enable contextual chat.</p>
             </div>
          )}

        </div>
      </div>
    </div>
  );
}
