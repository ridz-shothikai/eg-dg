import React from 'react';

const StatusProgressBar = ({ progress = 0 }) => {
  const safeProgress = Math.max(0, Math.min(100, progress)); // Ensure 0-100

  return (
    <div className="w-full bg-gray-600 rounded-full h-2 overflow-hidden">
      <div
        className="bg-blue-500 h-2 rounded-full transition-all duration-300 ease-out"
        style={{ width: `${safeProgress}%` }}
      ></div>
    </div>
  );
};

export default StatusProgressBar;
