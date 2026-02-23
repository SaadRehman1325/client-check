import {onCall, HttpsError} from "firebase-functions/v2/https";
import * as logger from "firebase-functions/logger";
import {initializeApp, getApps} from "firebase-admin/app";
import {getFirestore, Timestamp} from "firebase-admin/firestore";

if (getApps().length === 0) {
  initializeApp();
}
const db = getFirestore();

const TRIAL_DAYS = 7;

/**
 * Starts a 7-day free trial without requiring a card.
 * Writes a subscription doc with status "trialing" and currentPeriodEnd in 7d.
 * Only the backend can write to subscriptions. User can only start a trial
 * if they don't already have an active or valid trialing subscription.
 */
export const startFreeTrial = onCall(async (request) => {
  try {
    const authToken = request.auth?.token;
    if (!authToken) {
      throw new HttpsError("unauthenticated", "User must be authenticated");
    }

    const userId = request.auth?.uid;
    if (!userId) {
      throw new HttpsError("internal", "User ID not found");
    }

    const subscriptionRef = db.collection("subscriptions").doc(userId);
    const subscriptionDoc = await subscriptionRef.get();
    const data = subscriptionDoc.data();

    if (subscriptionDoc.exists && data) {
      const status = data.status as string;
      const currentPeriodEnd = data.currentPeriodEnd as
        | { seconds: number; nanoseconds: number }
        | undefined;
      if (
        (status === "active" || status === "trialing") &&
        currentPeriodEnd?.seconds
      ) {
        const endDate = new Date(currentPeriodEnd.seconds * 1000);
        if (endDate > new Date()) {
          throw new HttpsError(
            "failed-precondition",
            "You already have an active subscription or trial.",
          );
        }
      }
    }

    const now = new Date();
    const trialEndsAt = new Date(now);
    trialEndsAt.setDate(trialEndsAt.getDate() + TRIAL_DAYS);

    await subscriptionRef.set(
      {
        userId,
        status: "trialing",
        planType: "monthly",
        currentPeriodEnd: Timestamp.fromDate(trialEndsAt),
        createdAt: Timestamp.fromDate(now),
      },
      {merge: true},
    );

    logger.info("Free trial started (no card)", {
      userId,
      trialEndsAt: trialEndsAt.toISOString(),
    });

    return {
      success: true,
      trialEndsAt: trialEndsAt.toISOString(),
      message: "Your 7-day free trial has started.",
    };
  } catch (error: unknown) {
    if (error instanceof HttpsError) {
      throw error;
    }
    const errorMessage =
      error instanceof Error ? error.message : "Unknown error";
    logger.error("Error starting free trial", {
      error: errorMessage,
      userId: request.auth?.uid,
    });
    throw new HttpsError(
      "internal",
      errorMessage || "Failed to start free trial",
    );
  }
});
