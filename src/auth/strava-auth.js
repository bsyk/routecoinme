import unitPreferences from '../utils/unit-preferences.js';

// Strava OAuth Authentication Client
// Works with Cloudflare Worker for server-side OAuth flow
// All credentials (client ID & secret) are stored server-side in worker env vars
// Uses HTTP-only cookies for secure token storage

class StravaAuth {
    constructor() {
        this.workerBaseUrl = window.location.origin; // Path-based API routing
        this.cachedAuthStatus = null;
        this.statusRefreshPromise = null;
        this.recentActivitiesCache = null;
        this.handleUnitPreferenceChange = this.handleUnitPreferenceChange.bind(this);
        window.addEventListener('rcm:unit-change', this.handleUnitPreferenceChange);
        this.init();
    }

    init() {
        // Check if we're returning from OAuth callback
        if (window.location.pathname === '/auth/callback') {
            this.handleCallback();
            return;
        }

        // Check for existing authentication
        this.checkExistingAuth();
    }

    // Start the OAuth flow via Cloudflare Worker
    authenticate() {
        console.log('🔐 Initiating Strava authentication via worker...');
        const authUrl = `${this.workerBaseUrl}/api/auth/login`;
        const returnUrl = encodeURIComponent(window.location.origin + '/auth/callback');
        window.location.href = `${authUrl}?return_url=${returnUrl}`;
    }

    // Handle the OAuth callback from Cloudflare Worker
    async handleCallback() {
        try {
            console.log('� Processing auth callback...');
            
            // Check if authentication was successful by calling the worker
            const response = await fetch(`${this.workerBaseUrl}/api/auth/status`, {
                credentials: 'include' // Include HTTP-only cookies
            });

            if (response.ok) {
                const authData = await response.json();
                this.updateCachedAuthStatus(true, authData.athlete);

                console.log('✅ Strava authentication successful');
                
                // Clean up URL and reload
                window.history.replaceState({}, document.title, '/');
                window.location.reload();
            } else {
                this.updateCachedAuthStatus(false);
                console.error('❌ Authentication failed');
                window.history.replaceState({}, document.title, '/');
                this.showNotification('Authentication failed. Please try again.', 'error');
            }
        } catch (error) {
            console.error('❌ Auth callback error:', error);
            window.history.replaceState({}, document.title, '/');
            this.updateCachedAuthStatus(false);
            this.showNotification('Authentication error. Please try again.', 'error');
        }
    }

    // Retrieve cached auth status without hitting the network
    getCachedAuthStatus() {
        if (typeof this.cachedAuthStatus === 'boolean') {
            return this.cachedAuthStatus;
        }

        try {
            const storedValue = localStorage.getItem('rcm_was_authenticated');
            if (storedValue === null) {
                this.cachedAuthStatus = false;
            } else {
                this.cachedAuthStatus = storedValue === 'true';
            }
        } catch (error) {
            console.warn('⚠️ Failed to read cached auth status:', error);
            this.cachedAuthStatus = false;
        }

        return this.cachedAuthStatus;
    }

    // Persist new auth state in memory and local storage
    updateCachedAuthStatus(isAuthenticated, athlete = null) {
        this.cachedAuthStatus = !!isAuthenticated;

        try {
            localStorage.setItem('rcm_was_authenticated', this.cachedAuthStatus ? 'true' : 'false');
        } catch (error) {
            console.warn('⚠️ Failed to persist auth flag:', error);
        }

        if (this.cachedAuthStatus) {
            if (athlete) {
                try {
                    localStorage.setItem('rcm_athlete_info', JSON.stringify(athlete));
                } catch (error) {
                    console.warn('⚠️ Failed to persist athlete info:', error);
                }
            }
        } else {
            try {
                localStorage.removeItem('rcm_athlete_info');
            } catch (error) {
                console.warn('⚠️ Failed to clear athlete info:', error);
            }
        }
    }

    // Ask the worker for fresh auth status and sync caches
    async refreshAuthStatus() {
        if (this.statusRefreshPromise) {
            return this.statusRefreshPromise;
        }

        this.statusRefreshPromise = (async () => {
            try {
                const response = await fetch(`${this.workerBaseUrl}/api/auth/status`, {
                    credentials: 'include'
                });

                if (!response.ok) {
                    console.warn('⚠️ Auth status check failed:', response.status);
                    this.updateCachedAuthStatus(false);
                    return false;
                }

                const authData = await response.json();
                this.updateCachedAuthStatus(true, authData?.athlete || null);
                return true;
            } catch (error) {
                console.warn('⚠️ Auth status request error:', error);
                this.updateCachedAuthStatus(false);
                return false;
            } finally {
                this.statusRefreshPromise = null;
            }
        })();

        return this.statusRefreshPromise;
    }

    // Check if user is authenticated by querying the worker
    async isAuthenticated(options = {}) {
        const { forceRefresh = false } = options;
        if (!forceRefresh) {
            return this.getCachedAuthStatus();
        }

        return this.refreshAuthStatus();
    }

    // Get athlete information from localStorage (non-sensitive data)
    getAthleteInfo() {
        try {
            const athleteData = localStorage.getItem('rcm_athlete_info');
            return athleteData ? JSON.parse(athleteData) : null;
        } catch (error) {
            console.warn('⚠️ Failed to parse athlete info:', error);
            return null;
        }
    }

    // Check if user was previously authenticated (for UI hints)
    wasPreviouslyAuthenticated() {
        return this.getCachedAuthStatus();
    }

