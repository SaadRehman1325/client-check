import {onRequest} from "firebase-functions/v2/https";
import * as logger from "firebase-functions/logger";
import {initializeApp, getApps} from "firebase-admin/app";
import {getFirestore, Timestamp} from "firebase-admin/firestore";
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
const webhookSecretProd = defineSecret("STRIPE_WEBHOOK_SECRET");
const webhookSecretTest = defineSecret("TEST_STRIPE_WEBHOOK_SECRET");

// Initialize environment secret in utils
setEnvironmentSecret(environmentSecret);

export const webhook = onRequest(
  {
    cors: false,
    secrets: [
      environmentSecret,
      stripeSecretKeyProd,
      stripeSecretKeyTest,
      webhookSecretProd,
      webhookSecretTest,
    ],
  },
  async (request, response) => {
    // Get environment and log it
    const env = getEnvironment();
    logger.info("Webhook received", {environment: env});

    // Get secrets - use environment-aware helper
    const secretKey = getSecretValue(stripeSecretKeyProd, stripeSecretKeyTest);
    const webhookSecretValue = getSecretValue(
      webhookSecretProd,
      webhookSecretTest
    );

    // Initialize Stripe at runtime
    const stripe = new Stripe(secretKey, {
      apiVersion: "2025-11-17.clover",
    });

    const sig = request.headers["stripe-signature"] as string;

    if (!sig) {
      logger.error("Missing stripe-signature header");
      response.status(400).send("Missing stripe-signature header");
      return;
    }

    let event: Stripe.Event;

    try {
      // Convert rawBody Buffer to string for Stripe signature verification
      const rawBodyString = request.rawBody?.toString() || "";
      event = stripe.webhooks.constructEvent(
        rawBodyString,
        sig,
        webhookSecretValue
      );
    } catch (err: unknown) {
      const errorMessage =
        err instanceof Error ? err.message : "Unknown error";
      logger.error("Webhook signature verification failed", {
        error: errorMessage,
      });
      response.status(400).send(`Webhook Error: ${errorMessage}`);
      return;
    }

    logger.info("Webhook event received", {
      type: event.type,
      id: event.id,
    });

    try {
      switch (event.type) {
      case "checkout.session.completed": {
        const session = event.data.object as Stripe.Checkout.Session;
        await handleCheckoutSessionCompleted(stripe, session);
        break;
      }

      case "customer.subscription.updated": {
        const subscription = event.data.object as Stripe.Subscription;
        await handleSubscriptionUpdated(stripe, subscription);
        break;
      }

      case "customer.subscription.deleted": {
        const subscription = event.data.object as Stripe.Subscription;
        await handleSubscriptionDeleted(subscription);
        break;
      }

      case "invoice.payment_succeeded": {
        const invoice = event.data.object as Stripe.Invoice;
        await handleInvoicePaymentSucceeded(stripe, invoice);
        break;
      }

      default:
        logger.info(`Unhandled event type: ${event.type}`);
      }

      response.json({received: true});
    } catch (error: unknown) {
      const errorMessage =
        error instanceof Error ? error.message : "Unknown error";
      const errorStack = error instanceof Error ? error.stack : undefined;
      logger.error("Error processing webhook", {
        error: errorMessage,
        stack: errorStack,
        eventType: event.type,
      });
      response.status(500).send(`Webhook processing error: ${errorMessage}`);
    }
  }
);

/**
 * Handles checkout session completion event from Stripe.
 * @param {Stripe} stripe - The Stripe instance.
 * @param {Stripe.Checkout.Session} session - The completed checkout session.
 */
async function handleCheckoutSessionCompleted(
  stripe: Stripe,
  session: Stripe.Checkout.Session
) {
  const userId = session.metadata?.firebaseUID;
  if (!userId) {
    logger.error("No firebaseUID in checkout session metadata");
    return;
  }

  const subscriptionId = session.subscription as string;
  if (!subscriptionId) {
    logger.error("No subscription ID in checkout session");
    return;
  }

  // Retrieve subscription details from Stripe
  const subscription = await stripe.subscriptions.retrieve(subscriptionId);
  const customerId = typeof subscription.customer === "string" ?
    subscription.customer :
    subscription.customer.id;
  const planType = session.metadata?.planType || "monthly";

  // Determine status
  let status: "active" | "canceled" | "past_due" | "trialing" = "active";
  if (subscription.status === "trialing") {
    status = "trialing";
  } else if (subscription.status === "past_due") {
    status = "past_due";
  } else if (
    subscription.status === "canceled" ||
    subscription.status === "unpaid"
  ) {
    status = "canceled";
  }

  // Update Firestore
  const subscriptionRef = db.collection("subscriptions").doc(userId);
  // Get current period end - try top level, then fallback to items
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let currentPeriodEnd = (subscription as any).current_period_end;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  if (!currentPeriodEnd &&
    (subscription as any).items?.data?.[0]?.current_period_end) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    currentPeriodEnd = (subscription as any).items.data[0].current_period_end;
  }

  // Get created timestamp
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const createdTimestamp = (subscription as any).created ||
    Math.floor(Date.now() / 1000);

  // Validate timestamps are numbers
  if (!currentPeriodEnd || typeof currentPeriodEnd !== "number") {
    logger.error("Invalid current_period_end",
      {currentPeriodEnd, subscription});
    throw new Error("Invalid subscription period end date");
  }

  await subscriptionRef.set(
    {
      userId,
      stripeCustomerId: customerId,
      stripeSubscriptionId: subscriptionId,
      status,
      planType,
      currentPeriodEnd: Timestamp.fromMillis(currentPeriodEnd * 1000),
      createdAt: Timestamp.fromMillis(createdTimestamp * 1000),
    },
    {merge: true}
  );

  logger.info("Checkout session completed", {
    userId,
    subscriptionId,
    planType,
  });
}

