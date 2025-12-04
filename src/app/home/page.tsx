'use client';

import { useState, useEffect, ChangeEvent, FormEvent, useRef, useMemo } from 'react';
import { FiPlus, FiSearch, FiCheckCircle, FiDownload, FiLogOut, FiUser } from 'react-icons/fi';
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
import { useRouter } from 'next/navigation';
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
  const [addLoading, setAddLoading] = useState(false);
  const [addError, setAddError] = useState<string | null>(null);
  const [showLogoutModal, setShowLogoutModal] = useState(false);
  const [logoutLoading, setLogoutLoading] = useState(false);
  const [showUserDropdown, setShowUserDropdown] = useState(false);
  const router = useRouter();

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
      router.push('/login');
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
    a.download = 'Traders Data.csv';
    a.click();
    URL.revokeObjectURL(url);
  };

  // Filter cards by search
  const filteredCards = cards.filter(card =>
    card.address.toLowerCase().includes(search.toLowerCase()) ||
    card.city.toLowerCase().includes(search.toLowerCase()) ||
    card.zip.includes(search)
  );

  const getRandomBadgeColor = () => {
    const colors = [
      'bg-red-500',
      'bg-green-500',
      'bg-blue-500',
      'bg-yellow-500',
      'bg-purple-500',
      'bg-pink-500',
      'bg-indigo-500',
      'bg-teal-500',
      'bg-orange-500'
    ];
    return colors[Math.floor(Math.random() * colors.length)];
  };

  // Handle add card
  const handleAddCard = async (
    card: Omit<CardType, 'id' | 'badge' | 'lat' | 'lng'>,
    imageFile: File | null,
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
          letter: userData?.name ? userData.name[0].toUpperCase() : (user.displayName ? user.displayName[0].toUpperCase() : "U"),
          color: getRandomBadgeColor()
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

  if (!isLoaded) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <svg className="animate-spin h-8 w-8 text-blue-500" viewBox="0 0 24 24">
          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none"/>
          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z"/>
        </svg>
      </div>
    );
  }

  return (
    <ProtectedRoute>
      <div className="min-h-screen pb-10 bg-gradient-to-br from-blue-50 via-purple-50 to-white transition-colors duration-500">
        {/* Header */}
        <header className="sticky top-0 z-30 bg-white/80 backdrop-blur border-b border-blue-200 shadow-md px-8">
          <div className="w-full flex items-center justify-between py-5">
            <div className="flex items-center gap-6">
              <div className="bg-gradient-to-br from-purple-400 to-blue-400 rounded-full p-3 shadow">
                <FiCheckCircle className="text-white text-3xl" />
              </div>
              <div className="flex flex-col gap-1">
                <span className="text-2xl font-extrabold text-gray-900 tracking-tight">Client Check</span>
                <div className="text-xs text-gray-500 font-medium">Your trusted location dashboard</div>
              </div>
            </div>
            {/* Right side buttons */}
            <div className="flex items-center gap-5">
              {/* Simple Toggle Button */}
              <button
                className="flex items-center px-4 py-2 rounded-xl border border-blue-400 bg-white text-blue-700 font-semibold shadow transition hover:bg-blue-50 cursor-pointer"
                onClick={() => setViewMode(viewMode === 'cards' ? 'map' : 'cards')}
                style={{ minWidth: 120 }}
              >
                <span
                  className={`mr-2 inline-block w-5 h-5 rounded-full transition-all duration-300 ${
                    viewMode === 'cards' ? 'bg-purple-400' : 'bg-blue-400'
                  }`}
                ></span>
                {viewMode === 'cards' ? 'Show Map' : 'Show Cards'}
              </button>
              <button
                className="flex items-center gap-2 px-6 py-2 rounded-xl bg-gradient-to-r from-purple-400 to-blue-400 text-white font-semibold shadow hover:from-purple-500 hover:to-blue-500 transition cursor-pointer"
                onClick={handleExport}
              >
                <FiDownload className="text-lg" />
                Export
              </button>
              {/* User Profile Dropdown */}
              <div className="relative">
              <button
                className="flex items-center gap-3 px-3 py-2 rounded-xl border border-gray-200 bg-white hover:bg-gray-50 transition cursor-pointer shadow-sm"
                onClick={() => setShowUserDropdown(!showUserDropdown)}
                title="User Menu"
              >
                {/* User Avatar */}
                <div className="w-10 h-10 rounded-full bg-gradient-to-br from-purple-400 to-blue-400 flex items-center justify-center text-white font-bold text-lg shadow-md">
                  {userData?.name?.[0]?.toUpperCase() || 'U'}
                </div>
                {/* User Info */}
                <div className="hidden md:flex flex-col items-start">
                  <span className="text-sm font-semibold text-gray-900">
                    {userData?.name || 'User'}
                  </span>
                  <span className="text-xs text-gray-500">
                    {userData?.email || user?.email || ''}
                  </span>
                </div>
                {/* Dropdown Arrow */}
                <svg 
                  className={`w-5 h-5 text-gray-400 transition-transform ${showUserDropdown ? 'rotate-180' : ''}`}
                  fill="none" 
                  stroke="currentColor" 
                  viewBox="0 0 24 24"
                >
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                </svg>
              </button>

              {/* Dropdown Menu */}
              {showUserDropdown && (
                <>
                  {/* Backdrop to close dropdown */}
                  <div 
                    className="fixed inset-0 z-40" 
                    onClick={() => setShowUserDropdown(false)}
                  ></div>
                  {/* Dropdown Content */}
                  <div className="absolute right-0 mt-2 w-64 bg-white rounded-xl shadow-xl border border-gray-200 z-50 overflow-hidden">
                    {/* User Info Section */}
                    <div className="px-4 py-3 border-b border-gray-200 bg-gray-50">
                      <div className="flex items-center gap-3">
                        <div className="w-12 h-12 rounded-full bg-gradient-to-br from-purple-400 to-blue-400 flex items-center justify-center text-white font-bold text-xl shadow-md">
                          {userData?.name?.[0]?.toUpperCase() || user?.displayName?.[0]?.toUpperCase() || user?.email?.[0]?.toUpperCase() || 'U'}
                        </div>
                        <div className="flex flex-col flex-1 min-w-0">
                          <span className="text-sm font-semibold text-gray-900 truncate">
                            {userData?.name || user?.displayName || 'User'}
                          </span>
                          <span className="text-xs text-gray-500 truncate">
                            {userData?.email || user?.email || ''}
                          </span>
                        </div>
                      </div>
                    </div>
                    {/* Logout Option */}
                    <button
                      className="w-full px-4 py-3 flex items-center gap-3 text-left hover:bg-red-50 text-red-600 transition cursor-pointer"
                      onClick={() => {
                        setShowUserDropdown(false);
                        setShowLogoutModal(true);
                      }}
                    >
                      <FiLogOut className="text-lg" />
                      <span className="font-medium">Logout</span>
                    </button>
                  </div>
                </>
              )}
              </div>
            </div>
          </div>
        </header>

        {/* Search Bar */}
        {viewMode === 'cards' && (
          <div className="flex justify-center mt-8 mb-6">
            <div className="relative w-full max-w-xl">
              <span className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-400 text-lg">
                <FiSearch />
              </span>
              <input
                type="text"
                placeholder="Search by city or ZIP code..."
                className="w-full pl-12 pr-4 py-3 rounded-2xl border border-gray-200 shadow focus:ring-2 focus:ring-blue-200 focus:outline-none text-base bg-white/80 transition"
                value={search}
                onChange={(e: ChangeEvent<HTMLInputElement>) => setSearch(e.target.value)}
              />
            </div>
          </div>
        )}

        {/* Card Grid or Map */}
        {loading ? (
          <div className="flex justify-center items-center h-64">
            <svg className="animate-spin h-8 w-8 text-blue-500" viewBox="0 0 24 24">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none"/>
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z"/>
            </svg>
          </div>
        ) : viewMode === 'cards' ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-8 px-8">
            {filteredCards.map((card, index) => (
              <div
                key={card.id}
                className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden flex flex-col transition-transform duration-200 hover:shadow-xl hover:-translate-y-1 animate-fadein"
                style={{ animationDelay: `${0.1 + index * 0.07}s` }}
              >
                {card.image ? (
                  <div className="relative h-80 w-full overflow-hidden bg-gray-100">
                    <img 
                      src={card.image} 
                      alt={card.address} 
                      className="h-full w-full object-cover transition-transform duration-300 hover:scale-105" 
                      onError={(e) => {
                        // Fallback if image fails to load
                        (e.target as HTMLImageElement).style.display = 'none';
                      }}
                    />
                  </div>
                ) : (
                  <div className="h-80 w-full bg-gradient-to-br from-gray-100 to-gray-200 flex items-center justify-center">
                    <svg className="w-16 h-16 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
                    </svg>
                  </div>
                )}
                <div className="p-4 flex-1 flex flex-col gap-2">
                  <div className="flex items-center gap-2 text-gray-500 text-sm">
                    <span>📍 {card.city}, {card.zip}</span>
                    <span className={`ml-auto w-7 h-7 flex items-center justify-center rounded-full text-white font-bold text-base ${card.badge.color}`}>{card.badge.letter}</span>
                  </div>
                  <div className="font-semibold text-lg text-gray-900">{card.address}</div>
                  <div className="flex flex-wrap gap-2 mt-2">
                    {card.tags.map((tag, i) => (
                      <span key={i} className="bg-gray-100 text-gray-700 px-3 py-1 rounded-full text-xs font-medium">{tag}</span>
                    ))}
                  </div>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="flex flex-col items-center mt-8 mb-6 px-8">
            {pins.length === 0 ? (
              <div className="text-center py-12">
                <p className="text-gray-500 text-lg mb-2">No cards with location data</p>
                <p className="text-gray-400 text-sm">Add cards with ZIP codes to see them on the map</p>
              </div>
            ) : (
              <>
                <div className="mb-4 text-sm text-gray-600">
                  Showing {pins.length} location{pins.length !== 1 ? 's' : ''} on map
                </div>
                <GoogleMap
                  mapContainerStyle={{ width: '100%', height: '600px', maxWidth: 1200, borderRadius: 16 }}
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
                      label={{
                        text: pin.label,
                        color: '#ffffff',
                        fontWeight: 'bold',
                      }}
                      title={`${pin.address}, ${pin.city}`}
                      animation={window.google?.maps?.Animation?.DROP}
                    />
                  ))}
                </GoogleMap>
              </>
            )}
          </div>
        )}

        {/* Floating Plus Button with Tooltip */}
        {viewMode === 'cards' && (
          <div className="fixed bottom-8 right-8 z-50 group">
            <button
              className="w-14 h-14 rounded-full bg-gradient-to-br from-purple-400 to-blue-400 shadow-xl flex items-center justify-center text-white text-3xl hover:scale-110 hover:animate-bounce transition-all duration-200 cursor-pointer"
              onClick={() => setShowModal(true)}
              aria-label="Add Card"
            >
              <FiPlus />
            </button>
            <span className="absolute right-16 top-1/2 -translate-y-1/2 bg-white/90 text-gray-700 px-3 py-1 rounded shadow opacity-0 group-hover:opacity-100 transition-opacity text-sm pointer-events-none">
              Add new card
            </span>
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
            onSubmit={(card, imageFile, done, error) => handleAddCard(card, imageFile, done, error)}
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
      () => {
        // Reset form on success
        setForm({ city: '', zip: '', address: '', tags: '' });
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
      <form onSubmit={handleSubmit} className="bg-white rounded-3xl shadow-2xl p-8 w-full max-w-2xl flex flex-col gap-6 relative z-10 max-h-[90vh] overflow-y-auto">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-gray-200 pb-4">
          <div>
            <h2 className="text-2xl font-bold text-gray-900">Add New Card</h2>
            <p className="text-sm text-gray-500 mt-1">Fill in the details to create a new card</p>
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

        {/* Image Upload Section */}
        <div className="flex flex-col gap-3">
          <label className="text-sm font-semibold text-gray-700">Card Image</label>
          {!imagePreview ? (
            <div
              onDragEnter={handleDrag}
              onDragLeave={handleDrag}
              onDragOver={handleDrag}
              onDrop={handleDrop}
              className={`border-2 border-dashed rounded-xl p-8 text-center transition-all ${
                dragActive 
                  ? 'border-purple-500 bg-purple-50' 
                  : 'border-gray-300 hover:border-purple-400 hover:bg-gray-50'
              }`}
            >
              <div className="flex flex-col items-center gap-3">
                <div className="w-16 h-16 rounded-full bg-gradient-to-br from-purple-400 to-blue-400 flex items-center justify-center">
                  <svg className="w-8 h-8 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
                  </svg>
                </div>
                <div>
                  <p className="text-gray-700 font-medium">Drag & drop an image here</p>
                  <p className="text-sm text-gray-500 mt-1">or</p>
                </div>
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  className="px-6 py-2 bg-gradient-to-r from-purple-400 to-blue-400 text-white font-semibold rounded-lg hover:from-purple-500 hover:to-blue-500 transition shadow-md"
                >
                  Browse Files
                </button>
                <p className="text-xs text-gray-400 mt-2">PNG, JPG, GIF up to 10MB</p>
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
            <div className="relative group">
              <img
                src={imagePreview}
                alt="Preview"
                className="w-full h-64 object-cover rounded-xl border-2 border-gray-200"
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

        {/* Form Fields */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="md:col-span-2">
            <InputField 
              name="address" 
              type="text" 
              placeholder="Full Address" 
              value={form.address} 
              onChange={handleChange} 
              required 
            />
          </div>
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
          <div className="md:col-span-2">
            <InputField 
              name="tags" 
              type="text" 
              placeholder="Tags (comma separated, e.g., restaurant, downtown, popular)" 
              value={form.tags} 
              onChange={handleChange} 
            />
          </div>
        </div>

        {/* Error Message */}
        {error && (
          <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg text-sm flex items-center gap-2">
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            {error}
          </div>
        )}

        {/* Action Buttons */}
        <div className="flex gap-3 pt-2 border-t border-gray-200">
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
                Add Card
              </span>
            )}
          </Button>
        </div>
      </form>
    </Modal>
  );
}