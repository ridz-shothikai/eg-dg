'use client';

import React, { useEffect, useRef } from 'react';
import ReactMarkdown from 'react-markdown';
import LoadingSpinner from '@/components/LoadingSpinner'; // Assuming LoadingSpinner is available

// Simple SVG Copy Icon component (Copied from ProjectDetailPage)
const CopyIcon = ({ className = "w-4 h-4" }) => (
  <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className={className}>
    <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 17.25v3.375c0 .621-.504 1.125-1.125 1.125h-9.75a1.125 1.125 0 0 1-1.125-1.125V7.875c0-.621.504-1.125 1.125-1.125H6.75a9.06 9.06 0 0 1 1.5.124m7.5 10.376h3.375c.621 0 1.125-.504 1.125-1.125V11.25c0-4.46-3.243-8.161-7.5-8.876a9.06 9.06 0 0 0-1.5-.124H9.375c-.621 0-1.125.504-1.125 1.125v3.5m7.5 0v-3.5m0 3.5c-1.313 0-2.5-.388-3.5-.995m3.5.995c1.313 0 2.5.388 3.5.995m-3.5-.995V11.25m0 6.75a9.063 9.063 0 0 1-3.5-.995M12.75 2.25H9.375a1.125 1.125 0 0 0-1.125 1.125v9.75c0 .621.504 1.125 1.125 1.125h9.75c.621 0 1.125-.504 1.125-1.125V7.875a1.125 1.125 0 0 0-1.125-1.125H13.5m0-3.375V6.75" />
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
}) {
  const chatContainerRef = useRef(null);

  // Effect for auto-scrolling chat
  useEffect(() => {
    if (chatContainerRef.current) {
      chatContainerRef.current.scrollTop = chatContainerRef.current.scrollHeight;
    }
  }, [chatHistory]); // Trigger scroll on history change

  return (
    // Main chat container - takes remaining space, flex column, relative for loading overlay
    <div className="flex-grow bg-gray-800 rounded-lg shadow p-4 flex flex-col relative">

      {/* Loading Spinner Overlay */}
      {(preparationStatus === 'loading' || preparationStatus === 'processing') && (
        <div className="absolute inset-0 flex items-center justify-center bg-gray-800 bg-opacity-80 z-10 rounded-lg">
          <LoadingSpinner text={preparationStatus === 'loading' ? "Preparing documents for chat..." : "Documents are processing, please wait..."} />
        </div>
      )}

      {/* Chat Content (History and Input) - Rendered only when ready */}
      {preparationStatus === 'ready' && (
        <>
          {/* Inner container for chat history - THIS part scrolls */}
          <div ref={chatContainerRef} className="flex-grow overflow-y-auto space-y-4 pr-2 mb-4">
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
                        onClick={() => onSuggestionClick(q)}
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
                      onClick={() => onCopy(msg.text, index)}
                      className="mt-1 p-1 rounded text-gray-400 hover:text-white hover:bg-gray-700 transition-colors"
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

          {/* Input area - Stays at the bottom */}
          <div className="flex-shrink-0 flex pt-4 border-t border-gray-700">
            <textarea
              className="flex-grow p-2 bg-gray-700 rounded-l border border-gray-600 text-white focus:outline-none focus:ring-1 focus:ring-indigo-500 disabled:opacity-70 resize-none"
              placeholder="Ask questions about the diagrams..."
              rows="2"
              value={chatInput}
              onChange={onInputChange} // Use passed handler
              onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); onSendMessage(); } }}
              disabled={isChatLoading || preparationStatus !== 'ready'}
            ></textarea>
            <button
              className="bg-indigo-600 hover:bg-indigo-500 text-white font-bold p-2 rounded-r disabled:opacity-50 flex items-center justify-center"
              onClick={onSendMessage} // Use passed handler
              disabled={isChatLoading || !chatInput.trim() || preparationStatus !== 'ready'}
            >
              Send
            </button>
          </div>
        </>
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
  );
}