/**
 * Handles subscription update event from Stripe.
 * @param {Stripe} stripe - The Stripe instance.
 * @param {Stripe.Subscription} subscription - The updated subscription.
 */
async function handleSubscriptionUpdated(
  stripe: Stripe,
  subscription: Stripe.Subscription
) {
  const customerId = subscription.customer as string;

  // Find user by customer ID
  const subscriptionsSnapshot = await db
    .collection("subscriptions")
    .where("stripeCustomerId", "==", customerId)
    .limit(1)
    .get();

  if (subscriptionsSnapshot.empty) {
    logger.error("Subscription not found in Firestore", {customerId});
    return;
  }

  const subscriptionDoc = subscriptionsSnapshot.docs[0];
  const userId = subscriptionDoc.id;

  // Determine status
  let status: "active" | "canceled" | "past_due" | "trialing" = "active";
  if (subscription.status === "trialing") {
    status = "trialing";
  } else if (subscription.status === "past_due") {
    status = "past_due";
  } else if (
    subscription.status === "canceled" ||
    subscription.status === "unpaid"
  ) {
    status = "canceled";
  }

  // Determine plan type from subscription metadata
  const planType = subscription.metadata?.planType || "monthly";

  // Get current period end safely
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let currentPeriodEnd = (subscription as any).current_period_end;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  if (!currentPeriodEnd &&
    (subscription as any).items?.data?.[0]?.current_period_end) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    currentPeriodEnd = (subscription as any).items.data[0].current_period_end;
  }

  if (!currentPeriodEnd || typeof currentPeriodEnd !== "number") {
    logger.error(
      "Invalid current_period_end in subscription update",
      {currentPeriodEnd}
    );
    return;
  }

  await subscriptionDoc.ref.update({
    status,
    planType,
    currentPeriodEnd: Timestamp.fromMillis(currentPeriodEnd * 1000),
    stripeSubscriptionId: subscription.id,
  });

  logger.info("Subscription updated", {
    userId,
    subscriptionId: subscription.id,
    status,
  });
}

/**
 * Handles subscription deletion event from Stripe.
 * @param {Stripe.Subscription} subscription - The deleted subscription.
 */
async function handleSubscriptionDeleted(subscription: Stripe.Subscription) {
  const customerId = subscription.customer as string;

  // Find user by customer ID
  const subscriptionsSnapshot = await db
    .collection("subscriptions")
    .where("stripeCustomerId", "==", customerId)
    .limit(1)
    .get();

  if (subscriptionsSnapshot.empty) {
    logger.error("Subscription not found in Firestore", {customerId});
    return;
  }

  const subscriptionDoc = subscriptionsSnapshot.docs[0];

  await subscriptionDoc.ref.update({
    status: "canceled",
  });

  logger.info("Subscription deleted", {
    userId: subscriptionDoc.id,
    subscriptionId: subscription.id,
  });
}

/**
 * Handles successful invoice payment event from Stripe.
 * @param {Stripe} stripe - The Stripe instance.
 * @param {Stripe.Invoice} invoice - The paid invoice.
 */
async function handleInvoicePaymentSucceeded(
  stripe: Stripe,
  invoice: Stripe.Invoice
) {
  const subscriptionId =
    typeof (invoice as {subscription?: string | {id?: string}}).subscription ===
    "string" ?
      (invoice as unknown as {subscription: string}).subscription :
      (invoice as {subscription?: {id?: string}}).subscription?.id;
  if (!subscriptionId) {
    return;
  }

  // Retrieve subscription to get customer ID
  const subscription = await stripe.subscriptions.retrieve(subscriptionId);
  const customerId = typeof subscription.customer === "string" ?
    subscription.customer :
    subscription.customer.id;

  // Find user by customer ID
  const subscriptionsSnapshot = await db
    .collection("subscriptions")
    .where("stripeCustomerId", "==", customerId)
    .limit(1)
    .get();

  if (subscriptionsSnapshot.empty) {
    logger.error("Subscription not found in Firestore", {customerId});
    return;
  }

  const subscriptionDoc = subscriptionsSnapshot.docs[0];

  // Get current period end safely
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let currentPeriodEnd = (subscription as any).current_period_end;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  if (!currentPeriodEnd &&
    (subscription as any).items?.data?.[0]?.current_period_end) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    currentPeriodEnd = (subscription as any).items.data[0].current_period_end;
  }

  if (!currentPeriodEnd || typeof currentPeriodEnd !== "number") {
    logger.error(
      "Invalid current_period_end in invoice payment",
      {currentPeriodEnd}
    );
    return;
  }

  await subscriptionDoc.ref.update({
    currentPeriodEnd: Timestamp.fromMillis(currentPeriodEnd * 1000),
    status: subscription.status === "active" ? "active" : "past_due",
  });

  logger.info("Invoice payment succeeded", {
    userId: subscriptionDoc.id,
    subscriptionId,
  });
}

