'use client';

import { useState, useEffect, ChangeEvent, FormEvent, useRef, useMemo } from 'react';
import { FiPlus, FiSearch, FiCheckCircle, FiDownload, FiLogOut, FiUser, FiGrid, FiClock } from 'react-icons/fi';
import Card from '../components/Card';
import Button from '../components/Button';
import Modal from '../components/Modal';
import InputField from '../components/InputField';
import { GoogleMap, Marker, useLoadScript } from '@react-google-maps/api';
import ProtectedRoute from '../components/ProtectedRoute';
import { db, storage, auth } from '../../firebase';
import { collection, addDoc, onSnapshot, query, serverTimestamp } from "firebase/firestore";
import { ref, uploadBytes, getDownloadURL } from "firebase/storage";
import { signOut } from "firebase/auth";
import { useAuth } from '../../hooks/useAuth';
import { useUserData } from '../../hooks/useUserData';
import { useSubscription } from '../../hooks/useSubscription';
import { useRouter } from 'next/navigation';
import Image from 'next/image';
// import { Timestamp } from '@google-cloud/firestore';

// Card type
interface CardType {
  id: string;
  image: string;
  city: string;
  zip: string;
  address: string;
  badge: { letter: string; color: string };
  tags: string[];
  lat?: number;
  lng?: number;
}

