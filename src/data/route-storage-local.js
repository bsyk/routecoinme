// LocalStorage Storage Manager for RouteCoinMe
// Provides localStorage fallback for GPX routes with downsampling and compression

class RouteLocalStorageManager {
    constructor() {
        this.storageKey = 'routecoinme_gpx_routes';
        this.maxSizeKB = 4000; // 4MB localStorage limit
        this.maxPointsPerRoute = 1000; // Downsample to this many points
    }

    // Initialize localStorage (always available in browsers, just test access)
    async init() {
        try {
            console.log('📦 Initializing localStorage storage...');
            
            // Test localStorage availability
            localStorage.setItem('test', 'test');
            localStorage.removeItem('test');
            console.log('✅ LocalStorage is available');
            
            return Promise.resolve(true);
        } catch (error) {
            console.error('❌ LocalStorage initialization failed:', error);
            throw error;
        }
    }

    // Save a single route (compresses automatically)
    async saveRoute(route) {
        try {
            // Load existing routes
            const existingRoutes = await this.loadRoutes();
            
            // Replace if exists, or add if new
            const routeIndex = existingRoutes.findIndex(r => r.id === route.id);
            if (routeIndex >= 0) {
                existingRoutes[routeIndex] = route;
            } else {
                existingRoutes.push(route);
            }
            
            // Save all routes
            await this.saveRoutes(existingRoutes);
            
            console.log(`💾 Route saved to localStorage: ${route.filename}`);
            return route.id;
        } catch (error) {
            console.error('❌ Error saving route to localStorage:', error);
            throw error;
        }
    }

    // Save multiple routes (with compression and cleanup)
    async saveRoutes(routes) {
        try {
            console.log(`💾 Saving ${routes.length} routes to localStorage...`);
            
            // Create compressed version of route data for storage
            const compressedRoutes = routes.map(route => ({
                id: route.id,
                filename: route.filename,
                points: this.downsamplePoints(route.points, this.maxPointsPerRoute),
                distance: route.distance,
                elevationGain: route.elevationGain,
                elevationLoss: route.elevationLoss,
                duration: route.duration,
                uploadTime: route.uploadTime,
                // Store only essential metadata
                metadata: {
                    name: route.metadata?.name,
                    description: route.metadata?.description,
                    aggregationMode: route.metadata?.aggregationMode,
                    elevationMode: route.metadata?.elevationMode,
                    sourceRoutes: route.metadata?.sourceRoutes
                }
            }));
            
            const routeData = {
                routes: compressedRoutes,
                timestamp: Date.now()
            };
            
            // Check size and remove oldest routes if necessary
            let jsonString = JSON.stringify(routeData);
            let sizeKB = Math.round(jsonString.length / 1024);
            
            if (sizeKB > this.maxSizeKB) {
                console.warn(`⚠️ Data too large (${sizeKB}KB), removing oldest routes...`);
                
                // Sort by upload time (oldest first) and remove until under limit
                const sortedRoutes = [...compressedRoutes].sort((a, b) => a.uploadTime - b.uploadTime);
                while (sortedRoutes.length > 0) {
                    const testData = { routes: sortedRoutes, timestamp: Date.now() };
                    const testSize = Math.round(JSON.stringify(testData).length / 1024);
                    if (testSize <= this.maxSizeKB) break;
                    
                    const removed = sortedRoutes.shift();
                    console.log(`🗑️ Removed old route to free space: ${removed.filename}`);
                }
                
                routeData.routes = sortedRoutes;
                jsonString = JSON.stringify(routeData);
                sizeKB = Math.round(jsonString.length / 1024);
            }
            
            localStorage.setItem(this.storageKey, jsonString);
            
            const totalSizeKB = this.calculateRoutesSize(routeData.routes);
            console.log(`✅ Saved ${routeData.routes.length} routes to localStorage (~${totalSizeKB}KB total)`);
            
            return routeData.routes.map(r => r.id);
        } catch (error) {
            console.error('❌ Error saving routes to localStorage:', error);
            throw error;
        }
    }

    // Load all routes
    async loadRoutes() {
        try {
            console.log('🔍 Loading routes from localStorage...');
            
            const stored = localStorage.getItem(this.storageKey);
            
            if (!stored) {
                console.log('📭 No saved data found in localStorage');
                return [];
            }
            
            const data = JSON.parse(stored);
            const routes = data.routes || [];
            
            console.log(`📂 Loaded ${routes.length} routes from localStorage`);
            
            if (routes.length > 0) {
                const totalSizeKB = this.calculateRoutesSize(routes);
                console.log(`📊 Total data loaded: ~${totalSizeKB}KB`);
                console.log('📋 Routes loaded:', routes.map(r => r.filename));
            }
            
            return routes;
        } catch (error) {
            console.error('❌ Error loading routes from localStorage:', error);
            return [];
        }
    }

