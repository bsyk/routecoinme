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
        this.setupResponsiveNavigation();
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
                button.textContent = 'mi/ft';
                button.title = 'Switch to imperial units (miles and feet)';
            } else {
                button.textContent = 'km/m';
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

        // Setup feature button click handlers
        this.setupFeatureButtons();

        // Log that we're ready
        document.addEventListener('DOMContentLoaded', () => {
            console.log('✅ RouteCoinMe loaded successfully');
            this.showSetupInstructions();
        });
    }

    setupFeatureButtons() {
        // Route Coin - single activity/GPX upload
        const routeCoinBtn = document.getElementById('route-coin-btn');
        if (routeCoinBtn) {
            routeCoinBtn.addEventListener('click', () => {
                console.log('🪙 Route Coin clicked');
                this.showUploadOptions();
            });
        }

        // Segment Coin - import Strava segments
        const segmentCoinBtn = document.getElementById('segment-coin-btn');
        if (segmentCoinBtn) {
            segmentCoinBtn.addEventListener('click', () => {
                console.log('🏆 Segment Coin clicked');
                this.handleSegmentCoin();
            });
        }

        // Year Coin - all 2025 cycling activities
        const yearCoinBtn = document.getElementById('year-coin-btn');
        if (yearCoinBtn) {
            yearCoinBtn.addEventListener('click', () => {
                console.log('📅 Year Coin clicked');
                this.handleYearCoin();
            });
        }

        // Coin Designer - existing visualizer
        const designerBtn = document.getElementById('designer-coin-btn');
        if (designerBtn) {
            designerBtn.addEventListener('click', () => {
                console.log('🎨 Coin Designer clicked');
                this.showUploadOptions();
            });
        }
    }

    showUploadOptions() {
        // Show landing state
        const landingState = document.getElementById('landing-state');
        const fileUploadSection = document.getElementById('file-upload-section');
        const routeVisualizationArea = document.getElementById('route-visualization-area');

        if (landingState) landingState.style.display = 'block';
        if (fileUploadSection) fileUploadSection.style.display = 'none';
        if (routeVisualizationArea) routeVisualizationArea.style.display = 'none';

        // Check authentication status
        const isAuthenticated = this.stravaAuth?.getCachedAuthStatus?.() ?? false;

        if (isAuthenticated) {
            // Show authenticated options (Browse Strava + Upload GPX)
            this.stravaAuth?.showAuthenticatedFeatures();
        } else {
            // Show unauthenticated options (Connect Strava + Upload GPX)
            if (landingState) {
                landingState.innerHTML = `
                    <h3>Upload Routes</h3>
                    <p>Connect with Strava to import activities or upload GPX files directly.</p>
                    <div class="landing-actions">
                        <button class="btn btn-primary" onclick="window.stravaAuth?.authenticate()">
                            🔗 Connect with Strava
                        </button>
                        <button class="btn btn-secondary" onclick="window.fileUploader?.showFileUploadUI()">
                            📁 Upload GPX Files
                        </button>
                    </div>
                `;
            }
        }
    }

    handleSegmentCoin() {
        // Check if user is authenticated with Strava
        const isAuthenticated = this.stravaAuth?.getCachedAuthStatus?.() ?? false;

        if (!isAuthenticated) {
            alert('Please connect with Strava to import segments.');
            this.stravaAuth?.authenticate();
            return;
        }

        // Open the segment import dialog
        console.log('🏔️ Opening segment import dialog...');
        this.stravaAuth?.showSegmentImportDialog();
    }

    async handleYearCoin() {
        // Check if user is authenticated with Strava
        const isAuthenticated = this.stravaAuth?.getCachedAuthStatus?.() ?? false;

        if (!isAuthenticated) {
            alert('Please connect with Strava to create a Year Coin from your activities.');
            this.stravaAuth?.authenticate();
            return;
        }

        // Create loading notification
        const loadingNotification = document.createElement('div');
        loadingNotification.id = 'year-coin-loading';
        loadingNotification.style.cssText = `
            position: fixed;
            top: 50%;
            left: 50%;
            transform: translate(-50%, -50%);
            padding: 30px 40px;
            background: white;
            border-radius: 10px;
            box-shadow: 0 10px 40px rgba(0,0,0,0.2);
            z-index: 10000;
            text-align: center;
            min-width: 300px;
        `;
        loadingNotification.innerHTML = `
            <div style="font-size: 3rem; margin-bottom: 1rem;">📅</div>
            <h3 style="margin: 0 0 0.5rem 0;">Creating Your 2025 Year Coin</h3>
            <p style="margin: 0 0 1rem 0; color: #64748b;">Fetching and aggregating your cycling activities...</p>
            <div class="spinner" style="margin: 0 auto; width: 40px; height: 40px; border: 4px solid #e2e8f0; border-top-color: #2563eb; border-radius: 50%; animation: spin 1s linear infinite;"></div>
            <style>
                @keyframes spin {
                    to { transform: rotate(360deg); }
                }
            </style>
        `;
        document.body.appendChild(loadingNotification);

        try {
            console.log('📅 Fetching 2025 activities for Year Coin...');

            // Call the worker endpoint
            const response = await fetch('/api/strava/year-coin', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                credentials: 'include',
                body: JSON.stringify({ year: 2025 })
            });

            if (!response.ok) {
                const errorData = await response.json().catch(() => ({}));
                throw new Error(errorData.message || `Failed to create year coin: ${response.statusText}`);
            }

            const yearCoinData = await response.json();

            // Remove loading notification
            loadingNotification.remove();

            // Display the year coin in the visualizer
            await this.fileUploader?.displayYearCoin(yearCoinData);

            console.log('✅ Year Coin created successfully');
        } catch (error) {
            console.error('❌ Year Coin creation failed:', error);

            // Remove loading notification
            loadingNotification.remove();

            // Show error message
            alert(`Failed to create Year Coin: ${error.message}`);
        }
    }

    setupResponsiveNavigation() {
        const navToggle = document.getElementById('nav-toggle');
        const nav = document.getElementById('primary-nav');

        if (!navToggle || !nav) {
            return;
        }

        const closeNav = () => {
            nav.classList.remove('is-open');
            navToggle.setAttribute('aria-expanded', 'false');
        };

        navToggle.addEventListener('click', () => {
            const isOpen = nav.classList.toggle('is-open');
            navToggle.setAttribute('aria-expanded', isOpen ? 'true' : 'false');
        });

        nav.querySelectorAll('a, button').forEach((control) => {
            control.addEventListener('click', () => {
                if (window.innerWidth <= 900) {
                    closeNav();
                }
            });
        });

        const handleResize = () => {
            if (window.innerWidth > 900) {
                closeNav();
            }
        };

        window.addEventListener('resize', handleResize);
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
                    <label class="btn btn-primary" for="gpx-file-input">
                        📁 Upload GPX Files
                    </label>
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
