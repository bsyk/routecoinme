// RouteCoinMe - Main Application Entry Point
import StravaAuth from './auth/strava-auth.js';
import FileUploadHandler from './ui/file-upload.js';
import unitPreferences from './utils/unit-preferences.js';

console.log('🏔️ RouteCoinMe - Loading...');

// Initialize the application
class RouteCoinMe {
    constructor() {
        this.stravaAuth = null;
        this.fileUploader = null;
        this.unitPreferences = unitPreferences;
        this.init();
    }

    init() {
        console.log('🚀 Initializing RouteCoinMe application...');
        this.initializeAuth();
        this.initializeUnitToggle();
        this.initializeFileUpload();
        this.setupEventListeners();
        this.displayWelcomeMessage();
    }

    initializeAuth() {
        // Initialize Strava authentication (via Cloudflare Workers)
        this.stravaAuth = new StravaAuth();
        
        // Make it globally accessible for demo purposes
        window.stravaAuth = this.stravaAuth;
        
        console.log('🔐 Strava authentication initialized');
    }

    initializeUnitToggle() {
        window.unitPreferences = this.unitPreferences;

        const button = document.getElementById('unit-toggle-btn');
        if (!button) {
            console.warn('⚠️ Unit toggle button not found');
            return;
        }

        const applyLabel = (system) => {
            if (system === 'metric') {
                button.textContent = 'Use miles + feet';
                button.title = 'Switch to imperial units (miles and feet)';
            } else {
                button.textContent = 'Use km + meters';
                button.title = 'Switch to metric units (kilometers and meters)';
            }
        };

        applyLabel(this.unitPreferences.getUnitSystem());

        button.addEventListener('click', () => {
            const newSystem = this.unitPreferences.toggleUnitSystem();
            applyLabel(newSystem);
        });

        window.addEventListener('rcm:unit-change', (event) => {
            const system = event.detail?.system || this.unitPreferences.getUnitSystem();
            applyLabel(system);
        });
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
            const isAuthenticated = this.stravaAuth?.getCachedAuthStatus?.() ?? false;
            if (demoArea && demoArea.contains(event.target) && 
                !isAuthenticated && 
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
        // Server-side auth via Cloudflare Workers handles all Strava credentials
        // No client-side configuration needed
        console.log('💡 Ready to use! Upload GPX files or connect with Strava via the Cloudflare Worker.');
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