    // Check for existing authentication on page load
    async checkExistingAuth() {
        const cachedStatus = this.getCachedAuthStatus();
        const athlete = this.getAthleteInfo();

        if (cachedStatus && athlete) {
            console.log('✅ User already authenticated (cached):', athlete);
            this.updateUIForAuthenticatedState(athlete);
        } else {
            console.log('ℹ️ User not authenticated');
            if (cachedStatus) {
                console.log('💡 Cached auth flag is true but athlete data is missing');
            }
            this.updateUIForUnauthenticatedState();
        }

        const previousStatus = cachedStatus;
        const refreshedStatus = await this.refreshAuthStatus();
        if (refreshedStatus !== previousStatus) {
            const updatedAthlete = this.getAthleteInfo();
            if (refreshedStatus && updatedAthlete) {
                console.log('✅ User authenticated after status refresh:', updatedAthlete);
                this.updateUIForAuthenticatedState(updatedAthlete);
            } else {
                console.log('ℹ️ User not authenticated after status refresh');
                this.updateUIForUnauthenticatedState();
            }
        }
    }

    // Make API calls to Strava via Cloudflare Worker
    async callStravaAPI(endpoint, options = {}) {
        try {
            const response = await fetch(`${this.workerBaseUrl}/api/strava${endpoint}`, {
                ...options,
                credentials: 'include', // Include HTTP-only cookies
                headers: {
                    'Content-Type': 'application/json',
                    ...options.headers
                }
            });

            if (!response.ok) {
                if (response.status === 401) {
                    console.log('🔐 Authentication required');
                    this.clearLocalAuthState();
                    throw new Error('Authentication required');
                }
                
                // Try to extract error message from response body
                let errorMessage = `API call failed: ${response.status}`;
                try {
                    const errorData = await response.json();
                    if (errorData.message) {
                        errorMessage = errorData.message;
                    } else if (errorData.error) {
                        errorMessage = errorData.error;
                    } 
                } catch (parseError) {
                    // If JSON parsing fails, try to get text
                    try {
                        const errorText = await response.text();
                        if (errorText) {
                            errorMessage = errorText;
                        }
                    } catch (textError) {
                        // Keep the default error message
                    }
                }
                throw new Error(errorMessage);
            }

            return await response.json();
        } catch (error) {
            console.error('❌ Strava API call failed:', error);
            throw error;
        }
    }

    // Helper methods for Strava API calls
    async getRecentActivities() {
        return this.callStravaAPI('/activities?per_page=10');
    }

    // Update UI for authenticated user
    updateUIForAuthenticatedState(athlete) {
        const authBtn = document.getElementById('auth-btn');
        if (authBtn) {
            authBtn.textContent = `Welcome, ${athlete.firstname}!`;
            authBtn.classList.remove('btn-primary');
            authBtn.classList.add('btn-success');
            authBtn.onclick = () => this.showUserMenu();
        }

        this.showAuthenticatedFeatures();
    }

    // Update UI for unauthenticated user
    updateUIForUnauthenticatedState() {
        const authBtn = document.getElementById('auth-btn');
        if (authBtn) {
            authBtn.textContent = 'Connect with Strava';
            authBtn.classList.remove('btn-success');
            authBtn.classList.add('btn-primary');
            authBtn.onclick = () => this.authenticate();
        }
    }

    // Show user menu for authenticated users
    showUserMenu() {
        const athlete = this.getAthleteInfo();
        const menu = `
            Authenticated as: ${athlete.firstname} ${athlete.lastname}
            
            Options:
            - View Activities
            - Logout
        `;
        
        if (confirm(menu + '\n\nClick OK to logout, Cancel to continue')) {
            this.logout();
        }
    }

    // Show features available to authenticated users
    showAuthenticatedFeatures() {
        console.log('🎉 Showing authenticated features...');

        // Add Strava import button to upload actions if it doesn't exist
        this.addStravaImportButton();
        // Add Segment import button
        this.addSegmentImportButton();

        // Update ONLY the landing state content if it's visible (don't touch demo-placeholder)
        const landingState = document.getElementById('landing-state');
        if (landingState && window.getComputedStyle(landingState).display !== 'none') {
            // Show Strava-connected landing page content
            landingState.innerHTML = `
                <h3>🎉 Connected to Strava!</h3>
                <p>Import activities from Strava or upload GPX files to get started.</p>
                <div class="landing-actions">
                    <button class="btn btn-primary" onclick="window.stravaAuth.fetchActivities()">
                        📊 Browse Strava Activities
                    </button>
                    <button class="btn btn-secondary" onclick="window.fileUploader?.showFileUploadUI()">
                        📁 Upload GPX Files
                    </button>
                </div>
            `;
        }
    }
    
    // Add Strava import button to the upload actions section
    addStravaImportButton() {
        const uploadActions = document.getElementById('upload-actions');
        if (uploadActions && !document.getElementById('strava-import-btn')) {
            const stravaBtn = document.createElement('button');
            stravaBtn.id = 'strava-import-btn';
            stravaBtn.className = 'btn btn-primary';
            stravaBtn.onclick = () => this.fetchActivities();
            stravaBtn.innerHTML = '📊 Import from Strava';
            
            // Insert after "Upload More" button
            const uploadMoreBtn = document.getElementById('upload-more-btn');
            if (uploadMoreBtn && uploadMoreBtn.parentNode) {
                uploadMoreBtn.parentNode.insertBefore(stravaBtn, uploadMoreBtn.nextSibling);
            }
        }
    }

    // Fetch user activities
    async fetchActivities() {
        console.log('📊 Fetching Strava activities...');
        
        try {
            const activities = await this.getRecentActivities();
            console.log(`✅ Fetched ${activities.length} activities`);
            this.recentActivitiesCache = activities;
            this.showActivitiesList(activities);
        } catch (error) {
            console.error('❌ Error fetching activities:', error);
            if (error.message.includes('Authentication required')) {
                this.authenticate();
            } else {
                this.showNotification(`Failed to fetch activities: ${error.message}`, 'error');
            }
        }
    }

