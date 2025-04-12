import React from 'react';

// Added size prop with default 'md'
export default function LoadingSpinner({ text = "Loading...", size = 'md', styles = {} }) {
  // Define size classes
  const sizeClasses = {
    ssm: { svg: 'w-2 h-2', text: 'text-xs' },
    sm: { svg: 'w-6 h-6', text: 'text-xs' },
    md: { svg: 'w-10 h-10', text: 'text-sm' }, // Default size, slightly smaller than original
    lg: { svg: 'w-12 h-12', text: 'text-base' } // Original size was 50px, this is close
  };

  const currentSize = sizeClasses[size] || sizeClasses.md; // Fallback to medium

  return (
    <div styles={styles} className="flex flex-col items-center justify-center space-y-2">
      {/* Apply dynamic size class to SVG */}
      <svg styles={styles} className={`architect-spinner ${currentSize.svg}`} viewBox="25 25 50 50">
        <circle
          className="architect-spinner-path"
          cx="50"
          cy="50"
          r="20"
          fill="none"
          strokeWidth="4" // Stroke width can remain constant or be adjusted too
          strokeMiterlimit="10"
        />
      </svg>
      {/* Apply dynamic text size and handle null text */}
      {text && <p className={`text-white ${currentSize.text}`}>{text}</p>}
    </div>
  );
}
