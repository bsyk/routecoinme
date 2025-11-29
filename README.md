# RouteCoinMe

GPS route aggregation and 3D visualization web application.

## Development

### Environment Setup

1. **Install dependencies:**
```bash
npm install
```

2. **Configure Strava OAuth (optional - only needed for Strava integration):**

Create a `.env` file in the project root with your Strava API credentials:

```bash
STRAVA_CLIENT_ID=your_client_id_here
STRAVA_CLIENT_SECRET=your_client_secret_here
```

To get these credentials:
- Go to https://www.strava.com/settings/api
- Create an application if you haven't already
- Set "Authorization Callback Domain" to: `localhost` (for local dev)
- Copy your Client ID and Client Secret

**Note:** The `.env` file is for local development only. For production deployment to Cloudflare, set these as secrets:

```bash
npx wrangler secret put STRAVA_CLIENT_ID
npx wrangler secret put STRAVA_CLIENT_SECRET
```

3. **Run development server:**
```bash
npm run dev
```

The app works with or without Strava integration - you can upload GPX files directly!

### Build Commands

Build for production:
```bash
npm run build
```

Preview production build:
```bash
npm run preview
```

## Project Status

🚧 **In Development** - Basic foundation complete, features coming soon!

### Current Status
- ✅ Basic web application structure
- ✅ Modern CSS styling
- ✅ Development environment setup
- ✅ Strava OAuth integration (server-side via Cloudflare Workers)
- ✅ GPX parsing and route aggregation
- ✅ 3D visualization with Three.js
- ✅ 2D map visualization with Leaflet

## Features (Planned)

- 📈 Aggregate GPS routes from Strava
- 🗻 Interactive 3D elevation visualization
- 💾 Export aggregated routes as GPX files
- 🔒 Privacy-first local storage with optional cloud sync
- 📱 Responsive design for all devices

## Tech Stack

- **Frontend**: Vanilla JavaScript, D3.js, Three.js
- **Build Tool**: Vite
- **Backend**: Cloudflare Workers (planned)
- **Storage**: Local Storage + Cloudflare R2/D1 (planned)