    // Show activities list in UI
    showActivitiesList(activities) {
        this.recentActivitiesCache = activities;

        // Create or update the Strava activities modal
        let modal = document.getElementById('strava-activities-modal');
        if (!modal) {
            modal = this.createStravaActivitiesModal();
        }
        
        // Get existing route IDs to check for reimports
        const existingIds = new Set(
            window.fileUploader?.uploadedRoutes.map(r => r.id) || []
        );
        
        const activitiesHTML = activities.map(activity => {
            const stravaRouteId = `strava_${activity.id}`;
            const isReimport = existingIds.has(stravaRouteId);
            const buttonIcon = isReimport ? '🔄' : '📥';
            const buttonText = isReimport ? 'Reimport' : 'Import';
            const buttonClass = isReimport ? 'btn-secondary' : 'btn-primary';
            const distanceMeters = Number(activity.distance) || 0;
            const distanceDisplay = unitPreferences.formatDistance(distanceMeters / 1000);
            
            return `
                <div class="activity-item" style="border: 1px solid #ddd; padding: 10px; margin: 5px 0; border-radius: 5px; background: white;">
                    <strong>${activity.name}</strong>
                    <br>
                    <small>${activity.sport_type || activity.type} • ${distanceDisplay} • ${activity.start_date_local}</small>
                    <br>
                    <button class="btn btn-sm ${buttonClass} import-activity-btn" onclick="window.stravaAuth.importActivity('${activity.id}')" style="margin-top: 5px; transition: all 0.3s ease;">
                        ${buttonIcon} ${buttonText}
                    </button>
                </div>
            `;
        }).join('');

        const modalContent = modal.querySelector('.strava-modal-content');
        if (modalContent) {
            modalContent.innerHTML = `
                <h3>📊 Recent Strava Activities</h3>
                <div style="margin: 10px 0;">
                    <button class="btn btn-primary" onclick="window.stravaAuth.showBulkImportDialog()" style="width: 100%;">
                        📦 Bulk Import Activities
                    </button>
                </div>
                <div class="activities-list" style="max-height: 400px; overflow-y: auto; margin: 15px 0;">
                    ${activitiesHTML}
                </div>
            `;
        }
        
        // Show the modal
        modal.style.display = 'flex';
    }
    
    // Create the Strava activities modal
    createStravaActivitiesModal() {
        const modal = document.createElement('div');
        modal.id = 'strava-activities-modal';
        modal.className = 'privacy-modal-overlay';
        modal.style.display = 'none';
        
        modal.innerHTML = `
            <div class="privacy-modal" style="max-width: 600px;">
                <div class="privacy-modal-header">
                    <h2>📊 Strava Activities</h2>
                    <button class="modal-close" onclick="window.stravaAuth.closeActivitiesModal()">×</button>
                </div>
                <div class="strava-modal-content privacy-modal-content">
                    <!-- Content will be inserted here -->
                </div>
                <div class="privacy-modal-actions">
                    <button class="btn btn-secondary" onclick="window.stravaAuth.closeActivitiesModal()">
                        Close
                    </button>
                </div>
            </div>
        `;
        
        // Close when clicking outside
        modal.addEventListener('click', (e) => {
            if (e.target === modal) {
                this.closeActivitiesModal();
            }
        });
        
        document.body.appendChild(modal);
        return modal;
    }
    
    // Close the Strava activities modal
    closeActivitiesModal() {
        const modal = document.getElementById('strava-activities-modal');
        if (modal) {
            modal.style.display = 'none';
        }
    }

    isActivitiesModalOpen() {
        const modal = document.getElementById('strava-activities-modal');
        return modal && modal.style.display === 'flex';
    }

    handleUnitPreferenceChange() {
        if (this.recentActivitiesCache && this.isActivitiesModalOpen()) {
            this.showActivitiesList(this.recentActivitiesCache);
        }
    }

    // Import a single activity
    async importActivity(activityId) {
        // Find the import button for this activity
        const importBtn = document.querySelector(`button[onclick*="importActivity('${activityId}')"]`);
        const originalButtonHTML = importBtn ? importBtn.innerHTML : null;
        
        // Disable all import buttons to prevent multiple simultaneous imports
        const allImportButtons = document.querySelectorAll('.import-activity-btn');
        
        try {
            console.log(`📥 Importing activity ${activityId}...`);
            
            // Disable all buttons
            allImportButtons.forEach(btn => {
                btn.disabled = true;
                btn.style.opacity = '0.5';
                btn.style.cursor = 'not-allowed';
            });
            
            // Show loading state on clicked button
            if (importBtn) {
                importBtn.innerHTML = '⏳ Importing...';
                importBtn.style.opacity = '0.7';
            }
            
            // Show processing notification
            this.showNotification('⏳ Importing activity from Strava...', 'info', 2000);
            
            // Fetch the activity as a route from the worker (does all the heavy lifting)
            const route = await this.callStravaAPI(`/import-activity/${activityId}`);
            
            // Parse startTime back to Date object if needed
            if (route.startTime) {
                route.startTime = new Date(route.startTime);
            }
            
            // Add to file uploader
            if (window.fileUploader) {
                // Check if this is a reimport by looking at existing routes
                const existingRoute = window.fileUploader.uploadedRoutes.find(r => r.id === route.id);
                const isReimport = !!existingRoute;
                
                if (isReimport) {
                    console.log(`� Re-importing: ${route.name} (${route.id})`);
                } else {
                    console.log(`📥 New import: ${route.name} (${route.id})`);
                }
                
                window.fileUploader.addRoute(route);
                
                // Save to IndexedDB storage (will overwrite if ID already exists)
                await window.fileUploader.saveRoutesToStorage();
                
                console.log('✅ Activity imported and saved successfully');
                
                // Close the modal if open
                this.closeActivitiesModal();

                // Ensure the viz is shown
                window.fileUploader.hideLoadingState();
                
                // Show success notification with reimport indicator
                const message = isReimport ? `🔄 Updated: ${route.name}` : `✅ Imported: ${route.name}`;
                this.showNotification(message, 'success');
            } else {
                console.error('❌ File uploader not available');
                this.showNotification('Error: File uploader not available', 'error');
                
                // Re-enable all buttons on error
                this.reEnableImportButtons(allImportButtons, importBtn, originalButtonHTML);
            }
            
        } catch (error) {
            console.error('❌ Error importing activity:', error);
            
            // Extract a user-friendly error message
            let userMessage = 'Failed to import activity';
            if (error.message) {
                // Use the error message from the API if available
                userMessage = error.message;
                
                // Clean up common error patterns for better UX
                if (userMessage.includes('API call failed:')) {
                    // Keep API error messages as-is since they might contain useful info
                } else if (userMessage === 'Authentication required') {
                    userMessage = 'Please re-authenticate with Strava';
                } else if (userMessage.includes('Network')) {
                    userMessage = 'Network error - please check your connection';
                }
            }
            
            this.showNotification(`❌ ${userMessage}`, 'error');
            
            // Re-enable all buttons on error
            this.reEnableImportButtons(allImportButtons, importBtn, originalButtonHTML);
        }
    }
    
