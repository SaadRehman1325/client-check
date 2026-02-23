'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import { FiEye, FiEyeOff } from 'react-icons/fi';
import { signInWithEmailAndPassword } from "firebase/auth";
import { getFirestore, doc, getDoc } from "firebase/firestore";
import { app, auth } from '../../firebase';
import { clearUserData } from '../../hooks/useUserData';

function validateEmail(email: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

export default function LoginPage() {
  const router = useRouter();
  const [formData, setFormData] = useState({ email: '', password: '' });
  const [errors, setErrors] = useState<{ email?: string; password?: string }>({});
  const [firebaseError, setFirebaseError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setFirebaseError(null);
    const newErrors: { email?: string; password?: string } = {};
    if (!formData.email) newErrors.email = 'Email is required.';
    else if (!validateEmail(formData.email)) newErrors.email = 'Please enter a valid email address.';
    if (!formData.password) newErrors.password = 'Password is required.';
    setErrors(newErrors);
    if (Object.keys(newErrors).length === 0) {
      setLoading(true);
      try {
        const userCredential = await signInWithEmailAndPassword(auth, formData.email, formData.password);
        clearUserData();
        const db = getFirestore(app);
        const userRef = doc(db, 'users', userCredential.user.uid);
        const userDoc = await getDoc(userRef);
        const userData = userDoc.exists() ? userDoc.data() : null;
        if (userData) {
          const toStore = { ...userData, userId: userCredential.user.uid };
          localStorage.setItem('user_data', JSON.stringify(toStore));
          localStorage.setItem('clientcheck_user_data', JSON.stringify(toStore));
        }
        // Admins go to home regardless of subscription
        if (userData?.userType === 'admin') {
          setTimeout(() => router.replace('/home'), 100);
          return;
        }
        const subscriptionRef = doc(db, 'subscriptions', userCredential.user.uid);
        const subscriptionDoc = await getDoc(subscriptionRef);
        const subData = subscriptionDoc.exists() ? subscriptionDoc.data() : null;
        const hasActiveSubscription = !!subData && (subData.status === 'active' || subData.status === 'trialing');
        if (hasActiveSubscription) {
          setTimeout(() => router.replace('/home'), 100);
        } else {
          setTimeout(() => router.replace('/packages'), 100);
        }
      } catch (error: any) {
        setFirebaseError(error.message || "Login failed");
        setLoading(false);
      }
    }
  };

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { name, value } = e.target;
    setFormData(prev => ({ ...prev, [name]: value }));
    setErrors(prev => ({ ...prev, [name]: undefined }));
    setFirebaseError(null);
  };

  return (
    <div
      className="min-h-screen flex flex-col relative overflow-hidden"
      style={{
        fontFamily: 'Poppins, sans-serif',
        background: 'linear-gradient(135deg, #e0e7ff 0%, #ede9fe 30%, #dbeafe 60%, #e0e7ff 100%)',
      }}
    >
      {/* "< Home page" link */}
      <div className="absolute top-5 left-6 sm:left-12 z-10">
        <Link href="/" className="flex items-center gap-1.5 text-[13px] font-medium text-gray-500 hover:text-gray-700 transition-colors">
          <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 19.5L8.25 12l7.5-7.5" />
          </svg>
          Home page
        </Link>
      </div>

      {/* Content */}
      <main className="flex-1 flex flex-col items-center justify-center px-6 py-12">

        {/* Logo */}
        <div className="mb-6">
          <Image src="/logo.png" alt="Client Check" width={56} height={56} className="h-25 w-25 object-contain" />
        </div>

        {/* White card */}
        <div className="w-full max-w-[420px] bg-white rounded-3xl shadow-xl shadow-indigo-200/40 p-8 sm:p-10">

          {/* Header */}
          <div className="text-center mb-8">
            <h1 className="text-[1.6rem] font-bold tracking-tight text-gray-900 mb-1.5">
              Welcome Back!
            </h1>
            <p className="text-[14px] text-gray-400">
              We missed you! Please enter your details.
            </p>
          </div>

          <form onSubmit={handleSubmit} className="flex flex-col gap-5">

            {/* Email */}
            <div className="flex flex-col gap-1.5">
              <label htmlFor="email" className="text-[13px] font-semibold text-gray-700">
                Email
              </label>
              <input
                id="email"
                name="email"
                type="text"
                autoComplete="off"
                placeholder="Enter your Email"
                value={formData.email}
                onChange={handleChange}
                className="w-full bg-white border border-gray-200 rounded-xl px-4 py-3 text-[14px] text-gray-800 placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-purple-400/30 focus:border-purple-300 transition"
              />
              {errors.email && <span className="text-red-500 text-[12px]">{errors.email}</span>}
            </div>

            {/* Password */}
            <div className="flex flex-col gap-1.5">
              <label htmlFor="password" className="text-[13px] font-semibold text-gray-700">
                Password
              </label>
              <div className="relative">
                <input
                  id="password"
                  name="password"
                  type={showPassword ? 'text' : 'password'}
                  autoComplete="off"
                  placeholder="Enter Password"
                  value={formData.password}
                  onChange={handleChange}
                  className="w-full bg-white border border-gray-200 rounded-xl pl-4 pr-11 py-3 text-[14px] text-gray-800 placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-purple-400/30 focus:border-purple-300 transition"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword((p) => !p)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 p-1.5 text-gray-400 hover:text-gray-600 rounded-lg transition-colors cursor-pointer"
                  aria-label={showPassword ? 'Hide password' : 'Show password'}
                >
                  {showPassword ? <FiEyeOff className="w-5 h-5" /> : <FiEye className="w-5 h-5" />}
                </button>
              </div>
              {errors.password && <span className="text-red-500 text-[12px]">{errors.password}</span>}
            </div>

            {firebaseError && (
              <p className="text-red-500 text-[13px] text-center bg-red-50 border border-red-100 rounded-xl px-4 py-2.5">
                {firebaseError}
              </p>
            )}

            {/* Submit */}
            <button
              type="submit"
              disabled={loading}
              className="w-full mt-1 inline-flex items-center justify-center gap-2 text-white font-semibold text-[15px] py-3.5 rounded-xl transition-all shadow-lg shadow-purple-300/30 hover:shadow-xl hover:shadow-purple-300/40 cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
              style={{ background: 'linear-gradient(135deg, #818cf8 0%, #a78bfa 50%, #c084fc 100%)' }}
            >
              {loading ? (
                <>
                  <svg className="animate-spin h-5 w-5 text-white" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z" />
                  </svg>
                  Signing in...
                </>
              ) : (
                'Sign in'
              )}
            </button>
          </form>

          {/* Bottom link */}
          <p className="mt-7 text-center text-[13px] text-gray-500">
            Don&apos;t have an account?{' '}
            <Link href="/signup" className="font-semibold text-gray-800 underline underline-offset-2 decoration-gray-300 hover:decoration-purple-400 transition-colors">
              Sign up
            </Link>
          </p>
        </div>
      </main>
    </div>
  );
}
