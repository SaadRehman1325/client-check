'use client';

import { useState, useEffect, useRef } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import {
  FiUser,
  FiLock,
  FiCreditCard,
  FiLogOut,
  FiChevronLeft,
  FiExternalLink,
  FiEdit2,
  FiCheck,
  FiCalendar,
  FiEdit3,
  FiMapPin,
  FiTrash2,
} from 'react-icons/fi';
import { getFunctions, httpsCallable } from 'firebase/functions';
import {
  updateProfile,
  updatePassword,
  reauthenticateWithCredential,
  EmailAuthProvider,
  signOut,
} from 'firebase/auth';
import { collection, doc, deleteDoc, onSnapshot, query, serverTimestamp, updateDoc, where } from 'firebase/firestore';
import { ref, uploadBytes, getDownloadURL } from 'firebase/storage';
import Button from '../components/Button';
import InputField from '../components/InputField';
import Modal from '../components/Modal';
import ProtectedRoute from '../components/ProtectedRoute';
import { useAuth } from '../../hooks/useAuth';
import { useUserData } from '../../hooks/useUserData';
import { useSubscription } from '../../hooks/useSubscription';
import { db, app, auth, storage } from '../../firebase';
import { clearUserData } from '../../hooks/useUserData';

type ProfileSection = 'personal' | 'password' | 'subscription' | 'locations';

type LocationCard = {
  id: string;
  image: string;
  city: string;
  zip: string;
  address: string;
  badge: { letter: string; color: string };
  tags: string[];
  lat?: number;
  lng?: number;
};

function formatDate(timestamp: { seconds: number; nanoseconds: number } | undefined): string {
  if (!timestamp?.seconds) return '—';
  return new Date(timestamp.seconds * 1000).toLocaleDateString(undefined, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  });
}