    // Helper to re-enable import buttons after error
    reEnableImportButtons(allButtons, clickedButton, originalHTML) {
        allButtons.forEach(btn => {
            btn.disabled = false;
            btn.style.opacity = '1';
            btn.style.cursor = 'pointer';
        });
        
        if (clickedButton && originalHTML) {
            clickedButton.innerHTML = originalHTML;
        }
    }

    // Logout user
    async logout() {
        try {
            console.log('👋 Logging out...');
            
            await fetch(`${this.workerBaseUrl}/api/auth/logout`, {
                method: 'POST',
                credentials: 'include'
            });

            this.clearLocalAuthState();
            console.log('🗑️ Logged out successfully');
            window.location.reload();
        } catch (error) {
            console.error('❌ Logout failed:', error);
            // Still clear local state even if server call fails
            this.clearLocalAuthState();
            window.location.reload();
        }
    }

    // Clear local authentication state
    clearLocalAuthState() {
        this.updateCachedAuthStatus(false);
    }
    
    // Show a temporary notification
    showNotification(message, type = 'info', duration = null) {
        // Default duration based on type and message length
        if (!duration) {
            duration = type === 'error' ? 5000 : 3000;
            // Longer for longer messages
            if (message.length > 50) duration += 1000;
        }
        
        // Create notification element
        const notification = document.createElement('div');
        notification.className = `notification notification-${type}`;
        notification.textContent = message;
        notification.style.cssText = `
            position: fixed;
            top: 20px;
            right: 20px;
            padding: 15px 20px;
            background: ${type === 'success' ? '#4CAF50' : type === 'error' ? '#f44336' : '#2196F3'};
            color: white;
            border-radius: 5px;
            box-shadow: 0 2px 5px rgba(0,0,0,0.2);
            z-index: 10000;
            max-width: 400px;
            word-wrap: break-word;
            animation: slideIn 0.3s ease-out;
            cursor: pointer;
        `;
        
        // Click to dismiss
        notification.addEventListener('click', () => {
            notification.style.animation = 'slideOut 0.3s ease-out';
            setTimeout(() => notification.remove(), 300);
        });
        
        document.body.appendChild(notification);
        
        // Auto-remove after duration
        setTimeout(() => {
            if (notification.parentNode) {
                notification.style.animation = 'slideOut 0.3s ease-out';
                setTimeout(() => notification.remove(), 300);
            }
        }, duration);
    }
    
    // Show bulk import dialog
    showBulkImportDialog() {
        // Create or update the bulk import modal
        let modal = document.getElementById('bulk-import-modal');
        if (!modal) {
            modal = this.createBulkImportModal();
        }
        
        // Show the modal
        modal.style.display = 'flex';
    }
    
