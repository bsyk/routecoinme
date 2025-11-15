// RouteCoinMe - Main Application Entry Point
import StravaAuth from './auth/strava-auth.js';
import { config } from './config/app-config.js';

console.log('🏔️ RouteCoinMe - Loading...');

// Initialize the application
class RouteCoinMe {
    constructor() {
        this.stravaAuth = null;
        this.init();
    }

    init() {
        console.log('🚀 Initializing RouteCoinMe application...');
        this.initializeAuth();
        this.setupEventListeners();
        this.displayWelcomeMessage();
    }

    initializeAuth() {
        // Initialize Strava authentication
        this.stravaAuth = new StravaAuth();
        this.stravaAuth.setClientId(config.strava.clientId);
        
        // Make it globally accessible for demo purposes
        window.stravaAuth = this.stravaAuth;
        
        console.log('🔐 Strava authentication initialized');
    }

    setupEventListeners() {
        // Log that we're ready
        document.addEventListener('DOMContentLoaded', () => {
            console.log('✅ RouteCoinMe loaded successfully');
            this.showSetupInstructions();
        });
    }

    showSetupInstructions() {
        if (config.strava.clientId === 'YOUR_STRAVA_CLIENT_ID_HERE') {
            console.warn(`
� SETUP REQUIRED:

To connect with Strava, you need to:

1. Go to https://www.strava.com/settings/api
2. Create an application if you haven't already
3. Set "Authorization Callback Domain" to: localhost:3000
4. Copy your Client ID
5. Update src/config/app-config.js with your Client ID

Current callback domain setting should be: localhost:3000
            `);
        }
    }

    displayWelcomeMessage() {
        console.log(`
🏔️ Welcome to RouteCoinMe!

This is your GPS route aggregation and 3D visualization app.

Current Status:
✅ Basic web application structure
✅ Strava OAuth integration ready
⏳ Configure your Strava Client ID in src/config/app-config.js

Next steps:
- Set up Strava API credentials
- Implement GPX fetching from Strava
- Build route aggregation algorithms
- Develop 3D visualization with D3.js and Three.js

Ready to start building! 🚀
        `);
    }
}

// Initialize the app when the DOM is loaded
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => new RouteCoinMe());
} else {
    new RouteCoinMe();
}
