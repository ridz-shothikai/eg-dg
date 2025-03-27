'use client'; // This component uses client-side hooks

import React, { useState, useEffect } from 'react';
import { signIn } from 'next-auth/react';
import { useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';

export default function LoginForm() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [emailError, setEmailError] = useState('');
  const [passwordError, setPasswordError] = useState('');
  const [generalError, setError] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const router = useRouter();
  const searchParams = useSearchParams(); // This hook requires Suspense boundary
  const [signupSuccess, setSignupSuccess] = useState(false);

  useEffect(() => {
    // Check for signup success message from query params
    const signup = searchParams.get('signup');
    if (signup === 'success') {
      setSignupSuccess(true);
    }
  }, [searchParams]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setIsLoading(true);
    setError('');
    setEmailError('');
    setPasswordError('');

    // --- Client-side validation ---
    let isValid = true;
    if (!email) {
      setEmailError('Email is required.');
      isValid = false;
    } else if (!/.+\@.+\..+/.test(email)) {
      setEmailError('Please enter a valid email address.');
      isValid = false;
    }
    if (!password) {
      setPasswordError('Password is required.');
      isValid = false;
    }
    if (!isValid) {
      setIsLoading(false);
      return;
    }

    try {
      const result = await signIn('credentials', {
        redirect: false,
        email: email,
        password: password,
      });
      setIsLoading(false);
      if (result?.error) {
        setError(result.error === 'CredentialsSignin' ? 'Invalid email or password' : 'Login failed. Please try again.');
        console.error("Login Error:", result.error);
      } else if (result?.ok) {
        router.push('/'); // Redirect to root on success
      } else {
         setError('An unexpected error occurred during login.');
      }
    } catch (err) {
      setIsLoading(false);
      setError('Login failed. Please check your connection and try again.');
      console.error("Login Exception:", err);
    }
  };

  return (
    <div className="bg-[#100926] p-8 rounded-lg shadow-lg w-full max-w-md border border-[#130830]">
      <h1 className="text-2xl font-bold mb-6 text-center">Login to Doclyze</h1>
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
        <div className="mb-6">
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
        <button
          type="submit"
          className="w-full bg-[#130830] hover:bg-[#12082c] text-white font-bold py-2 px-4 rounded transition duration-300 disabled:opacity-50 disabled:cursor-not-allowed"
          disabled={isLoading}
        >
          {isLoading ? 'Logging in...' : 'Login'}
        </button>
      </form>
      {signupSuccess && (
        <div className="mt-4 text-center text-green-500">
          Signup successful! Please login with your new credentials.
        </div>
      )}
      <div className="mt-6 text-center">
        {/* Replaced Link with plain text */}
        <p className="text-sm text-gray-400">
          {/* eslint-disable-next-line react/no-unescaped-entities */}
          Don't have an account? Contact with us
        </p>
      </div>
    </div>
  );
}
