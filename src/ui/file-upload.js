// File Upload Handler for GPX Files
import GPXParser from '../data/gpx-parser.js';
import RouteMapVisualization from '../visualization/route-map.js';
import Route3DVisualization from '../visualization/route-3d.js';

class FileUploadHandler {
    constructor() {
        this.parser = new GPXParser();
        this.mapViz = new RouteMapVisualization();
        this.viewer3D = new Route3DVisualization();
        this.uploadedRoutes = [];
        this.maxFiles = 10; // Reduced from 20 to help with storage limits
        this.selectedRoutes = new Set(); // For tracking selected routes
        this.currentViewMode = 'map'; // 'map' or '3d'
        this.is3DInitialized = false; // Track if 3D viewer has been initialized
        this.init();
    }

    init() {
        this.setupFileInput();
        this.setupDropZone();
        this.setupViewToggleButtons();
        this.loadStoredRoutes();
    }

    // Set up file input element
    setupFileInput() {
        // Create hidden file input
        const fileInput = document.createElement('input');
        fileInput.type = 'file';
        fileInput.id = 'gpx-file-input';
        fileInput.accept = '.gpx,.xml';
        fileInput.multiple = true;
        fileInput.style.display = 'none';
        document.body.appendChild(fileInput);

        // Handle file selection
        fileInput.addEventListener('change', (event) => {
            this.handleFileSelection(event.target.files);
        });
    }

    // Set up drag and drop zone
    setupDropZone() {
        const dropZone = document.querySelector('.demo-placeholder') || document.body;
        
        dropZone.addEventListener('dragover', (e) => {
            e.preventDefault();
            e.stopPropagation();
            dropZone.classList.add('drag-over');
        });

        dropZone.addEventListener('dragleave', (e) => {
            e.preventDefault();
            e.stopPropagation();
            if (!dropZone.contains(e.relatedTarget)) {
                dropZone.classList.remove('drag-over');
            }
        });

        dropZone.addEventListener('drop', (e) => {
            e.preventDefault();
            e.stopPropagation();
            dropZone.classList.remove('drag-over');
            
            const files = Array.from(e.dataTransfer.files).filter(file => 
                file.name.toLowerCase().endsWith('.gpx') || 
                file.name.toLowerCase().endsWith('.xml')
            );
            
            if (files.length > 0) {
                this.handleFileSelection(files);
            }
        });
    }

    // Set up view toggle buttons
    setupViewToggleButtons() {
        // Wait for DOM to be ready
        setTimeout(() => {
            const mapBtn = document.getElementById('view-btn-map');
            const viewer3DBtn = document.getElementById('view-btn-3d');
            const controlsToggle = document.getElementById('view-btn-controls');

            // Map view button
            if (mapBtn) {
                mapBtn.addEventListener('click', () => this.showMapView());
            }

            // 3D view button  
            if (viewer3DBtn) {
                viewer3DBtn.addEventListener('click', () => this.show3DView());
            }

            // 3D controls toggle
            if (controlsToggle) {
                controlsToggle.addEventListener('click', () => this.toggle3DControls());
            }

            console.log('🎛️ View toggle buttons initialized');
        }, 100);
    }

    // Handle file selection (from input or drag/drop)
    async handleFileSelection(files) {
        const fileArray = Array.from(files);
        console.log(`📁 Processing ${fileArray.length} GPX file(s)...`);

        // Show loading state
        this.showLoadingState();

        const results = {
            successful: [],
            failed: []
        };

        // Process files sequentially to avoid overwhelming the UI
        for (const file of fileArray) {
            try {
                const routeData = await this.parser.parseGPXFile(file);
                this.addRoute(routeData);
                results.successful.push(routeData);
            } catch (error) {
                console.error(`Failed to process ${file.name}:`, error);
                results.failed.push({ filename: file.name, error: error.message });
            }
        }

        // Update UI with results
        this.updateUIAfterUpload(results);
        
        console.log(`🔄 About to save ${this.uploadedRoutes.length} routes to storage...`);
        this.saveRoutesToStorage();
    }

