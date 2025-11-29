// Configuration for RouteCoinMe
export const config = {
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
        mockData: false  // Use real data by default
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
