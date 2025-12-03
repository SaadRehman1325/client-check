import { useEffect, useState } from "react";
import { doc, onSnapshot } from "firebase/firestore";
import { db } from "../firebase";
import { useAuth } from "./useAuth";

export interface Subscription {
  userId: string;
  stripeCustomerId: string;
  stripeSubscriptionId: string;
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
  console.log('useSubscription raw data:', subscription);
  
  const isActive = subscription?.status === "active" || subscription?.status === "trialing";
  const isExpired = subscription?.currentPeriodEnd 
    ? new Date(subscription.currentPeriodEnd.seconds * 1000) < new Date()
    : false; // Changed from true to false - if no expiration date, consider it not expired

  const finalIsActive = isActive && !isExpired;

  console.log('useSubscription computed:', {
    status: subscription?.status,
    isActive,
    isExpired,
    currentPeriodEnd: subscription?.currentPeriodEnd,
    finalIsActive,
    loading
  });

  return {
    subscription,
    loading,
    isActive: finalIsActive,
    isExpired,
  };
}