    // Add route to collection
    addRoute(routeData) {
        // Remove oldest routes if we're at the limit
        if (this.uploadedRoutes.length >= this.maxFiles) {
            this.uploadedRoutes.splice(0, this.uploadedRoutes.length - this.maxFiles + 1);
        }

        // Add unique ID
        routeData.id = this.generateRouteId();
        this.uploadedRoutes.push(routeData);

        console.log(`✅ Added route: ${routeData.filename}`);
        
        // Add to 3D viewer if it's already initialized
        this.addRouteTo3DViewerIfInitialized(routeData);
    }

    // Generate unique route ID
    generateRouteId() {
        return 'route_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9);
    }

    // Show loading state in UI
    showLoadingState() {
        const demoArea = document.querySelector('.demo-placeholder');
        if (demoArea) {
            demoArea.innerHTML = `
                <h3>📁 Processing GPX Files...</h3>
                <p>Parsing GPS data and calculating route statistics</p>
                <div class="loading-spinner">
                    <div class="spinner"></div>
                </div>
            `;
        }
    }

    // Update UI after file upload
    updateUIAfterUpload(results) {
        const demoArea = document.querySelector('.demo-placeholder');
        if (!demoArea) return;

        const totalRoutes = this.uploadedRoutes.length;
        const totalDistance = this.uploadedRoutes.reduce((sum, route) => sum + route.distance, 0);
        const totalElevation = this.uploadedRoutes.reduce((sum, route) => sum + route.elevationGain, 0);

        demoArea.innerHTML = `
            <div class="gpx-upload-area">
                <h3>📊 GPX Routes Loaded</h3>
                <div class="route-stats">
                    <div class="stat-item">
                        <span class="stat-number">${totalRoutes}</span>
                        <span class="stat-label">Routes</span>
                    </div>
                    <div class="stat-item">
                        <span class="stat-number">${totalDistance.toFixed(1)}km</span>
                        <span class="stat-label">Total Distance</span>
                    </div>
                    <div class="stat-item">
                        <span class="stat-number">${Math.round(totalElevation)}m</span>
                        <span class="stat-label">Total Elevation</span>
                    </div>
                </div>
                
                <!-- Map Container -->
                <div class="map-container" id="map-container" style="display: ${this.currentViewMode === 'map' ? 'block' : 'none'}">
                    <div id="route-map"></div>
                    <div class="map-controls">
                        <button class="map-control-btn" onclick="window.fileUploader.toggleFullscreen()" title="Toggle Fullscreen">
                            📐
                        </button>
                        <button class="map-control-btn" onclick="window.fileUploader.fitMapToRoutes()" title="Fit All Routes">
                            🔍
                        </button>
                    </div>
                </div>

                <!-- 3D Viewer Container -->
                <div class="viewer-3d-container" id="viewer-3d-container" style="display: ${this.currentViewMode === '3d' ? 'block' : 'none'}">
                    <div id="route-3d-viewer" style="width: 100%; height: 100%; position: relative;"></div>
                    
                    <!-- Zoom Controls - Top Left -->
                    <div class="control-overlay control-top-left">
                        <button class="control-btn" onclick="window.fileUploader.zoomIn3D()" title="Zoom In">+</button>
                        <button class="control-btn" onclick="window.fileUploader.zoomOut3D()" title="Zoom Out">−</button>
                    </div>
                    
                    <!-- View Controls - Top Right -->
                    <div class="control-overlay control-top-right">
                        <button class="control-btn" onclick="window.fileUploader.fitToView3D()" title="Fit to View">△</button>
                        <button class="control-btn" onclick="window.fileUploader.resetView3D()" title="Reset View">🏠</button>
                    </div>
                    
                    <!-- Display Options - Bottom Right -->
                    <div class="control-overlay control-bottom-right">
                        <label class="control-checkbox">
                            <input type="checkbox" id="filled-area-toggle" checked 
                                   onchange="window.fileUploader.toggleFilledArea(this.checked)">
                            <span>Filled Areas</span>
                        </label>
                        <label class="control-checkbox">
                            <input type="checkbox" id="climbing-only-toggle" 
                                   onchange="window.fileUploader.toggleClimbingOnly(this.checked)">
                            <span>Climbing Only</span>
                        </label>
                    </div>
                    
                    <div class="viewer-3d-status">
                        <span>🎮 Mouse: rotate • Wheel: zoom • ${totalRoutes} routes loaded</span>
                    </div>
                </div>

                <!-- View Mode Toggle -->
                <div class="viewer-toggle-buttons">
                    <button class="viewer-toggle-btn ${this.currentViewMode === 'map' ? 'active' : ''}" 
                            onclick="window.fileUploader.switchViewMode('map')">
                        🗺️ Map View
                    </button>
                    <button class="viewer-toggle-btn ${this.currentViewMode === '3d' ? 'active' : ''}" 
                            onclick="window.fileUploader.switchViewMode('3d')">
                        🏔️ 3D View
                    </button>
                </div>
                
                <!-- Route List -->
                <div class="route-list-panel">
                    <h4>Routes on Map</h4>
                    <div id="route-list"></div>
                </div>
                
                <div class="upload-actions">
                    <button class="btn btn-primary" onclick="window.fileUploader.triggerFileUpload()">
                        📁 Upload More GPX Files
                    </button>
                    <button class="btn btn-secondary" onclick="window.fileUploader.clearAllRoutes()">
                        �️ Clear All Routes
                    </button>
                    <button class="btn btn-secondary" onclick="window.fileUploader.startAggregation()">
                        🔗 Aggregate Routes
                    </button>
                </div>

                <div class="drop-zone-hint">
                    <p>💡 Tip: You can also drag & drop GPX files anywhere on this page</p>
                </div>
            </div>
        `;

        // Initialize map and add routes
        this.initializeMapVisualization();
        
        // Don't initialize 3D viewer until user switches to 3D view
        // this will be done lazily in show3DView()
        
        this.updateRouteList();

        // Show results summary
        if (results.failed.length > 0) {
            this.showUploadResults(results);
        }
    }

