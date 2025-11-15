// RouteCoinMe - Main Application Entry Point
import StravaAuth from './auth/strava-auth.js';
import FileUploadHandler from './ui/file-upload.js';
import { config } from './config/app-config.js';

console.log('🏔️ RouteCoinMe - Loading...');

// Initialize the application
class RouteCoinMe {
    constructor() {
        this.stravaAuth = null;
        this.fileUploader = null;
        this.init();
    }

    init() {
        console.log('🚀 Initializing RouteCoinMe application...');
        this.initializeAuth();
        this.initializeFileUpload();
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

    initializeFileUpload() {
        // Initialize GPX file upload handler
        this.fileUploader = new FileUploadHandler();
        
        // Make it globally accessible for UI interactions
        window.fileUploader = this.fileUploader;
        
        console.log('📁 File upload handler initialized');
    }

    setupEventListeners() {
        // Add click handler for main demo area when not authenticated
        this.setupDemoAreaClick();
        
        // Log that we're ready
        document.addEventListener('DOMContentLoaded', () => {
            console.log('✅ RouteCoinMe loaded successfully');
            this.showSetupInstructions();
        });
    }

    setupDemoAreaClick() {
        document.addEventListener('click', (event) => {
            const demoArea = document.querySelector('.demo-placeholder');
            if (demoArea && demoArea.contains(event.target) && 
                !this.stravaAuth.isAuthenticated() && 
                !demoArea.querySelector('.gpx-upload-area')) {
                
                // If not authenticated and no routes loaded, show upload option
                this.showUploadOption();
            }
        });
    }

    showUploadOption() {
        const demoArea = document.querySelector('.demo-placeholder');
        if (demoArea) {
            demoArea.innerHTML = `
                <h3>🏔️ Ready to Analyze Your Routes?</h3>
                <p>Upload GPX files to start aggregating and visualizing your cycling adventures</p>
                
                <div class="upload-actions">
                    <button class="btn btn-primary" onclick="window.fileUploader.triggerFileUpload()">
                        📁 Upload GPX Files
                    </button>
                    <button class="btn btn-secondary" onclick="window.stravaAuth.authenticate()">
                        🔗 Connect Strava Instead
                    </button>
                </div>
                
                <div class="drop-zone-hint">
                    <p>💡 You can also drag & drop GPX files anywhere on this page</p>
                </div>
            `;
        }
    }

    showSetupInstructions() {
        if (config.strava.clientId === 'YOUR_STRAVA_CLIENT_ID_HERE') {
            console.warn(`
🔧 SETUP REQUIRED:

To connect with Strava, you need to:

1. Go to https://www.strava.com/settings/api
2. Create an application if you haven't already
3. Set "Authorization Callback Domain" to: localhost:3000
4. Copy your Client ID
5. Update src/config/app-config.js with your Client ID

Current callback domain setting should be: localhost:3000

💡 Alternatively, you can upload GPX files directly without Strava!
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
✅ GPX file upload functionality
⏳ Route aggregation algorithms (coming next)

Features Available:
- Upload and parse GPX files
- Drag & drop support
- Route statistics calculation
- Local storage persistence

Ready to upload some GPX files! 🚀
        `);
    }
}

// Initialize the app when the DOM is loaded
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => new RouteCoinMe());
} else {
    new RouteCoinMe();
}
