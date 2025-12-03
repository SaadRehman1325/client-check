# Google Maps API Setup Guide

## Required APIs

You need to enable **2 APIs** in Google Cloud Platform for your application:

### 1. Maps JavaScript API
- **Purpose**: Display interactive maps in your application
- **Used in**: `src/app/home/page.tsx` - GoogleMap component

### 2. Geocoding API
- **Purpose**: Convert addresses/ZIP codes to latitude/longitude coordinates
- **Used in**: `src/app/home/page.tsx` - handleAddCard function

## Step-by-Step Setup

### Step 1: Go to Google Cloud Console
1. Visit [Google Cloud Console](https://console.cloud.google.com/)
2. Select your project: **clientcheck-e4df8** (or create a new one)

### Step 2: Enable the APIs
1. Go to **APIs & Services** → **Library**
2. Search for and enable:
   - **Maps JavaScript API**
   - **Geocoding API**

### Step 3: Create API Keys
1. Go to **APIs & Services** → **Credentials**
2. Click **+ CREATE CREDENTIALS** → **API key**
3. Copy the generated API key

### Step 4: Restrict the API Key (Recommended for Security)
1. Click on your newly created API key to edit it
2. Under **API restrictions**, select **Restrict key**
3. Choose:
   - ✅ **Maps JavaScript API**
   - ✅ **Geocoding API**
4. Under **Application restrictions**:
   - For web apps: Select **HTTP referrers (web sites)**
   - Add your domain(s):
     - `localhost:3000/*` (for development)
     - `yourdomain.com/*` (for production)
     - `*.vercel.app/*` (if using Vercel)

### Step 5: Update Your Code
Replace the API keys in `src/app/home/page.tsx`:

```typescript
// Line 32 - For Maps JavaScript API
const { isLoaded } = useLoadScript({
  googleMapsApiKey: "YOUR_API_KEY_HERE"
});

// Line 115 - For Geocoding API
const geoRes = await fetch(
  `https://maps.googleapis.com/maps/api/geocode/json?address=${encodeURIComponent(card.zip)}&key=YOUR_API_KEY_HERE`
);
```

## Alternative: Use Environment Variables (Recommended)

For better security, use environment variables:

1. Create `.env.local` in your project root:
```env
NEXT_PUBLIC_GOOGLE_MAPS_API_KEY=your_api_key_here
```

2. Update `src/app/home/page.tsx`:
```typescript
const { isLoaded } = useLoadScript({
  googleMapsApiKey: process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY || ""
});

// In handleAddCard function:
const geoRes = await fetch(
  `https://maps.googleapis.com/maps/api/geocode/json?address=${encodeURIComponent(card.zip)}&key=${process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY}`
);
```

## Pricing Notes
- **Maps JavaScript API**: Free tier includes $200 credit/month (covers most small apps)
- **Geocoding API**: $5 per 1,000 requests after free tier
- Monitor usage in Google Cloud Console → **APIs & Services** → **Dashboard**

## Security Best Practices
1. ✅ Always restrict API keys to specific APIs
2. ✅ Use HTTP referrer restrictions for web apps
3. ✅ Never commit API keys to version control
4. ✅ Use environment variables for API keys
5. ✅ Monitor API usage regularly
6. ✅ Set up billing alerts in GCP