    // Show upload results (especially errors)
    showUploadResults(results) {
        const message = [
            `✅ Successfully processed: ${results.successful.length} files`,
            results.failed.length > 0 ? `❌ Failed to process: ${results.failed.length} files` : null,
            ...results.failed.map(f => `  • ${f.filename}: ${f.error}`)
        ].filter(Boolean).join('\n');

        console.log(message);
        
        if (results.failed.length > 0) {
            alert(`Upload completed with some errors:\n\n${message}`);
        }
    }

    // Trigger file upload dialog
    triggerFileUpload() {
        const fileInput = document.getElementById('gpx-file-input');
        fileInput.click();
    }

    // Show route list
    showRouteList() {
        if (this.uploadedRoutes.length === 0) {
            alert('No routes uploaded yet. Upload some GPX files first!');
            return;
        }

        const routeList = this.uploadedRoutes.map((route, index) => {
            const duration = route.duration ? `${Math.round(route.duration / 60)} min` : 'Unknown';
            return `${index + 1}. ${route.filename}
   📏 ${route.distance.toFixed(1)}km  ⛰️ ${Math.round(route.elevationGain)}m  ⏱️ ${duration}`;
        }).join('\n\n');

        alert(`📋 Uploaded Routes (${this.uploadedRoutes.length}):\n\n${routeList}`);
    }

