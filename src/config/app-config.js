// Configuration for RouteCoinMe
export const config = {
    // Strava API Configuration
    strava: {
        // You'll need to set your actual Strava Client ID here
        // Get this from: https://www.strava.com/settings/api
        clientId: '46871',
        
        // Scopes we need for the application
        scopes: [
            'read',              // Read public profile info
            'activity:read_all'   // Read all activities (including private)
        ]
    },
    
    // Application settings
    app: {
        name: 'RouteCoinMe',
        version: '1.0.0',
        description: 'GPS route aggregation and 3D visualization'
    },
    
    // Development settings
    development: {
        apiBaseUrl: 'http://localhost:3000',
        enableLogging: true,
        mockData: true  // Use mock data when true
    }
};

// Environment detection
export const isDevelopment = () => {
    return window.location.hostname === 'localhost' || 
           window.location.hostname === '127.0.0.1';
};

// Get appropriate API base URL
export const getApiBaseUrl = () => {
    return window.location.origin;
};
