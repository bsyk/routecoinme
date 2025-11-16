// IndexedDB Storage Manager for RouteCoinMe
// Provides robust storage for GPX routes with much larger capacity than localStorage

class RouteStorageManager {
    constructor() {
        this.dbName = 'RouteCoinMeDB';
        this.dbVersion = 1;
        this.routeStoreName = 'routes';
        this.db = null;
    }

    // Initialize IndexedDB connection
    async init() {
        try {
            console.log('📦 Initializing IndexedDB storage...');
            
            return new Promise((resolve, reject) => {
                const request = indexedDB.open(this.dbName, this.dbVersion);

                request.onerror = () => {
                    console.error('❌ Failed to open IndexedDB:', request.error);
                    reject(request.error);
                };

                request.onsuccess = () => {
                    this.db = request.result;
                    console.log('✅ IndexedDB connection established');
                    resolve(this.db);
                };

                request.onupgradeneeded = (event) => {
                    console.log('🔄 Setting up IndexedDB schema...');
                    const db = event.target.result;

                    // Create routes object store
                    if (!db.objectStoreNames.contains(this.routeStoreName)) {
                        const routeStore = db.createObjectStore(this.routeStoreName, { 
                            keyPath: 'id' 
                        });

                        // Create indices for efficient querying
                        routeStore.createIndex('filename', 'filename', { unique: false });
                        routeStore.createIndex('uploadTime', 'uploadTime', { unique: false });
                        routeStore.createIndex('distance', 'distance', { unique: false });

                        console.log('📊 Created routes object store with indices');
                    }
                };
            });
        } catch (error) {
            console.error('❌ IndexedDB initialization failed:', error);
            throw error;
        }
    }

    // Save a single route
    async saveRoute(route) {
        if (!this.db) {
            await this.init();
        }

        try {
            return new Promise((resolve, reject) => {
                const transaction = this.db.transaction([this.routeStoreName], 'readwrite');
                const store = transaction.objectStore(this.routeStoreName);
                
                // Store the full route without downsampling for IndexedDB
                const request = store.put(route);

                request.onsuccess = () => {
                    console.log(`💾 Route saved to IndexedDB: ${route.filename}`);
                    resolve(request.result);
                };

                request.onerror = () => {
                    console.error('❌ Failed to save route:', request.error);
                    reject(request.error);
                };
            });
        } catch (error) {
            console.error('❌ Error saving route to IndexedDB:', error);
            throw error;
        }
    }

    // Save multiple routes
    async saveRoutes(routes) {
        if (!this.db) {
            await this.init();
        }

        try {
            const transaction = this.db.transaction([this.routeStoreName], 'readwrite');
            const store = transaction.objectStore(this.routeStoreName);
            
            console.log(`💾 Saving ${routes.length} routes to IndexedDB...`);
            
            const promises = routes.map(route => {
                return new Promise((resolve, reject) => {
                    const request = store.put(route);
                    request.onsuccess = () => resolve(route.id);
                    request.onerror = () => reject(request.error);
                });
            });

            const results = await Promise.all(promises);
            
            const totalSizeKB = this.calculateRoutesSize(routes);
            console.log(`✅ Saved ${results.length} routes to IndexedDB (~${totalSizeKB}KB total)`);
            
            return results;
        } catch (error) {
            console.error('❌ Error saving routes to IndexedDB:', error);
            throw error;
        }
    }

    // Load all routes
    async loadRoutes() {
        if (!this.db) {
            await this.init();
        }

        try {
            return new Promise((resolve, reject) => {
                const transaction = this.db.transaction([this.routeStoreName], 'readonly');
                const store = transaction.objectStore(this.routeStoreName);
                const request = store.getAll();

                request.onsuccess = () => {
                    const routes = request.result || [];
                    console.log(`📂 Loaded ${routes.length} routes from IndexedDB`);
                    
                    if (routes.length > 0) {
                        const totalSizeKB = this.calculateRoutesSize(routes);
                        console.log(`📊 Total data loaded: ~${totalSizeKB}KB`);
                        console.log('📋 Routes loaded:', routes.map(r => r.filename));
                    }
                    
                    resolve(routes);
                };

                request.onerror = () => {
                    console.error('❌ Failed to load routes:', request.error);
                    reject(request.error);
                };
            });
        } catch (error) {
            console.error('❌ Error loading routes from IndexedDB:', error);
            throw error;
        }
    }

    // Delete a single route
    async deleteRoute(routeId) {
        if (!this.db) {
            await this.init();
        }

        try {
            return new Promise((resolve, reject) => {
                const transaction = this.db.transaction([this.routeStoreName], 'readwrite');
                const store = transaction.objectStore(this.routeStoreName);
                const request = store.delete(routeId);

                request.onsuccess = () => {
                    console.log(`🗑️ Route deleted from IndexedDB: ${routeId}`);
                    resolve();
                };

                request.onerror = () => {
                    console.error('❌ Failed to delete route:', request.error);
                    reject(request.error);
                };
            });
        } catch (error) {
            console.error('❌ Error deleting route from IndexedDB:', error);
            throw error;
        }
    }

    // Clear all routes
    async clearAllRoutes() {
        if (!this.db) {
            await this.init();
        }

        try {
            return new Promise((resolve, reject) => {
                const transaction = this.db.transaction([this.routeStoreName], 'readwrite');
                const store = transaction.objectStore(this.routeStoreName);
                const request = store.clear();

                request.onsuccess = () => {
                    console.log('🧹 All routes cleared from IndexedDB');
                    resolve();
                };

                request.onerror = () => {
                    console.error('❌ Failed to clear routes:', request.error);
                    reject(request.error);
                };
            });
        } catch (error) {
            console.error('❌ Error clearing routes from IndexedDB:', error);
            throw error;
        }
    }

    // Get storage usage statistics
    async getStorageInfo() {
        if (!this.db) {
            await this.init();
        }

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
            console.error('❌ Error getting storage info:', error);
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
    async cleanupOldRoutes(maxSizeKB = 50000) { // 50MB default limit
        if (!this.db) {
            await this.init();
        }

        try {
            const routes = await this.loadRoutes();
            const currentSizeKB = this.calculateRoutesSize(routes);

            if (currentSizeKB <= maxSizeKB) {
                console.log(`💾 Storage size OK: ${currentSizeKB}KB / ${maxSizeKB}KB`);
                return;
            }

            console.log(`⚠️ Storage size exceeded: ${currentSizeKB}KB > ${maxSizeKB}KB, cleaning up...`);

            // Sort by upload time (oldest first)
            const sortedRoutes = routes.sort((a, b) => a.uploadTime - b.uploadTime);
            
            // Remove oldest routes until we're under the limit
            let routesToKeep = [...sortedRoutes];
            while (this.calculateRoutesSize(routesToKeep) > maxSizeKB && routesToKeep.length > 1) {
                const removedRoute = routesToKeep.shift();
                await this.deleteRoute(removedRoute.id);
                console.log(`🗑️ Removed old route: ${removedRoute.filename}`);
            }

            const finalSizeKB = this.calculateRoutesSize(routesToKeep);
            console.log(`✅ Cleanup complete: ${finalSizeKB}KB, kept ${routesToKeep.length} routes`);
            
            return routesToKeep;
        } catch (error) {
            console.error('❌ Error during cleanup:', error);
            throw error;
        }
    }

    // Check if IndexedDB is supported
    static isSupported() {
        return 'indexedDB' in window;
    }
}

export default RouteStorageManager;
