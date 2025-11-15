// Strava OAuth Configuration and Management
class StravaAuth {
    constructor() {
        this.clientId = null;
        this.redirectUri = `${window.location.origin}/auth/callback`;
        this.scope = 'read,activity:read_all';
        this.init();
    }

    init() {
        // Check if we're returning from OAuth callback
        if (window.location.pathname === '/auth/callback') {
            this.handleCallback();
            return;
        }

        // Check for existing token
        this.checkExistingAuth();
    }

    setClientId(clientId) {
        this.clientId = clientId;
    }

    // Start the OAuth flow
    authenticate() {
        if (!this.clientId) {
            console.error('Strava Client ID not set. Please configure your Strava app credentials.');
            alert('Strava Client ID not configured. Please check the console for setup instructions.');
            return;
        }

        const authUrl = new URL('https://www.strava.com/oauth/authorize');
        authUrl.searchParams.set('client_id', this.clientId);
        authUrl.searchParams.set('redirect_uri', this.redirectUri);
        authUrl.searchParams.set('response_type', 'code');
        authUrl.searchParams.set('approval_prompt', 'auto');
        authUrl.searchParams.set('scope', this.scope);

        console.log('🔐 Redirecting to Strava for authentication...');
        window.location.href = authUrl.toString();
    }

    // Handle the OAuth callback
    async handleCallback() {
        const urlParams = new URLSearchParams(window.location.search);
        const code = urlParams.get('code');
        const error = urlParams.get('error');

        if (error) {
            console.error('Strava OAuth error:', error);
            alert('Authentication failed. Please try again.');
            window.history.replaceState({}, document.title, '/');
            return;
        }

        if (!code) {
            console.error('No authorization code received');
            window.history.replaceState({}, document.title, '/');
            return;
        }

        try {
            console.log('🔄 Exchanging authorization code for access token...');
            await this.exchangeCodeForToken(code);
            
            // Redirect back to main app
            window.history.replaceState({}, document.title, '/');
            window.location.reload();
        } catch (error) {
            console.error('Token exchange failed:', error);
            alert('Authentication failed during token exchange. Please try again.');
            window.history.replaceState({}, document.title, '/');
        }
    }

    // Exchange authorization code for access token
    async exchangeCodeForToken(code) {
        // For now, we'll store this temporarily
        // In a real app, this would go through your backend
        console.log('📝 Authorization code received:', code);
        
        // Simulate token storage (replace with actual API call to your backend)
        const mockTokenData = {
            access_token: 'mock_access_token_' + Date.now(),
            refresh_token: 'mock_refresh_token_' + Date.now(),
            expires_at: Date.now() + (6 * 60 * 60 * 1000), // 6 hours from now
            athlete: {
                id: 'mock_athlete_id',
                firstname: 'Demo',
                lastname: 'User'
            }
        };

        this.storeTokens(mockTokenData);
        console.log('✅ Authentication successful!');
    }

    // Store tokens securely
    storeTokens(tokenData) {
        // Encrypt tokens before storing (implement proper encryption in production)
        localStorage.setItem('strava_tokens', JSON.stringify(tokenData));
        localStorage.setItem('strava_auth_time', Date.now().toString());
    }

    // Get stored tokens
    getStoredTokens() {
        const tokens = localStorage.getItem('strava_tokens');
        return tokens ? JSON.parse(tokens) : null;
    }

    // Check if user is authenticated
    isAuthenticated() {
        const tokens = this.getStoredTokens();
        if (!tokens) return false;

        // Check if token is expired
        if (Date.now() >= tokens.expires_at) {
            this.clearTokens();
            return false;
        }

        return true;
    }

    // Get current athlete info
    getAthleteInfo() {
        const tokens = this.getStoredTokens();
        return tokens ? tokens.athlete : null;
    }

    // Check for existing authentication on page load
    checkExistingAuth() {
        if (this.isAuthenticated()) {
            const athlete = this.getAthleteInfo();
            console.log('✅ User already authenticated:', athlete);
            this.updateUIForAuthenticatedState(athlete);
        } else {
            console.log('ℹ️ User not authenticated');
            this.updateUIForUnauthenticatedState();
        }
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

        // Show authenticated features
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
            - View Activities (coming soon)
            - Logout
        `;
        
        if (confirm(menu + '\n\nClick OK to logout, Cancel to continue')) {
            this.logout();
        }
    }

    // Show features available to authenticated users
    showAuthenticatedFeatures() {
        console.log('🎉 Showing authenticated features...');
        // Update demo area with authenticated content
        const demoArea = document.querySelector('.demo-placeholder');
        if (demoArea) {
            demoArea.innerHTML = `
                <h3>🎉 Connected to Strava!</h3>
                <p>You're now authenticated and ready to fetch your activities.</p>
                <div class="auth-features">
                    <button class="btn btn-primary" onclick="window.stravaAuth.fetchActivities()">
                        📊 Fetch Activities
                    </button>
                    <button class="btn btn-secondary" onclick="window.stravaAuth.showSettings()">
                        ⚙️ Settings
                    </button>
                </div>
            `;
        }
    }

    // Fetch user activities (placeholder)
    async fetchActivities() {
        console.log('📊 Fetching Strava activities...');
        alert('Activity fetching will be implemented in the next phase!\n\nThis will integrate with the Strava API to fetch your GPX data.');
    }

    // Show settings (placeholder)
    showSettings() {
        alert('Settings panel coming soon!\n\nThis will include:\n- Privacy preferences\n- Data storage options\n- Export settings');
    }

    // Logout user
    logout() {
        console.log('👋 Logging out...');
        this.clearTokens();
        window.location.reload();
    }

    // Clear stored tokens
    clearTokens() {
        localStorage.removeItem('strava_tokens');
        localStorage.removeItem('strava_auth_time');
    }
}

export default StravaAuth;
