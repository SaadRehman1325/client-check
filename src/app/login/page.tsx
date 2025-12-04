'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import InputField from '../components/InputField';
import Button from '../components/Button';
import { signInWithEmailAndPassword } from "firebase/auth";
import { getFirestore, doc, getDoc } from "firebase/firestore";
import { app, auth } from '../../firebase';
import { clearUserData } from '../../hooks/useUserData';

function validateEmail(email: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

export default function LoginPage() {
  const router = useRouter();
  const [formData, setFormData] = useState({
    email: '',
    password: '',
  });
  const [errors, setErrors] = useState<{ email?: string; password?: string }>({});
  const [firebaseError, setFirebaseError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setFirebaseError(null);
    const newErrors: { email?: string; password?: string } = {};
    if (!formData.email) {
      newErrors.email = 'Email is required.';
    } else if (!validateEmail(formData.email)) {
      newErrors.email = 'Please enter a valid email address.';
    }
    if (!formData.password) {
      newErrors.password = 'Password is required.';
    }
    setErrors(newErrors);
    if (Object.keys(newErrors).length === 0) {
      setLoading(true);
      try {
        const userCredential = await signInWithEmailAndPassword(auth, formData.email, formData.password);
        
        // Clear any old user data from localStorage
        clearUserData();
        
        // Fetch user data from Firestore
        const db = getFirestore(app);
        const userRef = doc(db, 'users', userCredential.user.uid);
        const userDoc = await getDoc(userRef);
        
        if (userDoc.exists()) {
          // Store user data in localStorage
          const userData = userDoc.data();
          localStorage.setItem('clientcheck_user_data', JSON.stringify(userData));
        }
        
        // Check subscription status
        const subscriptionRef = doc(db, 'subscriptions', userCredential.user.uid);
        const subscriptionDoc = await getDoc(subscriptionRef);

        // Redirect based on subscription status
        if (subscriptionDoc.exists() && subscriptionDoc.data()?.status === 'active') {
          // User has active subscription - redirect to home
          setTimeout(() => {
            router.replace('/home');
          }, 100);
        } else {
          // No subscription or inactive - redirect to packages
          setTimeout(() => {
            router.replace('/packages');
          }, 100);
        }
      } catch (error: any) {
        setFirebaseError(error.message || "Login failed");
        setLoading(false);
      }
    }
  };

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { name, value } = e.target;
    setFormData(prev => ({
      ...prev,
      [name]: value
    }));
    setErrors(prev => ({ ...prev, [name]: undefined }));
    setFirebaseError(null);
  };

  return (
    <div className="min-h-screen flex items-center justify-center relative overflow-hidden" style={{fontFamily: 'Poppins, sans-serif'}}>
      {/* Diagonal gradient background */}
      <div className="absolute inset-0 -z-10">
        <svg width="100%" height="100%" viewBox="0 0 100 100" preserveAspectRatio="none" className="w-full h-full">
          <polygon points="0,0 100,0 100,100" fill="#a18cd1" />
          <polygon points="0,0 0,100 100,100" fill="#f8fafc" />
        </svg>
      </div>
      <div className="w-full max-w-md bg-white rounded-3xl shadow-2xl px-10 py-12 flex flex-col items-center" style={{boxShadow: '0 8px 32px 0 rgba(31, 38, 135, 0.15)'}}>
        <h1 className="text-3xl font-bold mb-10 text-black text-center">Login</h1>
        <form onSubmit={handleSubmit} className="w-full flex flex-col gap-6">
          <InputField
            id="email"
            name="email"
            type="text"
            autoComplete="off"
            placeholder="Email Address"
            value={formData.email}
            onChange={handleChange}
            error={errors.email}
          />
          <InputField
            id="password"
            name="password"
            type="password"
            autoComplete="off"
            placeholder="Password"
            value={formData.password}
            onChange={handleChange}
            error={errors.password}
          />
          {firebaseError && (
            <div className="text-red-500 text-sm text-center">{firebaseError}</div>
          )}
          <Button type="submit" disabled={loading}>
            {loading ? (
              <span className="flex items-center justify-center">
                <svg className="animate-spin h-5 w-5 mr-2 text-white" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none"/>
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z"/>
                </svg>
                Logging in...
              </span>
            ) : (
              "LOGIN"
            )}
          </Button>
        </form>
        <div className="mt-8 text-center w-full">
          <a
            href="/signup"
            className="inline-block text-base font-semibold bg-gradient-to-r from-purple-400 to-blue-400 bg-clip-text text-transparent relative transition-colors duration-200 group"
          >
            <span className="group-hover:underline group-hover:decoration-4 group-hover:underline-offset-4 transition-all duration-300">Don't have an account? Create new</span>
          </a>
        </div>
      </div>
    </div>
  );
}