    // Delete a single route
    async deleteRoute(routeId) {
        try {
            const routes = await this.loadRoutes();
            const filteredRoutes = routes.filter(route => route.id !== routeId);
            
            if (filteredRoutes.length === routes.length) {
                console.warn(`⚠️ Route not found for deletion: ${routeId}`);
                return;
            }
            
            await this.saveRoutes(filteredRoutes);
            console.log(`🗑️ Route deleted from localStorage: ${routeId}`);
        } catch (error) {
            console.error('❌ Error deleting route from localStorage:', error);
            throw error;
        }
    }

    // Clear all routes
    async clearAllRoutes() {
        try {
            localStorage.removeItem(this.storageKey);
            console.log('🧹 All routes cleared from localStorage');
        } catch (error) {
            console.error('❌ Error clearing routes from localStorage:', error);
            throw error;
        }
    }

    // Get storage usage statistics
    async getStorageInfo() {
        try {
            const routes = await this.loadRoutes();
            const totalSizeKB = this.calculateRoutesSize(routes);
            const averageSizeKB = routes.length > 0 ? totalSizeKB / routes.length : 0;
            
            return {
                totalRoutes: routes.length,
                totalSizeKB: totalSizeKB,
                averageSizeKB: Math.round(averageSizeKB * 100) / 100,
                oldestRoute: routes.length > 0 ? 
                    routes.reduce((oldest, route) => 
                        route.uploadTime < oldest.uploadTime ? route : oldest
                    ) : null,
                newestRoute: routes.length > 0 ? 
                    routes.reduce((newest, route) => 
                        route.uploadTime > newest.uploadTime ? route : newest
                    ) : null
            };
        } catch (error) {
            console.error('❌ Error getting storage info from localStorage:', error);
            return {
                totalRoutes: 0,
                totalSizeKB: 0,
                averageSizeKB: 0,
                oldestRoute: null,
                newestRoute: null,
                error: error.message
            };
        }
    }

    // Calculate approximate size of routes in KB
    calculateRoutesSize(routes) {
        try {
            const jsonString = JSON.stringify(routes);
            return Math.round(jsonString.length / 1024);
        } catch (error) {
            console.warn('Failed to calculate routes size:', error);
            return 0;
        }
    }

    // Clean up old routes if storage gets too large
    async cleanupOldRoutes(maxSizeKB = this.maxSizeKB) {
        try {
            const routes = await this.loadRoutes();
            const currentSizeKB = this.calculateRoutesSize(routes);

            if (currentSizeKB <= maxSizeKB) {
                console.log(`💾 Storage size OK: ${currentSizeKB}KB / ${maxSizeKB}KB`);
                return routes;
            }

            console.log(`⚠️ Storage size exceeded: ${currentSizeKB}KB > ${maxSizeKB}KB, cleaning up...`);

            // Sort by upload time (oldest first) and remove until under limit
            const sortedRoutes = [...routes].sort((a, b) => a.uploadTime - b.uploadTime);
            
            while (sortedRoutes.length > 1) {
                const testSizeKB = this.calculateRoutesSize(sortedRoutes);
                if (testSizeKB <= maxSizeKB) break;
                
                const removedRoute = sortedRoutes.shift();
                console.log(`🗑️ Removed old route: ${removedRoute.filename}`);
            }

            await this.saveRoutes(sortedRoutes);
            
            const finalSizeKB = this.calculateRoutesSize(sortedRoutes);
            console.log(`✅ Cleanup complete: ${finalSizeKB}KB, kept ${sortedRoutes.length} routes`);
            
            return sortedRoutes;
        } catch (error) {
            console.error('❌ Error during cleanup:', error);
            throw error;
        }
    }

    // Downsample GPS points to reduce storage size
    downsamplePoints(points, maxPoints = this.maxPointsPerRoute) {
        if (!points || points.length <= maxPoints) {
            return points;
        }
        
        const step = Math.ceil(points.length / maxPoints);
        const downsampled = [];
        
        // Always keep first and last point
        downsampled.push(points[0]);
        
        // Sample points at regular intervals
        for (let i = step; i < points.length - 1; i += step) {
            downsampled.push(points[i]);
        }
        
        // Always keep last point
        if (points.length > 1) {
            downsampled.push(points[points.length - 1]);
        }
        
        console.log(`📉 Downsampled route: ${points.length} → ${downsampled.length} points`);
        return downsampled;
    }

    // Clear old storage data to make space (cleanup utility)
    async clearOldStorageData() {
        try {
            // Remove any other app data that might be taking space
            const keysToRemove = [];
            for (let i = 0; i < localStorage.length; i++) {
                const key = localStorage.key(i);
                if (key && key.startsWith('routecoinme_') && key !== this.storageKey) {
                    keysToRemove.push(key);
                }
            }
            
            keysToRemove.forEach(key => localStorage.removeItem(key));
            
            // Clear our main storage
            localStorage.removeItem(this.storageKey);
            console.log('🧹 Cleared old storage data');
        } catch (error) {
            console.warn('Failed to clear old storage data:', error);
            throw error;
        }
    }

    // Check if localStorage is supported and available
    static isSupported() {
        try {
            const testKey = 'localStorage-test';
            localStorage.setItem(testKey, 'test');
            localStorage.removeItem(testKey);
            return true;
        } catch (error) {
            return false;
        }
    }
}

export default RouteLocalStorageManager;
