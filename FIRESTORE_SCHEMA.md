# Firestore Schema Documentation

## Subscriptions Collection

### Collection Path
`subscriptions/{userId}`

### Document Structure
```typescript
{
  userId: string;                    // Firebase user ID (same as document ID)
  stripeCustomerId: string;            // Stripe customer ID
  stripeSubscriptionId: string;       // Stripe subscription ID
  status: "active" | "canceled" | "past_due" | "trialing";
  planType: "monthly" | "yearly";
  currentPeriodEnd: Timestamp;        // When the current subscription period ends
  createdAt: Timestamp;               // When the subscription was created
}
```

### Security Rules
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
    
    // Other collections...
  }
}
```

### Notes
- Documents are created/updated by Firebase Cloud Functions via Stripe webhooks
- Users can read their own subscription data
- Only Cloud Functions can write to this collection
- The `currentPeriodEnd` field is used to determine if a subscription is still active

