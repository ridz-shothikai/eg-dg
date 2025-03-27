'use client'; // Required for state and event handlers

import React, { useState, useCallback } from 'react';
import { useDropzone } from 'react-dropzone';
import { useRouter } from 'next/navigation'; // Import useRouter
import * as constants from '@/constants';

const {
  MONGODB_URI,
  GOOGLE_CLOUD_PROJECT_ID,
  GCS_BUCKET_NAME,
  GOOGLE_AI_STUDIO_API_KEY,
  NEXTAUTH_SECRET
} = constants;

export default function FileUpload({ projectId }) { // Accept projectId as prop
  const [uploadedFiles, setUploadedFiles] = useState([]);
  const [isDragging, setIsDragging] = useState(false);
  const [uploading, setUploading] = useState(false); // Track upload state
  const [uploadProgress, setUploadProgress] = useState(0); // Track upload progress
  const [uploadError, setUploadError] = useState(''); // Track upload errors
  const [uploadSuccess, setUploadSuccess] = useState(false); // Track upload success
  const router = useRouter(); // Initialize router

  const onDrop = useCallback(async (acceptedFiles) => {
    setUploadedFiles(acceptedFiles); // Store files for display
    setIsDragging(false);
    setUploadError(''); // Clear any previous errors
    setUploadSuccess(false); // Reset success state

    if (acceptedFiles.length === 0) return;

    const file = acceptedFiles[0]; // Handle single file upload for now

    setUploading(true);
    setUploadProgress(0); // Reset progress

    try {
      const formData = new FormData();
      formData.append('file', file);
      if (projectId) {
        formData.append('projectId', projectId); // Add projectId to form data
      }

      // Use XMLHttpRequest for progress tracking
      const xhr = new XMLHttpRequest();

      xhr.upload.onprogress = (event) => {
        if (event.lengthComputable) {
          const percentComplete = Math.round((event.loaded / event.total) * 100);
          setUploadProgress(percentComplete);
        }
      };

      xhr.onload = () => {
        setUploading(false);
        if (xhr.status >= 200 && xhr.status < 300) {
          try {
            const data = JSON.parse(xhr.responseText);
            console.log('Upload successful:', data);
            setUploadSuccess(true);
            setUploadedFiles([]); // Clear file list on success
            // Redirect after a short delay to show success message
            setTimeout(() => {
              if (projectId) {
                router.push(`/project/${projectId}`);
              } else {
                router.push('/dashboard'); // Fallback
              }
            }, 1000); // 1 second delay
          } catch (parseError) {
             console.error('Error parsing upload response:', parseError);
             setUploadError('Upload completed but response was invalid.');
          }
        } else {
          try {
            const errorData = JSON.parse(xhr.responseText);
            setUploadError(errorData.message || `Upload failed with status: ${xhr.status}`);
          } catch (parseError) {
             setUploadError(`Upload failed with status: ${xhr.status}`);
          }
           console.error('Upload failed:', xhr.status, xhr.responseText);
        }
      };

      xhr.onerror = () => {
        setUploading(false);
        setUploadError('Upload failed due to a network error.');
        console.error('Upload network error');
      };

      xhr.open('POST', '/api/upload', true);
      xhr.send(formData);

    } catch (error) { // Catch errors from preparing the request (unlikely here)
      console.error('File upload setup error:', error);
      setUploadError(error.message || 'Failed to initiate upload.');
      setUploading(false);
    }

  }, [projectId, router]); // Add router to dependency array

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    onDragEnter: () => setIsDragging(true),
    onDragLeave: () => setIsDragging(false),
    // Define accepted file types based on PRD (PDF, PNG, JPG, DWG, DXF)
    // Note: MIME types for DWG/DXF can be tricky and might need refinement.
    // Using common ones, but browser support varies.
    accept: {
      'application/pdf': ['.pdf'],
      'image/png': ['.png'],
      'image/jpeg': ['.jpg', '.jpeg'],
      'image/vnd.dwg': ['.dwg'], // Common but might not be universally recognized
      'image/vnd.dxf': ['.dxf'], // Common but might not be universally recognized
      'application/acad': ['.dwg'], // Alternative
      'application/dxf': ['.dxf']   // Alternative
    },
    // maxFiles: 1 // Allow multiple files
  });

  return (
    <div className="w-full max-w-3xl mx-auto">
      <div
        {...getRootProps()}
        className={`border-2 border-dashed rounded-lg p-12 text-center cursor-pointer transition-colors duration-300
                   ${isDragActive || isDragging ? 'border-indigo-500 bg-[#13092d]' : 'border-[#130830] hover:border-indigo-400'}
                   bg-[#100926] text-gray-400`}
      >
        <input {...getInputProps()} />
        {isDragActive ? (
          <p className="text-lg font-semibold">Drop the file here ...</p>
        ) : (
          <div>
            <p className="text-lg font-semibold mb-2">Drag {'\''}n{'\''} drop diagram file here, or click to select</p>
            <p className="text-sm">Supported formats: PDF, PNG, JPG, DWG, DXF</p>
          </div>
        )}
      </div>

      {/* Display upload status and progress */}
      {uploading && (
        <div className="mt-4 w-full bg-gray-700 rounded-full h-2.5">
           <div
             className="bg-indigo-600 h-2.5 rounded-full transition-all duration-300 ease-out"
             style={{ width: `${uploadProgress}%` }}
           ></div>
           <p className="text-white text-center text-sm mt-1">{uploadProgress}%</p>
        </div>
      )}

      {uploadError && (
        <div className="mt-4">
          <p className="text-red-500">Upload Error: {uploadError}</p>
        </div>
      )}

     {uploadSuccess && (
        <div className="mt-4">
          <p className="text-green-500">File uploaded successfully!</p>
        </div>
      )}

      {/* Display uploaded file list */}
      {uploadedFiles.length > 0 && !uploading && !uploadSuccess && (
        <div className="mt-6">
          <h3 className="text-lg font-semibold mb-2 text-white">Files to Upload:</h3>
          <ul className="list-disc list-inside text-gray-300 space-y-1">
            {uploadedFiles.map((file, index) => (
              <li key={index}>{file.name} - {Math.round(file.size / 1024)} KB</li>
            ))}
          </ul>
          {/* Add a button to trigger upload for all files later */}
          <p className="text-sm text-yellow-500 mt-2">Note: Currently only the first file selected will be uploaded.</p>
        </div>
      )}
    </div>
  );
}