export default function HomePage() {
  // Memoize the load script options to prevent multiple script loads
  // This ensures the options object doesn't change on re-renders
  const mapOptions = useMemo(() => ({
    googleMapsApiKey: process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY || "",
  }), []); // Empty dependency array - only create once

  const { isLoaded } = useLoadScript(mapOptions);

  const [cards, setCards] = useState<CardType[]>([]);
  const [search, setSearch] = useState('');
  const [showModal, setShowModal] = useState(false);
  const [viewMode, setViewMode] = useState<'cards' | 'map'>('cards');
  const [loading, setLoading] = useState(true);
  const { user } = useAuth();
  const { userData } = useUserData(user);
  const { subscription } = useSubscription();
  const [addLoading, setAddLoading] = useState(false);
  const [trialTimeLeft, setTrialTimeLeft] = useState<string | null>(null);
  const [addError, setAddError] = useState<string | null>(null);
  const [showLogoutModal, setShowLogoutModal] = useState(false);
  const [logoutLoading, setLogoutLoading] = useState(false);
  const [showUserDropdown, setShowUserDropdown] = useState(false);
  const router = useRouter();

  // Get predefined color for a grade
  const getGradeColor = (grade: string): string => {
    const gradeColors: Record<string, string> = {
      'A': '#22c55e', // green
      'B': '#3b82f6', // blue
      'C': '#eab308', // yellow
      'D': '#f97316', // orange
      'F': '#ef4444'  // red
    };
    return gradeColors[grade.toUpperCase()] || '#6b7280';
  };

  // Fetch cards from Firestore
  useEffect(() => {
    const q = query(collection(db, "cards"));
    const unsubscribe = onSnapshot(q, (querySnapshot) => {
      const cardsArr: CardType[] = [];
      querySnapshot.forEach((doc) => {
        const data = doc.data();
        // Ensure lat and lng are numbers (in case they're stored differently)
        const cardData: CardType = {
          id: doc.id,
          ...data,
          lat: typeof data.lat === 'number' ? data.lat : undefined,
          lng: typeof data.lng === 'number' ? data.lng : undefined,
        } as CardType;
        cardsArr.push(cardData);
      });
      setCards(cardsArr);
      setLoading(false);
    });
    return () => unsubscribe();
  }, []);

  // Handle logout
  const handleLogout = async () => {
    setLogoutLoading(true);
    try {
      // Clear user data from localStorage
      localStorage.removeItem('clientcheck_user_data');
      await signOut(auth);
      // Redirect to login page after successful logout
      router.push('/');
    } catch (error: any) {
      console.error('Logout error:', error);
      setAddError(error.message || 'Failed to logout. Please try again.');
      setLogoutLoading(false);
    }
  };

  // Export cards as CSV
  const handleExport = () => {
    const csvRows = [
      ['City', 'ZIP', 'Address', 'Tags'],
      ...cards.map(card => [
        card.city,
        card.zip,
        card.address,
        card.tags.join('; ')
      ])
    ];
    const csvContent = csvRows.map(row => row.map(field => `"${String(field).replace(/"/g, '""')}"`).join(',')).join('\n');
    const blob = new Blob([csvContent], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'Locations.csv';
    a.click();
    URL.revokeObjectURL(url);
  };

  // Filter cards by search
  const filteredCards = cards.filter(card =>
    card.address.toLowerCase().includes(search.toLowerCase()) ||
    card.city.toLowerCase().includes(search.toLowerCase()) ||
    card.zip.includes(search)
  );


  // Handle add card
  const handleAddCard = async (
    card: Omit<CardType, 'id' | 'badge' | 'lat' | 'lng'>,
    imageFile: File | null,
    badgeLetter: string,
    onSuccess: () => void,
    onError: (msg: string) => void
  ) => {
    if (!user) return;
    setAddLoading(true);
    setAddError(null);
    let lat = 39.8283, lng = -98.5795; // fallback: center of USA
    try {
      // Use Google Geocoding API
      const apiKey = process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY || "";
      if (!apiKey) {
        throw new Error("Google Maps API key is not configured");
      }
      const geoRes = await fetch(
        `https://maps.googleapis.com/maps/api/geocode/json?address=${encodeURIComponent(card.zip)}&key=${apiKey}`
      );
      const geoData = await geoRes.json();
      if (geoData.status === "OK" && geoData.results.length > 0) {
        lat = geoData.results[0].geometry.location.lat;
        lng = geoData.results[0].geometry.location.lng;
      } else {
        throw new Error("Could not find location for ZIP code.");
      }

      // Upload image to Firebase Storage if provided
      let imageUrl = card.image;
      if (imageFile) {
        const imageRef = ref(storage, `cards/${user.uid}/${Date.now()}_${imageFile.name}`);
        await uploadBytes(imageRef, imageFile);
        imageUrl = await getDownloadURL(imageRef);
      }

      await addDoc(collection(db, "cards"), {
        ...card,
        image: imageUrl,
        badge: {
          letter: badgeLetter.toUpperCase(), // Use the selected badge letter
          color: getGradeColor(badgeLetter) // Use saved color for the grade
        },
        lat,
        lng,
        createdAt: serverTimestamp(),
        createdBy: user.uid,
      });
      onSuccess();
    } catch (e: any) {
      onError(e.message || "Failed to add card.");
    } finally {
      setAddLoading(false);
    }
  };

  // Map pins from actual cards with card IDs for proper keying
  const pins = cards
    .filter(card => card.lat && card.lng && typeof card.lat === 'number' && typeof card.lng === 'number')
    .map(card => ({
      id: card.id,
      lat: card.lat!,
      lng: card.lng!,
      label: card.badge.letter,
      address: card.address,
      city: card.city,
    }));

  // Calculate map center and bounds from pins
  const mapCenter = useMemo(() => {
    if (pins.length === 0) {
      return { lat: 39.8283, lng: -98.5795 }; // Default: center of USA
    }
    if (pins.length === 1) {
      return { lat: pins[0].lat, lng: pins[0].lng };
    }
    // Calculate average center for multiple pins
    const avgLat = pins.reduce((sum, pin) => sum + pin.lat, 0) / pins.length;
    const avgLng = pins.reduce((sum, pin) => sum + pin.lng, 0) / pins.length;
    return { lat: avgLat, lng: avgLng };
  }, [pins]);

  // Calculate appropriate zoom level
  const mapZoom = useMemo(() => {
    if (pins.length === 0) return 4;
    if (pins.length === 1) return 12;
    // For multiple pins, calculate bounds-based zoom would be ideal
    // For now, use a reasonable default
    return pins.length <= 5 ? 10 : 8;
  }, [pins.length]);

  // Trial countdown: update every second when user is trialing
  const trialEndMs = subscription?.status === 'trialing' && subscription?.currentPeriodEnd?.seconds != null
    ? subscription.currentPeriodEnd.seconds * 1000
    : null;
  useEffect(() => {
    if (trialEndMs == null) {
      setTrialTimeLeft(null);
      return;
    }
    const formatLeft = () => {
      const now = Date.now();
      const diff = Math.max(0, trialEndMs - now);
      if (diff <= 0) {
        return 'Ended';
      }
      const d = Math.floor(diff / 86400000);
      const h = Math.floor((diff % 86400000) / 3600000);
      const m = Math.floor((diff % 3600000) / 60000);
      const s = Math.floor((diff % 60000) / 1000);
      if (d > 0) return `${d}d ${h}h ${m}m ${s}s`;
      if (h > 0) return `${h}h ${m}m ${s}s`;
      if (m > 0) return `${m}m ${s}s`;
      return `${s}s`;
    };
    setTrialTimeLeft(formatLeft());
    const interval = setInterval(() => setTrialTimeLeft(formatLeft()), 1000);
    return () => clearInterval(interval);
  }, [trialEndMs]);

  // Apply home-page class for themed scrollbar
  useEffect(() => {
    document.documentElement.classList.add('home-page');
    return () => document.documentElement.classList.remove('home-page');
  }, []);

  if (!isLoaded) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50">
        <div className="h-10 w-10 animate-spin rounded-full border-2 border-slate-200 border-t-indigo-500" />
      </div>
    );
  }

  return (
    <ProtectedRoute>
      <div className="min-h-screen bg-slate-50/90">
        {/* Subtle background */}
        <div className="fixed inset-0 -z-10 bg-[radial-gradient(ellipse_80%_50%_at_50%_-20%,rgba(99,102,241,0.08),transparent)]" aria-hidden />
        <div className="fixed inset-0 -z-10 bg-[linear-gradient(to_right,#e2e8f0_1px,transparent_1px),linear-gradient(to_bottom,#e2e8f0_1px,transparent_1px)] bg-[size:3rem_3rem] [mask-image:radial-gradient(ellipse_70%_50%_at_50%_0%,#000_60%,transparent_110%)] opacity-30" aria-hidden />

        {/* Header */}
        <header className="sticky top-0 z-30 flex-shrink-0 bg-white/80 backdrop-blur border-b border-blue-200 shadow-md px-8">
          <div className="flex max-w items-center justify-between gap-4 py-5 px-3 sm:px-2 lg:px-4">
            <div className="flex min-w-0 items-center gap-3">
              <Image src="/logo.png" alt="Client Check" width={44} height={44} className="h-12 w-12 flex-shrink-0 object-contain" />
              <div className="flex items-start gap-0.5 flex-col ">
                <span className="truncate text-lg font-bold tracking-tight text-slate-900 sm:text-xl">Client Check</span>
                <span className="text-sm text-slate-500 text-left">Your trusted location dashboard</span>
              </div>
            </div>
            <div className="flex items-center gap-3 sm:gap-4">
              {/* Trial countdown + View toggle */}
              <div className="flex items-center gap-2">
                {trialTimeLeft != null && (
                  <div className="relative group">
                    <span className="pointer-events-none absolute top-full left-1/2 mt-2 hidden -translate-x-1/2 whitespace-nowrap rounded-lg bg-slate-800 px-3 py-2 text-xs font-medium text-white opacity-0 shadow-lg transition group-hover:opacity-100 sm:block">
                      Trial period
                    </span>
                    <button
                      type="button"
                      onClick={() => router.push('/profile?section=subscription')}
                      className="flex items-center gap-2 px-3 py-2 rounded-lg bg-slate-100/80 ring-1 ring-slate-200/50 text-slate-600 transition hover:bg-slate-200/80 hover:ring-slate-300/60 cursor-pointer"
                    >
                      <FiClock className="w-4 h-4 shrink-0 text-indigo-500/80" strokeWidth={2} />
                      <span className="text-sm font-medium tabular-nums text-slate-700">{trialTimeLeft}</span>
                    </button>
                  </div>
                )}
                <div
                  className="inline-flex rounded-lg bg-slate-100 p-0.5"
                  role="tablist"
                  aria-label="View mode"
                >
                <button
                  type="button"
                  role="tab"
                  aria-selected={viewMode === 'cards'}
                  aria-label="View as location cards"
                  onClick={() => setViewMode('cards')}
                  className={`inline-flex items-center gap-1.5 rounded-md px-3 py-2 text-sm font-medium transition-all duration-200 cursor-pointer ${
                    viewMode === 'cards'
                      ? 'bg-white text-slate-900 shadow-sm ring-1 ring-slate-200/80'
                      : 'text-slate-500 hover:text-slate-700'
                  }`}
                >
                  <Image src="/home-icon.png" alt="" width={16} height={16} className="h-4 w-4 shrink-0 object-contain" />
                  <span>Locations</span>
                </button>
                <button
                  type="button"
                  role="tab"
                  aria-selected={viewMode === 'map'}
                  aria-label="View on map"
                  onClick={() => setViewMode('map')}
                  className={`inline-flex items-center gap-1.5 rounded-md px-3 py-2 text-sm font-medium transition-all duration-200 cursor-pointer ${
                    viewMode === 'map'
                      ? 'bg-white text-slate-900 shadow-sm ring-1 ring-slate-200/80'
                      : 'text-slate-500 hover:text-slate-700'
                  }`}
                >
                  <Image src="/maps-icon.png" alt="" width={16} height={16} className="h-4 w-4 shrink-0 object-contain" />
                  <span>Map</span>
                </button>
              </div>
              </div>
              {/* User dropdown */}
              <div className="relative">
                <button
                  type="button"
                  onClick={() => setShowUserDropdown(!showUserDropdown)}
                  className="flex items-center gap-3 px-3 py-2 rounded-xl border border-gray-200 bg-white hover:bg-gray-50 transition cursor-pointer shadow-sm cursor-pointer"
                  title="User menu"
                >
                  <div className="h-8 w-8 flex-shrink-0 overflow-hidden rounded-full bg-gradient-to-br from-indigo-500 to-violet-500 flex items-center justify-center text-sm font-semibold text-white">
                    {(userData?.imageUrl || user?.photoURL) ? (
                      <img src={userData?.imageUrl || user?.photoURL || ''} alt="" className="h-full w-full object-cover" />
                    ) : (
                      userData?.name?.[0]?.toUpperCase() || user?.email?.[0]?.toUpperCase() || 'U'
                    )}
                  </div>
                  <div className="hidden md:flex flex-col items-start text-left">
                    <span className="text-sm font-medium text-slate-900 leading-tight truncate max-w-[110px]">{userData?.name || 'User'}</span>
                    <span className="text-xs text-slate-500 truncate max-w-[110px]">{userData?.email || user?.email || ''}</span>
                  </div>
                  <svg className={`h-4 w-4 text-slate-400 transition-transform ${showUserDropdown ? 'rotate-180' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                  </svg>
                </button>
                {showUserDropdown && (
                  <>
                    <div className="fixed inset-0 z-40" onClick={() => setShowUserDropdown(false)} aria-hidden />
                    <div className="absolute right-0 z-50 mt-2 w-60 overflow-hidden rounded-xl border border-slate-200 bg-white shadow-lg">
                      <div className="border-b border-slate-100 bg-slate-50/80 px-4 py-3">
                        <div className="flex items-center gap-3">
                          <div className="h-10 w-10 flex-shrink-0 overflow-hidden rounded-full bg-gradient-to-br from-indigo-500 to-violet-500 flex items-center justify-center text-white font-semibold">
                            {(userData?.imageUrl || user?.photoURL) ? (
                              <img src={userData?.imageUrl || user?.photoURL || ''} alt="" className="h-full w-full object-cover" />
                            ) : (
                              userData?.name?.[0]?.toUpperCase() || user?.displayName?.[0]?.toUpperCase() || user?.email?.[0]?.toUpperCase() || 'U'
                            )}
                          </div>
                          <div className="min-w-0 flex-1">
                            <p className="truncate text-sm font-medium text-slate-900">{userData?.name || user?.displayName || 'User'}</p>
                            <p className="truncate text-xs text-slate-500">{userData?.email || user?.email || ''}</p>
                          </div>
                        </div>
                      </div>
                      {userData?.userType === 'admin' ? (
                        <button
                          type="button"
                          className="flex w-full items-center gap-3 px-4 py-2.5 text-left text-slate-700 transition hover:bg-indigo-50 hover:text-indigo-700 cursor-pointer"
                          onClick={() => { setShowUserDropdown(false); router.push('/dashboard'); }}
                        >
                          <Image src="/dashboard.png" alt="" width={20} height={20} className="h-5 w-5 object-contain opacity-80" />
                          <span className="font-medium">Dashboard</span>
                        </button>
                      ) : (
                        <button
                          type="button"
                          className="flex w-full items-center gap-3 px-4 py-2.5 text-left text-slate-700 transition hover:bg-indigo-50 hover:text-indigo-700 cursor-pointer"
                          onClick={() => { setShowUserDropdown(false); router.push('/profile'); }}
                        >
                          <Image src="/profile.png" alt="" width={20} height={20} className="h-5 w-5 object-contain opacity-80" />
                          <span className="font-medium">Profile</span>
                        </button>
                      )}
                      <button
                        type="button"
                        className="flex w-full items-center gap-3 px-4 py-2.5 text-left text-slate-700 transition hover:bg-red-50 hover:text-red-600 cursor-pointer"
                        onClick={() => { setShowUserDropdown(false); setShowLogoutModal(true); }}
                      >
                        <FiLogOut className="h-5 w-5" />
                        <span className="font-medium">Log out</span>
                      </button>
                    </div>
                  </>
                )}
              </div>
            </div>
          </div>
        </header>

        <main className="px-8 py-8">
          <div className="px-3 sm:px-2 lg:px-4">
          {/* Page title + toolbar */}
          <div className="mb-8">
            <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <h1 className="text-2xl font-bold tracking-tight text-slate-900 sm:text-2xl">Welcome {userData?.name || user?.displayName || 'User' } 👋</h1>
                <p className="mt-1 text-sm text-slate-500">
                  {viewMode === 'cards' ? 'Browse and manage locations' : 'View all locations on the map'}
                </p>
              </div>
              <div className="flex flex-wrap items-center gap-3">
                {/* <span className="inline-flex items-center rounded-full bg-slate-200/80 px-3.5 py-1 text-sm font-medium text-slate-700">
                  {filteredCards.length} location{filteredCards.length !== 1 ? 's' : ''} */}
                {/* </span> */}
                {viewMode === 'cards' && (
                  <>
                    <div className="relative w-full sm:w-72">
                      <FiSearch className="absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                      <input
                        type="text"
                        placeholder="Search city or ZIP..."
                        className="w-full rounded-xl border border-slate-200 bg-white py-2.5 pl-10 pr-4 text-sm text-slate-900 placeholder:text-slate-400 shadow-sm transition focus:border-indigo-400 focus:outline-none focus:ring-2 focus:ring-indigo-400/20"
                        value={search}
                        onChange={(e: ChangeEvent<HTMLInputElement>) => setSearch(e.target.value)}
                      />
                    </div>
                    <button
                      type="button"
                      onClick={handleExport}
                      className="flex items-center justify-center gap-2.5 rounded-xl border-2 border-slate-200 bg-white px-4 py-2.5 text-sm font-medium text-slate-700 shadow-sm transition hover:border-indigo-300 hover:bg-indigo-50 hover:text-indigo-700 focus:outline-none focus:ring-2 focus:ring-indigo-400 focus:ring-offset-2 flex-shrink-0 cursor-pointer"
                    >
                      <FiDownload className="h-5 w-5" />
                      <span>Export CSV</span>
                    </button>
                  </>
                )}
              </div>
            </div>
          </div>

          {/* Content */}
          {loading ? (
            <div className="flex flex-col items-center justify-center py-24">
              <div className="h-10 w-10 animate-spin rounded-full border-2 border-slate-200 border-t-indigo-500" />
              <p className="mt-4 text-sm text-slate-500">Loading locations…</p>
            </div>
          ) : viewMode === 'cards' ? (
            <>
              {filteredCards.length === 0 ? (
                <div className="flex flex-col items-center justify-center rounded-2xl border border-dashed border-slate-200 bg-white/80 py-16 text-center">
                  <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-slate-100">
                    <FiCheckCircle className="h-8 w-8 text-slate-400" />
                  </div>
                  <h2 className="mt-4 text-lg font-semibold text-slate-900">
                    {cards.length === 0 ? 'No locations yet' : 'No results found'}
                  </h2>
                  <p className="mt-2 max-w-sm text-sm text-slate-500">
                    {cards.length === 0 ? 'Add your first location to get started.' : 'Try a different search or clear the search.'}
                  </p>
                  {cards.length === 0 && (
                    <button
                      type="button"
                      onClick={() => setShowModal(true)}
                      className="mt-6 inline-flex items-center gap-2 rounded-xl bg-indigo-600 px-5 py-2.5 text-sm font-medium text-white shadow-sm transition hover:bg-indigo-700 cursor-pointer"
                    >
                      <FiPlus className="h-5 w-5 " />
                      Add location
                    </button>
                  )}
                </div>
              ) : (
                <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 xl:grid-cols-3">
                  {filteredCards.map((card, index) => (
                    <article
                      key={card.id}
                      className="group flex flex-col overflow-hidden rounded-2xl border border-slate-200/80 bg-white shadow-sm transition-all duration-300 hover:-translate-y-1 hover:shadow-lg animate-fadein"
                      style={{ animationDelay: `${0.05 + index * 0.04}s` }}
                    >
                      <div className="relative aspect-[4/3] overflow-hidden bg-slate-100">
                        {card.image ? (
                          <img
                            src={card.image}
                            alt={card.address}
                            className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-105"
                            onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }}
                          />
                        ) : (
                          <div className="flex h-full w-full items-center justify-center bg-gradient-to-br from-slate-100 to-slate-200">
                            <svg className="h-12 w-12 text-slate-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
                            </svg>
                          </div>
                        )}
                        {card.badge.color.startsWith('#') ? (
                          <span
                            className="absolute right-3 top-3 flex h-9 w-9 items-center justify-center rounded-full text-sm font-bold text-white shadow-md"
                            style={{ backgroundColor: card.badge.color }}
                          >
                            {card.badge.letter}
                          </span>
                        ) : (
                          <span className={`absolute right-3 top-3 flex h-9 w-9 items-center justify-center rounded-full text-sm font-bold text-white shadow-md ${card.badge.color}`}>
                            {card.badge.letter}
                          </span>
                        )}
                      </div>
                      <div className="flex flex-1 flex-col p-4">
                        <p className="text-xs font-medium uppercase tracking-wide text-slate-500">{card.city}, {card.zip}</p>
                        <h3 className="mt-1 line-clamp-2 text-base font-semibold leading-snug text-slate-900">{card.address}</h3>
                        {card.tags.length > 0 && (
                          <div className="mt-3 flex flex-wrap gap-1.5">
                            {card.tags.map((tag, i) => (
                              <span key={i} className="rounded-full bg-slate-100 px-2.5 py-0.5 text-xs font-medium text-slate-600">{tag}</span>
                            ))}
                          </div>
                        )}
                      </div>
                    </article>
                  ))}
                </div>
              )}
            </>
          ) : (
            <div className="overflow-hidden rounded-2xl border border-slate-200/80 bg-white shadow-sm">
              {pins.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-16 text-center">
                  <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-slate-100">
                    <Image src="/maps-icon.png" alt="" width={32} height={32} className="h-8 w-8 object-contain opacity-60" />
                  </div>
                  <h2 className="mt-4 text-lg font-semibold text-slate-900">No map data yet</h2>
                  <p className="mt-2 max-w-sm text-sm text-slate-500">Add locations with ZIP codes to see them on the map.</p>
                </div>
              ) : (
                <>
                  <div className="border-b border-slate-100 bg-slate-50/50 px-4 py-2 text-sm text-slate-600">
                    Showing {pins.length} location{pins.length !== 1 ? 's' : ''} on map
                  </div>
                  <div className="overflow-hidden">
                    <GoogleMap
                      mapContainerStyle={{ width: '100%', height: '560px' }}
                      center={mapCenter}
                      zoom={mapZoom}
                      options={{
                        mapTypeControl: true,
                        streetViewControl: true,
                        fullscreenControl: true,
                        zoomControl: true,
                      }}
                    >
                      {pins.map((pin) => (
                        <Marker
                          key={pin.id}
                          position={{ lat: pin.lat, lng: pin.lng }}
                          label={{ text: pin.label, color: '#ffffff', fontWeight: 'bold' }}
                          title={`${pin.address}, ${pin.city}`}
                          animation={window.google?.maps?.Animation?.DROP}
                        />
                      ))}
                    </GoogleMap>
                  </div>
                </>
              )}
            </div>
          )}
          </div>
        </main>

        {/* FAB */}
        {viewMode === 'cards' && (
          <div className="group fixed bottom-6 right-6 z-20 sm:bottom-8 sm:right-8">
            <span className="pointer-events-none absolute right-full mr-3 top-1/2 hidden -translate-y-1/2 whitespace-nowrap rounded-lg bg-slate-800 px-3 py-2 text-xs font-medium text-white opacity-0 shadow-lg transition group-hover:opacity-100 sm:block">
              Add location
            </span>
            <button
              type="button"
              onClick={() => setShowModal(true)}
              className="flex h-14 w-14 flex-shrink-0 items-center justify-center rounded-2xl bg-gradient-to-br from-indigo-500 to-violet-500 text-white shadow-lg shadow-indigo-500/30 transition hover:scale-105 hover:shadow-xl focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-2 cursor-pointer"
              aria-label="Add location"
            >
              <FiPlus className="h-7 w-7 flex-shrink-0" strokeWidth={2.5} />
            </button>
          </div>
        )}

        {/* Logout Confirmation Modal */}
        {showLogoutModal && (
          <Modal open={true} onClose={() => !logoutLoading && setShowLogoutModal(false)}>
            <div className="bg-white rounded-3xl shadow-2xl p-8 w-full max-w-md flex flex-col gap-6">
              <div className="flex items-center gap-4">
                <div className="w-12 h-12 rounded-full bg-red-100 flex items-center justify-center">
                  <FiLogOut className="text-red-600 text-2xl" />
                </div>
                <div>
                  <h2 className="text-2xl font-bold text-gray-900">Confirm Logout</h2>
                  <p className="text-sm text-gray-500 mt-1">Are you sure you want to logout?</p>
                </div>
              </div>
              
              <div className="bg-gray-50 rounded-xl p-4 border border-gray-200">
                <p className="text-sm text-gray-700">
                  You will need to login again to access your account.
                </p>
              </div>

              <div className="flex gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => setShowLogoutModal(false)}
                  className="flex-1 px-6 py-3 border-2 border-gray-300 text-gray-700 font-semibold rounded-xl hover:bg-gray-50 transition cursor-pointer disabled:cursor-not-allowed"
                  disabled={logoutLoading}
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={handleLogout}
                  disabled={logoutLoading}
                  className="flex-1 px-6 py-3 bg-gradient-to-r from-red-500 to-red-600 text-white font-semibold rounded-xl hover:from-red-600 hover:to-red-700 transition shadow-md disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer"
                >
                  {logoutLoading ? (
                    <span className="flex items-center justify-center">
                      <svg className="animate-spin h-5 w-5 mr-2 text-white" viewBox="0 0 24 24">
                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none"/>
                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z"/>
                      </svg>
                      Logging out...
                    </span>
                  ) : (
                    <span className="flex items-center justify-center gap-2">
                      <FiLogOut className="w-5 h-5" />
                      Logout
                    </span>
                  )}
                </button>
              </div>
            </div>
          </Modal>
        )}

        {/* Modal Form */}
        {showModal && (
          <ModalForm
            onClose={() => setShowModal(false)}
            onSubmit={(card, imageFile, badgeLetter, done, error) => handleAddCard(card, imageFile, badgeLetter, done, error)}
            loading={addLoading}
            error={addError}
          />
        )}
        <style jsx global>{`
          @keyframes fadein {
            from { opacity: 0; transform: translateY(20px); }
            to { opacity: 1; transform: none; }
          }
          .animate-fadein {
            animation: fadein 0.6s cubic-bezier(0.4,0,0.2,1) both;
          }
        `}</style>
      </div>
    </ProtectedRoute>
  );
}

// ModalForm component
interface ModalFormProps {
  onClose: () => void;
  onSubmit: (
    card: Omit<CardType, 'id' | 'badge' | 'lat' | 'lng'>,
    imageFile: File | null,
    badgeLetter: string,
    done: () => void,
    error: (msg: string) => void
  ) => void;
  loading: boolean;
  error: string | null;
}

function ModalForm({ onClose, onSubmit, loading, error }: ModalFormProps) {
  const [form, setForm] = useState({
    city: '',
    zip: '',
    address: '',
    tags: '',
    badgeLetter: 'A', // Default grade
  });
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [imagePreview, setImagePreview] = useState<string>('');
  const [dragActive, setDragActive] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleChange = (e: ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
    const { name, value, type, files } = e.target as HTMLInputElement;
    if (type === 'file' && files && files[0]) {
      handleImageSelect(files[0]);
    } else {
      setForm(prev => ({ ...prev, [name]: value }));
    }
  };

  const handleImageSelect = (file: File) => {
    if (file && file.type.startsWith('image/')) {
      setImageFile(file);
      const reader = new FileReader();
      reader.onload = (ev) => {
        setImagePreview(ev.target?.result as string);
      };
      reader.readAsDataURL(file);
    }
  };

  const handleDrag = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.type === "dragenter" || e.type === "dragover") {
      setDragActive(true);
    } else if (e.type === "dragleave") {
      setDragActive(false);
    }
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(false);
    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      handleImageSelect(e.dataTransfer.files[0]);
    }
  };

  const removeImage = () => {
    setImageFile(null);
    setImagePreview('');
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  const handleSubmit = (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
  
    const processedTags = form.tags.split(',').map(t => t.trim()).filter(Boolean);
    const submissionData = {
      image: '', // Will be replaced with Firebase Storage URL
      city: form.city,
      zip: form.zip,
      address: form.address,
      tags: processedTags,
    };
  
    onSubmit(
      submissionData,
      imageFile,
      form.badgeLetter,
      () => {
        // Reset form on success
        setForm({ city: '', zip: '', address: '', tags: '', badgeLetter: 'A' });
        setImageFile(null);
        setImagePreview('');
        onClose();
      },
      (error?: any) => {
        console.error('Form submission failed:', error);
      }
    );
  };
  
  return (
    <Modal open={true} onClose={onClose}>
      <form onSubmit={handleSubmit} className="bg-white rounded-3xl shadow-2xl w-full flex flex-col relative z-10">
        {/* Header */}
        <div className="flex items-center justify-between px-8 pt-8 pb-6 border-b border-gray-200">
          <div>
            <h2 className="text-3xl font-bold text-gray-900">Add New Location</h2>
            <p className="text-sm text-gray-500 mt-1.5">Fill in the details to create a new lcoation</p>
          </div>
          <button 
            type="button" 
            onClick={onClose} 
            className="text-gray-400 hover:text-gray-600 transition-colors p-2 hover:bg-gray-100 rounded-full"
            aria-label="Close"
          >
            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Main Content - Two Column Layout */}
        <div className="px-8 py-6 grid grid-cols-1 lg:grid-cols-2 gap-8">
          {/* Left Column - Image Upload */}
          <div className="flex flex-col gap-4">
              <label className="text-sm font-semibold text-gray-700">Property Image</label>
            {!imagePreview ? (
              <div
                onDragEnter={handleDrag}
                onDragLeave={handleDrag}
                onDragOver={handleDrag}
                onDrop={handleDrop}
                className={`border-2 border-dashed rounded-xl p-6 text-center transition-all h-64 flex items-center justify-center ${
                  dragActive 
                    ? 'border-purple-500 bg-purple-50' 
                    : 'border-gray-300 hover:border-purple-400 hover:bg-gray-50'
                }`}
              >
                <div className="flex flex-col items-center gap-3">
                  <div className="w-14 h-14 rounded-full bg-gradient-to-br from-purple-400 to-blue-400 flex items-center justify-center">
                    <svg className="w-7 h-7 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
                    </svg>
                  </div>
                  <div>
                    <p className="text-gray-700 font-medium text-sm">Drag & drop an image here</p>
                    <p className="text-xs text-gray-500 mt-1">or</p>
                  </div>
                  <button
                    type="button"
                    onClick={() => fileInputRef.current?.click()}
                    className="px-5 py-2 bg-gradient-to-r from-purple-400 to-blue-400 text-white font-semibold rounded-lg hover:from-purple-500 hover:to-blue-500 transition shadow-md text-sm"
                  >
                    Browse Files
                  </button>
                  <p className="text-xs text-gray-400 mt-1">PNG, JPG, GIF up to 10MB</p>
                </div>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/*"
                  className="hidden"
                  onChange={handleChange}
                />
              </div>
            ) : (
              <div className="relative group h-64">
                <img
                  src={imagePreview}
                  alt="Preview"
                  className="w-full h-full object-cover rounded-xl border-2 border-gray-200"
                />
                <button
                  type="button"
                  onClick={removeImage}
                  className="absolute top-3 right-3 bg-red-500 text-white p-2 rounded-full hover:bg-red-600 transition shadow-lg opacity-0 group-hover:opacity-100"
                  aria-label="Remove image"
                >
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>
            )}
          </div>

          {/* Right Column - Form Fields */}
          <div className="flex flex-col gap-5">
            <div className="flex flex-col gap-4">
              <InputField 
                name="address" 
                type="text" 
                placeholder="Full Address" 
                value={form.address} 
                onChange={handleChange} 
                required 
              />
              <div className="grid grid-cols-2 gap-4">
                <InputField 
                  name="city" 
                  type="text" 
                  placeholder="City" 
                  value={form.city} 
                  onChange={handleChange} 
                  required 
                />
                <InputField 
                  name="zip" 
                  type="text" 
                  placeholder="ZIP Code" 
                  value={form.zip} 
                  onChange={handleChange} 
                  required 
                />
              </div>
              <InputField 
                name="tags" 
                type="text" 
                placeholder="Tags (comma separated)" 
                value={form.tags} 
                onChange={handleChange} 
              />
            </div>

            {/* Grade Selection */}
            <div className="flex flex-col gap-3">
              <label className="block text-sm font-semibold text-gray-700">
                Grade <span className="text-red-500">*</span>
              </label>
              <div className="flex gap-3">
                {['A', 'B', 'C', 'D', 'F'].map((letter) => (
                  <button
                    key={letter}
                    type="button"
                    onClick={() => setForm(prev => ({ ...prev, badgeLetter: letter }))}
                    className={`flex-1 px-4 py-3 rounded-xl font-bold text-lg transition-all shadow-sm border-2 cursor-pointer ${
                      form.badgeLetter === letter
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

            {/* Error Message */}
            {error && (
              <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg text-sm flex items-center gap-2">
                <svg className="w-5 h-5 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
                <span>{error}</span>
              </div>
            )}
          </div>
        </div>

        {/* Action Buttons */}
        <div className="flex gap-3 px-8 pb-8 pt-6 border-t border-gray-200">
          <button
            type="button"
            onClick={onClose}
            className="flex-1 px-6 py-3 border-2 border-gray-300 text-gray-700 font-semibold rounded-xl hover:bg-gray-50 transition cursor-pointer disabled:cursor-not-allowed"
            disabled={loading}
          >
            Cancel
          </button>
          <Button type="submit" disabled={loading} className="flex-1">
            {loading ? (
              <span className="flex items-center justify-center">
                <svg className="animate-spin h-5 w-5 mr-2 text-white" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none"/>
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z"/>
                </svg>
                Uploading...
              </span>
            ) : (
              <span className="flex items-center justify-center gap-2">
                <FiPlus className="w-5 h-5" />
                Add Location
              </span>
            )}
          </Button>
        </div>
      </form>
    </Modal>
  );
}