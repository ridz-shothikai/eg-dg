'use client';

import React, { useEffect } from 'react'; // Import useEffect here
import { useSession } from 'next-auth/react';
import { useRouter } from 'next/navigation';
import * as constants from '@/constants';

const { MONGODB_URI } = constants;

export default function AdminPage() {
  const { data: session, status } = useSession();
  const router = useRouter();

  useEffect(() => {
    if (status === 'loading') return;

    if (status === 'unauthenticated') {
      router.push('/login');
    }
    // Add admin role check later
    // if (session?.user?.role !== 'admin') {
    //   router.push('/dashboard'); // Redirect non-admins
    // }
  }, [session, status, router]);

  return status === 'authenticated' ? (
    <div className="min-h-screen bg-gray-900 text-white p-8">
      <div className="max-w-4xl mx-auto">
        <h1 className="text-3xl font-bold mb-6 text-center">Admin Panel</h1>

        <div className="bg-gray-800 rounded-lg shadow p-6 mb-4">
          <h2 className="text-xl font-semibold mb-4">User Management</h2>
          <p className="text-gray-400">Manage user roles and permissions.</p>
        </div>

        <div className="bg-gray-800 rounded-lg shadow p-6 mb-4">
          <h2 className="text-xl font-semibold mb-4">API Configuration</h2>
          <p className="text-gray-400">Configure integration APIs (Drive, Jira).</p>
        </div>

        <div className="bg-gray-800 rounded-lg shadow p-6">
          <h2 className="text-xl font-semibold mb-4">Defaults and Compliance</h2>
          <p className="text-gray-400">Toggle defaults for standards and region compliance.</p>
        </div>
      </div>
    </div>
  ) : (
    <div className="min-h-screen flex items-center justify-center bg-gray-900 text-white">Loading...</div>
  );
}
