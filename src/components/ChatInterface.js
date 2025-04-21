"use client";

import AddPromptModal from "@/components/AddPromptModal"; // Import the modal
import LoadingSpinner from "@/components/LoadingSpinner";
import { useRouter } from "next/navigation"; // Import useRouter
import { useEffect, useRef, useState } from "react";
import StyledMarkdown from "./StyledMarkdown"; // Import the new component
// Removed: import ReactMarkdown from "react-markdown";

// Simple SVG Copy Icon component
const CopyIcon = ({ className = "w-4 h-4" }) => (
  <svg
    xmlns='http://www.w3.org/2000/svg'
    fill='none'
    viewBox='0 0 24 24'
    strokeWidth={1.5}
    stroke='currentColor'
    className={className}
  >
    <path
      strokeLinecap='round'
      strokeLinejoin='round'
      d='M15.75 17.25v3.375c0 .621-.504 1.125-1.125 1.125h-9.75a1.125 1.125 0 0 1-1.125-1.125V7.875c0-.621.504-1.125 1.125-1.125H6.75a9.06 9.06 0 0 1 1.5.124m7.5 10.376h3.375c.621 0 1.125-.504 1.125-1.125V11.25c0-4.46-3.243-8.161-7.5-8.876a9.06 9.06 0 0 0-1.5-.124H9.375c-.621 0-1.125.504-1.125 1.125v3.5m7.5 0v-3.5m0 3.5c-1.313 0-2.5-.388-3.5-.995m3.5.995c1.313 0 2.5.388 3.5.995m-3.5-.995V11.25m0 6.75a9.063 9.063 0 0 1-3.5-.995M12.75 2.25H9.375a1.125 1.125 0 0 0-1.125 1.125v9.75c0 .621.504 1.125 1.125 1.125h9.75c.621 0 1.125-.504 1.125-1.125V7.875a1.125 1.125 0 0 0-1.125-1.125H13.5m0-3.375V6.75'
    />
  </svg>
);

// Add Icon component
const AddIcon = ({ className = "w-5 h-5" }) => (
  <svg
    xmlns='http://www.w3.org/2000/svg'
    fill='none'
    viewBox='0 0 24 24'
    strokeWidth={1.5}
    stroke='currentColor'
    className={className}
  >
    <path
      strokeLinecap='round'
      strokeLinejoin='round'
      d='M12 4.5v15m7.5-7.5h-15'
    />
  </svg>
);