    // Create the bulk import modal
    createBulkImportModal() {
        const modal = document.createElement('div');
        modal.id = 'bulk-import-modal';
        modal.className = 'privacy-modal-overlay';
        modal.style.display = 'none';
        
        // Default to last 30 days
        const endDate = new Date();
        const startDate = new Date();
        startDate.setDate(startDate.getDate() - 30);
        
        const endDateStr = endDate.toISOString().split('T')[0];
        const startDateStr = startDate.toISOString().split('T')[0];
        
        modal.innerHTML = `
            <div class="privacy-modal" style="max-width: 600px;">
                <div class="privacy-modal-header">
                    <h2>📦 Bulk Import Activities</h2>
                    <button class="modal-close" onclick="window.stravaAuth.closeBulkImportModal()">×</button>
                </div>
                <div class="privacy-modal-content">
                    <p>Import multiple activities between two dates</p>
                    
                    <div style="margin: 20px 0;">
                        <label style="display: block; margin-bottom: 5px; font-weight: bold;">Start Date:</label>
                        <input type="date" id="bulk-start-date" value="${startDateStr}" 
                               style="width: 100%; padding: 8px; border: 1px solid #ddd; border-radius: 4px;">
                    </div>
                    
                    <div style="margin: 20px 0;">
                        <label style="display: block; margin-bottom: 5px; font-weight: bold;">End Date:</label>
                        <input type="date" id="bulk-end-date" value="${endDateStr}"
                               style="width: 100%; padding: 8px; border: 1px solid #ddd; border-radius: 4px;">
                    </div>
                    
                    <div style="margin: 20px 0;">
                        <label style="display: block; margin-bottom: 10px; font-weight: bold;">Activity Types:</label>
                        <div style="display: grid; grid-template-columns: repeat(2, 1fr); gap: 8px;">
                            <label style="display: flex; align-items: center; cursor: pointer;">
                                <input type="checkbox" value="Ride" checked class="activity-type-checkbox" style="margin-right: 5px;">
                                <span>🚴 Ride</span>
                            </label>
                            <label style="display: flex; align-items: center; cursor: pointer;">
                                <input type="checkbox" value="VirtualRide" checked class="activity-type-checkbox" style="margin-right: 5px;">
                                <span>🚴‍♂️ Virtual Ride</span>
                            </label>
                            <label style="display: flex; align-items: center; cursor: pointer;">
                                <input type="checkbox" value="EBikeRide" checked class="activity-type-checkbox" style="margin-right: 5px;">
                                <span>⚡ E-Bike Ride</span>
                            </label>
                            <label style="display: flex; align-items: center; cursor: pointer;">
                                <input type="checkbox" value="GravelRide" checked class="activity-type-checkbox" style="margin-right: 5px;">
                                <span>🚵 Gravel Ride</span>
                            </label>
                            <label style="display: flex; align-items: center; cursor: pointer;">
                                <input type="checkbox" value="MountainBikeRide" checked class="activity-type-checkbox" style="margin-right: 5px;">
                                <span>🏔️ MTB Ride</span>
                            </label>
                            <label style="display: flex; align-items: center; cursor: pointer;">
                                <input type="checkbox" value="EMountainBikeRide" checked class="activity-type-checkbox" style="margin-right: 5px;">
                                <span>⚡🏔️ E-MTB Ride</span>
                            </label>
                            <label style="display: flex; align-items: center; cursor: pointer;">
                                <input type="checkbox" value="Run" class="activity-type-checkbox" style="margin-right: 5px;">
                                <span>🏃 Run</span>
                            </label>
                            <label style="display: flex; align-items: center; cursor: pointer;">
                                <input type="checkbox" value="TrailRun" class="activity-type-checkbox" style="margin-right: 5px;">
                                <span>🏃‍♂️ Trail Run</span>
                            </label>
                            <label style="display: flex; align-items: center; cursor: pointer;">
                                <input type="checkbox" value="VirtualRun" class="activity-type-checkbox" style="margin-right: 5px;">
                                <span>🏃‍♀️ Virtual Run</span>
                            </label>
                            <label style="display: flex; align-items: center; cursor: pointer;">
                                <input type="checkbox" value="Hike" class="activity-type-checkbox" style="margin-right: 5px;">
                                <span>🥾 Hike</span>
                            </label>
                            <label style="display: flex; align-items: center; cursor: pointer;">
                                <input type="checkbox" value="Walk" class="activity-type-checkbox" style="margin-right: 5px;">
                                <span>🚶 Walk</span>
                            </label>
                            <label style="display: flex; align-items: center; cursor: pointer;">
                                <input type="checkbox" value="BackcountrySki" class="activity-type-checkbox" style="margin-right: 5px;">
                                <span>⛷️ Backcountry Ski</span>
                            </label>
                            <label style="display: flex; align-items: center; cursor: pointer;">
                                <input type="checkbox" value="NordicSki" class="activity-type-checkbox" style="margin-right: 5px;">
                                <span>⛷️ Nordic Ski</span>
                            </label>
                            <label style="display: flex; align-items: center; cursor: pointer;">
                                <input type="checkbox" value="Snowshoe" class="activity-type-checkbox" style="margin-right: 5px;">
                                <span>🥾 Snowshoe</span>
                            </label>
                            <label style="display: flex; align-items: center; cursor: pointer;">
                                <input type="checkbox" value="Handcycle" class="activity-type-checkbox" style="margin-right: 5px;">
                                <span>🚴 Handcycle</span>
                            </label>
                            <label style="display: flex; align-items: center; cursor: pointer;">
                                <input type="checkbox" value="Wheelchair" class="activity-type-checkbox" style="margin-right: 5px;">
                                <span>♿ Wheelchair</span>
                            </label>
                            <label style="display: flex; align-items: center; cursor: pointer;">
                                <input type="checkbox" value="Velomobile" class="activity-type-checkbox" style="margin-right: 5px;">
                                <span>🚴 Velomobile</span>
                            </label>
                        </div>
                        <div style="margin-top: 10px;">
                            <button class="btn btn-sm btn-secondary" onclick="window.stravaAuth.toggleAllActivityTypes(true)">
                                Select All
                            </button>
                            <button class="btn btn-sm btn-secondary" onclick="window.stravaAuth.toggleAllActivityTypes(false)" style="margin-left: 5px;">
                                Deselect All
                            </button>
                        </div>
                    </div>
                    
                    <div id="bulk-import-progress" style="display: none; margin: 20px 0; padding: 15px; background: #f5f5f5; border-radius: 5px;">
                        <div style="font-weight: bold; margin-bottom: 5px;">Import Progress</div>
                        <div id="bulk-import-status">Preparing...</div>
                        <div style="width: 100%; height: 20px; background: #ddd; border-radius: 10px; margin-top: 10px; overflow: hidden;">
                            <div id="bulk-import-progress-bar" style="width: 0%; height: 100%; background: #4CAF50; transition: width 0.3s;"></div>
                        </div>
                    </div>
                </div>
                <div class="privacy-modal-actions">
                    <button class="btn btn-secondary" onclick="window.stravaAuth.closeBulkImportModal()">
                        Cancel
                    </button>
                    <button class="btn btn-primary" id="start-bulk-import-btn" onclick="window.stravaAuth.startBulkImport()">
                        📦 Start Import
                    </button>
                </div>
            </div>
        `;
        
        // Close when clicking outside
        modal.addEventListener('click', (e) => {
            if (e.target === modal) {
                this.closeBulkImportModal();
            }
        });
        
        document.body.appendChild(modal);
        return modal;
    }
    
    // Close the bulk import modal
    closeBulkImportModal() {
        const modal = document.getElementById('bulk-import-modal');
        if (modal) {
            modal.style.display = 'none';
        }
    }
    
    // Toggle all activity types
    toggleAllActivityTypes(checked) {
        const checkboxes = document.querySelectorAll('.activity-type-checkbox');
        checkboxes.forEach(checkbox => {
            checkbox.checked = checked;
        });
    }
    
