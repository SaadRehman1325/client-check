import { useEffect, useState, useMemo } from 'react';
import { collection, onSnapshot } from 'firebase/firestore';
import { db } from '../firebase';

export interface RecentUser {
  id: string;
  name: string;
  email: string;
  createdAt?: number;
}

export interface UserRow {
  id: string;
  name: string;
  email: string;
  userType: string;
  imageUrl?: string;
  createdAt?: number;
}

export interface RecentCard {
  id: string;
  city: string;
  address: string;
  createdAt?: number;
}

export interface LocationRow {
  id: string;
  city: string;
  zip: string;
  address: string;
  image?: string;
  badge?: { letter: string; color: string };
  tags: string[];
  createdAt?: number;
  createdBy?: string;
}

export interface DashboardStats {
  totalUsers: number;
  adminCount: number;
  totalLocations: number;
  newUsersThisMonth: number;
  newLocationsThisMonth: number;
  users: UserRow[];
  locations: LocationRow[];
  recentActivity: Array<{
    id: string;
    type: 'user' | 'location';
    label: string;
    desc: string;
    time: string;
    amount?: string | null;
  }>;
  loading: boolean;
  error: string | null;
}

function formatActivityDate(seconds: number | undefined): string {
  if (!seconds) return '—';
  const d = new Date(seconds * 1000);
  return d.toLocaleDateString(undefined, {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function startOfThisMonth(): Date {
  const d = new Date();
  d.setDate(1);
  d.setHours(0, 0, 0, 0);
  return d;
}

export function useDashboardStats() {
  const [totalUsers, setTotalUsers] = useState(0);
  const [adminCount, setAdminCount] = useState(0);
  const [newUsersThisMonth, setNewUsersThisMonth] = useState(0);
  const [recentUsers, setRecentUsers] = useState<RecentUser[]>([]);
  const [users, setUsers] = useState<UserRow[]>([]);
  const [totalLocations, setTotalLocations] = useState(0);
  const [newLocationsThisMonth, setNewLocationsThisMonth] = useState(0);
  const [recentCards, setRecentCards] = useState<RecentCard[]>([]);
  const [locations, setLocations] = useState<LocationRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const monthStart = startOfThisMonth();

    const unsubUsers = onSnapshot(
      collection(db, 'users'),
      (snap) => {
        let total = 0;
        let admins = 0;
        let newThisMonth = 0;
        const list: RecentUser[] = [];
        snap.forEach((doc) => {
          total++;
          const d = doc.data();
          if (d.userType === 'admin') admins++;
          const created = d.createdAt?.seconds;
          if (created && created * 1000 >= monthStart.getTime()) newThisMonth++;
          list.push({
            id: doc.id,
            name: d.name || 'Unknown',
            email: d.email || '',
            createdAt: created,
          });
        });
        list.sort((a, b) => (b.createdAt ?? 0) - (a.createdAt ?? 0));
        const allUsers: UserRow[] = snap.docs.map((doc) => {
          const d = doc.data();
          return {
            id: doc.id,
            name: d.name || '—',
            email: d.email || '—',
            userType: d.userType || 'user',
            imageUrl: d.imageUrl,
            createdAt: d.createdAt?.seconds,
          };
        });
        allUsers.sort((a, b) => (b.createdAt ?? 0) - (a.createdAt ?? 0));
        setTotalUsers(total);
        setAdminCount(admins);
        setNewUsersThisMonth(newThisMonth);
        setRecentUsers(list.slice(0, 5));
        setUsers(allUsers);
      },
      (err) => setError(err.message)
    );

    const unsubCards = onSnapshot(
      collection(db, 'cards'),
      (snap) => {
        let total = 0;
        let newThisMonth = 0;
        const list: RecentCard[] = [];
        snap.forEach((doc) => {
          total++;
          const d = doc.data();
          const created = d.createdAt?.seconds;
          if (created && created * 1000 >= monthStart.getTime()) newThisMonth++;
          list.push({
            id: doc.id,
            city: d.city || '',
            address: d.address || '',
            createdAt: created,
          });
        });
        list.sort((a, b) => (b.createdAt ?? 0) - (a.createdAt ?? 0));
        const allLocations: LocationRow[] = snap.docs.map((doc) => {
          const d = doc.data();
          return {
            id: doc.id,
            city: d.city || '—',
            zip: d.zip || '—',
            address: d.address || '—',
            image: d.image,
            badge: d.badge,
            tags: Array.isArray(d.tags) ? d.tags : [],
            createdAt: d.createdAt?.seconds,
            createdBy: d.createdBy,
          };
        });
        allLocations.sort((a, b) => (b.createdAt ?? 0) - (a.createdAt ?? 0));
        setTotalLocations(total);
        setNewLocationsThisMonth(newThisMonth);
        setRecentCards(list.slice(0, 5));
        setLocations(allLocations);
        setLoading(false);
      },
      (err) => {
        setError((e) => e || err.message);
        setLoading(false);
      }
    );

    return () => {
      unsubUsers();
      unsubCards();
    };
  }, []);

  const recentActivity = useMemo(() => {
    const items: Array<{
      id: string;
      type: 'user' | 'location';
      label: string;
      desc: string;
      time: string;
      amount: string | null;
      _ts: number;
    }> = [];
    recentUsers.forEach((u) => {
      items.push({
        id: u.id,
        type: 'user',
        label: 'New user',
        desc: u.name,
        time: formatActivityDate(u.createdAt),
        amount: null,
        _ts: u.createdAt ?? 0,
      });
    });
    recentCards.forEach((c) => {
      items.push({
        id: c.id,
        type: 'location',
        label: 'Location added',
        desc: c.city || c.address || 'New location',
        time: formatActivityDate(c.createdAt),
        amount: null,
        _ts: c.createdAt ?? 0,
      });
    });
    items.sort((a, b) => b._ts - a._ts);
    return items.slice(0, 8).map(({ _ts, ...rest }) => rest);
  }, [recentUsers, recentCards]);

  return {
    totalUsers,
    adminCount,
    totalLocations,
    newUsersThisMonth,
    newLocationsThisMonth,
    users,
    locations,
    recentActivity,
    loading,
    error,
  };
}
