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

export default function CompliancePage() {
  const { diagramId } = useParams();
  const [diagram, setDiagram] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

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
    return <div className="min-h-screen flex items-center justify-center bg-gray-900 text-white">Loading Compliance Check Results...</div>;
  }

  if (error) {
    return <div className="min-h-screen flex items-center justify-center bg-gray-900 text-white">Error: {error}</div>;
  }

  if (!diagram) {
    return <div className="min-h-screen flex items-center justify-center bg-gray-900 text-white">Diagram not found.</div>;
  }

  const complianceResults = diagram.complianceResults;

  return (
    <div className="min-h-screen bg-gray-900 text-white p-8">
      <div className="max-w-4xl mx-auto">
        <h1 className="text-3xl font-bold mb-6 text-center">Compliance Check Results</h1>
        <div className="bg-gray-800 rounded-lg shadow p-6">
          <h2 className="text-xl font-semibold mb-4">Compliance with IBC 2021</h2>
          {complianceResults && complianceResults.length > 0 ? (
            <table className="w-full">
              <thead className="text-gray-400">
                <tr>
                  <th className="text-left">Item Name</th>
                  <th className="text-left">Standard</th>
                  <th className="text-left">Compliant</th>
                  <th className="text-left">Recommendation</th>
                </tr>
              </thead>
              <tbody>
                {complianceResults.map((result, index) => (
                  <tr key={index} className="border-b border-gray-700">
                    <td>{result.item_name}</td>
                    <td>{result.standard}</td>
                    <td>{result.compliant ? 'Yes' : 'No'}</td>
                    <td>{result.recommendation}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : (
            <p className="text-gray-500">No compliance data available for this diagram.</p>
          )}
        </div>
      </div>
    </div>
  );
}
