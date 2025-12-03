'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { getFunctions, httpsCallable } from 'firebase/functions';
import { app } from '../../firebase';
import { useAuth } from '../../hooks/useAuth';
import Button from '../components/Button';

interface CheckoutSessionResponse {
  sessionId: string;
  url: string;
}

export default function PackagesPage() {
  const router = useRouter();
  const { user, loading: authLoading } = useAuth();
  const [loading, setLoading] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const handleSubscribe = async (planType: 'monthly' | 'yearly') => {
    if (!user) {
      router.push('/login');
      return;
    }

    setLoading(planType);
    setError(null);

    try {
      const functions = getFunctions(app);
      const createCheckoutSession = httpsCallable<{ planType: 'monthly' | 'yearly' }, CheckoutSessionResponse>(
        functions,
        'createCheckoutSession'
      );

      const result = await createCheckoutSession({ planType });
      const data = result.data;

      if (data && data.url) {
        window.location.href = data.url;
      } else {
        throw new Error('No checkout URL received');
      }
    } catch (err: any) {
      console.error('Error creating checkout session:', err);
      // Extract error message from Firebase callable function error
      const errorMessage = err?.details?.message || 
                          err?.message || 
                          err?.code || 
                          'Failed to create checkout session. Please try again.';
      setError(errorMessage);
      setLoading(null);
    }
  };

  if (authLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <svg className="animate-spin h-8 w-8 text-blue-500" viewBox="0 0 24 24">
          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none"/>
          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z"/>
        </svg>
      </div>
    );
  }

  if (!user) {
    router.push('/login');
    return null;
  }

  return (
    <div className="min-h-screen flex items-center justify-center relative overflow-hidden" style={{fontFamily: 'Poppins, sans-serif'}}>
      {/* Diagonal gradient background */}
      <div className="absolute inset-0 -z-10">
        <svg width="100%" height="100%" viewBox="0 0 100 100" preserveAspectRatio="none" className="w-full h-full">
          <polygon points="0,0 100,0 100,100" fill="#a18cd1" />
          <polygon points="0,0 0,100 100,100" fill="#f8fafc" />
        </svg>
      </div>

      <div className="w-full max-w-5xl px-4 py-12">
        <div className="text-center mb-12">
          <h1 className="text-4xl font-bold mb-4 text-gray-900">Choose Your Plan</h1>
          <p className="text-lg text-gray-600">Select the subscription plan that works best for you</p>
        </div>

        {error && (
          <div className="max-w-md mx-auto mb-6 p-4 bg-red-50 border border-red-200 rounded-lg text-red-700 text-center">
            {error}
          </div>
        )}

        <div className="grid md:grid-cols-2 gap-8 max-w-4xl mx-auto">
          {/* Monthly Plan */}
          <div className="bg-white rounded-3xl shadow-2xl p-8 flex flex-col" style={{boxShadow: '0 8px 32px 0 rgba(31, 38, 135, 0.15)'}}>
            <div className="flex-1">
              <h2 className="text-2xl font-bold mb-2 text-gray-900">Monthly Plan</h2>
              <div className="mb-6">
                <span className="text-4xl font-extrabold text-gray-900">$17</span>
                <span className="text-gray-600 ml-2">/month</span>
              </div>
              <ul className="space-y-3 mb-8">
                <li className="flex items-center text-gray-700">
                  <svg className="w-5 h-5 text-green-500 mr-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                  </svg>
                  Full access to all features
                </li>
                <li className="flex items-center text-gray-700">
                  <svg className="w-5 h-5 text-green-500 mr-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                  </svg>
                  Cancel anytime
                </li>
                <li className="flex items-center text-gray-700">
                  <svg className="w-5 h-5 text-green-500 mr-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                  </svg>
                  Priority support
                </li>
              </ul>
            </div>
            <Button
              onClick={() => handleSubscribe('monthly')}
              disabled={loading !== null}
              className="w-full"
            >
              {loading === 'monthly' ? (
                <span className="flex items-center justify-center">
                  <svg className="animate-spin h-5 w-5 mr-2 text-white" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none"/>
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z"/>
                  </svg>
                  Processing...
                </span>
              ) : (
                'Subscribe Monthly'
              )}
            </Button>
          </div>

          {/* Yearly Plan */}
          <div className="bg-gradient-to-br from-purple-400 to-blue-400 rounded-3xl shadow-2xl p-8 flex flex-col relative" style={{boxShadow: '0 8px 32px 0 rgba(31, 38, 135, 0.15)'}}>
            <div className="absolute top-4 right-4 bg-yellow-400 text-yellow-900 px-3 py-1 rounded-full text-sm font-bold">
              BEST VALUE
            </div>
            <div className="flex-1 text-white">
              <h2 className="text-2xl font-bold mb-2">Yearly Plan</h2>
              <div className="mb-2">
                <span className="text-4xl font-extrabold">$175</span>
                <span className="ml-2 opacity-90">/year</span>
              </div>
              <div className="text-sm mb-6 opacity-90">
                Save $29 per year (14% off)
              </div>
              <ul className="space-y-3 mb-8">
                <li className="flex items-center">
                  <svg className="w-5 h-5 text-white mr-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                  </svg>
                  Everything in Monthly
                </li>
                <li className="flex items-center">
                  <svg className="w-5 h-5 text-white mr-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                  </svg>
                  Save 14% annually
                </li>
                <li className="flex items-center">
                  <svg className="w-5 h-5 text-white mr-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                  </svg>
                  Best value for long-term
                </li>
              </ul>
            </div>
            <button
              onClick={() => handleSubscribe('yearly')}
              disabled={loading !== null}
              className="w-full px-6 py-3 bg-white text-purple-600 font-semibold rounded-xl shadow-lg hover:bg-gray-50 transition disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {loading === 'yearly' ? (
                <span className="flex items-center justify-center">
                  <svg className="animate-spin h-5 w-5 mr-2 text-purple-600" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none"/>
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z"/>
                  </svg>
                  Processing...
                </span>
              ) : (
                'Subscribe Yearly'
              )}
            </button>
          </div>
        </div>

        <div className="text-center mt-8">
          <a
            href="/login"
            className="inline-block text-base font-semibold bg-gradient-to-r from-purple-400 to-blue-400 bg-clip-text text-transparent relative transition-colors duration-200 group"
          >
            <span className="group-hover:underline group-hover:decoration-4 group-hover:underline-offset-4 transition-all duration-300">
              Already have an account? Login
            </span>
          </a>
        </div>
      </div>
    </div>
  );
}
