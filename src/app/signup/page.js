'use client'; // Required for state and event handlers

import React, { useState } from 'react';
import { useRouter } from 'next/navigation'; // Use next/navigation for App Router

export default function SignupPage() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [emailError, setEmailError] = useState('');
  const [passwordError, setPasswordError] = useState('');
  const [confirmPasswordError, setConfirmPasswordError] = useState('');
  const [generalError, setError] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const router = useRouter();

  const handleSubmit = async (e) => {
    e.preventDefault();
    setIsLoading(true);
    setError('');
    setEmailError('');
    setPasswordError('');
    setConfirmPasswordError('');

    // Basic validation
    if (password !== confirmPassword) {
      setError('Passwords do not match.');
      setIsLoading(false);
      return;
    }
    if (password.length < 6) { // Example minimum length
        setError('Password must be at least 6 characters long.');
        setIsLoading(false);
        return;
    }

    try {
      // --- Placeholder for API call ---
      console.log('Attempting signup for:', email);
      // Replace this with an actual API call to your backend registration endpoint
      const response = await fetch('/api/auth/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password, name: '' }), // Add name later
      });
      // const data = await response.json();

      setIsLoading(false);

      if (response.ok) {
        const data = await response.json();
        console.log('Signup successful');
        // Redirect to the URL provided in the response
        router.push(data.redirect || '/dashboard');
      } else {
        const errorData = await response.json();
        setError(errorData.message || 'Signup failed. Please try again.');
        console.error("Signup Error:", errorData.message);
      }
    } catch (err) {
      setIsLoading(false);
      setError('Signup failed. Please check your connection and try again.');
      console.error("Signup Exception:", err);
    }
  };


  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-900 text-white">
      <div className="bg-[#100926] p-8 rounded-lg shadow-lg w-full max-w-md border border-[#130830]">
        <h1 className="text-2xl font-bold mb-6 text-center">Create your Doclyze Account</h1>
        <form onSubmit={handleSubmit}>
          {generalError && <p className="mb-4 text-center text-red-500">{generalError}</p>}
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
            {emailError && <p className="text-red-500 text-sm mt-1">{emailError}</p>}
          </div>
          <div className="mb-4">
            <label htmlFor="password" className="block text-sm font-medium text-gray-300 mb-1">Password</label>
            <input
              type="password"
              id="password"
              name="password"
              required
              className="w-full px-3 py-2 bg-[#0c071a] border border-[#130830] rounded-md text-white focus:outline-none focus:ring-2 focus:ring-indigo-500 disabled:opacity-50"
              placeholder="********"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              disabled={isLoading}
            />
            {passwordError && <p className="text-red-500 text-sm mt-1">{passwordError}</p>}
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
            {confirmPasswordError && <p className="text-red-500 text-sm mt-1">{confirmPasswordError}</p>}
          </div>
          <button
            type="submit"
            className="w-full bg-[#130830] hover:bg-[#12082c] text-white font-bold py-2 px-4 rounded transition duration-300 disabled:opacity-50 disabled:cursor-not-allowed"
            disabled={isLoading}
          >
            {isLoading ? 'Signing up...' : 'Sign Up'}
          </button>
        </form>
         {/* Add third-party signup options later */}
        <div className="mt-6 text-center">
          <a href="/login" className="text-indigo-400 hover:text-indigo-300">
            Already have an account? Login
          </a>
        </div>
      </div>
    </div>
  );
}
