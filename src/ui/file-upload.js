// File Upload Handler for GPX Files
import GPXParser from '../data/gpx-parser.js';
import RouteMapVisualization from '../visualization/route-map.js';
import Route3DVisualization from '../visualization/route-3d.js';
import RouteStorageManager from '../data/route-storage.js';
import RouteManipulator from '../data/route-manipulator.js';

class FileUploadHandler {
    constructor() {
        this.parser = new GPXParser();
        this.mapViz = new RouteMapVisualization();
        this.viewer3D = new Route3DVisualization();
        this.routeManipulator = new RouteManipulator();
        this.storageManager = null; // Will be initialized in initializeStorage()
        this.uploadedRoutes = [];
        this.maxFiles = 10; // Reduced from 20 to help with storage limits
        this.selectedRoutes = new Set(); // For tracking selected routes for display
        this.aggregatedRoute = null; // Store the aggregated route when created
        this.isShowingAggregated = false; // Track if we're showing aggregated route
        this.currentViewMode = 'map'; // 'map' or '3d'
        this.is3DInitialized = false; // Track if 3D viewer has been initialized
        
        // State management system
        this.stateListeners = new Set();
        this.deferredUpdates = false;
        this.notificationInProgress = false;
        this.notificationQueue = []; // Queue for pending notifications
        
        this.init();
    }

    async init() {
        this.setupFileInput();
        this.setupDropZone();
        this.setupViewToggleButtons();
        await this.initializeStorage();
        
        // Set up centralized state listener
        this.setupStateListener();
        
        // Initialize the map visualization
        this.initializeMapVisualization();
        
        // Show initial UI state
        this.showInitialUIState();
        
        await this.loadStoredRoutes();
    }

    // Add state change listeners
    addStateListener(listenerFn) {
        this.stateListeners.add(listenerFn);
        return () => this.stateListeners.delete(listenerFn); // Return cleanup function
    }

    // Smart notification system with queueing
    notifyStateChange(changeType = 'state-changed', data = {}) {
        // Skip during deferred updates
        if (this.deferredUpdates) return;

        // If notification is in progress, queue this one
        if (this.notificationInProgress) {
            console.log(`📋 Queuing notification: ${changeType}`);
            this.notificationQueue.push({ changeType, data });
            return;
        }

        // Process this notification immediately
        this.processNotification(changeType, data);
        
        // Process any queued notifications
        this.processQueuedNotifications();
    }

    // Process a single notification
    processNotification(changeType, data) {
        console.log(`🔔 Processing state change: ${changeType}`, data);
        
        // Set notification lock
        this.notificationInProgress = true;
        
        try {
            this.stateListeners.forEach(listener => {
                try {
                    listener(changeType, data, this);
                } catch (error) {
                    console.error('❌ State listener error:', error);
                }
            });
        } finally {
            // Always release the lock
            this.notificationInProgress = false;
        }
    }

    // Process all queued notifications
    processQueuedNotifications() {
        while (this.notificationQueue.length > 0 && !this.notificationInProgress) {
            const { changeType, data } = this.notificationQueue.shift();
            console.log(`📤 Processing queued notification: ${changeType}`);
            this.processNotification(changeType, data);
        }
    }

    // Batch multiple state changes
    withDeferredUpdates(fn) {
        this.deferredUpdates = true;
        try {
            fn();
        } finally {
            this.deferredUpdates = false;
            
            // Process the batch completion and any queued notifications
            this.notifyStateChange('batch-complete');
        }
    }

    // Clear notification queue (useful for debugging/testing)
    clearNotificationQueue() {
        const queueLength = this.notificationQueue.length;
        this.notificationQueue = [];
        console.log(`🗑️ Cleared ${queueLength} queued notifications`);
        return queueLength;
    }

    // Get current queue status (for debugging)
    getNotificationQueueStatus() {
        return {
            inProgress: this.notificationInProgress,
            queueLength: this.notificationQueue.length,
            deferredMode: this.deferredUpdates,
            queuedItems: this.notificationQueue.map(item => item.changeType)
        };
    }

    // Debug queue status (accessible via console: window.fileUploader.debugNotifications())
    debugNotifications() {
        const status = this.getNotificationQueueStatus();
        console.log('📊 Notification System Status:', status);
        return status;
    }

    // Centralized state listener
    setupStateListener() {
        this.addStateListener((changeType, data, fileHandler) => {
            console.log(`🎯 Handling UI update for: ${changeType}`);
            
            switch (changeType) {
                case 'loading-started':
                    this.handleLoadingStarted(data);
                    break;
                    
                case 'loading-finished':
                    this.handleLoadingFinished(data);
                    break;
                    
                case 'selected-routes-changed':
                    this.handleSelectedRoutesChanged(data);
                    break;
                    
                case 'batch-complete':
                    this.handleBatchComplete(data);
                    break;
                    
                default:
                    // For simple state changes, ensure UI state and refresh
                    if (this.uploadedRoutes.length > 0) {
                        const routeVisualizationArea = document.getElementById('route-visualization-area');
                        if (routeVisualizationArea && routeVisualizationArea.style.display === 'none') {
                            this.showRoutesUI();
                        }
                    }
                    this.updateRouteList();
                    this.updateStatsDisplay();
            }
        });
    }

    // Specific change handlers
    handleLoadingStarted(data) {
        console.log('⏳ Loading started - showing loading state');
        this.showLoadingState();
    }

    handleLoadingFinished(data) {
        console.log('✅ Loading finished - hiding loading state and ensuring routes UI');
        this.hideLoadingState();
        
        // Switch to routes UI if we have routes
        if (this.uploadedRoutes.length > 0) {
            this.showRoutesUI();
            // Ensure map is initialized and routes are added when transitioning to routes UI
            this.initializeMapVisualization();
        }
        
        // Update route list and stats display (important for loaded routes from storage)
        this.updateRouteList();
        this.updateStatsDisplay();
    }

    handleBatchComplete(data) {
        console.log('🔄 Batch complete - refreshing visualizations');
        
        // Update the dynamic parts
        this.updateStatsDisplay();
        this.updateRouteList();
        
        // Refresh 3D if we're in 3D mode and it's initialized
        if (this.currentViewMode === '3d' && this.is3DInitialized) {
            console.log('🎮 Refreshing 3D viewer for batch completion...');
            this.refresh3DViewer();
        }
    }

