'use client';

import React, { useState, useEffect, useRef } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { useSession } from 'next-auth/react';
import LoadingSpinner from '@/components/LoadingSpinner';
import ChatInterface from '@/components/ChatInterface'; // Import the new component
// Removed ReactMarkdown import
// Removed CopyIcon component definition

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

  // Removed chatContainerRef as it's now inside ChatInterface
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


  // Removed chat scroll effect, now handled in ChatInterface

  // Cleanup EventSource on component unmount
  useEffect(() => {
    return () => { if (eventSourceRef.current) eventSourceRef.current.close(); };
  }, []);


  // for chat input - tracks width dynamically
    const chatContainerRef = useRef(null);
    const [chatAreaWidthState, setChatAreaWidthState] = useState(0);

    useEffect(() => {
      let attempts = 0;
      const maxAttempts = 20;
    
      const handleResize = () => {
        if (chatContainerRef.current) {
          const width = chatContainerRef.current.offsetWidth;
          if (width > 0) {
            setChatAreaWidthState(width);
            clearInterval(intervalId); // Stop retrying once we have a valid width
          }
        }
      };
    
      // Try every second, up to 5 times
      const intervalId = setInterval(() => {
        attempts++;
        handleResize();
    
        if (attempts >= maxAttempts) {
          clearInterval(intervalId);
          if (!chatContainerRef.current || chatContainerRef.current.offsetWidth === 0) {
            console.warn("Unable to get valid chat container width after 5 attempts.");
          }
        }
      }, 350);
    
      // Listen to window resize events as well
      window.addEventListener("resize", handleResize);
    
      return () => {
        clearInterval(intervalId);
        window.removeEventListener("resize", handleResize);
      };
    }, [chatContainerRef]);
    

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
      // Auto-scroll is now handled within ChatInterface
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
    // Need to call handleSendMessage defined in this component
    setTimeout(() => {
        handleSendMessage();
    }, 0);
  };
  // --- End Handler ---

  // --- Render Logic ---
  // Show specific loading state while guestId is being checked
  if (status === 'unauthenticated' && !guestId && !error) {
     return <div className="w-full h-full flex items-center justify-center bg-gray-900"><LoadingSpinner text="Checking guest access..." size="md" /></div>;
  }

  if (loading || status === 'loading') return <div className="w-full h-full flex items-center justify-center bg-gray-900"><LoadingSpinner text="Loading project..." size="md" /></div>;
  if (error) return <div className="w-full h-full flex items-center justify-center bg-gray-900 text-white p-4 text-center">Error: {error}</div>;
  if (!project) return <div className="w-full h-full flex items-center justify-center bg-gray-900 text-white">Project data unavailable.</div>;


  return (
    // Reverted: Removed h-full. Relying on flex-grow from layout.
    <div className="flex flex-col md:flex-row relative flex-grow"> {/* Removed h-full */}
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

      {/* Right Column: Chat Interface - Use flex-grow to allow ChatInterface to fill height */}
      <div ref={chatContainerRef} className={`w-full md:w-2/3 lg:w-3/4 p-6 flex flex-col ${isGuestMode ? 'pt-12' : ''}`}>
        <h2 className="text-2xl font-semibold mb-4 text-white flex-shrink-0">Chat for Insights</h2>
        {/* Render ChatInterface component and pass props */}
        <ChatInterface
          chatHistory={chatHistory}
          chatInput={chatInput}
          onInputChange={(e) => setChatInput(e.target.value)}
          onSendMessage={handleSendMessage}
          isChatLoading={isChatLoading}
          chatError={chatError}
          initialSummary={initialSummary}
          suggestedQuestions={suggestedQuestions}
          onSuggestionClick={handleSuggestionClick}
          preparationStatus={preparationStatus}
          copiedIndex={copiedIndex}
          onCopy={handleCopy}
          chatAreaWidthState={chatAreaWidthState}
        />
      </div>
    </div>
  );
}
