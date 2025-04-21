/* eslint-disable react-hooks/exhaustive-deps */
"use client";

import ChatInterface from "@/components/ChatInterface";
import LoadingSpinner from "@/components/LoadingSpinner";
import StatusProgressBar from "@/components/StatusProgressBar"; // Import the new component
import {
  ArrowDownTrayIcon,
  CheckCircleIcon,
  ExclamationCircleIcon,
  XCircleIcon,
} from "@heroicons/react/24/outline";
import { useSession } from "next-auth/react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";

export default function ProjectDetailPage() {
  const { projectId } = useParams();
  const { data: session, status } = useSession();
  const router = useRouter();
  const [project, setProject] = useState(null);
  const [diagrams, setDiagrams] = useState([]);
  const [loadingProjectDetails, setLoadingProjectDetails] = useState(true); // Loading state for project details
  const [loadingDiagrams, setLoadingDiagrams] = useState(true); // Loading state for initial diagrams
  const [error, setError] = useState(null);
  // preparationStatus is derived dynamically from diagrams state
  const [chatHistory, setChatHistory] = useState([]);
  const [chatInput, setChatInput] = useState("");
  const [isChatLoading, setIsChatLoading] = useState(false);
  const [chatError, setChatError] = useState("");
  const [copiedIndex, setCopiedIndex] = useState(null);
  // Removed initialSummary and suggestedQuestions states, as prepare API no longer provides them
  const [guestId, setGuestId] = useState(null);
  const [isGuestMode, setIsGuestMode] = useState(false);
  const [pollingIntervalId, setPollingIntervalId] = useState(null);
  const [downloadingDiagramId, setDownloadingDiagramId] = useState(null); // State for download loading

  // Refactored Report States
  const [reportStates, setReportStates] = useState({
    ocr: { isLoading: false, message: "", error: "" },
    bom: { isLoading: false, message: "", error: "" },
    compliance: { isLoading: false, message: "", error: "" },
  });
  const [activeReportType, setActiveReportType] = useState(null); // Track which report is currently running

  const eventSourceRef = useRef(null);
  const reportWindowRef = useRef(null); // Ref to store the opened window

  // --- Helper to manage report state ---
  const updateReportState = (reportType, updates) => {
    setReportStates((prev) => ({
      ...prev,
      [reportType]: { ...prev[reportType], ...updates },
    }));
  };

  const startReport = (reportType) => {
    if (activeReportType) return false; // Prevent starting another if one is running

    // --- Open blank window immediately on click ---
    // Browsers generally allow this if it's synchronous with user interaction
    try {
      reportWindowRef.current = window.open("", "_blank");
      if (!reportWindowRef.current) {
        // window.open might return null if blocked despite being in handler
        console.error(
          "Failed to open report window. It might be blocked by the browser."
        );
        // Optionally show an error message to the user here
        setError(
          "Could not open new tab. Please check your browser's popup blocker settings."
        );
        return false; // Prevent further processing
      }
      // Optional: Add placeholder content
      reportWindowRef.current.document.write(
        "<p>Generating report, please wait...</p>"
      );
    } catch (e) {
      console.error("Error opening report window:", e);
      setError("An error occurred while trying to open the report tab.");
      return false;
    }
    // --- End window open ---

    setActiveReportType(reportType);
    // Reset all errors, set loading and message for the specific report
    setReportStates((prev) => {
      const newState = {};
      Object.keys(prev).forEach((key) => {
        newState[key] = {
          ...prev[key],
          error: "",
          isLoading: key === reportType,
          message: key === reportType ? "Connecting..." : "",
        };
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
    updateReportState(reportType, { isLoading: false, message: "" });
    if (!success && !reportStates[reportType].error) {
      // Set a generic error if none was provided by SSE
      updateReportState(reportType, {
        error: `${reportType.toUpperCase()} generation failed.`,
      });
    }
  };

  const handleSseMessage = (event, reportType) => {
    try {
      const data = JSON.parse(event.data);
      if (data.status) updateReportState(reportType, { message: data.status });
    } catch (e) {
      updateReportState(reportType, { message: "Processing update..." });
    }
  };

  const handleSseComplete = (event, reportType) => {
    try {
      const data = JSON.parse(event.data);
      // --- UPDATED: Check for public_url ---
      if (data.public_url) {
        updateReportState(reportType, { message: "Report ready! Opening..." });
        // --- Use reportWindowRef ---
        if (reportWindowRef.current && !reportWindowRef.current.closed) {
          reportWindowRef.current.location.href = data.public_url;
        } else {
          console.warn(
            "Report window was closed before URL could be loaded. Opening new tab (might be blocked)."
          );
          // Fallback: Try opening directly (might be blocked)
          window.open(data.public_url, "_blank");
        }
        reportWindowRef.current = null; // Clear ref
      } else {
        throw new Error("Public URL missing in complete event.");
      }
      finishReport(reportType, true);
    } catch (e) {
      console.error(
        `Failed to handle SSE complete event for ${reportType}:`,
        e
      );
      updateReportState(reportType, {
        error: `Failed to process ${reportType.toUpperCase()} download link.`,
      });
      // Close blank window on error
      if (reportWindowRef.current && !reportWindowRef.current.closed) {
        reportWindowRef.current.close();
      }
      reportWindowRef.current = null;
      finishReport(reportType, false);
    }
  };

  const handleSseError = (event, reportType) => {
    console.error(`SSE error event for ${reportType}:`, event);
    let errorMessage = `${reportType.toUpperCase()} generation failed.`;
    if (event.data) {
      try {
        const d = JSON.parse(event.data);
        if (d.message) errorMessage = d.message;
      } catch (e) {}
    }
    updateReportState(reportType, { error: errorMessage });
    // Close blank window on error
    if (reportWindowRef.current && !reportWindowRef.current.closed) {
      reportWindowRef.current.close();
    }
    reportWindowRef.current = null;
    finishReport(reportType, false);
  };

  const handleEventSourceError = (err, reportType) => {
    console.error(`${reportType} EventSource failed:`, err);
    if (activeReportType === reportType) {
      // Only set error if this report was active
      updateReportState(reportType, {
        error: `Connection error during ${reportType.toUpperCase()} generation.`,
      });
      // Close blank window on error
      if (reportWindowRef.current && !reportWindowRef.current.closed) {
        reportWindowRef.current.close();
      }
      reportWindowRef.current = null;
      finishReport(reportType, false);
    }
    if (eventSourceRef.current) eventSourceRef.current.close();
    eventSourceRef.current = null;
  };
  // --- End Helper Functions ---

  // Effect to check for guestId if unauthenticated
  useEffect(() => {
    if (status === "unauthenticated") {
      const storedGuestId = localStorage.getItem("guestId");
      if (storedGuestId) {
        console.log("Guest ID found in localStorage:", storedGuestId);
        setGuestId(storedGuestId);
        setIsGuestMode(true); // Indicate guest mode
      } else {
        // No session and no guest ID, redirect to login
        console.log(
          "Unauthenticated and no guest ID found, redirecting to login."
        );
        router.push("/login");
      }
    } else if (status === "authenticated") {
      setIsGuestMode(false); // Ensure guest mode is off if authenticated
    }
  }, [status, router]);

  // Effect for fetching initial data (Split Fetch)
  useEffect(() => {
    if (status === "loading" || !projectId) return; // Wait for session and projectId

    // Determine if we should fetch (either authenticated or guest mode with guestId)
    const shouldFetch =
      status === "authenticated" || (status === "unauthenticated" && guestId);
    if (!shouldFetch) return;

    let isMounted = true; // Prevent state updates on unmounted component

    // Prepare headers once
    const headers = {};
    if (isGuestMode && guestId) {
      headers["X-Guest-ID"] = guestId;
    }

    // --- Fetch Project Details First ---
    const fetchProjectDetails = async () => {
      console.log("Fetching project details...");
      setLoadingProjectDetails(true);
      setError(null);
      try {
        const response = await fetch(`/api/projects/${projectId}/prepare`, {
          headers,
        }); // Prepare now only gets details

        if (!isMounted) return; // Check if component unmounted

        if (response.status === 401 || response.status === 403) {
          setError("Access denied. Please log in or ensure you have access.");
          if (isGuestMode) router.push("/login?error=guest_access_denied");
          else router.push("/login?error=auth_required");
          return;
        }
        if (!response.ok) {
          const d = await response.json().catch(() => ({}));
          throw new Error(d.message || `Failed: ${response.status}`);
        }

        const data = await response.json();
        if (isMounted) {
          setProject(data.project);
          setChatHistory(data.chatHistory || []);
          console.log("Project details loaded.");
        }
      } catch (err) {
        console.error("Error fetching project details:", err);
        if (isMounted)
          setError(err.message || "Failed to load project details.");
      } finally {
        if (isMounted) setLoadingProjectDetails(false);
      }
    };

    // --- Fetch Initial Diagram Statuses (After Project Details) ---
    const fetchInitialDiagrams = async () => {
      console.log("Fetching initial diagram statuses...");
      setLoadingDiagrams(true);
      // Don't reset main error here, keep project details error if it occurred
      try {
        const response = await fetch(
          `/api/projects/${projectId}/diagram-statuses`,
          { headers }
        );

        if (!isMounted) return;

        // Handle auth errors specifically if needed, though prepare should catch it first
        if (response.status === 401 || response.status === 403) {
          console.error(
            "Diagram status fetch forbidden/unauthorized (should have been caught by prepare)."
          );
          // setError("Access denied fetching diagram statuses."); // Avoid overwriting main error
          return;
        }
        if (!response.ok) {
          const d = await response.json().catch(() => ({}));
          throw new Error(d.message || `Failed: ${response.status}`);
        }

        const initialDiagrams = await response.json();
        if (isMounted) {
          setDiagrams(initialDiagrams || []);
          console.log("Initial diagram statuses loaded.");

          // Start polling only if needed
          const needsPolling = initialDiagrams.some(
            (d) =>
              d.processingStatus === "PENDING" ||
              d.processingStatus === "PROCESSING"
          );
          if (needsPolling && !pollingIntervalId) {
            console.log("Starting status polling...");
            startPolling(headers);
          } else if (!needsPolling) {
            console.log(
              "No polling needed (all diagrams processed or failed)."
            );
          }

          // Trigger GCS sync (can remain as is)
          if (initialDiagrams.length > 0) {
            console.log("Triggering background file sync...");
            fetch(`/api/projects/${projectId}/sync-files`, {
              method: "POST",
              headers: headers,
            })
              .then(async (res) => {
                const d = await res.json().catch(() => ({}));
                if (res.ok)
                  console.log(
                    `Sync: ${d.synced} synced, ${d.skipped} skipped, ${d.errors} errors`
                  );
                else
                  console.error(`Sync failed: ${d.message || res.statusText}`);
              })
              .catch((err) => console.error("Sync trigger error:", err));
          }
        }
      } catch (err) {
        console.error("Error fetching initial diagram statuses:", err);
        if (isMounted) setError(err.message || "Failed to load diagram list."); // Set error if diagram fetch fails
      } finally {
        if (isMounted) setLoadingDiagrams(false);
      }
    };

    // Chain the fetches
    fetchProjectDetails().then(() => {
      // Fetch diagrams only if project details loaded successfully and component still mounted
      if (isMounted && !error) {
        fetchInitialDiagrams();
      }
    });

    // Cleanup function
    return () => {
      isMounted = false;
      // Stop polling is handled in its own useEffect cleanup
    };
  }, [projectId, status, guestId, isGuestMode, router]); // Dependencies for fetching

  // --- Status Polling Logic ---
  const startPolling = (authHeaders) => {
    // Clear any existing interval
    if (pollingIntervalId) clearInterval(pollingIntervalId);

    const interval = setInterval(async () => {
      if (!projectId) return; // Should not happen, but safeguard
      // console.log("Polling for diagram statuses..."); // Can be noisy
      try {
        const response = await fetch(
          `/api/projects/${projectId}/diagram-statuses`,
          { headers: authHeaders }
        );
        if (!response.ok) {
          // Handle polling errors differently? Maybe stop polling on auth errors?
          console.error(`Polling error: ${response.status}`);
          if (response.status === 401 || response.status === 403) {
            console.error(
              "Polling failed due to auth error. Stopping polling."
            );
            stopPolling();
          }
          return; // Don't update state on error
        }
        const latestStatuses = await response.json();

        let allDone = true;
        setDiagrams((currentDiagrams) => {
          // Create a map for efficient lookup
          const statusMap = latestStatuses.reduce((map, item) => {
            map[item._id] = item.processingStatus;
            return map;
          }, {});

          // Update existing diagrams, check if polling should continue
          const updatedDiagrams = currentDiagrams.map((diag) => {
            const latestData = latestStatuses.find((s) => s._id === diag._id); // Find full data
            if (latestData) {
              // Update status if changed
              if (latestData.processingStatus !== diag.processingStatus) {
                // console.log(`Updating status for ${diag.fileName} from ${diag.processingStatus} to ${latestData.processingStatus}`);
                diag.processingStatus = latestData.processingStatus;
              }
              // Update progress if changed (and relevant)
              if (
                diag.processingStatus === "PROCESSING" &&
                typeof latestData.uploadProgress === "number" &&
                latestData.uploadProgress !== diag.uploadProgress
              ) {
                diag.uploadProgress = latestData.uploadProgress;
              }
            }

            // Check if this diagram still needs polling
            if (
              diag.processingStatus === "PENDING" ||
              diag.processingStatus === "PROCESSING"
            ) {
              allDone = false;
            }
            return diag;
          });

          if (allDone) {
            console.log("All diagrams processed. Stopping polling.");
            stopPolling();
          }

          return updatedDiagrams; // Return the updated array
        });
      } catch (err) {
        console.error("Error during status polling fetch:", err);
        // Maybe stop polling after several consecutive errors?
      }
    }, 5000); // Poll every 5 seconds

    setPollingIntervalId(interval);
  };

  const stopPolling = () => {
    if (pollingIntervalId) {
      clearInterval(pollingIntervalId);
      setPollingIntervalId(null);
      console.log("Status polling stopped.");
    }
  };

  // Cleanup polling on component unmount
  useEffect(() => {
    return () => {
      stopPolling(); // Clear interval on unmount
      if (eventSourceRef.current) eventSourceRef.current.close(); // Also cleanup SSE if any
    };
  }, [pollingIntervalId]); // Depend on pollingIntervalId to ensure cleanup happens correctly

  // --- Chat Input Width Tracking ---
  const chatContainerRef = useRef(null);
  const [chatAreaWidthState, setChatAreaWidthState] = useState(0);

  useEffect(() => {
    let attempts = 0;
    const maxAttempts = 50;
    let intervalId = null; // Define intervalId within the effect scope

    const handleResize = () => {
      if (chatContainerRef.current) {
        const width = chatContainerRef.current.offsetWidth;
        if (width > 0) {
          setChatAreaWidthState(width);
          if (intervalId) clearInterval(intervalId); // Stop retrying once we have a valid width
        }
      }
    };

    // Initial check
    handleResize();

    // Retry if initial check failed
    if (chatAreaWidthState === 0) {
      intervalId = setInterval(() => {
        attempts++;
        handleResize();

        if (attempts >= maxAttempts || chatAreaWidthState > 0) {
          clearInterval(intervalId);
          if (chatAreaWidthState === 0) {
            console.warn(
              `Unable to get valid chat container width after ${maxAttempts} attempts.`
            );
          }
        }
      }, 350);
    }

    // Listen to window resize events as well
    window.addEventListener("resize", handleResize);

    return () => {
      if (intervalId) clearInterval(intervalId);
      window.removeEventListener("resize", handleResize);
    };
  }, [chatContainerRef, chatAreaWidthState]); // Re-run if chatAreaWidthState changes (e.g., on resize)

  // --- Report Download Handlers (No changes needed here, they use SSE) ---
  const handleOcrDownload = () => {
    if (!startReport("ocr")) return;
    const url =
      isGuestMode && guestId
        ? `/api/projects/${projectId}/reports/ocr?guestId=${guestId}`
        : `/api/projects/${projectId}/reports/ocr`;
    const eventSource = new EventSource(url);
    eventSourceRef.current = eventSource;
    eventSource.onmessage = (e) => handleSseMessage(e, "ocr");
    eventSource.addEventListener("complete", (e) =>
      handleSseComplete(e, "ocr")
    );
    eventSource.addEventListener("error", (e) => handleSseError(e, "ocr"));
    eventSource.onerror = (e) => handleEventSourceError(e, "ocr");
  };

  const handleBomDownload = () => {
    if (!startReport("bom")) return;
    const url =
      isGuestMode && guestId
        ? `/api/projects/${projectId}/reports/bom?guestId=${guestId}`
        : `/api/projects/${projectId}/reports/bom`;
    const eventSource = new EventSource(url);
    eventSourceRef.current = eventSource;
    eventSource.onmessage = (e) => handleSseMessage(e, "bom");
    eventSource.addEventListener("complete", (e) =>
      handleSseComplete(e, "bom")
    );
    eventSource.addEventListener("error", (e) => handleSseError(e, "bom"));
    eventSource.onerror = (e) => handleEventSourceError(e, "bom");
  };

  const handleComplianceDownload = () => {
    if (!startReport("compliance")) return;
    const url =
      isGuestMode && guestId
        ? `/api/projects/${projectId}/reports/compliance?guestId=${guestId}`
        : `/api/projects/${projectId}/reports/compliance`;
    const eventSource = new EventSource(url);
    eventSourceRef.current = eventSource;
    eventSource.onmessage = (e) => handleSseMessage(e, "compliance");
    eventSource.addEventListener("complete", (e) =>
      handleSseComplete(e, "compliance")
    );
    eventSource.addEventListener("error", (e) =>
      handleSseError(e, "compliance")
    );
    eventSource.onerror = (e) => handleEventSourceError(e, "compliance");
  };
  // --- End Report Download Handlers ---

  // --- Derive overall status for enabling chat ---
  const isProjectReadyForChat =
    diagrams.length > 0 &&
    diagrams.every(
      (d) => d.processingStatus === "ACTIVE" || d.processingStatus === "FAILED"
    ) && // All are done processing
    diagrams.some((d) => d.processingStatus === "ACTIVE"); // At least one is active

  const handleSendMessage = async () => {
    // Use derived status to check if chat is ready
    if (!chatInput.trim() || isChatLoading || !isProjectReadyForChat) return;

    const userMessage = { role: "user", text: chatInput };
    const currentInput = chatInput;
    setChatInput("");

    // Add user message and placeholder
    const modelPlaceholderIndex = chatHistory.length + 1;
    setChatHistory((prev) => [
      ...prev,
      userMessage,
      { role: "model", text: "" },
    ]);
    setIsChatLoading(true);
    setChatError("");

    try {
      // Prepare headers
      const headers = { "Content-Type": "application/json" };
      if (isGuestMode && guestId) {
        headers["X-Guest-ID"] = guestId;
      }

      const response = await fetch(`/api/chat/${projectId}`, {
        method: "POST",
        headers: headers,
        body: JSON.stringify({
          message: currentInput,
          history: chatHistory.slice(-6),
        }), // Send recent history
      });

      if (response.status === 401 || response.status === 403) {
        throw new Error("Access denied. Please log in.");
      }

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(
          errorData.message || `Request failed: ${response.statusText}`
        );
      }

      // --- Handle Streaming Response ---
      if (!response.body) {
        throw new Error("Streaming response not supported or body is missing.");
      }
      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let done = false;

      while (!done) {
        const { value, done: readerDone } = await reader.read();
        done = readerDone;
        if (value) {
          const chunk = decoder.decode(value, { stream: true });
          setChatHistory((prev) => {
            const newHistory = [...prev];
            if (
              newHistory[modelPlaceholderIndex] &&
              newHistory[modelPlaceholderIndex].role === "model"
            ) {
              newHistory[modelPlaceholderIndex] = {
                ...newHistory[modelPlaceholderIndex],
                text: newHistory[modelPlaceholderIndex].text + chunk,
              };
            } else {
              console.warn(
                "Model placeholder not found at index",
                modelPlaceholderIndex
              );
            }
            return newHistory;
          });
        }
      }
      // --- End Streaming Handling ---
    } catch (err) {
      console.error("Chat error:", err);
      setChatError(err.message);
      setChatHistory((prev) =>
        prev.filter(
          (_, index) =>
            index !== modelPlaceholderIndex || prev[modelPlaceholderIndex]?.text
        )
      ); // Remove placeholder on error
    } finally {
      setIsChatLoading(false);
    }
  };

  // Function to handle copying text (no changes needed)
  const handleCopy = (text, index) => {
    navigator.clipboard
      .writeText(text)
      .then(() => {
        setCopiedIndex(index);
        setTimeout(() => setCopiedIndex(null), 1500);
      })
      .catch((err) => {
        console.error("Failed to copy text: ", err);
      });
  };

  // --- Handler for Suggested Question Click (No changes needed, uses isProjectReadyForChat check) ---
  const handleSuggestionClick = (question) => {
    if (isChatLoading || !isProjectReadyForChat) return;
    setChatInput(question);
    // Use timeout to ensure state updates before sending
    setTimeout(handleSendMessage, 0);
  };
  // --- End Handler ---

  // --- Handler for Diagram Download Click ---
  const handleDownloadClick = async (diagramId) => {
    if (downloadingDiagramId) return; // Prevent multiple clicks

    setDownloadingDiagramId(diagramId);
    // Optionally clear a specific download error state if you add one
    // setError(null);

    try {
      // Prepare headers for auth/guest
      const headers = {};
      if (isGuestMode && guestId) {
        headers["X-Guest-ID"] = guestId;
      }

      const response = await fetch(`/api/diagrams/${diagramId}/download-url`, {
        headers,
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(
          errorData.message ||
            `Failed to get download URL: ${response.statusText}`
        );
      }

      const data = await response.json();
      if (data.signedUrl) {
        // Use the signed URL to trigger download
        // Using window.location.href works well for forcing download via content-disposition
        window.location.href = data.signedUrl;
      } else {
        throw new Error("Signed URL not received from server.");
      }
    } catch (err) {
      console.error("Download error:", err);
      // Set a general error or a specific download error state
      setError(`Failed to download file: ${err.message}`);
    } finally {
      setDownloadingDiagramId(null); // Reset loading state for this diagram
    }
  };
  // --- End Download Handler ---

  // --- Helper to get status indicator (Icon, color, text) ---
  // Now returns component for progress bar if needed
  const getStatusIndicator = (status, progress = 0) => {
    switch (status) {
      case "PENDING":
        // Show 0% progress bar for pending
        return {
          Component: () => <StatusProgressBar progress={0} />,
          color: "text-gray-400",
          text: "Pending (0%)",
        };
      case "PROCESSING":
        // Show progress bar based on uploadProgress
        return {
          Component: () => <StatusProgressBar progress={progress} />,
          color: "text-blue-400",
          text: `Processing (${Math.round(progress)}%)`,
        };
      case "ACTIVE":
        return {
          Component: CheckCircleIcon,
          color: "text-green-400",
          text: "Ready",
        };
      case "FAILED":
        return {
          Component: XCircleIcon,
          color: "text-red-400",
          text: "Failed",
        };
      default:
        return {
          Component: ExclamationCircleIcon,
          color: "text-yellow-400",
          text: "Unknown",
        };
    }
  };

  // --- Render Logic ---
  // Show checking guest access state
  if (status === "unauthenticated" && !guestId && !error) {
    return (
      <div className='w-full h-full flex items-center justify-center bg-gray-900'>
        <LoadingSpinner text='Checking guest access...' size='md' />
      </div>
    );
  }

  // Show error if any occurred during fetches
  if (error)
    return (
      <div className='w-full h-full flex items-center justify-center bg-gray-900 text-white p-4 text-center'>
        Error: {error}
      </div>
    );

  // Show loading state only if project details haven't loaded yet
  if (loadingProjectDetails)
    return (
      <div className='w-full h-full flex items-center justify-center bg-gray-900'>
        <LoadingSpinner text='Loading project details...' size='md' />
      </div>
    );

  // If project details failed but no general error (shouldn't happen with current logic, but safe)
  if (!project)
    return (
      <div className='w-full h-full flex items-center justify-center bg-gray-900 text-white'>
        Project data unavailable.
      </div>
    );

  // Render the main layout once project details are available
  return (
    <div className='flex flex-col md:flex-row relative flex-grow bg-gray-900'>
      {/* Left Column */}
      <div
        className={`w-full md:w-1/3 lg:w-1/4 p-4 border-r border-gray-700 flex flex-col space-y-6 bg-gray-900`}
      >
        {/* 1. Project Files Header & Upload Button */}
        <div>
          <h2 className='text-xl font-semibold mb-3 text-white'>
            Project Files
          </h2>
          <Link href={`/dashboard/project/${projectId}/upload`}>
            <button className='w-full mb-4 bg-indigo-600 hover:bg-indigo-500 text-white font-bold py-2 px-4 rounded'>
              + Upload Document
            </button>
          </Link>
        </div>

        {/* 2. Project Reports Section (Show only if diagrams exist) */}
        {!loadingDiagrams && diagrams.length > 0 && (
          <div>
            <h2 className='text-xl font-semibold mb-3 text-white'>
              Project Reports
            </h2>
            {(reportStates.ocr.error ||
              reportStates.bom.error ||
              reportStates.compliance.error) && (
              <p className='text-red-500 text-xs mb-2'>
                Report Error:{" "}
                {reportStates.ocr.error ||
                  reportStates.bom.error ||
                  reportStates.compliance.error}
              </p>
            )}
            <div className='flex flex-col space-y-2'>
              <button
                onClick={handleOcrDownload}
                className={`bg-blue-600 hover:bg-blue-500 text-white font-bold py-2 px-4 rounded text-sm cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center min-h-[36px] relative`}
                disabled={!!activeReportType}
              >
                {activeReportType === "ocr" ? (
                  <div className='flex items-center justify-center space-x-2'>
                    <LoadingSpinner size='sm' text={null} />
                    <span>{reportStates.ocr.message || "Generating..."}</span>
                  </div>
                ) : (
                  "Detailed Overview Download"
                )}
              </button>
              <button
                onClick={handleBomDownload}
                className='bg-green-600 hover:bg-green-500 text-white font-bold py-2 px-4 rounded text-sm cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center min-h-[36px] relative'
                disabled={!!activeReportType}
              >
                {activeReportType === "bom" ? (
                  <div className='flex items-center justify-center space-x-2'>
                    <LoadingSpinner size='sm' text={null} />
                    <span>{reportStates.bom.message || "Generating..."}</span>
                  </div>
                ) : (
                  "BoM Download"
                )}
              </button>
              <button
                onClick={handleComplianceDownload}
                className='bg-yellow-600 hover:bg-yellow-500 text-white font-bold py-2 px-4 rounded text-sm cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center min-h-[36px] relative'
                disabled={!!activeReportType}
              >
                {activeReportType === "compliance" ? (
                  <div className='flex items-center justify-center space-x-2'>
                    <LoadingSpinner size='sm' text={null} />
                    <span>
                      {reportStates.compliance.message || "Generating..."}
                    </span>
                  </div>
                ) : (
                  "Compliance Download"
                )}
              </button>
            </div>
          </div>
        )}

        {/* 3. Uploaded Files List (Show loading or content) */}
        <div className='flex-grow overflow-y-auto max-h-80 scrollbar-thin scrollbar-thumb-gray-600 scrollbar-track-gray-800 scrollbar-thumb-rounded pr-1'>
          {loadingDiagrams ? (
            <div className='flex justify-center items-center h-full'>
              <LoadingSpinner text='Loading files...' size='sm' />
            </div>
          ) : diagrams.length > 0 ? (
            <ul className='space-y-2'>
              {diagrams.map((diagram, index) => {
                // Pass progress to helper
                const {
                  Component: StatusComponent,
                  color: statusColor,
                  text: statusText,
                } = getStatusIndicator(
                  diagram.processingStatus,
                  diagram.uploadProgress
                );
                return (
                  <li
                    key={diagram._id}
                    className='bg-gray-700 p-3 rounded relative flex justify-between items-start'
                  >
                    <span className='absolute top-1 left-1 text-xs font-mono text-gray-400 bg-gray-800 px-1 rounded-sm'>
                      {index + 1}
                    </span>
                    {/* Added overflow-hidden to this div */}
                    <div className='pl-5 flex-grow mr-2 overflow-hidden'>
                      <p
                        className='font-medium text-sm mb-1 text-white break-words'
                        title={diagram.fileName}
                      >
                        {diagram.fileName}
                      </p>
                      {/* Status Indicator Area */}
                      <div
                        className={`flex items-center text-xs ${statusColor} mt-1`}
                      >
                        {/* Render Icon or Progress Bar */}
                        {diagram.processingStatus === "PENDING" ||
                        diagram.processingStatus === "PROCESSING" ? (
                          <div className='w-full mr-2'>
                            {" "}
                            {/* Container for progress bar */}
                            <StatusComponent />
                          </div>
                        ) : (
                          <StatusComponent className='w-3 h-3 mr-1 flex-shrink-0' /> // Render icon directly
                        )}
                        <span className='whitespace-nowrap'>{statusText}</span>
                      </div>
                    </div>
                    {/* Download Button/Icon Area */}
                    <div className='absolute top-1 right-1'>
                      {
                        diagram.processingStatus === "ACTIVE" ? (
                          downloadingDiagramId === diagram._id ? (
                            <span className='text-gray-400 text-xs px-1'>
                              ...
                            </span> // Show "..." instead of spinner
                          ) : (
                            <button
                              onClick={(e) => {
                                e.preventDefault(); // Prevent any default link behavior if using <a>
                                handleDownloadClick(diagram._id);
                              }}
                              disabled={!!downloadingDiagramId} // Disable all download buttons while one is active
                              className='text-gray-400 hover:text-white transition-colors disabled:opacity-50 disabled:cursor-not-allowed'
                              title={`Download ${diagram.fileName}`}
                            >
                              <ArrowDownTrayIcon className='w-5 h-5' />
                            </button>
                          )
                        ) : null /* Don't show download icon if not ACTIVE */
                      }
                    </div>
                  </li>
                );
              })}
            </ul>
          ) : (
            <p className='text-gray-400 text-sm text-center mt-4'>
              No diagrams uploaded yet.
            </p>
          )}
        </div>
      </div>

      {/* Right Column: Chat Interface (Rendered once project details are loaded) */}
      <div
        ref={chatContainerRef}
        className={`w-full md:w-2/3 lg:w-3/4 p-6 flex flex-col bg-gray-900`}
      >
        <h2 className='text-2xl font-semibold mb-4 text-white flex-shrink-0'>
          Chat for Insights
        </h2>
        <ChatInterface
          chatHistory={chatHistory}
          chatInput={chatInput}
          onInputChange={(e) => setChatInput(e.target.value)}
          onSendMessage={handleSendMessage}
          isChatLoading={isChatLoading}
          chatError={chatError}
          initialSummary={null} // No longer provided by prepare
          suggestedQuestions={[]} // No longer provided by prepare
          onSuggestionClick={handleSuggestionClick}
          preparationStatus={
            // Pass derived status
            diagrams.length === 0
              ? "no_files"
              : diagrams.some(
                  (d) =>
                    d.processingStatus === "PENDING" ||
                    d.processingStatus === "PROCESSING"
                )
              ? "processing"
              : diagrams.every(
                  (d) =>
                    d.processingStatus === "ACTIVE" ||
                    d.processingStatus === "FAILED"
                )
              ? diagrams.some((d) => d.processingStatus === "ACTIVE")
                ? "ready"
                : "failed"
              : "unknown" // Fallback
          }
          copiedIndex={copiedIndex}
          onCopy={handleCopy}
          chatAreaWidthState={chatAreaWidthState}
          isGuestMode={isGuestMode}
        />
      </div>
    </div>
  );
}