    // UNIFIED HANDLER: Handle any change to what routes are selected/visible
    handleSelectedRoutesChanged(data) {
        console.log('🔄 Selected routes changed - redrawing all visualizations');
        
        // Ensure we're showing the routes UI
        this.showRoutesUI();

        // Clear ALL routes from visualizations first
        this.clearAllVisualizationsRoutes();
        
        // Add routes that should be visible
        if (this.isShowingAggregated && this.aggregatedRoute) {
            // Show only aggregated route
            console.log('➕ Adding aggregated route to visualizations');
            this.addRouteToAllVisualizations(this.aggregatedRoute);
        } else {
            // Show selected individual routes
            console.log(`➕ Adding ${this.selectedRoutes.size} selected routes to visualizations`);
            this.uploadedRoutes.forEach(route => {
                if (this.selectedRoutes.has(route.id)) {
                    console.log(`  - Adding route: ${route.filename} (${route.id})`);
                    this.addRouteToAllVisualizations(route);
                }
            });
        }
        
        // Update UI elements
        this.updateRouteList();
        this.updateStatsDisplay();
    }

    // Helper: Clear all routes from all visualizations
    clearAllVisualizationsRoutes() {
        // Clear map
        if (this.mapViz?.map) {
            this.uploadedRoutes.forEach(route => {
                this.mapViz.removeRoute(route.id);
            });
            if (this.aggregatedRoute) {
                this.mapViz.removeRoute(this.aggregatedRoute.id);
            }
        }
        
        // Clear 3D viewer
        if (this.is3DInitialized && this.viewer3D) {
            this.uploadedRoutes.forEach(route => {
                this.viewer3D.removeRoute(route.id);
            });
            if (this.aggregatedRoute) {
                this.viewer3D.removeRoute(this.aggregatedRoute.id);
            }
        }
    }

    // Helper: Add route to all visualizations
    addRouteToAllVisualizations(route) {
        // Add to map
        if (this.mapViz?.map) {
            this.mapViz.addRoute(route);
        }
        
        // Add to 3D viewer if it's active and initialized
        if (this.currentViewMode === '3d' && this.is3DInitialized && this.viewer3D?.isInitialized) {
            try {
                this.viewer3D.addRoute(route);
            } catch (error) {
                console.error(`❌ Failed to add route to 3D viewer:`, error);
            }
        }
    }

    // Legacy method - now delegated to event system
    refreshAllVisualizationsAndUI() {
        console.log('🔄 Legacy refresh method - delegating to batch-complete event...');
        this.notifyStateChange('batch-complete');
    }

    // Show the appropriate initial UI state
    showInitialUIState() {
        const landingState = document.getElementById('landing-state');
        const fileUploadSection = document.getElementById('file-upload-section');
        const routeVisualizationArea = document.getElementById('route-visualization-area');
        
        // Show landing state initially
        if (landingState) landingState.style.display = 'block';
        if (fileUploadSection) fileUploadSection.style.display = 'none';
        if (routeVisualizationArea) routeVisualizationArea.style.display = 'none';
        
        // Check if user is authenticated with Strava and show appropriate content
        if (window.stravaAuth) {
            // Check authentication status asynchronously
            window.stravaAuth.isAuthenticated().then(isAuthenticated => {
                if (isAuthenticated) {
                    window.stravaAuth.showAuthenticatedFeatures();
                }
            }).catch(error => {
                console.warn('⚠️ Failed to check authentication status:', error);
            });
        }
        
        console.log('🎨 Initial UI state displayed');
    }

    // Show file upload UI state
    showFileUploadUI() {
        const landingState = document.getElementById('landing-state');
        const fileUploadSection = document.getElementById('file-upload-section');
        const routeVisualizationArea = document.getElementById('route-visualization-area');
        
        if (landingState) landingState.style.display = 'none';
        if (fileUploadSection) fileUploadSection.style.display = 'block';
        if (routeVisualizationArea) routeVisualizationArea.style.display = 'none';
        
        console.log('📁 File upload UI displayed');
    }

    // Show routes visualization UI state
    showRoutesUI() {
        const landingState = document.getElementById('landing-state');
        const fileUploadSection = document.getElementById('file-upload-section');
        const routeVisualizationArea = document.getElementById('route-visualization-area');
        
        if (landingState) landingState.style.display = 'none';
        if (fileUploadSection) fileUploadSection.style.display = 'none';
        if (routeVisualizationArea) routeVisualizationArea.style.display = 'block';
        
        console.log('🗺️ Routes visualization UI displayed');
    }

    // Initialize map visualization
    initializeMapVisualization() {
        const mapElement = document.getElementById('route-map');
        if (!mapElement) {
            console.warn('⚠️ Map element not found during initialization');
            return;
        }

        // Initialize the map
        if (!this.mapViz.map) {
            const mapInitialized = this.mapViz.initializeMap(mapElement);
            if (mapInitialized) {
                console.log('🗺️ Map visualization initialized');
                
                // Only add routes if we have them and they're selected
                this.addSelectedRoutesToMap();
            } else {
                console.error('❌ Failed to initialize map visualization');
            }
        } else {
            console.log('🗺️ Map already initialized, adding selected routes');
            this.addSelectedRoutesToMap();
        }
    }

    // Helper method to add selected routes to map
    addSelectedRoutesToMap() {
        if (!this.mapViz?.map) {
            console.warn('⚠️ Map not ready, skipping route addition');
            return;
        }

        if (this.isShowingAggregated && this.aggregatedRoute) {
            // Show aggregated route
            console.log('🔗 Adding aggregated route to map');
            this.mapViz.addRoute(this.aggregatedRoute);
        } else if (this.uploadedRoutes.length > 0) {
            // Show selected individual routes
            let addedRoutes = 0;
            this.uploadedRoutes.forEach(route => {
                if (this.selectedRoutes.has(route.id)) {
                    console.log(`🗺️ Adding selected route to map: ${route.filename}`);
                    this.mapViz.addRoute(route);
                    addedRoutes++;
                }
            });

            // If no routes are selected but we have routes, auto-select all routes (for initial load)
            if (this.selectedRoutes.size === 0 && this.uploadedRoutes.length > 0) {
                console.log('🎯 Auto-selecting all routes for initial map display');
                this.uploadedRoutes.forEach(route => {
                    this.selectedRoutes.add(route.id);
                    this.mapViz.addRoute(route);
                    addedRoutes++;
                });
            }
            
            console.log(`✅ Added ${addedRoutes} routes to map visualization`);
        }
    }

