'use client';

import React, { useState, useEffect } from 'react';

export default function RenameProjectModal({ isOpen, onClose, onRename, project }) {
  const [newName, setNewName] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  // Update the input field when the project prop changes (i.e., when modal opens for a new project)
  useEffect(() => {
    if (project) {
      setNewName(project.name);
      setError(null); // Clear previous errors
      setLoading(false); // Reset loading state
    }
  }, [project]);

  if (!isOpen) return null;

  const handleSave = async () => {
    if (!newName.trim()) {
      setError('Project name cannot be empty.');
      return;
    }
    setLoading(true);
    setError(null);
    try {
      await onRename(project._id, newName);
      // onRename is expected to handle closing the modal on success
    } catch (err) {
      console.error('Error renaming project:', err);
      setError(err.message || 'Failed to rename project.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div className="bg-[#110927] p-6 rounded-lg shadow-xl w-full max-w-sm text-white">
        <h2 className="text-xl font-semibold mb-4">Rename Project</h2>
        {error && <p className="text-red-500 text-sm mb-4">{error}</p>}
        <div className="mb-4">
          <label htmlFor="newName" className="block text-sm font-medium text-gray-300 mb-1">New Project Name</label>
          <input
            type="text"
            id="newName"
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            className="w-full px-3 py-2 bg-[#100926] border border-[#130830] rounded-md text-white placeholder-gray-500 focus:outline-none focus:ring-indigo-500 focus:border-indigo-500"
            disabled={loading}
          />
        </div>
        <div className="flex justify-end space-x-3">
          <button
            onClick={onClose}
            className="px-4 py-2 bg-gray-600 hover:bg-gray-500 rounded-md text-white font-bold"
            disabled={loading}
          >
            Cancel
          </button>
          <button
            onClick={handleSave}
            className="px-4 py-2 bg-indigo-600 hover:bg-indigo-500 rounded-md text-white font-bold disabled:opacity-50 disabled:cursor-not-allowed"
            disabled={loading || !newName.trim()}
          >
            {loading ? 'Saving...' : 'Save'}
          </button>
        </div>
      </div>
    </div>
  );
}
