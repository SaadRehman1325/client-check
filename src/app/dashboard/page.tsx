'use client';

import { useEffect, useState, useRef, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import Image from 'next/image';
import { doc, updateDoc, deleteDoc, addDoc, collection, serverTimestamp } from 'firebase/firestore';
import { ref, uploadBytes, getDownloadURL } from 'firebase/storage';
import {
  updateProfile,
  updatePassword,
  reauthenticateWithCredential,
  EmailAuthProvider,
  signOut,
} from 'firebase/auth';
import { useAuth } from '../../hooks/useAuth';
import { useUserData } from '../../hooks/useUserData';
import { useDashboardStats, type LocationRow } from '../../hooks/useDashboardStats';
import { useSubscriptionOverview } from '../../hooks/useSubscriptionOverview';
import { useCoupons } from '../../hooks/useCoupons';
import ProtectedRoute from '../components/ProtectedRoute';
import Modal from '../components/Modal';
import InputField from '../components/InputField';
import Button from '../components/Button';
import { db, storage, auth } from '../../firebase';
import {
  FiHome,
  FiUsers,
  FiMapPin,
  FiCreditCard,
  FiSearch,
  FiMoreVertical,
  FiLogOut,
  FiUser,
  FiUserPlus,
  FiEdit2,
  FiCheck,
  FiExternalLink,
  FiLock,
  FiTag,
  FiPlus,
  FiTrash2,
  FiUpload,
  FiDollarSign,
  FiBarChart2,
} from 'react-icons/fi';
import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip, BarChart, Bar, XAxis, YAxis, CartesianGrid, Legend } from 'recharts';

type NavSection = 'dashboard' | 'users' | 'locations' | 'subscriptions' | 'accounting' | 'coupons' | 'profile';
type ProfileSubSection = 'personal' | 'password' | 'subscription';

const profileSubItems: { id: ProfileSubSection; label: string; icon: React.ReactNode }[] = [
  { id: 'personal', label: 'Profile settings', icon: <FiUser className="w-5 h-5" /> },
  { id: 'password', label: 'Login and passwords', icon: <FiLock className="w-5 h-5" /> },
  { id: 'subscription', label: 'Subscription', icon: <FiCreditCard className="w-5 h-5" /> },
];

const navItems: { id: NavSection; label: string; icon: React.ReactNode }[] = [
  { id: 'dashboard', label: 'Dashboard', icon: <FiHome className="w-5 h-5" /> },
  { id: 'users', label: 'Users', icon: <FiUsers className="w-5 h-5" /> },
  { id: 'locations', label: 'Locations', icon: <FiMapPin className="w-5 h-5" /> },
  { id: 'subscriptions', label: 'Subscriptions', icon: <FiCreditCard className="w-5 h-5" /> },
  { id: 'accounting', label: 'Accounting', icon: <FiBarChart2 className="w-5 h-5" /> },
  { id: 'coupons', label: 'Coupons', icon: <FiTag className="w-5 h-5" /> },
  { id: 'profile', label: 'Profile', icon: <FiUser className="w-5 h-5" /> },
];

const MONTHLY_RATE = 17;
const YEARLY_RATE = 175;

const cardTransition = 'transition-all duration-300 ease-out';

function getGradeColor(grade: string): string {
  const gradeColors: Record<string, string> = {
    A: '#22c55e',
    B: '#3b82f6',
    C: '#eab308',
    D: '#f97316',
    F: '#ef4444',
  };
  return gradeColors[grade.toUpperCase()] || '#6b7280';
}