    // Start bulk import
    async startBulkImport() {
        const startDateInput = document.getElementById('bulk-start-date');
        const endDateInput = document.getElementById('bulk-end-date');
        const progressDiv = document.getElementById('bulk-import-progress');
        const statusDiv = document.getElementById('bulk-import-status');
        const progressBar = document.getElementById('bulk-import-progress-bar');
        const startBtn = document.getElementById('start-bulk-import-btn');
        
        if (!startDateInput || !endDateInput) {
            this.showNotification('Invalid date inputs', 'error');
            return;
        }
        
        const startDate = startDateInput.value;
        const endDate = endDateInput.value;
        
        if (!startDate || !endDate) {
            this.showNotification('Please select both start and end dates', 'error');
            return;
        }
        
        // Get selected activity types
        const selectedTypes = Array.from(document.querySelectorAll('.activity-type-checkbox:checked'))
            .map(checkbox => checkbox.value);
        
        if (selectedTypes.length === 0) {
            this.showNotification('Please select at least one activity type', 'error');
            return;
        }
        
        try {
            // Show progress UI
            progressDiv.style.display = 'block';
            startBtn.disabled = true;
            startBtn.style.opacity = '0.5';
            statusDiv.textContent = 'Gathering existing routes...';
            progressBar.style.width = '5%';
            
            // Get existing Strava route IDs from storage to skip re-importing
            const existingIds = window.fileUploader?.uploadedRoutes
                .filter(route => route.id && route.id.startsWith('strava_'))
                .map(route => route.id) || [];
            
            console.log(`📦 Starting bulk import from ${startDate} to ${endDate}`);
            console.log(`🎯 Activity types: ${selectedTypes.join(', ')}`);
            console.log(`⏭️  Will skip ${existingIds.length} already-imported routes`);
            
            statusDiv.textContent = 'Fetching activities from Strava...';
            progressBar.style.width = '10%';
            
            // Call the worker bulk import endpoint with existing IDs
            const response = await fetch(`${this.workerBaseUrl}/api/strava/bulk-import`, {
                method: 'POST',
                credentials: 'include',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    startDate,
                    endDate,
                    activityTypes: selectedTypes,
                    existingIds: existingIds
                })
            });
            
            if (!response.ok) {
                throw new Error(`Bulk import failed: ${response.status}`);
            }
            
            progressBar.style.width = '50%';
            statusDiv.textContent = 'Processing activities...';
            
            const result = await response.json();
            
            progressBar.style.width = '75%';
            statusDiv.textContent = 'Adding routes to your collection...';
            
            console.log(`✅ Bulk import complete: ${result.routes.length} routes imported`);
            
