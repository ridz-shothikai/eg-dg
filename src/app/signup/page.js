'use client'; // Make the page component client-side for hooks

import React, { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useSession } from 'next-auth/react'; // Import useSession
import Link from 'next/link';
import LoadingSpinner from '@/components/LoadingSpinner'; // Import LoadingSpinner

export default function SignupPage() {
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [error, setError] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const router = useRouter();
  const { data: session, status } = useSession(); // Get session status

  useEffect(() => {
    // Redirect to dashboard if user is already authenticated
    if (status === 'authenticated') {
      router.push('/'); // Redirect to root (dashboard)
    }
  }, [status, router]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setIsLoading(true);
    setError('');

    if (password !== confirmPassword) {
      setError('Passwords do not match.');
      setIsLoading(false);
      return;
    }

    try {
      // Read guestId from localStorage
      const guestId = localStorage.getItem('guestId');
      const requestBody = { name, email, password };
      if (guestId) {
        requestBody.guestId = guestId;
        console.log('Sending guestId with registration:', guestId);
      }

      const response = await fetch('/api/auth/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(requestBody), // Send body with potential guestId
      });

      setIsLoading(false);

      if (!response.ok) {
        const data = await response.json();
        setError(data.message || 'Registration failed. Please try again.');
      } else {
        // Clear guestId from localStorage on successful registration
        if (guestId) {
          localStorage.removeItem('guestId');
          console.log('Cleared guestId from localStorage.');
        }
        // Redirect to login page with success message after successful registration
        router.push('/login?signup=success');
      }
    } catch (err) {
      setIsLoading(false);
      setError('Registration failed. Please check your connection and try again.');
      console.error("Signup Exception:", err);
    }
  };

  // Show loading while session status is being determined
  if (status === 'loading') {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-900">
        <LoadingSpinner text="Checking session..." />
      </div>
    );
  }

  // Only render signup form if not authenticated
  if (status === 'unauthenticated') {
    return (
      // Added flex-grow to make this div fill the space within the main layout's flex container
      <div className="min-h-screen flex flex-grow items-center justify-center bg-gray-900 text-white">
        <div className="bg-[#100926] p-8 rounded-lg shadow-lg w-full max-w-md border border-[#130830]">
          {/* Update Title */}
          <h1 className="text-2xl font-bold mb-6 text-center">Sign Up for Engineering Diagram Insights</h1>
          <form onSubmit={handleSubmit}>
            {error && <p className="mb-4 text-center text-red-500">{error}</p>}
            <div className="mb-4">
              <label htmlFor="name" className="block text-sm font-medium text-gray-300 mb-1">Name</label>
              <input
                type="text"
                id="name"
                name="name"
                required
                className="w-full px-3 py-2 bg-[#0c071a] border border-[#130830] rounded-md text-white focus:outline-none focus:ring-2 focus:ring-indigo-500 disabled:opacity-50"
                placeholder="Your Name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                disabled={isLoading}
              />
            </div>
            <div className="mb-4">
              <label htmlFor="email" className="block text-sm font-medium text-gray-300 mb-1">Email</label>
              <input
                type="email"
                id="email"
                name="email"
                required
                className="w-full px-3 py-2 bg-[#0c071a] border border-[#130830] rounded-md text-white focus:outline-none focus:ring-2 focus:ring-indigo-500 disabled:opacity-50"
                placeholder="you@example.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                disabled={isLoading}
              />
            </div>
            <div className="mb-4">
              <label htmlFor="password" className="block text-sm font-medium text-gray-300 mb-1">Password</label>
              <input
                type="password"
                id="password"
                name="password"
                required
                minLength="6" // Example: Enforce minimum password length
                className="w-full px-3 py-2 bg-[#0c071a] border border-[#130830] rounded-md text-white focus:outline-none focus:ring-2 focus:ring-indigo-500 disabled:opacity-50"
                placeholder="********"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                disabled={isLoading}
              />
            </div>
            <div className="mb-6">
              <label htmlFor="confirmPassword" className="block text-sm font-medium text-gray-300 mb-1">Confirm Password</label>
              <input
                type="password"
                id="confirmPassword"
                name="confirmPassword"
                required
                className="w-full px-3 py-2 bg-[#0c071a] border border-[#130830] rounded-md text-white focus:outline-none focus:ring-2 focus:ring-indigo-500 disabled:opacity-50"
                placeholder="********"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                disabled={isLoading}
              />
            </div>
            <button
              type="submit"
              className="w-full bg-[#130830] hover:bg-[#12082c] text-white font-bold py-2 px-4 rounded transition duration-300 disabled:opacity-50 disabled:cursor-not-allowed"
              disabled={isLoading}
            >
              {isLoading ? 'Signing Up...' : 'Sign Up'}
            </button>
          </form>
          <div className="mt-6 text-center">
            <Link href="/login" className="text-indigo-400 hover:text-indigo-300">
              Already have an account? Login
            </Link>
          </div>
        </div>
      </div>
    );
  }

  // Return null or a placeholder if authenticated (should be redirected anyway)
  return null;
}
