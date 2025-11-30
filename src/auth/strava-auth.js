// Strava OAuth Authentication Client
// Works with Cloudflare Worker for server-side OAuth flow
// All credentials (client ID & secret) are stored server-side in worker env vars
// Uses HTTP-only cookies for secure token storage

class StravaAuth {
    constructor() {
        this.workerBaseUrl = window.location.origin; // Path-based API routing
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
                
                // Store non-sensitive data in localStorage for UI state
                localStorage.setItem('rcm_was_authenticated', 'true');
                if (authData.athlete) {
                    localStorage.setItem('rcm_athlete_info', JSON.stringify(authData.athlete));
                }

                console.log('✅ Strava authentication successful');
                
                // Clean up URL and reload
                window.history.replaceState({}, document.title, '/');
                window.location.reload();
            } else {
                console.error('❌ Authentication failed');
                window.history.replaceState({}, document.title, '/');
                this.showNotification('Authentication failed. Please try again.', 'error');
            }
        } catch (error) {
            console.error('❌ Auth callback error:', error);
            window.history.replaceState({}, document.title, '/');
            this.showNotification('Authentication error. Please try again.', 'error');
        }
    }

    // Check if user is authenticated by querying the worker
    async isAuthenticated() {
        try {
            const response = await fetch(`${this.workerBaseUrl}/api/auth/status`, {
                credentials: 'include'
            });
            return response.ok;
        } catch (error) {
            console.warn('⚠️ Auth check failed:', error);
            return false;
        }
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
        return localStorage.getItem('rcm_was_authenticated') === 'true';
    }

    // Check for existing authentication on page load
    async checkExistingAuth() {
        const isAuthenticated = await this.isAuthenticated();
        const athlete = this.getAthleteInfo();

        if (isAuthenticated && athlete) {
            console.log('✅ User already authenticated:', athlete);
            this.updateUIForAuthenticatedState(athlete);
        } else {
            console.log('ℹ️ User not authenticated');
            if (this.wasPreviouslyAuthenticated()) {
                console.log('💡 User was previously authenticated but session expired');
            }
            this.updateUIForUnauthenticatedState();
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
                throw new Error(`API call failed: ${response.status}`);
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
        
        // If no routes are loaded, show the Strava dashboard in the demo area
        if (window.fileUploader && window.fileUploader.uploadedRoutes.length === 0) {
            const demoArea = document.querySelector('.demo-placeholder');
            if (demoArea && demoArea.querySelector('.landing-state')) {
                demoArea.innerHTML = `
                    <div class="landing-state">
                        <h3>🎉 Connected to Strava!</h3>
                        <p>Import activities from Strava or upload GPX files to get started.</p>
                        <div class="landing-actions">
                            <button class="btn btn-primary" onclick="window.stravaAuth.fetchActivities()">
                                📊 Browse Strava Activities
                            </button>
                            <button class="btn btn-secondary" onclick="window.fileUploader?.showFileUploadUI()">
                                � Upload GPX Files
                            </button>
                        </div>
                    </div>
                `;
            }
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
        // Create or update the Strava activities modal
        let modal = document.getElementById('strava-activities-modal');
        if (!modal) {
            modal = this.createStravaActivitiesModal();
        }
        
        const activitiesHTML = activities.map(activity => `
            <div class="activity-item" style="border: 1px solid #ddd; padding: 10px; margin: 5px 0; border-radius: 5px; background: white;">
                <strong>${activity.name}</strong>
                <br>
                <small>${activity.type} • ${(activity.distance / 1000).toFixed(1)}km • ${activity.start_date_local}</small>
                <br>
                <button class="btn btn-sm btn-primary import-activity-btn" onclick="window.stravaAuth.importActivity('${activity.id}')" style="margin-top: 5px; transition: all 0.3s ease;">
                    📥 Import
                </button>
            </div>
        `).join('');

        const modalContent = modal.querySelector('.strava-modal-content');
        if (modalContent) {
            modalContent.innerHTML = `
                <h3>📊 Recent Strava Activities</h3>
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
                window.fileUploader.addRoute(route);
                
                // Save to IndexedDB storage
                await window.fileUploader.saveRoutesToStorage();
                
                console.log('✅ Activity imported and saved successfully');
                
                // Close the modal if open
                this.closeActivitiesModal();
                
                // Show success notification
                this.showNotification(`✅ Imported: ${route.name}`, 'success');
            } else {
                console.error('❌ File uploader not available');
                this.showNotification('Error: File uploader not available', 'error');
                
                // Re-enable all buttons on error
                this.reEnableImportButtons(allImportButtons, importBtn, originalButtonHTML);
            }
            
        } catch (error) {
            console.error('❌ Error importing activity:', error);
            this.showNotification(`Failed to import activity: ${error.message}`, 'error');
            
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
        localStorage.removeItem('rcm_was_authenticated');
        localStorage.removeItem('rcm_athlete_info');
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
}

export default StravaAuth;