            // Add all routes to the file uploader
            if (window.fileUploader && result.routes.length > 0) {

                const routeList = result.routes.map(r => ({
                    ...r,
                    id: r.id || window.fileUploader.generateRouteId(),
                    startTime: r.startTime ? new Date(r.startTime) : null,
                }));

                // Save all new routes
                await window.fileUploader?.storageManager?.saveRoutes(routeList);
                
                console.log(`💾 Saved ${routeList.length} routes to IndexedDB`);
                
                // Reload all routes from storage to ensure consistency
                const allRoutes = await window.fileUploader?.storageManager?.loadRoutes();
                window.fileUploader.uploadedRoutes = allRoutes;
                
                // Auto-select newly imported/updated routes for display
                if (!window.fileUploader.isShowingAggregated) {
                    routeList.forEach(route => {
                        window.fileUploader.selectedRoutes.add(route.id);
                    });
                }
                
                console.log(`✅ Reloaded ${allRoutes.length} total routes from storage`);
                
                // Trigger single UI update for all routes
                window.fileUploader.notifyStateChange('selected-routes-changed', { 
                    reason: 'bulk-import-complete',
                    count: routeList.length
                });
                
                progressBar.style.width = '100%';
                statusDiv.textContent = `Complete! Imported ${routeList.length} activities.`;
                
                // Show comprehensive summary
                let summaryMessage = `✅ Imported ${routeList.length} activities`;
                
                if (result.skipped && result.skipped.length > 0) {
                    summaryMessage += `\n⏭️  ${result.skipped.length} already imported (skipped)`;
                }
                
                if (result.errors.length > 0) {
                    summaryMessage += `\n⚠️ ${result.errors.length} failed to import`;
                }
                this.showNotification(summaryMessage, 'success', 5000);
                
                // Close modal after a delay
                setTimeout(() => {
                    this.closeBulkImportModal();
                    this.closeActivitiesModal();
                }, 2000);
            } else {
                statusDiv.textContent = 'No activities found in date range.';
                this.showNotification('No activities found matching your criteria', 'info');
            }
            
        } catch (error) {
            console.error('❌ Bulk import error:', error);
            statusDiv.textContent = `Error: ${error.message}`;
            progressBar.style.background = '#f44336';
            this.showNotification(`Bulk import failed: ${error.message}`, 'error');
        } finally {
            startBtn.disabled = false;
            startBtn.style.opacity = '1';
        }
    }

    // --- Segment Import Methods ---

    // Show segment import dialog
    showSegmentImportDialog() {
        console.log('🏔️ Opening segment import dialog...');

        let modal = document.getElementById('segment-import-modal');
        if (!modal) {
            modal = this.createSegmentImportModal();
        }

        modal.style.display = 'flex';
    }

    // Create segment import modal
    createSegmentImportModal() {
        const modal = document.createElement('div');
        modal.id = 'segment-import-modal';
        modal.className = 'privacy-modal-overlay';
        modal.style.display = 'none';

        modal.innerHTML = `
            <div class="privacy-modal" style="max-width: 600px;">
                <div class="privacy-modal-header">
                    <h2>🏔️ Import Segment</h2>
                    <button class="modal-close" onclick="window.stravaAuth.closeSegmentImportModal()">×</button>
                </div>
                <div class="privacy-modal-content">
                    <p>Import a Strava segment by ID or URL, or select from your activities.</p>

                    <div style="margin: 20px 0;">
                        <h3 style="margin-bottom: 10px;">Option 1: Direct Import</h3>
                        <label style="display: block; margin-bottom: 5px; font-weight: bold;">
                            Segment URL or ID:
                        </label>
                        <input type="text"
                               id="segment-id-input"
                               placeholder="https://www.strava.com/segments/12345678 or 12345678"
                               style="width: 100%; padding: 10px; border: 1px solid #ddd; border-radius: 4px; margin-bottom: 10px;">
                        <button class="btn btn-primary" onclick="window.stravaAuth.importSegmentById()">
                            📥 Import Segment
                        </button>
                    </div>

                    <div style="margin: 30px 0; border-top: 1px solid #ddd; padding-top: 20px;">
                        <h3 style="margin-bottom: 10px;">Option 2: From Activity</h3>
                        <button class="btn btn-secondary" onclick="window.stravaAuth.showActivitySegmentsDialog()" style="width: 100%;">
                            📊 Browse Activity Segments
                        </button>
                    </div>
                </div>
                <div class="privacy-modal-actions">
                    <button class="btn btn-secondary" onclick="window.stravaAuth.closeSegmentImportModal()">
                        Close
                    </button>
                </div>
            </div>
        `;

        modal.addEventListener('click', (e) => {
            if (e.target === modal) {
                this.closeSegmentImportModal();
            }
        });

        document.body.appendChild(modal);
        return modal;
    }

    closeSegmentImportModal() {
        const modal = document.getElementById('segment-import-modal');
        if (modal) {
            modal.style.display = 'none';
        }
    }

    // Parse segment ID from URL or direct ID
    parseSegmentId(input) {
        if (!input || typeof input !== 'string') {
            return null;
        }

        const trimmed = input.trim();

        // Direct ID (numbers only)
        if (/^\d+$/.test(trimmed)) {
            return trimmed;
        }

        // Full URL patterns (case-insensitive)
        const urlPatterns = [
            /strava\.com\/segments\/(\d+)/i,
            /strava\.com\/segments\/explore\/(\d+)/i,
        ];

        for (const pattern of urlPatterns) {
            const match = trimmed.match(pattern);
            if (match && match[1]) {
                return match[1];
            }
        }

        return null;
    }

    // Import segment by ID/URL
    async importSegmentById() {
        const input = document.getElementById('segment-id-input');
        if (!input) return;

        const inputValue = input.value;
        const segmentId = this.parseSegmentId(inputValue);

        if (!segmentId) {
            this.showNotification('Invalid segment URL or ID', 'error');
            return;
        }

        try {
            console.log(`📥 Importing segment ${segmentId}...`);
            this.showNotification('⏳ Importing segment from Strava...', 'info', 2000);

            const route = await this.callStravaAPI(`/import-segment/${segmentId}`);

            // Add to file uploader
            if (window.fileUploader) {
                window.fileUploader.addRoute(route);
                await window.fileUploader.saveRoutesToStorage();

                console.log('✅ Segment imported successfully');
                this.showNotification(`✅ Imported: ${route.name}`, 'success');

                this.closeSegmentImportModal();
                window.fileUploader.hideLoadingState();
            }

        } catch (error) {
            console.error('❌ Error importing segment:', error);
            this.showNotification(`❌ ${error.message}`, 'error');
        }
    }

    // Add segment import button to authenticated features
    addSegmentImportButton() {
        const uploadActions = document.getElementById('upload-actions');
        if (uploadActions && !document.getElementById('segment-import-btn')) {
            const segmentBtn = document.createElement('button');
            segmentBtn.id = 'segment-import-btn';
            segmentBtn.className = 'btn btn-primary';
            segmentBtn.onclick = () => this.showSegmentImportDialog();
            segmentBtn.innerHTML = '🏔️ Import Segment';

            // Insert after Strava import button
            const stravaImportBtn = document.getElementById('strava-import-btn');
            if (stravaImportBtn && stravaImportBtn.parentNode) {
                stravaImportBtn.parentNode.insertBefore(segmentBtn, stravaImportBtn.nextSibling);
            }
        }
    }

    // Show activity segments dialog
    async showActivitySegmentsDialog() {
        try {
            console.log('📊 Fetching recent activities for segment selection...');
            this.showNotification('⏳ Loading activities...', 'info', 2000);

            const activities = await this.getRecentActivities();

            let modal = document.getElementById('activity-segments-modal');
            if (!modal) {
                modal = this.createActivitySegmentsModal();
            }

            const modalContent = modal.querySelector('.activity-segments-content');
            if (modalContent) {
                const distanceMeters = (activity) => Number(activity.distance) || 0;
                const distanceDisplay = (activity) => unitPreferences.formatDistance(distanceMeters(activity) / 1000);

                const activitiesHTML = activities.map(activity => `
                    <div class="activity-item" style="border: 1px solid #ddd; padding: 10px; margin: 5px 0; border-radius: 5px; background: white;">
                        <strong>${activity.name}</strong>
                        <br>
                        <small>${activity.sport_type || activity.type} • ${distanceDisplay(activity)} • ${activity.start_date_local}</small>
                        <br>
                        <button class="btn btn-sm btn-primary" onclick="window.stravaAuth.showSegmentsForActivity('${activity.id}')" style="margin-top: 5px;">
                            🏔️ View Segments
                        </button>
                    </div>
                `).join('');

                modalContent.innerHTML = `
                    <h3>📊 Select Activity</h3>
                    <div class="activities-list" style="max-height: 400px; overflow-y: auto; margin: 15px 0;">
                        ${activitiesHTML}
                    </div>
                `;
            }

            modal.style.display = 'flex';

        } catch (error) {
            console.error('❌ Error loading activities:', error);
            this.showNotification(`❌ ${error.message}`, 'error');
        }
    }

    createActivitySegmentsModal() {
        const modal = document.createElement('div');
        modal.id = 'activity-segments-modal';
        modal.className = 'privacy-modal-overlay';
        modal.style.display = 'none';

        modal.innerHTML = `
            <div class="privacy-modal" style="max-width: 600px;">
                <div class="privacy-modal-header">
                    <h2>📊 Activity Segments</h2>
                    <button class="modal-close" onclick="window.stravaAuth.closeActivitySegmentsModal()">×</button>
                </div>
                <div class="activity-segments-content privacy-modal-content">
                    <!-- Content will be inserted here -->
                </div>
                <div class="privacy-modal-actions">
                    <button class="btn btn-secondary" onclick="window.stravaAuth.closeActivitySegmentsModal()">
                        Close
                    </button>
                </div>
            </div>
        `;

        modal.addEventListener('click', (e) => {
            if (e.target === modal) {
                this.closeActivitySegmentsModal();
            }
        });

        document.body.appendChild(modal);
        return modal;
    }

    closeActivitySegmentsModal() {
        const modal = document.getElementById('activity-segments-modal');
        if (modal) {
            modal.style.display = 'none';
        }
    }

    // Show segments for a specific activity
    async showSegmentsForActivity(activityId) {
        try {
            console.log(`📊 Fetching segments for activity ${activityId}...`);
            this.showNotification('⏳ Loading segments...', 'info', 2000);

            const activity = await this.callStravaAPI(`/activities/${activityId}`);

            if (!activity.segment_efforts || activity.segment_efforts.length === 0) {
                this.showNotification('No segments found for this activity', 'info');
                return;
            }

            // Sort segments by priority: KOM → Top 10 → PR → Others
            const sortedSegments = this.prioritizeSegments(activity.segment_efforts);

            const modal = document.getElementById('activity-segments-modal');
            const modalContent = modal.querySelector('.activity-segments-content');

            if (modalContent) {
                const segmentsHTML = sortedSegments.map(effort => {
                    const segment = effort.segment;
                    const badges = this.getSegmentBadges(effort);
                    const distanceKm = (segment.distance / 1000).toFixed(2);
                    const distanceDisplay = unitPreferences.formatDistance(parseFloat(distanceKm));

                    return `
                        <div class="segment-item" style="border: 1px solid #ddd; padding: 10px; margin: 5px 0; border-radius: 5px; background: white;">
                            <div style="display: flex; justify-content: space-between; align-items: start;">
                                <div style="flex: 1;">
                                    <strong>${segment.name}</strong> ${badges}
                                    <br>
                                    <small>
                                        ${distanceDisplay} •
                                        ${segment.average_grade.toFixed(1)}% avg •
                                        ${segment.maximum_grade.toFixed(1)}% max
                                    </small>
                                </div>
                                <button class="btn btn-sm btn-primary"
                                        onclick="window.stravaAuth.importSegmentFromActivity('${segment.id}')"
                                        style="margin-left: 10px; white-space: nowrap;">
                                    📥 Import
                                </button>
                            </div>
                        </div>
                    `;
                }).join('');

                modalContent.innerHTML = `
                    <h3>🏔️ Segments from "${activity.name}"</h3>
                    <div class="segments-list" style="max-height: 400px; overflow-y: auto; margin: 15px 0;">
                        ${segmentsHTML}
                    </div>
                    <button class="btn btn-secondary" onclick="window.stravaAuth.showActivitySegmentsDialog()" style="width: 100%; margin-top: 10px;">
                        ← Back to Activities
                    </button>
                `;
            }

        } catch (error) {
            console.error('❌ Error loading segments:', error);
            this.showNotification(`❌ ${error.message}`, 'error');
        }
    }

    // Prioritize segments: KOM → Top 10 → PR → Others
    prioritizeSegments(segmentEfforts) {
        const koms = [];
        const topTens = [];
        const prs = [];
        const others = [];

        for (const effort of segmentEfforts) {
            if (effort.kom_rank === 1) {
                koms.push(effort);
            } else if (effort.kom_rank && effort.kom_rank <= 10) {
                topTens.push(effort);
            } else if (effort.pr_rank) {
                prs.push(effort);
            } else {
                others.push(effort);
            }
        }

        // Sort within each group by rank
        topTens.sort((a, b) => a.kom_rank - b.kom_rank);
        prs.sort((a, b) => a.pr_rank - b.pr_rank);

        return [...koms, ...topTens, ...prs, ...others];
    }

    // Get badge HTML for segment achievements
    getSegmentBadges(effort) {
        const badges = [];

        if (effort.kom_rank === 1) {
            badges.push('<span style="background: gold; color: black; padding: 2px 6px; border-radius: 3px; font-size: 11px; margin-left: 5px;">👑 KOM</span>');
        } else if (effort.kom_rank && effort.kom_rank <= 10) {
            badges.push(`<span style="background: silver; color: black; padding: 2px 6px; border-radius: 3px; font-size: 11px; margin-left: 5px;">🏆 Top ${effort.kom_rank}</span>`);
        }

        if (effort.pr_rank) {
            badges.push(`<span style="background: #4CAF50; color: white; padding: 2px 6px; border-radius: 3px; font-size: 11px; margin-left: 5px;">⭐ PR #${effort.pr_rank}</span>`);
        }

        return badges.join('');
    }

    // Import segment from activity context
    async importSegmentFromActivity(segmentId) {
        try {
            console.log(`📥 Importing segment ${segmentId} from activity...`);
            this.showNotification('⏳ Importing segment...', 'info', 2000);

            const route = await this.callStravaAPI(`/import-segment/${segmentId}`);

            if (window.fileUploader) {
                window.fileUploader.addRoute(route);
                await window.fileUploader.saveRoutesToStorage();

                console.log('✅ Segment imported successfully');
                this.showNotification(`✅ Imported: ${route.name}`, 'success');

                this.closeActivitySegmentsModal();
                this.closeSegmentImportModal();
                window.fileUploader.hideLoadingState();
            }

        } catch (error) {
            console.error('❌ Error importing segment:', error);
            this.showNotification(`❌ ${error.message}`, 'error');
        }
    }
}

export default StravaAuth;
