import { useRouter } from "next/navigation";
import { useAuth } from "../../hooks/useAuth";
import { useSubscription } from "../../hooks/useSubscription";
import { ReactNode, useEffect } from "react";

export default function ProtectedRoute({ children }: { children: ReactNode }) {
  const { user, loading: authLoading } = useAuth();
  const { isActive, loading: subscriptionLoading, subscription } = useSubscription();
  const router = useRouter();

  useEffect(() => {
    if (!authLoading && !user) {
      router.replace("/login");
    }
  }, [user, authLoading, router]);

  useEffect(() => {
    console.log('ProtectedRoute check:', {
      authLoading,
      subscriptionLoading,
      user: !!user,
      isActive,
      hasSubscriptionData: !!subscription,
    });
    
    if (!authLoading && !subscriptionLoading && user) {
      // Only redirect if we have actually received subscription data
      // If subscription is null and loading is false, data might still be arriving
      // Wait for actual subscription data before making decision
      if (!isActive && subscription !== null) {
        console.log("Redirecting to packages - isActive:", isActive);
        router.replace("/packages");
      }
    }
  }, [user, authLoading, subscriptionLoading, isActive, subscription, router]);

  if (authLoading || subscriptionLoading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <svg className="animate-spin h-8 w-8 text-blue-500" viewBox="0 0 24 24">
          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none"/>
          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z"/>
        </svg>
      </div>
    );
  }

  if (!user) return null;

  if (!isActive) {
    return null; // Will redirect to packages
  }

  return <>{children}</>;
}
