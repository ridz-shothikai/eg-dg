'use client';

import React, { useState, useEffect } from 'react';

export default function AddPromptModal({ isOpen, onClose, onSave }) {
  const [title, setTitle] = useState('');
  const [prompt, setPrompt] = useState('');
  const [error, setError] = useState('');
  const [isSaving, setIsSaving] = useState(false);

  // Reset state when modal opens/closes
  useEffect(() => {
    if (isOpen) {
      setTitle('');
      setPrompt('');
      setError('');
      setIsSaving(false);
    }
  }, [isOpen]);

  const handleSave = async () => {
    if (!title.trim() || !prompt.trim()) {
      setError('Title and prompt are required.');
      return;
    }
    if (title.length > 100) {
       setError('Title cannot exceed 100 characters.');
       return;
    }

    setError('');
    setIsSaving(true);
    try {
      await onSave(title, prompt); // Call the save function passed via props
      // onClose(); // Let the parent component handle closing on success
    } catch (err) {
      console.error("Error saving prompt:", err);
      setError(err.message || 'Failed to save prompt.');
      setIsSaving(false); // Re-enable button on error
    }
    // No finally setIsSaving(false) here, parent closes modal on success
  };

  if (!isOpen) {
    return null;
  }

  return (
    // Modal backdrop
    <div className="fixed inset-0 bg-black bg-opacity-60 z-40 flex justify-center items-center p-4">
      {/* Modal content */}
      <div className="bg-gray-800 rounded-lg shadow-xl p-6 w-full max-w-lg border border-gray-700">
        <h2 className="text-xl font-semibold mb-4 text-white">Add Custom Prompt</h2>

        {error && <p className="text-red-500 text-sm mb-3">{error}</p>}

        <div className="space-y-4">
          <div>
            <label htmlFor="promptTitle" className="block text-sm font-medium text-gray-300 mb-1">
              Title (Max 100 chars)
            </label>
            <input
              type="text"
              id="promptTitle"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              maxLength={100}
              className="w-full p-2 bg-gray-700 rounded border border-gray-600 text-white focus:outline-none focus:ring-1 focus:ring-indigo-500"
              disabled={isSaving}
            />
          </div>
          <div>
            <label htmlFor="promptText" className="block text-sm font-medium text-gray-300 mb-1">
              Prompt Text
            </label>
            <textarea
              id="promptText"
              rows="4"
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
              className="w-full p-2 bg-gray-700 rounded border border-gray-600 text-white focus:outline-none focus:ring-1 focus:ring-indigo-500 resize-y"
              disabled={isSaving}
            ></textarea>
          </div>
        </div>

        {/* Action buttons */}
        <div className="mt-6 flex justify-end space-x-3">
          <button
            onClick={onClose}
            disabled={isSaving}
            className="px-4 py-2 rounded bg-gray-600 hover:bg-gray-500 text-white transition duration-150 disabled:opacity-50"
          >
            Cancel
          </button>
          <button
            onClick={handleSave}
            disabled={isSaving}
            className="px-4 py-2 rounded bg-indigo-600 hover:bg-indigo-500 text-white font-semibold transition duration-150 disabled:opacity-50 flex items-center justify-center min-w-[80px]"
          >
            {isSaving ? (
              <svg className="animate-spin h-5 w-5 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
              </svg>
            ) : (
              'Save'
            )}
          </button>
        </div>
      </div>
    </div>
  );
}
