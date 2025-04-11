'use client';

import React from 'react';

// Add currentStepTextOverride prop
const MultiStepProgressBar = ({ steps = [], currentStepIndex = 0, currentStepTextOverride = '' }) => {
  if (!steps || steps.length === 0) {
    return null;
  }

  const totalSteps = steps.length;
  // Calculate progress percentage based on *completed* steps
  // If currentStepIndex is 0, progress is 0. If 1, one step is done, etc.
  // Progress should reach 100% when the *last* step is active (index = totalSteps - 1)
  // or slightly before if we consider the last step completion.
  // Let's make it so that when the last step is active, the bar is full.
  const progressPercentage = totalSteps <= 1 ? 100 : Math.max(0, Math.min(100, (currentStepIndex / (totalSteps - 1)) * 100));

  return (
    <div className="w-full px-4 py-2">
      {/* Current Step Text - Use override if provided, otherwise use step name */}
      <p className="text-center text-sm text-blue-400 mb-2 truncate" title={currentStepTextOverride || (steps[currentStepIndex] ? `${steps[currentStepIndex]}...` : 'Processing...')}>
        {currentStepTextOverride || (steps[currentStepIndex] ? `${steps[currentStepIndex]}...` : 'Processing...')}
      </p>

      {/* Progress Bar */}
      <div className="relative pt-1">
        <div className="overflow-hidden h-2 mb-4 text-xs flex rounded bg-gray-600">
          <div
            style={{ width: `${progressPercentage}%` }}
            className="shadow-none flex flex-col text-center whitespace-nowrap text-white justify-center bg-blue-500 transition-all duration-500 ease-out"
          ></div>
        </div>
      </div>

      {/* Step Labels */}
      <div className="flex justify-between text-xs text-gray-400">
        {steps.map((step, index) => (
          <span
            key={index}
            className={`
              text-center flex-1 px-1
              ${index < currentStepIndex ? 'text-blue-400 font-medium' : ''} // Completed steps
              ${index === currentStepIndex ? 'text-blue-300 font-bold' : ''} // Current step
              ${index > currentStepIndex ? 'text-gray-500' : ''} // Future steps
            `}
            // Add min-width or adjust flex basis if text wrapping is an issue
            style={{ minWidth: '60px' }} // Example min-width
          >
            {step}
          </span>
        ))}
      </div>
    </div>
  );
};

export default MultiStepProgressBar;
