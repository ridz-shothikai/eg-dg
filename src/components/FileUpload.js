'use client'; // Required for state and event handlers

import React, { useState, useCallback } from 'react';
import { useDropzone } from 'react-dropzone';
import { useRouter } from 'next/navigation'; // Import useRouter
import * as constants from '@/constants';
import { XCircleIcon } from '@heroicons/react/24/solid'; // For remove button
import { CheckCircleIcon } from '@heroicons/react/24/solid'; // For success icon

const {
  MONGODB_URI,
  GOOGLE_CLOUD_PROJECT_ID,
  GCS_BUCKET_NAME,
  GOOGLE_AI_STUDIO_API_KEY,
  NEXTAUTH_SECRET
} = constants;

// Helper to format bytes
function formatBytes(bytes, decimals = 2) {
  if (bytes === 0) return '0 Bytes';
  const k = 1024;
  const dm = decimals < 0 ? 0 : decimals;
  const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(dm)) + ' ' + sizes[i];
}


export default function FileUpload({ projectId }) { // Accept projectId as prop
  // State to hold file objects with progress and status
  const [filesToUpload, setFilesToUpload] = useState([]);
  const [isDragging, setIsDragging] = useState(false);
  const [isUploadingGlobal, setIsUploadingGlobal] = useState(false); // Track if *any* upload is in progress
  const [overallError, setOverallError] = useState(''); // For errors not specific to one file
  const router = useRouter(); // Initialize router

  // Function to update progress/status for a specific file
  const updateFileState = (index, updates) => {
    setFilesToUpload(currentFiles =>
      currentFiles.map((fileObj, i) =>
        i === index ? { ...fileObj, ...updates } : fileObj
      )
    );
  };

  const onDrop = useCallback((acceptedFiles) => {
    setIsDragging(false);
    setOverallError(''); // Clear overall error

    // Add newly selected files to the list, initializing state
    const newFiles = acceptedFiles.map(file => ({
      file,
      progress: 0,
      status: 'pending', // 'pending', 'uploading', 'complete', 'error'
      error: null,
    }));

    setFilesToUpload(currentFiles => [...currentFiles, ...newFiles]);

  }, []); // Empty dependency array initially

  // Function to remove a file from the list before upload
  const removeFile = (index) => {
    if (isUploadingGlobal) return; // Don't remove during upload
    setFilesToUpload(currentFiles => currentFiles.filter((_, i) => i !== index));
  };

  // Function to handle the upload of all pending files
  const handleUploadAll = async () => {
    if (!projectId) {
      setOverallError("Project ID is missing. Cannot start upload.");
      return;
    }
    if (filesToUpload.filter(f => f.status === 'pending').length === 0) {
        setOverallError("No files selected or ready for upload.");
        return;
    }

    setIsUploadingGlobal(true);
    setOverallError('');

    // Get pending files with their original indexes
    const pendingFiles = filesToUpload
      .map((f, index) => ({ ...f, originalIndex: index }))
      .filter(f => f.status === 'pending');

    // Update status for all pending files to 'uploading'
    pendingFiles.forEach(f => {
        updateFileState(f.originalIndex, { status: 'uploading', progress: 0, error: null });
    });

    // Create upload promises
    const uploadPromises = pendingFiles.map(async (fileObj) => {
      const index = fileObj.originalIndex;
      try {
        const formData = new FormData();
        formData.append('file', fileObj.file);
        formData.append('projectId', projectId);

        // Note: fetch doesn't support progress events directly.
        // We'll update progress to 100% on success, 0% on failure for simplicity.
        // For actual progress, libraries like Axios or custom XHR are needed.
        // Since we removed XHR, we lose granular progress here.
        // Let's simulate 0 -> 100 on completion.

        const response = await fetch('/api/upload', {
          method: 'POST',
          body: formData,
          // Add guest header if needed (though this component seems intended for authenticated users)
          // headers: isGuestMode ? { 'X-Guest-ID': guestId } : {},
        });

        if (!response.ok) {
          const errorData = await response.json().catch(() => ({}));
          const errorMessage = errorData.message || `Upload failed (Status: ${response.status})`;
          throw new Error(errorMessage); // Throw to trigger catch block
        }

        const data = await response.json();
        console.log(`Upload successful for ${fileObj.file.name}:`, data);
        updateFileState(index, { status: 'complete', progress: 100 });
        return { status: 'fulfilled', index }; // Indicate success
      } catch (error) {
        console.error(`Upload failed for ${fileObj.file.name}:`, error);
        updateFileState(index, { status: 'error', error: error.message || 'Upload failed.', progress: 0 });
        return { status: 'rejected', index, reason: error.message }; // Indicate failure
      }
    });

    // Wait for all uploads to settle
    const results = await Promise.allSettled(uploadPromises);

    setIsUploadingGlobal(false);

    const failedUploads = results.filter(r => r.status === 'rejected');
    const successfulUploads = results.filter(r => r.status === 'fulfilled');

    if (failedUploads.length > 0) {
        setOverallError(`Failed to upload ${failedUploads.length} file(s). Please check the list.`);
    }

    // Redirect if at least one upload was successful and no uploads failed? Or only if all succeeded?
    // Let's redirect if *any* succeeded and none are pending/uploading anymore.
    const anyPending = filesToUpload.some(f => f.status === 'pending' || f.status === 'uploading');
    if (successfulUploads.length > 0 && !anyPending) {
        console.log("Upload process finished. Redirecting...");
        // Optionally clear state before redirect
        // setFilesToUpload([]);
        setTimeout(() => {
            // Redirect to the main project dashboard page
            router.push(`/dashboard/project/${projectId}`);
        }, 1000); // Delay to show completion status
    } else if (successfulUploads.length === 0 && failedUploads.length > 0) {
         setOverallError("All file uploads failed."); // More specific error if all failed
    }
  };

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    onDragEnter: () => setIsDragging(true),
    onDragLeave: () => setIsDragging(false),
    // Define accepted file types based on PRD (PDF, PNG, JPG, DWG, DXF)
    // Note: MIME types for DWG/DXF can be tricky and might need refinement.
    // Allow multiple files
    multiple: true
  });

  // Calculate overall progress (simple average for now)
  const overallProgress = filesToUpload.length > 0
    ? Math.round(filesToUpload.reduce((acc, f) => acc + f.progress, 0) / filesToUpload.length)
    : 0;

  return (
    <div className="w-full max-w-3xl mx-auto">
      {/* Dropzone */}
      <div
        {...getRootProps()}
        className={`border-2 border-dashed rounded-lg p-12 text-center cursor-pointer transition-colors duration-300
                   ${isDragActive || isDragging ? 'border-indigo-500 bg-[#13092d]' : 'border-[#130830] hover:border-indigo-400'}
                   bg-[#100926] text-gray-400`}
      >
        <input {...getInputProps()} />
        {isDragActive ? (
          <p className="text-lg font-semibold">Drop files here ...</p>
        ) : (
          <div>
            <p className="text-lg font-semibold mb-2">Drag {'\''}n{'\''} drop diagram files here, or click to select</p>
            <p className="text-sm">Supported formats: PDF, PNG, JPG/JPEG</p>
          </div>
        )}
      </div>

      {/* Overall Error Message */}
      {overallError && (
        <div className="mt-4 p-3 bg-red-900 border border-red-700 rounded text-red-200 text-sm">
          {overallError}
        </div>
      )}

      {/* File List & Upload Button */}
      {filesToUpload.length > 0 && (
        <div className="mt-6">
          <h3 className="text-lg font-semibold mb-3 text-white">Selected Files:</h3>
          <ul className="space-y-3 mb-4">
            {filesToUpload.map((fileObj, index) => (
              <li key={index} className="bg-gray-800 p-3 rounded flex items-center justify-between">
                <div className="flex-1 overflow-hidden mr-4">
                  <p className="text-sm font-medium text-white truncate" title={fileObj.file.name}>
                    {fileObj.file.name}
                  </p>
                  <p className="text-xs text-gray-400">{formatBytes(fileObj.file.size)}</p>
                  {/* Individual Progress Bar */}
                  {(fileObj.status === 'uploading' || fileObj.status === 'complete') && (
                    <div className="mt-1 w-full bg-gray-600 rounded-full h-1.5">
                      <div
                        className={`h-1.5 rounded-full transition-all duration-150 ease-linear ${fileObj.status === 'complete' ? 'bg-green-500' : 'bg-indigo-500'}`}
                        style={{ width: `${fileObj.progress}%` }}
                      ></div>
                    </div>
                  )}
                  {/* Status/Error Text */}
                  {fileObj.status === 'error' && (
                    <p className="text-xs text-red-400 mt-1 truncate" title={fileObj.error}>Error: {fileObj.error}</p>
                  )}
                   {fileObj.status === 'complete' && (
                    <p className="text-xs text-green-400 mt-1">Complete</p>
                  )}
                   {fileObj.status === 'uploading' && (
                    <p className="text-xs text-indigo-400 mt-1">Uploading {fileObj.progress}%</p>
                  )}
                </div>
                {/* Remove Button / Status Icon */}
                <div className="flex-shrink-0">
                  {fileObj.status === 'pending' && !isUploadingGlobal && (
                    <button
                      onClick={() => removeFile(index)}
                      className="text-gray-500 hover:text-red-400 transition-colors"
                      title="Remove file"
                    >
                      <XCircleIcon className="w-5 h-5" />
                    </button>
                  )}
                   {fileObj.status === 'complete' && (
                     <CheckCircleIcon className="w-5 h-5 text-green-500" />
                   )}
                   {fileObj.status === 'error' && (
                     <XCircleIcon className="w-5 h-5 text-red-500" />
                   )}
                   {/* Optionally show a spinner during upload */}
                   {fileObj.status === 'uploading' && (
                     <div className="w-5 h-5 border-2 border-t-indigo-400 border-gray-600 rounded-full animate-spin"></div>
                   )}
                </div>
              </li>
            ))}
          </ul>

          {/* Upload Button */}
          <button
            onClick={handleUploadAll}
            disabled={isUploadingGlobal || filesToUpload.filter(f => f.status === 'pending').length === 0}
            className="w-full bg-indigo-600 hover:bg-indigo-500 disabled:bg-gray-500 disabled:cursor-not-allowed text-white font-bold py-2 px-4 rounded transition-colors"
          >
            {isUploadingGlobal ? `Uploading... (${overallProgress}%)` : `Upload ${filesToUpload.filter(f => f.status === 'pending').length} File(s)`}
          </button>
        </div>
      )}
    </div>
  );
}
