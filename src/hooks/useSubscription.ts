import { useEffect, useState } from "react";
import { doc, onSnapshot } from "firebase/firestore";
import { db } from "../firebase";
import { useAuth } from "./useAuth";

export interface Subscription {
  userId: string;
  stripeCustomerId?: string;   // absent for no-card trial
  stripeSubscriptionId?: string;
  status: "active" | "canceled" | "past_due" | "trialing";
  planType: "monthly" | "yearly";
  currentPeriodEnd: {
    seconds: number;
    nanoseconds: number;
  };
  createdAt: {
    seconds: number;
    nanoseconds: number;
  };
}

export function useSubscription() {
  const { user } = useAuth();
  const [subscription, setSubscription] = useState<Subscription | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!user) {
      setSubscription(null);
      setLoading(false);
      return;
    }

    const subscriptionRef = doc(db, "subscriptions", user.uid);
    const unsubscribe = onSnapshot(
      subscriptionRef,
      (docSnapshot) => {
        if (docSnapshot.exists()) {
          setSubscription(docSnapshot.data() as Subscription);
        } else {
          setSubscription(null);
        }
        // Always mark loaded once we have any snapshot (cache or server) so we don't block navigation
        setLoading(false);
      },
      (error) => {
        console.error("Error fetching subscription:", error);
        setSubscription(null);
        setLoading(false);
      }
    );

    return () => unsubscribe();
  }, [user]);

  const isActive = subscription?.status === "active" || subscription?.status === "trialing";
  const isExpired = subscription?.currentPeriodEnd 
    ? new Date(subscription.currentPeriodEnd.seconds * 1000) < new Date()
    : false; // Changed from true to false - if no expiration date, consider it not expired

  const finalIsActive = isActive && !isExpired;

  return {
    subscription,
    loading,
    isActive: finalIsActive,
    isExpired,
  };
}

