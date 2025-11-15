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
        this.selectedRoutes = new Set(); // For tracking selected routes for display
        this.aggregatedRoute = null; // Store the aggregated route when created
        this.isShowingAggregated = false; // Track if we're showing aggregated route
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

        // Auto-select new routes for display (unless we're showing aggregated route)
        if (!this.isShowingAggregated) {
            this.selectedRoutes.add(routeData.id);
        }

        console.log(`✅ Added route: ${routeData.filename}`);
        
        // Add to 3D viewer if it's already initialized and route is selected
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
                    <button class="btn btn-secondary" onclick="window.fileUploader.showAggregationOptions()">
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

    // Show aggregation options dialog
    showAggregationOptions() {
        const selectedRoutesToAggregate = this.uploadedRoutes.filter(route => 
            this.selectedRoutes.has(route.id)
        );

        if (selectedRoutesToAggregate.length < 2) {
            alert('Please select at least 2 routes to aggregate. Use the checkboxes in the route list to select routes.');
            return;
        }

        // Create modal for aggregation options
        this.showAggregationModal(selectedRoutesToAggregate);
    }

    // Show aggregation modal with options
    showAggregationModal(routes) {
        const modal = document.createElement('div');
        modal.className = 'aggregation-modal-overlay';
        modal.innerHTML = `
            <div class="aggregation-modal">
                <div class="aggregation-modal-header">
                    <h3>🔗 Aggregate ${routes.length} Routes</h3>
                    <button class="modal-close" onclick="this.closest('.aggregation-modal-overlay').remove()">×</button>
                </div>
                
                <div class="aggregation-modal-content">
                    <div class="aggregation-option-group">
                        <h4>Aggregation Mode</h4>
                        <div class="aggregation-options">
                            <label class="aggregation-option">
                                <input type="radio" name="aggregation-mode" value="distance" checked>
                                <div class="option-content">
                                    <strong>📏 Distance Mode</strong>
                                    <p>Append routes end-to-end over distance (current behavior)</p>
                                </div>
                            </label>
                            
                            <label class="aggregation-option">
                                <input type="radio" name="aggregation-mode" value="time">
                                <div class="option-content">
                                    <strong>⏰ Time Mode</strong>
                                    <p>Plot elevation over time with automatic time step selection</p>
                                </div>
                            </label>
                            
                            <label class="aggregation-option">
                                <input type="radio" name="aggregation-mode" value="fictional">
                                <div class="option-content">
                                    <strong>🎨 Fictional Route</strong>
                                    <p>Generate synthetic coordinates with preserved elevation and timing</p>
                                </div>
                            </label>
                        </div>
                    </div>
                    
                    <div class="aggregation-option-group fictional-options" style="display: none;">
                        <h4>Path Pattern</h4>
                        <div class="aggregation-options">
                            <label class="aggregation-option">
                                <input type="radio" name="path-pattern" value="switchbacks" checked>
                                <div class="option-content">
                                    <strong>⛰️ Switchbacks</strong>
                                    <p>Meandering path transitioning to sharp switchbacks toward summit</p>
                                </div>
                            </label>
                        </div>
                    </div>
                    
                    <div class="aggregation-option-group">
                        <h4>Elevation Display</h4>
                        <div class="aggregation-options">
                            <label class="aggregation-option">
                                <input type="radio" name="elevation-mode" value="actual" checked>
                                <div class="option-content">
                                    <strong>⛰️ Actual Elevation</strong>
                                    <p>Show raw elevation values</p>
                                </div>
                            </label>
                            
                            <label class="aggregation-option">
                                <input type="radio" name="elevation-mode" value="cumulative">
                                <div class="option-content">
                                    <strong>📈 Cumulative Climbing</strong>
                                    <p>Show cumulative elevation gain (preserves total climbing)</p>
                                </div>
                            </label>
                        </div>
                    </div>
                </div>
                
                <div class="aggregation-modal-actions">
                    <button class="btn btn-secondary" onclick="this.closest('.aggregation-modal-overlay').remove()">
                        Cancel
                    </button>
                    <button class="btn btn-primary" onclick="window.fileUploader.executeAggregation()">
                        Create Aggregated Route
                    </button>
                </div>
            </div>
        `;

        document.body.appendChild(modal);
        
        // Add event listeners for mode selection
        const modeRadios = modal.querySelectorAll('input[name="aggregation-mode"]');
        const fictionalOptions = modal.querySelector('.fictional-options');
        
        modeRadios.forEach(radio => {
            radio.addEventListener('change', (e) => {
                if (e.target.value === 'fictional') {
                    fictionalOptions.style.display = 'block';
                } else {
                    fictionalOptions.style.display = 'none';
                }
            });
        });
        
        // Store routes for aggregation
        this._routesToAggregate = routes;
    }

    // Execute aggregation with selected options
    executeAggregation() {
        const modal = document.querySelector('.aggregation-modal-overlay');
        const aggregationMode = modal.querySelector('input[name="aggregation-mode"]:checked').value;
        const elevationMode = modal.querySelector('input[name="elevation-mode"]:checked').value;
        const pathPattern = modal.querySelector('input[name="path-pattern"]:checked')?.value || 'switchbacks';
        
        modal.remove();
        
        console.log(`🔗 Aggregating ${this._routesToAggregate.length} routes in ${aggregationMode} mode with ${elevationMode} elevation...`);
        if (aggregationMode === 'fictional') {
            console.log(`🎨 Using ${pathPattern} path pattern for fictional route`);
        }

        try {
            // Create aggregated route based on selected options
            this.aggregatedRoute = this.createAggregatedRouteWithOptions(
                this._routesToAggregate, 
                aggregationMode, 
                elevationMode,
                pathPattern
            );
            
            // Unselect all individual routes (but keep them in the list)
            this.selectedRoutes.clear();
            this.uploadedRoutes.forEach(route => {
                this.hideRoute(route.id);
            });

            // Show only the aggregated route
            this.isShowingAggregated = true;
            this.showAggregatedRoute();

            // Update UI
            this.updateRouteList();
            this.updateStatsDisplay();

            console.log(`✅ Created aggregated route: ${this.aggregatedRoute.filename}`);
            let modeDescription;
            if (aggregationMode === 'fictional') {
                modeDescription = `fictional ${pathPattern}`;
            } else {
                modeDescription = aggregationMode === 'distance' ? 'distance-based' : 'time-based';
            }
            const elevationDescription = elevationMode === 'actual' ? 'actual elevation' : 'cumulative climbing';
            
            alert(`🔗 Route Aggregation Complete!\n\nCombined ${this._routesToAggregate.length} routes using ${modeDescription} aggregation with ${elevationDescription}.\nTotal distance: ${this.aggregatedRoute.distance.toFixed(1)}km\nTotal elevation gain: ${Math.round(this.aggregatedRoute.elevationGain)}m`);

        } catch (error) {
            console.error('❌ Failed to aggregate routes:', error);
            alert('Failed to aggregate routes. Please check the console for details.');
        }
        
        // Clean up
        delete this._routesToAggregate;
    }

    // Create aggregated route with different options
    createAggregatedRouteWithOptions(routes, aggregationMode, elevationMode, pathPattern = 'switchbacks') {
        if (routes.length === 0) {
            throw new Error('No routes provided for aggregation');
        }

        // Sort routes chronologically by timestamp
        const sortedRoutes = [...routes].sort((a, b) => {
            const timeA = this.extractRouteTimestamp(a);
            const timeB = this.extractRouteTimestamp(b);
            return timeA - timeB;
        });

        console.log('📅 Routes sorted chronologically:', sortedRoutes.map(r => ({
            filename: r.filename,
            timestamp: this.extractRouteTimestamp(r)
        })));

        let aggregatedRoute;

        if (aggregationMode === 'distance') {
            aggregatedRoute = this.createDistanceBasedAggregation(sortedRoutes, elevationMode);
        } else if (aggregationMode === 'time') {
            aggregatedRoute = this.createTimeBasedAggregation(sortedRoutes, elevationMode);
        } else if (aggregationMode === 'fictional') {
            aggregatedRoute = this.createFictionalRouteAggregation(sortedRoutes, elevationMode, pathPattern);
        } else {
            throw new Error(`Unknown aggregation mode: ${aggregationMode}`);
        }

        return aggregatedRoute;
    }

    // Create distance-based aggregation (existing logic with elevation mode support)
    createDistanceBasedAggregation(routes, elevationMode) {
        // Initialize aggregated route data
        let aggregatedPoints = [];
        let totalDistance = 0;
        let totalElevationGain = 0;
        let totalElevationLoss = 0;
        let totalDuration = 0;
        let lastEndPoint = null;
        let cumulativeClimbing = 0;

        // Process each route in chronological order
        for (let i = 0; i < routes.length; i++) {
            const route = routes[i];
            // Clone the route points to avoid modifying the original data
            const routePoints = route.points.map(point => ({
                ...point,
                lat: point.lat,
                lon: point.lon,
                elevation: point.elevation,
                timestamp: point.timestamp
            }));

            console.log(`🔧 Processing route ${i + 1}/${routes.length}: ${route.filename} (${routePoints.length} points)`);

            if (routePoints.length === 0) {
                console.warn(`⚠️ Skipping route ${route.filename} - no points`);
                continue;
            }

            // For routes after the first, calculate offset to connect to previous route's end
            if (i > 0 && lastEndPoint && routePoints.length > 0) {
                const currentStartPoint = routePoints[0];
                const offsetLat = lastEndPoint.lat - currentStartPoint.lat;
                const offsetLon = lastEndPoint.lon - currentStartPoint.lon;
                
                let offsetElevation = 0;
                if (elevationMode === 'actual') {
                    offsetElevation = (lastEndPoint.elevation || 0) - (currentStartPoint.elevation || 0);
                }
                // For cumulative mode, we don't offset elevation - we continue from cumulative climbing

                console.log(`🔗 Applying offset to route ${i + 1}:`, {
                    lat: offsetLat,
                    lon: offsetLon,
                    elevation: offsetElevation
                });

                // Apply offset to all points in this cloned route
                routePoints.forEach(point => {
                    point.lat += offsetLat;
                    point.lon += offsetLon;
                    if (elevationMode === 'actual' && point.elevation !== undefined) {
                        point.elevation += offsetElevation;
                    }
                });
            }

            // Process elevation based on mode
            if (elevationMode === 'cumulative') {
                // Calculate cumulative climbing for this route
                let routeClimbing = 0;
                let lastElevation = routePoints[0]?.elevation || 0;
                
                routePoints.forEach((point, idx) => {
                    if (point.elevation !== undefined) {
                        if (idx > 0 && point.elevation > lastElevation) {
                            routeClimbing += (point.elevation - lastElevation);
                        }
                        lastElevation = point.elevation;
                        
                        // Set elevation to cumulative climbing
                        point.elevation = cumulativeClimbing + routeClimbing;
                    }
                });
                
                // Ensure we account for the full route's elevation gain
                const routeTotalGain = route.elevationGain || 0;
                if (routeClimbing < routeTotalGain) {
                    // Adjust the last point to ensure total gain is preserved
                    const adjustment = routeTotalGain - routeClimbing;
                    if (routePoints.length > 0 && routePoints[routePoints.length - 1].elevation !== undefined) {
                        routePoints[routePoints.length - 1].elevation += adjustment;
                    }
                }
                
                cumulativeClimbing += routeTotalGain;
                console.log(`📈 Route ${i + 1} cumulative climbing: ${routeClimbing.toFixed(1)}m, total: ${cumulativeClimbing.toFixed(1)}m`);
            }

            // Add this route's points to the aggregated route
            // Skip the first point of subsequent routes to avoid duplication at connection points
            const pointsToAdd = i === 0 ? routePoints : routePoints.slice(1);
            aggregatedPoints.push(...pointsToAdd);

            // Update totals
            totalDistance += route.distance || 0;
            totalElevationGain += route.elevationGain || 0;
            totalElevationLoss += route.elevationLoss || 0;
            totalDuration += route.duration || 0;

            // Update last end point for next route
            lastEndPoint = routePoints[routePoints.length - 1];
        }

        // Create the aggregated route object
        const aggregatedRoute = {
            id: this.generateRouteId(),
            filename: `Aggregated Route (${routes.length} routes) - ${elevationMode === 'actual' ? 'Distance' : 'Cumulative Climbing'}`,
            points: aggregatedPoints,
            distance: totalDistance,
            elevationGain: totalElevationGain,
            elevationLoss: totalElevationLoss,
            duration: totalDuration,
            uploadTime: Date.now(),
            metadata: {
                name: `Aggregated Route - ${routes.map(r => r.filename).join(', ')}`,
                description: `Combined from ${routes.length} individual routes using distance-based ${elevationMode} aggregation`,
                aggregationMode: 'distance',
                elevationMode: elevationMode,
                sourceRoutes: routes.map(r => ({
                    id: r.id,
                    filename: r.filename,
                    timestamp: this.extractRouteTimestamp(r)
                }))
            }
        };

        console.log(`✅ Distance-based aggregated route created:`, {
            filename: aggregatedRoute.filename,
            totalPoints: aggregatedRoute.points.length,
            totalDistance: aggregatedRoute.distance.toFixed(1),
            totalElevationGain: Math.round(aggregatedRoute.elevationGain),
            sourceRoutes: aggregatedRoute.metadata.sourceRoutes.length
        });

        return aggregatedRoute;
    }

    // Create time-based aggregation
    createTimeBasedAggregation(routes, elevationMode) {
        console.log(`⏰ Creating time-based aggregation with ${elevationMode} elevation...`);
        
        // First, relocate all routes spatially (same as distance-based aggregation)
        let spatiallyRelocatedRoutes = [];
        let lastEndPoint = null;
        
        console.log('🔧 Step 1: Spatial relocation of routes...');
        
        for (let i = 0; i < routes.length; i++) {
            const route = routes[i];
            // Clone the route points to avoid modifying the original data
            const routePoints = route.points.map(point => ({
                ...point,
                lat: point.lat,
                lon: point.lon,
                elevation: point.elevation,
                timestamp: point.timestamp
            }));

            console.log(`🔧 Processing route ${i + 1}/${routes.length}: ${route.filename} (${routePoints.length} points)`);

            if (routePoints.length === 0) {
                console.warn(`⚠️ Skipping route ${route.filename} - no points`);
                continue;
            }

            // For routes after the first, calculate offset to connect to previous route's end
            if (i > 0 && lastEndPoint && routePoints.length > 0) {
                const currentStartPoint = routePoints[0];
                const offsetLat = lastEndPoint.lat - currentStartPoint.lat;
                const offsetLon = lastEndPoint.lon - currentStartPoint.lon;
                const offsetElevation = (lastEndPoint.elevation || 0) - (currentStartPoint.elevation || 0);

                console.log(`🔗 Applying spatial offset to route ${i + 1}:`, {
                    lat: offsetLat,
                    lon: offsetLon,
                    elevation: offsetElevation
                });

                // Apply offset to all points in this cloned route
                routePoints.forEach(point => {
                    point.lat += offsetLat;
                    point.lon += offsetLon;
                    if (point.elevation !== undefined) {
                        point.elevation += offsetElevation;
                    }
                });

                console.log(`📍 Route ${i + 1} spatially relocated - start:`, routePoints[0], 'end:', routePoints[routePoints.length - 1]);
            }

            spatiallyRelocatedRoutes.push({
                ...route,
                points: routePoints
            });

            // Update last end point for next route
            lastEndPoint = routePoints[routePoints.length - 1];
        }

        console.log('✅ Step 1 complete: All routes spatially relocated');
        console.log('🕒 Step 2: Time-domain transformation...');

        // Now collect all spatially-relocated points with timestamps
        let allPointsWithTime = [];
        let totalDistance = 0;
        let totalElevationGain = 0;
        let totalElevationLoss = 0;
        let totalDuration = 0;

        spatiallyRelocatedRoutes.forEach((route, routeIndex) => {
            console.log(`📊 Processing relocated route ${routeIndex + 1}: ${route.filename}`);
            
            const routePoints = route.points.filter(point => point.timestamp);
            if (routePoints.length === 0) {
                console.warn(`⚠️ Route ${route.filename} has no timestamped points, skipping from time aggregation`);
                return;
            }

            routePoints.forEach(point => {
                allPointsWithTime.push({
                    ...point,
                    routeId: route.id,
                    routeIndex: routeIndex,
                    timestamp: new Date(point.timestamp)
                });
            });

            totalDistance += route.distance || 0;
            totalElevationGain += route.elevationGain || 0;
            totalElevationLoss += route.elevationLoss || 0;
            totalDuration += route.duration || 0;
        });

        if (allPointsWithTime.length === 0) {
            throw new Error('No timestamped points found in selected routes');
        }

        // Sort all points by timestamp
        allPointsWithTime.sort((a, b) => a.timestamp - b.timestamp);

        const startTime = allPointsWithTime[0].timestamp;
        const endTime = allPointsWithTime[allPointsWithTime.length - 1].timestamp;
        const totalTimespan = endTime - startTime; // in milliseconds

        console.log(`📅 Time range: ${startTime.toISOString()} to ${endTime.toISOString()}`);
        console.log(`⏱️ Total timespan: ${Math.round(totalTimespan / 1000 / 60)} minutes`);

        // Determine time step based on total timespan
        let timeStepMs;
        let stepLabel;
        
        if (totalTimespan < 2 * 60 * 60 * 1000) { // Less than 2 hours
            timeStepMs = 60 * 1000; // 1 minute
            stepLabel = 'minute';
        } else if (totalTimespan < 48 * 60 * 60 * 1000) { // Less than 48 hours
            timeStepMs = 60 * 60 * 1000; // 1 hour
            stepLabel = 'hour';
        } else {
            timeStepMs = 24 * 60 * 60 * 1000; // 1 day
            stepLabel = 'day';
        }

        console.log(`⏰ Using ${stepLabel} time steps (${timeStepMs / 1000}s intervals)`);

        // Create time-based aggregated points
        const aggregatedPoints = [];
        let cumulativeClimbing = 0;
        let lastElevationByRoute = new Map(); // Track last elevation for each route for cumulative mode

        for (let currentTime = startTime; currentTime <= endTime; currentTime = new Date(currentTime.getTime() + timeStepMs)) {
            const nextTime = new Date(currentTime.getTime() + timeStepMs);
            
            // Find points within this time step
            const pointsInStep = allPointsWithTime.filter(point => 
                point.timestamp >= currentTime && point.timestamp < nextTime
            );

            if (pointsInStep.length === 0) continue;

            // Calculate max elevation and other stats for this time step
            let maxElevation = Math.max(...pointsInStep.map(p => p.elevation || 0));
            let avgLat = pointsInStep.reduce((sum, p) => sum + p.lat, 0) / pointsInStep.length;
            let avgLon = pointsInStep.reduce((sum, p) => sum + p.lon, 0) / pointsInStep.length;

            if (elevationMode === 'cumulative') {
                // Calculate climbing within this time step for each route
                let stepClimbing = 0;
                
                // Group points by route to calculate climbing per route
                const pointsByRoute = new Map();
                pointsInStep.forEach(point => {
                    if (!pointsByRoute.has(point.routeId)) {
                        pointsByRoute.set(point.routeId, []);
                    }
                    pointsByRoute.get(point.routeId).push(point);
                });

                pointsByRoute.forEach((routePoints, routeId) => {
                    routePoints.sort((a, b) => a.timestamp - b.timestamp);
                    
                    const lastElevation = lastElevationByRoute.get(routeId) || routePoints[0].elevation;
                    let routeStepClimbing = 0;
                    let currentElevation = lastElevation;

                    routePoints.forEach(point => {
                        if (point.elevation > currentElevation) {
                            routeStepClimbing += (point.elevation - currentElevation);
                        }
                        currentElevation = point.elevation;
                    });

                    stepClimbing += routeStepClimbing;
                    lastElevationByRoute.set(routeId, currentElevation);
                });

                cumulativeClimbing += stepClimbing;
                maxElevation = cumulativeClimbing;
                
                console.log(`📈 Time step ${currentTime.toISOString()}: +${stepClimbing.toFixed(1)}m climbing, total: ${cumulativeClimbing.toFixed(1)}m`);
            }

            aggregatedPoints.push({
                lat: avgLat,
                lon: avgLon,
                elevation: maxElevation,
                timestamp: currentTime.toISOString(),
                timeStep: stepLabel,
                pointCount: pointsInStep.length
            });
        }

        // Ensure total elevation gain is preserved for cumulative mode
        if (elevationMode === 'cumulative' && cumulativeClimbing < totalElevationGain) {
            const adjustment = totalElevationGain - cumulativeClimbing;
            if (aggregatedPoints.length > 0) {
                aggregatedPoints[aggregatedPoints.length - 1].elevation += adjustment;
                console.log(`📊 Applied final elevation adjustment: +${adjustment.toFixed(1)}m to preserve total gain`);
            }
        }

        // Create the aggregated route object
        const aggregatedRoute = {
            id: this.generateRouteId(),
            filename: `Aggregated Route (${routes.length} routes) - ${elevationMode === 'actual' ? 'Time-based' : 'Time-based Cumulative'}`,
            points: aggregatedPoints,
            distance: totalDistance,
            elevationGain: totalElevationGain,
            elevationLoss: totalElevationLoss,
            duration: totalDuration,
            uploadTime: Date.now(),
            metadata: {
                name: `Time-based Aggregated Route - ${routes.map(r => r.filename).join(', ')}`,
                description: `Spatially connected and time-aggregated from ${routes.length} routes using ${stepLabel} intervals with ${elevationMode} elevation`,
                aggregationMode: 'time',
                elevationMode: elevationMode,
                timeStep: stepLabel,
                timeStepMs: timeStepMs,
                sourceRoutes: routes.map(r => ({
                    id: r.id,
                    filename: r.filename,
                    timestamp: this.extractRouteTimestamp(r)
                }))
            }
        };

        console.log(`✅ Time-based aggregated route created:`, {
            filename: aggregatedRoute.filename,
            totalPoints: aggregatedRoute.points.length,
            timeStep: stepLabel,
            spatiallyConnected: true,
            totalDistance: aggregatedRoute.distance.toFixed(1),
            totalElevationGain: Math.round(aggregatedRoute.elevationGain),
            sourceRoutes: aggregatedRoute.metadata.sourceRoutes.length
        });

        return aggregatedRoute;
    }

    // Start route aggregation process (legacy method - now redirects to new modal)
    startAggregation() {
        this.showAggregationOptions();
    }

    // Create aggregated route from selected routes
    createAggregatedRoute(routes) {
        if (routes.length === 0) {
            throw new Error('No routes provided for aggregation');
        }

        // Sort routes chronologically by timestamp or upload time
        const sortedRoutes = [...routes].sort((a, b) => {
            const timeA = this.extractRouteTimestamp(a);
            const timeB = this.extractRouteTimestamp(b);
            return timeA - timeB;
        });

        console.log('📅 Routes sorted chronologically:', sortedRoutes.map(r => ({
            filename: r.filename,
            timestamp: this.extractRouteTimestamp(r)
        })));

        // Initialize aggregated route data
        let aggregatedPoints = [];
        let totalDistance = 0;
        let totalElevationGain = 0;
        let totalElevationLoss = 0;
        let totalDuration = 0;
        let lastEndPoint = null;

        // Process each route in chronological order
        for (let i = 0; i < sortedRoutes.length; i++) {
            const route = sortedRoutes[i];
            // Clone the route points to avoid modifying the original data
            const routePoints = route.points.map(point => ({
                ...point,
                lat: point.lat,
                lon: point.lon,
                elevation: point.elevation,
                timestamp: point.timestamp
            }));

            console.log(`🔧 Processing route ${i + 1}/${sortedRoutes.length}: ${route.filename} (${routePoints.length} points)`);

            if (routePoints.length === 0) {
                console.warn(`⚠️ Skipping route ${route.filename} - no points`);
                continue;
            }

            // For routes after the first, calculate offset to connect to previous route's end
            if (i > 0 && lastEndPoint && routePoints.length > 0) {
                const currentStartPoint = routePoints[0];
                const offsetLat = lastEndPoint.lat - currentStartPoint.lat;
                const offsetLon = lastEndPoint.lon - currentStartPoint.lon;
                const offsetElevation = (lastEndPoint.elevation || 0) - (currentStartPoint.elevation || 0);

                console.log(`🔗 Applying offset to route ${i + 1}:`, {
                    lat: offsetLat,
                    lon: offsetLon,
                    elevation: offsetElevation
                });

                // Apply offset to all points in this cloned route
                routePoints.forEach(point => {
                    point.lat += offsetLat;
                    point.lon += offsetLon;
                    if (point.elevation !== undefined) {
                        point.elevation += offsetElevation;
                    }
                });

                console.log(`📍 Route ${i + 1} repositioned - start:`, routePoints[0], 'end:', routePoints[routePoints.length - 1]);
            }

            // Add this route's points to the aggregated route
            // Skip the first point of subsequent routes to avoid duplication at connection points
            const pointsToAdd = i === 0 ? routePoints : routePoints.slice(1);
            aggregatedPoints.push(...pointsToAdd);

            // Update totals
            totalDistance += route.distance || 0;
            totalElevationGain += route.elevationGain || 0;
            totalElevationLoss += route.elevationLoss || 0;
            totalDuration += route.duration || 0;

            // Update last end point for next route
            lastEndPoint = routePoints[routePoints.length - 1];
        }

        // Create the aggregated route object
        const aggregatedRoute = {
            id: this.generateRouteId(),
            filename: `Aggregated Route (${sortedRoutes.length} routes)`,
            points: aggregatedPoints,
            distance: totalDistance,
            elevationGain: totalElevationGain,
            elevationLoss: totalElevationLoss,
            duration: totalDuration,
            uploadTime: Date.now(),
            metadata: {
                name: `Aggregated Route - ${sortedRoutes.map(r => r.filename).join(', ')}`,
                description: `Combined from ${sortedRoutes.length} individual routes using chronological stitching`,
                sourceRoutes: sortedRoutes.map(r => ({
                    id: r.id,
                    filename: r.filename,
                    timestamp: this.extractRouteTimestamp(r)
                }))
            }
        };

        console.log(`✅ Aggregated route created:`, {
            filename: aggregatedRoute.filename,
            totalPoints: aggregatedRoute.points.length,
            totalDistance: aggregatedRoute.distance.toFixed(1),
            totalElevationGain: Math.round(aggregatedRoute.elevationGain),
            sourceRoutes: aggregatedRoute.metadata.sourceRoutes.length
        });

        return aggregatedRoute;
    }

    // Create fictional route aggregation
    createFictionalRouteAggregation(routes, elevationMode, pathPattern) {
        console.log(`🎨 Creating fictional route with ${pathPattern} pattern and ${elevationMode} elevation...`);
        
        // First, get all points from all routes in chronological order (like distance-based aggregation)
        let allPoints = [];
        let totalDistance = 0;
        let totalElevationGain = 0;
        let totalElevationLoss = 0;
        let totalDuration = 0;

        routes.forEach(route => {
            // Add all points from this route while preserving elevation and timing
            route.points.forEach(point => {
                allPoints.push({
                    elevation: point.elevation,
                    timestamp: point.timestamp,
                    originalLat: point.lat,
                    originalLon: point.lon
                });
            });

            totalDistance += route.distance || 0;
            totalElevationGain += route.elevationGain || 0;
            totalElevationLoss += route.elevationLoss || 0;
            totalDuration += route.duration || 0;
        });

        if (allPoints.length === 0) {
            throw new Error('No points found in routes for fictional generation');
        }

        console.log(`🔧 Processing ${allPoints.length} points for fictional ${pathPattern} route...`);

        // Generate fictional coordinates based on path pattern
        let fictionalPoints;
        if (pathPattern === 'switchbacks') {
            fictionalPoints = this.generateSwitchbackPath(allPoints, elevationMode);
        } else {
            throw new Error(`Unknown path pattern: ${pathPattern}`);
        }

        // Create the aggregated route object
        const aggregatedRoute = {
            id: this.generateRouteId(),
            filename: `Fictional Route (${routes.length} routes) - ${pathPattern} ${elevationMode === 'actual' ? 'Elevation' : 'Cumulative'}`,
            points: fictionalPoints,
            distance: totalDistance,
            elevationGain: totalElevationGain,
            elevationLoss: totalElevationLoss,
            duration: totalDuration,
            uploadTime: Date.now(),
            metadata: {
                name: `Fictional ${pathPattern} Route - ${routes.map(r => r.filename).join(', ')}`,
                description: `Synthetic ${pathPattern} route preserving elevation and timing from ${routes.length} routes with ${elevationMode} elevation`,
                aggregationMode: 'fictional',
                elevationMode: elevationMode,
                pathPattern: pathPattern,
                sourceRoutes: routes.map(r => ({
                    id: r.id,
                    filename: r.filename,
                    timestamp: this.extractRouteTimestamp(r)
                }))
            }
        };

        console.log(`✅ Fictional ${pathPattern} route created:`, {
            filename: aggregatedRoute.filename,
            totalPoints: aggregatedRoute.points.length,
            pathPattern: pathPattern,
            totalDistance: aggregatedRoute.distance.toFixed(1),
            totalElevationGain: Math.round(aggregatedRoute.elevationGain),
            sourceRoutes: aggregatedRoute.metadata.sourceRoutes.length
        });

        return aggregatedRoute;
    }

    // Generate switchback path coordinates
    generateSwitchbackPath(points, elevationMode) {
        console.log('⛰️ Generating switchback path pattern...');
        
        // Define circle parameters for realistic mountain proportions
        const centerLat = 0; // We'll center at origin for simplicity
        const centerLon = 0;
        const maxRadius = 0.4; // ~40km radius in degrees for realistic mountain scale
        const border = maxRadius * 0.05; // 5% border around edge
        const usableRadius = maxRadius - border;
        
        // First, process elevation data properly to preserve accuracy
        let processedPoints = [];
        
        if (elevationMode === 'cumulative') {
            // For cumulative mode, we need to calculate the cumulative climbing properly
            // This should track total positive elevation change across all points
            console.log('📈 Processing cumulative climbing across all routes...');
            
            let cumulativeClimbing = 0;
            let lastElevation = null;
            
            for (let i = 0; i < points.length; i++) {
                const point = points[i];
                
                // Track cumulative positive elevation gain
                if (lastElevation !== null && point.elevation > lastElevation) {
                    cumulativeClimbing += (point.elevation - lastElevation);
                }
                lastElevation = point.elevation;
                
                processedPoints.push({
                    ...point,
                    elevation: cumulativeClimbing, // Set elevation to cumulative climbing total
                    originalElevation: point.elevation, // Keep original for reference
                    progress: i / (points.length - 1) // 0 to 1
                });
            }
            
            console.log(`📊 Total cumulative climbing calculated: ${cumulativeClimbing.toFixed(1)}m`);
            
        } else {
            // For actual elevation mode, just preserve the original elevations
            for (let i = 0; i < points.length; i++) {
                const point = points[i];
                processedPoints.push({
                    ...point,
                    elevation: point.elevation, // Keep exact original elevation
                    progress: i / (points.length - 1) // 0 to 1
                });
            }
        }
        
        const maxElevation = Math.max(...processedPoints.map(p => p.elevation));
        const minElevation = Math.min(...processedPoints.map(p => p.elevation));
        const elevationRange = maxElevation - minElevation;
        
        console.log(`📊 Elevation range: ${minElevation.toFixed(1)}m to ${maxElevation.toFixed(1)}m (${elevationRange.toFixed(1)}m range)`);
        
        // Scale elevations to a normalized range of 0-10000m
        // This provides good 3D visualization without being too extreme
        const maxScaledHeight = 10000; // 10km max height for good 3D appearance
        const elevationScale = elevationRange > 0 ? maxScaledHeight / elevationRange : 1;
        
        console.log(`📏 Scaling elevation by factor ${elevationScale.toFixed(4)} to normalize range 0-${maxScaledHeight}m`);
        
        // Apply scaling to all processed points
        processedPoints.forEach(point => {
            point.scaledElevation = (point.elevation - minElevation) * elevationScale;
            point.originalElevation = point.elevation; // Keep original for reference
        });
        
        // Calculate number of switchbacks based on elevation range and route length
        const numSwitchbacks = Math.max(4, Math.min(10, Math.floor(elevationRange / 100))); // 4-10 switchbacks
        console.log(`🔄 Creating ${numSwitchbacks} switchbacks for elevation range of ${elevationRange.toFixed(1)}m`);
        
        // More points for ultra-smooth switchbacks and curves
        const targetPoints = Math.max(processedPoints.length, 10000); // 10k points for smooth curves
        let interpolatedPoints = [];
        
        // Interpolate to get more points for smoother switchbacks
        for (let i = 0; i < targetPoints; i++) {
            const progress = i / (targetPoints - 1);
            const sourceIndex = progress * (processedPoints.length - 1);
            const lowerIndex = Math.floor(sourceIndex);
            const upperIndex = Math.min(Math.ceil(sourceIndex), processedPoints.length - 1);
            const t = sourceIndex - lowerIndex;
            
            const lowerPoint = processedPoints[lowerIndex];
            const upperPoint = processedPoints[upperIndex];
            
            // Interpolate both original and scaled elevation
            const originalElevation = lowerPoint.elevation + (upperPoint.elevation - lowerPoint.elevation) * t;
            const scaledElevation = lowerPoint.scaledElevation + (upperPoint.scaledElevation - lowerPoint.scaledElevation) * t;
            const timestamp = lowerPoint.timestamp; // Use closest timestamp
            
            interpolatedPoints.push({
                elevation: originalElevation, // Keep original elevation for data integrity
                scaledElevation: scaledElevation, // Use scaled elevation for 3D visualization
                timestamp: timestamp,
                progress: progress
            });
        }
        
        console.log(`🔄 Interpolated to ${interpolatedPoints.length} points for ultra-smooth switchbacks`);
        
        return interpolatedPoints.map((point, i) => {
            const progress = point.progress;
            const originalElevation = point.elevation; // Preserve original elevation for data integrity
            const visualElevation = point.scaledElevation; // Use scaled elevation for realistic 3D appearance
            
            // Generate switchback pattern
            let lat, lon;
            
            if (progress < 0.3) {
                // Extended meandering approach from circle edge to center
                const meanderProgress = progress / 0.3; // 0 to 1 over first 30%
                
                // Start near the edge and spiral inward
                const startRadius = usableRadius * 0.99; // Start at 99% of radius (near edge)
                const endRadius = usableRadius * 0.5; // End at 50% radius (middle area)
                const currentRadius = startRadius - (startRadius - endRadius) * meanderProgress;
                
                // Create spiral motion with meandering
                const spiralTurns = 2; // 2 full turns as we meander inward
                const baseAngle = meanderProgress * spiralTurns * 2 * Math.PI; // Multiple turns
                const meanderOffset = Math.sin(meanderProgress * Math.PI * 12) * usableRadius * 0.08; // More detailed wandering
                const secondaryMeander = Math.cos(meanderProgress * Math.PI * 18) * usableRadius * 0.04; // Fine detail
                
                lat = centerLat + Math.cos(baseAngle) * (currentRadius + meanderOffset);
                lon = centerLon + Math.sin(baseAngle) * (currentRadius + meanderOffset + secondaryMeander);
                
            } else {
                // Switchback section: ultra-smooth switchbacks with gentle curves
                const switchbackProgress = (progress - 0.3) / 0.7; // 0 to 1 for switchback section
                
                // Calculate which switchback we're in
                const switchbackPosition = switchbackProgress * numSwitchbacks;
                const currentSwitchback = Math.floor(switchbackPosition);
                const switchbackPhase = switchbackPosition - currentSwitchback; // 0 to 1 within current switchback
                
                // Prevent going beyond last switchback
                const clampedSwitchback = Math.min(currentSwitchback, numSwitchbacks - 1);
                
                // Vertical position: spread switchbacks evenly from bottom to top
                const verticalProgress = clampedSwitchback / Math.max(1, numSwitchbacks - 1);
                const baseRadius = usableRadius * (0.15 + verticalProgress * 0.5); // 15% to 65% radius based on height
                const baseAngle = -Math.PI/2 + verticalProgress * Math.PI; // -90° to +90°
                
                // Horizontal oscillation: create the switchback pattern with smooth curves
                const isRightToLeft = clampedSwitchback % 2 === 0;
                
                // Ultra-smooth switchback curves - longer transitions, gentler turns
                let lateralOffset = 0;
                
                if (switchbackPhase < 0.25) {
                    // Extended curve entry (25% of switchback)
                    const curveT = switchbackPhase / 0.25;
                    // Use smooth sine transition instead of sharp cosine
                    const smoothT = 0.5 - 0.5 * Math.cos(curveT * Math.PI);
                    const direction = isRightToLeft ? 1 : -1;
                    lateralOffset = direction * usableRadius * 0.5 * (1 - smoothT);
                    
                } else if (switchbackPhase > 0.75) {
                    // Extended curve exit (25% of switchback)
                    const curveT = (switchbackPhase - 0.75) / 0.25;
                    // Use smooth sine transition
                    const smoothT = 0.5 - 0.5 * Math.cos(curveT * Math.PI);
                    const direction = isRightToLeft ? -1 : 1;
                    lateralOffset = direction * usableRadius * 0.5 * (1 - smoothT);
                    
                } else {
                    // Straight section of switchback (50% of switchback)
                    const straightProgress = (switchbackPhase - 0.25) / 0.5; // 0 to 1 for straight section
                    const direction = isRightToLeft ? (1 - straightProgress) : straightProgress;
                    lateralOffset = (direction * 2 - 1) * usableRadius * 0.5; // -50% to +50% of radius
                }
                
                // Calculate final position
                lat = centerLat + Math.cos(baseAngle) * baseRadius;
                lon = centerLon + Math.sin(baseAngle) * baseRadius + 
                      Math.cos(baseAngle + Math.PI/2) * lateralOffset;
            }
            
            // Ensure we stay within bounds
            const distanceFromCenter = Math.sqrt(lat*lat + lon*lon);
            if (distanceFromCenter > usableRadius) {
                const scale = usableRadius / distanceFromCenter;
                lat *= scale;
                lon *= scale;
            }
            
            return {
                lat: lat,
                lon: lon,
                elevation: visualElevation, // Use scaled elevation for realistic 3D mountain appearance
                originalElevation: originalElevation, // Preserve original data for reference/export
                timestamp: point.timestamp
            };
        });
    }

    // Extract timestamp from route for sorting
    extractRouteTimestamp(route) {
        // Try multiple sources for timestamp, prioritize earliest point time
        let timestamp = null;
        
        // 1. Check first GPS point with timestamp
        if (route.points && route.points.length > 0) {
            for (const point of route.points) {
                if (point.timestamp) {
                    timestamp = new Date(point.timestamp);
                    break;
                }
            }
        }
        
        // 2. Check metadata time
        if (!timestamp && route.metadata?.time) {
            try {
                timestamp = new Date(route.metadata.time);
            } catch (e) {
                console.warn(`Invalid metadata time for ${route.filename}:`, route.metadata.time);
            }
        }
        
        // 3. Fall back to upload time
        if (!timestamp && route.uploadTime) {
            timestamp = new Date(route.uploadTime);
        }
        
        // 4. Use current time as last resort
        if (!timestamp) {
            timestamp = new Date();
            console.warn(`No timestamp found for ${route.filename}, using current time`);
        }
        
        return timestamp;
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
            // Add only selected routes to the map (or all if none are specifically selected)
            if (this.isShowingAggregated && this.aggregatedRoute) {
                // Show aggregated route
                this.mapViz.addRoute(this.aggregatedRoute);
            } else {
                // Show selected individual routes
                this.uploadedRoutes.forEach(route => {
                    if (this.selectedRoutes.has(route.id)) {
                        this.mapViz.addRoute(route);
                    }
                });

                // If no routes are selected, show all routes (for initial load)
                if (this.selectedRoutes.size === 0 && this.uploadedRoutes.length > 0) {
                    this.uploadedRoutes.forEach(route => {
                        this.selectedRoutes.add(route.id);
                        this.mapViz.addRoute(route);
                    });
                }
            }
            
            console.log('🗺️ Map visualization initialized with selected routes');
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
            // Add selected routes to the 3D viewer
            console.log(`🔄 Attempting to add selected routes to 3D viewer...`);
            
            if (this.isShowingAggregated && this.aggregatedRoute) {
                // Show aggregated route
                console.log(`➕ Adding aggregated route to 3D viewer:`, this.aggregatedRoute.filename);
                this.viewer3D.addRoute(this.aggregatedRoute);
            } else {
                // Show selected individual routes
                this.uploadedRoutes.forEach((route, index) => {
                    if (this.selectedRoutes.has(route.id)) {
                        console.log(`➕ Adding selected route ${index + 1} to 3D viewer:`, route.filename);
                        
                        if (!route.points || route.points.length === 0) {
                            console.warn(`⚠️ Route ${route.filename} has no points data!`);
                            return;
                        }
                        
                        this.viewer3D.addRoute(route);
                    }
                });
            }
            
            console.log('🎮 3D visualization initialized with selected routes');
            
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
            // Only add if route is selected for display and we're not showing aggregated route
            if (!this.isShowingAggregated && this.selectedRoutes.has(route.id)) {
                console.log(`➕ Adding new selected route to initialized 3D viewer: ${route.filename}`);
                this.viewer3D.addRoute(route);
            }
        } else {
            console.log(`📝 3D viewer not initialized, route will be added when 3D view is accessed: ${route.filename}`);
        }
    }

    // Update the route list display
    updateRouteList() {
        const routeListContainer = document.getElementById('route-list');
        if (!routeListContainer) return;

        if (this.uploadedRoutes.length === 0 && !this.aggregatedRoute) {
            routeListContainer.innerHTML = '<p class="empty-state">No routes uploaded yet</p>';
            return;
        }

        let routeItems = '';

        // Show aggregated route if it exists and is being displayed
        if (this.aggregatedRoute && this.isShowingAggregated) {
            const color = '#ff6b35'; // Orange color for aggregated route
            const duration = this.aggregatedRoute.duration ? this.formatDuration(this.aggregatedRoute.duration) : 'Unknown';
            
            routeItems += `
                <div class="route-list-item aggregated-route" data-route-id="${this.aggregatedRoute.id}">
                    <div class="route-item-checkbox">
                        <input type="checkbox" id="route-checkbox-${this.aggregatedRoute.id}" 
                               checked onchange="window.fileUploader.toggleRouteVisibility('${this.aggregatedRoute.id}')">
                    </div>
                    <div class="route-item-info">
                        <h4>🔗 ${this.aggregatedRoute.filename}</h4>
                        <div class="route-item-stats">
                            <span>📏 ${this.aggregatedRoute.distance.toFixed(1)}km</span>
                            <span>⛰️ ${Math.round(this.aggregatedRoute.elevationGain)}m</span>
                            <span>⏱️ ${duration}</span>
                        </div>
                    </div>
                    <div class="route-item-color" style="background-color: ${color}"></div>
                    <div class="route-item-actions">
                        <button class="route-action-btn" onclick="window.fileUploader.downloadRoute('${this.aggregatedRoute.id}')" title="Download GPX">
                            💾
                        </button>
                        <button class="route-action-btn" onclick="window.fileUploader.zoomToRoute('${this.aggregatedRoute.id}')" title="Zoom to Route">
                            🔍
                        </button>
                        <button class="route-action-btn" onclick="window.fileUploader.removeAggregatedRoute()" title="Remove Aggregated Route">
                            🗑️
                        </button>
                    </div>
                </div>
            `;
        }

        // Show individual routes (always show them, but may be unchecked)
        routeItems += this.uploadedRoutes.map((route, index) => {
            const color = this.mapViz.routeLayers.find(layer => layer.id === route.id)?.color || '#2563eb';
            const duration = route.duration ? this.formatDuration(route.duration) : 'Unknown';
            const isSelected = this.selectedRoutes.has(route.id);
            
            return `
                <div class="route-list-item ${isSelected ? 'selected' : 'unselected'}" data-route-id="${route.id}">
                    <div class="route-item-checkbox">
                        <input type="checkbox" id="route-checkbox-${route.id}" 
                               ${isSelected ? 'checked' : ''} 
                               onchange="window.fileUploader.toggleRouteVisibility('${route.id}')">
                    </div>
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
                        <button class="route-action-btn" onclick="window.fileUploader.downloadRoute('${route.id}')" title="Download GPX">
                            💾
                        </button>
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

    // Download a route as GPX file
    downloadRoute(routeId) {
        let routeToDownload = null;
        let filename = 'route.gpx';

        // Find the route to download (could be aggregated or individual)
        if (routeId === this.aggregatedRoute?.id) {
            routeToDownload = this.aggregatedRoute;
            filename = `${this.aggregatedRoute.filename.replace(/[^a-z0-9]/gi, '_')}.gpx`;
        } else {
            routeToDownload = this.uploadedRoutes.find(route => route.id === routeId);
            if (routeToDownload) {
                filename = `${routeToDownload.filename.replace(/\.gpx$/i, '').replace(/[^a-z0-9]/gi, '_')}.gpx`;
            }
        }

        if (!routeToDownload) {
            alert('Route not found for download.');
            return;
        }

        try {
            // Generate GPX content
            const gpxContent = this.generateGPXContent(routeToDownload);
            
            // Create download
            this.downloadFile(gpxContent, filename, 'application/gpx+xml');
            
            console.log(`📥 Downloaded route: ${filename}`);
        } catch (error) {
            console.error('❌ Failed to download route:', error);
            alert('Failed to download route. Please check the console for details.');
        }
    }

    // Generate GPX content from route data
    generateGPXContent(route) {
        const now = new Date().toISOString();
        const routeName = route.metadata?.name || route.filename || 'Route';
        const routeDescription = route.metadata?.description || `Generated route with ${route.points.length} points`;

        // GPX header
        let gpx = `<?xml version="1.0" encoding="UTF-8"?>
<gpx version="1.1" creator="RouteCoinMe" xmlns="http://www.topografix.com/GPX/1/1" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" xsi:schemaLocation="http://www.topografix.com/GPX/1/1 http://www.topografix.com/GPX/1/1/gpx.xsd">
  <metadata>
    <name>${this.escapeXml(routeName)}</name>
    <desc>${this.escapeXml(routeDescription)}</desc>
    <time>${now}</time>
  </metadata>
  <trk>
    <name>${this.escapeXml(routeName)}</name>
    <desc>${this.escapeXml(routeDescription)}</desc>
    <trkseg>
`;

        // Add track points
        route.points.forEach(point => {
            gpx += `      <trkpt lat="${point.lat}" lon="${point.lon}">
`;
            if (point.elevation !== undefined && point.elevation !== null) {
                gpx += `        <ele>${point.elevation}</ele>
`;
            }
            if (point.timestamp) {
                const timestamp = new Date(point.timestamp).toISOString();
                gpx += `        <time>${timestamp}</time>
`;
            }
            gpx += `      </trkpt>
`;
        });

        // GPX footer
        gpx += `    </trkseg>
  </trk>
</gpx>`;

        return gpx;
    }

    // Escape XML special characters
    escapeXml(text) {
        if (typeof text !== 'string') return text;
        return text
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#39;');
    }

    // Download file helper
    downloadFile(content, filename, mimeType = 'text/plain') {
        const blob = new Blob([content], { type: mimeType });
        const url = URL.createObjectURL(blob);
        
        const link = document.createElement('a');
        link.href = url;
        link.download = filename;
        link.style.display = 'none';
        
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        
        // Clean up the URL object
        setTimeout(() => URL.revokeObjectURL(url), 100);
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
        
        // Remove from selected routes
        this.selectedRoutes.delete(routeId);
        
        // Remove from map
        this.mapViz.removeRoute(routeId);
        
        // Remove from 3D viewer if initialized
        if (this.is3DInitialized && this.viewer3D) {
            this.viewer3D.removeRoute(routeId);
        }
        
        // Update UI
        this.updateRouteList();
        this.saveRoutesToStorage();
        
        // Update stats
        this.updateStatsDisplay();
        
        console.log(`🗑️ Route removed: ${routeId}`);
    }

    // Toggle route visibility
    toggleRouteVisibility(routeId) {
        const checkbox = document.getElementById(`route-checkbox-${routeId}`);
        const isChecked = checkbox?.checked || false;

        if (routeId === this.aggregatedRoute?.id) {
            // Handle aggregated route visibility
            if (isChecked) {
                this.showAggregatedRoute();
            } else {
                this.hideAggregatedRoute();
            }
            return;
        }

        // Handle individual route visibility
        if (isChecked) {
            this.selectedRoutes.add(routeId);
            this.showRoute(routeId);
        } else {
            this.selectedRoutes.delete(routeId);
            this.hideRoute(routeId);
        }

        // Update route list styling
        this.updateRouteList();
        console.log(`👁️ Route ${routeId} visibility: ${isChecked ? 'shown' : 'hidden'}`);
    }

    // Show a specific route
    showRoute(routeId) {
        const route = this.uploadedRoutes.find(r => r.id === routeId);
        if (!route) return;

        // Add to map
        this.mapViz.addRoute(route);

        // Add to 3D viewer if initialized
        if (this.is3DInitialized && this.viewer3D) {
            this.viewer3D.addRoute(route);
        }
    }

    // Hide a specific route
    hideRoute(routeId) {
        // Remove from map
        this.mapViz.removeRoute(routeId);

        // Remove from 3D viewer if initialized
        if (this.is3DInitialized && this.viewer3D) {
            this.viewer3D.removeRoute(routeId);
        }
    }

    // Show aggregated route
    showAggregatedRoute() {
        if (!this.aggregatedRoute) return;

        // Add to map
        this.mapViz.addRoute(this.aggregatedRoute);

        // Add to 3D viewer if initialized
        if (this.is3DInitialized && this.viewer3D) {
            this.viewer3D.addRoute(this.aggregatedRoute);
        }
    }

    // Hide aggregated route
    hideAggregatedRoute() {
        if (!this.aggregatedRoute) return;

        // Remove from map
        this.mapViz.removeRoute(this.aggregatedRoute.id);

        // Remove from 3D viewer if initialized
        if (this.is3DInitialized && this.viewer3D) {
            this.viewer3D.removeRoute(this.aggregatedRoute.id);
        }
    }

    // Remove aggregated route completely
    removeAggregatedRoute() {
        if (!this.aggregatedRoute) return;

        // Hide the aggregated route first
        this.hideAggregatedRoute();
        
        // Remember which routes were used for aggregation
        const sourceRouteIds = this.aggregatedRoute.metadata?.sourceRoutes?.map(r => r.id) || [];
        
        // Clear the aggregated route
        this.aggregatedRoute = null;
        this.isShowingAggregated = false;

        // Restore selection for the routes that were used in aggregation
        sourceRouteIds.forEach(routeId => {
            const route = this.uploadedRoutes.find(r => r.id === routeId);
            if (route) {
                this.selectedRoutes.add(routeId);
                this.showRoute(routeId);
            }
        });

        // Update UI
        this.updateRouteList();
        console.log(`🗑️ Aggregated route removed, restored ${sourceRouteIds.length} individual routes`);
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
