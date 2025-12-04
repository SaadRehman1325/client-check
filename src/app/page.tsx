'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '../hooks/useAuth';

export default function Home() {
  const router = useRouter();
  const { user, loading } = useAuth();

  useEffect(() => {
    if (!loading) {
      if (user) {
        // User is logged in, redirect to home page
        router.replace('/home');
      } else {
        // User is not logged in, redirect to login
        router.replace('/login');
      }
    }
  }, [user, loading, router]);

  // Show loading state while checking auth
  return (
    <div className="min-h-screen flex items-center justify-center">
      <svg className="animate-spin h-8 w-8 text-blue-500" viewBox="0 0 24 24">
        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none"/>
        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z"/>
      </svg>
    </div>
  );
}