    // Start route aggregation process
    startAggregation() {
        if (this.uploadedRoutes.length < 2) {
            alert('Please upload at least 2 GPX files to aggregate routes.');
            return;
        }

        alert(`🔗 Route Aggregation Coming Soon!\n\nYou have ${this.uploadedRoutes.length} routes ready to aggregate.\n\nNext features:\n• Choose aggregation method (distance/time/elevation)\n• Configure route ordering\n• Generate combined route visualization`);
    }

    // Get uploaded routes
    getRoutes() {
        return [...this.uploadedRoutes];
    }

    // Remove a route
    removeRoute(routeId) {
        this.uploadedRoutes = this.uploadedRoutes.filter(route => route.id !== routeId);
        this.saveRoutesToStorage();
    }

    // Clear all routes
    clearAllRoutes() {
        this.uploadedRoutes = [];
        this.saveRoutesToStorage();
        this.updateUIAfterUpload({ successful: [], failed: [] });
    }

    // Initialize map visualization
    initializeMapVisualization() {
        const mapElement = document.getElementById('route-map');
        if (!mapElement) return;

        // Initialize the map
        if (this.mapViz.initializeMap(mapElement)) {
            // Add all routes to the map
            this.uploadedRoutes.forEach(route => {
                this.mapViz.addRoute(route);
            });
            
            console.log('🗺️ Map visualization initialized with routes');
        }
    }

    // Initialize 3D visualization
    initialize3DVisualization() {
        console.log('🎮 Initializing 3D visualization...');
        const viewer3DElement = document.getElementById('route-3d-viewer');
        
        if (!viewer3DElement) {
            console.error('❌ 3D viewer element not found!');
            return;
        }

        console.log('✅ 3D viewer element found:', viewer3DElement);
        console.log('📏 Element dimensions:', viewer3DElement.offsetWidth, 'x', viewer3DElement.offsetHeight);

        // Initialize the 3D viewer
        const initResult = this.viewer3D.initialize(viewer3DElement);
        console.log('🔧 3D viewer initialization result:', initResult);
        
        if (initResult) {
            // Add all routes to the 3D viewer
            console.log(`🔄 Attempting to add ${this.uploadedRoutes.length} routes to 3D viewer...`);
            this.uploadedRoutes.forEach((route, index) => {
                console.log(`➕ Adding route ${index + 1} to 3D viewer:`, route.filename);
                console.log(`📊 Route data structure:`, {
                    filename: route.filename,
                    pointsCount: route.points?.length || 'undefined',
                    hasDistance: route.distance !== undefined,
                    hasElevation: route.elevationGain !== undefined,
                    samplePoint: route.points?.[0]
                });
                
                if (!route.points || route.points.length === 0) {
                    console.warn(`⚠️ Route ${route.filename} has no points data!`);
                    return;
                }
                
                this.viewer3D.addRoute(route);
            });
            
            console.log('🎮 3D visualization initialized with routes');
            
            // Setup resize handler
            this.setup3DResizeHandler();
        } else {
            console.error('❌ 3D viewer initialization failed');
        }
    }

    // Setup resize handler for 3D viewer
    setup3DResizeHandler() {
        const resizeObserver = new ResizeObserver(entries => {
            for (let entry of entries) {
                const { width, height } = entry.contentRect;
                this.viewer3D.resize(width, height);
            }
        });

        const viewer3DContainer = document.getElementById('viewer-3d-container');
        if (viewer3DContainer) {
            resizeObserver.observe(viewer3DContainer);
        }
    }

    // Add a route to 3D viewer if it's initialized (for newly uploaded routes)
    addRouteTo3DViewerIfInitialized(route) {
        if (this.is3DInitialized && this.viewer3D && this.viewer3D.isInitialized) {
            console.log(`➕ Adding new route to initialized 3D viewer: ${route.filename}`);
            this.viewer3D.addRoute(route);
        } else {
            console.log(`📝 3D viewer not initialized, route will be added when 3D view is accessed: ${route.filename}`);
        }
    }