// ChatInterface Component
export default function ChatInterface({
  chatHistory,
  chatInput,
  onInputChange,
  onSendMessage,
  isChatLoading,
  chatError,
  initialSummary,
  suggestedQuestions,
  onSuggestionClick,
  preparationStatus, // Pass preparationStatus to show loading/error states
  copiedIndex, // Pass state for copy feedback
  onCopy, // Pass copy handler function
  chatAreaWidthState,
  isGuestMode, // Accept isGuestMode prop
}) {
  const router = useRouter(); // Initialize router
  const chatContainerRef = useRef(null); // Ref for the scrollable chat history container
  const [customPrompts, setCustomPrompts] = useState([]);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [promptsLoading, setPromptsLoading] = useState(true); // Loading state for prompts
  const [promptsError, setPromptsError] = useState(""); // Error state for prompts

  // Fetch custom prompts on mount only if NOT in guest mode
  useEffect(() => {
    if (isGuestMode) {
      setPromptsLoading(false); // Don't attempt to load for guests
      return;
    }

    const fetchPrompts = async () => {
      setPromptsLoading(true);
      setPromptsError("");
      try {
        const response = await fetch("/api/custom-prompts");
        if (!response.ok) {
          throw new Error("Failed to fetch prompts");
        }
        const data = await response.json();
        setCustomPrompts(data.prompts || []);
      } catch (error) {
        console.error("Error fetching custom prompts:", error);
        // Only set error if not guest
        if (!isGuestMode) {
          setPromptsError("Could not load custom prompts.");
        }
      } finally {
        setPromptsLoading(false);
      }
    };
    fetchPrompts();
  }, [isGuestMode]); // Re-run if guest mode changes (though unlikely in this component's lifecycle)

  // Effect for auto-scrolling chat to the bottom on new messages
  useEffect(() => {
    if (chatContainerRef.current) {
      chatContainerRef.current.scrollTop =
        chatContainerRef.current.scrollHeight;
    }
  }, [chatHistory]); // Trigger scroll whenever chatHistory changes

  // --- Handler for executing custom prompt ---
  const handleExecuteCustomPrompt = (promptText) => {
    if (isChatLoading || preparationStatus !== "ready") return;
    // Update the input value in the parent component
    onInputChange({ target: { value: promptText } });
    // Immediately trigger the send message function in the parent
    // Use a minimal timeout to ensure state update registers before sending
    setTimeout(() => {
      onSendMessage();
    }, 0);
  };
  // --- End Handler ---
  return (
    // Main chat container - takes remaining space, flex column, relative for loading overlay
    // Changed bg-gray-800 to bg-gray-900 for consistency
    <div
      style={{ height: "70vh" }}
      className='flex-grow bg-gray-900 rounded-lg shadow p-4 flex flex-col relative'
    >
      {/* Loading Spinner Overlay */}
      {(preparationStatus === "loading" ||
        preparationStatus === "processing") && (
        // Adjusted overlay background to match main container
        <div className='absolute inset-0 flex items-center justify-center bg-gray-900 bg-opacity-80 z-10 rounded-lg'>
          <LoadingSpinner
            text={
              preparationStatus === "loading"
                ? "Preparing documents for chat..."
                : "Documents are processing, please wait..."
            }
          />
        </div>
      )}

      {/* Chat Content (History and Input) - Rendered only when ready */}
      {preparationStatus === "ready" && (
        <>
          {/* Inner container for chat history - THIS part scrolls */}
          {/* Added ref={chatContainerRef} and updated scrollbar styles */}
          <div
            ref={chatContainerRef}
            style={{ maxHeight: "calc(100vh - 210px)" }}
            className='overflow-y-scroll scrollbar-thin scrollbar-thumb-gray-600 scrollbar-track-gray-900 scrollbar-thumb-rounded'
          >
            <div
              style={{ paddingBottom: 100 }}
              className='flex-grow overflow-y-auto space-y-4 pr-2 mb-4 '
            >
              {/* Display Initial Summary if available and history is empty */}
              {initialSummary && chatHistory.length === 0 && (
                <div className='flex flex-col items-start w-full'>
                  {/* Added w-full here */}
                  {/* Model message style - Removed max-w-lg */}
                  <div className='p-3 rounded-lg prose prose-invert bg-gray-600 text-white w-full'>
                    {/* Added w-full */}
                    <StyledMarkdown content={initialSummary} />
                  </div>
                  {/* Suggested Questions Buttons - Removed max-w-lg */}
                  {suggestedQuestions.length > 0 && (
                    <div className='mt-3 flex flex-col space-y-2 self-start w-full'>
                      {" "}
                      {/* Removed max-w-lg */}
                      {suggestedQuestions.map((q, i) => (
                        <button
                          key={i}
                          onClick={() => onSuggestionClick(q)}
                          disabled={isChatLoading}
                          className='bg-gray-700 hover:bg-gray-600 text-indigo-300 text-sm text-left p-2 rounded border border-gray-600 disabled:opacity-50 disabled:cursor-not-allowed transition-colors'
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
                const isModel = msg.role === "model";
                // Check if this specific message is the loading placeholder
                const isLoadingPlaceholder =
                  isModel &&
                  msg.text === "" &&
                  isChatLoading &&
                  index === chatHistory.length - 1;

                // --- Check for and handle custom error prefix ---
                let isErrorMessage = false;
                let displayMessage = msg.text;
                const errorPrefix = "__CHAT_ERROR__:";
                if (isModel && msg.text.startsWith(errorPrefix)) {
                  isErrorMessage = true;
                  displayMessage = msg.text.substring(errorPrefix.length);
                }

                // --- End error prefix handling ---

                // Determine bubble classes based on role and error status
                const bubbleClasses = [
                  "p-3",
                  "rounded-lg",
                  // Apply max-w-lg only to user messages
                  msg.role === "user" ? "max-w-lg" : "",
                  "prose",
                  "prose-invert",
                  isLoadingPlaceholder
                    ? "flex items-center justify-center"
                    : "",
                  msg.role === "user" ? "bg-indigo-600 text-white" : "",
                  isModel && !isErrorMessage ? "bg-gray-600 text-white" : "",
                  isErrorMessage
                    ? "bg-red-900 bg-opacity-50 border border-red-700 text-red-200"
                    : "", // Error styling
                ]
                  .filter(Boolean)
                  .join(" "); // Filter out empty strings and join

                return (
                  // Container for each message row (bubble + optional copy button)
                  <div
                    key={index}
                    className={`flex flex-col ${
                      msg.role === "user" ? "items-end" : "items-start"
                    }`}
                  >
                    {/* Message Bubble */}
                    <div className={bubbleClasses}>
                      {isLoadingPlaceholder ? (
                        <div className='w-3 h-3 bg-gray-400 rounded-full animate-zoom'></div>
                      ) : isModel ? (
                        // Use displayMessage which has prefix removed if it was an error
                        <div className='p-3 rounded-lg prose prose-invert bg-gray-600 text-white w-full'>
                          {/* Added w-full */}
                          <StyledMarkdown content={displayMessage} />
                        </div>
                      ) : (
                        displayMessage // User messages just use displayMessage (which is same as msg.text)
                      )}
                    </div>
                    {/* Add Copy button UNDER completed model messages (but not for errors) */}
                    {isModel &&
                      !isLoadingPlaceholder &&
                      !isErrorMessage &&
                      msg.text && (
                        <button
                          onClick={() => onCopy(displayMessage, index)} // Copy the cleaned message
                          className='mt-1 p-1 rounded text-gray-400 hover:text-white hover:bg-gray-700 transition-colors'
                          title={
                            copiedIndex === index ? "Copied!" : "Copy text"
                          }
                        >
                          <CopyIcon className='w-4 h-4' />
                        </button>
                      )}
                  </div>
                );
              })}
              {/* Chat Error Message */}
              {chatError && (
                <p className='text-red-500 text-sm mt-2 self-start'>
                  {chatError}
                </p>
              )}
            </div>
          </div>

          {/* Input area */}
          <div
            style={{ width: chatAreaWidthState - 40, marginLeft: -20 }}
            className={`flex flex-row pt-2 border-t border-gray-700 fixed bottom-0 `}
          >
            {" "}
            {/* Reduced top padding */}
            <div className='flex-grow  bg-gray-800 rounded-lg shadow p-2 w-full flex flex-col relative'>
              <div className='flex-grow overflow-x-auto whitespace-nowrap space-x-2 pb-1 scrollbar-thin scrollbar-thumb-gray-600 scrollbar-track-gray-700'>
                {/* Add Prompt Button - Conditional onClick */}
                <button
                  onClick={() => {
                    if (isGuestMode) {
                      router.push("/login?reason=custom_prompts"); // Redirect guest to login
                    } else {
                      setIsModalOpen(true); // Open modal for logged-in user
                    }
                  }}
                  className='p-1 rounded-full text-gray-400 hover:bg-gray-600 hover:text-white transition-colors flex-shrink-0'
                  title={
                    isGuestMode
                      ? "Log in to add custom prompts"
                      : "Add Custom Prompt"
                  }
                >
                  <AddIcon />
                </button>

                {/* Only show loading/error/prompts if not guest */}
                {!isGuestMode && promptsLoading && (
                  <span className='text-xs text-gray-400 italic'>
                    Loading prompts...
                  </span>
                )}
                {!isGuestMode && promptsError && (
                  <span className='text-xs text-red-500'>{promptsError}</span>
                )}
                {!isGuestMode &&
                  !promptsLoading &&
                  !promptsError &&
                  customPrompts.length === 0 && (
                    <span className='text-xs text-gray-500 italic'>
                      No custom prompts saved.
                    </span>
                  )}
                {!isGuestMode &&
                  !promptsLoading &&
                  !promptsError &&
                  customPrompts.map((p) => (
                    <button
                      key={p._id}
                      onClick={() => handleExecuteCustomPrompt(p.prompt)} // Use new handler
                      disabled={isChatLoading || preparationStatus !== "ready"}
                      className='inline-block bg-gray-700 hover:bg-gray-600 text-indigo-300 text-xs px-3 py-1 rounded-full border border-gray-600 disabled:opacity-50 disabled:cursor-not-allowed transition-colors'
                      title={p.prompt} // Show full prompt on hover
                    >
                      {p.title}
                    </button>
                  ))}
              </div>

              <div className='flex-shrink-0 flex pt-2 border-t border-gray-700'>
                <textarea
                  className='flex-grow p-2 bg-gray-700 rounded-l border border-gray-600 text-white focus:outline-none focus:ring-1 focus:ring-indigo-500 disabled:opacity-70 resize-none'
                  placeholder='Ask questions about the diagrams...'
                  rows='2'
                  value={chatInput}
                  onChange={onInputChange} // Use passed handler
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && !e.shiftKey) {
                      e.preventDefault();
                      onSendMessage();
                    }
                  }}
                  disabled={isChatLoading || preparationStatus !== "ready"}
                ></textarea>
                <button
                  className='bg-indigo-600 hover:bg-indigo-500 text-white font-bold p-2 rounded-r disabled:opacity-50 flex items-center justify-center'
                  onClick={onSendMessage} // Use passed handler
                  disabled={
                    isChatLoading ||
                    !chatInput.trim() ||
                    preparationStatus !== "ready"
                  }
                >
                  Send
                </button>
              </div>
            </div>
          </div>
        </>
      )}

      {/* Status Messages (Failed / No Files) - Rendered when applicable */}
      {preparationStatus === "failed" && (
        <div className='flex-grow flex items-center justify-center'>
          <p className='text-red-500 text-center'>
            Failed to prepare documents for chat. Please try reloading.
          </p>
        </div>
      )}
      {preparationStatus === "no_files" && (
        <div className='flex-grow flex items-center justify-center'>
          <p className='text-gray-400 text-center'>
            Upload Document to enable contextual chat.
          </p>
        </div>
      )}

      {/* Modal for Adding Prompts */}
      <AddPromptModal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        onSave={async (title, prompt) => {
          // Call API to save
          const response = await fetch("/api/custom-prompts", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ title, prompt }),
          });
          if (!response.ok) {
            const errorData = await response.json();
            throw new Error(errorData.message || "Failed to save prompt");
          }
          const newPrompt = await response.json();
          // Add to state and close modal
          setCustomPrompts((prev) => [newPrompt, ...prev]); // Add to beginning of list
          setIsModalOpen(false);
        }}
      />
    </div>
  );
}
