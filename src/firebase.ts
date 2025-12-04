// Import the functions you need from the SDKs you need
import { initializeApp, getApps, getApp } from "firebase/app";
import { getAnalytics, isSupported } from "firebase/analytics";
import { getFirestore } from "firebase/firestore";
import { getStorage } from "firebase/storage";
import { getAuth, setPersistence, browserLocalPersistence } from "firebase/auth";
// TODO: Add SDKs for Firebase products that you want to use
// https://firebase.google.com/docs/web/setup#available-libraries

// Your web app's Firebase configuration
// For Firebase JS SDK v7.20.0 and later, measurementId is optional
const firebaseConfig = {
  apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY,
  authDomain: "clientcheck-e4df8.firebaseapp.com",
  projectId: "clientcheck-e4df8",
  storageBucket: "clientcheck-e4df8.firebasestorage.app",
  messagingSenderId: "671547366490",
  appId: "1:671547366490:web:6ccd6aa5220d04f4378c63",
  measurementId: "G-78TJ3R936N"
};

// Prevent re-initialization
const app = !getApps().length ? initializeApp(firebaseConfig) : getApp();

// Analytics (only in browser and if supported)
let analytics: ReturnType<typeof getAnalytics> | undefined = undefined;
if (typeof window !== "undefined") {
  isSupported().then((supported) => {
    if (supported) {
      analytics = getAnalytics(app);
    }
  });
}

const db = getFirestore(app);
const storage = getStorage(app);

// Configure auth persistence - users stay logged in across browser sessions
const auth = getAuth(app);
// Set persistence to LOCAL (default, but explicit is better)
// This persists auth state in localStorage
if (typeof window !== "undefined") {
  setPersistence(auth, browserLocalPersistence).catch((error) => {
    console.error("Error setting auth persistence:", error);
  });
}

export { app, analytics, db, storage, auth };