    // Initialize storage manager
    async initializeStorage() {
        try {
            console.log('🔧 Initializing storage system...');
            
            // Try IndexedDB first (preferred for larger capacity)
            if (RouteStorageManager.isSupported()) {
                try {
                    this.storageManager = new RouteStorageManager();
                    await this.storageManager.init();
                    console.log('✅ Using IndexedDB storage (high capacity)');
                    return;
                } catch (indexedDBError) {
                    console.warn('⚠️ IndexedDB failed, falling back to localStorage:', indexedDBError);
                }
            } else {
                console.warn('⚠️ IndexedDB not supported, falling back to localStorage');
            }

            // Only IndexedDB is supported
            console.error('❌ No storage options available');
            this.storageManager = null;
            
        } catch (error) {
            console.error('❌ Storage initialization failed completely:', error);
            this.storageManager = null;
        }
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

        // Notify loading started
        this.notifyStateChange('loading-started', { fileCount: fileArray.length });

        const results = {
            successful: [],
            failed: []
        };

        // Process files sequentially first, then use batched updates
        for (const file of fileArray) {
            try {
                const routeData = await this.parser.parseGPXFile(file);
                results.successful.push(routeData);
            } catch (error) {
                console.error(`Failed to process ${file.name}:`, error);
                results.failed.push({ filename: file.name, error: error.message });
            }
        }

        // Use batched updates to add all successful routes at once
        this.withDeferredUpdates(() => {
            results.successful.forEach(routeData => {
                this.addRoute(routeData); // State changes are deferred
            });
        }); // All UI updates happen here in one batch

        await this.saveRoutesToStorage();
        
        // Notify loading finished
        this.notifyStateChange('loading-finished', { results });
        
        // Show upload results if there were failures
        if (results.failed.length > 0) {
            this.showUploadResults(results);
        }
    }

    // Add route to collection
    addRoute(routeData) {
        // Remove oldest routes if we're at the limit
        if (this.uploadedRoutes.length >= this.maxFiles) {
            this.uploadedRoutes.splice(0, this.uploadedRoutes.length - this.maxFiles + 1);
        }

        // Add unique ID only if route doesn't already have one (e.g., from Strava import)
        if (!routeData.id) {
            routeData.id = this.generateRouteId();
        }
        this.uploadedRoutes.push(routeData);

        // Auto-select new routes for display (unless we're showing aggregated route)
        if (!this.isShowingAggregated) {
            this.selectedRoutes.add(routeData.id);
        }

        console.log(`✅ Added route: ${routeData.filename} (ID: ${routeData.id})`);
        
        // Notify state change - UI updates happen in handlers
        this.notifyStateChange('selected-routes-changed', { reason: 'route-added' });
    }

    // Generate unique route ID
    generateRouteId() {
        return this.routeManipulator._generateRouteId();
    }

    // Show loading state in UI
    showLoadingState() {
        // Switch to routes UI if not already there
        this.showRoutesUI();
        
        // Show loading section and hide main content
        const loadingState = document.getElementById('loading-state');
        const mainContent = document.getElementById('main-content');
        
        if (loadingState) {
            loadingState.style.display = 'block';
        }
        if (mainContent) {
            mainContent.style.display = 'none';
        }
        
        console.log('⏳ Loading state displayed');
    }

    // Hide loading state in UI
    hideLoadingState() {
        // Hide loading section and show main content
        const loadingState = document.getElementById('loading-state');
        const mainContent = document.getElementById('main-content');
        
        if (loadingState) {
            loadingState.style.display = 'none';
        }
        if (mainContent) {
            mainContent.style.display = 'block';
        }
        
        console.log('✅ Loading state hidden');
    }

    // Update UI after file upload (legacy method - now delegated to events)
    updateUIAfterUpload(results) {
        console.log('🔄 Legacy updateUIAfterUpload - delegating to loading-finished event...');
        this.notifyStateChange('loading-finished', { results });
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
            const errorSummary = `Failed to process ${results.failed.length} file(s). Check console for details.`;
            this.showNotification(errorSummary, 'error');
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
            this.showNotification('No routes uploaded yet. Upload some GPX files first!', 'info');
            return;
        }

        const routeList = this.uploadedRoutes.map((route, index) => {
            const duration = route.duration ? `${Math.round(route.duration / 60)} min` : 'Unknown';
            return `${index + 1}. ${route.filename}
   📏 ${route.distance.toFixed(1)}km  ⛰️ ${Math.round(route.elevationGain)}m  ⏱️ ${duration}`;
        }).join('\n\n');

