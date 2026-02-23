'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import { FiEye, FiEyeOff } from 'react-icons/fi';
import { createUserWithEmailAndPassword, updateProfile } from "firebase/auth";
import { getFirestore, doc, setDoc, serverTimestamp } from "firebase/firestore";
import { app, auth } from '../../firebase';

function validateEmail(email: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

export default function SignupPage() {
  const router = useRouter();
  const [formData, setFormData] = useState({ name: '', email: '', password: '', confirmPassword: '' });
  const [errors, setErrors] = useState<{ name?: string; email?: string; password?: string; confirmPassword?: string }>({});
  const [firebaseError, setFirebaseError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setFirebaseError(null);
    const newErrors: { name?: string; email?: string; password?: string; confirmPassword?: string } = {};
    if (!formData.name) newErrors.name = 'Name is required.';
    if (!formData.email) newErrors.email = 'Email is required.';
    else if (!validateEmail(formData.email)) newErrors.email = 'Please enter a valid email address.';
    if (!formData.password) newErrors.password = 'Password is required.';
    else if (formData.password.length < 6) newErrors.password = 'Password must be at least 6 characters.';
    if (!formData.confirmPassword) newErrors.confirmPassword = 'Please confirm your password.';
    else if (formData.password !== formData.confirmPassword) newErrors.confirmPassword = 'Passwords do not match.';
    setErrors(newErrors);
    if (Object.keys(newErrors).length === 0) {
      setLoading(true);
      try {
        const userCredential = await createUserWithEmailAndPassword(auth, formData.email, formData.password);
        if (auth.currentUser) {
          await updateProfile(auth.currentUser, { displayName: formData.name });
        }
        const db = getFirestore(app);
        const userRef = doc(db, 'users', userCredential.user.uid);
        const userData = {
          name: formData.name,
          email: formData.email.toLocaleLowerCase(),
          userId: userCredential.user.uid,
          userType: 'user',
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        };
        await setDoc(userRef, userData);
        localStorage.setItem('clientcheck_user_data', JSON.stringify({
          name: formData.name,
          email: formData.email.toLocaleLowerCase(),
          userId: userCredential.user.uid,
          userType: 'user',
        }));
        router.push('/packages');
      } catch (error: any) {
        setFirebaseError(error.message || "Signup failed");
      } finally {
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

  const inputClass = "w-full bg-white border border-gray-200 rounded-xl px-4 py-3 text-[14px] text-gray-800 placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-purple-400/30 focus:border-purple-300 transition";

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
              Create Account
            </h1>
            <p className="text-[14px] text-gray-400">
              Start your free trial — no credit card required.
            </p>
          </div>

          <form onSubmit={handleSubmit} className="flex flex-col gap-5">

            {/* Name */}
            <div className="flex flex-col gap-1.5">
              <label htmlFor="name" className="text-[13px] font-semibold text-gray-700">Full Name</label>
              <input id="name" name="name" type="text" autoComplete="off" placeholder="John Doe" value={formData.name} onChange={handleChange} className={inputClass} />
              {errors.name && <span className="text-red-500 text-[12px]">{errors.name}</span>}
            </div>

            {/* Email */}
            <div className="flex flex-col gap-1.5">
              <label htmlFor="email" className="text-[13px] font-semibold text-gray-700">Email</label>
              <input id="email" name="email" type="text" autoComplete="off" placeholder="you@example.com" value={formData.email} onChange={handleChange} className={inputClass} />
              {errors.email && <span className="text-red-500 text-[12px]">{errors.email}</span>}
            </div>

            {/* Password */}
            <div className="flex flex-col gap-1.5">
              <label htmlFor="password" className="text-[13px] font-semibold text-gray-700">Password</label>
              <div className="relative">
                <input
                  id="password"
                  name="password"
                  type={showPassword ? 'text' : 'password'}
                  autoComplete="off"
                  placeholder="At least 6 characters"
                  value={formData.password}
                  onChange={handleChange}
                  className={`${inputClass} pr-11`}
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

            {/* Confirm Password */}
            <div className="flex flex-col gap-1.5">
              <label htmlFor="confirmPassword" className="text-[13px] font-semibold text-gray-700">Confirm Password</label>
              <div className="relative">
                <input
                  id="confirmPassword"
                  name="confirmPassword"
                  type={showConfirmPassword ? 'text' : 'password'}
                  autoComplete="off"
                  placeholder="Re-enter password"
                  value={formData.confirmPassword}
                  onChange={handleChange}
                  className={`${inputClass} pr-11`}
                />
                <button
                  type="button"
                  onClick={() => setShowConfirmPassword((p) => !p)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 p-1.5 text-gray-400 hover:text-gray-600 rounded-lg transition-colors cursor-pointer"
                  aria-label={showConfirmPassword ? 'Hide password' : 'Show password'}
                >
                  {showConfirmPassword ? <FiEyeOff className="w-5 h-5" /> : <FiEye className="w-5 h-5" />}
                </button>
              </div>
              {errors.confirmPassword && <span className="text-red-500 text-[12px]">{errors.confirmPassword}</span>}
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
                  Creating account...
                </>
              ) : (
                'Create account'
              )}
            </button>
          </form>

          {/* Bottom link */}
          <p className="mt-7 text-center text-[13px] text-gray-500">
            Already have an account?{' '}
            <Link href="/login" className="font-semibold text-gray-800 underline underline-offset-2 decoration-gray-300 hover:decoration-purple-400 transition-colors">
              Sign in
            </Link>
          </p>
        </div>
      </main>
    </div>
  );
}
