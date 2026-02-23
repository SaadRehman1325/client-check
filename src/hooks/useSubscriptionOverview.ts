import { useEffect, useState, useMemo } from 'react';
import { collection, onSnapshot } from 'firebase/firestore';
import { db } from '../firebase';

export interface SubscriptionInfo {
  status: string;
  planType: string;
  currentPeriodEnd: { seconds: number; nanoseconds: number } | null;
}

export interface UserWithSubscription {
  id: string;
  name: string;
  email: string;
  userType: string;
  imageUrl?: string;
  subscription: SubscriptionInfo | null;
}

export interface SubscriptionStatusCounts {
  active: number;
  trialing: number;
  canceled: number;
  past_due: number;
  noSubscription: number;
}

export interface SubscriptionOverviewResult {
  users: UserWithSubscription[];
  /** Non-admin users only; use for subscription section (admins are free, out of subscription logic). */
  subscriptionUsers: UserWithSubscription[];
  activeCount: number;
  statusCounts: SubscriptionStatusCounts;
  loading: boolean;
  error: string | null;
}

function normalizeTimestamp(
  ts: { seconds?: number; _seconds?: number; nanoseconds?: number; toMillis?: () => number } | null | undefined
): { seconds: number; nanoseconds: number } | null {
  if (!ts) return null;
  if (typeof (ts as { seconds?: number }).seconds === 'number') {
    const t = ts as { seconds: number; nanoseconds?: number };
    return { seconds: t.seconds, nanoseconds: t.nanoseconds ?? 0 };
  }
  if (typeof (ts as { _seconds?: number })._seconds === 'number') {
    const t = ts as { _seconds: number; _nanoseconds?: number };
    return { seconds: t._seconds, nanoseconds: t._nanoseconds ?? 0 };
  }
  if (typeof (ts as { toMillis?: () => number }).toMillis === 'function') {
    const ms = (ts as { toMillis: () => number }).toMillis();
    return { seconds: Math.floor(ms / 1000), nanoseconds: 0 };
  }
  return null;
}

/**
 * Fetches all users and their subscription details directly from Firestore.
 * Only runs when the current user is an admin (userType === 'admin').
 *
 * Firestore rules must allow admins to read the subscriptions collection, e.g.:
 * match /subscriptions/{userId} {
 *   allow read: if request.auth != null && (
 *     request.auth.uid == userId ||
 *     get(/databases/$(database)/documents/users/$(request.auth.uid)).data.userType == 'admin'
 *   );
 * }
 */
export function useSubscriptionOverview(
  isAdmin: boolean
): SubscriptionOverviewResult {
  const [usersList, setUsersList] = useState<Omit<UserWithSubscription, 'subscription'>[]>([]);
  const [subscriptionsMap, setSubscriptionsMap] = useState<
    Map<string, SubscriptionInfo>
  >(new Map());
  const [usersLoading, setUsersLoading] = useState(true);
  const [subsLoading, setSubsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!isAdmin) {
      setUsersList([]);
      setSubscriptionsMap(new Map());
      setUsersLoading(false);
      setSubsLoading(false);
      setError(null);
      return;
    }

    setUsersLoading(true);
    setSubsLoading(true);
    setError(null);

    const unsubUsers = onSnapshot(
      collection(db, 'users'),
      (usersSnap) => {
        const list = usersSnap.docs.map((doc) => {
          const d = doc.data();
          return {
            id: doc.id,
            name: d.name ?? '—',
            email: d.email ?? '—',
            userType: d.userType ?? 'user',
            imageUrl: d.imageUrl ?? undefined,
          };
        });
        setUsersList(list);
        setUsersLoading(false);
      },
      (err) => {
        setError(err.message ?? 'Failed to load users');
        setUsersLoading(false);
      }
    );

    const unsubSubscriptions = onSnapshot(
      collection(db, 'subscriptions'),
      (subsSnap) => {
        const map = new Map<string, SubscriptionInfo>();
        subsSnap.docs.forEach((doc) => {
          const data = doc.data();
          map.set(doc.id, {
            status: data.status ?? '',
            planType: data.planType ?? '',
            currentPeriodEnd: normalizeTimestamp(data.currentPeriodEnd),
          });
        });
        setSubscriptionsMap(map);
        setSubsLoading(false);
      },
      (err) => {
        setError((e) => e || (err.message ?? 'Failed to load subscriptions'));
        setSubsLoading(false);
      }
    );

    return () => {
      unsubUsers();
      unsubSubscriptions();
    };
  }, [isAdmin]);

  const users = useMemo(() => {
    return usersList
      .map((u) => ({
        ...u,
        subscription: subscriptionsMap.get(u.id) ?? null,
      }))
      .sort((a, b) => (a.name || '').localeCompare(b.name || ''));
  }, [usersList, subscriptionsMap]);

  /** Non-admin users only. Admins are outside subscription logic and free to use the system. */
  const subscriptionUsers = useMemo(
    () => users.filter((u) => u.userType !== 'admin'),
    [users]
  );

  const activeCount = useMemo(
    () =>
      subscriptionUsers.filter(
        (u) =>
          u.subscription &&
          (u.subscription.status === 'active' || u.subscription.status === 'trialing')
      ).length,
    [subscriptionUsers]
  );

  const statusCounts = useMemo<SubscriptionStatusCounts>(() => {
    let active = 0;
    let trialing = 0;
    let canceled = 0;
    let past_due = 0;
    let noSubscription = 0;
    subscriptionUsers.forEach((u) => {
      if (!u.subscription) {
        noSubscription++;
        return;
      }
      switch (u.subscription.status) {
        case 'active':
          active++;
          break;
        case 'trialing':
          trialing++;
          break;
        case 'canceled':
          canceled++;
          break;
        case 'past_due':
          past_due++;
          break;
        default:
          noSubscription++;
      }
    });
    return { active, trialing, canceled, past_due, noSubscription };
  }, [subscriptionUsers]);

  return {
    users,
    subscriptionUsers,
    activeCount,
    statusCounts,
    loading: usersLoading || subsLoading,
    error,
  };
}
