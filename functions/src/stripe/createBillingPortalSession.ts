import {onCall, HttpsError} from "firebase-functions/v2/https";
import * as logger from "firebase-functions/logger";
import {getFirestore} from "firebase-admin/firestore";
import {defineSecret} from "firebase-functions/params";
import Stripe from "stripe";
import {
  getEnvironment,
  getSecretValue,
  setEnvironmentSecret,
} from "../utils/secrets";

const db = getFirestore();

const environmentSecret = defineSecret("ENVIRONMENT");
const stripeSecretKeyProd = defineSecret("STRIPE_SECRET_KEY");
const stripeSecretKeyTest = defineSecret("TEST_STRIPE_SECRET_KEY");

setEnvironmentSecret(environmentSecret);

interface CreateBillingPortalSessionData {
  returnUrl: string;
}

export const createBillingPortalSession = onCall(
  {
    cors: true,
    secrets: [environmentSecret, stripeSecretKeyProd, stripeSecretKeyTest],
  },
  async (request) => {
    try {
      if (!request.auth?.uid) {
        throw new HttpsError("unauthenticated", "User must be authenticated");
      }

      const userId = request.auth.uid;
      const {returnUrl} = request.data as CreateBillingPortalSessionData;

      if (
        !returnUrl ||
        typeof returnUrl !== "string" ||
        !returnUrl.startsWith("http")
      ) {
        throw new HttpsError(
          "invalid-argument",
          "Valid returnUrl is required (e.g. your app profile page)",
        );
      }

      const env = getEnvironment();
      logger.info("Creating billing portal session", {
        environment: env,
        userId,
      });

      let secretKey: string;
      try {
        secretKey = getSecretValue(stripeSecretKeyProd, stripeSecretKeyTest);
      } catch (error) {
        logger.error("Stripe secret key is not configured", {error, env});
        throw new HttpsError(
          "failed-precondition",
          "Stripe configuration error. Please contact support.",
        );
      }

      if (!secretKey?.trim()) {
        throw new HttpsError(
          "failed-precondition",
          "Stripe configuration error. Please contact support.",
        );
      }

      const subscriptionRef = db.collection("subscriptions").doc(userId);
      const subscriptionDoc = await subscriptionRef.get();
      const stripeCustomerId = subscriptionDoc.data()?.stripeCustomerId;

      if (!stripeCustomerId) {
        logger.warn("No Stripe customer for user", {userId});
        throw new HttpsError(
          "failed-precondition",
          "No subscription found. Subscribe to a plan first.",
        );
      }

      const stripe = new Stripe(secretKey.trim(), {
        apiVersion: "2025-11-17.clover",
      });

      const session = await stripe.billingPortal.sessions.create({
        customer: stripeCustomerId,
        return_url: returnUrl,
      });

      return {url: session.url};
    } catch (err) {
      if (err instanceof HttpsError) throw err;
      logger.error("createBillingPortalSession error", err);
      throw new HttpsError(
        "internal",
        "Failed to open billing portal. Please try again.",
      );
    }
  },
);
