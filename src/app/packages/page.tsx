'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import Image from 'next/image';
import { getFunctions, httpsCallable } from 'firebase/functions';
import { signOut } from 'firebase/auth';
import { app, auth } from '../../firebase';
import { useAuth } from '../../hooks/useAuth';
import { clearUserData } from '../../hooks/useUserData';
import { useSubscription } from '../../hooks/useSubscription';

interface CheckoutSessionResponse { sessionId: string; url: string; }
interface StartFreeTrialResponse { success: boolean; trialEndsAt: string; message: string; }
interface RedeemCouponResponse { success: boolean; message: string; }

const FEATURES_TRIAL = ['Full access for 7 days', 'No credit card needed', 'Upgrade anytime'];
const FEATURES_MONTHLY = ['All location features', 'Cancel anytime', 'Priority support'];
const FEATURES_YEARLY = ['Everything in Monthly', 'Save $29 per year', 'Best for long-term'];

export default function PackagesPage() {
  const router = useRouter();
  const { user, loading: authLoading } = useAuth();
  const { subscription, loading: subLoading } = useSubscription();
  const [loading, setLoading] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [logoutLoading, setLogoutLoading] = useState(false);
  const [couponCode, setCouponCode] = useState('');
  const [redeemLoading, setRedeemLoading] = useState(false);
  const [couponError, setCouponError] = useState<string | null>(null);

  const handleLogout = async () => {
    setLogoutLoading(true);
    try {
      clearUserData();
      await signOut(auth);
      router.replace('/');
    } catch {
      setLogoutLoading(false);
    }
  };

  const trialEnded =
    subscription?.status === 'trialing' &&
    subscription?.currentPeriodEnd?.seconds != null &&
    new Date(subscription.currentPeriodEnd.seconds * 1000) < new Date();

  const showFreeTrial = !trialEnded;

  const handleStartFreeTrial = async () => {
    if (!user) { router.push('/'); return; }
    setLoading('trial');
    setError(null);
    try {
      const functions = getFunctions(app);
      const startFreeTrial = httpsCallable<unknown, StartFreeTrialResponse>(functions, 'startFreeTrial');
      await startFreeTrial({});
      router.replace('/home');
    } catch (err: any) {
      setError(err?.details?.message || err?.message || err?.code || 'Failed to start free trial.');
      setLoading(null);
    }
  };

  const handleSubscribe = async (planType: 'monthly' | 'yearly') => {
    if (!user) { router.push('/'); return; }
    setLoading(planType);
    setError(null);
    try {
      const functions = getFunctions(app);
      const createCheckoutSession = httpsCallable<{ planType: 'monthly' | 'yearly' }, CheckoutSessionResponse>(functions, 'createCheckoutSession');
      const result = await createCheckoutSession({ planType });
      if (result.data?.url) {
        window.location.href = result.data.url;
      } else {
        throw new Error('No checkout URL received');
      }
    } catch (err: any) {
      setError(err?.details?.message || err?.message || err?.code || 'Failed to create checkout session.');
      setLoading(null);
    }
  };

  const handleRedeemCoupon = async () => {
    if (!user) return;
    const trimmed = couponCode.trim();
    if (!trimmed) {
      setCouponError('Please enter a coupon code.');
      return;
    }
    setCouponError(null);
    setRedeemLoading(true);
    try {
      const functions = getFunctions(app);
      const redeemCouponFn = httpsCallable<{ code: string }, RedeemCouponResponse>(functions, 'redeemCoupon');
      await redeemCouponFn({ code: trimmed });
      clearUserData();
      router.replace('/home');
    } catch (err: any) {
      setCouponError(err?.details?.message || err?.message || err?.code || 'Failed to redeem coupon.');
    } finally {
      setRedeemLoading(false);
    }
  };

  const CheckIcon = ({ className = 'text-indigo-400' }: { className?: string }) => (
    <svg className={`w-4 h-4 flex-shrink-0 ${className}`} fill="none" stroke="currentColor" strokeWidth={2.5} viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" />
    </svg>
  );

  const Spinner = ({ className = 'text-white' }: { className?: string }) => (
    <svg className={`animate-spin h-5 w-5 ${className}`} viewBox="0 0 24 24">
      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z" />
    </svg>
  );

  if (authLoading || subLoading) {
    return (
      <div
        className="min-h-screen flex items-center justify-center"
        style={{ fontFamily: 'Poppins, sans-serif', background: 'linear-gradient(135deg, #e0e7ff 0%, #ede9fe 30%, #dbeafe 60%, #e0e7ff 100%)' }}
      >
        <div className="flex flex-col items-center gap-4">
          <Spinner className="text-indigo-500" />
          <p className="text-[15px] text-gray-600 font-medium">Checking your plan...</p>
        </div>
      </div>
    );
  }

  if (!user) { router.push('/'); return null; }

  return (
    <div
      className="min-h-screen flex flex-col relative overflow-hidden"
      style={{
        fontFamily: 'Poppins, sans-serif',
        background: 'linear-gradient(135deg, #e0e7ff 0%, #ede9fe 30%, #dbeafe 60%, #e0e7ff 100%)',
      }}
    >
      {/* Back link */}
      <div className="absolute top-5 left-6 sm:left-12 z-10">
        <Link href="/" className="flex items-center gap-1.5 text-[13px] font-medium text-gray-500 hover:text-gray-700 transition-colors">
          <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 19.5L8.25 12l7.5-7.5" />
          </svg>
          Home page
        </Link>
      </div>

      {/* Logout — top right */}
      <div className="absolute top-5 right-6 sm:right-12 z-10">
        <button
          type="button"
          onClick={handleLogout}
          disabled={logoutLoading}
          className="flex items-center gap-1.5 text-[13px] font-medium text-gray-500 hover:text-gray-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer"
        >
          {logoutLoading ? (
            <svg className="animate-spin h-4 w-4 text-gray-500" viewBox="0 0 24 24">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z" />
            </svg>
          ) : (
            <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 9V5.25A2.25 2.25 0 0013.5 3h-6a2.25 2.25 0 00-2.25 2.25v13.5A2.25 2.25 0 007.5 21h6a2.25 2.25 0 002.25-2.25V15m3 0l3-3m0 0l-3-3m3 3H9" />
            </svg>
          )}
          Log out
        </button>
      </div>

      {/* Content */}
      <main className="flex-1 flex flex-col items-center justify-center px-6 py-12">

        {/* Logo */}
        <div className="mb-0">
          <Image src="/logo.png" alt="Client Check" width={66} height={66} className="h-25 w-25 object-contain" />
        </div>

        {/* Header */}
        <div className="text-center mb-8">
          <h1 className="text-[1.6rem] font-bold tracking-tight text-gray-900 mb-1.5">
            {trialEnded ? 'Your trial has ended' : 'Choose your plan'}
          </h1>
          <p className="text-[14px] text-gray-400">
            {trialEnded
              ? 'Pick a plan below to continue using Client Check.'
              : 'Start free, upgrade when you\'re ready. No surprises.'}
          </p>
        </div>

        {/* Error */}
        {error && (
          <p className="text-red-500 text-[13px] text-center bg-red-50/80 border border-red-100 rounded-xl px-4 py-2.5 mb-6 max-w-md mx-auto">
            {error}
          </p>
        )}

        {/* Horizontal plan cards */}
        <div className={`grid gap-5 w-full ${showFreeTrial ? 'max-w-[920px] lg:grid-cols-3' : 'max-w-[620px] lg:grid-cols-2'} grid-cols-1 mx-auto`}>

          {/* Free Trial */}
          {showFreeTrial && (
            <div className="bg-white rounded-3xl shadow-xl shadow-indigo-200/40 p-7 flex flex-col border border-indigo-100 hover:border-indigo-300 transition-colors">
              <div className="flex-1">
                <p className="text-[13px] font-semibold text-indigo-500 uppercase tracking-wide mb-4">Free Trial</p>
                <div className="flex items-baseline gap-1 mb-1">
                  <span className="text-[2.2rem] font-bold text-gray-900 leading-none">$0</span>
                </div>
                <p className="text-[12px] text-gray-400 mb-6">7 days, no card required</p>

                <div className="space-y-3 mb-8">
                  {FEATURES_TRIAL.map((t) => (
                    <div key={t} className="flex items-center gap-2.5 text-[13px] text-gray-600">
                      <CheckIcon />
                      {t}
                    </div>
                  ))}
                </div>
              </div>

              <button
                onClick={handleStartFreeTrial}
                disabled={loading !== null}
                className="w-full inline-flex items-center justify-center gap-2 text-white font-semibold text-[14px] py-3 rounded-xl transition-all shadow-lg shadow-purple-300/30 cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
                style={{ background: 'linear-gradient(135deg, #818cf8 0%, #a78bfa 50%, #c084fc 100%)' }}
              >
                {loading === 'trial' ? <><Spinner /> Starting...</> : 'Start free trial'}
              </button>
            </div>
          )}

          {/* Monthly */}
          <div className="bg-white rounded-3xl shadow-xl shadow-indigo-200/40 p-7 flex flex-col border border-gray-100 hover:border-indigo-200 transition-colors">
            <div className="flex-1">
              <p className="text-[13px] font-semibold text-gray-400 uppercase tracking-wide mb-4">Monthly</p>
              <div className="flex items-baseline gap-1 mb-1">
                <span className="text-[2.2rem] font-bold text-gray-900 leading-none">$17</span>
                <span className="text-[14px] text-gray-400 font-medium">/mo</span>
              </div>
              <p className="text-[12px] text-gray-400 mb-6">Billed monthly, cancel anytime</p>

              <div className="space-y-3 mb-8">
                {FEATURES_MONTHLY.map((t) => (
                  <div key={t} className="flex items-center gap-2.5 text-[13px] text-gray-600">
                    <CheckIcon />
                    {t}
                  </div>
                ))}
              </div>
            </div>

            <button
              onClick={() => handleSubscribe('monthly')}
              disabled={loading !== null}
              className="w-full inline-flex items-center justify-center gap-2 bg-white hover:bg-gray-50 text-gray-700 font-semibold text-[14px] py-3 rounded-xl transition-all border border-gray-200 shadow-sm hover:shadow-md cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {loading === 'monthly' ? <><Spinner className="text-gray-700" /> Redirecting...</> : 'Subscribe monthly'}
            </button>
          </div>

          {/* Yearly — best value */}
          <div className="bg-white rounded-3xl shadow-xl shadow-indigo-200/40 p-7 flex flex-col border border-indigo-100 hover:border-indigo-300 transition-colors relative">
            <span className="absolute -top-2.5 right-5 text-[10px] font-bold uppercase tracking-wider bg-indigo-500 text-white px-3 py-0.5 rounded-full">
              Best value
            </span>

            <div className="flex-1">
              <p className="text-[13px] font-semibold text-indigo-500 uppercase tracking-wide mb-4">Yearly</p>
              <div className="flex items-baseline gap-1 mb-1">
                <span className="text-[2.2rem] font-bold text-gray-900 leading-none">$175</span>
                <span className="text-[14px] text-gray-400 font-medium">/yr</span>
              </div>
              <p className="text-[12px] text-gray-400 mb-6">Save $29/year — 14% off</p>

              <div className="space-y-3 mb-8">
                {FEATURES_YEARLY.map((t) => (
                  <div key={t} className="flex items-center gap-2.5 text-[13px] text-gray-600">
                    <CheckIcon />
                    {t}
                  </div>
                ))}
              </div>
            </div>

            <button
              onClick={() => handleSubscribe('yearly')}
              disabled={loading !== null}
              className="w-full inline-flex items-center justify-center gap-2 text-white font-semibold text-[14px] py-3 rounded-xl transition-all shadow-lg shadow-purple-300/30 cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
              style={{ background: 'linear-gradient(135deg, #818cf8 0%, #a78bfa 50%, #c084fc 100%)' }}
            >
              {loading === 'yearly' ? <><Spinner /> Redirecting...</> : 'Subscribe yearly'}
            </button>
          </div>
        </div>

        <p className="mt-6 text-center text-[12px] text-gray-400">
          No contracts. Cancel anytime.
        </p>

        {/* Free coupon redemption */}
        <div className="mt-2 w-full max-w-md mx-auto">
          <hr className="border-slate-300 my-4" />   
          <p className="text-center text-[14px] text-slate-500 mb-3 font-normal">Have a free coupon?</p>
          <div className="flex flex-col sm:flex-row gap-2">
            <input
              type="text"
              value={couponCode}
              onChange={(e) => { setCouponCode(e.target.value); setCouponError(null); }}
              onKeyDown={(e) => e.key === 'Enter' && handleRedeemCoupon()}
              placeholder="Enter coupon code"
              className="flex-1 px-4 py-2.5 rounded-xl border border-gray-200 bg-white text-[14px] text-gray-800 placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-indigo-300 focus:border-indigo-400"
              disabled={redeemLoading}
            />
            <button
              type="button"
              onClick={handleRedeemCoupon}
              disabled={redeemLoading}
              className="inline-flex items-center justify-center gap-2 text-white font-semibold text-[14px] py-3 px-5 rounded-xl transition-all shadow-lg shadow-purple-300/30 cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
              style={{ background: 'linear-gradient(135deg, #818cf8 0%, #a78bfa 50%, #c084fc 100%)' }}
             >
              {redeemLoading ? (
                <>
                  <Spinner className="text-white" />
                  Redeeming...
                </>
              ) : (
                'Redeem'
              )}
            </button>
          </div>
          {couponError && (
            <p className="mt-2 text-center text-red-500 text-[12px]">{couponError}</p>
          )}
        </div>
      </main>
    </div>
  );
}