    // Update the route list display
    updateRouteList() {
        const routeListContainer = document.getElementById('route-list');
        if (!routeListContainer) return;

        if (this.uploadedRoutes.length === 0) {
            routeListContainer.innerHTML = '<p class="empty-state">No routes uploaded yet</p>';
            return;
        }

        const routeItems = this.uploadedRoutes.map((route, index) => {
            const color = this.mapViz.routeLayers.find(layer => layer.id === route.id)?.color || '#2563eb';
            const duration = route.duration ? this.formatDuration(route.duration) : 'Unknown';
            
            return `
                <div class="route-list-item" data-route-id="${route.id}">
                    <div class="route-item-info">
                        <h4>${route.filename}</h4>
                        <div class="route-item-stats">
                            <span>📏 ${route.distance.toFixed(1)}km</span>
                            <span>⛰️ ${Math.round(route.elevationGain)}m</span>
                            <span>⏱️ ${duration}</span>
                        </div>
                    </div>
                    <div class="route-item-color" style="background-color: ${color}"></div>
                    <div class="route-item-actions">
                        <button class="route-action-btn" onclick="window.fileUploader.zoomToRoute('${route.id}')" title="Zoom to Route">
                            🔍
                        </button>
                        <button class="route-action-btn" onclick="window.fileUploader.removeRouteById('${route.id}')" title="Remove Route">
                            🗑️
                        </button>
                    </div>
                </div>
            `;
        }).join('');

        routeListContainer.innerHTML = routeItems;
    }

    // Format duration helper
    formatDuration(seconds) {
        if (!seconds || seconds === 0) return 'Unknown';
        
        const hours = Math.floor(seconds / 3600);
        const minutes = Math.floor((seconds % 3600) / 60);
        
        if (hours > 0) {
            return `${hours}h ${minutes}m`;
        } else {
            return `${minutes}m`;
        }
    }

    // Toggle map fullscreen
    toggleFullscreen() {
        const mapContainer = document.getElementById('map-container');
        if (mapContainer) {
            mapContainer.classList.toggle('fullscreen');
            
            // Resize map after container change
            setTimeout(() => {
                this.mapViz.resize();
            }, 300);
        }
    }

    // Fit map to show all routes
    fitMapToRoutes() {
        this.mapViz.fitMapToRoutes();
    }

    // Zoom to specific route
    zoomToRoute(routeId) {
        const routeLayer = this.mapViz.routeLayers.find(layer => layer.id === routeId);
        if (routeLayer && routeLayer.polyline) {
            this.mapViz.map.fitBounds(routeLayer.polyline.getBounds(), { padding: [20, 20] });
            
            // Highlight the route temporarily
            const originalWeight = routeLayer.polyline.options.weight;
            routeLayer.polyline.setStyle({ weight: originalWeight + 2 });
            
            setTimeout(() => {
                routeLayer.polyline.setStyle({ weight: originalWeight });
            }, 2000);
        }
    }

    // Remove a route by ID (updated to work with map)
    removeRouteById(routeId) {
        // Remove from uploaded routes array
        this.uploadedRoutes = this.uploadedRoutes.filter(route => route.id !== routeId);
        
        // Remove from map
        this.mapViz.removeRoute(routeId);
        
        // Update UI
        this.updateRouteList();
        this.saveRoutesToStorage();
        
        // Update stats
        this.updateStatsDisplay();
        
        console.log(`🗑️ Route removed: ${routeId}`);
    }

    // Update just the stats display
    updateStatsDisplay() {
        const totalRoutes = this.uploadedRoutes.length;
        const totalDistance = this.uploadedRoutes.reduce((sum, route) => sum + route.distance, 0);
        const totalElevation = this.uploadedRoutes.reduce((sum, route) => sum + route.elevationGain, 0);

        // Update stats numbers
        const statNumbers = document.querySelectorAll('.stat-number');
        if (statNumbers.length >= 3) {
            statNumbers[0].textContent = totalRoutes;
            statNumbers[1].textContent = `${totalDistance.toFixed(1)}km`;
            statNumbers[2].textContent = `${Math.round(totalElevation)}m`;
        }
    }

