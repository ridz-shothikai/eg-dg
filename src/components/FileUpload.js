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

    const pendingFileIndexes = filesToUpload
        .map((f, index) => (f.status === 'pending' ? index : -1))
        .filter(index => index !== -1);

    let allUploadsSuccessful = true;

    for (const index of pendingFileIndexes) {
      const fileObj = filesToUpload[index];
      updateFileState(index, { status: 'uploading', progress: 0, error: null });

      try {
        const formData = new FormData();
        formData.append('file', fileObj.file);
        formData.append('projectId', projectId);

        // Use a Promise wrapper for XMLHttpRequest
        await new Promise((resolve, reject) => {
          const xhr = new XMLHttpRequest();

          xhr.upload.onprogress = (event) => {
            if (event.lengthComputable) {
              const percentComplete = Math.round((event.loaded / event.total) * 100);
              updateFileState(index, { progress: percentComplete });
            }
          };

          xhr.onload = () => {
            if (xhr.status >= 200 && xhr.status < 300) {
              try {
                const data = JSON.parse(xhr.responseText);
                console.log(`Upload successful for ${fileObj.file.name}:`, data);
                updateFileState(index, { status: 'complete', progress: 100 });
                resolve(data);
              } catch (parseError) {
                 console.error(`Error parsing upload response for ${fileObj.file.name}:`, parseError);
                 updateFileState(index, { status: 'error', error: 'Invalid server response.' });
                 allUploadsSuccessful = false;
                 resolve(); // Resolve even on parse error to continue loop
              }
            } else {
              try {
                const errorData = JSON.parse(xhr.responseText);
                const errorMessage = errorData.message || `Upload failed (Status: ${xhr.status})`;
                console.error(`Upload failed for ${fileObj.file.name}:`, xhr.status, xhr.responseText);
                updateFileState(index, { status: 'error', error: errorMessage });
              } catch (parseError) {
                 const errorMessage = `Upload failed (Status: ${xhr.status})`;
                 console.error(`Upload failed for ${fileObj.file.name} (could not parse error):`, xhr.status, xhr.responseText);
                 updateFileState(index, { status: 'error', error: errorMessage });
              }
              allUploadsSuccessful = false;
              resolve(); // Resolve even on error to continue loop
            }
          };

          xhr.onerror = () => {
            console.error(`Upload network error for ${fileObj.file.name}`);
            updateFileState(index, { status: 'error', error: 'Network error.' });
            allUploadsSuccessful = false;
            resolve(); // Resolve on network error to continue loop
          };

          xhr.open('POST', '/api/upload', true);
          xhr.send(formData);
        });

      } catch (error) { // Catch errors from preparing the request
        console.error(`File upload setup error for ${fileObj.file.name}:`, error);
        updateFileState(index, { status: 'error', error: 'Failed to initiate upload.' });
        allUploadsSuccessful = false;
        // Continue to next file
      }
    } // End of loop

    setIsUploadingGlobal(false);

    // Redirect only if all uploads were successful
    if (allUploadsSuccessful && filesToUpload.every(f => f.status === 'complete')) {
        console.log("All files uploaded successfully. Redirecting...");
        // Optionally clear state before redirect
        // setFilesToUpload([]);
        setTimeout(() => {
            router.push(`/project/${projectId}`);
        }, 1000); // Delay to show completion status
    } else if (!allUploadsSuccessful) {
         setOverallError("Some files failed to upload. Please check the list below.");
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
