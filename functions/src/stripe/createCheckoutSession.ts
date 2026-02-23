import {onCall, HttpsError} from "firebase-functions/v2/https";
import * as logger from "firebase-functions/logger";
import {initializeApp, getApps} from "firebase-admin/app";
import {getAuth} from "firebase-admin/auth";
import {getFirestore} from "firebase-admin/firestore";
import {defineSecret} from "firebase-functions/params";
import Stripe from "stripe";
import {
  getEnvironment,
  getSecretValue,
  setEnvironmentSecret,
} from "../utils/secrets";

// Initialize Firebase Admin (only if not already initialized)
if (getApps().length === 0) {
  initializeApp();
}
const db = getFirestore();

// Define environment secret
const environmentSecret = defineSecret("ENVIRONMENT");

// Define configuration parameters - both prod and test secrets
const stripeSecretKeyProd = defineSecret("STRIPE_SECRET_KEY");
const stripeSecretKeyTest = defineSecret("TEST_STRIPE_SECRET_KEY");
const stripePriceIdMonthlyProd = defineSecret("STRIPE_PRICE_ID_MONTHLY");
const stripePriceIdMonthlyTest = defineSecret("TEST_STRIPE_PRICE_ID_MONTHLY");
const stripePriceIdYearlyProd = defineSecret("STRIPE_PRICE_ID_YEARLY");
const stripePriceIdYearlyTest = defineSecret("TEST_STRIPE_PRICE_ID_YEARLY");
const successUrlProd = defineSecret("SUCCESS_URL");
const successUrlTest = defineSecret("TEST_SUCCESS_URL");
const cancelUrlProd = defineSecret("CANCEL_URL");
const cancelUrlTest = defineSecret("TEST_CANCEL_URL");

// Initialize environment secret in utils
setEnvironmentSecret(environmentSecret);

interface CreateCheckoutSessionData {
  planType: "monthly" | "yearly";
}

export const createCheckoutSession = onCall(
  {
    cors: true,
    secrets: [
      environmentSecret,
      stripeSecretKeyProd,
      stripeSecretKeyTest,
      stripePriceIdMonthlyProd,
      stripePriceIdMonthlyTest,
      stripePriceIdYearlyProd,
      stripePriceIdYearlyTest,
      successUrlProd,
      successUrlTest,
      cancelUrlProd,
      cancelUrlTest,
    ],
  },
  async (request) => {
    try {
      // Verify authentication
      const authToken = request.auth?.token;
      if (!authToken) {
        throw new HttpsError("unauthenticated", "User must be authenticated");
      }

      const userId = request.auth?.uid;
      if (!userId) {
        throw new HttpsError("internal", "User ID not found");
      }

      const {planType} = request.data as CreateCheckoutSessionData;
      if (!planType || (planType !== "monthly" && planType !== "yearly")) {
        throw new HttpsError("invalid-argument", "Invalid plan type");
      }

      // Get environment and log it
      const env = getEnvironment();
      logger.info("Creating checkout session", {environment: env, userId});

      // Validate secrets are configured - use environment-aware helper
      let secretKey: string;
      try {
        secretKey = getSecretValue(stripeSecretKeyProd, stripeSecretKeyTest);
      } catch (error) {
        logger.error("Stripe secret key is not configured", {error, env});
        throw new HttpsError(
          "failed-precondition",
          "Stripe configuration error. Please contact support."
        );
      }

      if (!secretKey || !secretKey.trim()) {
        logger.error("Stripe secret key is empty", {env});
        throw new HttpsError(
          "failed-precondition",
          "Stripe configuration error. Please contact support."
        );
      }

      // Initialize Stripe at runtime
      const stripe = new Stripe(secretKey, {
        apiVersion: "2025-11-17.clover",
      });

      // Get user data
      const auth = getAuth();
      const user = await auth.getUser(userId);
      const userEmail = user.email || "";

      // Check if customer already exists in Firestore
      const subscriptionRef = db.collection("subscriptions").doc(userId);
      const subscriptionDoc = await subscriptionRef.get();
      let customerId = subscriptionDoc.data()?.stripeCustomerId;

      // Create Stripe customer if doesn't exist
      if (!customerId) {
        const customer = await stripe.customers.create({
          email: userEmail,
          metadata: {
            firebaseUID: userId,
          },
        });
        customerId = customer.id;

        // Store customer ID in Firestore
        await subscriptionRef.set(
          {
            userId,
            stripeCustomerId: customerId,
          },
          {merge: true}
        );
      }
      // Get price ID based on plan type - use environment-aware helper
      let priceId: string;
      try {
        priceId = planType === "monthly" ?
          getSecretValue(stripePriceIdMonthlyProd, stripePriceIdMonthlyTest) :
          getSecretValue(stripePriceIdYearlyProd, stripePriceIdYearlyTest);
      } catch (error) {
        logger.error(`Price ID secret not configured for ${planType} plan`, {
          error,
          env,
        });
        throw new HttpsError(
          "failed-precondition",
          "Subscription plan not configured. Please contact support"
        );
      }

      if (!priceId || priceId.trim() === "") {
        logger.error(`Price ID is empty for ${planType} plan`, {env});
        throw new HttpsError(
          "failed-precondition",
          "Subscription plan not configured. Please contact support"
        );
      }

      const trimmedPriceId = priceId.trim();

      // Get URLs - use environment-aware helper
      const successUrlValue = getSecretValue(successUrlProd, successUrlTest);
      const cancelUrlValue = getSecretValue(cancelUrlProd, cancelUrlTest);

      logger.info("Checkout session details", {
        userId,
        planType,
        env,
        priceIdPrefix: trimmedPriceId.substring(0, 15) + "...",
        priceIdLength: trimmedPriceId.length,
      });

      // Create checkout session (trial is handled separately as no-card plan)
      const session = await stripe.checkout.sessions.create({
        customer: customerId,
        mode: "subscription",
        payment_method_types: ["card"],
        line_items: [
          {
            price: trimmedPriceId,
            quantity: 1,
          },
        ],
        success_url:
          `${successUrlValue}/home?session_id={CHECKOUT_SESSION_ID}`,
        cancel_url: `${cancelUrlValue}/packages?canceled=true`,
        metadata: {
          firebaseUID: userId,
          planType,
        },
      });

      logger.info("Checkout session created", {
        sessionId: session.id,
        userId,
        planType,
      });

      return {
        sessionId: session.id,
        url: session.url,
      };
    } catch (error: unknown) {
      const errorMessage =
        error instanceof Error ? error.message : "Unknown error";
      const errorStack = error instanceof Error ? error.stack : undefined;
      logger.error("Error creating checkout session", {
        error: errorMessage,
        stack: errorStack,
        userId: request.auth?.uid,
      });

      // If it's already an HttpsError, re-throw it
      if (error instanceof HttpsError) {
        throw error;
      }

      // Return user-friendly error messages
      if (errorMessage.includes("configuration") ||
        errorMessage.includes("not configured")) {
        throw new HttpsError(
          "failed-precondition",
          "Service configuration error. Please contact support."
        );
      }

      // Log the full error for debugging
      logger.error("Unexpected error in createCheckoutSession", {
        error: errorMessage,
        stack: errorStack,
      });

      throw new HttpsError(
        "internal",
        errorMessage || "Failed to create checkout session"
      );
    }
  }
);

