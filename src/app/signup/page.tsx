'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import InputField from '../components/InputField';
import Button from '../components/Button';
import { createUserWithEmailAndPassword, updateProfile } from "firebase/auth";
import { getFirestore, doc, setDoc, serverTimestamp } from "firebase/firestore";
import { app, auth } from '../../firebase';

function validateEmail(email: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

export default function SignupPage() {
  const router = useRouter();
  const [formData, setFormData] = useState({
    name: '',
    email: '',
    password: '',
    confirmPassword: '',
  });
  const [errors, setErrors] = useState<{ name?: string; email?: string; password?: string; confirmPassword?: string }>({});
  const [firebaseError, setFirebaseError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

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
        const userCredential = await createUserWithEmailAndPassword(
          auth,
          formData.email,
          formData.password
        );
        
        // Update user profile
        if (auth.currentUser) {
          await updateProfile(auth.currentUser, { displayName: formData.name });
        }

        // Create user document in Firestore
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
        
        // Store user data in localStorage
        // Note: We exclude Timestamp objects from localStorage
        const userDataForStorage = {
          name: formData.name,
          email: formData.email.toLocaleLowerCase(),
          userId: userCredential.user.uid,
          userType: 'user',
        };
        localStorage.setItem('clientcheck_user_data', JSON.stringify(userDataForStorage));
        
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
        <h1 className="text-3xl font-bold mb-10 text-black text-center">Sign Up</h1>
        <form onSubmit={handleSubmit} className="w-full flex flex-col gap-6">
          <InputField
            id="name"
            name="name"
            type="text"
            autoComplete="off"
            placeholder="Name"
            value={formData.name}
            onChange={handleChange}
            error={errors.name}
          />
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
          <InputField
            id="confirmPassword"
            name="confirmPassword"
            type="password"
            autoComplete="off"
            placeholder="Confirm Password"
            value={formData.confirmPassword}
            onChange={handleChange}
            error={errors.confirmPassword}
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
                Signing up...
              </span>
            ) : (
              "SIGN UP"
            )}
          </Button>
        </form>
        <div className="mt-8 text-center w-full">
          <a
            href="/login"
            className="inline-block text-base font-semibold bg-gradient-to-r from-purple-400 to-blue-400 bg-clip-text text-transparent relative transition-colors duration-200 group"
          >
            <span className="group-hover:underline group-hover:decoration-4 group-hover:underline-offset-4 transition-all duration-300">Already have an account? Login</span>
          </a>
        </div>
      </div>
    </div>
  );
}