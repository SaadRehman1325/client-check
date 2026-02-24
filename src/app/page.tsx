'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import Image from 'next/image';
import { useAuth } from '../hooks/useAuth';

export default function WelcomePage() {
  const router = useRouter();
  const { user, loading } = useAuth();

  useEffect(() => {
    if (!loading && user) {
      router.replace('/home');
    }
  }, [user, loading, router]);

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center" style={{ background: '#faf9f7' }}>
        <svg className="animate-spin h-8 w-8 text-purple-500" viewBox="0 0 24 24">
          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z" />
        </svg>
      </div>
    );
  }

  if (user) return null;

  return (
    <div className="min-h-screen flex flex-col" style={{ fontFamily: 'Poppins, sans-serif', background: 'linear-gradient(135deg, #e0e7ff 0%, #ede9fe 30%, #dbeafe 60%, #e0e7ff 100%)' }}>

      {/* ── Navbar ── */}
      <nav className="flex items-center justify-between px-6 sm:px-12 py-5 max-w-[1320px] w-full mx-auto">
        <Link href="/" className="flex items-center gap-2.5">
          <Image src="/logo.png" alt="Client Check" width={100} height={100} className="h-20 w-20 flex-shrink-0 object-contain" />
        </Link>
        <div className="flex items-center gap-3">
          <Link
            href="/login"
            className="text-[14px] font-medium text-gray-600 hover:text-gray-900 transition-colors px-4 py-2"
          >
            Log in
          </Link>
          <Link
            href="/signup"
            className="text-[14px] font-medium text-white transition-colors px-5 py-2.5 rounded-xl shadow-lg shadow-purple-300/30 hover:shadow-xl hover:shadow-purple-300/40"
            style={{ background: 'linear-gradient(135deg, #818cf8 0%, #a78bfa 50%, #c084fc 100%)' }}
          >
            Get started
          </Link>
        </div>
      </nav>

      {/* ── Hero — centered, single column ── */}
      <main className="flex-1 flex items-center justify-center">
        <div className="w-full max-w-[820px] mx-auto px-6 sm:px-2 py-2 sm:py-2 text-center">

          {/* Badge */}
          <div className="inline-flex items-center gap-2 bg-indigo-50 border border-indigo-100 rounded-full px-4 py-1.5 mb-8">
            <span className="w-2 h-2 rounded-full bg-indigo-500" />
            <span className="text-[13px] font-medium text-indigo-700">
              Your all-in-one location dashboard
            </span>
          </div>

          {/* Headline */}
          <h1 className="text-[2.5rem] sm:text-[3.4rem] lg:text-[4rem] font-bold leading-[1.08] tracking-tight text-gray-900 mb-6">
            A vetting system that{' '}
            <br className="hidden sm:block" />
            works like a{' '}
            <span className="bg-gradient-to-r from-indigo-600 to-purple-500 bg-clip-text text-transparent px-1 py-0.5 rounded-xl" style={{ backgroundColor: 'rgba(129,140,248,0.15)' }}>
              Foreman
            </span>
          </h1>

          {/* Subtext */}
          <p className="text-[15px] sm:text-[17px] text-gray-500 leading-relaxed max-w-[600px] mx-auto mb-5   ">
          The all-in-one tool to check client history before you even load the truck. Built for contractors who value their time.
          </p>

          {/* Feature bullets */}
          <div className="flex flex-wrap justify-center gap-x-6 gap-y-1 mb-10">
            {['Multiple locations', 'Up to date data', '24/7 support'].map((text) => (
              <span key={text} className="flex items-center gap-2 text-[14px] text-gray-500 font-medium">
                <svg className="w-4 h-4 text-indigo-500 flex-shrink-0" fill="currentColor" viewBox="0 0 20 20">
                  <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                </svg>
                {text}
              </span>
            ))}
          </div>

          {/* CTAs */}
          <div className="flex flex-col sm:flex-row gap-3 justify-center items-center">
            <Link href="/signup">
              <button className="inline-flex items-center gap-2 text-white font-semibold text-[15px] px-7 py-4 rounded-2xl transition-all shadow-lg shadow-purple-300/30 hover:shadow-xl hover:shadow-purple-300/40 cursor-pointer" style={{ background: 'linear-gradient(135deg, #818cf8 0%, #a78bfa 50%, #c084fc 100%)' }}>
                <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth={2.5} viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M9.813 15.904L9 18.75l-.813-2.846a4.5 4.5 0 00-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 003.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 003.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 00-3.09 3.09z" />
                </svg>
                Start your free trial
              </button>
            </Link>
            <Link href="/login">
              <button className="inline-flex items-center gap-2 bg-white hover:bg-gray-50 text-gray-700 font-semibold text-[15px] px-7 py-4 rounded-2xl transition-all shadow-sm border border-gray-200 cursor-pointer">
                <svg className="w-4 h-4 text-gray-400" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 9V5.25A2.25 2.25 0 0013.5 3h-6a2.25 2.25 0 00-2.25 2.25v13.5A2.25 2.25 0 007.5 21h6a2.25 2.25 0 002.25-2.25V15m3 0l3-3m0 0l-3-3m3 3H9" />
                </svg>
                Log in
              </button>
            </Link>
          </div>

          <p className="mt-5 text-[13px] text-gray-400 font-medium">
            No credit card required
          </p>
        </div>
      </main>

      {/* ── Footer ── */}
      <footer className="px-6 sm:px-12 py-5 max-w-[1320px] w-full mx-auto">
        <div className="border-t border-gray-200/60 pt-5 flex flex-col sm:flex-row items-center justify-between gap-3">
          <span className="text-[13px] text-gray-400">
            &copy; {new Date().getFullYear()} Client Check. All rights reserved.
          </span>
          <div className="flex items-center gap-5">
            <Link href="/login" className="text-[13px] text-gray-400 hover:text-gray-600 transition-colors">Log in</Link>
            <Link href="/signup" className="text-[13px] text-gray-400 hover:text-gray-600 transition-colors">Sign up</Link>
          </div>
        </div>
      </footer>
    </div>
  );
}
