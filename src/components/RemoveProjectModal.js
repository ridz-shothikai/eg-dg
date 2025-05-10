'use client';

import React, { useState, useEffect } from 'react';

export default function RemoveProjectModal({ isOpen, onClose, onRemove, project }) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  // Reset state when modal opens for a new project
  useEffect(() => {
    if (project) {
      setError(null); // Clear previous errors
      setLoading(false); // Reset loading state
    }
  }, [project]);

  if (!isOpen) return null;

  const handleRemove = async () => {
    setLoading(true);
    setError(null);
    try {
      await onRemove(project._id);
      // onRemove is expected to handle closing the modal on success
    } catch (err) {
      console.error('Error removing project:', err);
      setError(err.message || 'Failed to remove project.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div className="bg-[#110927] p-6 rounded-lg shadow-xl w-full max-w-sm text-white">
        <h2 className="text-xl font-semibold mb-4 text-red-500">Remove Project</h2>
        {error && <p className="text-red-500 text-sm mb-4">{error}</p>}
        <p className="mb-6">
          Are you sure you want to remove the project "<span className="font-semibold">{project?.name}</span>"? This action cannot be undone.
        </p>
        <div className="flex justify-end space-x-3">
          <button
            onClick={onClose}
            className="px-4 py-2 bg-gray-600 hover:bg-gray-500 rounded-md text-white font-bold"
            disabled={loading}
          >
            Cancel
          </button>
          <button
            onClick={handleRemove}
            className="px-4 py-2 bg-red-600 hover:bg-red-500 rounded-md text-white font-bold disabled:opacity-50 disabled:cursor-not-allowed"
            disabled={loading}
          >
            {loading ? 'Removing...' : 'Remove'}
          </button>
        </div>
      </div>
    </div>
  );
}