export default function ProfilePage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { user } = useAuth();
  const { userData, loading: userLoading, setUserData } = useUserData(user);
  const { subscription, loading: subLoading, isActive } = useSubscription();
  const [activeSection, setActiveSection] = useState<ProfileSection>('personal');

  // Open subscription section when navigated with ?section=subscription
  useEffect(() => {
    const section = searchParams.get('section');
    if (section === 'subscription') {
      setActiveSection('subscription');
      router.replace('/profile', { scroll: false });
    }
  }, [searchParams, router]);
  const [portalLoading, setPortalLoading] = useState(false);
  const [portalError, setPortalError] = useState<string | null>(null);

  // Avatar upload
  const [avatarUploading, setAvatarUploading] = useState(false);
  const [avatarError, setAvatarError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Personal information form
  const [personalForm, setPersonalForm] = useState({ name: '' });
  const [personalSaving, setPersonalSaving] = useState(false);
  const [personalSaved, setPersonalSaved] = useState(false);
  const [personalError, setPersonalError] = useState<string | null>(null);

  // Password form
  const [passwordForm, setPasswordForm] = useState({
    currentPassword: '',
    newPassword: '',
    confirmPassword: '',
  });
  const [passwordSaving, setPasswordSaving] = useState(false);
  const [passwordError, setPasswordError] = useState<string | null>(null);
  const [passwordSuccess, setPasswordSuccess] = useState(false);

  // My locations (cards created by this user)
  const [userLocations, setUserLocations] = useState<LocationCard[]>([]);
  const [locationsLoading, setLocationsLoading] = useState(true);
  const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null);
  const [deleteLoading, setDeleteLoading] = useState(false);
  const [editingLocation, setEditingLocation] = useState<LocationCard | null>(null);
  const [editForm, setEditForm] = useState({ address: '', city: '', zip: '', tags: '', badgeLetter: 'A' });
  const [editImageFile, setEditImageFile] = useState<File | null>(null);
  const [editImagePreview, setEditImagePreview] = useState<string>('');
  const [editDragActive, setEditDragActive] = useState(false);
  const editFileInputRef = useRef<HTMLInputElement>(null);
  const [editSaving, setEditSaving] = useState(false);
  const [editError, setEditError] = useState<string | null>(null);

  const isEmailUser = user?.providerData?.some((p) => p.providerId === 'password');

  const getGradeColor = (grade: string): string => {
    const colors: Record<string, string> = {
      A: '#22c55e',
      B: '#3b82f6',
      C: '#eab308',
      D: '#f97316',
      F: '#ef4444',
    };
    return colors[grade.toUpperCase()] || '#6b7280';
  };

  const handleDeleteLocation = async (id: string) => {
    setDeleteLoading(true);
    setEditError(null);
    try {
      await deleteDoc(doc(db, 'cards', id));
      setDeleteConfirmId(null);
    } catch (err: unknown) {
      const msg = err && typeof err === 'object' && 'message' in err ? String((err as { message?: string }).message) : 'Failed to delete.';
      setEditError(msg);
    } finally {
      setDeleteLoading(false);
    }
  };

  const openEditModal = (loc: LocationCard) => {
    setEditingLocation(loc);
    setEditForm({
      address: loc.address,
      city: loc.city,
      zip: loc.zip,
      tags: loc.tags.join(', '),
      badgeLetter: loc.badge?.letter || 'A',
    });
    setEditImageFile(null);
    setEditImagePreview(loc.image || '');
    setEditError(null);
  };

  const handleEditImageSelect = (file: File) => {
    if (file?.type.startsWith('image/')) {
      setEditImageFile(file);
      const reader = new FileReader();
      reader.onload = (ev) => setEditImagePreview(ev.target?.result as string);
      reader.readAsDataURL(file);
    }
  };

  const handleSaveEdit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingLocation?.id || !user?.uid) return;
    setEditSaving(true);
    setEditError(null);
    try {
      let imageUrl: string;
      if (editImageFile) {
        const imageRef = ref(storage, `cards/${user.uid}/${Date.now()}_${editImageFile.name}`);
        await uploadBytes(imageRef, editImageFile);
        imageUrl = await getDownloadURL(imageRef);
      } else if (editImagePreview === '') {
        imageUrl = '';
      } else {
        imageUrl = editingLocation.image || '';
      }
      const tags = editForm.tags.split(',').map((t) => t.trim()).filter(Boolean);
      const badgeLetter = editForm.badgeLetter.toUpperCase();
      const badgeColor = getGradeColor(badgeLetter);
      await updateDoc(doc(db, 'cards', editingLocation.id), {
        address: editForm.address.trim(),
        city: editForm.city.trim(),
        zip: editForm.zip.trim(),
        tags,
        image: imageUrl,
        badge: { letter: badgeLetter, color: badgeColor },
        updatedAt: serverTimestamp(),
      });
      setEditingLocation(null);
    } catch (err: unknown) {
      const msg = err && typeof err === 'object' && 'message' in err ? String((err as { message?: string }).message) : 'Failed to update.';
      setEditError(msg);
    } finally {
      setEditSaving(false);
    }
  };

  useEffect(() => {
    if (!user?.uid) {
      setLocationsLoading(false);
      return;
    }
    const q = query(
      collection(db, 'cards'),
      where('createdBy', '==', user.uid)
    );
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const list: LocationCard[] = [];
      snapshot.forEach((docSnap) => {
        const data = docSnap.data();
        list.push({
          id: docSnap.id,
          image: data.image || '',
          city: data.city || '',
          zip: data.zip || '',
          address: data.address || '',
          badge: data.badge || { letter: '—', color: '#6b7280' },
          tags: Array.isArray(data.tags) ? data.tags : [],
          lat: typeof data.lat === 'number' ? data.lat : undefined,
          lng: typeof data.lng === 'number' ? data.lng : undefined,
        });
      });
      setUserLocations(list);
      setLocationsLoading(false);
    });
    return () => unsubscribe();
  }, [user?.uid]);

  useEffect(() => {
    if (userData) {
      setPersonalForm({ name: userData.name || '' });
    }
  }, [userData]);

  const handleAvatarClick = () => {
    setAvatarError(null);
    fileInputRef.current?.click();
  };

  const handleAvatarFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !user?.uid) return;
    if (!file.type.startsWith('image/')) {
      setAvatarError('Please select an image file (e.g. JPG, PNG).');
      e.target.value = '';
      return;
    }
    setAvatarUploading(true);
    setAvatarError(null);
    try {
      const ext = file.name.split('.').pop() || 'jpg';
      const imageRef = ref(storage, `users/${user.uid}/avatar.${ext}`);
      await uploadBytes(imageRef, file);
      const imageUrl = await getDownloadURL(imageRef);
      const userRef = doc(db, 'users', user.uid);
      await updateDoc(userRef, { imageUrl, updatedAt: serverTimestamp() });
      if (auth.currentUser) {
        await updateProfile(auth.currentUser, { photoURL: imageUrl });
      }
      setUserData((prev) => (prev ? { ...prev, imageUrl } : null));
    } catch (err: unknown) {
      const message =
        err && typeof err === 'object' && 'message' in err
          ? String((err as { message?: string }).message)
          : 'Failed to upload photo. Please try again.';
      setAvatarError(message);
    } finally {
      setAvatarUploading(false);
      e.target.value = '';
    }
  };

  const handleManageSubscription = async () => {
    setPortalError(null);
    setPortalLoading(true);
    try {
      const functions = getFunctions(app);
      const createBillingPortalSession = httpsCallable<
        { returnUrl: string },
        { url: string }
      >(functions, 'createBillingPortalSession');
      const returnUrl =
        typeof window !== 'undefined' ? `${window.location.origin}/profile` : '';
      const result = await createBillingPortalSession({ returnUrl });
      const data = result.data;
      if (data?.url) {
        window.location.href = data.url;
      } else {
        throw new Error('No portal URL received');
      }
    } catch (err: unknown) {
      const message =
        err && typeof err === 'object' && 'message' in err
          ? String((err as { message?: string }).message)
          : 'Failed to open billing portal. Please try again.';
      setPortalError(message);
      setPortalLoading(false);
    }
  };

  const handleSavePersonalInfo = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user?.uid) return;
    setPersonalError(null);
    setPersonalSaving(true);
    setPersonalSaved(false);
    try {
      const name = personalForm.name.trim();
      if (!name) {
        setPersonalError('Name is required.');
        setPersonalSaving(false);
        return;
      }
      const userRef = doc(db, 'users', user.uid);
      await updateDoc(userRef, {
        name,
        updatedAt: serverTimestamp(),
      });
      if (auth.currentUser) {
        await updateProfile(auth.currentUser, { displayName: name });
      }
      setUserData((prev) => (prev ? { ...prev, name } : null));
      setPersonalSaved(true);
      setTimeout(() => setPersonalSaved(false), 3000);
    } catch (err: unknown) {
      const message =
        err && typeof err === 'object' && 'message' in err
          ? String((err as { message?: string }).message)
          : 'Failed to update profile.';
      setPersonalError(message);
    } finally {
      setPersonalSaving(false);
    }
  };

  const handleChangePassword = async (e: React.FormEvent) => {
    e.preventDefault();
    setPasswordError(null);
    setPasswordSuccess(false);
    const { currentPassword, newPassword, confirmPassword } = passwordForm;
    if (!newPassword || newPassword.length < 6) {
      setPasswordError('New password must be at least 6 characters.');
      return;
    }
    if (newPassword !== confirmPassword) {
      setPasswordError('New passwords do not match.');
      return;
    }
    if (!currentPassword) {
      setPasswordError('Current password is required.');
      return;
    }
    if (!user?.email) {
      setPasswordError('Cannot change password for this account.');
      return;
    }
    setPasswordSaving(true);
    try {
      const credential = EmailAuthProvider.credential(user.email, currentPassword);
      await reauthenticateWithCredential(auth.currentUser!, credential);
      await updatePassword(auth.currentUser!, newPassword);
      setPasswordSuccess(true);
      setPasswordForm({ currentPassword: '', newPassword: '', confirmPassword: '' });
    } catch (err: unknown) {
      const message =
        err && typeof err === 'object' && 'message' in err
          ? String((err as { message?: string }).message)
          : 'Failed to change password.';
      setPasswordError(message);
    } finally {
      setPasswordSaving(false);
    }
  };

  const handleLogOut = async () => {
    try {
      clearUserData();
      await signOut(auth);
      router.push('/');
    } catch (err) {
      console.error('Logout error:', err);
    }
  };

  const subscriptionStatusLabel =
    subscription?.status === 'active'
      ? 'Active'
      : subscription?.status === 'trialing'
        ? 'Free Trial'
        : subscription?.status === 'canceled'
          ? 'Canceled'
          : subscription?.status === 'past_due'
            ? 'Past due'
            : subscription?.status ?? '—';

  const isTrialing = subscription?.status === 'trialing';

  const [subscribeLoading, setSubscribeLoading] = useState<'monthly' | 'yearly' | null>(null);
  const [subscribeError, setSubscribeError] = useState<string | null>(null);

  const handleSubscribe = async (planType: 'monthly' | 'yearly') => {
    if (!user) return;
    setSubscribeError(null);
    setSubscribeLoading(planType);
    try {
      const functions = getFunctions(app);
      const createCheckoutSession = httpsCallable<
        { planType: 'monthly' | 'yearly' },
        { url: string }
      >(functions, 'createCheckoutSession');
      const result = await createCheckoutSession({ planType });
      const data = result.data;
      if (data?.url) {
        window.location.href = data.url;
      } else {
        throw new Error('No checkout URL received');
      }
    } catch (err: unknown) {
      const message =
        err && typeof err === 'object' && 'message' in err
          ? String((err as { message?: string }).message)
          : err && typeof err === 'object' && 'details' in err && typeof (err as { details?: { message?: string } }).details?.message === 'string'
            ? (err as { details: { message: string } }).details.message
            : 'Failed to start checkout. Please try again.';
      setSubscribeError(message);
      setSubscribeLoading(null);
    }
  };

  const loading = userLoading || subLoading;

  const navItems: { id: ProfileSection; label: string; icon: React.ReactNode }[] = [
    { id: 'personal', label: 'Profile settings', icon: <FiUser className="h-5 w-5" /> },
    { id: 'locations', label: 'My locations', icon: <FiMapPin className="h-5 w-5" /> },
    { id: 'password', label: 'Login and passwords', icon: <FiLock className="h-5 w-5" /> },
    { id: 'subscription', label: 'Subscription', icon: <FiCreditCard className="h-5 w-5" /> },
  ];

  return (
    <ProtectedRoute>
      <div className="min-h-screen bg-gradient-to-br from-blue-50 via-purple-50/30 to-white antialiased">
        {/* Top bar: back */}
        <header className="sticky top-0 z-20 border-b border-slate-200/80 bg-white/90 backdrop-blur-sm">
          <div className="mx-auto flex max-w-6xl items-center justify-between px-4 py-3 sm:px-6">
            <button
              onClick={() => router.push('/home')}
              className="flex items-center gap-1.5 rounded-lg px-2 py-1.5 text-slate-600 transition-colors hover:bg-slate-100 hover:text-slate-900 cursor-pointer"
              aria-label="Back to home"
            >
              <FiChevronLeft className="h-5 w-5" />
              <span className="text-sm font-medium">Back</span>
            </button>
            <h1 className="text-base font-semibold text-slate-900">My Account</h1>
            <div className="w-14" />
          </div>
        </header>

        <div className="mx-auto max-w-6xl px-4 py-6 sm:px-6">
          {loading ? (
            <div className="flex flex-col items-center justify-center py-24">
              <div className="h-10 w-10 animate-spin rounded-full border-2 border-purple-200 border-t-purple-500" />
              <p className="mt-4 text-sm text-slate-500">Loading your profile…</p>
            </div>
          ) : (
            <div className="flex flex-col gap-6 lg:flex-row">
              {/* Left sidebar */}
              <aside className="w-full shrink-0 lg:w-72">
                <div className="rounded-2xl border border-slate-200/80 bg-white p-6 shadow-sm">
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept="image/*"
                    className="hidden"
                    onChange={handleAvatarFileChange}
                  />
                  <div className="relative mb-6 flex justify-center">
                    <div className="relative h-20 w-20 flex-shrink-0">
                      {userData?.imageUrl ? (
                        <img
                          src={userData.imageUrl}
                          alt="Profile"
                          className="h-20 w-20 rounded-full object-cover shadow-md"
                        />
                      ) : (
                        <div className="flex h-20 w-20 items-center justify-center rounded-full bg-gradient-to-br from-purple-400 to-blue-400 text-2xl font-bold text-white shadow-md">
                          {userData?.name?.[0]?.toUpperCase() ||
                            user?.email?.[0]?.toUpperCase() ||
                            'U'}
                        </div>
                      )}
                      {avatarUploading && (
                        <div className="absolute inset-0 flex items-center justify-center rounded-full bg-black/50">
                          <span className="h-6 w-6 animate-spin rounded-full border-2 border-white border-t-transparent" />
                        </div>
                      )}
                      <button
                        type="button"
                        onClick={handleAvatarClick}
                        disabled={avatarUploading}
                        className="absolute -bottom-0.5 -right-0.5 flex h-7 w-7 items-center justify-center rounded-full bg-purple-600 text-white shadow-md hover:bg-purple-700 disabled:opacity-70 disabled:cursor-not-allowed cursor-pointer border-2 border-white"
                        aria-label="Change profile photo"
                      >
                        <FiEdit2     className="h-3 w-3" />
                      </button>
                    </div>
                  </div>
                  {avatarError && (
                    <p className="mb-2 text-center text-sm text-red-600">{avatarError}</p>
                  )}
                  <div className="text-center">
                    <h2 className="text-lg font-bold text-slate-900">
                      {userData?.name || 'User'}
                    </h2>
                   
                    <p className="mt-2 flex items-center justify-center gap-1.5 text-xs text-slate-400">
                      <FiCalendar className="h-3.5 w-3.5 flex-shrink-0" />
                      <span>Joined {formatDate(userData?.createdAt)}</span>
                    </p>
                  </div>

                 
                  <nav className="mt-5 space-y-0.5" aria-label="Profile sections">
                    {navItems.map((item) => (
                      <button
                        key={item.id}
                        type="button"
                        onClick={() => setActiveSection(item.id)}
                        className={`flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left text-sm font-medium transition cursor-pointer ${
                          activeSection === item.id
                            ? 'bg-purple-50 text-purple-600'
                            : 'text-slate-600 hover:bg-slate-50 hover:text-slate-900'
                        }`}
                      >
                        {item.icon}
                        {item.label}
                      </button>
                    ))}
                    <button
                      type="button"
                      onClick={handleLogOut}
                      className="flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left text-sm font-medium text-slate-600 transition hover:bg-red-50 hover:text-red-600 cursor-pointer"
                    >
                      <FiLogOut className="h-5 w-5" />
                      Log Out
                    </button>
                  </nav>
                </div>
              </aside>

              {/* Right content */}
              <div className="min-w-0 flex-1">
                <div className="rounded-2xl border border-slate-200/80 bg-white p-6 shadow-sm sm:p-8">
                  {/* Profile settings */}
                  {activeSection === 'personal' && (
                    <>
                      <h3 className="text-xl font-bold text-slate-900">
                        Profile settings
                      </h3>
                      <form onSubmit={handleSavePersonalInfo} className="mt-6 space-y-5">
                        <div className="grid gap-5 sm:grid-cols-2">
                          <div>
                            <label
                              htmlFor="profile-name"
                              className="mb-1.5 block text-sm font-medium text-slate-700"
                            >
                              Full Name
                            </label>
                            <input
                              id="profile-name"
                              type="text"
                              value={personalForm.name}
                              onChange={(e) =>
                                setPersonalForm((p) => ({ ...p, name: e.target.value }))
                              }
                              className="w-full rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-slate-900 placeholder-slate-400 focus:border-purple-500 focus:outline-none focus:ring-2 focus:ring-purple-500/20"
                              placeholder="Your name"
                            />
                          </div>
                          <div>
                            <label className="mb-1.5 block text-sm font-medium text-slate-700">
                              Email
                            </label>
                            <div className="flex items-center gap-2 rounded-xl border border-slate-200 bg-slate-50/50 px-4 py-2.5">
                              <span className="text-slate-700">
                                {userData?.email || user?.email || '—'}
                              </span>
                              {user?.emailVerified && (
                                <span className="inline-flex items-center gap-1 rounded-full bg-emerald-100 px-2 py-0.5 text-xs font-medium text-emerald-700">
                                  <FiCheck className="h-3.5 w-3.5" />
                                  Verified
                                </span>
                              )}
                            </div>
                          </div>
                        </div>
                        {personalError && (
                          <p className="text-sm text-red-600">{personalError}</p>
                        )}
                        {personalSaved && (
                          <p className="text-sm text-emerald-600">
                            Your changes have been saved.
                          </p>
                        )}
                        <div className="flex flex-wrap gap-3 pt-2">
                          <button
                            type="submit"
                            disabled={personalSaving}
                            className="rounded-xl bg-gradient-to-r from-purple-500 to-blue-500 px-5 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:from-purple-600 hover:to-blue-600 disabled:opacity-70 cursor-pointer"
                          >
                            {personalSaving ? 'Saving…' : 'Save Changes'}
                          </button>
                        </div>
                      </form>
                    </>
                  )}

                  {/* Login and passwords */}
                  {activeSection === 'password' && (
                    <>
                      <h3 className="text-xl font-bold text-slate-900">
                        Login and passwords
                      </h3>
                      {!isEmailUser ? (
                        <p className="mt-4 text-slate-600">
                          You signed in with a social account. Password change is not
                          applicable.
                        </p>
                      ) : (
                        <form
                          onSubmit={handleChangePassword}
                          className="mt-6 space-y-5"
                        >
                          <div>
                            <label
                              htmlFor="current-password"
                              className="mb-1.5 block text-sm font-medium text-slate-700"
                            >
                              Current Password
                            </label>
                            <input
                              id="current-password"
                              type="password"
                              value={passwordForm.currentPassword}
                              onChange={(e) =>
                                setPasswordForm((p) => ({
                                  ...p,
                                  currentPassword: e.target.value,
                                }))
                              }
                              className="w-full rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-slate-900 placeholder-slate-400 focus:border-purple-500 focus:outline-none focus:ring-2 focus:ring-purple-500/20"
                              placeholder="Enter current password"
                              autoComplete="current-password"
                            />
                          </div>
                          <div className="grid gap-5 sm:grid-cols-2">
                            <div>
                              <label
                                htmlFor="new-password"
                                className="mb-1.5 block text-sm font-medium text-slate-700"
                              >
                                New Password
                              </label>
                              <input
                                id="new-password"
                                type="password"
                                value={passwordForm.newPassword}
                                onChange={(e) =>
                                  setPasswordForm((p) => ({
                                    ...p,
                                    newPassword: e.target.value,
                                  }))
                                }
                                className="w-full rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-slate-900 placeholder-slate-400 focus:border-purple-500 focus:outline-none focus:ring-2 focus:ring-purple-500/20"
                                placeholder="At least 6 characters"
                                autoComplete="new-password"
                              />
                            </div>
                            <div>
                              <label
                                htmlFor="confirm-password"
                                className="mb-1.5 block text-sm font-medium text-slate-700"
                              >
                                Confirm New Password
                              </label>
                              <input
                                id="confirm-password"
                                type="password"
                                value={passwordForm.confirmPassword}
                                onChange={(e) =>
                                  setPasswordForm((p) => ({
                                    ...p,
                                    confirmPassword: e.target.value,
                                  }))
                                }
                                className="w-full rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-slate-900 placeholder-slate-400 focus:border-purple-500 focus:outline-none focus:ring-2 focus:ring-purple-500/20"
                                placeholder="Confirm new password"
                                autoComplete="new-password"
                              />
                            </div>
                          </div>
                          {passwordError && (
                            <p className="text-sm text-red-600">{passwordError}</p>
                          )}
                          {passwordSuccess && (
                            <p className="text-sm text-emerald-600">
                              Password updated successfully.
                            </p>
                          )}
                          <div className="pt-2">
                            <button
                              type="submit"
                              disabled={passwordSaving}
                              className="rounded-xl bg-gradient-to-r from-purple-500 to-blue-500 px-5 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:from-purple-600 hover:to-blue-600 disabled:opacity-70 cursor-pointer"
                            >
                              {passwordSaving ? 'Updating…' : 'Update Password'}
                            </button>
                          </div>
                        </form>
                      )}
                    </>
                  )}

                  {/* My locations */}
                  {activeSection === 'locations' && (
                    <>
                      <h3 className="text-xl font-bold text-slate-900">
                        My locations
                      </h3>
                      <p className="mt-1 text-sm text-slate-500">
                        Manage your locations here
                      </p>
                      {locationsLoading ? (
                        <div className="mt-6 flex flex-col items-center justify-center py-12">
                          <div className="h-8 w-8 animate-spin rounded-full border-2 border-purple-200 border-t-purple-500" />
                          <p className="mt-3 text-sm text-slate-500">Loading your locations…</p>
                        </div>
                      ) : userLocations.length === 0 ? (
                        <div className="mt-6 rounded-xl border border-dashed border-slate-200 bg-slate-50/50 py-12 text-center">
                          <FiMapPin className="mx-auto h-10 w-10 text-slate-400" />
                          <p className="mt-3 text-sm font-medium text-slate-700">No locations yet</p>
                          <p className="mt-1 text-sm text-slate-500">Add locations from the home page.</p>
                          <button
                            type="button"
                            onClick={() => router.push('/home')}
                            className="mt-4 inline-flex items-center gap-2 rounded-xl bg-gradient-to-r from-purple-500 to-blue-500 px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:from-purple-600 hover:to-blue-600 cursor-pointer"
                          >
                            Go to Home
                          </button>
                        </div>
                      ) : (
                        <div className="mt-6 space-y-4">
                          <p className="text-sm text-slate-600">
                            {userLocations.length} location{userLocations.length !== 1 ? 's' : ''}
                          </p>
                          <ul className="grid gap-4 sm:grid-cols-2">
                            {userLocations.map((loc) => (
                              <li
                                key={loc.id}
                                className="group/card relative flex overflow-hidden rounded-xl border border-slate-200/80 bg-white shadow-sm transition hover:shadow-md"
                              >
                                <div className="h-24 w-24 flex-shrink-0 overflow-hidden bg-slate-100">
                                  {loc.image ? (
                                    <img
                                      src={loc.image}
                                      alt={loc.address}
                                      className="h-full w-full object-cover"
                                    />
                                  ) : (
                                    <div className="flex h-full w-full items-center justify-center bg-slate-200">
                                      <FiMapPin className="h-8 w-8 text-slate-400" />
                                    </div>
                                  )}
                                </div>
                                <div className="min-w-0 flex-1 p-3">
                                  <p className="truncate text-sm font-semibold text-slate-900">{loc.address}</p>
                                  <p className="mt-0.5 text-xs text-slate-500">
                                    {loc.city}, {loc.zip}
                                  </p>
                                  <div className="mt-2 flex flex-wrap gap-1">
                                    {loc.badge?.letter &&
                                      (loc.badge.color.startsWith('#') ? (
                                        <span
                                          className="inline-flex h-6 w-6 items-center justify-center rounded-full text-xs font-bold text-white"
                                          style={{ backgroundColor: loc.badge.color }}
                                        >
                                          {loc.badge.letter}
                                        </span>
                                      ) : (
                                        <span
                                          className={`inline-flex h-6 w-6 items-center justify-center rounded-full text-xs font-bold text-white ${loc.badge.color}`}
                                        >
                                          {loc.badge.letter}
                                        </span>
                                      ))}
                                    {loc.tags.slice(0, 3).map((tag, i) => (
                                      <span
                                        key={i}
                                        className="rounded-full bg-slate-100 px-2 py-0.5 text-xs text-slate-600"
                                      >
                                        {tag}
                                      </span>
                                    ))}
                                  </div>
                                </div>
                                {/* Edit / Delete on hover */}
                                <div className="absolute right-2 top-2 flex gap-1.5 opacity-0 transition-opacity duration-200 group-hover/card:opacity-100">
                                  <button
                                    type="button"
                                    onClick={() => openEditModal(loc)}
                                    className="flex h-8 w-8 items-center justify-center rounded-lg bg-white/95 text-slate-600 shadow-md backdrop-blur-sm transition hover:bg-purple-50 hover:text-purple-600 cursor-pointer"
                                    aria-label="Edit location"
                                  >
                                    <FiEdit2 className="h-4 w-4" />
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() => setDeleteConfirmId(loc.id)}
                                    className="flex h-8 w-8 items-center justify-center rounded-lg bg-white/95 text-slate-600 shadow-md backdrop-blur-sm transition hover:bg-red-50 hover:text-red-600 cursor-pointer"
                                    aria-label="Delete location"
                                  >
                                    <FiTrash2 className="h-4 w-4" />
                                  </button>
                                </div>
                              </li>
                            ))}
                          </ul>
                          <button
                            type="button"
                            onClick={() => router.push('/home')}
                            className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-medium text-slate-700 shadow-sm transition hover:bg-slate-50 cursor-pointer"
                          >
                            View all on home
                          </button>
                        </div>
                      )}
                    </>
                  )}

                  {/* Subscription */}
                  {activeSection === 'subscription' && (
                    <>
                      <h3 className="text-xl font-bold text-slate-900">
                        Subscription
                      </h3>
                      <p className="mt-1 text-sm text-slate-500">
                        Manage your plan and billing.
                      </p>
                      {subscription ? (
                        <div className="mt-6 space-y-4">
                          <div className="grid grid-cols-2 gap-4 sm:grid-cols-3">
                            <div className="rounded-xl bg-slate-50/80 p-3">
                              <p className="text-xs font-medium uppercase tracking-wider text-slate-500">
                                Status
                              </p>
                              <p
                                className={`mt-1 font-semibold ${
                                  isActive ? 'text-emerald-600' : 'text-amber-600'
                                }`}
                              >
                                {subscriptionStatusLabel}
                              </p>
                            </div>
                            <div className="rounded-xl bg-slate-50/80 p-3">
                              <p className="text-xs font-medium uppercase tracking-wider text-slate-500">
                                Plan
                              </p>
                              <p className="mt-1 font-semibold capitalize text-slate-900">
                                {isTrialing ? 'Free Trial' : (subscription.planType || '—')}
                              </p>
                            </div>
                            <div className="col-span-2 rounded-xl bg-slate-50/80 p-3 sm:col-span-1">
                              <p className="text-xs font-medium uppercase tracking-wider text-slate-500">
                                {isTrialing ? 'Trial ends' : 'Renews'}
                              </p>
                              <p className="mt-1 font-medium text-slate-700">
                                {formatDate(subscription.currentPeriodEnd)}
                              </p>
                            </div>
                          </div>
                          {isTrialing ? (
                            <>
                              <p className="pt-2 text-sm text-slate-600">
                                Your free trial ends on{' '}
                                <strong>{formatDate(subscription?.currentPeriodEnd)}</strong>.
                                Subscribe to continue after your trial.
                              </p>
                              <div className="mt-4 grid gap-4 sm:grid-cols-2">
                                {/* Monthly - same details as packages page */}
                                <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
                                  <h4 className="text-xl font-bold text-slate-900">Monthly</h4>
                                  <div className="mt-2 mb-4">
                                    <span className="text-3xl font-extrabold text-slate-900">$17</span>
                                    <span className="text-slate-600 ml-1">/month</span>
                                  </div>
                                  <ul className="space-y-2 mb-6">
                                    <li className="flex items-center text-slate-700 text-sm">
                                      <svg className="w-4 h-4 text-green-500 mr-2 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                                      </svg>
                                      Full access to all features
                                    </li>
                                    <li className="flex items-center text-slate-700 text-sm">
                                      <svg className="w-4 h-4 text-green-500 mr-2 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                                      </svg>
                                      Cancel anytime
                                    </li>
                                    <li className="flex items-center text-slate-700 text-sm">
                                      <svg className="w-4 h-4 text-green-500 mr-2 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                                      </svg>
                                      Priority support
                                    </li>
                                  </ul>
                                  <button
                                    type="button"
                                    onClick={() => handleSubscribe('monthly')}
                                    disabled={subscribeLoading !== null}
                                    className="w-full rounded-xl bg-gradient-to-r from-purple-500 to-blue-500 px-4 py-3 text-sm font-semibold text-white shadow-sm transition hover:from-purple-600 hover:to-blue-600 disabled:opacity-70 disabled:cursor-not-allowed cursor-pointer"
                                  >
                                    {subscribeLoading === 'monthly' ? (
                                      <span className="inline-flex items-center gap-2">
                                        <span className="h-4 w-4 animate-spin rounded-full border-2 border-white border-t-transparent" />
                                        Redirecting…
                                      </span>
                                    ) : (
                                      'Subscribe Monthly'
                                    )}
                                  </button>
                                </div>
                                {/* Yearly - same details as packages page */}
                                <div className="relative rounded-2xl border border-purple-200 bg-gradient-to-br from-purple-50 to-blue-50 p-6 shadow-sm">
                                  <span className="absolute top-3 right-3 bg-yellow-400 text-yellow-900 px-2 py-0.5 rounded-full text-xs font-bold">
                                    BEST VALUE
                                  </span>
                                  <h4 className="text-xl font-bold text-slate-900">Yearly</h4>
                                  <div className="mt-2 mb-1">
                                    <span className="text-3xl font-extrabold text-slate-900">$175</span>
                                    <span className="text-slate-600 ml-1">/year</span>
                                  </div>
                                  <p className="text-sm text-slate-600 mb-4">Save $29 per year (14% off)</p>
                                  <ul className="space-y-2 mb-6">
                                    <li className="flex items-center text-slate-700 text-sm">
                                      <svg className="w-4 h-4 text-green-500 mr-2 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                                      </svg>
                                      Everything in Monthly
                                    </li>
                                    <li className="flex items-center text-slate-700 text-sm">
                                      <svg className="w-4 h-4 text-green-500 mr-2 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                                      </svg>
                                      Save 14% annually
                                    </li>
                                    <li className="flex items-center text-slate-700 text-sm">
                                      <svg className="w-4 h-4 text-green-500 mr-2 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                                      </svg>
                                      Best value for long-term
                                    </li>
                                  </ul>
                                  <button
                                    type="button"
                                    onClick={() => handleSubscribe('yearly')}
                                    disabled={subscribeLoading !== null}
                                    className="w-full rounded-xl bg-gradient-to-r from-purple-500 to-blue-500 px-4 py-3 text-sm font-semibold text-white shadow-sm transition hover:from-purple-600 hover:to-blue-600 disabled:opacity-70 disabled:cursor-not-allowed cursor-pointer"
                                  >
                                    {subscribeLoading === 'yearly' ? (
                                      <span className="inline-flex items-center gap-2">
                                        <span className="h-4 w-4 animate-spin rounded-full border-2 border-white border-t-transparent" />
                                        Redirecting…
                                      </span>
                                    ) : (
                                      'Subscribe Yearly'
                                    )}
                                  </button>
                                </div>
                              </div>
                              {subscribeError && (
                                <p className="mt-3 text-sm text-red-600">{subscribeError}</p>
                              )}
                            </>
                          ) : (
                            <div className="flex flex-col gap-2 pt-2 sm:flex-row sm:items-center">
                              <button
                                type="button"
                                onClick={handleManageSubscription}
                                disabled={portalLoading}
                                className="inline-flex items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-purple-500 to-blue-500 px-4 py-3 text-sm font-semibold text-white shadow-sm transition hover:from-purple-600 hover:to-blue-600 disabled:opacity-70 disabled:cursor-not-allowed cursor-pointer"
                              >
                                {portalLoading ? (
                                  <>
                                    <span className="h-4 w-4 animate-spin rounded-full border-2 border-white border-t-transparent" />
                                    Opening…
                                  </>
                                ) : (
                                  <>
                                    <FiExternalLink className="h-4 w-4" />
                                    Manage subscription
                                  </>
                                )}
                              </button>
                              {portalError && (
                                <p className="text-sm text-red-600">{portalError}</p>
                              )}
                            </div>
                          )}
                        </div>
                      ) : (
                        <p className="mt-6 text-slate-500">
                          No subscription data available.
                        </p>
                      )}
                    </>
                  )}
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Delete location confirmation */}
        {deleteConfirmId && (
          <Modal open onClose={() => { if (!deleteLoading) { setDeleteConfirmId(null); setEditError(null); } }}>
            <div className="w-full max-w-md rounded-2xl border border-slate-200 bg-white p-6 shadow-xl">
              <div className="flex items-center gap-3">
                <div className="flex h-12 w-12 items-center justify-center rounded-full bg-red-100">
                  <FiTrash2 className="h-6 w-6 text-red-600" />
                </div>
                <div>
                  <h3 className="text-lg font-bold text-slate-900">Delete location?</h3>
                  <p className="text-sm text-slate-500">This cannot be undone.</p>
                </div>
              </div>
              {editError && (
                <p className="mt-3 text-sm text-red-600">{editError}</p>
              )}
              <div className="mt-6 flex gap-3">
                <button
                  type="button"
                  onClick={() => !deleteLoading && setDeleteConfirmId(null)}
                  disabled={deleteLoading}
                  className="flex-1 rounded-xl border border-slate-200 px-4 py-2.5 text-sm font-medium text-slate-700 transition hover:bg-slate-50 disabled:opacity-70 cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={() => deleteConfirmId && handleDeleteLocation(deleteConfirmId)}
                  disabled={deleteLoading}
                  className="flex-1 rounded-xl bg-red-600 px-4 py-2.5 text-sm font-medium text-white transition hover:bg-red-700 disabled:opacity-70 cursor-pointer"
                >
                  {deleteLoading ? 'Deleting…' : 'Delete'}
                </button>
              </div>
            </div>
          </Modal>
        )}

        {/* Edit location modal - same layout as home Add New Location */}
        {editingLocation && (
          <Modal open onClose={() => !editSaving && setEditingLocation(null)}>
            <form
              onSubmit={handleSaveEdit}
              className="bg-white rounded-3xl shadow-2xl w-full flex flex-col relative z-10 max-w-5xl"
            >
              <div className="flex items-center justify-between px-8 pt-8 pb-6 border-b border-gray-200">
                <div>
                  <h2 className="text-3xl font-bold text-gray-900">Edit Location</h2>
                  <p className="text-sm text-gray-500 mt-1.5">Update the details for this location</p>
                </div>
                <button
                  type="button"
                  onClick={() => !editSaving && setEditingLocation(null)}
                  className="text-gray-400 hover:text-gray-600 transition-colors p-2 hover:bg-gray-100 rounded-full cursor-pointer"
                  aria-label="Close"
                >
                  <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>

              <div className="px-8 py-6 grid grid-cols-1 lg:grid-cols-2 gap-8">
                {/* Left - Property Image */}
                <div className="flex flex-col gap-4">
                  <label className="text-sm font-semibold text-gray-700">Property Image</label>
                  {editImagePreview ? (
                    <div className="relative group h-64">
                      <img
                        src={editImagePreview}
                        alt="Preview"
                        className="w-full h-full object-cover rounded-xl border-2 border-gray-200"
                      />
                      <button
                        type="button"
                        onClick={() => editFileInputRef.current?.click()}
                        className="absolute top-3 right-10 bg-white/90 text-gray-700 p-2 rounded-full hover:bg-gray-100 transition shadow-lg opacity-0 group-hover:opacity-100 cursor-pointer border border-gray-200"
                        aria-label="Change image"
                      >
                        <FiEdit2 className="w-5 h-5" />
                      </button>
                      <button
                        type="button"
                        onClick={() => { setEditImageFile(null); setEditImagePreview(''); }}
                        className="absolute top-3 right-3 bg-red-500 text-white p-2 rounded-full hover:bg-red-600 transition shadow-lg opacity-0 group-hover:opacity-100 cursor-pointer"
                        aria-label="Remove image"
                      >
                        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                        </svg>
                      </button>
                      <input
                        ref={editFileInputRef}
                        type="file"
                        accept="image/*"
                        className="hidden"
                        onChange={(e) => e.target.files?.[0] && handleEditImageSelect(e.target.files[0])}
                      />
                    </div>
                  ) : (
                    <div
                      onDragEnter={(e) => { e.preventDefault(); e.stopPropagation(); setEditDragActive(true); }}
                      onDragLeave={(e) => { e.preventDefault(); e.stopPropagation(); setEditDragActive(false); }}
                      onDragOver={(e) => { e.preventDefault(); e.stopPropagation(); }}
                      onDrop={(e) => {
                        e.preventDefault();
                        e.stopPropagation();
                        setEditDragActive(false);
                        const file = e.dataTransfer.files?.[0];
                        if (file) handleEditImageSelect(file);
                      }}
                      className={`border-2 border-dashed rounded-xl p-6 text-center transition-all h-64 flex items-center justify-center cursor-pointer ${
                        editDragActive ? 'border-purple-500 bg-purple-50' : 'border-gray-300 hover:border-purple-400 hover:bg-gray-50'
                      }`}
                    >
                      <div className="flex flex-col items-center gap-3">
                        <div className="w-14 h-14 rounded-full bg-gradient-to-br from-purple-400 to-blue-400 flex items-center justify-center">
                          <svg className="w-7 h-7 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
                          </svg>
                        </div>
                        <p className="text-gray-700 font-medium text-sm">Drag & drop an image here</p>
                        <p className="text-xs text-gray-500">or</p>
                        <button
                          type="button"
                          onClick={() => editFileInputRef.current?.click()}
                          className="px-5 py-2 bg-gradient-to-r from-purple-400 to-blue-400 text-white font-semibold rounded-lg hover:from-purple-500 hover:to-blue-500 transition shadow-md text-sm cursor-pointer"
                        >
                          Browse Files
                        </button>
                        <input
                          ref={editFileInputRef}
                          type="file"
                          accept="image/*"
                          className="hidden"
                          onChange={(e) => e.target.files?.[0] && handleEditImageSelect(e.target.files[0])}
                        />
                      </div>
                    </div>
                  )}
                </div>

                {/* Right - Form fields */}
                <div className="flex flex-col gap-5">
                  <div className="flex flex-col gap-4">
                    <InputField
                      name="address"
                      type="text"
                      placeholder="Full Address"
                      value={editForm.address}
                      onChange={(e) => setEditForm((f) => ({ ...f, address: e.target.value }))}
                      required
                    />
                    <div className="grid grid-cols-2 gap-4">
                      <InputField
                        name="city"
                        type="text"
                        placeholder="City"
                        value={editForm.city}
                        onChange={(e) => setEditForm((f) => ({ ...f, city: e.target.value }))}
                        required
                      />
                      <InputField
                        name="zip"
                        type="text"
                        placeholder="ZIP Code"
                        value={editForm.zip}
                        onChange={(e) => setEditForm((f) => ({ ...f, zip: e.target.value }))}
                        required
                      />
                    </div>
                    <InputField
                      name="tags"
                      type="text"
                      placeholder="Tags (comma separated)"
                      value={editForm.tags}
                      onChange={(e) => setEditForm((f) => ({ ...f, tags: e.target.value }))}
                    />
                  </div>

                  <div className="flex flex-col gap-3">
                    <label className="block text-sm font-semibold text-gray-700">
                      Grade <span className="text-red-500">*</span>
                    </label>
                    <div className="flex gap-3">
                      {['A', 'B', 'C', 'D', 'F'].map((letter) => (
                        <button
                          key={letter}
                          type="button"
                          onClick={() => setEditForm((f) => ({ ...f, badgeLetter: letter }))}
                          className={`flex-1 px-4 py-3 rounded-xl font-bold text-lg transition-all shadow-sm border-2 cursor-pointer ${
                            editForm.badgeLetter === letter
                              ? 'bg-gradient-to-r from-purple-400 to-blue-400 text-white border-purple-500 shadow-md scale-105'
                              : 'bg-white text-gray-700 border-gray-300 hover:border-purple-300 hover:bg-purple-50'
                          }`}
                        >
                          {letter}
                        </button>
                      ))}
                    </div>
                    <p className="text-xs text-gray-500">Select a grade for this property</p>
                  </div>

                  {editError && (
                    <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg text-sm flex items-center gap-2">
                      <svg className="w-5 h-5 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                      </svg>
                      <span>{editError}</span>
                    </div>
                  )}
                </div>
              </div>

              <div className="flex gap-3 px-8 pb-8 pt-6 border-t border-gray-200">
                <button
                  type="button"
                  onClick={() => !editSaving && setEditingLocation(null)}
                  disabled={editSaving}
                  className="flex-1 px-6 py-3 border-2 border-gray-300 text-gray-700 font-semibold rounded-xl hover:bg-gray-50 transition cursor-pointer disabled:cursor-not-allowed"
                >
                  Cancel
                </button>
                <Button type="submit" disabled={editSaving} className="flex-1">
                  {editSaving ? (
                    <span className="flex items-center justify-center">
                      <svg className="animate-spin h-5 w-5 mr-2 text-white" viewBox="0 0 24 24">
                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z" />
                      </svg>
                      Saving...
                    </span>
                  ) : (
                    <span className="flex items-center justify-center gap-2">
                      <FiCheck className="w-5 h-5" />
                      Save Changes
                    </span>
                  )}
                </Button>
              </div>
            </form>
          </Modal>
        )}
      </div>
    </ProtectedRoute>
  );
}
