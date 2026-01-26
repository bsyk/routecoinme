// File Upload Handler for GPX Files
import GPXParser from '../data/gpx-parser.js';
import RouteMapVisualization from '../visualization/route-map.js';
import Route3DVisualization from '../visualization/route-3d.js';
import RouteStorageManager from '../data/route-storage.js';
import RouteManipulator from '../data/route-manipulator.js';
import unitPreferences from '../utils/unit-preferences.js';

class FileUploadHandler {
    constructor() {
        this.parser = new GPXParser();
        this.mapViz = new RouteMapVisualization();
        this.viewer3D = new Route3DVisualization();
        this.routeManipulator = new RouteManipulator();
        this.unitPreferences = unitPreferences;
        this.storageManager = null; // Will be initialized in initializeStorage()
        this.uploadedRoutes = [];
        this.maxFiles = 10; // Reduced from 20 to help with storage limits
        this.selectedRoutes = new Set(); // For tracking selected routes for display
        this.aggregatedRoute = null; // Store the aggregated route when created
        this.isShowingAggregated = false; // Track if we're showing aggregated route
        this.currentViewMode = 'map'; // 'map' or '3d'
        this.is3DInitialized = false; // Track if 3D viewer has been initialized
        this.activeListTab = 'routes'; // 'routes' or 'coins'
        this.activateListTab = null;
        this.savedCoins = [];
        this.activeCoin = null; // Currently displayed saved coin
        this.aggregationOptions = {
            elevationMode: 'actual',
            overlay: 'real',
            domain: 'distance'
        };
        this.isAggregating = false;
        this.pendingAggregation = null;
        this.previousAggregationOptions = null;
        this.lastRouteSelectionBeforeCoin = null;
        this.suppressOptionEvents = false;
        this.pendingRouteScrollId = null;
        this.pendingCoinScrollId = null;
        this.isSidebarDrawerOpen = false;
        this.handleSidebarEscape = this.handleSidebarEscape.bind(this);
        this.sidebarDrawerResizeHandler = null;
        this.wasUsingSidebarDrawer = null;
        this.baseViewerHeights = { map: 320, viewer3d: 360 };
        
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
        this.setupListTabs();
        this.setupSidebarControls();
        await this.initializeStorage();
        
        // Set up centralized state listener
        this.setupStateListener();
        this.setupUnitPreferenceHandlers();
        
        // Initialize the map visualization
        this.initializeMapVisualization();
        
        // Show initial UI state
        this.showInitialUIState();
        
        await this.loadStoredRoutes();
        await this.loadStoredCoins();
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

    setupUnitPreferenceHandlers() {
        window.addEventListener('rcm:unit-change', () => {
            this.applyUnitPreferences();
        });

        // Apply current preference immediately so UI reflects stored choice on load
        this.applyUnitPreferences();
    }

    applyUnitPreferences() {
        this.updateStatsDisplay();
        if (this.uploadedRoutes.length > 0 || this.aggregatedRoute) {
            this.updateRouteList();
        }

        if (this.mapViz && typeof this.mapViz.refreshRoutePopups === 'function') {
            this.mapViz.refreshRoutePopups();
        }
    }

    formatDistance(distanceKm, options = {}) {
        return this.unitPreferences.formatDistance(distanceKm, options);
    }

    formatElevation(elevationMeters, options = {}) {
        return this.unitPreferences.formatElevation(elevationMeters, options);
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
        this.updateCoinActionButtons();

        if (!this.activeCoin) {
            this.refreshAggregatedRoute({ reason: 'selection-change' }).catch(error => {
                console.error('❌ Failed to refresh aggregated route after selection change:', error);
            });
        }
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
            const isAuthenticated = window.stravaAuth.getCachedAuthStatus();
            if (isAuthenticated) {
                window.stravaAuth.showAuthenticatedFeatures();
            }
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
        if (typeof this.activateListTab === 'function') {
            const targetTab = this.activeListTab || 'routes';
            this.activateListTab(targetTab);
        }

        requestAnimationFrame(() => this.alignSidebarWithViewer());
        
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
                requestAnimationFrame(() => this.alignSidebarWithViewer());
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
        const fileInput = document.getElementById('gpx-file-input');
        if (!fileInput) {
            console.error('❌ File input element #gpx-file-input not found in DOM');
            return;
        }

        // Handle file selection
        fileInput.addEventListener('change', (event) => {
            const { files } = event.target;
            if (!files || files.length === 0) {
                return;
            }
            this.handleFileSelection(files);
            // Reset the input so selecting the same file twice still triggers change
            event.target.value = '';
        });

        this.fileInput = fileInput;
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
            const mapBtn = document.getElementById('map-view-btn');
            const coinBtn = document.getElementById('view-coin-btn');

            if (mapBtn) {
                mapBtn.addEventListener('click', async () => {
                    await this.switchViewMode('map');
                });
            }

            if (coinBtn) {
                coinBtn.addEventListener('click', async () => {
                    await this.switchViewMode('3d');
                });
            }

            console.log('🎛️ View toggle buttons initialized');
        }, 100);
    }

    setupListTabs() {
        setTimeout(() => {
            const routesTabBtn = document.getElementById('routes-tab-btn');
            const coinsTabBtn = document.getElementById('coins-tab-btn');
            const routesPanel = document.getElementById('routes-tab-panel');
            const coinsPanel = document.getElementById('coins-tab-panel');

            if (!routesTabBtn || !coinsTabBtn || !routesPanel || !coinsPanel) {
                console.warn('⚠️ List tabs not found during setup');
                return;
            }

            const activateTab = (tabName) => {
                const showRoutes = tabName === 'routes';

                if (showRoutes && this.activeCoin) {
                    this.handleClearCoinClick();
                }

                routesTabBtn.classList.toggle('active', showRoutes);
                routesTabBtn.setAttribute('aria-selected', showRoutes);
                routesPanel.classList.toggle('active', showRoutes);
                routesPanel.setAttribute('aria-hidden', !showRoutes);

                coinsTabBtn.classList.toggle('active', !showRoutes);
                coinsTabBtn.setAttribute('aria-selected', !showRoutes);
                coinsPanel.classList.toggle('active', !showRoutes);
                coinsPanel.setAttribute('aria-hidden', showRoutes);

                this.activeListTab = showRoutes ? 'routes' : 'coins';
            };

            routesTabBtn.addEventListener('click', () => activateTab('routes'));
            coinsTabBtn.addEventListener('click', () => activateTab('coins'));

            this.activateListTab = activateTab;
            activateTab(this.activeListTab || 'routes');

            console.log('📋 Route/Coin list tabs initialized');
        }, 100);
    }

    setupSidebarControls() {
        setTimeout(() => {
            const elevationRadios = document.querySelectorAll('input[name="elevation-mode"]');
            elevationRadios.forEach(radio => {
                radio.addEventListener('change', (event) => {
                    if (this.suppressOptionEvents) {
                        return;
                    }
                    if (event.target.checked) {
                        this.aggregationOptions.elevationMode = event.target.value;
                        this.onAggregationOptionsChanged('elevation-mode');
                    }
                });
            });

            const overlaySelect = document.getElementById('overlay-select');
            if (overlaySelect) {
                overlaySelect.value = this.aggregationOptions.overlay;
                overlaySelect.addEventListener('change', (event) => {
                    if (this.suppressOptionEvents) {
                        return;
                    }
                    this.aggregationOptions.overlay = event.target.value;
                    this.updateDomainControlState();
                    this.onAggregationOptionsChanged('overlay');
                });
            }

            const domainRadios = document.querySelectorAll('input[name="aggregation-domain"]');
            domainRadios.forEach(radio => {
                radio.addEventListener('change', (event) => {
                    if (this.suppressOptionEvents) {
                        return;
                    }
                    if (event.target.checked) {
                        this.aggregationOptions.domain = event.target.value;
                        this.onAggregationOptionsChanged('aggregation-domain');
                    }
                });
            });

            const saveBtn = document.getElementById('save-coin-btn');
            if (saveBtn) {
                saveBtn.addEventListener('click', () => this.handleSaveCoinClick());
            }

            const downloadBtn = document.getElementById('download-coin-btn');
            if (downloadBtn) {
                downloadBtn.addEventListener('click', () => this.handleDownloadCoinClick());
            }

            const clearBtn = document.getElementById('clear-coin-btn');
            if (clearBtn) {
                clearBtn.addEventListener('click', () => this.handleClearCoinClick());
            }

            this.setupSidebarDrawer();
            this.updateDomainControlState();
            this.updateCoinActionButtons();
            this.updateSidebarControlsState();
            this.alignSidebarWithViewer();
        }, 100);
    }

    setupSidebarDrawer() {
        const sidebar = document.getElementById('aggregation-sidebar');
        const sidebarToggle = document.getElementById('sidebar-toggle');
        const sidebarClose = document.getElementById('sidebar-close-btn');
        const sidebarOverlay = document.getElementById('sidebar-overlay');

        if (!sidebar || !sidebarToggle || !sidebarOverlay) {
            return;
        }

        this.sidebarElements = { sidebar, sidebarToggle, sidebarClose, sidebarOverlay };

        const handleToggle = () => {
            if (!this.shouldUseSidebarDrawer()) {
                sidebarToggle.setAttribute('aria-expanded', 'false');
                return;
            }

            if (this.isSidebarDrawerOpen) {
                this.closeSidebarDrawer({ focusToggle: true });
            } else {
                this.openSidebarDrawer();
            }
        };

        sidebarToggle.addEventListener('click', handleToggle);
        sidebarClose?.addEventListener('click', () => this.closeSidebarDrawer({ focusToggle: true }));
        sidebarOverlay.addEventListener('click', () => this.closeSidebarDrawer({ focusToggle: true }));
        sidebar.addEventListener('keydown', this.handleSidebarEscape);

        if (this.sidebarDrawerResizeHandler) {
            window.removeEventListener('resize', this.sidebarDrawerResizeHandler);
        }

        this.sidebarDrawerResizeHandler = () => {
            this.updateSidebarAccessibility();
            this.alignSidebarWithViewer();
        };

        window.addEventListener('resize', this.sidebarDrawerResizeHandler);

        this.updateSidebarAccessibility();
        this.alignSidebarWithViewer();
    }

    shouldUseSidebarDrawer() {
        return window.innerWidth <= 1100;
    }

    openSidebarDrawer() {
        if (!this.sidebarElements || !this.shouldUseSidebarDrawer()) {
            return;
        }

        const { sidebar, sidebarToggle, sidebarClose, sidebarOverlay } = this.sidebarElements;
        this.isSidebarDrawerOpen = true;
        sidebar.classList.add('is-open');
        sidebar.setAttribute('aria-hidden', 'false');
        sidebarToggle.setAttribute('aria-expanded', 'true');
        sidebarOverlay.hidden = false;
        document.body.classList.add('sidebar-open');

        this.refreshVisualizationsAfterSidebarToggle();

        requestAnimationFrame(() => {
            if (sidebarClose) {
                sidebarClose.focus();
            } else {
                sidebar.focus();
            }
        });
    }

    closeSidebarDrawer({ focusToggle = false } = {}) {
        if (!this.sidebarElements) {
            return;
        }

        const { sidebar, sidebarToggle, sidebarOverlay } = this.sidebarElements;
        this.isSidebarDrawerOpen = false;
        sidebar.classList.remove('is-open');
        sidebarToggle.setAttribute('aria-expanded', 'false');
        sidebarOverlay.hidden = true;
        document.body.classList.remove('sidebar-open');

        this.updateSidebarAccessibility();
        this.refreshVisualizationsAfterSidebarToggle();

        if (focusToggle && this.shouldUseSidebarDrawer()) {
            requestAnimationFrame(() => sidebarToggle.focus());
        }
    }

    handleSidebarEscape(event) {
        if (event.key === 'Escape' && this.isSidebarDrawerOpen) {
            event.preventDefault();
            this.closeSidebarDrawer({ focusToggle: true });
        }
    }

    updateSidebarAccessibility() {
        if (!this.sidebarElements) {
            return;
        }

        const { sidebar, sidebarToggle, sidebarOverlay } = this.sidebarElements;
        const useDrawer = this.shouldUseSidebarDrawer();
        const modeChanged = this.wasUsingSidebarDrawer !== useDrawer;
        this.wasUsingSidebarDrawer = useDrawer;

        if (!useDrawer) {
            this.isSidebarDrawerOpen = false;
            sidebar.classList.remove('is-open');
            sidebar.setAttribute('aria-hidden', 'false');
            sidebarOverlay.hidden = true;
            sidebarToggle.setAttribute('aria-expanded', 'false');
            document.body.classList.remove('sidebar-open');
            if (modeChanged) {
                this.refreshVisualizationsAfterSidebarToggle();
            }
            return;
        }

        sidebar.setAttribute('aria-hidden', this.isSidebarDrawerOpen ? 'false' : 'true');
        sidebarOverlay.hidden = this.isSidebarDrawerOpen ? false : true;
        if (!this.isSidebarDrawerOpen) {
            document.body.classList.remove('sidebar-open');
            sidebar.classList.remove('is-open');
        }

        if (modeChanged && this.isSidebarDrawerOpen) {
            this.refreshVisualizationsAfterSidebarToggle();
        }
    }

    refreshVisualizationsAfterSidebarToggle() {
        requestAnimationFrame(() => {
            if (this.mapViz?.map) {
                this.mapViz.map.invalidateSize();
            }

            if (this.currentViewMode === '3d' && this.is3DInitialized) {
                const viewerContainer = document.getElementById('viewer-3d-container');
                if (viewerContainer) {
                    const rect = viewerContainer.getBoundingClientRect();
                    if (rect.width > 0 && rect.height > 0) {
                        this.viewer3D.resize(rect.width, rect.height);
                    }
                }
            }

            this.alignSidebarWithViewer();
        });
    }

    alignSidebarWithViewer() {
        const layout = document.querySelector('.aggregation-layout');
        const sidebar = this.sidebarElements?.sidebar || document.getElementById('aggregation-sidebar');

        if (!layout || !sidebar) {
            return;
        }

        const mapContainer = document.getElementById('map-container');
        const viewer3DContainer = document.getElementById('viewer-3d-container');
        const usingDrawer = this.shouldUseSidebarDrawer();

        if (usingDrawer) {
            sidebar.style.marginTop = '';
            this.resetViewerHeights(mapContainer, viewer3DContainer);
            return;
        }

        const getVisibleContainer = (element) => {
            if (!element) {
                return false;
            }
            return window.getComputedStyle(element).display !== 'none';
        };

        let target = null;
        let inactiveViewer = null;

        const preferredViewer = this.currentViewMode === '3d' ? viewer3DContainer : mapContainer;
        if (preferredViewer && getVisibleContainer(preferredViewer)) {
            target = preferredViewer;
            inactiveViewer = preferredViewer === mapContainer ? viewer3DContainer : mapContainer;
        } else if (mapContainer && getVisibleContainer(mapContainer)) {
            target = mapContainer;
            inactiveViewer = viewer3DContainer;
        } else if (viewer3DContainer && getVisibleContainer(viewer3DContainer)) {
            target = viewer3DContainer;
            inactiveViewer = mapContainer;
        }

        if (!target) {
            sidebar.style.marginTop = '';
            this.resetViewerHeights(mapContainer, viewer3DContainer);
            return;
        }

        const layoutRect = layout.getBoundingClientRect();
        const targetRect = target.getBoundingClientRect();

        if (targetRect.height === 0) {
            sidebar.style.marginTop = '';
            this.resetViewerHeights(mapContainer, viewer3DContainer);
            return;
        }

        const offset = Math.max(0, targetRect.top - layoutRect.top);
        sidebar.style.marginTop = `${offset}px`;

        const baseMinHeight = target === viewer3DContainer ? this.baseViewerHeights.viewer3d : this.baseViewerHeights.map;

        requestAnimationFrame(() => {
            const sidebarRect = sidebar.getBoundingClientRect();
            const viewerRect = target.getBoundingClientRect();
            const desiredHeight = Math.max(baseMinHeight, sidebarRect.height);

            target.style.height = `${desiredHeight}px`;
            target.style.minHeight = `${desiredHeight}px`;

            const updatedRect = target.getBoundingClientRect();

            if (inactiveViewer) {
                inactiveViewer.style.removeProperty('height');
                inactiveViewer.style.removeProperty('minHeight');
            }

            if (target === mapContainer && this.mapViz?.map) {
                this.mapViz.map.invalidateSize();
            }

            if (target === viewer3DContainer && this.viewer3D?.isInitialized) {
                this.viewer3D.resize(updatedRect.width, updatedRect.height);
            }
        });
    }

    resetViewerHeights(mapContainer, viewer3DContainer) {
        const mapEl = mapContainer || document.getElementById('map-container');
        const viewerEl = viewer3DContainer || document.getElementById('viewer-3d-container');

        mapEl?.style.removeProperty('height');
        mapEl?.style.removeProperty('minHeight');
        viewerEl?.style.removeProperty('height');
        viewerEl?.style.removeProperty('minHeight');
    }

    updateDomainControlState() {
        const overlayValue = this.aggregationOptions.overlay;
        const isFictional = overlayValue && overlayValue !== 'real';
        const timeRadio = document.getElementById('domain-time');
        const distanceRadio = document.getElementById('domain-distance');
        const timeRadioLabel = timeRadio?.closest('.radio-option');
        const controlsLocked = Boolean(this.activeCoin);

        if (timeRadio) {
            const shouldDisableTime = controlsLocked || !isFictional;
            timeRadio.disabled = shouldDisableTime;
            if (!isFictional) {
                timeRadio.checked = false;
            }

            if (timeRadioLabel) {
                const tooltip = controlsLocked
                    ? 'Viewing a saved coin. Switch back to Routes to change distribution.'
                    : 'Select a fictional overlay to unlock time distribution.';
                if (shouldDisableTime) {
                    timeRadioLabel.setAttribute('title', tooltip);
                } else {
                    timeRadioLabel.removeAttribute('title');
                }
            }
        }

        if (timeRadioLabel) {
            const shouldDisableTime = controlsLocked || !isFictional;
            timeRadioLabel.classList.toggle('radio-option-disabled', shouldDisableTime);
        }

        if (!isFictional) {
            this.aggregationOptions.domain = 'distance';
            if (distanceRadio) {
                distanceRadio.checked = true;
            }
        }
    }

    updateSidebarControlsState() {
        const controlsLocked = Boolean(this.activeCoin);

        const overlaySelect = document.getElementById('overlay-select');
        if (overlaySelect) {
            overlaySelect.disabled = controlsLocked;
            if (controlsLocked) {
                overlaySelect.setAttribute('title', 'Viewing a saved coin. Switch back to Routes to choose a new overlay.');
            } else {
                overlaySelect.removeAttribute('title');
            }
        }

        const elevationRadios = document.querySelectorAll('input[name="elevation-mode"]');
        elevationRadios.forEach(radio => {
            radio.disabled = controlsLocked;
            const label = radio.closest('.radio-option');
            if (label) {
                label.classList.toggle('radio-option-disabled', controlsLocked);
                if (controlsLocked) {
                    label.setAttribute('title', 'Viewing a saved coin. Switch back to Routes to change elevation mode.');
                } else {
                    label.removeAttribute('title');
                }
            }
        });

        const domainRadios = document.querySelectorAll('input[name="aggregation-domain"]');
        const overlayIsFictional = this.aggregationOptions.overlay && this.aggregationOptions.overlay !== 'real';
        domainRadios.forEach(radio => {
            if (radio.value === 'time') {
                radio.disabled = controlsLocked || !overlayIsFictional;
            } else {
                radio.disabled = controlsLocked;
            }

            const label = radio.closest('.radio-option');
            if (label) {
                const disabled = radio.disabled;
                label.classList.toggle('radio-option-disabled', disabled);

                if (disabled) {
                    let tooltip;
                    if (controlsLocked) {
                        tooltip = 'Viewing a saved coin. Switch back to Routes to change distribution.';
                    } else if (radio.value === 'time' && !overlayIsFictional) {
                        tooltip = 'Select a fictional overlay to unlock time distribution.';
                    }

                    if (tooltip) {
                        label.setAttribute('title', tooltip);
                    } else {
                        label.removeAttribute('title');
                    }
                } else {
                    label.removeAttribute('title');
                }
            }
        });

        requestAnimationFrame(() => this.alignSidebarWithViewer());
    }

    applyAggregationOptionsToControls(options) {
        this.suppressOptionEvents = true;
        try {
            const elevationActual = document.getElementById('elevation-mode-actual');
            const elevationCumulative = document.getElementById('elevation-mode-cumulative');
            if (elevationActual) {
                elevationActual.checked = options.elevationMode === 'actual';
            }
            if (elevationCumulative) {
                elevationCumulative.checked = options.elevationMode === 'cumulative';
            }

            const overlaySelect = document.getElementById('overlay-select');
            if (overlaySelect) {
                overlaySelect.value = options.overlay;
            }

            const distanceRadio = document.getElementById('domain-distance');
            const timeRadio = document.getElementById('domain-time');
            if (distanceRadio) {
                distanceRadio.checked = options.domain === 'distance';
            }
            if (timeRadio) {
                timeRadio.checked = options.domain === 'time';
            }
        } finally {
            this.suppressOptionEvents = false;
        }

        this.updateDomainControlState();
        this.updateSidebarControlsState();
    }

    updateCoinActionButtons() {
        const hasSelectedRoutes = this.selectedRoutes.size > 0;
        const hasAggregatedRoute = Boolean(this.aggregatedRoute) || Boolean(this.activeCoin);
        const viewCoinBtn = document.getElementById('view-coin-btn');
        const saveBtn = document.getElementById('save-coin-btn');
        const downloadBtn = document.getElementById('download-coin-btn');
        const clearBtn = document.getElementById('clear-coin-btn');

        if (viewCoinBtn) {
            viewCoinBtn.disabled = !hasSelectedRoutes && !hasAggregatedRoute;
        }

        if (saveBtn) {
            saveBtn.disabled = !this.aggregatedRoute || Boolean(this.activeCoin);
        }

        if (downloadBtn) {
            downloadBtn.disabled = !hasAggregatedRoute;
        }

        if (clearBtn) {
            clearBtn.disabled = !this.isShowingAggregated && !this.activeCoin;
        }
    }

    onAggregationOptionsChanged(reason) {
        if (this.activeCoin) {
            return;
        }

        console.log(`⚙️ Aggregation option changed: ${reason}`, this.aggregationOptions);
        this.updateCoinActionButtons();
        this.updateSidebarControlsState();
        this.refreshAggregatedRoute({ reason }).catch(error => {
            console.error('❌ Failed to refresh aggregated route after option change:', error);
            this.showNotification('Failed to update coin view. Check console for details.', 'error');
        });
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

    generateCoinId() {
        if (window.crypto?.randomUUID) {
            return `coin-${window.crypto.randomUUID()}`;
        }
        const randomPart = Math.floor(Math.random() * 1_000_000);
        return `coin-${Date.now()}-${randomPart}`;
    }

    cloneRouteData(route) {
        if (!route) {
            return null;
        }

        if (typeof structuredClone === 'function') {
            return structuredClone(route);
        }

        try {
            return JSON.parse(JSON.stringify(route));
        } catch (error) {
            console.warn('⚠️ Failed to deep-clone route, returning original reference');
            return route;
        }
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
        const fileInput = this.fileInput || document.getElementById('gpx-file-input');
        if (!fileInput) {
            console.warn('⚠️ File input not found when triggering upload');
            return;
        }

        // Focus helps some mobile browsers honor the interaction
        try {
            fileInput.focus({ preventScroll: true });
        } catch (focusError) {
            console.debug('ℹ️ File input focus suppressed:', focusError);
        }

        if (typeof fileInput.showPicker === 'function') {
            fileInput.showPicker().catch(() => fileInput.click());
            return;
        }

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
              const distanceDisplay = this.formatDistance(route.distance);
              const elevationDisplay = this.formatElevation(route.elevationGain);
              return `${index + 1}. ${route.filename}
       📏 ${distanceDisplay}  ⛰️ ${elevationDisplay}  ⏱️ ${duration}`;
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
                                <input type="radio" name="path-pattern" value="semi-circle.json">
                                <div class="option-content">
                                    <strong>⚡ Semi-Circle</strong>
                                    <p>Semi-circle path that explores the full arc</p>
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
            
            const distanceDisplay = this.formatDistance(this.aggregatedRoute.distance);
            const elevationDisplay = this.formatElevation(this.aggregatedRoute.elevationGain);
            const successMessage = `🔗 Aggregated ${this._routesToAggregate.length} routes: ${distanceDisplay}, ${elevationDisplay} elevation`;
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
            aggregatedRoute = await this.createFictionalRouteAggregation(sortedRoutes, elevationMode, pathPattern, 'distance');
        } else {
            throw new Error(`Unknown aggregation mode: ${aggregationMode}`);
        }

        return aggregatedRoute;
    }

    getSelectedRoutesSorted() {
        const selectedRoutes = this.uploadedRoutes.filter(route => this.selectedRoutes.has(route.id));
        return selectedRoutes.sort((a, b) => this.extractRouteTimestamp(a) - this.extractRouteTimestamp(b));
    }

    calculateCombinedStats(routes) {
        return routes.reduce((acc, route) => {
            const stats = this.routeManipulator.calculateRouteStats(route);
            return {
                distance: acc.distance + (stats.distance || 0),
                elevationGain: acc.elevationGain + (stats.elevationGain || 0),
                elevationLoss: acc.elevationLoss + (stats.elevationLoss || 0),
                duration: acc.duration + (stats.duration || 0)
            };
        }, {
            distance: 0,
            elevationGain: 0,
            elevationLoss: 0,
            duration: 0
        });
    }

    getOverlayDisplayName(overlayKey) {
        if (!overlayKey || overlayKey === 'real') {
            return 'Real Route';
        }

        const base = overlayKey.replace(/\.json$/i, '');
        return base
            .split(/[-_]/)
            .map(part => part.charAt(0).toUpperCase() + part.slice(1))
            .join(' ');
    }

    formatTimestampForDisplay(isoString) {
        if (!isoString) {
            return 'Unknown';
        }

        const date = new Date(isoString);
        if (Number.isNaN(date.getTime())) {
            return 'Unknown';
        }

        return date.toLocaleString(undefined, {
            year: 'numeric',
            month: 'short',
            day: 'numeric',
            hour: '2-digit',
            minute: '2-digit'
        });
    }

    getDefaultCoinName() {
        const sourceRoutes = this.aggregatedRoute?.metadata?.coinSourceRoutes || [];

        if (sourceRoutes.length === 1) {
            const filename = sourceRoutes[0].filename || 'Route';
            return filename.replace(/\.gpx$/i, '');
        }

        const selectedRoutes = this.getSelectedRoutesSorted();
        if (selectedRoutes.length === 1) {
            const filename = selectedRoutes[0].filename || 'Route';
            return filename.replace(/\.gpx$/i, '');
        }

        const now = new Date();
        const iso = now.toISOString();
        const datePart = iso.slice(0, 10);
        const timePart = iso.slice(11, 16);
        return `Coin - ${datePart} ${timePart}`;
    }

    promptForCoinName(defaultName) {
        return window.prompt('Name your coin', defaultName ?? '');
    }

    createCoinRecord(name) {
        if (!this.aggregatedRoute) {
            throw new Error('Cannot create coin without aggregated route');
        }

        const coinId = this.generateCoinId();
        const routeClone = this.cloneRouteData(this.aggregatedRoute);

        if (!routeClone.id) {
            routeClone.id = this.generateRouteId();
        }

        routeClone.metadata = {
            ...(routeClone.metadata || {}),
            coinId,
            coinName: name,
            coinOptions: { ...this.aggregationOptions }
        };

        const createdAt = new Date().toISOString();

        return {
            id: coinId,
            name,
            createdAt,
            type: 'coin',
            options: { ...this.aggregationOptions },
            route: routeClone,
            stats: {
                distance: routeClone.distance,
                elevationGain: routeClone.elevationGain,
                elevationLoss: routeClone.elevationLoss,
                duration: routeClone.duration
            },
            sourceRoutes: routeClone.metadata?.coinSourceRoutes || []
        };
    }

    async saveCoinToStorage(coinRecord) {
        if (!this.storageManager || typeof this.storageManager.saveCoin !== 'function') {
            console.warn('⚠️ Coin storage not available; coin will persist for this session only');
            return;
        }

        await this.storageManager.saveCoin(coinRecord);
    }

    async deleteCoinFromStorage(coinId) {
        if (!this.storageManager || typeof this.storageManager.deleteCoin !== 'function') {
            return;
        }

        await this.storageManager.deleteCoin(coinId);
    }

    getTimeAggregationParameters(routes) {
        const allTimestamps = routes.flatMap(route =>
            route.points
                ?.filter(point => point.timestamp)
                .map(point => new Date(point.timestamp)) || []
        ).sort((a, b) => a - b);

        if (allTimestamps.length === 0) {
            throw new Error('No timestamped points found in selected routes');
        }

        const startTime = allTimestamps[0];
        const endTime = allTimestamps.at(-1);
        const totalTimespan = endTime - startTime;
        const timeStepMs = totalTimespan < 28 * 24 * 60 * 60 * 1000 ? 60 * 1000 : 60 * 60 * 1000;
        const stepLabel = timeStepMs >= 24 * 60 * 60 * 1000
            ? 'day'
            : timeStepMs >= 60 * 60 * 1000
                ? 'hour'
                : 'minute';

        return { startTime, endTime, timeStepMs, stepLabel, totalTimespan };
    }

    scrollListItemIntoView(containerId, selector) {
        const container = document.getElementById(containerId);
        if (!container) {
            return;
        }

        const target = container.querySelector(selector);
        if (!target) {
            return;
        }

        try {
            target.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
        } catch (error) {
            console.warn('⚠️ Failed to scroll list item into view:', error);
        }
    }

    async buildAggregatedRoute(routes, options) {
        const sortedRoutes = [...routes];
        if (sortedRoutes.length === 0) {
            throw new Error('Cannot build aggregated route without routes');
        }

        console.log('🔄 Building aggregated route with options:', options, sortedRoutes.map(r => r.filename));

        let aggregatedRoute;

        if (!options || options.overlay === 'real') {
            aggregatedRoute = this.createDistanceBasedAggregation(sortedRoutes, options?.elevationMode || 'actual');
        } else {
            aggregatedRoute = await this.createFictionalRouteAggregation(
                sortedRoutes,
                options.elevationMode || 'actual',
                options.overlay,
                options.domain || 'distance'
            );
        }

        if (!aggregatedRoute.id) {
            aggregatedRoute.id = this.generateRouteId();
        }

        aggregatedRoute.metadata = {
            ...(aggregatedRoute.metadata || {}),
            coinOptions: { ...options },
            coinSourceRoutes: sortedRoutes.map(route => ({
                id: route.id,
                filename: route.filename,
                timestamp: this.extractRouteTimestamp(route)
            }))
        };

        return aggregatedRoute;
    }

    async refreshAggregatedRoute({ reason = 'manual' } = {}) {
        if (this.activeCoin) {
            console.log('🪙 Active coin loaded; skipping aggregation refresh');
            return;
        }

        this.pendingAggregation = { reason };

        if (this.isAggregating) {
            console.log('⏳ Aggregation already in progress, will rerun after completion');
            return;
        }

        while (this.pendingAggregation) {
            const context = this.pendingAggregation;
            this.pendingAggregation = null;
            await this.computeAggregatedRoute(context.reason);
        }
    }

    async computeAggregatedRoute(reason) {
        const routesToAggregate = this.getSelectedRoutesSorted();

        if (routesToAggregate.length === 0) {
            console.log('ℹ️ No selected routes for aggregation; clearing aggregated route');
            this.aggregatedRoute = null;
            if (!this.activeCoin) {
                this.isShowingAggregated = false;
            }
            this.updateCoinActionButtons();
            this.updateStatsDisplay();
            return;
        }

        this.isAggregating = true;
        try {
            const aggregatedRoute = await this.buildAggregatedRoute(routesToAggregate, this.aggregationOptions);
            this.aggregatedRoute = aggregatedRoute;

            console.log(`✅ Aggregated route refreshed (${reason}) -> ${aggregatedRoute.filename}`);

            if (this.isShowingAggregated) {
                this.clearAllVisualizationsRoutes();
                this.addRouteToAllVisualizations(aggregatedRoute);
                if (this.currentViewMode === '3d' && this.is3DInitialized) {
                    this.refresh3DViewer();
                }
            }

            this.updateStatsDisplay();
        } catch (error) {
            console.error('❌ Aggregation failed:', error);
            throw error;
        } finally {
            this.isAggregating = false;
            this.updateCoinActionButtons();
        }
    }

    async handleSaveCoinClick() {
        if (this.activeCoin) {
            this.showNotification('Clear the active coin before saving a new one.', 'info');
            return;
        }

        if (!this.aggregatedRoute) {
            this.showNotification('Select routes and choose View Coin before saving.', 'warning');
            return;
        }

        const defaultName = this.getDefaultCoinName();
        const enteredName = this.promptForCoinName(defaultName);

        if (enteredName === null) {
            this.showNotification('Coin save cancelled.', 'info');
            return;
        }

        const trimmedName = enteredName.trim();
        if (!trimmedName) {
            this.showNotification('Please enter a name for your coin.', 'warning');
            return;
        }

        let coinRecord;
        try {
            coinRecord = this.createCoinRecord(trimmedName);
        } catch (error) {
            console.error('❌ Failed to prepare coin for saving:', error);
            this.showNotification('Failed to prepare coin for saving. Check console for details.', 'error');
            return;
        }

        this.savedCoins.unshift(coinRecord);
        this.pendingCoinScrollId = coinRecord.id;
        this.updateCoinList();

        if (typeof this.activateListTab === 'function') {
            this.activateListTab('coins');
        }

        try {
            await this.saveCoinToStorage(coinRecord);
            this.showNotification(`💾 Saved coin "${coinRecord.name}"`, 'success');
        } catch (error) {
            console.error('❌ Failed to persist coin:', error);
            this.showNotification('Coin saved for this session, but persistent storage failed.', 'warning');
        }
    }

    handleDownloadCoinClick() {
        if (this.activeCoin) {
            this.downloadSavedCoin(this.activeCoin.id);
            return;
        }

        if (!this.aggregatedRoute) {
            this.showNotification('Create or load a coin before downloading.', 'warning');
            return;
        }

        this.downloadRoute(this.aggregatedRoute.id);
    }

    handleClearCoinClick() {
        if (!this.isShowingAggregated && !this.activeCoin) {
            return;
        }

        const hadActiveCoin = Boolean(this.activeCoin);

        if (hadActiveCoin) {
            this.activeCoin = null;
            this.aggregatedRoute = null;
            this.isShowingAggregated = false;

            if (this.previousAggregationOptions) {
                this.aggregationOptions = { ...this.previousAggregationOptions };
            }

            this.applyAggregationOptionsToControls(this.aggregationOptions);

            if (this.lastRouteSelectionBeforeCoin) {
                this.selectedRoutes = new Set(this.lastRouteSelectionBeforeCoin);
                const firstRoute = this.selectedRoutes.values().next().value;
                this.pendingRouteScrollId = firstRoute ?? null;
            }

            this.previousAggregationOptions = null;
            this.lastRouteSelectionBeforeCoin = null;

            if (typeof this.activateListTab === 'function') {
                this.activateListTab('routes');
            }
        } else {
            this.isShowingAggregated = false;
            this.aggregatedRoute = null;
        }

        this.updateSidebarControlsState();
        this.updateCoinActionButtons();
        this.updateCoinList();
        this.showMapView();

        this.notifyStateChange('selected-routes-changed', { reason: 'coin-cleared' });

        if (hadActiveCoin) {
            this.showNotification('Cleared active coin.', 'info');
        }
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

        const originalDistanceDisplay = this.formatDistance(originalStats.distance);
        const originalElevationDisplay = this.formatElevation(originalStats.elevationGain, { precision: 1 });
        console.log(`📊 Original combined stats before aggregation: ${originalDistanceDisplay}, ${originalElevationDisplay} gain`);

        // Use RouteManipulator to aggregate routes
        let aggregatedRoute = this.routeManipulator.aggregateAndResampleRoutes(routes);
        
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
            totalDistance: this.formatDistance(aggregatedRoute.distance),
            totalElevationGain: this.formatElevation(aggregatedRoute.elevationGain),
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

        const timeAggregationDistanceDisplay = this.formatDistance(originalStats.distance);
        const timeAggregationElevationDisplay = this.formatElevation(originalStats.elevationGain, { precision: 1 });
    console.log(`📊 Original combined stats before aggregation: ${timeAggregationDistanceDisplay}, ${timeAggregationElevationDisplay} gain`);


        // Step 1: Spatially aggregate routes using RouteManipulator
        let spatiallyAggregatedRoute = this.routeManipulator.aggregateAndResampleRoutes(routes);
        
        const timeParams = this.getTimeAggregationParameters(routes);

        // Step 3: Convert to time domain
        let aggregatedRoute = this.routeManipulator.convertToTimeDomain(
            spatiallyAggregatedRoute,
            timeParams.startTime,
            timeParams.endTime,
            timeParams.timeStepMs
        );
        
        // Step 4: Apply elevation mode processing
        if (elevationMode === 'cumulative') {
            aggregatedRoute = this.routeManipulator.convertToCumulativeElevation(aggregatedRoute);
        }
        
        // Step 5: Scale elevation to 10km for natural 3D visualization
        console.log(`📏 Scaling elevation for 3D visualization...`);
        aggregatedRoute = this.routeManipulator.scaleElevation(aggregatedRoute, 10000);
        
        // Restore the original statistics (scaleElevation modifies them for visualization)
        aggregatedRoute.distance = originalStats.distance;
        aggregatedRoute.elevationGain = originalStats.elevationGain;
        aggregatedRoute.elevationLoss = originalStats.elevationLoss;
        aggregatedRoute.duration = originalStats.duration;
        
        // Step 6: Update metadata
        aggregatedRoute.filename = `Aggregated Route (${routes.length} routes) - ${elevationMode === 'actual' ? 'Time-based' : 'Time-based Cumulative'}`;
        aggregatedRoute.metadata = {
            ...aggregatedRoute.metadata,
            name: `Time-based Aggregated Route - ${routes.map(r => r.filename).join(', ')}`,
            description: `Spatially connected and time-aggregated from ${routes.length} routes using ${timeParams.stepLabel} intervals with ${elevationMode} elevation`,
            aggregationMode: 'time',
            elevationMode: elevationMode,
            timeStep: timeParams.stepLabel,
            timeStepMs: timeParams.timeStepMs,
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
            totalDistance: this.formatDistance(aggregatedRoute.distance),
            totalElevationGain: this.formatElevation(aggregatedRoute.elevationGain),
            sourceRoutes: aggregatedRoute.metadata.sourceRoutes.length
        });

        return aggregatedRoute;
    }

    // Create fictional route aggregation using RouteManipulator
    async createFictionalRouteAggregation(routes, elevationMode, pathPattern, distributionMode = 'distance') {
        console.log(`🎨 Creating fictional route with ${pathPattern} pattern, ${elevationMode} elevation, ${distributionMode} distribution`);

        const originalStats = this.calculateCombinedStats(routes);
        const distanceDisplay = this.formatDistance(originalStats.distance);
        const elevationDisplay = this.formatElevation(originalStats.elevationGain, { precision: 1 });
        console.log(`📊 Combined stats before transformation: ${distanceDisplay}, ${elevationDisplay} gain`);

        // Step 1: Aggregate routes spatially
        let workingRoute = this.routeManipulator.aggregateAndResampleRoutes(routes);

        // Step 2: Optionally convert to time domain before elevation adjustments
        let timeParams = null;
        if (distributionMode === 'time') {
            timeParams = this.getTimeAggregationParameters(routes);
            console.log(`⏱️ Applying time distribution with ${timeParams.stepLabel} steps`);
            workingRoute = this.routeManipulator.convertToTimeDomain(
                workingRoute,
                timeParams.startTime,
                timeParams.endTime,
                timeParams.timeStepMs
            );
        }

        // Step 3: Apply elevation mode (after time conversion if applicable)
        if (elevationMode === 'cumulative') {
            workingRoute = this.routeManipulator.convertToCumulativeElevation(workingRoute);
        }

        // Step 4: Overlay predetermined path
        console.log(`🗺️ Applying predetermined path: ${pathPattern}`);
        let fictionalRoute = await this.routeManipulator.applyPredeterminedPath(workingRoute, pathPattern);

        // Step 5: Scale elevation for visualization
        console.log('📏 Scaling elevation for visualization');
        fictionalRoute = this.routeManipulator.scaleElevation(fictionalRoute, 10000);

        // Step 6: Restore statistics
        fictionalRoute.distance = originalStats.distance;
        fictionalRoute.elevationGain = originalStats.elevationGain;
        fictionalRoute.elevationLoss = originalStats.elevationLoss;
        fictionalRoute.duration = originalStats.duration;

        // Step 7: Update metadata
        fictionalRoute.filename = `Fictional Route (${routes.length} routes) - ${fictionalRoute?.metadata?.templateName || pathPattern} - ${distributionMode === 'time' ? 'Time' : 'Distance'} ${elevationMode === 'actual' ? 'Elevation' : 'Cumulative'}`;
        fictionalRoute.metadata = {
            ...fictionalRoute.metadata,
            name: `Fictional ${pathPattern} Route - ${routes.map(r => r.filename).join(', ')}`,
            description: `Synthetic ${pathPattern} route using ${distributionMode} distribution with ${elevationMode} elevation across ${routes.length} routes`,
            aggregationMode: 'fictional',
            elevationMode,
            pathPattern,
            distributionMode,
            timeStep: timeParams?.stepLabel,
            timeStepMs: timeParams?.timeStepMs,
            originalStats,
            sourceRoutes: routes.map(r => ({
                id: r.id,
                filename: r.filename,
                timestamp: this.extractRouteTimestamp(r)
            }))
        };

        console.log(`✅ Fictional ${pathPattern} route ready`, {
            filename: fictionalRoute.filename,
            totalPoints: fictionalRoute.points.length,
            distribution: distributionMode,
            totalDistance: this.formatDistance(fictionalRoute.distance),
            totalElevationGain: this.formatElevation(fictionalRoute.elevationGain),
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
        this.selectedRoutes.clear();
        this.isShowingAggregated = false;
        this.activeCoin = null;
        this.previousAggregationOptions = null;
        this.lastRouteSelectionBeforeCoin = null;
        
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
        if (this.mapViz?.map) {
            this.mapViz.clearAllRoutes();
            console.log('🗺️ Map visualization cleared');
        }

        // Clear 3D visualization
        if (this.viewer3D?.isInitialized) {
            this.viewer3D.clearAllRoutes();
            console.log('🎮 3D visualization cleared');
        }
        
        // Return to initial state
        this.showInitialUIState();
        this.applyAggregationOptionsToControls(this.aggregationOptions);
        this.updateSidebarControlsState();
        this.updateCoinActionButtons();
        this.updateCoinList();
        
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

    async loadStoredCoins() {
        try {
            console.log('🪙 Loading saved coins...');

            if (this.storageManager && typeof this.storageManager.loadCoins === 'function') {
                const coins = await this.storageManager.loadCoins();
                this.savedCoins = (coins || []).sort((a, b) => {
                    const dateA = new Date(a.createdAt || 0).getTime();
                    const dateB = new Date(b.createdAt || 0).getTime();
                    return dateB - dateA;
                });
            } else {
                this.savedCoins = [];
            }

            this.updateCoinList();
        } catch (error) {
            console.error('❌ Failed to load saved coins:', error);
            this.savedCoins = [];
            this.updateCoinList();
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

        if (this.uploadedRoutes.length === 0) {
            routeListContainer.innerHTML = '<p class="empty-state">Upload GPX routes to get started</p>';
            return;
        }

        const selectionLocked = Boolean(this.activeCoin);
        const totalRoutes = this.uploadedRoutes.length;
        const selectedCount = this.selectedRoutes.size;
        const allSelected = totalRoutes > 0 && selectedCount === totalRoutes;
        const hasAnythingToClear = selectedCount > 0 || this.isShowingAggregated;
        const selectAllDisabledAttr = (selectionLocked || allSelected) ? 'disabled' : '';
        const selectNoneDisabledAttr = (selectionLocked || !hasAnythingToClear) ? 'disabled' : '';

        const bulkControls = `
            <div class="route-list-controls">
                <button type="button" class="btn btn-secondary" ${selectAllDisabledAttr}
                    onclick="window.fileUploader.selectAllRoutes()">Select All</button>
                <button type="button" class="btn btn-secondary" ${selectNoneDisabledAttr}
                    onclick="window.fileUploader.selectNoRoutes()">Select None</button>
            </div>
        `;

        const routeItems = this.uploadedRoutes.map((route, index) => {
            const isSelected = this.selectedRoutes.has(route.id);
            const classes = ['route-list-item', isSelected ? 'selected' : 'unselected'];
            if (selectionLocked) {
                classes.push('disabled');
            }

            const distanceDisplay = this.formatDistance(route.distance);
            const elevationDisplay = this.formatElevation(route.elevationGain);
            const durationDisplay = route.duration ? this.formatDuration(route.duration) : 'Unknown';
            const color = this.mapViz?.routeLayers?.find(layer => layer.id === route.id)?.color || '#2563eb';
            const disabledAttr = selectionLocked ? 'disabled' : '';

            return `
                <div class="${classes.join(' ')}" data-route-id="${route.id}">
                    <div class="route-item-checkbox">
                        <input type="checkbox" ${disabledAttr} id="route-checkbox-${route.id}" ${isSelected ? 'checked' : ''}
                               onchange="window.fileUploader.toggleRouteVisibility('${route.id}')">
                    </div>
                    <div class="route-item-info">
                        <h4 title="${route.filename}">${index + 1}. ${this.truncateFilename(route.filename)}</h4>
                        <div class="route-item-stats">
                            <span>📏 ${distanceDisplay}</span>
                            <span>⛰️ ${elevationDisplay}</span>
                            <span>⏱️ ${durationDisplay}</span>
                        </div>
                    </div>
                    <div class="route-item-color" style="background-color: ${color}"></div>
                    <div class="route-item-actions">
                        <button class="route-action-btn" onclick="window.fileUploader.downloadRoute('${route.id}')" title="Download GPX">💾</button>
                        <button class="route-action-btn" onclick="window.fileUploader.zoomToRoute('${route.id}')" title="Zoom to Route">🔍</button>
                        <button class="route-action-btn" onclick="window.fileUploader.removeRouteById('${route.id}')" title="Remove Route">🗑️</button>
                    </div>
                </div>
            `;
        }).join('');

        routeListContainer.innerHTML = bulkControls + routeItems;

        if (this.pendingRouteScrollId) {
            this.scrollListItemIntoView('route-list', `[data-route-id="${this.pendingRouteScrollId}"]`);
            this.pendingRouteScrollId = null;
        }
    }

    selectAllRoutes() {
        if (this.activeCoin || this.uploadedRoutes.length === 0) {
            return;
        }

        const previousSize = this.selectedRoutes.size;

        this.uploadedRoutes.forEach(route => {
            this.selectedRoutes.add(route.id);
        });

        if (this.selectedRoutes.size === previousSize) {
            return;
        }

        this.notifyStateChange('selected-routes-changed', {
            reason: 'select-all'
        });
    }

    selectNoRoutes() {
        if (this.activeCoin) {
            return;
        }

        const hadSelection = this.selectedRoutes.size > 0;
        const wasShowingAggregated = this.isShowingAggregated;

        if (!hadSelection && !wasShowingAggregated) {
            return;
        }

        this.selectedRoutes.clear();
        this.isShowingAggregated = false;
        this.pendingRouteScrollId = null;

        this.notifyStateChange('selected-routes-changed', {
            reason: 'select-none'
        });
    }

    updateCoinList() {
        const coinListContainer = document.getElementById('coin-list');
        if (!coinListContainer) {
            return;
        }

        if (!this.savedCoins || this.savedCoins.length === 0) {
            coinListContainer.innerHTML = '<p class="empty-state">Save a coin to see it here</p>';
            return;
        }

        const highlightCoinId = this.pendingCoinScrollId;

        const listHtml = this.savedCoins.map(coin => {
            const distanceValue = coin.stats?.distance ?? coin.route?.distance ?? 0;
            const elevationValue = coin.stats?.elevationGain ?? coin.route?.elevationGain ?? 0;
            const distanceDisplay = this.formatDistance(distanceValue);
            const elevationDisplay = this.formatElevation(elevationValue);
            const createdAtDisplay = this.formatTimestampForDisplay(coin.createdAt);
            const overlayDisplay = this.getOverlayDisplayName(coin.options?.overlay);
            const elevationModeDisplay = coin.options?.elevationMode === 'cumulative' ? 'Cumulative' : 'Actual';
            const isActive = this.activeCoin?.id === coin.id;
            const classes = ['coin-list-item'];
            if (isActive) {
                classes.push('active');
            }
            if (highlightCoinId && coin.id === highlightCoinId) {
                classes.push('coin-list-item-highlight');
            }

            const rawName = coin.name || 'Untitled Coin';
            const safeName = this.escapeXml ? this.escapeXml(rawName) : rawName;

            return `
                <div class="${classes.join(' ')}" data-coin-id="${coin.id}" onclick="window.fileUploader.selectSavedCoin('${coin.id}')">
                    <div class="coin-item-main">
                        <h4 title="${safeName}">💰 ${safeName}</h4>
                        <div class="coin-item-meta">
                            <span>${overlayDisplay} • ${elevationModeDisplay}</span>
                            <span>${createdAtDisplay}</span>
                        </div>
                        <div class="coin-item-stats">
                            <span>📏 ${distanceDisplay}</span>
                            <span>⛰️ ${elevationDisplay}</span>
                        </div>
                    </div>
                    <div class="coin-item-actions">
                        <button class="coin-action-btn" title="Download Coin" onclick="event.stopPropagation(); window.fileUploader.downloadSavedCoin('${coin.id}')">⬇️</button>
                        <button class="coin-action-btn" title="Delete Coin" onclick="event.stopPropagation(); window.fileUploader.deleteSavedCoin('${coin.id}')">🗑️</button>
                    </div>
                </div>
            `;
        }).join('');

        coinListContainer.innerHTML = listHtml;

        const coinIdToScroll = this.pendingCoinScrollId || this.activeCoin?.id;
        if (coinIdToScroll) {
            this.scrollListItemIntoView('coin-list', `[data-coin-id="${coinIdToScroll}"]`);
        }
        this.pendingCoinScrollId = null;
    }

    async selectSavedCoin(coinId) {
        const coin = this.savedCoins.find(item => item.id === coinId);
        if (!coin) {
            this.showNotification('Saved coin not found.', 'error');
            return;
        }

        if (this.activeCoin?.id === coinId) {
            await this.switchViewMode('3d');
            return;
        }

        if (typeof this.activateListTab === 'function') {
            this.activateListTab('coins');
        }

        this.pendingCoinScrollId = coinId;

        if (!this.activeCoin) {
            this.previousAggregationOptions = { ...this.aggregationOptions };
            this.lastRouteSelectionBeforeCoin = new Set(this.selectedRoutes);
        }

        this.activeCoin = coin;
        this.aggregationOptions = { ...coin.options };
        this.applyAggregationOptionsToControls(this.aggregationOptions);

        this.selectedRoutes.clear();
        this.isShowingAggregated = true;
        this.aggregatedRoute = this.cloneRouteData(coin.route);

        this.updateSidebarControlsState();
        this.updateCoinActionButtons();
        this.updateCoinList();
        this.updateRouteList();
        this.updateStatsDisplay();

        this.notifyStateChange('selected-routes-changed', { reason: 'coin-selected', coinId });

        await this.switchViewMode('3d');
    }

    async deleteSavedCoin(coinId) {
        const coinIndex = this.savedCoins.findIndex(item => item.id === coinId);
        if (coinIndex === -1) {
            return;
        }

        const coin = this.savedCoins[coinIndex];

        const confirmed = window.confirm(`Delete coin "${coin.name}"? This cannot be undone.`);
        if (!confirmed) {
            return;
        }

        this.savedCoins.splice(coinIndex, 1);

        try {
            await this.deleteCoinFromStorage(coinId);
        } catch (error) {
            console.error('❌ Failed to delete coin from storage:', error);
        }

        const clearingActiveCoin = this.activeCoin?.id === coinId;
        if (clearingActiveCoin) {
            this.handleClearCoinClick();
        } else {
            this.updateCoinList();
        }

        this.showNotification(`🗑️ Deleted coin "${coin.name}"`, 'info');
    }

    downloadSavedCoin(coinId) {
        const coin = this.savedCoins.find(item => item.id === coinId);
        if (!coin) {
            this.showNotification('Saved coin not found.', 'error');
            return;
        }

        try {
            const rawName = coin.name || 'coin';
            const filenameBase = rawName.replace(/[^a-z0-9\-_. ]/gi, '_').trim() || 'coin';
            const filename = `${filenameBase}.gpx`;
            const routeForDownload = this.cloneRouteData(coin.route);
            const gpxContent = this.generateGPXContent(routeForDownload);
            this.downloadFile(gpxContent, filename, 'application/gpx+xml');
            this.showNotification(`📥 Downloaded coin "${rawName}"`, 'success');
        } catch (error) {
            console.error('❌ Failed to download coin:', error);
            this.showNotification('Failed to download coin. Check console for details.', 'error');
        }
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
            const coinMatch = this.savedCoins.find(coin => coin.route?.id === routeId);
            if (coinMatch) {
                routeToDownload = coinMatch.route;
                filename = `${coinMatch.name.replace(/[^a-z0-9\-_. ]/gi, '_').trim() || 'coin'}.gpx`;
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

    // Toggle route visibility for selection list
    toggleRouteVisibility(routeId) {
        const checkbox = document.getElementById(`route-checkbox-${routeId}`);
        const isChecked = checkbox?.checked || false;

        if (isChecked) {
            this.selectedRoutes.add(routeId);
        } else {
            this.selectedRoutes.delete(routeId);
        }

        this.pendingRouteScrollId = routeId;

        this.notifyStateChange('selected-routes-changed', {
            reason: 'visibility-toggled',
            routeId,
            visible: isChecked
        });
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
        const totalDistanceDisplay = this.formatDistance(totalDistance);
        const totalElevationDisplay = this.formatElevation(totalElevation);

        if (totalDistanceEl) {
            totalDistanceEl.textContent = totalDistanceDisplay;
        }
        if (totalElevationEl) {
            totalElevationEl.textContent = totalElevationDisplay;
        }
        
        if (!routesCountEl || !totalDistanceEl || !totalElevationEl) {
            console.warn('⚠️ Some stats elements not found, stats update postponed');
        } else {
            const statsType = this.isShowingAggregated ? 'aggregated' : 'selected individual';
            console.log(`📊 Stats updated (${statsType}): ${totalRoutes} routes, ${totalDistanceDisplay}, ${totalElevationDisplay}`);
        }

        this.alignSidebarWithViewer();
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
            this.currentViewMode = 'map';
            this.showMapView();
            this.updateCoinActionButtons();
            return;
        }

        if (mode === '3d') {
            if (!this.activeCoin) {
                await this.refreshAggregatedRoute({ reason: 'view-toggle' });
                if (!this.aggregatedRoute) {
                    this.showNotification('Select at least one route to preview your coin.', 'warning');
                    return;
                }
            }

            this.isShowingAggregated = true;
            await this.show3DView();
            this.currentViewMode = '3d';
            this.updateCoinActionButtons();
        }
    }

    // Switch to map view
    showMapView() {
        const mapContainer = document.getElementById('map-container');
        const viewer3DContainer = document.getElementById('viewer-3d-container');
        const mapBtn = document.getElementById('map-view-btn');
        const viewer3DBtn = document.getElementById('view-coin-btn');

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

        requestAnimationFrame(() => this.alignSidebarWithViewer());

        console.log('🗺️ Switched to map view');
    }

    // Switch to 3D view
    async show3DView() {
        const mapContainer = document.getElementById('map-container');
        const viewer3DContainer = document.getElementById('viewer-3d-container');
        const mapBtn = document.getElementById('map-view-btn');
        const viewer3DBtn = document.getElementById('view-coin-btn');

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

        requestAnimationFrame(() => this.alignSidebarWithViewer());

        console.log('🎮 Switched to View Coin');
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

    // Display Year Coin from Worker endpoint
    async displayYearCoin(yearCoinData) {
        if (!yearCoinData || !yearCoinData.route) {
            console.error('❌ Invalid year coin data');
            return;
        }

        console.log('📅 Displaying Year Coin:', yearCoinData.metadata);

        const route = yearCoinData.route;

        // Add the year coin as a special route
        route.id = route.id || `year_coin_${yearCoinData.metadata.year}`;
        route.uploadTime = Date.now();

        // Clear existing routes and add year coin
        this.withDeferredUpdates(() => {
            // Clear existing selection
            this.selectedRoutes.clear();
            this.aggregatedRoute = null;

            // Add year coin route
            this.uploadedRoutes = [route];
            this.selectedRoutes.add(route.id);
        });

        // Save to storage
        await this.saveRoutesToStorage();

        // Trigger visualization update through state change
        this.notifyStateChange('selected-routes-changed', { reason: 'year-coin-loaded' });

        // Switch to 3D view to show the coin
        await this.switchViewMode('3d');

        // Show success notification
        this.showNotification(
            `Year Coin created successfully! ${yearCoinData.metadata.totalActivities} activities, ${yearCoinData.metadata.totalDistance.toFixed(1)}km total distance`,
            'success',
            5000
        );

        console.log('✅ Year Coin displayed successfully');
    }
}

export default FileUploadHandler;
