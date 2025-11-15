# RouteCoinMe

GPS route aggregation and 3D visualization web application.

## Development

Install dependencies:
```bash
npm install
```

Run development server:
```bash
npm run dev
```

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
- ⏳ Strava OAuth integration (Phase 1)
- ⏳ GPX parsing and aggregation (Phase 2)
- ⏳ 3D visualization (Phase 3)

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
