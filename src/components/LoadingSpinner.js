import React from 'react';

export default function LoadingSpinner({ text = "Loading text" }) {
  return (
    <div className="flex flex-col items-center justify-center space-y-2">
      <svg className="architect-spinner" viewBox="25 25 50 50">
        <circle
          className="architect-spinner-path"
          cx="50"
          cy="50"
          r="20"
          fill="none"
          strokeWidth="4"
          strokeMiterlimit="10"
        />
      </svg>
      <p className="text-white">{text}</p>
    </div>
  );
}
