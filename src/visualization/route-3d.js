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
        this._loadInProgress = false;
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
            this._createViewer();

            this.isInitialized = true;
            console.log('🎮 OV 3D viewer fully initialized!');
            return true;
        } catch (error) {
            console.error('❌ Failed to initialize OV 3D viewer:', error);
            return false;
        }
    }

    // Create (or recreate) the OV embedded viewer inside the stored container
    _createViewer() {
        // Destroy previous viewer if any
        if (this.ovViewer) {
            try {
                this.ovViewer.Destroy();
            } catch (e) {
                // ignore
            }
            this.ovViewer = null;
        }

        // Remove only canvas elements — leave any progressDiv in the DOM so that
        // stale onModelFinished callbacks from a destroyed viewer can still call
        // parentElement.removeChild(progressDiv) without a NotFoundError.
        for (const canvas of [...this.containerElement.querySelectorAll('canvas')]) {
            canvas.remove();
        }

        this._loadInProgress = false;

        // Create the OV embedded viewer (STL import is built-in, no external libs needed)
        this.ovViewer = new OV.EmbeddedViewer(this.containerElement, {
            backgroundColor: new OV.RGBAColor(255, 255, 255, 255),
            defaultColor: new OV.RGBColor(200, 200, 200),
            edgeSettings: new OV.EdgeSettings(false, new OV.RGBColor(0, 0, 0), 1),
            onModelLoaded: () => {
                this._loadInProgress = false;
                console.log('🪙 Coin loaded in viewer');
            },
            onModelLoadFailed: () => {
                this._loadInProgress = false;
                console.warn('⚠️ Coin load failed');
            },
        });
    }

    // Ensure the viewer is in a clean state ready for a new LoadModel call.
    // OV's ThreeModelLoader silently drops LoadModel calls while inProgress,
    // which corrupts the progressDiv state. We only recreate (expensive — new
    // WebGL context) when a load is actually in flight. Otherwise the existing
    // viewer can be reused since LoadModelFromInputFiles clears the scene itself.
    _ensureReadyForLoad() {
        if (this._loadInProgress) {
            this._createViewer();
        }
    }

    // Add a route by generating its STL and loading into OV
    async addRoute(routeData) {
        if (!this.isInitialized || !this.containerElement) {
            console.warn('3D viewer not initialized');
            return false;
        }

        if (!routeData?.points?.length) {
            console.warn(`❌ Cannot add route: ${routeData?.filename || 'unnamed'} - no valid points`);
            return false;
        }

        console.log(`🪙 Generating coin STL for: ${routeData.filename || routeData.id}`);

        try {
            // Generate STL blob using the existing export pipeline
            const stlBlob = await exportToSTL(routeData, DEFAULT_STL_OPTIONS);

            // Recreate viewer only if a previous load is still in flight
            this._ensureReadyForLoad();

            // Wrap blob in a File object for OV
            const file = new File([stlBlob], 'coin.stl', { type: 'application/octet-stream' });
            const dt = new DataTransfer();
            dt.items.add(file);

            // Load model into OV (clears previous model internally)
            this._loadInProgress = true;
            this.ovViewer.LoadModelFromFileList(dt.files);

            this.currentRouteId = routeData.id;
            return true;
        } catch (error) {
            console.error('❌ Failed to load coin into viewer:', error);
            return false;
        }
    }

    // Clear all routes from the viewer
    clearAllRoutes() {
        if (!this.isInitialized || !this.containerElement) {
            console.log('⚠️ 3D viewer not initialized, skipping clearAllRoutes');
            return;
        }

        if (this._loadInProgress) {
            // Must recreate to safely abort the in-flight load
            this._createViewer();
        } else {
            // Safe to clear the scene directly
            try {
                this.ovViewer.GetViewer().Clear();
            } catch (error) {
                console.warn('⚠️ Could not clear viewer:', error);
            }
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
        this._loadInProgress = false;
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
