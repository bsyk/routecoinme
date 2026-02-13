// 3D Route Visualization using online-3d-viewer (OV)
// Renders actual STL coin geometry via OV.EmbeddedViewer
import * as OV from 'online-3d-viewer';
import { exportToSTL } from '../export/stl-exporter.js';
import { DEFAULT_STL_OPTIONS } from '../export/stl-options.js';

class Route3DVisualization {
    constructor(containerId = 'route-3d-viewer') {
        this.containerId = containerId;
        this.containerElement = null;
        this.ovViewer = null;
        this.isInitialized = false;
        this.currentRouteId = null;
        this.currentRouteData = null;

        // Resolves when the current OV load finishes (or immediately if idle).
        // OV's ThreeModelLoader silently drops LoadModel calls while inProgress,
        // so we must wait for completion before issuing a new load.
        this._loadDone = Promise.resolve();
        this._resolveLoad = null;
    }

    // Initialize the OV embedded viewer
    initialize(containerElement) {
        try {
            console.log('🚀 Starting OV 3D viewer initialization...');

            const containerStyle = window.getComputedStyle(containerElement);
            if (containerStyle.display === 'none') {
                console.warn('⚠️ Container is hidden (display: none), skipping initialization');
                return false;
            }

            if (containerElement.clientWidth === 0 || containerElement.clientHeight === 0) {
                console.warn('⚠️ Container has zero dimensions, retrying in 100ms...');
                setTimeout(() => this.initialize(containerElement), 100);
                return false;
            }

            // Clean up any previous viewer
            this.cleanup();

            this.containerElement = containerElement;
            containerElement.innerHTML = '';

            // Create the single OV embedded viewer (never recreated — each
            // EmbeddedViewer constructor leaks a WebGL context via HasHighpDriverIssue).
            this.ovViewer = new OV.EmbeddedViewer(containerElement, {
                backgroundColor: new OV.RGBAColor(255, 255, 255, 255),
                defaultColor: new OV.RGBColor(200, 200, 200),
                edgeSettings: new OV.EdgeSettings(false, new OV.RGBColor(0, 0, 0), 1),
                onModelLoaded: () => {
                    console.log('🪙 Coin loaded in viewer');
                    this._finishLoad();
                },
                onModelLoadFailed: () => {
                    console.warn('⚠️ Coin load failed');
                    this._finishLoad();
                },
            });

            this.isInitialized = true;
            console.log('🎮 OV 3D viewer fully initialized!');
            return true;
        } catch (error) {
            console.error('❌ Failed to initialize OV 3D viewer:', error);
            return false;
        }
    }

    // Signal that the current OV load has completed.
    _finishLoad() {
        if (this._resolveLoad) {
            this._resolveLoad();
            this._resolveLoad = null;
        }
    }

    // Mark a new load as in-progress and return the previous load's promise
    // so callers can await it before issuing the new load.
    _startLoad() {
        const prev = this._loadDone;
        this._loadDone = new Promise((resolve) => {
            this._resolveLoad = resolve;
        });
        return prev;
    }

    // Add a route by generating its STL and loading into OV
    async addRoute(routeData, stlOptions = DEFAULT_STL_OPTIONS) {
        if (!this.isInitialized || !this.ovViewer) {
            console.warn('3D viewer not initialized');
            return false;
        }

        if (!routeData?.points?.length) {
            console.warn(`❌ Cannot add route: ${routeData?.filename || 'unnamed'} - no valid points`);
            return false;
        }

        this.currentRouteData = routeData;

        console.log(`🪙 Generating coin STL for: ${routeData.filename || routeData.id}`);

        try {
            // Generate STL blob using the existing export pipeline
            const stlBlob = await exportToSTL(routeData, stlOptions);

            // Wait for any in-flight OV load to finish before starting a new one.
            // OV's ThreeModelLoader.LoadModel silently returns if inProgress is true.
            const prev = this._startLoad();
            await prev;

            // Wrap blob in a File object for OV
            const file = new File([stlBlob], 'coin.stl', { type: 'application/octet-stream' });
            const dt = new DataTransfer();
            dt.items.add(file);

            // Load model into OV (clears previous model internally)
            this.ovViewer.LoadModelFromFileList(dt.files);

            this.currentRouteId = routeData.id;
            return true;
        } catch (error) {
            console.error('❌ Failed to load coin into viewer:', error);
            this._finishLoad();
            return false;
        }
    }

    // Re-render the current route with new STL options (live preview)
    async updateOptions(stlOptions) {
        if (this.currentRouteData) {
            return this.addRoute(this.currentRouteData, stlOptions);
        }
        return false;
    }

    // Clear all routes from the viewer
    clearAllRoutes() {
        if (!this.isInitialized || !this.ovViewer) {
            console.log('⚠️ 3D viewer not initialized, skipping clearAllRoutes');
            return;
        }

        try {
            this.ovViewer.GetViewer().Clear();
        } catch (error) {
            console.warn('⚠️ Could not clear viewer:', error);
        }

        this.currentRouteId = null;
    }

    // Remove a specific route
    removeRoute(routeId) {
        if (routeId === this.currentRouteId) {
            this.clearAllRoutes();
            return true;
        }
        return false;
    }

    // Handle window resize - OV reads parent element dimensions
    resize() {
        if (!this.ovViewer) return;

        try {
            this.ovViewer.Resize();
        } catch (error) {
            // Ignore resize errors during transitions
        }
    }

    // Cleanup resources
    cleanup() {
        if (this.ovViewer) {
            try {
                this.ovViewer.Destroy();
            } catch (error) {
                // Ignore cleanup errors
            }
            this.ovViewer = null;
        }

        this.containerElement = null;
        this.isInitialized = false;
        this.currentRouteId = null;
        this.currentRouteData = null;
        this._finishLoad();
        this._loadDone = Promise.resolve();
    }

    // Camera controls
    zoomIn() {
        if (!this.ovViewer) return;
        try {
            const viewer = this.ovViewer.GetViewer();
            viewer.navigation.Zoom(0.1);
            viewer.Render();
        } catch (error) {
            console.warn('⚠️ Zoom in failed:', error);
        }
    }

    zoomOut() {
        if (!this.ovViewer) return;
        try {
            const viewer = this.ovViewer.GetViewer();
            viewer.navigation.Zoom(-0.1);
            viewer.Render();
        } catch (error) {
            console.warn('⚠️ Zoom out failed:', error);
        }
    }

    fitToView() {
        if (!this.ovViewer) return;
        try {
            const viewer = this.ovViewer.GetViewer();
            const boundingSphere = viewer.GetBoundingSphere(() => true);
            viewer.FitSphereToWindow(boundingSphere, true);
        } catch (error) {
            console.warn('⚠️ Fit to view failed:', error);
        }
    }

    resetView() {
        this.fitToView();
    }

    // No-op stubs for removed features
    toggleFilledArea() {}
    toggleClimbingOnly() {}
}

export default Route3DVisualization;
