'use client';

import React, { useState, useEffect } from 'react';
import { useParams } from 'next/navigation';
import mongoose from 'mongoose';
import Diagram from '@/models/Diagram';
import * as constants from '@/constants';

const { MONGODB_URI } = constants;
const mongodbUri = MONGODB_URI; // User-provided connection string

async function connectMongoDB() {
  try {
    if (mongoose.connection.readyState !== 1) {
      await mongoose.connect(mongodbUri);
      console.log('Connected to MongoDB');
    }
  } catch (error) {
    console.error('MongoDB connection error:', error);
    throw error; // Re-throw to be caught by the handler
  }
}

export default function OCRResultPage() {
  const { diagramId } = useParams();
  const [diagram, setDiagram] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [selectedText, setSelectedText] = useState(null); // Track selected text

  useEffect(() => {
    async function fetchDiagram() {
      try {
        await connectMongoDB();

        const diagram = await Diagram.findById(diagramId);
        if (!diagram) {
          setError('Diagram not found');
          setLoading(false);
          return;
        }

        setDiagram(diagram);
        setLoading(false);
      } catch (err) {
        console.error('Error fetching diagram:', err);
        setError('Failed to fetch diagram');
        setLoading(false);
      }
    }

    fetchDiagram();
  }, [diagramId]);

  if (loading) {
    return <div className="min-h-screen flex items-center justify-center bg-gray-900 text-white">Loading OCR Result...</div>;
  }

  if (error) {
    return <div className="min-h-screen flex items-center justify-center bg-gray-900 text-white">Error: {error}</div>;
  }

  if (!diagram) {
    return <div className="min-h-screen flex items-center justify-center bg-gray-900 text-white">Diagram not found.</div>;
  }

  return (
    <div className="min-h-screen bg-gray-900 text-white p-8">
      <div className="max-w-4xl mx-auto">
        <h1 className="text-3xl font-bold mb-6 text-center">OCR Result</h1>
        <div className="bg-gray-800 rounded-lg shadow p-6">
          <h2 className="text-xl font-semibold mb-4">Extracted Text</h2>
          <div
            className="whitespace-pre-line selectable-text"
            onMouseUp={() => {
              const selection = window.getSelection();
              setSelectedText(selection.toString());
            }}
          >
            {diagram.ocrText}
          </div>
        </div>

        {/* Selection Toolbar (Conditionally Rendered) */}
        {selectedText && (
          <div className="mt-4 bg-gray-700 rounded-lg shadow p-4">
            <h4 className="text-lg font-semibold mb-2">Selected Text:</h4>
            <p className="text-gray-300">{selectedText}</p>
            <div className="flex space-x-2 mt-2">
              <button className="bg-yellow-500 hover:bg-yellow-400 text-gray-900 font-bold py-2 px-4 rounded">
                Highlight
              </button>
              <button className="bg-blue-500 hover:bg-blue-400 text-white font-bold py-2 px-4 rounded">
                Annotate
              </button>
              {/* Add more annotation options later */}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// Add some basic styling to make the text selectable
// Create a global.css entry for this
// .selectable-text {
//   user-select: all; /* or 'text' for more fine-grained control */
// }
