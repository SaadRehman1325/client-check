import { useRouter } from "next/navigation";
import { useAuth } from "../../hooks/useAuth";
import { useSubscription } from "../../hooks/useSubscription";
import { useUserData } from "../../hooks/useUserData";
import { ReactNode, useEffect } from "react";

export default function ProtectedRoute({ children }: { children: ReactNode }) {
  const { user, loading: authLoading } = useAuth();
  const { userData, loading: userDataLoading } = useUserData(user);
  const { isActive, loading: subscriptionLoading } = useSubscription();
  const router = useRouter();

  // Schema: userType "user" | "admin" (see FIRESTORE_SCHEMA.md). Admin can use the system regardless of subscription.
  const isAdmin = userData?.userType === "admin";
  const isUserRole = userData?.userType === "user";
  // Only enforce subscription when userType is "user"; admins bypass.
  const needsSubscription = !!user && isUserRole;
  const waitingForRole = !!user && userDataLoading;

  useEffect(() => {
    if (!authLoading && !user) {
      router.replace("/");
    }
  }, [user, authLoading, router]);

  useEffect(() => {
    if (authLoading || subscriptionLoading || waitingForRole || !user) return;
    if (needsSubscription && !isActive) {
      router.replace("/packages");
    }
  }, [user, authLoading, subscriptionLoading, waitingForRole, needsSubscription, isActive, router]);

  // For admins we don't need subscription loaded to render; for "user" we do (handled above via needsSubscription).
  const waitingForAccess = waitingForRole || (needsSubscription && subscriptionLoading);
  if (authLoading || waitingForAccess) {
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

  if (needsSubscription && !isActive) {
    return null; // Will redirect to packages
  }

  return <>{children}</>;
}
