'use client';

import React, { useState, useEffect } from 'react';
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

export default function KnowledgeHubPage() {
  const [searchTerm, setSearchTerm] = useState('');
  const [searchResults, setSearchResults] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  useEffect(() => {
    async function fetchSearchResults() {
      try {
        setLoading(true);
        setError(null);

        await connectMongoDB();

        // Basic search - improve with NLP and vector search later
        const results = await Diagram.find({
          ocrText: { $regex: searchTerm, $options: 'i' } // Case-insensitive search
        });

        setSearchResults(results);
        setLoading(false);
      } catch (err) {
        console.error('Error fetching search results:', err);
        setError('Failed to fetch search results');
        setLoading(false);
      }
    }

    if (searchTerm) {
      fetchSearchResults();
    } else {
      setSearchResults([]); // Clear results when search term is empty
    }
  }, [searchTerm]);

  return (
    <div className="min-h-screen bg-gray-900 text-white p-8">
      <div className="max-w-4xl mx-auto">
        <h1 className="text-3xl font-bold mb-6 text-center">Project Knowledge Hub</h1>

        <div className="mb-4">
          <input
            type="text"
            placeholder="Search for diagrams and insights..."
            className="w-full px-4 py-2 bg-gray-800 border border-gray-700 rounded-md text-white focus:outline-none focus:ring-2 focus:ring-indigo-500"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
          />
        </div>

        {loading && <div className="text-center">Loading...</div>}
        {error && <div className="text-center text-red-500">Error: {error}</div>}

        {searchResults.length > 0 ? (
          <div className="bg-gray-800 rounded-lg shadow p-6">
            <h2 className="text-xl font-semibold mb-4">Search Results</h2>
            <ul className="space-y-4">
              {searchResults.map((diagram) => (
                <li key={diagram._id} className="border-b border-gray-700 pb-4">
                  <h3 className="text-lg font-semibold">{diagram.fileName}</h3>
                  <p className="text-gray-400">Storage Path: {diagram.storagePath}</p>
                  {/* Add links to OCR result and BoM pages later */}
                </li>
              ))}
            </ul>
          </div>
        ) : (
          searchTerm && !loading && <div className="text-center text-gray-500">No results found.</div>
        )}
      </div>
    </div>
  );
}
