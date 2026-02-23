import { useEffect, useState } from "react";
import { doc, getDoc } from "firebase/firestore";
import { db } from "../firebase";
import { User } from "firebase/auth";

export interface UserData {
  name: string;
  email: string;
  userId: string;
  userType: string;
  imageUrl?: string;
  createdAt?: any;
  updatedAt?: any;
}

const USER_DATA_STORAGE_KEY = "user_data";

/**
 * Hook to fetch and manage user data from Firestore
 * Stores data in localStorage for persistence
 */
export function useUserData(user: User | null) {
  const [userData, setUserData] = useState<UserData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Load user data from localStorage or Firestore
  useEffect(() => {
    if (!user) {
      // Clear user data if no user is logged in
      setUserData(null);
      localStorage.removeItem(USER_DATA_STORAGE_KEY);
      setLoading(false);
      return;
    }

    const fetchUserData = async () => {
      setLoading(true);
      setError(null);

      try {
        // First, try to load from localStorage
        const cachedData = localStorage.getItem(USER_DATA_STORAGE_KEY);
        if (cachedData) {
          try {
            const parsed = JSON.parse(cachedData);
            // Verify the cached data belongs to the current user
            if (parsed.userId === user.uid) {
              setUserData(parsed);
              setLoading(false);
              // Still fetch from Firestore in background to ensure data is up-to-date
            }
          } catch (e) {
            // Invalid cache, continue to fetch from Firestore
            console.warn("Failed to parse cached user data", e);
          }
        }

        // Fetch from Firestore
        const userRef = doc(db, "users", user.uid);
        const userSnap = await getDoc(userRef);

        if (userSnap.exists()) {
          const data = userSnap.data() as UserData;
          // Store in localStorage
          localStorage.setItem(USER_DATA_STORAGE_KEY, JSON.stringify(data));
          setUserData(data);
        } else {
          // User document doesn't exist in Firestore
          // Clear localStorage
          localStorage.removeItem(USER_DATA_STORAGE_KEY);
          setUserData(null);
          setError("User data not found");
        }
      } catch (err: any) {
        console.error("Error fetching user data:", err);
        setError(err.message || "Failed to fetch user data");
        // If we have cached data, use it as fallback
        const cachedData = localStorage.getItem(USER_DATA_STORAGE_KEY);
        if (cachedData) {
          try {
            const parsed = JSON.parse(cachedData);
            if (parsed.userId === user.uid) {
              setUserData(parsed);
            }
          } catch (e) {
            // Ignore parse errors
          }
        }
      } finally {
        setLoading(false);
      }
    };

    fetchUserData();
  }, [user]);

  // Keep localStorage in sync when userData is updated (e.g. from profile edit)
  useEffect(() => {
    if (user?.uid && userData) {
      localStorage.setItem(
        USER_DATA_STORAGE_KEY,
        JSON.stringify({ ...userData, userId: user.uid })
      );
    }
  }, [user?.uid, userData]);

  return { userData, loading, error, setUserData };
}

/**
 * Utility function to clear user data from localStorage
 */
export function clearUserData() {
  localStorage.removeItem(USER_DATA_STORAGE_KEY);
}