        // Show route info in console (too much for a notification)
        console.log(`📋 Uploaded Routes (${this.uploadedRoutes.length}):\n\n${routeList}`);
        this.showNotification(`${this.uploadedRoutes.length} routes loaded. Check console for details.`, 'info');
    }

    // Show aggregation options dialog
    showAggregationOptions() {
        const selectedRoutesToAggregate = this.uploadedRoutes.filter(route => 
            this.selectedRoutes.has(route.id)
        );

        if (selectedRoutesToAggregate.length < 2) {
            this.showNotification('Please select at least 2 routes to aggregate', 'warning');
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
                                <input type="radio" name="aggregation-mode" value="distance">
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
                                <input type="radio" name="aggregation-mode" value="fictional" checked>
                                <div class="option-content">
                                    <strong>🎨 Fictional Route</strong>
                                    <p>Generate synthetic coordinates with preserved elevation and timing</p>
                                </div>
                            </label>
                        </div>
                    </div>
                    
                    <div class="aggregation-option-group fictional-options">
                        <h4>Path Pattern</h4>
                        <div class="aggregation-options">
                            <label class="aggregation-option">
                                <input type="radio" name="path-pattern" value="spiral.json">
                                <div class="option-content">
                                    <strong>🌀 Spiral</strong>
                                    <p>Spiral path that explores the full circle and converges to the center</p>
                                </div>
                            </label>
                            
                            <label class="aggregation-option">
                                <input type="radio" name="path-pattern" value="stelvio.json">
                                <div class="option-content">
                                    <strong>⚡ Stelvio Pass</strong>
                                    <p>Stelvio Pass mountain road</p>
                                </div>
                            </label>

                            <label class="aggregation-option">
                                <input type="radio" name="path-pattern" value="sa-calobra.json" checked>
                                <div class="option-content">
                                    <strong>🏔️ Sa Calobra</strong>
                                    <p>Famous Mallorca road with stunning views and hairpin turns</p>
                                </div>
                            </label>
                        </div>
                    </div>
                    
                    <div class="aggregation-option-group">
                        <h4>Elevation Display</h4>
                        <div class="aggregation-options">
                            <label class="aggregation-option">
                                <input type="radio" name="elevation-mode" value="actual">
                                <div class="option-content">
                                    <strong>⛰️ Actual Elevation</strong>
                                    <p>Show raw elevation values</p>
                                </div>
                            </label>
                            
                            <label class="aggregation-option">
                                <input type="radio" name="elevation-mode" value="cumulative" checked>
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
    async executeAggregation() {
        const modal = document.querySelector('.aggregation-modal-overlay');
        const aggregationMode = modal.querySelector('input[name="aggregation-mode"]:checked').value;
        const elevationMode = modal.querySelector('input[name="elevation-mode"]:checked').value;
        const pathPattern = modal.querySelector('input[name="path-pattern"]:checked')?.value || 'spiral.json';
        
        modal.remove();
        
        console.log(`🔗 Aggregating ${this._routesToAggregate.length} routes in ${aggregationMode} mode with ${elevationMode} elevation...`);
        if (aggregationMode === 'fictional') {
            console.log(`🎨 Using ${pathPattern} path pattern for fictional route`);
        }

        try {
            // Create aggregated route based on selected options
            this.aggregatedRoute = await this.createAggregatedRouteWithOptions(
                this._routesToAggregate, 
                aggregationMode, 
                elevationMode,
                pathPattern
            );
            
            // Clear individual route selections
            this.selectedRoutes.clear();
            this.isShowingAggregated = true;

            // Single notification for aggregation creation
            this.notifyStateChange('selected-routes-changed', { reason: 'aggregated-route-created' });

            console.log(`✅ Created aggregated route: ${this.aggregatedRoute.filename}`);
            
            let modeDescription;
            if (aggregationMode === 'fictional') {
                modeDescription = `fictional ${pathPattern}`;
            } else {
                modeDescription = aggregationMode === 'distance' ? 'distance-based' : 'time-based';
            }
            const elevationDescription = elevationMode === 'actual' ? 'actual elevation' : 'cumulative climbing';
            
            const successMessage = `🔗 Aggregated ${this._routesToAggregate.length} routes: ${this.aggregatedRoute.distance.toFixed(1)}km, ${Math.round(this.aggregatedRoute.elevationGain)}m elevation`;
            console.log(`Route Aggregation Complete! Combined ${this._routesToAggregate.length} routes using ${modeDescription} aggregation with ${elevationDescription}.`);
            this.showNotification(successMessage, 'success');

        } catch (error) {
            console.error('❌ Failed to aggregate routes:', error);
            this.showNotification('Failed to aggregate routes. Check console for details.', 'error');
        }
        
        // Clean up
        delete this._routesToAggregate;
    }

    // Create aggregated route with different options
    async createAggregatedRouteWithOptions(routes, aggregationMode, elevationMode, pathPattern) {
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
            aggregatedRoute = await this.createFictionalRouteAggregation(sortedRoutes, elevationMode, pathPattern);
        } else {
            throw new Error(`Unknown aggregation mode: ${aggregationMode}`);
        }

        return aggregatedRoute;
    }

    // Create distance-based aggregation (existing logic with elevation mode support)
    // Create distance-based aggregation using RouteManipulator
    createDistanceBasedAggregation(routes, elevationMode) {
        console.log(`🔗 Creating distance-based aggregation with ${elevationMode} elevation using RouteManipulator...`);
        
        // IMPORTANT: Preserve the true aggregated statistics before scaling for visualization
        const originalStats = routes.reduce((acc, route) => {
            const rstats = this.routeManipulator.calculateRouteStats(route);
            return {
                distance: acc.distance + rstats.distance,
                elevationGain: acc.elevationGain + rstats.elevationGain,
                elevationLoss: acc.elevationLoss + rstats.elevationLoss,
                duration: acc.duration + rstats.duration
            };
        }, {
            distance: 0,
            elevationGain: 0,
            elevationLoss: 0,
            duration: 0
        });

        console.log(`📊 Original combined stats before aggregation: ${originalStats.distance.toFixed(1)}km, ${originalStats.elevationGain.toFixed(1)}m gain`);  

        // Use RouteManipulator to aggregate routes
        let aggregatedRoute = this.routeManipulator.aggregateRoutes(routes);
        
        // Apply elevation mode processing
        if (elevationMode === 'cumulative') {
            aggregatedRoute = this.routeManipulator.convertToCumulativeElevation(aggregatedRoute);
        }
        
        // Scale elevation to 10km for natural 3D visualization
        console.log(`📏 Scaling elevation for 3D visualization...`);
        aggregatedRoute = this.routeManipulator.scaleElevation(aggregatedRoute, 10000);
        
        // Restore the original statistics (scaleElevation modifies them for visualization)
        aggregatedRoute.distance = originalStats.distance;
        aggregatedRoute.elevationGain = originalStats.elevationGain;
        aggregatedRoute.elevationLoss = originalStats.elevationLoss;
        aggregatedRoute.duration = originalStats.duration;
        
        // Update metadata to include aggregation details
        aggregatedRoute.filename = `Aggregated Route (${routes.length} routes) - ${elevationMode === 'actual' ? 'Distance' : 'Cumulative Climbing'}`;
        aggregatedRoute.metadata = {
            ...aggregatedRoute.metadata,
            name: `Aggregated Route - ${routes.map(r => r.filename).join(', ')}`,
            description: `Combined from ${routes.length} individual routes using distance-based ${elevationMode} aggregation`,
            aggregationMode: 'distance',
            elevationMode: elevationMode,
            // Store original stats for reference
            originalStats: originalStats,
            sourceRoutes: routes.map(r => ({
                id: r.id,
                filename: r.filename,
                timestamp: this.extractRouteTimestamp(r)
            }))
        };

        console.log(`✅ Distance-based aggregated route created using RouteManipulator:`, {
            filename: aggregatedRoute.filename,
            totalPoints: aggregatedRoute.points.length,
            totalDistance: aggregatedRoute.distance.toFixed(1),
            totalElevationGain: Math.round(aggregatedRoute.elevationGain),
            sourceRoutes: aggregatedRoute.metadata.sourceRoutes.length
        });

        return aggregatedRoute;
    }

    // Create time-based aggregation
    // Create time-based aggregation using RouteManipulator
    createTimeBasedAggregation(routes, elevationMode) {
        console.log(`⏰ Creating time-based aggregation with ${elevationMode} elevation using RouteManipulator...`);
        
        // IMPORTANT: Preserve the true aggregated statistics before scaling for visualization
        const originalStats = routes.reduce((acc, route) => {
            const rstats = this.routeManipulator.calculateRouteStats(route);
            return {
                distance: acc.distance + rstats.distance,
                elevationGain: acc.elevationGain + rstats.elevationGain,
                elevationLoss: acc.elevationLoss + rstats.elevationLoss,
                duration: acc.duration + rstats.duration
            };
        }, {
            distance: 0,
            elevationGain: 0,
            elevationLoss: 0,
            duration: 0
        });

        console.log(`📊 Original combined stats before aggregation: ${originalStats.distance.toFixed(1)}km, ${originalStats.elevationGain.toFixed(1)}m gain`);  


        // Step 1: Spatially aggregate routes using RouteManipulator
        let spatiallyAggregatedRoute = this.routeManipulator.aggregateRoutes(routes);
        
        // Step 2: Find time range across all routes
        const allTimestamps = routes.flatMap(route => 
            route.points
                .filter(point => point.timestamp)
                .map(point => new Date(point.timestamp))
        ).sort((a, b) => a - b);
        
        if (allTimestamps.length === 0) {
            throw new Error('No timestamped points found in selected routes');
        }
        
        const startTime = allTimestamps[0];
        const endTime = allTimestamps.at(-1);
        const totalTimespan = endTime - startTime;
        
        // Step 3: Determine appropriate time step
        // < 28 days: 1 minute, else 1 hour
        const timeStepMs = totalTimespan < 28 * 24 * 60 * 60 * 1000 ? 60 * 1000 : 60 * 60 * 1000;
        
        // Step 4: Convert to time domain
        let aggregatedRoute = this.routeManipulator.convertToTimeDomain(
            spatiallyAggregatedRoute,
            startTime,
            endTime,
            timeStepMs
        );
        
        // Step 5: Apply elevation mode processing
        if (elevationMode === 'cumulative') {
            aggregatedRoute = this.routeManipulator.convertToCumulativeElevation(aggregatedRoute);
        }
        
        // Step 5.5: Scale elevation to 10km for natural 3D visualization
        console.log(`📏 Scaling elevation for 3D visualization...`);
        aggregatedRoute = this.routeManipulator.scaleElevation(aggregatedRoute, 10000);
        
        // Restore the original statistics (scaleElevation modifies them for visualization)
        aggregatedRoute.distance = originalStats.distance;
        aggregatedRoute.elevationGain = originalStats.elevationGain;
        aggregatedRoute.elevationLoss = originalStats.elevationLoss;
        aggregatedRoute.duration = originalStats.duration;
        
        // Step 6: Update metadata
        const stepLabel = timeStepMs >= 24 * 60 * 60 * 1000 ? 'day' :
                         timeStepMs >= 60 * 60 * 1000 ? 'hour' : 'minute';
        
        aggregatedRoute.filename = `Aggregated Route (${routes.length} routes) - ${elevationMode === 'actual' ? 'Time-based' : 'Time-based Cumulative'}`;
        aggregatedRoute.metadata = {
            ...aggregatedRoute.metadata,
            name: `Time-based Aggregated Route - ${routes.map(r => r.filename).join(', ')}`,
            description: `Spatially connected and time-aggregated from ${routes.length} routes using ${stepLabel} intervals with ${elevationMode} elevation`,
            aggregationMode: 'time',
            elevationMode: elevationMode,
            timeStep: stepLabel,
            timeStepMs: timeStepMs,
            // Store original stats for reference
            originalStats: originalStats,
            sourceRoutes: routes.map(r => ({
                id: r.id,
                filename: r.filename,
                timestamp: this.extractRouteTimestamp(r)
            }))
        };

        console.log(`✅ Time-based aggregated route created using RouteManipulator:`, {
            filename: aggregatedRoute.filename,
            totalPoints: aggregatedRoute.points.length,
            timeStep: stepLabel,
            totalDistance: aggregatedRoute.distance.toFixed(1),
            totalElevationGain: Math.round(aggregatedRoute.elevationGain),
            sourceRoutes: aggregatedRoute.metadata.sourceRoutes.length
        });

        return aggregatedRoute;
    }

    // Create fictional route aggregation using RouteManipulator
    async createFictionalRouteAggregation(routes, elevationMode, pathPattern) {
        console.log(`🎨 Creating fictional route with ${pathPattern} pattern and ${elevationMode} elevation using RouteManipulator...`);
        
        // IMPORTANT: Preserve the true aggregated statistics before scaling for visualization
        const originalStats = routes.reduce((acc, route) => {
            const rstats = this.routeManipulator.calculateRouteStats(route);
            return {
                distance: acc.distance + rstats.distance,
                elevationGain: acc.elevationGain + rstats.elevationGain,
                elevationLoss: acc.elevationLoss + rstats.elevationLoss,
                duration: acc.duration + rstats.duration
            };
        }, {
            distance: 0,
            elevationGain: 0,
            elevationLoss: 0,
            duration: 0
        });

        console.log(`📊 Original combined stats before aggregation: ${originalStats.distance.toFixed(1)}km, ${originalStats.elevationGain.toFixed(1)}m gain`);  


        // Step 1: Aggregate routes using RouteManipulator (distance-based)
        let aggregatedRoute = this.routeManipulator.aggregateRoutes(routes);
        
        // Step 2: Apply elevation mode processing  
        if (elevationMode === 'cumulative') {
            aggregatedRoute = this.routeManipulator.convertToCumulativeElevation(aggregatedRoute);
        }

        // Step 3: Apply the predetermined path using RouteManipulator (this overlays coordinates only)
        console.log(`🗺️ Applying predetermined path: ${pathPattern}`);
        let fictionalRoute = await this.routeManipulator.applyPredeterminedPath(aggregatedRoute, pathPattern);
        
        // Step 4: Scale elevation to 10km for natural 3D visualization
        console.log(`📏 Scaling elevation for 3D visualization...`);
        fictionalRoute = this.routeManipulator.scaleElevation(fictionalRoute, 10000);
        
        // Step 5: Restore the true aggregated statistics (after all transformations)
        fictionalRoute.distance = originalStats.distance;
        fictionalRoute.elevationGain = originalStats.elevationGain;
        fictionalRoute.elevationLoss = originalStats.elevationLoss;
        fictionalRoute.duration = originalStats.duration;
        
        // Step 6: Update metadata for fictional route
        fictionalRoute.filename = `Fictional Route (${routes.length} routes) - ${fictionalRoute?.metadata?.templateName || pathPattern} - ${elevationMode === 'actual' ? 'Elevation' : 'Cumulative'}`;
        fictionalRoute.metadata = {
            ...fictionalRoute.metadata,
            name: `Fictional ${pathPattern} Route - ${routes.map(r => r.filename).join(', ')}`,
            description: `Synthetic ${pathPattern} route preserving elevation and timing from ${routes.length} routes with ${elevationMode} elevation`,
            aggregationMode: 'fictional',
            elevationMode: elevationMode,
            pathPattern: pathPattern,
            // Store original stats for reference
            originalStats: originalStats,
            sourceRoutes: routes.map(r => ({
                id: r.id,
                filename: r.filename,
                timestamp: this.extractRouteTimestamp(r)
            }))
        };

        console.log(`✅ Fictional ${pathPattern} route created using RouteManipulator:`, {
            filename: fictionalRoute.filename,
            totalPoints: fictionalRoute.points.length,
            pathPattern: pathPattern,
            totalDistance: fictionalRoute.distance.toFixed(1),
            totalElevationGain: Math.round(fictionalRoute.elevationGain),
            sourceRoutes: fictionalRoute.metadata.sourceRoutes.length
        });

        return fictionalRoute;
    }

    // Extract timestamp from route for sorting
    extractRouteTimestamp(route) {
        // 1. First point with timestamp
        const pointTs = route.points?.find(p => p.timestamp)?.timestamp;

        // 2. Metadata time
        const metaTs = route.metadata?.time;

        // 3. Upload time
        const uploadTs = route.uploadTime;

        // Pick the first non-nullish
        const raw = pointTs ?? metaTs ?? uploadTs;

        if (raw) {
            const d = new Date(raw);
            if (!isNaN(d)) return d;

            console.warn(`Invalid timestamp '${raw}' in route ${route.filename}`);
        }

        // 4. Last resort: now
        console.warn(`No timestamp found for ${route.filename}, using current time`);
        return new Date();
    }


    // Get uploaded routes
    getRoutes() {
        return [...this.uploadedRoutes];
    }

    // Remove a route
    async removeRoute(routeId) {
        this.uploadedRoutes = this.uploadedRoutes.filter(route => route.id !== routeId);
        await this.saveRoutesToStorage();
    }

    // Clear all routes
    async clearAllRoutes() {
        console.log('🗑️ Clearing all routes...');
        this.uploadedRoutes = [];
        this.aggregatedRoute = null;
        
        // Clear from storage
        try {
            if (this.storageManager) {
                await this.storageManager.clearAllRoutes();
            }
        } catch (error) {
            console.error('❌ Failed to clear storage:', error);
            // For localStorage manager, we can try the cleanup method
            if (this.storageManager && typeof this.storageManager.clearOldStorageData === 'function') {
                await this.storageManager.clearOldStorageData();
            }
        }

        // Clear map visualization
        if (this.mapVisualization) {
            this.mapVisualization.clearMap();
        }

        // Clear 3D visualization
        if (this.viewer3D && this.viewer3D.isInitialized) {
            this.viewer3D.clearAllRoutes();
        }
        
        // Return to initial state
        this.showInitialUIState();
        
        console.log('✅ All routes cleared');
    }

    // Load routes from storage (using unified storage manager interface)
    async loadStoredRoutes() {
        try {
            console.log('🔍 Loading stored routes...');
            
            if (this.storageManager) {
                this.uploadedRoutes = await this.storageManager.loadRoutes();
            } else {
                console.warn('⚠️ No storage manager available');
                this.uploadedRoutes = [];
            }
            
            if (this.uploadedRoutes.length > 0) {
                console.log(`📂 Loaded ${this.uploadedRoutes.length} routes from storage`);
                console.log('📋 Routes loaded:', this.uploadedRoutes.map(r => r.filename));
                
                // Auto-select all loaded routes for display
                this.uploadedRoutes.forEach(route => {
                    this.selectedRoutes.add(route.id);
                });
                console.log(`✅ Auto-selected ${this.selectedRoutes.size} routes for display`);
                
                // Notify that loading finished with existing routes
                this.notifyStateChange('loading-finished', { 
                    results: { successful: this.uploadedRoutes, failed: [] } 
                });
            } else {
                console.log('📭 No routes found in storage');
            }
            
        } catch (error) {
            console.error('❌ Failed to load stored routes:', error);
            this.uploadedRoutes = [];
        }
    }

    // Save routes to storage (using unified storage manager interface)
    async saveRoutesToStorage() {
        try {
            if (this.storageManager) {
                await this.storageManager.saveRoutes(this.uploadedRoutes);
                
                // Perform cleanup if storage gets too large
                await this.storageManager.cleanupOldRoutes();
            } else {
                console.warn('⚠️ No storage manager available, routes will not persist');
            }
        } catch (error) {
            console.error('❌ Failed to save routes to storage:', error);
        }
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

                // If no routes are selected but we have routes, auto-select all routes (for initial load)
                if (this.selectedRoutes.size === 0 && this.uploadedRoutes.length > 0) {
                    console.log('🎯 Auto-selecting all routes for initial map display');
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

    // Refresh 3D viewer with current routes (for when new routes are uploaded)
    refresh3DViewer() {
        if (!this.viewer3D?.isInitialized) {
            console.warn('⚠️ Cannot refresh 3D viewer - not initialized');
            return;
        }

        try {
            console.log('🔄 Refreshing 3D viewer with current routes...');
            
            // Clear all existing routes using the proper method
            this.viewer3D.clearAllRoutes();
            
            // Add back the routes that should be displayed
            if (this.isShowingAggregated && this.aggregatedRoute) {
                console.log(`➕ Adding aggregated route to 3D viewer: ${this.aggregatedRoute.filename}`);
                this.viewer3D.addRoute(this.aggregatedRoute);
            } else {
                // Add back only selected routes
                this.uploadedRoutes.forEach(route => {
                    if (this.selectedRoutes.has(route.id)) {
                        console.log(`➕ Adding selected route to 3D viewer: ${route.filename}`);
                        this.viewer3D.addRoute(route);
                    }
                });
            }
            
            // After adding routes, make sure camera is positioned to show all routes
            if (this.viewer3D.fitToView) {
                console.log('📷 Repositioning camera to fit all routes...');
                this.viewer3D.fitToView();
            }
            
            console.log('✅ 3D viewer refreshed successfully');
        } catch (error) {
            console.error('❌ Failed to refresh 3D viewer:', error);
        }
    }

    // Add a route to 3D viewer if it's initialized (for newly uploaded routes)
    addRouteTo3DViewerIfInitialized(route) {
        // Only proceed if we're in 3D view mode and viewer is initialized
        if (this.currentViewMode !== '3d' || !this.is3DInitialized || !this.viewer3D?.isInitialized) {
            console.log(`📝 3D viewer not active/initialized, route will be added when 3D view is accessed: ${route.filename}`);
            return;
        }

        // Only add if route is selected for display and we're not showing aggregated route
        if (!this.isShowingAggregated && this.selectedRoutes.has(route.id)) {
            console.log(`➕ Adding new selected route to initialized 3D viewer: ${route.filename}`);
            
            try {
                this.viewer3D.addRoute(route);
                
                // Ensure camera is positioned to show the new route
                if (this.viewer3D.fitToView) {
                    console.log('📷 Repositioning camera to show newly added route...');
                    this.viewer3D.fitToView();
                }
                
                console.log(`✅ Successfully added route to 3D viewer: ${route.filename}`);
            } catch (error) {
                console.error(`❌ Failed to add route to 3D viewer: ${route.filename}`, error);
            }
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

        // Show aggregated route if it exists (checkbox state based on isShowingAggregated)
        if (this.aggregatedRoute) {
            const color = '#ff6b35'; // Orange color for aggregated route
            const duration = this.aggregatedRoute.duration ? this.formatDuration(this.aggregatedRoute.duration) : 'Unknown';
            
            routeItems += `
                <div class="route-list-item aggregated-route" data-route-id="${this.aggregatedRoute.id}">
                    <div class="route-item-checkbox">
                        <input type="checkbox" id="route-checkbox-${this.aggregatedRoute.id}" 
                               ${this.isShowingAggregated ? 'checked' : ''} 
                               onchange="window.fileUploader.toggleRouteVisibility('${this.aggregatedRoute.id}')">
                    </div>
                    <div class="route-item-info">
                        <h4 title="${this.aggregatedRoute.filename}">🔗 ${this.truncateFilename(this.aggregatedRoute.filename)}</h4>
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

        // Show individual routes (checkbox state based on selection and mutual exclusivity)
        routeItems += this.uploadedRoutes.map((route, index) => {
            const color = this.mapViz.routeLayers.find(layer => layer.id === route.id)?.color || '#2563eb';
            const duration = route.duration ? this.formatDuration(route.duration) : 'Unknown';
            // Individual route is selected if it's in selectedRoutes AND we're not showing aggregated
            const isSelected = !this.isShowingAggregated && this.selectedRoutes.has(route.id);
            
            return `
                <div class="route-list-item ${isSelected ? 'selected' : 'unselected'}" data-route-id="${route.id}">
                    <div class="route-item-checkbox">
                        <input type="checkbox" id="route-checkbox-${route.id}" 
                               ${isSelected ? 'checked' : ''} 
                               onchange="window.fileUploader.toggleRouteVisibility('${route.id}')">
                    </div>
                    <div class="route-item-info">
                        <h4 title="${route.filename}">${this.truncateFilename(route.filename)}</h4>
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

    // Truncate filename helper
    truncateFilename(filename, maxLength = 30) {
        if (!filename || filename.length <= maxLength) {
            return filename || 'Unnamed Route';
        }
        return filename.substring(0, maxLength - 3) + '...';
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
                if (this.mapViz) {
                    this.mapViz.resize();
                }
            }, 300);
        }
    }

    // Fit map to show all routes
    fitMapToRoutes() {
        if (this.mapViz) {
            this.mapViz.fitMapToRoutes();
        }
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
            this.showNotification('Route not found for download', 'error');
            return;
        }

        try {
            // Generate GPX content
            const gpxContent = this.generateGPXContent(routeToDownload);
            
            // Create download
            this.downloadFile(gpxContent, filename, 'application/gpx+xml');
            
            console.log(`📥 Downloaded route: ${filename}`);
            this.showNotification(`📥 Downloaded: ${filename}`, 'success');
        } catch (error) {
            console.error('❌ Failed to download route:', error);
            this.showNotification('Failed to download route. Check console for details.', 'error');
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

    // Remove a route by ID (updated to work with map and IndexedDB)
    async removeRouteById(routeId) {
        // Remove from uploaded routes array
        this.uploadedRoutes = this.uploadedRoutes.filter(route => route.id !== routeId);
        
        // Remove from selected routes
        this.selectedRoutes.delete(routeId);
        
        // Remove from storage
        try {
            if (this.storageManager) {
                await this.storageManager.deleteRoute(routeId);
            }
        } catch (error) {
            console.warn('⚠️ Failed to delete from IndexedDB, updating localStorage:', error);
        }
        
        // Save updated routes to storage
        await this.saveRoutesToStorage();
        
        // Single notification - all UI updates happen automatically
        this.notifyStateChange('route-removed', { routeId });
        
        console.log(`🗑️ Route removed: ${routeId}`);
    }

    // Toggle route visibility (with mutually exclusive aggregated vs individual routes)
    toggleRouteVisibility(routeId) {
        const checkbox = document.getElementById(`route-checkbox-${routeId}`);
        const isChecked = checkbox?.checked || false;

        if (routeId === this.aggregatedRoute?.id) {
            // Handle aggregated route visibility
            if (isChecked) {
                // Select aggregated route, unselect all individual routes
                console.log('🔗 Selecting aggregated route - clearing individual route selections');
                this.selectedRoutes.clear();
                this.isShowingAggregated = true;
            } else {
                // Unselect aggregated route, default to selecting all individual routes
                console.log('🔗 Unselecting aggregated route - selecting all individual routes');
                this.isShowingAggregated = false;
                this.uploadedRoutes.forEach(route => {
                    this.selectedRoutes.add(route.id);
                });
            }
        } else {
            // Handle individual route visibility
            if (isChecked) {
                // Select individual route, unselect aggregated route if it was showing
                if (this.isShowingAggregated) {
                    console.log('🔗 Selecting individual route - clearing aggregated route');
                    this.isShowingAggregated = false;
                    this.selectedRoutes.clear(); // Start fresh with individual selections
                }
                this.selectedRoutes.add(routeId);
            } else {
                // Unselect individual route
                this.selectedRoutes.delete(routeId);
            }
        }

        // Single unified notification
        this.notifyStateChange('selected-routes-changed', { 
            reason: 'visibility-toggled',
            routeId, 
            visible: isChecked 
        });
        
        console.log(`👁️ Route ${routeId} visibility: ${isChecked ? 'shown' : 'hidden'}`);
        console.log(`📊 Current state: aggregated=${this.isShowingAggregated}, individual=${this.selectedRoutes.size} selected`);
    }

    // Show a specific route (legacy method - use unified approach)
    showRoute(routeId) {
        this.selectedRoutes.add(routeId);
        this.notifyStateChange('selected-routes-changed', { reason: 'show-route', routeId });
    }

    // Hide a specific route (legacy method - use unified approach)  
    hideRoute(routeId) {
        this.selectedRoutes.delete(routeId);
        this.notifyStateChange('selected-routes-changed', { reason: 'hide-route', routeId });
    }

    // Show aggregated route (legacy method - use unified approach)
    showAggregatedRoute() {
        this.isShowingAggregated = true;
        this.notifyStateChange('selected-routes-changed', { reason: 'show-aggregated' });
    }

    // Hide aggregated route (legacy method - use unified approach) 
    hideAggregatedRoute() {
        this.isShowingAggregated = false;
        this.notifyStateChange('selected-routes-changed', { reason: 'hide-aggregated' });
    }

    // Remove aggregated route completely
    removeAggregatedRoute() {
        if (!this.aggregatedRoute) return;

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
            }
        });

        // Single notification with restored routes info
        this.notifyStateChange('selected-routes-changed', { reason: 'aggregated-route-removed' });
        
        console.log(`🗑️ Aggregated route removed, restored ${sourceRouteIds.length} individual routes`);
    }

    // Update just the stats display
    // Update stats display (shows stats for currently visible routes)
    updateStatsDisplay() {
        let totalRoutes, totalDistance, totalElevation;
        
        if (this.isShowingAggregated && this.aggregatedRoute) {
            // Show stats for aggregated route only
            totalRoutes = 1;
            totalDistance = this.aggregatedRoute.distance;
            totalElevation = this.aggregatedRoute.elevationGain;
        } else {
            // Show stats for selected individual routes
            const selectedRoutesData = this.uploadedRoutes.filter(route => 
                this.selectedRoutes.has(route.id)
            );
            totalRoutes = selectedRoutesData.length;
            totalDistance = selectedRoutesData.reduce((sum, route) => sum + route.distance, 0);
            totalElevation = selectedRoutesData.reduce((sum, route) => sum + route.elevationGain, 0);
        }

        // Update stats display using new IDs (with null checks)
        const routesCountEl = document.getElementById('stat-routes-count');
        const totalDistanceEl = document.getElementById('stat-total-distance');
        const totalElevationEl = document.getElementById('stat-total-elevation');
        
        if (routesCountEl) {
            routesCountEl.textContent = totalRoutes;
        }
        if (totalDistanceEl) {
            totalDistanceEl.textContent = `${totalDistance.toFixed(1)}km`;
        }
        if (totalElevationEl) {
            totalElevationEl.textContent = `${Math.round(totalElevation)}m`;
        }
        
        if (!routesCountEl || !totalDistanceEl || !totalElevationEl) {
            console.warn('⚠️ Some stats elements not found, stats update postponed');
        } else {
            const statsType = this.isShowingAggregated ? 'aggregated' : 'selected individual';
            console.log(`📊 Stats updated (${statsType}): ${totalRoutes} routes, ${totalDistance.toFixed(1)}km, ${Math.round(totalElevation)}m`);
        }
    }

    // Get storage information for debugging
    async getStorageInfo() {
        if (this.storageManager) {
            return await this.storageManager.getStorageInfo();
        } else {
            return { 
                error: 'No storage manager available',
                totalRoutes: 0,
                totalSizeKB: 0,
                averageSizeKB: 0
            };
        }
    }

    // Debug storage info (accessible via console: window.fileUploader.debugStorage())
    async debugStorage() {
        const info = await this.getStorageInfo();
        console.log('📊 Storage Information:', info);
        
        if (this.storageManager) {
            const storageType = this.storageManager.constructor.name;
            if (storageType === 'RouteStorageManager') {
                console.log('✅ Using IndexedDB storage (high capacity)');
            } else {
                console.log('🔧 Using custom storage manager:', storageType);
            }
        } else {
            console.log('❌ No storage manager available');
        }
        return info;
    }
        
    // Switch view mode (unified method for HTML onclick handlers)
    async switchViewMode(mode) {
        if (mode === 'map') {
            this.showMapView();
        } else if (mode === '3d') {
            await this.show3DView();
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
    async show3DView() {
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
                
                try {
                    // Wait for the container to be visible before initializing
                    await this.waitForElementVisible(viewer3DContainer);
                    
                    this.initialize3DVisualization();
                    this.is3DInitialized = true;
                    
                    console.log('✅ 3D viewer initialization complete');
                } catch (error) {
                    console.error('❌ Failed to initialize 3D viewer:', error);
                }
            } else {
                // 3D viewer already initialized - refresh it with current routes
                console.log('🔄 Refreshing existing 3D viewer with current routes...');
                
                if (this.viewer3D?.isInitialized) {
                    // Resize viewer first
                    const rect = viewer3DContainer.getBoundingClientRect();
                    this.viewer3D.resize(rect.width, rect.height);
                    
                    // Refresh with current routes (this handles routes added while in map view)
                    this.refresh3DViewer();
                }
            }
        }

        console.log('🎮 Switched to 3D view');
    }

    // Wait for an element to be visible (has dimensions)
    async waitForElementVisible(element, maxWaitMs = 1000) {
        return new Promise((resolve, reject) => {
            const startTime = Date.now();
            
            const checkVisible = () => {
                const rect = element.getBoundingClientRect();
                
                if (rect.width > 0 && rect.height > 0) {
                    console.log(`✅ Element visible: ${rect.width}x${rect.height}`);
                    resolve(rect);
                    return;
                }
                
                const elapsed = Date.now() - startTime;
                if (elapsed >= maxWaitMs) {
                    reject(new Error(`Element did not become visible within ${maxWaitMs}ms`));
                    return;
                }
                
                // Use requestAnimationFrame for better timing than setTimeout
                requestAnimationFrame(checkVisible);
            };
            
            checkVisible();
        });
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

    // Show a temporary notification toast
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
            background: ${type === 'success' ? '#4CAF50' : type === 'error' ? '#f44336' : type === 'warning' ? '#ff9800' : '#2196F3'};
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

export default FileUploadHandler;
