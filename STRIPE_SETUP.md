# Stripe Subscription Setup Guide

## Prerequisites
1. Stripe account (sign up at https://stripe.com)
2. Firebase project with Firestore enabled
3. Firebase Functions deployed

## Step 1: Create Stripe Product and Prices

You can create either:
- **Option A**: One product with multiple prices (recommended)
  - Go to Stripe Dashboard → Products
  - Create one product (e.g., "Client Check Subscription")
  - Add two prices to this product:
    - Monthly price (recurring, monthly billing)
    - Yearly price (recurring, yearly billing)
  - Copy both **Price IDs** (they start with `price_...`)

- **Option B**: Two separate products
  - Create two products:
    - **Monthly Plan**: Create a recurring product with monthly billing
    - **Yearly Plan**: Create a recurring product with yearly billing
  - Copy the **Price IDs** for both products (they start with `price_...`)

**Note**: The code works with either approach - it only needs the Price IDs. Since you have one product with variable pricing, you just need to copy the two Price IDs (one for monthly, one for yearly) from your single product.

## Step 2: Configure Firebase Functions Secrets

For Firebase Functions v2, use secrets instead of config. Set the following secrets:

```bash
firebase functions:secrets:set STRIPE_SECRET_KEY
# When prompted, paste your Stripe secret key (sk_test_... or sk_live_...)

firebase functions:secrets:set STRIPE_WEBHOOK_SECRET
# When prompted, paste your webhook secret (whsec_...)

firebase functions:secrets:set STRIPE_PRICE_ID_MONTHLY
# When prompted, paste your monthly price ID (price_...)

firebase functions:secrets:set STRIPE_PRICE_ID_YEARLY
# When prompted, paste your yearly price ID (price_...)

firebase functions:secrets:set SUCCESS_URL
# When prompted, enter your success URL (e.g., https://yourdomain.com)

firebase functions:secrets:set CANCEL_URL
# When prompted, enter your cancel URL (e.g., https://yourdomain.com/packages)
```

**Note**: 
- For production, use `sk_live_...` instead of `sk_test_...`
- You can find your Price IDs in Stripe Dashboard → Products → [Your Product] → Pricing
- Even if you have one product with variable pricing, you still need both Price IDs (one for monthly, one for yearly)

## Step 3: Verify Cloud Functions Code

The code is already set up to use Firebase Functions v2 secrets. The functions use `defineString` to access secrets:

- `functions/src/stripe/createCheckoutSession.ts` - Uses secrets for Stripe key and price IDs
- `functions/src/stripe/webhook.ts` - Uses secrets for Stripe key and webhook secret

No code changes needed! Just make sure you've set all the secrets in Step 2.

## Step 4: Deploy Firebase Functions

```bash
cd functions
npm install
npm run build
cd ..
firebase deploy --only functions
```

After deployment, note the webhook function URL (it will be something like):
`https://us-central1-client-check-3d09f.cloudfunctions.net/webhook`

## Step 5: Configure Stripe Webhook

1. Go to Stripe Dashboard → Developers → Webhooks
2. Click "Add endpoint"
3. Enter your webhook function URL
4. Select the following events to listen to:
   - `checkout.session.completed`
   - `customer.subscription.updated`
   - `customer.subscription.deleted`
   - `invoice.payment_succeeded`
5. Click "Add endpoint"
6. Copy the **Signing secret** (starts with `whsec_...`)
7. Update your Firebase Functions config with this secret:
   ```bash
   firebase functions:config:set stripe.webhook_secret="whsec_..."
   ```
8. Redeploy functions:
   ```bash
   firebase deploy --only functions
   ```

## Step 6: Configure Client-Side Environment

Create or update `.env.local` in your project root:

```env
NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY=pk_test_...
```

**Note**: For production, use `pk_live_...` instead of `pk_test_...`

## Step 7: Set Up Firestore Security Rules

Update your Firestore security rules:

```javascript
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    // Subscriptions collection
    match /subscriptions/{userId} {
      // Users can only read their own subscription
      allow read: if request.auth != null && request.auth.uid == userId;
      // Only server (Cloud Functions) can write
      allow write: if false;
    }
    
    // Add your other collection rules here
    match /{document=**} {
      allow read, write: if request.auth != null;
    }
  }
}
```

## Step 8: Test the Integration

1. Start your Next.js app: `npm run dev`
2. Sign up a new user
3. You should be redirected to `/packages`
4. Click on a subscription plan
5. Complete the Stripe checkout (use test card: `4242 4242 4242 4242`)
6. After successful payment, you should be redirected to `/home`
7. Verify subscription status in Firestore under `subscriptions/{userId}`

## Troubleshooting

### Webhook not receiving events
- Verify the webhook URL is correct in Stripe dashboard
- Check Firebase Functions logs: `firebase functions:log`
- Ensure webhook secret is correctly set in Firebase config

### Subscription not updating in Firestore
- Check Firebase Functions logs for errors
- Verify webhook events are being received in Stripe dashboard
- Ensure Firestore security rules allow Cloud Functions to write

### Checkout session creation fails
- Verify Stripe secret key is set correctly
- Check that price IDs are correct
- Ensure user is authenticated before calling the function

## Production Checklist

- [ ] Switch to Stripe live keys (`sk_live_...` and `pk_live_...`)
- [ ] Update success and cancel URLs to production domain
- [ ] Test complete subscription flow in production
- [ ] Set up monitoring for webhook failures
- [ ] Configure Firestore security rules for production
- [ ] Set up error alerting for failed payments