    // Save routes to local storage
    saveRoutesToStorage() {
        try {
            // Create compressed version of route data for storage
            const compressedRoutes = this.uploadedRoutes.map(route => ({
                id: route.id,
                filename: route.filename,
                // Downsample points to reduce storage size
                points: this.downsamplePoints(route.points, 100), // Max 100 points per route
                distance: route.distance,
                elevationGain: route.elevationGain,
                elevationLoss: route.elevationLoss,
                duration: route.duration,
                uploadTime: route.uploadTime,
                // Store only essential metadata
                metadata: {
                    name: route.metadata?.name,
                    description: route.metadata?.description
                }
            }));
            
            const routeData = {
                routes: compressedRoutes,
                timestamp: Date.now()
            };
            
            // Test JSON serialization and check size
            const jsonString = JSON.stringify(routeData);
            const sizeKB = Math.round(jsonString.length / 1024);
            
            if (sizeKB > 4000) { // If larger than 4MB, remove oldest routes
                console.warn(`⚠️ Data too large (${sizeKB}KB), removing oldest routes...`);
                while (compressedRoutes.length > 0 && JSON.stringify({routes: compressedRoutes, timestamp: Date.now()}).length > 4000 * 1024) {
                    compressedRoutes.shift();
                }
                routeData.routes = compressedRoutes;
            }
            
            localStorage.setItem('routecoinme_gpx_routes', JSON.stringify(routeData));
            console.log(`💾 Saved ${compressedRoutes.length} routes to local storage (${Math.round(JSON.stringify(routeData).length / 1024)}KB)`);
            
        } catch (error) {
            if (error.name === 'QuotaExceededError') {
                console.warn('📦 Storage quota exceeded, clearing old data and retrying...');
                this.clearOldStorageData();
                this.saveRoutesToStorage(); // Retry once
            } else {
                console.warn('Failed to save routes to local storage:', error);
            }
        }
    }

