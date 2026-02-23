# Firestore Schema Documentation

## Users Collection

### Collection Path
`users/{userId}`

### Document Structure
```typescript
{
  userId: string;                     // Firebase Auth UID (same as document ID)
  name: string;                       // Display name
  email: string;                      // Email address
  userType: string;                   // Role: "user" | "admin" (used for dashboard access, etc.)
  imageUrl?: string;                  // Profile picture URL (Firebase Storage)
  createdAt?: Timestamp;              // When the user document was created
  updatedAt?: Timestamp;              // When the user document was last updated
}
```

### Notes
- Document ID is the Firebase Auth UID (`userId`).
- `userType` determines access: e.g. `"admin"` users see the option to switch to the admin dashboard on the home page.
- Documents are typically created on sign-up and read by the client for profile and role checks.

---

## Subscriptions Collection

### Collection Path
`subscriptions/{userId}`

### Document Structure
```typescript
{
  userId: string;                    // Firebase user ID (same as document ID)
  stripeCustomerId?: string;          // Stripe customer ID (absent for no-card trial)
  stripeSubscriptionId?: string;     // Stripe subscription ID (absent for no-card trial)
  status: "active" | "canceled" | "past_due" | "trialing";
  planType: "monthly" | "yearly";
  currentPeriodEnd: Timestamp;        // When the current period (or trial) ends
  createdAt: Timestamp;               // When the subscription was created
}
```

### Security Rules
- **Read**: Users can read their own subscription; admins can read all (for dashboard overview).
- **Write**: Only Cloud Functions can write. The `startFreeTrial` callable creates no-card trialing subscriptions; Stripe webhooks create/update paid subscription data.

### Notes
- No-card 7-day free trial is created by the `startFreeTrial` Cloud Function (called from the packages page). Paid subscriptions are created/updated by Cloud Functions via Stripe webhooks.
- The `currentPeriodEnd` field is used to determine if a subscription or trial is still active.

---

## Coupons Collection

### Collection Path
`coupons/{couponId}`

### Document Structure
```typescript
{
  name: string;              // Display name of the coupon
  code: string;              // Coupon code (e.g. FREEACCESS2025)
  createdBy: string;         // Firebase user ID of the admin who created it
  usedBy: string | null;     // Firebase user ID of the user who redeemed it, or null if unused
  createdAt: Timestamp;      // When the coupon was created
}
```

### Notes
- Used for free-access or promotional coupons. Status is derived: if `usedBy` is set, the coupon is "Used", otherwise "New".
- Admins can create and list coupons from the dashboard. Redeeming (setting `usedBy`) can be implemented in the app when a user enters a coupon code.