export default function DashboardPage() {
  const router = useRouter();
  const { user } = useAuth();
  const { userData, loading, setUserData } = useUserData(user);
  const stats = useDashboardStats();
  const subscriptionOverview = useSubscriptionOverview(userData?.userType === 'admin');
  const couponsData = useCoupons();
  const [activeSection, setActiveSection] = useState<NavSection>('dashboard');
  const [searchQuery, setSearchQuery] = useState('');
  const [showLangDropdown, setShowLangDropdown] = useState(false);
  const [showUserDropdown, setShowUserDropdown] = useState(false);
  const [showLogoutModal, setShowLogoutModal] = useState(false);
  const [logoutLoading, setLogoutLoading] = useState(false);
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('desc');
  const [usersFilter, setUsersFilter] = useState('');
  const [usersRoleFilter, setUsersRoleFilter] = useState<'all' | 'admin' | 'user'>('all');
  const [locationsFilter, setLocationsFilter] = useState('');
  const profileFileInputRef = useRef<HTMLInputElement>(null);
  const [profileName, setProfileName] = useState('');
  const [profileSaving, setProfileSaving] = useState(false);
  const [profileSaved, setProfileSaved] = useState(false);
  const [profileError, setProfileError] = useState<string | null>(null);
  const [avatarUploading, setAvatarUploading] = useState(false);
  const [avatarError, setAvatarError] = useState<string | null>(null);
  const [profileSubSection, setProfileSubSection] = useState<ProfileSubSection>('personal');
  const [accountingView, setAccountingView] = useState<'monthly' | 'quarterly' | 'yearly'>('monthly');

  // Coupons: create form, search, status filter, delete
  const [showCreateCoupon, setShowCreateCoupon] = useState(false);
  const [couponForm, setCouponForm] = useState({ name: '', code: '' });
  const [couponsStatusFilter, setCouponsStatusFilter] = useState<'all' | 'new' | 'used'>('all');
  const [deleteCouponModal, setDeleteCouponModal] = useState<{ id: string; name: string; code: string } | null>(null);
  const [couponDeleteLoading, setCouponDeleteLoading] = useState(false);

  // Locations: manage (edit / delete)
  const [locationMenuOpen, setLocationMenuOpen] = useState<string | null>(null);
  const [editingLocation, setEditingLocation] = useState<LocationRow | null>(null);
  const [editLocationForm, setEditLocationForm] = useState({ city: '', address: '', zip: '', tagsStr: '', badgeLetter: 'A' });
  const [editLocationImageFile, setEditLocationImageFile] = useState<File | null>(null);
  const [editLocationImagePreview, setEditLocationImagePreview] = useState<string>('');
  const editLocationFileInputRef = useRef<HTMLInputElement>(null);
  const [locationSaveLoading, setLocationSaveLoading] = useState(false);
  const [locationError, setLocationError] = useState<string | null>(null);
  const [deleteLocation, setDeleteLocation] = useState<LocationRow | null>(null);
  const [locationDeleteLoading, setLocationDeleteLoading] = useState(false);
  const [editLocationDragActive, setEditLocationDragActive] = useState(false);
  const csvFileInputRef = useRef<HTMLInputElement>(null);
  const [showBulkCsvModal, setShowBulkCsvModal] = useState(false);
  const [bulkCsvFile, setBulkCsvFile] = useState<File | null>(null);
  const [bulkUploadLoading, setBulkUploadLoading] = useState(false);
  const [bulkUploadError, setBulkUploadError] = useState<string | null>(null);
  const [bulkUploadSuccess, setBulkUploadSuccess] = useState<number | null>(null);

  // Password form (Login and passwords sub-section)
  const [passwordForm, setPasswordForm] = useState({
    currentPassword: '',
    newPassword: '',
    confirmPassword: '',
  });
  const [passwordSaving, setPasswordSaving] = useState(false);
  const [passwordError, setPasswordError] = useState<string | null>(null);
  const [passwordSuccess, setPasswordSuccess] = useState(false);
  const isEmailUser = user?.providerData?.some((p) => p.providerId === 'password');

  const recentActivity = [...stats.recentActivity];
  if (sortOrder === 'asc') recentActivity.reverse();

  const filteredUsers = stats.users.filter((u) => {
    const matchesSearch =
      !usersFilter.trim() ||
      u.name.toLowerCase().includes(usersFilter.toLowerCase()) ||
      u.email.toLowerCase().includes(usersFilter.toLowerCase());
    const matchesRole =
      usersRoleFilter === 'all' ||
      (usersRoleFilter === 'admin' && u.userType === 'admin') ||
      (usersRoleFilter === 'user' && u.userType !== 'admin');
    return matchesSearch && matchesRole;
  });

  const locationsCountByUserId = useMemo(() => {
    const map: Record<string, number> = {};
    stats.locations.forEach((loc) => {
      const id = loc.createdBy || '';
      map[id] = (map[id] || 0) + 1;
    });
    return map;
  }, [stats.locations]);

  const filteredLocations = stats.locations.filter(
    (loc) =>
      !locationsFilter.trim() ||
      loc.city.toLowerCase().includes(locationsFilter.toLowerCase()) ||
      loc.address.toLowerCase().includes(locationsFilter.toLowerCase()) ||
      loc.zip.includes(locationsFilter) ||
      loc.tags.some((t) => t.toLowerCase().includes(locationsFilter.toLowerCase()))
  );

  const filteredCoupons = couponsData.coupons.filter((c) =>
    couponsStatusFilter === 'all' ||
    (couponsStatusFilter === 'new' && c.status === 'new') ||
    (couponsStatusFilter === 'used' && c.status === 'used')
  );

  const avgLocationsPerUser = stats.totalUsers > 0
    ? (stats.totalLocations / stats.totalUsers).toFixed(1)
    : '0';
  const regularUserCount = stats.totalUsers - stats.adminCount;
  const subscriptionRate = regularUserCount > 0
    ? Math.round((subscriptionOverview.activeCount / regularUserCount) * 100)
    : 0;
  const totalCoupons = couponsData.coupons.length;
  const usedCoupons = couponsData.coupons.filter(c => c.status === 'used').length;
  const availableCoupons = totalCoupons - usedCoupons;

  const subSegments = useMemo(() => [
    { label: 'Active', count: subscriptionOverview.statusCounts.active, color: '#22c55e' },
    { label: 'Trialing', count: subscriptionOverview.statusCounts.trialing, color: '#3b82f6' },
    { label: 'Canceled', count: subscriptionOverview.statusCounts.canceled, color: '#f97316' },
    { label: 'Past Due', count: subscriptionOverview.statusCounts.past_due, color: '#ef4444' },
    { label: 'No Plan', count: subscriptionOverview.statusCounts.noSubscription, color: '#cbd5e1' },
  ], [subscriptionOverview.statusCounts]);
  const subTotal = subSegments.reduce((sum, s) => sum + s.count, 0);
  const pieChartData = useMemo(() => {
    const withCount = subSegments.filter((s) => s.count > 0);
    if (withCount.length === 0) return [{ name: 'No data', value: 1, color: '#e2e8f0' }];
    return withCount.map((s) => ({ name: s.label, value: s.count, color: s.color }));
  }, [subSegments]);

  type AccountingRow = { periodLabel: string; periodKey: string; revenue: number; count: number };
  const accountingData = useMemo(() => {
    const paid = subscriptionOverview.subscriptionUsers.filter(
      (u) =>
        u.subscription &&
        (u.subscription.status === 'active' || u.subscription.status === 'trialing') &&
        u.subscription.currentPeriodEnd &&
        (u.subscription.planType === 'monthly' || u.subscription.planType === 'yearly')
    );
    const renewals: { date: Date; amount: number }[] = paid.map((u) => {
      const ts = u.subscription!.currentPeriodEnd!;
      const sec = typeof ts.seconds === 'number' ? ts.seconds : (ts as { _seconds?: number })._seconds ?? 0;
      const date = new Date(sec * 1000);
      const amount = u.subscription!.planType === 'yearly' ? YEARLY_RATE : MONTHLY_RATE;
      return { date, amount };
    });

    const byMonth: Record<string, { revenue: number; count: number }> = {};
    const now = new Date();
    // Include last 12 months + current + next 2 months so future renewals show up
    for (let i = 11; i >= -2; i--) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
      byMonth[key] = { revenue: 0, count: 0 };
    }
    renewals.forEach(({ date, amount }) => {
      const key = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
      if (byMonth[key] != null) {
        byMonth[key].revenue += amount;
        byMonth[key].count += 1;
      }
    });

    const byQuarter: Record<string, { revenue: number; count: number }> = {};
    const currentQ = Math.floor(now.getMonth() / 3) + 1;
    const currentY = now.getFullYear();
    for (let i = 3; i >= 0; i--) {
      let q = currentQ - i;
      let y = currentY;
      while (q <= 0) {
        q += 4;
        y--;
      }
      const key = `${y}-Q${q}`;
      byQuarter[key] = { revenue: 0, count: 0 };
    }
    renewals.forEach(({ date, amount }) => {
      const q = Math.floor(date.getMonth() / 3) + 1;
      const key = `${date.getFullYear()}-Q${q}`;
      if (byQuarter[key] != null) {
        byQuarter[key].revenue += amount;
        byQuarter[key].count += 1;
      }
    });

    const byYear: Record<string, { revenue: number; count: number }> = {};
    for (let y = now.getFullYear() - 2; y <= now.getFullYear(); y++) {
      byYear[String(y)] = { revenue: 0, count: 0 };
    }
    renewals.forEach(({ date, amount }) => {
      const key = String(date.getFullYear());
      if (byYear[key] != null) {
        byYear[key].revenue += amount;
        byYear[key].count += 1;
      }
    });

    const monthlyRows: AccountingRow[] = Object.entries(byMonth)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([periodKey, { revenue, count }]) => {
        const [y, m] = periodKey.split('-').map(Number);
        const periodLabel = new Date(y, m - 1, 1).toLocaleDateString(undefined, { month: 'short', year: 'numeric' });
        return { periodLabel, periodKey, revenue, count };
      });
    const quarterLabels: Record<string, string> = {};
    Object.keys(byQuarter).forEach((k) => {
      const [y, qPart] = k.split('-');
      const q = qPart.replace('Q', '');
      quarterLabels[k] = `Q${q} ${y}`;
    });
    const quarterlyRows: AccountingRow[] = Object.entries(byQuarter)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([periodKey, { revenue, count }]) => ({
        periodLabel: quarterLabels[periodKey] || periodKey,
        periodKey,
        revenue,
        count,
      }));
    const yearlyRows: AccountingRow[] = Object.entries(byYear)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([periodKey, { revenue, count }]) => ({
        periodLabel: periodKey,
        periodKey,
        revenue,
        count,
      }));

    return { monthly: monthlyRows, quarterly: quarterlyRows, yearly: yearlyRows };
  }, [subscriptionOverview.subscriptionUsers]);

  const accountingKpis = useMemo(() => {
    const now = new Date();
    const currentMonthKey = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
    const currentQ = Math.floor(now.getMonth() / 3) + 1;
    const currentQuarterKey = `${now.getFullYear()}-Q${currentQ}`;
    const currentYearKey = String(now.getFullYear());
    const nowMs = now.getTime();
    const next30DaysMs = nowMs + 30 * 24 * 60 * 60 * 1000;

    const thisMonth = accountingData.monthly.find((r) => r.periodKey === currentMonthKey);
    const thisQuarter = accountingData.quarterly.find((r) => r.periodKey === currentQuarterKey);
    const thisYear = accountingData.yearly.find((r) => r.periodKey === currentYearKey);

    const paid = subscriptionOverview.subscriptionUsers.filter(
      (u) =>
        u.subscription &&
        (u.subscription.status === 'active' || u.subscription.status === 'trialing') &&
        (u.subscription.planType === 'monthly' || u.subscription.planType === 'yearly')
    );
    const monthlySubs = paid.filter((u) => u.subscription!.planType === 'monthly').length;
    const yearlySubs = paid.filter((u) => u.subscription!.planType === 'yearly').length;
    const monthlyRevenueTotal = monthlySubs * MONTHLY_RATE;
    const yearlyRevenueTotal = yearlySubs * YEARLY_RATE;
    const totalRevenueAllTime = accountingData.monthly.reduce((s, r) => s + r.revenue, 0);
    // MRR: monthly subs at $17 + yearly subs normalized to monthly ($175/12)
    const mrr = monthlyRevenueTotal + (yearlySubs * YEARLY_RATE) / 12;

    // Upcoming 30 days: sum revenue for renewals whose currentPeriodEnd is within the next 30 days
    let upcoming30DaysRevenue = 0;
    paid.forEach((u) => {
      const ts = u.subscription!.currentPeriodEnd;
      if (!ts) return;
      const sec = typeof ts.seconds === 'number' ? ts.seconds : (ts as { _seconds?: number })._seconds ?? 0;
      const renewalMs = sec * 1000;
      if (renewalMs >= nowMs && renewalMs <= next30DaysMs) {
        upcoming30DaysRevenue += u.subscription!.planType === 'yearly' ? YEARLY_RATE : MONTHLY_RATE;
      }
    });

    return {
      mrr,
      thisQuarterRevenue: thisQuarter?.revenue ?? 0,
      thisYearRevenue: thisYear?.revenue ?? 0,
      upcoming30DaysRevenue,
      payingCount: paid.length,
      monthlySubs,
      yearlySubs,
      planMixPieData: [
        { name: 'Monthly ($17/mo)', value: monthlyRevenueTotal, color: '#8b5cf6' },
        { name: 'Yearly ($175/yr)', value: yearlyRevenueTotal, color: '#3b82f6' },
      ].filter((d) => d.value > 0),
      totalRevenueLast12Months: totalRevenueAllTime,
    };
  }, [accountingData, subscriptionOverview.subscriptionUsers]);

  const accountingBarData = useMemo(() => {
    const rows = accountingView === 'monthly' ? accountingData.monthly : accountingView === 'quarterly' ? accountingData.quarterly : accountingData.yearly;
    return rows.map((r) => ({ periodLabel: r.periodLabel, revenue: r.revenue, count: r.count }));
  }, [accountingView, accountingData.monthly, accountingData.quarterly, accountingData.yearly]);

  const usersByMonth = useMemo(() => {
    const months: { label: string; users: number; locations: number }[] = [];
    const now = new Date();
    for (let i = 5; i >= 0; i--) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
      const end = new Date(now.getFullYear(), now.getMonth() - i + 1, 0, 23, 59, 59);
      const label = d.toLocaleDateString(undefined, { month: 'short' });
      const startTs = d.getTime() / 1000;
      const endTs = end.getTime() / 1000;
      const usersCount = stats.users.filter(u => u.createdAt && u.createdAt >= startTs && u.createdAt <= endTs).length;
      const locsCount = stats.locations.filter(l => l.createdAt && l.createdAt >= startTs && l.createdAt <= endTs).length;
      months.push({ label, users: usersCount, locations: locsCount });
    }
    return months;
  }, [stats.users, stats.locations]);
  const maxBarValue = Math.max(1, ...usersByMonth.map(m => Math.max(m.users, m.locations)));

  const newestUsers = useMemo(() => stats.users.slice(0, 5), [stats.users]);

  const formatUserDate = (seconds: number | undefined) => {
    if (!seconds) return '—';
    return new Date(seconds * 1000).toLocaleDateString(undefined, {
      day: 'numeric',
      month: 'short',
      year: 'numeric',
    });
  };

  const formatLocationDate = (seconds: number | undefined) => {
    if (!seconds) return '—';
    return new Date(seconds * 1000).toLocaleDateString(undefined, {
      day: 'numeric',
      month: 'short',
      year: 'numeric',
    });
  };

  const formatSubscriptionPeriodEnd = (ts: { seconds: number; nanoseconds: number } | null) => {
    if (!ts?.seconds) return '—';
    return new Date(ts.seconds * 1000).toLocaleDateString(undefined, {
      day: 'numeric',
      month: 'short',
      year: 'numeric',
    });
  };

  const subscriptionStatusLabel = (status: string) =>
    status === 'active' ? 'Active' : status === 'trialing' ? 'Trialing' : status === 'canceled' ? 'Canceled' : status === 'past_due' ? 'Past due' : status || '—';

  useEffect(() => {
    if (userData?.name !== undefined) setProfileName(userData.name || '');
  }, [userData?.name]);

  const handleProfileAvatarClick = () => {
    setAvatarError(null);
    profileFileInputRef.current?.click();
  };

  const handleProfileAvatarChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
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
      const msg = err && typeof err === 'object' && 'message' in err ? String((err as { message?: string }).message) : 'Failed to upload photo.';
      setAvatarError(msg);
    } finally {
      setAvatarUploading(false);
      e.target.value = '';
    }
  };

  const handleSaveProfileName = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user?.uid) return;
    setProfileError(null);
    setProfileSaving(true);
    setProfileSaved(false);
    try {
      const name = profileName.trim();
      if (!name) {
        setProfileError('Name is required.');
        setProfileSaving(false);
        return;
      }
      const userRef = doc(db, 'users', user.uid);
      await updateDoc(userRef, { name, updatedAt: serverTimestamp() });
      if (auth.currentUser) {
        await updateProfile(auth.currentUser, { displayName: name });
      }
      setUserData((prev) => (prev ? { ...prev, name } : null));
      setProfileSaved(true);
      setTimeout(() => setProfileSaved(false), 3000);
    } catch (err: unknown) {
      const msg = err && typeof err === 'object' && 'message' in err ? String((err as { message?: string }).message) : 'Failed to update profile.';
      setProfileError(msg);
    } finally {
      setProfileSaving(false);
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

  const suggestedCouponCode = useMemo(() => {
    const base = couponForm.name
      .trim()
      .toUpperCase()
      .replace(/[^A-Z0-9]/g, '');
    return base ? `${base}${100}` : '';
  }, [couponForm.name]);

  const handleCreateCoupon = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user?.uid) return;
    const name = couponForm.name.trim();
    const code = couponForm.code.trim();
    if (!name || !code) return;
    try {
      await couponsData.createCoupon({ name, code, createdBy: user.uid });
      setCouponForm({ name: '', code: '' });
      setShowCreateCoupon(false);
    } catch {
      // createError already set in hook
    }
  };

  const handleDeleteCoupon = async () => {
    if (!deleteCouponModal) return;
    setCouponDeleteLoading(true);
    try {
      await couponsData.deleteCoupon(deleteCouponModal.id);
      setDeleteCouponModal(null);
    } catch {
      // could set error state
    } finally {
      setCouponDeleteLoading(false);
    }
  };

  const openEditLocation = (loc: LocationRow) => {
    setEditingLocation(loc);
    setEditLocationForm({
      city: loc.city,
      address: loc.address,
      zip: loc.zip,
      tagsStr: loc.tags?.length ? loc.tags.join(', ') : '',
      badgeLetter: loc.badge?.letter?.toUpperCase() || 'A',
    });
    setEditLocationImageFile(null);
    setEditLocationImagePreview(loc.image || '');
    setLocationError(null);
    setLocationMenuOpen(null);
  };

  const handleEditLocationImageSelect = (file: File) => {
    if (file?.type.startsWith('image/')) {
      setEditLocationImageFile(file);
      const reader = new FileReader();
      reader.onload = (ev) => setEditLocationImagePreview(ev.target?.result as string);
      reader.readAsDataURL(file);
    }
  };

  const handleSaveLocation = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingLocation || !user) return;
    setLocationError(null);
    setLocationSaveLoading(true);
    try {
      const tags = editLocationForm.tagsStr
        .split(',')
        .map((t) => t.trim())
        .filter(Boolean);
      let imageUrl = editingLocation.image;
      if (editLocationImageFile) {
        const imageRef = ref(storage, `cards/${user.uid}/${Date.now()}_${editLocationImageFile.name}`);
        await uploadBytes(imageRef, editLocationImageFile);
        imageUrl = await getDownloadURL(imageRef);
      }
      const badgeLetter = editLocationForm.badgeLetter.toUpperCase();
      await updateDoc(doc(db, 'cards', editingLocation.id), {
        city: editLocationForm.city.trim(),
        address: editLocationForm.address.trim(),
        zip: editLocationForm.zip.trim(),
        tags,
        image: imageUrl,
        badge: { letter: badgeLetter, color: getGradeColor(badgeLetter) },
        updatedAt: serverTimestamp(),
      });
      setEditingLocation(null);
      setEditLocationForm({ city: '', address: '', zip: '', tagsStr: '', badgeLetter: 'A' });
      setEditLocationImageFile(null);
      setEditLocationImagePreview('');
    } catch (err: unknown) {
      setLocationError(err instanceof Error ? err.message : 'Failed to update location');
    } finally {
      setLocationSaveLoading(false);
    }
  };

  const openDeleteLocation = (loc: LocationRow) => {
    setDeleteLocation(loc);
    setLocationError(null);
    setLocationMenuOpen(null);
  };

  const handleDeleteLocation = async () => {
    if (!deleteLocation) return;
    setLocationDeleteLoading(true);
    try {
      await deleteDoc(doc(db, 'cards', deleteLocation.id));
      setDeleteLocation(null);
    } catch (err: unknown) {
      setLocationError(err instanceof Error ? err.message : 'Failed to delete location');
    } finally {
      setLocationDeleteLoading(false);
    }
  };

  function parseCSVLine(line: string): string[] {
    const out: string[] = [];
    let cur = '';
    let inQuotes = false;
    for (let i = 0; i < line.length; i++) {
      const c = line[i];
      if (c === '"') {
        inQuotes = !inQuotes;
      } else if (c === ',' && !inQuotes) {
        out.push(cur.trim());
        cur = '';
      } else {
        cur += c;
      }
    }
    out.push(cur.trim());
    return out;
  }

  const doBulkCsvUpload = async (file: File): Promise<{ ok: boolean }> => {
    if (!user) return { ok: false };
    setBulkUploadError(null);
    setBulkUploadSuccess(null);
    setBulkUploadLoading(true);
    try {
      const text = await file.text();
      const lines = text.split(/\r?\n/).filter((l) => l.trim());
      if (lines.length < 2) {
        setBulkUploadError('CSV must have a header row and at least one data row.');
        return { ok: false };
      }
      const headerRow = parseCSVLine(lines[0]);
      const headers = headerRow.map((h) => h.toLowerCase().trim().replace(/\s/g, ''));
      const col = (name: string) => headers.indexOf(name);
      const cityIdx = col('city') >= 0 ? col('city') : 0;
      const addressIdx = col('address') >= 0 ? col('address') : 1;
      const zipIdx = col('zip') >= 0 ? col('zip') : 2;
      const tagsIdx = headers.findIndex((h) => h === 'tags' || h === 'tag');
      const gradeIdx = headers.findIndex((h) => h === 'grade' || h === 'badge');
      const cardsRef = collection(db, 'cards');
      let added = 0;
      for (let i = 1; i < lines.length; i++) {
        const row = parseCSVLine(lines[i]);
        const city = (row[cityIdx] ?? '').trim();
        const address = (row[addressIdx] ?? '').trim();
        const zip = (row[zipIdx] ?? '').trim();
        if (!city && !address && !zip) continue;
        const tagsStr = tagsIdx >= 0 ? (row[tagsIdx] ?? '').trim() : '';
        const tags = tagsStr
          ? tagsStr.split(/[,;]/).map((t) => t.trim()).filter(Boolean)
          : [];
        let badgeLetter = 'A';
        if (gradeIdx >= 0 && row[gradeIdx]) {
          const g = (row[gradeIdx] ?? '').trim().toUpperCase()[0];
          if (['A', 'B', 'C', 'D', 'F'].includes(g)) badgeLetter = g;
        }
        await addDoc(cardsRef, {
          city: city || '—',
          address: address || '—',
          zip: zip || '—',
          tags,
          badge: { letter: badgeLetter, color: getGradeColor(badgeLetter) },
          createdAt: serverTimestamp(),
          createdBy: user.uid,
        });
        added++;
      }
      setBulkUploadSuccess(added);
      return { ok: true };
    } catch (err: unknown) {
      setBulkUploadError(err instanceof Error ? err.message : 'Failed to upload CSV');
      return { ok: false };
    } finally {
      setBulkUploadLoading(false);
    }
  };

  const handleBulkCsvImportFromModal = async () => {
    if (!bulkCsvFile) return;
    const result = await doBulkCsvUpload(bulkCsvFile);
    if (result.ok) {
      setShowBulkCsvModal(false);
      setBulkCsvFile(null);
    }
  };

  const handleLogout = async () => {
    setLogoutLoading(true);
    try {
      localStorage.removeItem('clientcheck_user_data');
      await signOut(auth);
      router.push('/');
    } catch (error: unknown) {
      console.error('Logout error:', error);
      setLogoutLoading(false);
    }
  };

  useEffect(() => {
    // if (loading || !user) return;
    // if (userData?.userType !== 'admin') {
    //   router.replace('/home');
    // }
  }, [user, userData?.userType, loading, router]);

  if (loading || userData?.userType !== 'admin') {
    return (
      <ProtectedRoute>
        <div className="flex justify-center items-center min-h-screen bg-gradient-to-br from-blue-50 via-purple-50 to-white">
          <svg className="animate-spin h-8 w-8 text-purple-500" viewBox="0 0 24 24">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z" />
          </svg>
        </div>
      </ProtectedRoute>
    );
  }

  return (
    <ProtectedRoute>
      <div
        className="min-h-screen bg-gradient-to-br from-blue-50 via-purple-50 to-white flex"
        style={{ fontFamily: 'var(--font-poppins), Poppins, sans-serif' }}
      >
        {/* Left sidebar */}
        <aside className="w-20 flex-shrink-0 bg-white/90 backdrop-blur-sm border-r border-blue-200 flex flex-col items-center py-6 gap-2">
          <div className="mb-4">
            <Image src="/logo.png" alt="Logo" width={40} height={40} className="w-15 h-10 object-contain" />
          </div>
          {navItems.map((item) => (
            <button
              key={item.id}
              onClick={() => setActiveSection(item.id)}
              className={`w-12 h-12 rounded-xl flex items-center justify-center transition-colors cursor-pointer ${
                activeSection === item.id
                  ? 'bg-gradient-to-br from-purple-400 to-blue-400 text-white shadow-md'
                  : 'text-gray-600 hover:bg-purple-50 hover:text-purple-600'
              }`}
              title={item.label}
            >
              {item.icon}
            </button>
          ))}
        </aside>

        {/* Main area */}
        <div className="flex-1 flex flex-col min-w-0">
          {/* Header – same as home */}
          <header className="sticky top-0 z-30 flex-shrink-0 bg-white/80 backdrop-blur border-b border-blue-200 shadow-md px-8">
            <div className="w-full flex items-center justify-between py-5">
              {/* Dashboard header */}
         {activeSection === 'dashboard' && ( <div>
                        <h1 className="text-xl font-bold text-gray-900">Dashboard</h1>
                        <p className="text-sm text-gray-500 mt-0.5">
                        Welcome back! Here's what's happening on Client Check today.
                        </p>
                      </div>)}
                      {/* Locations header */}
           {  activeSection === 'locations' && ( <div>
                        <h1 className="text-xl font-bold text-gray-900">Locations</h1>
                        <p className="text-sm text-gray-500 mt-0.5">
                          Add, edit, and manage property locations
                        </p>
                      </div>)}
                      {/* Users header */}
                      {activeSection === 'users' && ( <div>
                        <h1 className="text-xl font-bold text-gray-900">Users</h1>
                        <p className="text-sm text-gray-500 mt-0.5">
                          View and manage user accounts
                        </p>
                      </div>)}
                      {/* Subscriptions header */}
                      {activeSection === 'subscriptions' && ( <div>
                        <h1 className="text-xl font-bold text-gray-900">Subscriptions</h1>
                        <p className="text-sm text-gray-500 mt-0.5">
                          Subscription status, plans, and billing
                        </p>
                      </div>)}
                      {/* Accounting header */}
                      {activeSection === 'accounting' && ( <div>
                        <h1 className="text-xl font-bold text-gray-900">Accounting</h1>
                        <p className="text-sm text-gray-500 mt-0.5">
                          View and manage subscription revenue
                        </p>
                      </div>)}
                      {/* Coupons header */}
                      {activeSection === 'coupons' && ( <div>
                        <h1 className="text-xl font-bold text-gray-900">Coupons</h1>
                        <p className="text-sm text-gray-500 mt-0.5">
                          Create and manage discount codes
                        </p>
                      </div>)}
                      {/* Profile header */}
                      {activeSection === 'profile' && ( <div>
                        <h1 className="text-xl font-bold text-gray-900">My Account</h1>
                        <p className="text-sm text-gray-500 mt-0.5">
                          Profile settings, password, and subscription
                        </p>
                      </div>)}
             
              <div className="flex items-center gap-5">
             
                {/* User Profile Dropdown*/}
                <div className="relative">
                  <button
                    className="flex items-center gap-3 px-3 py-2 rounded-xl border border-gray-200 bg-white hover:bg-gray-50 transition cursor-pointer shadow-sm"
                    onClick={() => setShowUserDropdown(!showUserDropdown)}
                    title="User Menu"
                  >
                    <div className="w-10 h-10 rounded-full overflow-hidden flex-shrink-0 bg-gradient-to-br from-purple-400 to-blue-400 flex items-center justify-center text-white font-bold text-lg shadow-md">
                      {(userData?.imageUrl || user?.photoURL) ? (
                        <img
                          src={userData?.imageUrl || user?.photoURL || ''}
                          alt=""
                          className="w-full h-full object-cover"
                        />
                      ) : (
                        userData?.name?.[0]?.toUpperCase() || user?.email?.[0]?.toUpperCase() || 'U'
                      )}
                    </div>
                    <div className="hidden md:flex flex-col items-start">
                      <span className="text-sm font-semibold text-gray-900">
                        {userData?.name || 'User'}
                      </span>
                      <span className="text-xs text-gray-500">
                        {userData?.email || user?.email || ''}
                      </span>
                    </div>
                    <svg
                      className={`w-5 h-5 text-gray-400 transition-transform ${showUserDropdown ? 'rotate-180' : ''}`}
                      fill="none"
                      stroke="currentColor"
                      viewBox="0 0 24 24"
                    >
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                    </svg>
                  </button>

                  {showUserDropdown && (
                    <>
                      <div
                        className="fixed inset-0 z-40"
                        onClick={() => setShowUserDropdown(false)}
                      />
                      <div className="absolute right-0 mt-2 w-64 bg-white rounded-xl shadow-xl border border-gray-200 z-50 overflow-hidden">
                        <div className="px-4 py-3 border-b border-gray-200 bg-gray-50">
                          <div className="flex items-center gap-3">
                            <div className="w-12 h-12 rounded-full overflow-hidden flex-shrink-0 bg-gradient-to-br from-purple-400 to-blue-400 flex items-center justify-center text-white font-bold text-xl shadow-md">
                              {(userData?.imageUrl || user?.photoURL) ? (
                                <img
                                  src={userData?.imageUrl || user?.photoURL || ''}
                                  alt=""
                                  className="w-full h-full object-cover"
                                />
                              ) : (
                                userData?.name?.[0]?.toUpperCase() || user?.displayName?.[0]?.toUpperCase() || user?.email?.[0]?.toUpperCase() || 'U'
                              )}
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
                        <button
                          className="w-full px-4 py-3 flex items-center gap-3 text-left hover:bg-purple-50 text-slate-700 transition cursor-pointer border-b border-gray-100"
                          onClick={() => {
                            setShowUserDropdown(false);
                            router.push('/home');
                          }}
                        >
                           <Image src="/home-icon.png" alt="" width={20} height={20} className="h-4 w-4 object-contain" />
                          <span className="font-medium">Back to Home</span>
                        </button>
                       
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

          {/* Content + right panel */}
          <div className="flex-1 flex gap-6 p-6 overflow-auto">
            {/* Main content */}
            <main className="flex-1 min-w-0 space-y-6">
              {activeSection === 'dashboard' && (
                <>
                  {/* KPI Cards - same transition and colors as profile subscription stats cards */}
                  <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-5">
                    <div className={`group ${cardTransition} bg-white rounded-2xl p-5 border border-slate-200 shadow-sm hover:shadow-xl hover:scale-[1.02] hover:-translate-y-0.5 hover:bg-gradient-to-br hover:from-purple-400 hover:to-blue-400 hover:border-transparent cursor-pointer`}>
                      <div className="flex items-center gap-3 mb-4">
                        <div className="w-11 h-11 rounded-xl bg-purple-50 flex items-center justify-center group-hover:bg-white/20">
                          <FiUsers className="w-5 h-5 text-purple-600 group-hover:text-white" />
                        </div>
                        <span className="text-sm font-medium text-slate-500 group-hover:text-white">Total Users</span>
                      </div>
                      <div className="flex items-end justify-between">
                        <p className="text-3xl font-bold text-slate-900 tabular-nums group-hover:text-white">{stats.loading ? '—' : stats.totalUsers}</p>
                        {!stats.loading && stats.newUsersThisMonth > 0 && (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-green-50 text-green-700 group-hover:bg-white/20 group-hover:text-white text-xs font-semibold">
                            <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 15l7-7 7 7" /></svg>
                            +{stats.newUsersThisMonth}
                          </span>
                        )}
                      </div>
                      <p className="text-xs text-slate-400 mt-2 group-hover:text-white/90">{stats.adminCount} admins · {stats.totalUsers - stats.adminCount} regular</p>
                    </div>

                    <div className={`group ${cardTransition} bg-white rounded-2xl p-5 border border-slate-200 shadow-sm hover:shadow-xl hover:scale-[1.02] hover:-translate-y-0.5 hover:bg-gradient-to-br hover:from-purple-400 hover:to-blue-400 hover:border-transparent cursor-pointer`}>
                      <div className="flex items-center gap-3 mb-4">
                        <div className="w-11 h-11 rounded-xl bg-blue-50 flex items-center justify-center group-hover:bg-white/20">
                          <FiCreditCard className="w-5 h-5 text-blue-600 group-hover:text-white" />
                        </div>
                        <span className="text-sm font-medium text-slate-500 group-hover:text-white">Active Subscriptions</span>
                      </div>
                      <div className="flex items-end justify-between">
                        <p className="text-3xl font-bold text-slate-900 tabular-nums group-hover:text-white">{subscriptionOverview.loading ? '—' : subscriptionOverview.activeCount}</p>
                        {!subscriptionOverview.loading && regularUserCount > 0 && (
                          <span className="text-xs font-semibold text-blue-600 bg-blue-50 px-2 py-0.5 rounded-full group-hover:bg-white/20 group-hover:text-white">{subscriptionRate}%</span>
                        )}
                      </div>
                      <p className="text-xs text-slate-400 mt-2 group-hover:text-white/90">of {subscriptionOverview.loading ? '—' : regularUserCount} regular users (admins excluded)</p>
                    </div>

                    <div className={`group ${cardTransition} bg-white rounded-2xl p-5 border border-slate-200 shadow-sm hover:shadow-xl hover:scale-[1.02] hover:-translate-y-0.5 hover:bg-gradient-to-br hover:from-purple-400 hover:to-blue-400 hover:border-transparent cursor-pointer`}>
                      <div className="flex items-center gap-3 mb-4">
                        <div className="w-11 h-11 rounded-xl bg-emerald-50 flex items-center justify-center group-hover:bg-white/20">
                          <FiMapPin className="w-5 h-5 text-emerald-600 group-hover:text-white" />
                        </div>
                        <span className="text-sm font-medium text-slate-500 group-hover:text-white">Total Locations</span>
                      </div>
                      <div className="flex items-end justify-between">
                        <p className="text-3xl font-bold text-slate-900 tabular-nums group-hover:text-white">{stats.loading ? '—' : stats.totalLocations}</p>
                        {!stats.loading && stats.newLocationsThisMonth > 0 && (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-green-50 text-green-700 group-hover:bg-white/20 group-hover:text-white text-xs font-semibold">
                            <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 15l7-7 7 7" /></svg>
                            +{stats.newLocationsThisMonth}
                          </span>
                        )}
                      </div>
                      <p className="text-xs text-slate-400 mt-2 group-hover:text-white/90">{avgLocationsPerUser} avg per user</p>
                    </div>

                    <div className={`group ${cardTransition} bg-white rounded-2xl p-5 border border-slate-200 shadow-sm hover:shadow-xl hover:scale-[1.02] hover:-translate-y-0.5 hover:bg-gradient-to-br hover:from-purple-400 hover:to-blue-400 hover:border-transparent cursor-pointer`}>
                      <div className="flex items-center gap-3 mb-4">
                        <div className="w-11 h-11 rounded-xl bg-amber-50 flex items-center justify-center group-hover:bg-white/20">
                          <FiTag className="w-5 h-5 text-amber-600 group-hover:text-white" />
                        </div>
                        <span className="text-sm font-medium text-slate-500 group-hover:text-white">Coupons</span>
                      </div>
                      <div className="flex items-end justify-between">
                        <p className="text-3xl font-bold text-slate-900 tabular-nums group-hover:text-white">{couponsData.loading ? '—' : availableCoupons}</p>
                        <span className="text-xs font-semibold text-slate-500 bg-slate-100 px-2 py-0.5 rounded-full group-hover:bg-white/20 group-hover:text-white">{usedCoupons} used</span>
                      </div>
                      <p className="text-xs text-slate-400 mt-2 group-hover:text-white/90">{totalCoupons} total coupons created</p>
                    </div>
                  </div>

                  {/* Charts Row - same height for both cards */}
                  <div className="grid grid-cols-1 lg:grid-cols-5 gap-5 items-stretch">
                    {/* Subscription Health */}
                    <div className={`${cardTransition} lg:col-span-2 bg-white rounded-2xl border border-slate-200/80 shadow-sm p-6 hover:shadow-lg cursor-pointer flex flex-col min-h-[280px]`}>
                      <div className="flex items-center justify-between mb-5">
                        <h2 className="font-semibold text-gray-900">Subscription Overview</h2>
                        <span className="text-xs text-gray-400 font-medium">{subTotal} total</span>
                      </div>

                      {subscriptionOverview.loading ? (
                        <div className="flex flex-1 items-center justify-center min-h-40">
                          <span className="inline-block h-6 w-6 animate-spin rounded-full border-2 border-purple-200 border-t-purple-500" />
                        </div>
                      ) : (
                        <>
                          <div className="flex items-center gap-7 mb-2 flex-1 min-h-0">
                            <div className="flex flex-col items-center flex-shrink-0">
                              <div className="w-36 h-36">
                                <ResponsiveContainer width="100%" height="100%">
                                  <PieChart margin={{ top: 0, right: 0, bottom: 0, left: 0 }}>
                                    <Tooltip
                                      content={({ active, payload }) => {
                                        if (!active || !payload?.length) return null;
                                        const d = payload[0].payload;
                                        const pct = subTotal > 0 ? ((d.value / subTotal) * 100).toFixed(1) : '0';
                                        return (
                                          <div className="rounded-xl border border-slate-200/80 bg-white/95 px-3 py-2.5 shadow-lg backdrop-blur-sm">
                                            <p className="text-sm font-semibold text-slate-800">{d.name}</p>
                                            <p className="text-xs text-slate-500 mt-0.5">
                                              <span className="font-medium tabular-nums text-slate-700">{d.value}</span>
                                              <span className="ml-1">({pct}%)</span>
                                            </p>
                                          </div>
                                        );
                                      }}
                                      cursor={{ fill: 'transparent' }}
                                    />
                                    <Pie
                                      data={pieChartData}
                                      dataKey="value"
                                      nameKey="name"
                                      cx="50%"
                                      cy="50%"
                                      innerRadius="58%"
                                      outerRadius="78%"
                                      paddingAngle={pieChartData.length > 1 ? 3 : 0}
                                      cornerRadius={6}
                                      stroke="none"
                                      animationDuration={800}
                                      animationBegin={0}
                                      style={{ outline: 'none' }}
                                    >
                                      {pieChartData.map((entry, index) => (
                                        <Cell
                                          key={`cell-${index}`}
                                          fill={entry.color}
                                          className="transition-opacity duration-200 hover:opacity-90"
                                          stroke="rgba(255,255,255,0.4)"
                                          strokeWidth={1}
                                        />
                                      ))}
                                    </Pie>
                                  </PieChart>
                                </ResponsiveContainer>
                              </div>
                              <div className="mt-0 text-center">
                                <p className="text-xl font-bold tabular-nums tracking-tight text-slate-800">{subscriptionRate}%</p>
                                <p className="text-[10px] font-medium text-slate-400 uppercase tracking-wider">Conversion</p>
                              </div>
                            </div>

                            <div className="flex-1 space-y-3 min-w-0">
                              {subSegments.map((seg) => {
                                const pct = subTotal > 0 ? (seg.count / subTotal) * 100 : 0;
                                return (
                                  <div key={seg.label} className="group/seg rounded-lg px-2 py-1.5 -mx-2 transition-colors duration-200 hover:bg-slate-50/80">
                                    <div className="flex items-center justify-between gap-2 mb-1.5">
                                      <div className="flex items-center gap-2 min-w-0">
                                        <span
                                          className="w-2.5 h-2.5 rounded-full flex-shrink-0 ring-2 ring-white shadow-sm"
                                          style={{ backgroundColor: seg.color }}
                                        />
                                        <span className="text-xs font-medium text-slate-600 truncate">{seg.label}</span>
                                      </div>
                                      <div className="flex items-center gap-2 flex-shrink-0">
                                        <span className="text-xs font-semibold text-slate-800 tabular-nums">{seg.count}</span>
                                        <span className="text-[10px] text-slate-400 tabular-nums w-7 text-right">{pct.toFixed(0)}%</span>
                                      </div>
                                    </div>
                                    <div className="h-2 rounded-full bg-slate-100 overflow-hidden">
                                      <div
                                        className="h-full rounded-full transition-all duration-500 ease-out"
                                        style={{
                                          width: `${Math.max(pct, seg.count > 0 ? 4 : 0)}%`,
                                          backgroundColor: seg.color,
                                          boxShadow: seg.count > 0 ? `0 0 8px ${seg.color}40` : undefined,
                                        }}
                                      />
                                    </div>
                                  </div>
                                );
                              })}
                            </div>
                          </div>

                          <div className="grid grid-cols-3 gap-3 pt-3 border-t border-slate-100">
                            <div className="rounded-xl bg-gradient-to-br from-emerald-50 to-green-50/80 px-3 py-2.5 text-center ring-1 ring-emerald-100/80">
                              <p className="text-lg font-bold tabular-nums text-emerald-700">{subscriptionOverview.statusCounts.active + subscriptionOverview.statusCounts.trialing}</p>
                              <p className="text-[10px] font-medium text-emerald-600/80 mt-0.5">Paying / Trial</p>
                            </div>
                            <div className="rounded-xl bg-gradient-to-br from-amber-50 to-orange-50/80 px-3 py-2.5 text-center ring-1 ring-amber-100/80">
                              <p className="text-lg font-bold tabular-nums text-amber-700">{subscriptionOverview.statusCounts.canceled}</p>
                              <p className="text-[10px] font-medium text-amber-600/80 mt-0.5">Churned</p>
                            </div>
                            <div className="rounded-xl bg-gradient-to-br from-slate-50 to-slate-100/80 px-3 py-2.5 text-center ring-1 ring-slate-200/80">
                              <p className="text-lg font-bold tabular-nums text-slate-600">{subscriptionOverview.statusCounts.noSubscription}</p>
                              <p className="text-[10px] font-medium text-slate-500 mt-0.5">No Plan</p>
                            </div>
                          </div>
                        </>
                      )}
                    </div>

                    {/* User & Location Growth Chart */}
                    <div className={`${cardTransition} lg:col-span-3 bg-white rounded-2xl border border-slate-200/80 shadow-sm p-6 hover:shadow-lg cursor-pointer flex flex-col min-h-[280px]`}>
                      <div className="flex items-center justify-between mb-5">
                        <h2 className="font-semibold text-gray-900">Growth Overview</h2>
                        <div className="flex items-center gap-4 text-xs">
                          <span className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-full bg-purple-500" /> Users</span>
                          <span className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-full bg-blue-400" /> Locations</span>
                        </div>
                      </div>
                      <div className="flex-1 min-h-[160px] w-full">
                        <ResponsiveContainer width="100%" height="100%">
                          <BarChart
                            data={usersByMonth}
                            margin={{ top: 8, right: 8, left: -12, bottom: 0 }}
                            barGap={4}
                            barCategoryGap="20%"
                          >
                            <defs>
                              <linearGradient id="growthUsersGrad" x1="0" y1="1" x2="0" y2="0">
                                <stop offset="0%" stopColor="#a855f7" />
                                <stop offset="100%" stopColor="#c084fc" />
                              </linearGradient>
                              <linearGradient id="growthLocationsGrad" x1="0" y1="1" x2="0" y2="0">
                                <stop offset="0%" stopColor="#60a5fa" />
                                <stop offset="100%" stopColor="#93c5fd" />
                              </linearGradient>
                            </defs>
                            <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" vertical={false} />
                            <XAxis
                              dataKey="label"
                              tick={{ fontSize: 11, fill: '#64748b', fontWeight: 500 }}
                              axisLine={{ stroke: '#e2e8f0' }}
                              tickLine={false}
                              dy={4}
                            />
                            <YAxis
                              tick={{ fontSize: 10, fill: '#94a3b8' }}
                              axisLine={false}
                              tickLine={false}
                              width={24}
                              tickFormatter={(v) => (v >= 1000 ? `${v / 1000}k` : String(v))}
                            />
                            <Tooltip
                              content={({ active, payload, label }) => {
                                if (!active || !payload?.length) return null;
                                return (
                                  <div className="rounded-xl border border-slate-200/80 bg-white/95 px-3 py-2.5 shadow-lg backdrop-blur-sm">
                                    <p className="text-xs font-semibold text-slate-500 mb-1.5">{label}</p>
                                    <div className="space-y-1">
                                      {payload.map((p) => (
                                        <p key={p.dataKey} className="text-sm flex items-center gap-2">
                                          <span
                                            className="w-2 h-2 rounded-full shrink-0"
                                            style={{ backgroundColor: p.color }}
                                          />
                                          <span className="text-slate-700 font-medium">{p.name}:</span>
                                          <span className="tabular-nums font-semibold text-slate-800">{p.value}</span>
                                        </p>
                                      ))}
                                    </div>
                                  </div>
                                );
                              }}
                              cursor={{ fill: 'rgba(148,163,184,0.08)' }}
                            />
                            <Legend
                              wrapperStyle={{ paddingTop: 8 }}
                              iconType="circle"
                              iconSize={8}
                              formatter={(value) => <span className="text-xs font-medium text-slate-600">{value}</span>}
                            />
                            <Bar
                              dataKey="users"
                              name="Users"
                              fill="url(#growthUsersGrad)"
                              radius={[4, 4, 0, 0]}
                              maxBarSize={32}
                              animationDuration={600}
                              animationBegin={0}
                            />
                            <Bar
                              dataKey="locations"
                              name="Locations"
                              fill="url(#growthLocationsGrad)"
                              radius={[4, 4, 0, 0]}
                              maxBarSize={32}
                              animationDuration={600}
                              animationBegin={100}
                            />
                          </BarChart>
                        </ResponsiveContainer>
                      </div>
                    </div>
                  </div>

                  {/* Bottom Row */}
                  <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
                    {/* Recent Activity */}
                    <div className={`${cardTransition} lg:col-span-2 bg-white rounded-2xl border border-slate-200/80 shadow-sm overflow-hidden hover:shadow-lg`}>
                      <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between">
                        <div className="flex items-center gap-3">
                          <h2 className="font-semibold text-gray-900">Recent Activity</h2>
                          {recentActivity.length > 0 && (
                            <span className="text-[10px] font-bold text-purple-700 bg-purple-50 px-2 py-0.5 rounded-full tabular-nums">{recentActivity.length}</span>
                          )}
                        </div>
                        <button
                          onClick={() => setSortOrder(sortOrder === 'asc' ? 'desc' : 'asc')}
                          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-gray-500 text-xs font-medium hover:bg-slate-50 cursor-pointer transition-colors"
                        >
                          {sortOrder === 'desc' ? 'Newest' : 'Oldest'}
                          <svg className={`w-3.5 h-3.5 transition-transform ${sortOrder === 'asc' ? 'rotate-180' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" /></svg>
                        </button>
                      </div>

                      {stats.loading ? (
                        <div className="flex items-center justify-center py-16">
                          <span className="inline-block h-5 w-5 animate-spin rounded-full border-2 border-purple-200 border-t-purple-500" />
                        </div>
                      ) : recentActivity.length === 0 ? (
                        <div className="flex flex-col items-center justify-center py-16 text-gray-300">
                          <svg className="w-10 h-10 mb-2" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
                          <p className="text-sm text-gray-400">No recent activity yet</p>
                        </div>
                      ) : (
                        <div className="px-6 py-4">
                          <div className="relative">
                            <div className="absolute left-[17px] top-2 bottom-2 w-px bg-gradient-to-b from-purple-200 via-blue-200 to-transparent" />

                            <div className="space-y-0.5">
                              {recentActivity.slice(0, 6).map((item, idx) => (
                                <div
                                  key={`${item.type}-${item.id}`}
                                  className="relative flex items-start gap-4 py-3 group"
                                >
                                  <div className={`relative z-10 w-[35px] h-[35px] rounded-full flex items-center justify-center shrink-0 ring-[3px] ring-white transition-shadow group-hover:ring-slate-50 ${
                                    item.type === 'user'
                                      ? 'bg-gradient-to-br from-purple-500 to-purple-600 text-white shadow-sm shadow-purple-200'
                                      : 'bg-gradient-to-br from-blue-500 to-blue-600 text-white shadow-sm shadow-blue-200'
                                  }`}>
                                    {item.type === 'user' ? (
                                      <FiUserPlus className="w-3.5 h-3.5" />
                                    ) : (
                                      <FiMapPin className="w-3.5 h-3.5" />
                                    )}
                                  </div>

                                  <div className="flex-1 min-w-0 pt-0.5">
                                    <div className="flex items-center gap-2 mb-0.5">
                                      <span className={`inline-flex px-2 py-0.5 rounded-md text-[10px] font-semibold tracking-wide uppercase ${
                                        item.type === 'user'
                                          ? 'bg-purple-50 text-purple-700'
                                          : 'bg-blue-50 text-blue-700'
                                      }`}>
                                        {item.type === 'user' ? 'User' : 'Location'}
                                      </span>
                                      <span className="text-[11px] text-gray-300 tabular-nums">{item.time}</span>
                                    </div>
                                    <p className="text-sm font-medium text-gray-900">{item.label}</p>
                                    <p className="text-xs text-gray-400 truncate mt-0.5">{item.desc}</p>
                                  </div>

                                  {idx === 0 && (
                                    <span className="shrink-0 mt-1 text-[9px] font-bold text-green-700 bg-green-50 px-1.5 py-0.5 rounded-full uppercase tracking-wider">Latest</span>
                                  )}
                                </div>
                              ))}
                            </div>
                          </div>
                        </div>
                      )}
                    </div>

                    {/* Newest Users + Quick Stats */}
                    <div className="space-y-5">
                      <div className={`${cardTransition} bg-white rounded-2xl border border-slate-200/80 shadow-sm p-5 hover:shadow-lg`}>
                        <div className="flex items-center justify-between mb-4">
                          <h2 className="font-semibold text-gray-900">Newest Users</h2>
                          <button
                            onClick={() => setActiveSection('users')}
                            className="text-[11px] font-medium text-purple-600 hover:text-purple-800 cursor-pointer transition-colors"
                          >
                            View all
                          </button>
                        </div>
                        <div className="space-y-2.5">
                          {stats.loading ? (
                            <div className="flex items-center justify-center py-6">
                              <span className="inline-block h-5 w-5 animate-spin rounded-full border-2 border-purple-200 border-t-purple-500" />
                            </div>
                          ) : newestUsers.length === 0 ? (
                            <p className="text-sm text-gray-400 text-center py-6">No users yet.</p>
                          ) : newestUsers.map((u, idx) => (
                            <div key={u.id} className="flex items-center gap-3 p-2 -mx-2 rounded-xl hover:bg-slate-50 transition-colors group/user">
                              <div className="relative">
                                <div className="w-9 h-9 rounded-full overflow-hidden flex-shrink-0 bg-gradient-to-br from-purple-400 to-blue-400 flex items-center justify-center text-white font-semibold text-xs">
                                  {u.imageUrl ? (
                                    <img src={u.imageUrl} alt="" className="w-full h-full object-cover" />
                                  ) : (
                                    (u.name !== '—' ? u.name[0] : '?').toUpperCase()
                                  )}
                                </div>
                                {idx === 0 && (
                                  <span className="absolute -top-0.5 -right-0.5 w-3 h-3 bg-green-500 rounded-full border-2 border-white" />
                                )}
                              </div>
                              <div className="flex-1 min-w-0">
                                <p className="text-sm font-medium text-gray-900 truncate">{u.name}</p>
                                <p className="text-[11px] text-gray-400 truncate">{u.email}</p>
                              </div>
                              {u.userType === 'admin' ? (
                                <span className="text-[10px] font-semibold text-purple-700 bg-purple-50 px-1.5 py-0.5 rounded">Admin</span>
                              ) : (
                                <span className="text-[10px] text-gray-400 opacity-0 group-hover/user:opacity-100 transition-opacity">{formatUserDate(u.createdAt)}</span>
                              )}
                            </div>
                          ))}
                        </div>
                      </div>

                      <div className={`${cardTransition} bg-gradient-to-br from-purple-500 to-blue-500 rounded-2xl p-5 text-white shadow-md hover:shadow-xl`}>
                        <h2 className="font-semibold mb-4 text-white/90 text-sm uppercase tracking-wide">Quick Stats</h2>
                        <div className="space-y-3">
                          <div className="flex items-center justify-between">
                            <span className="text-sm text-white/75">Avg locations/user</span>
                            <span className="text-sm font-bold">{avgLocationsPerUser}</span>
                          </div>
                          <div className="h-px bg-white/15" />
                          <div className="flex items-center justify-between">
                            <span className="text-sm text-white/75">Subscription rate</span>
                            <span className="text-sm font-bold">{subscriptionRate}%</span>
                          </div>
                          <div className="h-px bg-white/15" />
                          <div className="flex items-center justify-between">
                            <span className="text-sm text-white/75">Admins</span>
                            <span className="text-sm font-bold">{stats.adminCount}</span>
                          </div>
                          <div className="h-px bg-white/15" />
                          <div className="flex items-center justify-between">
                            <span className="text-sm text-white/75">New this month</span>
                            <span className="text-sm font-bold">+{stats.newUsersThisMonth + stats.newLocationsThisMonth}</span>
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                </>
              )}

              {activeSection === 'users' && (
                <div className={`${cardTransition} bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden hover:shadow-md hover:border-slate-300`}>
                  <div className="p-6 pb-4">
                    <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
                      <div>
                        <h1 className="text-xl font-bold text-gray-900">Users</h1>
                        <p className="text-sm text-gray-500 mt-0.5">
                          {stats.loading ? 'Loading…' : `${filteredUsers.length} of ${stats.users.length} users`}
                        </p>
                      </div>
                      <div className="flex flex-col sm:flex-row gap-3 w-full sm:w-auto sm:items-center">
                        <div className="relative w-full sm:w-72">
                          <FiSearch className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 pointer-events-none" />
                          <input
                            type="text"
                            placeholder="Search by name or email…"
                            value={usersFilter}
                            onChange={(e) => setUsersFilter(e.target.value)}
                            className="w-full pl-9 pr-4 py-2.5 rounded-xl border border-slate-200 bg-slate-50/50 text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-purple-500/20 focus:border-purple-500 focus:bg-white transition-colors"
                          />
                        </div>
                        <select
                          value={usersRoleFilter}
                          onChange={(e) => setUsersRoleFilter(e.target.value as 'all' | 'admin' | 'user')}
                          className="py-2.5 px-4 rounded-xl border border-slate-200 bg-slate-50/50 text-gray-900 focus:outline-none focus:ring-2 focus:ring-purple-500/20 focus:border-purple-500 focus:bg-white transition-colors min-w-[140px] cursor-pointer"
                        >
                          <option value="all">All roles</option>
                          <option value="admin">Admin</option>
                          <option value="user">User</option>
                        </select>
                      </div>
                    </div>
                  </div>
                  <div className="overflow-x-auto">
                    <table className="w-full text-left min-w-[600px]">
                      <thead>
                        <tr className="border-y border-slate-200 bg-slate-50/80">
                          <th className="px-5 py-3.5 text-xs font-semibold text-gray-500 uppercase tracking-wider">User</th>
                          <th className="px-5 py-3.5 text-xs font-semibold text-gray-500 uppercase tracking-wider">Email</th>
                          <th className="px-5 py-3.5 text-xs font-semibold text-gray-500 uppercase tracking-wider">Role</th>
                          <th className="px-5 py-3.5 text-xs font-semibold text-gray-500 uppercase tracking-wider text-right">Locations</th>
                          <th className="px-5 py-3.5 text-xs font-semibold text-gray-500 uppercase tracking-wider text-right">Joined</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100">
                        {stats.loading ? (
                          <tr>
                            <td colSpan={5} className="px-5 py-12 text-center text-gray-500">
                              <span className="inline-block h-6 w-6 animate-spin rounded-full border-2 border-purple-200 border-t-purple-500" />
                              <span className="ml-2">Loading users…</span>
                            </td>
                          </tr>
                        ) : filteredUsers.length === 0 ? (
                          <tr>
                            <td colSpan={5} className="px-5 py-12 text-center text-gray-500">
                              {stats.users.length === 0 ? 'No users yet.' : 'No users match your search or role filter.'}
                            </td>
                          </tr>
                        ) : (
                          filteredUsers.map((u) => (
                            <tr
                              key={u.id}
                              className="group transition-colors duration-200 hover:bg-purple-50/60"
                            >
                              <td className="px-5 py-3.5">
                                <div className="flex items-center gap-3">
                                  <div className="w-10 h-10 rounded-full overflow-hidden flex-shrink-0 bg-gradient-to-br from-purple-400 to-blue-400 flex items-center justify-center text-white font-semibold text-sm">
                                    {u.imageUrl ? (
                                      <img src={u.imageUrl} alt="" className="w-full h-full object-cover" />
                                    ) : (
                                      (u.name !== '—' ? u.name[0] : '?').toUpperCase()
                                    )}
                                  </div>
                                  <span className="font-medium text-gray-900">{u.name}</span>
                                </div>
                              </td>
                              <td className="px-5 py-3.5">
                                <span className="text-gray-600 text-sm">{u.email}</span>
                              </td>
                              <td className="px-5 py-3.5">
                                <span
                                  className={`inline-flex px-2.5 py-1 rounded-lg text-xs font-medium ${
                                    u.userType === 'admin'
                                      ? 'bg-gradient-to-r from-purple-500 to-blue-500 text-white'
                                      : 'bg-slate-100 text-slate-700'
                                  }`}
                                >
                                  {u.userType === 'admin' ? 'Admin' : 'User'}
                                </span>
                              </td>
                              <td className="px-5 py-3.5 text-right">
                                <span className="text-gray-700 font-medium tabular-nums">
                                  {locationsCountByUserId[u.id] ?? 0}
                                </span>
                              </td>
                              <td className="px-5 py-3.5 text-right text-sm text-gray-500 tabular-nums">
                                {formatUserDate(u.createdAt)}
                              </td>
                            </tr>
                          ))
                        )}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}

              {activeSection === 'locations' && (
                <div className={`${cardTransition} bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden hover:shadow-md hover:border-slate-300`}>
                  <div className="p-6 pb-4">
                    <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
                      <div>
                        <h1 className="text-xl font-bold text-gray-900">Locations</h1>
                        <p className="text-sm text-gray-500 mt-0.5">
                          {stats.loading ? 'Loading…' : `${filteredLocations.length} of ${stats.locations.length} locations`}
                        </p>
                      </div>
                      <div className="flex flex-col sm:flex-row gap-3 w-full sm:w-auto sm:items-center">
                        <div className="relative w-full sm:w-72">
                          <FiSearch className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 pointer-events-none" />
                          <input
                            type="text"
                            placeholder="Search by city, address, zip or tag…"
                            value={locationsFilter}
                            onChange={(e) => setLocationsFilter(e.target.value)}
                            className="w-full pl-9 pr-4 py-2.5 rounded-xl border border-slate-200 bg-slate-50/50 text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-purple-500/20 focus:border-purple-500 focus:bg-white transition-colors"
                          />
                        </div>
                        <button
                          type="button"
                          onClick={() => {
                            setShowBulkCsvModal(true);
                            setBulkUploadError(null);
                            setBulkUploadSuccess(null);
                            setBulkCsvFile(null);
                          }}
                          disabled={bulkUploadLoading || showBulkCsvModal}
                          className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl border border-slate-200 bg-white text-gray-700 text-sm font-medium hover:bg-slate-50 hover:border-slate-300 focus:outline-none focus:ring-2 focus:ring-purple-500/20 focus:border-purple-500 transition-colors disabled:opacity-60 disabled:cursor-not-allowed shrink-0 cursor-pointer"
                        >
                          <FiUpload className="w-4 h-4" />
                          Upload CSV
                        </button>
                      </div>
                    </div>
                    {(bulkUploadError || bulkUploadSuccess !== null) && (
                      <div className={`mt-3 px-4 py-2.5 rounded-xl text-sm ${bulkUploadError ? 'bg-red-50 text-red-800 border border-red-200' : 'bg-green-50 text-green-800 border border-green-200'}`}>
                        {bulkUploadError ? bulkUploadError : `${bulkUploadSuccess} location(s) added.`}
                      </div>
                    )}
                  </div>
                  <div className="overflow-x-auto">
                    <table className="w-full text-left min-w-[640px]">
                      <thead>
                        <tr className="border-y border-slate-200 bg-slate-50/80">
                          <th className="px-5 py-3.5 text-xs font-semibold text-gray-500 uppercase tracking-wider">Location</th>
                          <th className="px-5 py-3.5 text-xs font-semibold text-gray-500 uppercase tracking-wider">Address</th>
                          <th className="px-5 py-3.5 text-xs font-semibold text-gray-500 uppercase tracking-wider">ZIP</th>
                          <th className="px-5 py-3.5 text-xs font-semibold text-gray-500 uppercase tracking-wider">Tags</th>
                          <th className="px-5 py-3.5 text-xs font-semibold text-gray-500 uppercase tracking-wider">Added by</th>
                          <th className="px-5 py-3.5 text-xs font-semibold text-gray-500 uppercase tracking-wider text-right">Added</th>
                          <th className="px-5 py-3.5 text-xs font-semibold text-gray-500 uppercase tracking-wider text-right w-24">Actions</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100">
                        {stats.loading ? (
                          <tr>
                            <td colSpan={7} className="px-5 py-12 text-center text-gray-500">
                              <span className="inline-block h-6 w-6 animate-spin rounded-full border-2 border-purple-200 border-t-purple-500" />
                              <span className="ml-2">Loading locations…</span>
                            </td>
                          </tr>
                        ) : filteredLocations.length === 0 ? (
                          <tr>
                            <td colSpan={7} className="px-5 py-12 text-center text-gray-500">
                              {stats.locations.length === 0 ? 'No locations yet.' : 'No locations match your search.'}
                            </td>
                          </tr>
                        ) : (
                          filteredLocations.map((loc) => {
                            const addedByUser = loc.createdBy ? stats.users.find((u) => u.id === loc.createdBy) : null;
                            return (
                              <tr
                                key={loc.id}
                                className="group transition-colors duration-200 hover:bg-purple-50/60"
                              >
                                <td className="px-5 py-3.5">
                                  <div className="flex items-center gap-3">
                                    <div className="w-12 h-12 rounded-xl overflow-hidden flex-shrink-0 bg-slate-100 flex items-center justify-center">
                                      {loc.image ? (
                                        <img src={loc.image} alt="" className="w-full h-full object-cover" />
                                      ) : (
                                        <FiMapPin className="w-6 h-6 text-purple-400" />
                                      )}
                                    </div>
                                    <div className="min-w-0">
                                      <span className="font-medium text-gray-900 block truncate">{loc.city}</span>
                                      {loc.badge?.letter && (
                                        <span
                                          className="inline-flex w-6 h-6 items-center justify-center rounded-md text-xs font-bold text-white"
                                          style={{ backgroundColor: loc.badge.color || '#6b7280' }}
                                        >
                                          {loc.badge.letter}
                                        </span>
                                      )}
                                    </div>
                                  </div>
                                </td>
                                <td className="px-5 py-3.5">
                                  <span className="text-gray-600 text-sm line-clamp-2 max-w-[200px]">{loc.address}</span>
                                </td>
                                <td className="px-5 py-3.5">
                                  <span className="text-gray-600 text-sm tabular-nums">{loc.zip}</span>
                                </td>
                                <td className="px-5 py-3.5">
                                  <div className="flex flex-wrap gap-1.5 max-w-[180px]">
                                    {loc.tags.slice(0, 3).map((tag, i) => (
                                      <span
                                        key={i}
                                        className="inline-flex px-2 py-0.5 rounded-md bg-slate-100 text-slate-600 text-xs font-medium"
                                      >
                                        {tag}
                                      </span>
                                    ))}
                                    {loc.tags.length > 3 && (
                                      <span className="inline-flex px-2 py-0.5 rounded-md bg-slate-100 text-slate-500 text-xs">
                                        +{loc.tags.length - 3}
                                      </span>
                                    )}
                                    {loc.tags.length === 0 && (
                                      <span className="text-gray-400 text-xs">—</span>
                                    )}
                                  </div>
                                </td>
                                <td className="px-5 py-3.5">
                                  {addedByUser ? (
                                    <span className="text-gray-600 text-sm truncate max-w-[140px] block" title={addedByUser.email}>
                                      {addedByUser.name || addedByUser.email}
                                    </span>
                                  ) : (
                                    <span className="text-gray-400 text-sm">—</span>
                                  )}
                                </td>
                                <td className="px-5 py-3.5 text-right text-sm text-gray-500 tabular-nums">
                                  {formatLocationDate(loc.createdAt)}
                                </td>
                                <td className="px-5 py-3.5 text-right">
                                  <div className="relative inline-block">
                                    <button
                                      type="button"
                                      onClick={() => setLocationMenuOpen(locationMenuOpen === loc.id ? null : loc.id)}
                                      className="p-2 rounded-lg text-gray-500 hover:bg-slate-100 hover:text-gray-700 transition cursor-pointer"
                                      aria-label="Manage location"
                                    >
                                      <FiMoreVertical className="w-5 h-5" />
                                    </button>
                                    {locationMenuOpen === loc.id && (
                                      <>
                                        <div className="fixed inset-0 z-10" aria-hidden onClick={() => setLocationMenuOpen(null)} />
                                        <div className="absolute right-0 top-full mt-1 z-20 w-40 py-1 bg-white rounded-xl border border-slate-200 shadow-lg">
                                          <button
                                            type="button"
                                            onClick={() => openEditLocation(loc)}
                                            className="w-full flex items-center gap-2 px-4 py-2.5 text-left text-sm text-gray-700 hover:bg-purple-50 hover:text-purple-700 cursor-pointer"
                                          >
                                            <FiEdit2 className="w-4 h-4" />
                                            Edit
                                          </button>
                                          <button
                                            type="button"
                                            onClick={() => openDeleteLocation(loc)}
                                            className="w-full flex items-center gap-2 px-4 py-2.5 text-left text-sm text-red-600 hover:bg-red-50 cursor-pointer"
                                          >
                                            <FiTrash2 className="w-4 h-4" />
                                            Delete
                                          </button>
                                        </div>
                                      </>
                                    )}
                                  </div>
                                </td>
                              </tr>
                            );
                          })
                        )}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}

              {activeSection === 'subscriptions' && (
                <div className="space-y-6">
                
                  {subscriptionOverview.loading ? (
                    <div className="flex items-center justify-center py-12">
                      <span className="h-8 w-8 animate-spin rounded-full border-2 border-purple-200 border-t-purple-500" />
                      <span className="ml-3 text-gray-500">Loading subscriptions…</span>
                    </div>
                  ) : subscriptionOverview.error ? (
                    <div className="rounded-2xl border border-red-200 bg-red-50/50 p-4 text-red-700 text-sm">
                      {subscriptionOverview.error}
                    </div>
                  ) : (
                    <>
                      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4">
                        <div
                          className={`group ${cardTransition} bg-white rounded-2xl p-5 border border-slate-200 shadow-sm hover:shadow-xl hover:scale-[1.02] hover:-translate-y-0.5 hover:bg-gradient-to-br hover:from-purple-400 hover:to-blue-400 hover:border-transparent cursor-pointer`}
                        >
                          <div className="flex items-center justify-between mb-3">
                            <span className="text-gray-600 text-sm font-medium group-hover:text-white/90">Active</span>
                            <FiCreditCard className="w-5 h-5 text-purple-400 group-hover:text-white/90" />
                          </div>
                          <p className="text-2xl font-bold text-gray-900 group-hover:text-white">
                            {subscriptionOverview.loading ? '—' : subscriptionOverview.statusCounts.active}
                          </p>
                          <p className="text-xs text-gray-500 mt-1 group-hover:text-white/80">Paid active</p>
                        </div>
                        <div
                          className={`group ${cardTransition} bg-white rounded-2xl p-5 border border-slate-200 shadow-sm hover:shadow-xl hover:scale-[1.02] hover:-translate-y-0.5 hover:bg-gradient-to-br hover:from-purple-400 hover:to-blue-400 hover:border-transparent cursor-pointer`}
                        >
                          <div className="flex items-center justify-between mb-3">
                            <span className="text-gray-600 text-sm font-medium group-hover:text-white/90">Trialing</span>
                            <FiCreditCard className="w-5 h-5 text-blue-400 group-hover:text-white/90" />
                          </div>
                          <p className="text-2xl font-bold text-gray-900 group-hover:text-white">
                            {subscriptionOverview.loading ? '—' : subscriptionOverview.statusCounts.trialing}
                          </p>
                          <p className="text-xs text-gray-500 mt-1 group-hover:text-white/80">In trial</p>
                        </div>
                        <div
                          className={`group ${cardTransition} bg-white rounded-2xl p-5 border border-slate-200 shadow-sm hover:shadow-xl hover:scale-[1.02] hover:-translate-y-0.5 hover:bg-gradient-to-br hover:from-purple-400 hover:to-blue-400 hover:border-transparent cursor-pointer`}
                        >
                          <div className="flex items-center justify-between mb-3">
                            <span className="text-gray-600 text-sm font-medium group-hover:text-white/90">Past due</span>
                            <FiCreditCard className="w-5 h-5 text-amber-500 group-hover:text-white/90" />
                          </div>
                          <p className="text-2xl font-bold text-gray-900 group-hover:text-white">
                            {subscriptionOverview.loading ? '—' : subscriptionOverview.statusCounts.past_due}
                          </p>
                          <p className="text-xs text-gray-500 mt-1 group-hover:text-white/80">Payment issue</p>
                        </div>
                        <div
                          className={`group ${cardTransition} bg-white rounded-2xl p-5 border border-slate-200 shadow-sm hover:shadow-xl hover:scale-[1.02] hover:-translate-y-0.5 hover:bg-gradient-to-br hover:from-purple-400 hover:to-blue-400 hover:border-transparent cursor-pointer`}
                        >
                          <div className="flex items-center justify-between mb-3">
                            <span className="text-gray-600 text-sm font-medium group-hover:text-white/90">Canceled</span>
                            <FiCreditCard className="w-5 h-5 text-slate-500 group-hover:text-white/90" />
                          </div>
                          <p className="text-2xl font-bold text-gray-900 group-hover:text-white">
                            {subscriptionOverview.loading ? '—' : subscriptionOverview.statusCounts.canceled}
                          </p>
                          <p className="text-xs text-gray-500 mt-1 group-hover:text-white/80">Ended</p>
                        </div>
                        <div
                          className={`group ${cardTransition} bg-white rounded-2xl p-5 border border-slate-200 shadow-sm hover:shadow-xl hover:scale-[1.02] hover:-translate-y-0.5 hover:bg-gradient-to-br hover:from-purple-400 hover:to-blue-400 hover:border-transparent cursor-pointer`}
                        >
                          <div className="flex items-center justify-between mb-3">
                            <span className="text-gray-600 text-sm font-medium group-hover:text-white/90">No plan</span>
                            <FiCreditCard className="w-5 h-5 text-gray-400 group-hover:text-white/90" />
                          </div>
                          <p className="text-2xl font-bold text-gray-900 group-hover:text-white">
                            {subscriptionOverview.loading ? '—' : subscriptionOverview.statusCounts.noSubscription}
                          </p>
                          <p className="text-xs text-gray-500 mt-1 group-hover:text-white/80">No subscription</p>
                        </div>
                      </div>

                      <div className={`${cardTransition} bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden`}>
                        <div className="overflow-x-auto">
                          <table className="w-full min-w-[640px]">
                            <thead>
                              <tr className="border-b border-slate-200 bg-slate-50/80">
                                <th className="text-left py-3 px-4 text-xs font-semibold uppercase tracking-wider text-slate-600">User</th>
                                <th className="text-left py-3 px-4 text-xs font-semibold uppercase tracking-wider text-slate-600">Email</th>
                                <th className="text-left py-3 px-4 text-xs font-semibold uppercase tracking-wider text-slate-600">Role</th>
                                <th className="text-left py-3 px-4 text-xs font-semibold uppercase tracking-wider text-slate-600">Subscription type</th>
                                <th className="text-left py-3 px-4 text-xs font-semibold uppercase tracking-wider text-slate-600">Status</th>
                                <th className="text-left py-3 px-4 text-xs font-semibold uppercase tracking-wider text-slate-600">Renews on</th>
                              </tr>
                            </thead>
                            <tbody>
                              {subscriptionOverview.subscriptionUsers.map((u) => (
                                <tr key={u.id} className="border-b border-slate-100 hover:bg-slate-50/50">
                                  <td className="py-3 px-4">
                                    <div className="flex items-center gap-3">
                                      <div className="h-9 w-9 flex-shrink-0 overflow-hidden rounded-full bg-gradient-to-br from-purple-400 to-blue-400 flex items-center justify-center text-sm font-semibold text-white">
                                        {u.imageUrl ? (
                                          <img src={u.imageUrl} alt="" className="h-full w-full object-cover" />
                                        ) : (
                                          (u.name || u.email || '?')[0].toUpperCase()
                                        )}
                                      </div>
                                      <span className="text-sm font-medium text-gray-900">{u.name}</span>
                                    </div>
                                  </td>
                                  <td className="py-3 px-4 text-sm text-gray-600">{u.email}</td>
                                  <td className="py-3 px-4">
                                    <span className="inline-flex rounded-full px-2 py-0.5 text-xs font-medium bg-slate-100 text-slate-700">
                                      {u.userType}
                                    </span>
                                  </td>
                                  <td className="py-3 px-4 text-sm text-gray-700 capitalize">{u.subscription?.planType ?? '—'}</td>
                                  <td className="py-3 px-4">
                                    {u.subscription ? (
                                      <span className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium ${
                                        u.subscription.status === 'active' || u.subscription.status === 'trialing'
                                          ? 'bg-emerald-100 text-emerald-700'
                                          : u.subscription.status === 'past_due'
                                            ? 'bg-amber-100 text-amber-700'
                                            : 'bg-slate-100 text-slate-600'
                                      }`}>
                                        {subscriptionStatusLabel(u.subscription.status)}
                                      </span>
                                    ) : (
                                      <span className="text-slate-400 text-sm">No subscription</span>
                                    )}
                                  </td>
                                  <td className="py-3 px-4 text-sm text-gray-600">
                                    {u.subscription?.currentPeriodEnd
                                      ? formatSubscriptionPeriodEnd(u.subscription.currentPeriodEnd)
                                      : '—'}
                                  </td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      </div>
                    </>
                  )}
                </div>
              )}

              {activeSection === 'accounting' && (
                <div className="space-y-6">
                  {/* KPI Cards */}
                  <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-5 gap-5">
                    <div className={`group ${cardTransition} bg-white rounded-2xl p-5 border border-slate-200 shadow-sm hover:shadow-xl hover:scale-[1.02] hover:-translate-y-0.5 hover:bg-gradient-to-br hover:from-purple-400 hover:to-blue-400 hover:border-transparent cursor-pointer`}>
                      <div className="flex items-center gap-3 mb-4">
                        <div className="w-11 h-11 rounded-xl bg-purple-50 flex items-center justify-center group-hover:bg-white/20">
                          <FiDollarSign className="w-5 h-5 text-purple-600 group-hover:text-white" />
                        </div>
                        <span className="text-sm font-medium text-slate-500 group-hover:text-white">MRR</span>
                      </div>
                      <p className="text-3xl font-bold text-slate-900 tabular-nums group-hover:text-white">
                        {subscriptionOverview.loading ? '—' : `$${Math.round(accountingKpis.mrr).toLocaleString()}`}
                      </p>
                      <p className="text-xs text-slate-400 mt-2 group-hover:text-white/90">Monthly recurring revenue from paying users</p>
                    </div>
                    <div className={`group ${cardTransition} bg-white rounded-2xl p-5 border border-slate-200 shadow-sm hover:shadow-xl hover:scale-[1.02] hover:-translate-y-0.5 hover:bg-gradient-to-br hover:from-purple-400 hover:to-blue-400 hover:border-transparent cursor-pointer`}>
                      <div className="flex items-center gap-3 mb-4">
                        <div className="w-11 h-11 rounded-xl bg-emerald-50 flex items-center justify-center group-hover:bg-white/20">
                          <FiDollarSign className="w-5 h-5 text-emerald-600 group-hover:text-white" />
                        </div>
                        <span className="text-sm font-medium text-slate-500 group-hover:text-white">This quarter</span>
                      </div>
                      <p className="text-3xl font-bold text-slate-900 tabular-nums group-hover:text-white">
                        {subscriptionOverview.loading ? '—' : `$${accountingKpis.thisQuarterRevenue.toLocaleString()}`}
                      </p>
                      <p className="text-xs text-slate-400 mt-2 group-hover:text-white/90">Revenue from renewals this quarter</p>
                    </div>
                    <div className={`group ${cardTransition} bg-white rounded-2xl p-5 border border-slate-200 shadow-sm hover:shadow-xl hover:scale-[1.02] hover:-translate-y-0.5 hover:bg-gradient-to-br hover:from-purple-400 hover:to-blue-400 hover:border-transparent cursor-pointer`}>
                      <div className="flex items-center gap-3 mb-4">
                        <div className="w-11 h-11 rounded-xl bg-blue-50 flex items-center justify-center group-hover:bg-white/20">
                          <FiDollarSign className="w-5 h-5 text-blue-600 group-hover:text-white" />
                        </div>
                        <span className="text-sm font-medium text-slate-500 group-hover:text-white">This year</span>
                      </div>
                      <p className="text-3xl font-bold text-slate-900 tabular-nums group-hover:text-white">
                        {subscriptionOverview.loading ? '—' : `$${accountingKpis.thisYearRevenue.toLocaleString()}`}
                      </p>
                      <p className="text-xs text-slate-400 mt-2 group-hover:text-white/90">Revenue from renewals this year</p>
                    </div>
                    <div className={`group ${cardTransition} bg-white rounded-2xl p-5 border border-slate-200 shadow-sm hover:shadow-xl hover:scale-[1.02] hover:-translate-y-0.5 hover:bg-gradient-to-br hover:from-purple-400 hover:to-blue-400 hover:border-transparent cursor-pointer`}>
                      <div className="flex items-center gap-3 mb-4">
                        <div className="w-11 h-11 rounded-xl bg-amber-50 flex items-center justify-center group-hover:bg-white/20">
                          <FiCreditCard className="w-5 h-5 text-amber-600 group-hover:text-white" />
                        </div>
                        <span className="text-sm font-medium text-slate-500 group-hover:text-white">Paying subs</span>
                      </div>
                      <p className="text-3xl font-bold text-slate-900 tabular-nums group-hover:text-white">
                        {subscriptionOverview.loading ? '—' : accountingKpis.payingCount}
                      </p>
                      <p className="text-xs text-slate-400 mt-2 group-hover:text-white/90">{accountingKpis.monthlySubs} monthly · {accountingKpis.yearlySubs} yearly</p>
                    </div>
                    <div className={`group ${cardTransition} bg-white rounded-2xl p-5 border border-slate-200 shadow-sm hover:shadow-xl hover:scale-[1.02] hover:-translate-y-0.5 hover:bg-gradient-to-br hover:from-purple-400 hover:to-blue-400 hover:border-transparent cursor-pointer`}>
                      <div className="flex items-center gap-3 mb-4">
                        <div className="w-11 h-11 rounded-xl bg-violet-50 flex items-center justify-center group-hover:bg-white/20">
                          <FiDollarSign className="w-5 h-5 text-violet-600 group-hover:text-white" />
                        </div>
                        <span className="text-sm font-medium text-slate-500 group-hover:text-white">Upcoming 30 days</span>
                      </div>
                      <p className="text-3xl font-bold text-slate-900 tabular-nums group-hover:text-white">
                        {subscriptionOverview.loading ? '—' : `$${accountingKpis.upcoming30DaysRevenue.toLocaleString()}`}
                      </p>
                      <p className="text-xs text-slate-400 mt-2 group-hover:text-white/90">Renewals due in the next 30 days</p>
                    </div>
                  </div>

                  {/* Charts row */}
                  <div className="grid grid-cols-1 lg:grid-cols-5 gap-5 items-stretch">
                    {/* Revenue by period – Bar chart */}
                    <div className={`${cardTransition} lg:col-span-3 bg-white rounded-2xl border border-slate-200 shadow-sm p-6 hover:shadow-lg flex flex-col min-h-[300px]`}>
                      <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
                        <h2 className="font-semibold text-gray-900">Revenue by period</h2>
                        <div className="flex flex-wrap gap-1">
                          {(['monthly', 'quarterly', 'yearly'] as const).map((view) => (
                            <button
                              key={view}
                              type="button"
                              onClick={() => setAccountingView(view)}
                              className={`inline-flex items-center rounded-lg px-3 py-1.5 text-xs font-medium transition cursor-pointer ${
                                accountingView === view
                                  ? 'bg-purple-100 text-purple-700'
                                  : 'text-slate-500 hover:bg-slate-100 hover:text-slate-700'
                              }`}
                            >
                              {view === 'monthly' && 'Monthly'}
                              {view === 'quarterly' && 'Quarterly'}
                              {view === 'yearly' && 'Yearly'}
                            </button>
                          ))}
                        </div>
                      </div>
                      {subscriptionOverview.loading ? (
                        <div className="flex-1 flex items-center justify-center min-h-[200px]">
                          <span className="h-8 w-8 animate-spin rounded-full border-2 border-purple-200 border-t-purple-500" />
                        </div>
                      ) : (
                        <div className="flex-1 min-h-[220px] w-full">
                          <ResponsiveContainer width="100%" height="100%">
                            <BarChart data={accountingBarData} margin={{ top: 8, right: 8, left: -12, bottom: 0 }} barGap={4} barCategoryGap="24%">
                              <defs>
                                <linearGradient id="accountingRevenueGrad" x1="0" y1="1" x2="0" y2="0">
                                  <stop offset="0%" stopColor="#8b5cf6" />
                                  <stop offset="100%" stopColor="#a78bfa" />
                                </linearGradient>
                              </defs>
                              <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" vertical={false} />
                              <XAxis
                                dataKey="periodLabel"
                                tick={{ fontSize: 11, fill: '#64748b', fontWeight: 500 }}
                                axisLine={{ stroke: '#e2e8f0' }}
                                tickLine={false}
                                dy={4}
                              />
                              <YAxis
                                tick={{ fontSize: 10, fill: '#94a3b8' }}
                                axisLine={false}
                                tickLine={false}
                                width={36}
                                tickFormatter={(v) => (v >= 1000 ? `$${v / 1000}k` : `$${v}`)}
                              />
                              <Tooltip
                                content={({ active, payload, label }) => {
                                  if (!active || !payload?.length) return null;
                                  const rev = payload[0]?.value as number;
                                  const count = (payload[0]?.payload as { count?: number })?.count ?? 0;
                                  return (
                                    <div className="rounded-xl border border-slate-200/80 bg-white/95 px-3 py-2.5 shadow-lg backdrop-blur-sm">
                                      <p className="text-xs font-semibold text-slate-500 mb-1">{label}</p>
                                      <p className="text-sm font-semibold text-slate-800">${rev.toLocaleString()}</p>
                                      <p className="text-xs text-slate-500">{count} renewal{count !== 1 ? 's' : ''}</p>
                                    </div>
                                  );
                                }}
                                cursor={{ fill: 'rgba(148,163,184,0.08)' }}
                              />
                              <Bar
                                dataKey="revenue"
                                name="Revenue"
                                fill="url(#accountingRevenueGrad)"
                                radius={[6, 6, 0, 0]}
                                maxBarSize={48}
                                animationDuration={600}
                                animationBegin={0}
                              />
                            </BarChart>
                          </ResponsiveContainer>
                        </div>
                      )}
                    </div>

                    {/* Plan mix – Pie */}
                    <div className={`${cardTransition} lg:col-span-2 bg-white rounded-2xl border border-slate-200 shadow-sm p-6 hover:shadow-lg flex flex-col min-h-[300px]`}>
                      <h2 className="font-semibold text-gray-900 mb-1">Revenue by plan</h2>
                      <p className="text-xs text-slate-500 mb-4">Current paying subs (recurring)</p>
                      {subscriptionOverview.loading ? (
                        <div className="flex-1 flex items-center justify-center min-h-[200px]">
                          <span className="h-8 w-8 animate-spin rounded-full border-2 border-purple-200 border-t-purple-500" />
                        </div>
                      ) : accountingKpis.planMixPieData.length === 0 ? (
                        <div className="flex-1 flex items-center justify-center min-h-[200px] text-slate-500 text-sm">
                          No paying subscriptions
                        </div>
                      ) : (
                        <div className="flex-1 flex items-center gap-4 min-h-0">
                          <div className="w-32 h-32 flex-shrink-0">
                            <ResponsiveContainer width="100%" height="100%">
                              <PieChart margin={{ top: 0, right: 0, bottom: 0, left: 0 }}>
                                <Tooltip
                                  content={({ active, payload }) => {
                                    if (!active || !payload?.length) return null;
                                    const d = payload[0].payload;
                                    const total = accountingKpis.planMixPieData.reduce((s, x) => s + x.value, 0);
                                    const pct = total > 0 ? ((d.value / total) * 100).toFixed(1) : '0';
                                    return (
                                      <div className="rounded-xl border border-slate-200/80 bg-white/95 px-3 py-2.5 shadow-lg backdrop-blur-sm">
                                        <p className="text-sm font-semibold text-slate-800">{d.name}</p>
                                        <p className="text-xs text-slate-600">${d.value.toLocaleString()} ({pct}%)</p>
                                      </div>
                                    );
                                  }}
                                  cursor={{ fill: 'transparent' }}
                                />
                                <Pie
                                  data={accountingKpis.planMixPieData}
                                  dataKey="value"
                                  nameKey="name"
                                  cx="50%"
                                  cy="50%"
                                  innerRadius="50%"
                                  outerRadius="90%"
                                  paddingAngle={2}
                                  cornerRadius={6}
                                  stroke="rgba(255,255,255,0.5)"
                                  strokeWidth={1}
                                >
                                  {accountingKpis.planMixPieData.map((entry, index) => (
                                    <Cell key={`cell-${index}`} fill={entry.color} />
                                  ))}
                                </Pie>
                              </PieChart>
                            </ResponsiveContainer>
                          </div>
                          <div className="flex-1 space-y-2 min-w-0">
                            {accountingKpis.planMixPieData.map((d) => {
                              const total = accountingKpis.planMixPieData.reduce((s, x) => s + x.value, 0);
                              const pct = total > 0 ? ((d.value / total) * 100).toFixed(0) : '0';
                              return (
                                <div key={d.name} className="flex items-center justify-between gap-2">
                                  <div className="flex items-center gap-2 min-w-0">
                                    <span className="w-3 h-3 rounded-full flex-shrink-0" style={{ backgroundColor: d.color }} />
                                    <span className="text-xs font-medium text-slate-700 truncate">{d.name}</span>
                                  </div>
                                  <span className="text-xs font-semibold text-slate-800 tabular-nums">${d.value.toLocaleString()} ({pct}%)</span>
                                </div>
                              );
                            })}
                          </div>
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              )}

              {activeSection === 'coupons' && (
                <div className={`${cardTransition} bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden hover:shadow-md hover:border-slate-300`}>
                  <div className="p-6 pb-4">
                    <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
                      <div>
                        <h1 className="text-xl font-bold text-gray-900">Free access coupons</h1>
                        <p className="text-sm text-gray-500 mt-0.5">
                          {couponsData.loading ? 'Loading…' : `${filteredCoupons.length} of ${couponsData.coupons.length} coupon(s)`}
                        </p>
                      </div>
                      <div className="flex flex-wrap gap-3 sm:items-center">
                        <select
                          value={couponsStatusFilter}
                          onChange={(e) => setCouponsStatusFilter(e.target.value as 'all' | 'new' | 'used')}
                          className="h-10 px-4 rounded-xl border border-slate-200 bg-slate-50/50 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-purple-500/20 focus:border-purple-500 focus:bg-white transition-colors min-w-[120px] cursor-pointer"
                        >
                          <option value="all">All statuses</option>
                          <option value="new">New</option>
                          <option value="used">Used</option>
                        </select>
                        <button
                          type="button"
                          onClick={() => setShowCreateCoupon(true)}
                          className="h-10 inline-flex items-center gap-2 rounded-xl bg-gradient-to-r from-purple-500 to-blue-500 px-4 text-sm font-semibold text-white shadow-sm hover:from-purple-600 hover:to-blue-600 cursor-pointer shrink-0"
                        >
                          <FiPlus className="w-4 h-4" />
                          Create coupon
                        </button>
                      </div>
                    </div>
                    {showCreateCoupon && (
                      <form onSubmit={handleCreateCoupon} className="mt-4 p-4 rounded-xl border border-slate-200 bg-slate-50/50 space-y-3">
                        <h3 className="font-semibold text-gray-900">New coupon</h3>
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                          <div>
                            <label htmlFor="coupon-name" className="block text-sm font-medium text-gray-700 mb-1">Name</label>
                            <input
                              id="coupon-name"
                              type="text"
                              value={couponForm.name}
                              onChange={(e) => setCouponForm((f) => ({ ...f, name: e.target.value }))}
                              placeholder="e.g. Launch promo"
                              className="w-full rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-gray-900 placeholder-gray-400 focus:border-purple-500 focus:outline-none focus:ring-2 focus:ring-purple-500/20"
                            />
                            {suggestedCouponCode && (
                              <p className="mt-1.5 text-xs text-gray-500 flex items-center gap-2 flex-wrap">
                                <span>Suggested code:</span>
                                <code className="bg-slate-100 px-2 py-0.5 rounded font-mono text-purple-700">{suggestedCouponCode}</code>
                                <button
                                  type="button"
                                  onClick={() => setCouponForm((f) => ({ ...f, code: suggestedCouponCode }))}
                                  className="text-purple-600 hover:text-purple-700 font-medium cursor-pointer"
                                >
                                  Use suggested
                                </button>
                              </p>
                            )}
                          </div>
                          <div>
                            <label htmlFor="coupon-code" className="block text-sm font-medium text-gray-700 mb-1">Coupon code</label>
                            <input
                              id="coupon-code"
                              type="text"
                              value={couponForm.code}
                              onChange={(e) => setCouponForm((f) => ({ ...f, code: e.target.value.toUpperCase() }))}
                              placeholder="e.g. FREEACCESS2025"
                              className="w-full rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-gray-900 placeholder-gray-400 focus:border-purple-500 focus:outline-none focus:ring-2 focus:ring-purple-500/20 uppercase"
                            />
                          </div>
                        </div>
                        {couponsData.createError && (
                          <p className="text-sm text-red-600">{couponsData.createError}</p>
                        )}
                        <div className="flex gap-2">
                          <button
                            type="submit"
                            disabled={couponsData.creating || !couponForm.name.trim() || !couponForm.code.trim()}
                            className="rounded-xl bg-gradient-to-r from-purple-500 to-blue-500 px-4 py-2.5 text-sm font-semibold text-white shadow-sm hover:from-purple-600 hover:to-blue-600 disabled:opacity-70 cursor-pointer"
                          >
                            {couponsData.creating ? 'Creating…' : 'Create'}
                          </button>
                          <button
                            type="button"
                            onClick={() => { setShowCreateCoupon(false); setCouponForm({ name: '', code: '' }); }}
                            className="rounded-xl border border-slate-200 px-4 py-2.5 text-sm font-medium text-gray-700 hover:bg-slate-50 cursor-pointer"
                          >
                            Cancel
                          </button>
                        </div>
                      </form>
                    )}
                  </div>
                  <div className="overflow-x-auto">
                    <table className="w-full text-left min-w-[700px]">
                      <thead>
                        <tr className="border-y border-slate-200 bg-slate-50/80">
                          <th className="px-5 py-3.5 text-xs font-semibold text-gray-500 uppercase tracking-wider">Name</th>
                          <th className="px-5 py-3.5 text-xs font-semibold text-gray-500 uppercase tracking-wider">Created on</th>
                          <th className="px-5 py-3.5 text-xs font-semibold text-gray-500 uppercase tracking-wider">Coupon code</th>
                          <th className="px-5 py-3.5 text-xs font-semibold text-gray-500 uppercase tracking-wider">Created by</th>
                          <th className="px-5 py-3.5 text-xs font-semibold text-gray-500 uppercase tracking-wider">Used by</th>
                          <th className="px-5 py-3.5 text-xs font-semibold text-gray-500 uppercase tracking-wider">Status</th>
                          <th className="px-5 py-3.5 text-xs font-semibold text-gray-500 uppercase tracking-wider text-right w-24">Actions</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100">
                        {couponsData.loading ? (
                          <tr>
                            <td colSpan={7} className="px-5 py-12 text-center text-gray-500">
                              <span className="inline-block h-6 w-6 animate-spin rounded-full border-2 border-purple-200 border-t-purple-500" />
                              <span className="ml-2">Loading coupons…</span>
                            </td>
                          </tr>
                        ) : couponsData.error ? (
                          <tr>
                            <td colSpan={7} className="px-5 py-8 text-center text-red-600 text-sm">
                              {couponsData.error}
                            </td>
                          </tr>
                        ) : filteredCoupons.length === 0 ? (
                          <tr>
                            <td colSpan={7} className="px-5 py-12 text-center text-gray-500">
                              {couponsData.coupons.length === 0 ? 'No coupons yet. Create one to get started.' : 'No coupons match your filter.'}
                            </td>
                          </tr>
                        ) : (
                          filteredCoupons.map((c) => {
                            const createdByUser = stats.users.find((u) => u.id === c.createdBy);
                            const usedByUser = c.usedBy ? stats.users.find((u) => u.id === c.usedBy) : null;
                            return (
                              <tr key={c.id} className="group transition-colors duration-200 hover:bg-purple-50/60">
                                <td className="px-5 py-3.5 font-medium text-gray-900">{c.name}</td>
                                <td className="px-5 py-3.5 text-sm text-gray-500 tabular-nums">{formatUserDate(c.createdAt)}</td>
                                <td className="px-5 py-3.5">
                                  <span className="font-mono text-sm font-medium text-purple-700 bg-purple-50 px-2 py-1 rounded">{c.code}</span>
                                </td>
                                <td className="px-5 py-3.5 text-sm text-gray-600">
                                  {createdByUser ? createdByUser.name : c.createdBy || '—'}
                                </td>
                                <td className="px-5 py-3.5 text-sm text-gray-600">
                                  {usedByUser ? usedByUser.name : c.usedBy ? 'Unknown user' : '—'}
                                </td>
                                <td className="px-5 py-3.5">
                                  <span
                                    className={`inline-flex px-2.5 py-1 rounded-lg text-xs font-medium ${
                                      c.status === 'used'
                                        ? 'bg-slate-100 text-slate-700'
                                        : 'bg-emerald-100 text-emerald-700'
                                    }`}
                                  >
                                    {c.status === 'used' ? 'Used' : 'New'}
                                  </span>
                                </td>
                                <td className="px-5 py-3.5 text-right">
                                  {c.status === 'new' ? (
                                    <button
                                      type="button"
                                      onClick={() => setDeleteCouponModal({ id: c.id, name: c.name, code: c.code })}
                                      className="p-1.5 rounded-lg text-red-600 hover:bg-red-50 cursor-pointer"
                                      aria-label="Delete coupon"
                                    >
                                      <FiTrash2 className="w-4 h-4" />
                                    </button>
                                  ) : (
                                    <span className="inline-flex p-1.5 text-gray-300" aria-hidden>
                                      <FiTrash2 className="w-4 h-4" />
                                    </span>
                                  )}
                                </td>
                              </tr>
                            );
                          })
                        )}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}

              {activeSection === 'profile' && (
                <div className="space-y-6">
              

                  {/* Horizontal submenu */}
                  <nav
                    className="flex flex-wrap gap-1 border-b border-slate-200 pb-4"
                    aria-label="Profile sections"
                  >
                    {profileSubItems.map((item) => (
                      <button
                        key={item.id}
                        type="button"
                        onClick={() => setProfileSubSection(item.id)}
                        className={`inline-flex items-center gap-2 rounded-lg px-4 py-2.5 text-sm font-medium transition cursor-pointer ${
                          profileSubSection === item.id
                            ? 'bg-purple-100 text-purple-700'
                            : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900'
                        }`}
                      >
                        {item.icon}
                        {item.label}
                      </button>
                    ))}
                  </nav>

                  {/* Profile settings */}
                  {profileSubSection === 'personal' && (
                  <div className={`${cardTransition} bg-white rounded-2xl border border-slate-200 shadow-sm p-6 hover:border-slate-300`}>
                    <h2 className="font-semibold text-gray-900 mb-4">Profile settings</h2>
                    <input
                      ref={profileFileInputRef}
                      type="file"
                      accept="image/*"
                      className="hidden"
                      onChange={handleProfileAvatarChange}
                    />
                    <div className="flex flex-col sm:flex-row gap-6">
                      <div className="flex flex-col items-center sm:items-start">
                        <div className="relative">
                          {userData?.imageUrl || user?.photoURL ? (
                            <img
                              src={userData?.imageUrl || user?.photoURL || ''}
                              alt=""
                              className="w-20 h-20 rounded-full object-cover shadow-md"
                            />
                          ) : (
                            <div className="w-20 h-20 rounded-full bg-gradient-to-br from-purple-400 to-blue-400 flex items-center justify-center text-white text-2xl font-bold shadow-md">
                              {(userData?.name || user?.email)?.[0]?.toUpperCase() || 'A'}
                            </div>
                          )}
                          {avatarUploading && (
                            <div className="absolute inset-0 flex items-center justify-center rounded-full bg-black/50">
                              <span className="h-6 w-6 animate-spin rounded-full border-2 border-white border-t-transparent" />
                            </div>
                          )}
                          <button
                            type="button"
                            onClick={handleProfileAvatarClick}
                            disabled={avatarUploading}
                            className="absolute -bottom-0.5 -right-0.5 w-7 h-7 rounded-full bg-purple-600 text-white flex items-center justify-center shadow-md hover:bg-purple-700 disabled:opacity-70 cursor-pointer border-2 border-white"
                            aria-label="Change photo"
                          >
                            <FiEdit2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                        {avatarError && <p className="mt-2 text-sm text-red-600 text-center sm:text-left">{avatarError}</p>}
                      </div>
                      <form onSubmit={handleSaveProfileName} className="flex-1 min-w-0 space-y-4">
                        <div>
                          <label htmlFor="dashboard-profile-name" className="block text-sm font-medium text-gray-700 mb-1.5">Full name</label>
                          <input
                            id="dashboard-profile-name"
                            type="text"
                            value={profileName}
                            onChange={(e) => setProfileName(e.target.value)}
                            className="w-full rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-gray-900 placeholder-gray-400 focus:border-purple-500 focus:outline-none focus:ring-2 focus:ring-purple-500/20"
                            placeholder="Your name"
                          />
                        </div>
                        <div>
                          <label className="block text-sm font-medium text-gray-700 mb-1.5">Email</label>
                          <div className="rounded-xl border border-slate-200 bg-slate-50/50 px-4 py-2.5 text-gray-700 text-sm">
                            {userData?.email || user?.email || '—'}
                          </div>
                        </div>
                        {profileError && <p className="text-sm text-red-600">{profileError}</p>}
                        {profileSaved && (
                          <p className="text-sm text-emerald-600 flex items-center gap-1.5">
                            <FiCheck className="w-4 h-4" /> Saved.
                          </p>
                        )}
                        <div className="flex flex-wrap gap-3">
                          <button
                            type="submit"
                            disabled={profileSaving}
                            className="rounded-xl bg-gradient-to-r from-purple-500 to-blue-500 px-4 py-2.5 text-sm font-semibold text-white shadow-sm hover:from-purple-600 hover:to-blue-600 disabled:opacity-70 cursor-pointer"
                          >
                            {profileSaving ? 'Saving…' : 'Save changes'}
                          </button>                          
                        </div>
                      </form>
                    </div>
                  </div>
                  )}

                  {/* Login and passwords */}
                  {profileSubSection === 'password' && (
                    <div className={`${cardTransition} bg-white rounded-2xl border border-slate-200 shadow-sm p-6 hover:border-slate-300`}>
                      <h2 className="font-semibold text-gray-900 mb-4">Login and passwords</h2>
                      {!isEmailUser ? (
                        <p className="text-sm text-gray-600">
                          You signed in with a social account. Password change is not applicable.
                        </p>
                      ) : (
                        <form onSubmit={handleChangePassword} className="space-y-5">
                          <div>
                            <label
                              htmlFor="dashboard-current-password"
                              className="block text-sm font-medium text-gray-700 mb-1.5"
                            >
                              Current Password
                            </label>
                            <input
                              id="dashboard-current-password"
                              type="password"
                              value={passwordForm.currentPassword}
                              onChange={(e) =>
                                setPasswordForm((p) => ({ ...p, currentPassword: e.target.value }))
                              }
                              className="w-full rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-gray-900 placeholder-gray-400 focus:border-purple-500 focus:outline-none focus:ring-2 focus:ring-purple-500/20"
                              placeholder="Enter current password"
                              autoComplete="current-password"
                            />
                          </div>
                          <div className="grid gap-5 sm:grid-cols-2">
                            <div>
                              <label
                                htmlFor="dashboard-new-password"
                                className="block text-sm font-medium text-gray-700 mb-1.5"
                              >
                                New Password
                              </label>
                              <input
                                id="dashboard-new-password"
                                type="password"
                                value={passwordForm.newPassword}
                                onChange={(e) =>
                                  setPasswordForm((p) => ({ ...p, newPassword: e.target.value }))
                                }
                                className="w-full rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-gray-900 placeholder-gray-400 focus:border-purple-500 focus:outline-none focus:ring-2 focus:ring-purple-500/20"
                                placeholder="At least 6 characters"
                                autoComplete="new-password"
                              />
                            </div>
                            <div>
                              <label
                                htmlFor="dashboard-confirm-password"
                                className="block text-sm font-medium text-gray-700 mb-1.5"
                              >
                                Confirm New Password
                              </label>
                              <input
                                id="dashboard-confirm-password"
                                type="password"
                                value={passwordForm.confirmPassword}
                                onChange={(e) =>
                                  setPasswordForm((p) => ({ ...p, confirmPassword: e.target.value }))
                                }
                                className="w-full rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-gray-900 placeholder-gray-400 focus:border-purple-500 focus:outline-none focus:ring-2 focus:ring-purple-500/20"
                                placeholder="Confirm new password"
                                autoComplete="new-password"
                              />
                            </div>
                          </div>
                          {passwordError && (
                            <p className="text-sm text-red-600">{passwordError}</p>
                          )}
                          {passwordSuccess && (
                            <p className="text-sm text-emerald-600 flex items-center gap-1.5">
                              <FiCheck className="w-4 h-4" /> Password updated successfully.
                            </p>
                          )}
                          <div className="pt-2">
                            <button
                              type="submit"
                              disabled={passwordSaving}
                              className="rounded-xl bg-gradient-to-r from-purple-500 to-blue-500 px-4 py-2.5 text-sm font-semibold text-white shadow-sm hover:from-purple-600 hover:to-blue-600 disabled:opacity-70 cursor-pointer"
                            >
                              {passwordSaving ? 'Updating…' : 'Update Password'}
                            </button>
                          </div>
                        </form>
                      )}
                    </div>
                  )}

                  {/* Subscription */}
                  {profileSubSection === 'subscription' && (
                  <div className={`${cardTransition} bg-white rounded-2xl border border-slate-200 shadow-sm p-6 hover:border-slate-300`}>
                    <h2 className="font-semibold text-gray-900 mb-2">Subscription</h2>
                    {userData?.userType === 'admin' ? (
                      <div className="flex items-center gap-3 p-4 rounded-xl bg-gradient-to-r from-purple-50 to-blue-50 border border-purple-100">
                        <div className="w-10 h-10 rounded-full bg-gradient-to-br from-purple-400 to-blue-400 flex items-center justify-center text-white shrink-0">
                          <FiCheck className="w-5 h-5" />
                        </div>
                        <div>
                          <p className="font-medium text-gray-900">You are admin</p>
                          <p className="text-sm text-gray-600">You have free access to the system.</p>
                        </div>
                      </div>
                    ) : (
                      <p className="text-sm text-gray-500">Manage your plan on your profile page.</p>
                    )}
                  </div>
                  )}
                </div>
              )}
            </main>

          </div>
        </div>
      </div>

      {/* Edit Location Modal – same layout as Add (home) */}
      {editingLocation && (
        <Modal open={true} onClose={() => !locationSaveLoading && setEditingLocation(null)}>
          <form onSubmit={handleSaveLocation} className="bg-white rounded-3xl shadow-2xl w-full flex flex-col relative z-10 max-w-4xl">
            {/* Header */}
            <div className="flex items-center justify-between px-8 pt-8 pb-6 border-b border-gray-200">
              <div>
                <h2 className="text-3xl font-bold text-gray-900">Edit location</h2>
                <p className="text-sm text-gray-500 mt-1.5">Update the details for this property</p>
              </div>
              <button
                type="button"
                onClick={() => setEditingLocation(null)}
                disabled={locationSaveLoading}
                className="text-gray-400 hover:text-gray-600 transition-colors p-2 hover:bg-gray-100 rounded-full cursor-pointer disabled:opacity-50"
                aria-label="Close"
              >
                <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            {/* Main Content - Two Column Layout */}
            <div className="px-8 py-6 grid grid-cols-1 lg:grid-cols-2 gap-8">
              {/* Left Column - Image */}
              <div className="flex flex-col gap-4">
                <label className="text-sm font-semibold text-gray-700">Property image</label>
                {!editLocationImagePreview ? (
                  <div
                    onDragEnter={(e) => { e.preventDefault(); e.stopPropagation(); setEditLocationDragActive(true); }}
                    onDragLeave={(e) => { e.preventDefault(); setEditLocationDragActive(false); }}
                    onDragOver={(e) => e.preventDefault()}
                    onDrop={(e) => {
                      e.preventDefault();
                      setEditLocationDragActive(false);
                      if (e.dataTransfer.files?.[0]) handleEditLocationImageSelect(e.dataTransfer.files[0]);
                    }}
                    className={`border-2 border-dashed rounded-xl p-6 text-center transition-all h-64 flex items-center justify-center cursor-pointer ${
                      editLocationDragActive ? 'border-purple-500 bg-purple-50' : 'border-gray-300 hover:border-purple-400 hover:bg-gray-50'
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
                        onClick={() => editLocationFileInputRef.current?.click()}
                        className="px-5 py-2 bg-gradient-to-r from-purple-400 to-blue-400 text-white font-semibold rounded-lg hover:from-purple-500 hover:to-blue-500 transition shadow-md text-sm cursor-pointer"
                      >
                        Browse files
                      </button>
                      <p className="text-xs text-gray-400">PNG, JPG, GIF</p>
                    </div>
                    <input
                      ref={editLocationFileInputRef}
                      type="file"
                      accept="image/*"
                      className="hidden"
                      onChange={(e) => e.target.files?.[0] && handleEditLocationImageSelect(e.target.files[0])}
                    />
                  </div>
                ) : (
                  <div className="relative group h-64">
                    <img
                      src={editLocationImagePreview}
                      alt="Preview"
                      className="w-full h-full object-cover rounded-xl border-2 border-gray-200"
                    />
                    <button
                      type="button"
                      onClick={() => {
                        setEditLocationImageFile(null);
                        setEditLocationImagePreview(editingLocation.image || '');
                      }}
                      className="absolute top-3 right-3 bg-red-500 text-white p-2 rounded-full hover:bg-red-600 transition shadow-lg opacity-0 group-hover:opacity-100 cursor-pointer"
                      aria-label="Remove new image"
                    >
                      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                      </svg>
                    </button>
                  </div>
                )}
              </div>

              {/* Right Column - Form fields */}
              <div className="flex flex-col gap-5">
                <div className="flex flex-col gap-4">
                  <InputField
                    name="address"
                    type="text"
                    placeholder="Full address"
                    value={editLocationForm.address}
                    onChange={(e) => setEditLocationForm((f) => ({ ...f, address: e.target.value }))}
                    required
                  />
                  <div className="grid grid-cols-2 gap-4">
                    <InputField
                      name="city"
                      type="text"
                      placeholder="City"
                      value={editLocationForm.city}
                      onChange={(e) => setEditLocationForm((f) => ({ ...f, city: e.target.value }))}
                      required
                    />
                    <InputField
                      name="zip"
                      type="text"
                      placeholder="ZIP code"
                      value={editLocationForm.zip}
                      onChange={(e) => setEditLocationForm((f) => ({ ...f, zip: e.target.value }))}
                      required
                    />
                  </div>
                  <InputField
                    name="tags"
                    type="text"
                    placeholder="Tags (comma separated)"
                    value={editLocationForm.tagsStr}
                    onChange={(e) => setEditLocationForm((f) => ({ ...f, tagsStr: e.target.value }))}
                  />
                </div>

                {/* Grade selection */}
                <div className="flex flex-col gap-3">
                  <label className="block text-sm font-semibold text-gray-700">
                    Grade <span className="text-red-500">*</span>
                  </label>
                  <div className="flex gap-3">
                    {['A', 'B', 'C', 'D', 'F'].map((letter) => (
                      <button
                        key={letter}
                        type="button"
                        onClick={() => setEditLocationForm((f) => ({ ...f, badgeLetter: letter }))}
                        className={`flex-1 px-4 py-3 rounded-xl font-bold text-lg transition-all shadow-sm border-2 cursor-pointer ${
                          editLocationForm.badgeLetter === letter
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

                {locationError && (
                  <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg text-sm flex items-center gap-2">
                    <svg className="w-5 h-5 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                    </svg>
                    <span>{locationError}</span>
                  </div>
                )}
              </div>
            </div>

            {/* Action buttons */}
            <div className="flex gap-3 px-8 pb-8 pt-6 border-t border-gray-200">
              <button
                type="button"
                onClick={() => setEditingLocation(null)}
                disabled={locationSaveLoading}
                className="flex-1 px-6 py-3 border-2 border-gray-300 text-gray-700 font-semibold rounded-xl hover:bg-gray-50 transition cursor-pointer disabled:opacity-50"
              >
                Cancel
              </button>
              <Button type="submit" disabled={locationSaveLoading} className="flex-1">
                {locationSaveLoading ? (
                  <span className="flex items-center justify-center">
                    <svg className="animate-spin h-5 w-5 mr-2 text-white" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z" />
                    </svg>
                    Saving…
                  </span>
                ) : (
                  <span className="flex items-center justify-center gap-2">
                    <FiEdit2 className="w-5 h-5" />
                    Save changes
                  </span>
                )}
              </Button>
            </div>
          </form>
        </Modal>
      )}

      {/* Delete Location Modal */}
      {deleteLocation && (
        <Modal open={true} onClose={() => !locationDeleteLoading && setDeleteLocation(null)}>
          <div className="bg-white rounded-3xl shadow-2xl p-8 w-full max-w-md flex flex-col gap-6">
            <div className="flex items-center gap-4">
              <div className="w-12 h-12 rounded-full bg-red-100 flex items-center justify-center">
                <FiTrash2 className="text-red-600 text-2xl" />
              </div>
              <div>
                <h2 className="text-2xl font-bold text-gray-900">Delete location</h2>
                <p className="text-sm text-gray-500 mt-1">
                  This will permanently remove this location.
                </p>
              </div>
            </div>
            <div className="bg-slate-50 rounded-xl p-4 border border-slate-200">
              <p className="text-sm font-medium text-gray-900">{deleteLocation.city}</p>
              <p className="text-sm text-gray-600 mt-0.5">{deleteLocation.address}</p>
            </div>
            {locationError && (
              <p className="text-sm text-red-600">{locationError}</p>
            )}
            <div className="flex gap-3 pt-2">
              <button
                type="button"
                onClick={() => setDeleteLocation(null)}
                disabled={locationDeleteLoading}
                className="flex-1 px-6 py-3 border-2 border-gray-300 text-gray-700 font-semibold rounded-xl hover:bg-gray-50 transition cursor-pointer disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleDeleteLocation}
                disabled={locationDeleteLoading}
                className="flex-1 px-6 py-3 bg-gradient-to-r from-red-500 to-red-600 text-white font-semibold rounded-xl hover:from-red-600 hover:to-red-700 transition shadow-md disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer"
              >
                {locationDeleteLoading ? (
                  <span className="inline-flex items-center justify-center gap-2">
                    <svg className="animate-spin h-5 w-5" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z" />
                    </svg>
                    Deleting…
                  </span>
                ) : (
                  'Delete'
                )}
              </button>
            </div>
          </div>
        </Modal>
      )}

      {/* Bulk Upload CSV Modal */}
      {showBulkCsvModal && (
        <Modal
          open={true}
          onClose={() => {
            if (!bulkUploadLoading) {
              setShowBulkCsvModal(false);
              setBulkCsvFile(null);
              setBulkUploadError(null);
            }
          }}
        >
          <div className="bg-white rounded-3xl shadow-2xl p-8 w-full max-w-lg flex flex-col gap-6">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="w-12 h-12 rounded-xl bg-purple-100 flex items-center justify-center">
                  <FiUpload className="text-purple-600 w-6 h-6" />
                </div>
                <div>
                  <h2 className="text-xl font-bold text-gray-900">Bulk upload locations</h2>
                  <p className="text-sm text-gray-500 mt-0.5">Add multiple locations from a CSV file</p>
                </div>
              </div>
            </div>
            <div className="rounded-xl border border-slate-200 bg-slate-50/50 p-4">
              <p className="text-sm font-medium text-gray-700 mb-3">Your CSV must have a header row with these column names (order doesn’t matter):</p>
              <ul className="space-y-2 text-sm text-gray-600">
                <li className="flex items-center gap-2">
                  <code className="bg-white px-2 py-0.5 rounded border border-slate-200 font-mono text-purple-700">City</code>
                  <span>— required</span>
                </li>
                <li className="flex items-center gap-2">
                  <code className="bg-white px-2 py-0.5 rounded border border-slate-200 font-mono text-purple-700">Address</code>
                  <span>— required</span>
                </li>
                <li className="flex items-center gap-2">
                  <code className="bg-white px-2 py-0.5 rounded border border-slate-200 font-mono text-purple-700">ZIP</code>
                  <span>— required</span>
                </li>
                <li className="flex items-center gap-2">
                  <code className="bg-white px-2 py-0.5 rounded border border-slate-200 font-mono text-purple-700">Tags</code>
                  <span>— optional; separate multiple tags with commas or semicolons</span>
                </li>
                <li className="flex items-center gap-2">
                  <code className="bg-white px-2 py-0.5 rounded border border-slate-200 font-mono text-purple-700">Grade</code>
                  <span>— optional; A, B, C, D, or F (defaults to A)</span>
                </li>
              </ul>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">Select CSV file</label>
              <div className="flex flex-wrap items-center gap-3">
                <input
                  ref={csvFileInputRef}
                  type="file"
                  accept=".csv"
                  className="hidden"
                  onChange={(e) => setBulkCsvFile(e.target.files?.[0] ?? null)}
                />
                <button
                  type="button"
                  onClick={() => csvFileInputRef.current?.click()}
                  disabled={bulkUploadLoading}
                  className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl border border-slate-200 bg-white text-gray-700 text-sm font-medium hover:bg-slate-50 focus:outline-none focus:ring-2 focus:ring-purple-500/20 focus:border-purple-500 disabled:opacity-60 cursor-pointer"
                >
                  Choose file
                </button>
                {bulkCsvFile && (
                  <span className="text-sm text-gray-600 truncate max-w-[200px]" title={bulkCsvFile.name}>
                    {bulkCsvFile.name}
                  </span>
                )}
              </div>
            </div>
            {bulkUploadError && (
              <div className="px-4 py-2.5 rounded-xl bg-red-50 text-red-800 border border-red-200 text-sm">
                {bulkUploadError}
              </div>
            )}
            <div className="flex gap-3 pt-2">
              <button
                type="button"
                onClick={() => {
                  if (!bulkUploadLoading) {
                    setShowBulkCsvModal(false);
                    setBulkCsvFile(null);
                    setBulkUploadError(null);
                  }
                }}
                disabled={bulkUploadLoading}
                className="flex-1 px-6 py-3 border-2 border-slate-200 text-gray-700 font-semibold rounded-xl hover:bg-slate-50 transition cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleBulkCsvImportFromModal}
                disabled={!bulkCsvFile || bulkUploadLoading}
                className="flex-1 px-6 py-3 bg-gradient-to-r from-purple-500 to-blue-500 text-white font-semibold rounded-xl hover:from-purple-600 hover:to-blue-600 transition shadow-md disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer"
              >
                {bulkUploadLoading ? (
                  <span className="flex items-center justify-center gap-2">
                    <span className="inline-block h-5 w-5 animate-spin rounded-full border-2 border-white/30 border-t-white" />
                    Importing…
                  </span>
                ) : (
                  'Import'
                )}
              </button>
            </div>
          </div>
        </Modal>
      )}

      {/* Delete Coupon Modal */}
      {deleteCouponModal && (
        <Modal open={true} onClose={() => !couponDeleteLoading && setDeleteCouponModal(null)}>
          <div className="bg-white rounded-3xl shadow-2xl p-8 w-full max-w-md flex flex-col gap-6">
            <div className="flex items-center gap-4">
              <div className="w-12 h-12 rounded-full bg-red-100 flex items-center justify-center">
                <FiTrash2 className="text-red-600 text-2xl" />
              </div>
              <div>
                <h2 className="text-xl font-bold text-gray-900">Delete coupon</h2>
                <p className="text-sm text-gray-500 mt-1">This cannot be undone. Only unused coupons can be deleted.</p>
              </div>
            </div>
            <div className="bg-slate-50 rounded-xl p-4 border border-slate-200">
              <p className="text-sm font-medium text-gray-900">{deleteCouponModal.name}</p>
              <p className="text-sm text-gray-600 mt-0.5 font-mono">{deleteCouponModal.code}</p>
            </div>
            <div className="flex gap-3 pt-2">
              <button
                type="button"
                onClick={() => setDeleteCouponModal(null)}
                disabled={couponDeleteLoading}
                className="flex-1 px-6 py-3 border-2 border-slate-200 text-gray-700 font-semibold rounded-xl hover:bg-slate-50 transition cursor-pointer disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleDeleteCoupon}
                disabled={couponDeleteLoading}
                className="flex-1 px-6 py-3 bg-gradient-to-r from-red-500 to-red-600 text-white font-semibold rounded-xl hover:from-red-600 hover:to-red-700 transition shadow-md disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer"
              >
                {couponDeleteLoading ? (
                  <span className="flex items-center justify-center">
                    <span className="inline-block h-5 w-5 animate-spin rounded-full border-2 border-white/30 border-t-white" />
                  </span>
                ) : (
                  'Delete'
                )}
              </button>
            </div>
          </div>
        </Modal>
      )}

      {/* Logout Confirmation Modal – same as home */}
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
    </ProtectedRoute>
  );
}
