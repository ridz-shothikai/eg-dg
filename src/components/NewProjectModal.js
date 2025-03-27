'use client';

import React, { useState } from 'react';

export default function NewProjectModal({ isOpen, onClose, onCreate }) {
  const [projectName, setProjectName] = useState('');
  const [description, setDescription] = useState('');
  const [isCreating, setIsCreating] = useState(false);
  const [error, setError] = useState('');

  const handleCreate = async () => {
    if (!projectName.trim()) {
      setError('Project name is required.');
      return;
    }
    setError('');
    setIsCreating(true);

    try {
      await onCreate(projectName, description);
      // onCreate should handle closing the modal on success
    } catch (err) {
      setError(err.message || 'Failed to create project.');
    } finally {
      setIsCreating(false);
    }
  };

  const handleClose = () => {
    if (!isCreating) {
      setProjectName('');
      setDescription('');
      setError('');
      onClose();
    }
  };

  if (!isOpen) {
    return null;
  }

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div className="bg-[#100926] p-6 rounded-lg shadow-xl w-full max-w-md border border-[#130830]">
        <h3 className="text-xl font-semibold mb-4 text-white">Create New Project</h3>
        {error && <p className="text-red-500 mb-2 text-sm">{error}</p>}
        <div className="mb-4">
          <label htmlFor="projectName" className="block text-sm font-medium text-gray-300 mb-1">Project Name *</label>
          <input
            type="text"
            id="projectName"
            value={projectName}
            onChange={(e) => setProjectName(e.target.value)}
            className="w-full px-3 py-2 bg-[#0c071a] border border-[#130830] rounded-md text-white focus:outline-none focus:ring-2 focus:ring-indigo-500"
            required
            disabled={isCreating}
          />
        </div>
        <div className="mb-4">
          <label htmlFor="description" className="block text-sm font-medium text-gray-300 mb-1">Description (Optional)</label>
          <textarea
            id="description"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            rows="3"
            className="w-full px-3 py-2 bg-[#0c071a] border border-[#130830] rounded-md text-white focus:outline-none focus:ring-2 focus:ring-indigo-500"
            disabled={isCreating}
          />
        </div>
        <div className="flex justify-end space-x-2">
          <button
            onClick={handleClose}
            disabled={isCreating}
            className="bg-gray-600 hover:bg-gray-500 text-white font-bold py-2 px-4 rounded disabled:opacity-50"
          >
            Cancel
          </button>
          <button
            onClick={handleCreate}
            disabled={isCreating || !projectName.trim()}
            className="bg-indigo-600 hover:bg-indigo-500 text-white font-bold py-2 px-4 rounded disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {isCreating ? 'Creating...' : 'Create Project'}
          </button>
        </div>
      </div>
    </div>
  );
}
