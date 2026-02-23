import { useState, useCallback } from 'react';
import {
  collection,
  doc,
  onSnapshot,
  addDoc,
  deleteDoc,
  serverTimestamp,
  query,
  orderBy,
  Timestamp,
} from 'firebase/firestore';
import { db } from '../firebase';
import { useEffect } from 'react';

export interface CouponRow {
  id: string;
  name: string;
  createdAt: number | undefined;
  code: string;
  createdBy: string;
  usedBy: string | null;
  status: 'new' | 'used';
}

export function useCoupons() {
  const [coupons, setCoupons] = useState<CouponRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);

  useEffect(() => {
    const q = query(
      collection(db, 'coupons'),
      orderBy('createdAt', 'desc')
    );
    const unsub = onSnapshot(
      q,
      (snap) => {
        const list: CouponRow[] = snap.docs.map((doc) => {
          const d = doc.data();
          const usedBy = d.usedBy ?? null;
          return {
            id: doc.id,
            name: d.name ?? '—',
            createdAt: (d.createdAt as Timestamp)?.seconds,
            code: d.code ?? '—',
            createdBy: d.createdBy ?? '',
            usedBy: typeof usedBy === 'string' ? usedBy : null,
            status: usedBy ? 'used' : 'new',
          };
        });
        setCoupons(list);
        setLoading(false);
      },
      (err) => {
        setError(err.message);
        setLoading(false);
      }
    );
    return () => unsub();
  }, []);

  const createCoupon = useCallback(
    async (params: { name: string; code: string; createdBy: string }) => {
      setCreateError(null);
      setCreating(true);
      try {
        const normalizedCode = params.code.trim().toUpperCase();
        if (!normalizedCode) {
          const msg = 'Coupon code is required.';
          setCreateError(msg);
          setCreating(false);
          throw new Error(msg);
        }
        const alreadyExists = coupons.some(
          (c) => c.code.toUpperCase() === normalizedCode
        );
        if (alreadyExists) {
          const msg = 'This coupon code already exists. Please choose another.';
          setCreateError(msg);
          setCreating(false);
          throw new Error(msg);
        }
        await addDoc(collection(db, 'coupons'), {
          name: params.name.trim(),
          code: normalizedCode,
          createdBy: params.createdBy,
          usedBy: null,
          createdAt: serverTimestamp(),
        });
      } catch (err: unknown) {
        const msg =
          err && typeof err === 'object' && 'message' in err
            ? String((err as { message?: string }).message)
            : 'Failed to create coupon.';
        setCreateError(msg);
        throw err;
      } finally {
        setCreating(false);
      }
    },
    [coupons]
  );

  const deleteCoupon = useCallback(async (id: string) => {
    await deleteDoc(doc(db, 'coupons', id));
  }, []);

  return {
    coupons,
    loading,
    error,
    creating,
    createError,
    createCoupon,
    deleteCoupon,
  };
}