    // Downsample GPS points to reduce storage size
    downsamplePoints(points, maxPoints = 100) {
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

    // Clear old storage data to make space
    clearOldStorageData() {
        try {
            // Remove any other app data that might be taking space
            for (let i = 0; i < localStorage.length; i++) {
                const key = localStorage.key(i);
                if (key && key.startsWith('routecoinme_') && key !== 'routecoinme_gpx_routes') {
                    localStorage.removeItem(key);
                }
            }
            
            // Clear our main storage
            localStorage.removeItem('routecoinme_gpx_routes');
            console.log('🧹 Cleared old storage data');
        } catch (error) {
            console.warn('Failed to clear storage:', error);
        }
    }

    // Load routes from local storage
    loadStoredRoutes() {
        try {
            // Test localStorage availability
            localStorage.setItem('test', 'test');
            localStorage.removeItem('test');
            console.log('✅ LocalStorage is available');
            
            const stored = localStorage.getItem('routecoinme_gpx_routes');
            console.log('🔍 Checking local storage for saved routes...');
            console.log('📦 Raw storage data:', stored ? stored.substring(0, 100) + '...' : 'null');
            
            if (stored) {
                const data = JSON.parse(stored);
                this.uploadedRoutes = data.routes || [];
                
                if (this.uploadedRoutes.length > 0) {
                    console.log(`📂 Loaded ${this.uploadedRoutes.length} routes from storage`);
                    console.log('📋 Routes loaded:', this.uploadedRoutes.map(r => r.filename));
                    console.log('🔄 Calling updateUIAfterUpload to initialize viewers...');
                    this.updateUIAfterUpload({ successful: this.uploadedRoutes, failed: [] });
                } else {
                    console.log('📭 No routes found in storage');
                }
            } else {
                console.log('📭 No saved data found in local storage');
            }
        } catch (error) {
            console.warn('❌ LocalStorage issue:', error);
            this.uploadedRoutes = [];
        }
    }

    // Switch view mode (unified method for HTML onclick handlers)
    switchViewMode(mode) {
        if (mode === 'map') {
            this.showMapView();
        } else if (mode === '3d') {
            this.show3DView();
        }
        this.currentViewMode = mode;
    }

    // Switch to map view
    showMapView() {
        const mapContainer = document.getElementById('map-container');
        const viewer3DContainer = document.getElementById('viewer-3d-container');
        const mapBtn = document.querySelector('.viewer-toggle-btn:nth-child(1)');
        const viewer3DBtn = document.querySelector('.viewer-toggle-btn:nth-child(2)');

        if (mapContainer && viewer3DContainer) {
            mapContainer.style.display = 'block';
            viewer3DContainer.style.display = 'none';
            
            mapBtn?.classList.add('active');
            viewer3DBtn?.classList.remove('active');

            // Resize map after showing
            setTimeout(() => {
                if (this.mapViz && this.mapViz.map) {
                    this.mapViz.map.invalidateSize();
                }
            }, 100);
        }

        console.log('🗺️ Switched to map view');
    }

    // Switch to 3D view
    show3DView() {
        const mapContainer = document.getElementById('map-container');
        const viewer3DContainer = document.getElementById('viewer-3d-container');
        const mapBtn = document.querySelector('.viewer-toggle-btn:nth-child(1)');
        const viewer3DBtn = document.querySelector('.viewer-toggle-btn:nth-child(2)');

        if (mapContainer && viewer3DContainer) {
            mapContainer.style.display = 'none';
            viewer3DContainer.style.display = 'block';
            
            mapBtn?.classList.remove('active');
            viewer3DBtn?.classList.add('active');

            // Initialize 3D viewer if not already done (lazy initialization)
            if (!this.is3DInitialized) {
                console.log('🚀 Lazy initializing 3D viewer...');
                setTimeout(() => {
                    this.initialize3DVisualization();
                    this.is3DInitialized = true;
                }, 100);
            } else {
                // Resize 3D viewer after showing if already initialized
                setTimeout(() => {
                    if (this.viewer3D) {
                        const rect = viewer3DContainer.getBoundingClientRect();
                        this.viewer3D.resize(rect.width, rect.height);
                    }
                }, 100);
            }
        }

        console.log('🎮 Switched to 3D view');
    }

    // Toggle 3D controls visibility
    toggle3DControls() {
        const controlsPanel = document.getElementById('viewer-3d-controls');
        if (controlsPanel) {
            controlsPanel.classList.toggle('hidden');
        }
    }

    // 3D Viewer Control Methods
    updateElevationExaggeration(value) {
        if (this.viewer3D) {
            this.viewer3D.setElevationExaggeration(parseFloat(value));
            const valueDisplay = document.getElementById('elevation-value');
            if (valueDisplay) {
                valueDisplay.textContent = `${value}x`;
            }
        }
    }

    toggleFilledArea(show) {
        if (this.viewer3D) {
            this.viewer3D.toggleFilledArea(show);
        }
    }

    toggleClimbingOnly(enabled) {
        if (this.viewer3D) {
            this.viewer3D.toggleClimbingOnly(enabled);
        }
    }

    // 3D Camera Controls
    zoomIn3D() {
        if (this.viewer3D) {
            this.viewer3D.zoomIn();
        }
    }

    zoomOut3D() {
        if (this.viewer3D) {
            this.viewer3D.zoomOut();
        }
    }

    fitToView3D() {
        if (this.viewer3D) {
            this.viewer3D.fitToView();
        }
    }

    resetView3D() {
        if (this.viewer3D) {
            this.viewer3D.resetView();
        }
    }
}

export default FileUploadHandler;
