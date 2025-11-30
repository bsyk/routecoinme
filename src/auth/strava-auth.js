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
                alert('Authentication failed. Please try again.');
                window.history.replaceState({}, document.title, '/');
            }
        } catch (error) {
            console.error('❌ Auth callback error:', error);
            alert('Authentication error. Please try again.');
            window.history.replaceState({}, document.title, '/');
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
    async getActivities(options = {}) {
        const params = new URLSearchParams();
        if (options.page) params.append('page', options.page);
        if (options.per_page) params.append('per_page', options.per_page);
        if (options.before) params.append('before', options.before);
        if (options.after) params.append('after', options.after);

        const endpoint = `/activities${params.toString() ? '?' + params.toString() : ''}`;
        return this.callStravaAPI(endpoint);
    }

    async getActivity(activityId) {
        return this.callStravaAPI(`/activity/${activityId}`);
    }

    async getActivityStreams(activityId, streamTypes = ['latlng', 'altitude', 'time']) {
        const params = new URLSearchParams();
        params.append('keys', streamTypes.join(','));
        params.append('key_by_type', 'true');

        return this.callStravaAPI(`/streams/${activityId}?${params.toString()}`);
    }

    async getAthlete() {
        return this.callStravaAPI('/athlete');
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
        const demoArea = document.querySelector('.demo-placeholder');
        if (demoArea) {
            demoArea.innerHTML = `
                <h3>🎉 Connected to Strava!</h3>
                <p>You're now authenticated and ready to fetch your activities.</p>
                <div class="auth-features">
                    <button class="btn btn-primary" onclick="window.stravaAuth.fetchActivities()">
                        📊 Fetch Recent Activities
                    </button>
                    <button class="btn btn-success" onclick="window.stravaAuth.showImportDialog()">
                        📥 Import Activities
                    </button>
                    <button class="btn btn-secondary" onclick="window.stravaAuth.showSettings()">
                        ⚙️ Settings
                    </button>
                </div>
            `;
        }
    }

    // Fetch user activities
    async fetchActivities() {
        console.log('📊 Fetching Strava activities...');
        
        try {
            const activities = await this.getActivities({ per_page: 10 });
            console.log(`✅ Fetched ${activities.length} activities`);
            this.showActivitiesList(activities);
        } catch (error) {
            console.error('❌ Error fetching activities:', error);
            if (error.message.includes('Authentication required')) {
                this.authenticate();
            } else {
                alert(`Failed to fetch activities: ${error.message}`);
            }
        }
    }

    // Show activities list in UI
    showActivitiesList(activities) {
        const demoArea = document.querySelector('.demo-placeholder');
        if (demoArea) {
            const activitiesHTML = activities.map(activity => `
                <div class="activity-item" style="border: 1px solid #ddd; padding: 10px; margin: 5px 0; border-radius: 5px;">
                    <strong>${activity.name}</strong>
                    <br>
                    <small>${activity.type} • ${(activity.distance / 1000).toFixed(1)}km • ${activity.start_date_local}</small>
                    <br>
                    <button class="btn btn-sm btn-primary" onclick="window.stravaAuth.importActivity('${activity.id}')">
                        📥 Import
                    </button>
                </div>
            `).join('');

            demoArea.innerHTML = `
                <h3>📊 Recent Strava Activities</h3>
                <div class="activities-list" style="max-height: 400px; overflow-y: auto;">
                    ${activitiesHTML}
                </div>
                <div class="activities-actions">
                    <button class="btn btn-secondary" onclick="window.stravaAuth.showAuthenticatedFeatures()">
                        ← Back to Dashboard
                    </button>
                </div>
            `;
        }
    }

    // Import a single activity
    async importActivity(activityId) {
        try {
            console.log(`📥 Importing activity ${activityId}...`);
            
            // Get activity details and streams
            const [activity, streams] = await Promise.all([
                this.getActivity(activityId),
                this.getActivityStreams(activityId)
            ]);

            // Convert to route format
            const route = this.convertActivityToRoute(activity, streams);
            
            // Add to file uploader
            if (window.fileUploader) {
                window.fileUploader.addRoute(route);
                console.log('✅ Activity imported successfully');
                alert(`Successfully imported: ${route.name}`);
            } else {
                console.error('❌ File uploader not available');
                alert('Error: File uploader not available');
            }
            
        } catch (error) {
            console.error('❌ Error importing activity:', error);
            alert(`Failed to import activity: ${error.message}`);
        }
    }

    // Convert Strava activity to route format
    convertActivityToRoute(activity, streams) {
        const { latlng, altitude, time } = streams;
        
        if (!latlng || !latlng.data) {
            throw new Error('No GPS data available for this activity');
        }

        const points = latlng.data.map((coord, index) => ({
            lat: coord[0],
            lon: coord[1],
            elevation: altitude?.data ? altitude.data[index] || 0 : 0,
            timestamp: time?.data ? new Date(activity.start_date).getTime() + (time.data[index] * 1000) : null
        }));

        return {
            id: `strava_${activity.id}`,
            filename: `${activity.name}.gpx`,
            name: activity.name,
            type: activity.type,
            points: points,
            distance: activity.distance,
            elevationGain: activity.total_elevation_gain || 0,
            duration: activity.elapsed_time,
            startTime: new Date(activity.start_date),
            source: 'strava',
            metadata: {
                stravaId: activity.id,
                imported: new Date().toISOString()
            }
        };
    }

    // Show import dialog
    showImportDialog() {
        alert('Bulk import dialog coming soon!\n\nThis will allow you to:\n- Select multiple activities\n- Filter by date range\n- Choose activity types');
    }

    // Show settings
    showSettings() {
        alert('Settings panel coming soon!\n\nThis will include:\n- Privacy preferences\n- Data storage options\n- Export settings');
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
}

export default StravaAuth;
