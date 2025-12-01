// 3D Route Visualization using Three.js
import * as THREE from 'three';

class Route3DVisualization {
    constructor(containerId = 'route-3d-viewer') {
        this.containerId = containerId;
        this.scene = null;
        this.camera = null;
        this.renderer = null;
        this.controls = null;
        this.routeMeshes = [];
        this.elevationMeshes = [];
        this.animationId = null;
        this.isInitialized = false;
        
        // Visualization settings
        this.settings = {
            routeWidth: 2,
            showFilledArea: true,
            showClimbingOnly: false,
            cameraDistance: 1000,
            routeColors: [
                0xf7d16f, 0x2563eb, 0xdc2626,
                0x059669, 0xd97706, 0x7c3aed, 
                0xdb2777, 0x0891b2, 0x65a30d
            ],
            colorIndex: 0
        };
        
        this.boundingBox = {
            minX: Infinity, maxX: -Infinity,
            minY: Infinity, maxY: -Infinity,
            minZ: 0, maxZ: -Infinity
        };
    }

    // Initialize the 3D scene
    initialize(containerElement) {
        try {
            console.log('🚀 Starting 3D scene initialization...');
            console.log('📦 Container element:', containerElement);
            console.log('📏 Container dimensions:', containerElement.clientWidth, 'x', containerElement.clientHeight);
            
            // Check if container is actually visible (not display: none)
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
            
            // Clear any existing renderer
            this.cleanup();

            // Create scene
            this.scene = new THREE.Scene();
            this.scene.background = new THREE.Color(0xf8fafc);
            console.log('✅ Scene created');

            // Create camera with better clipping planes and wider field of view
            const aspect = containerElement.clientWidth / containerElement.clientHeight;
            this.camera = new THREE.PerspectiveCamera(60, aspect, 10, 200000); // Increased far plane from 50000 to 200000
            
            // Set preferred initial camera position for optimal viewing
            this.camera.position.set(9066.7, 16001.4, 38808.7);
            this.camera.lookAt(0, 0, 0);
            console.log('✅ Camera created at preferred position:', this.camera.position);

            // Create renderer
            this.renderer = new THREE.WebGLRenderer({ 
                antialias: true,
                alpha: false,  // Changed for opaque background
                preserveDrawingBuffer: true
            });
            this.renderer.setSize(containerElement.clientWidth, containerElement.clientHeight);
            this.renderer.shadowMap.enabled = true;
            this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
            
            // Set background color (sky blue gradient effect)
            this.renderer.setClearColor(0x87ceeb, 1);
            console.log('✅ Renderer configured');
            
            // Clear container and add renderer
            containerElement.innerHTML = '';
            containerElement.appendChild(this.renderer.domElement);
            console.log('✅ Renderer added to DOM');

            // Add lighting
            this.setupLighting();
            console.log('✅ Lighting added');

            // Add basic scene elements (will be updated when routes are added)
            this.setupBasicScene();
            console.log('✅ Basic scene elements added');

            // Initialize orbit controls (we'll add this manually to avoid external dependencies)
            this.setupControls();
            console.log('✅ Controls set up');

            // Start animation loop
            this.animate();
            console.log('✅ Animation loop started');

            this.isInitialized = true;
            console.log('🎮 3D visualization fully initialized!');
            return true;

        } catch (error) {
            console.error('❌ Failed to initialize 3D visualization:', error);
            console.error('Error details:', error.stack);
            return false;
        }
    }

    // Setup lighting for the scene
    setupLighting() {
        // Ambient light for general illumination
        const ambientLight = new THREE.AmbientLight(0x404040, 0.6);
        this.scene.add(ambientLight);

        // Directional light for shadows and definition
        const directionalLight = new THREE.DirectionalLight(0xffffff, 0.8);
        directionalLight.position.set(100, 200, 100);
        directionalLight.castShadow = true;
        directionalLight.shadow.mapSize.width = 2048;
        directionalLight.shadow.mapSize.height = 2048;
        directionalLight.shadow.camera.near = 1;
        directionalLight.shadow.camera.far = 1000;
        directionalLight.shadow.camera.left = -500;
        directionalLight.shadow.camera.right = 500;
        directionalLight.shadow.camera.top = 500;
        directionalLight.shadow.camera.bottom = -500;
        this.scene.add(directionalLight);

        // Add a subtle fill light
        const fillLight = new THREE.DirectionalLight(0x87ceeb, 0.3);
        fillLight.position.set(-100, 50, -100);
        this.scene.add(fillLight);
    }

    // Setup basic scene elements (minimal circle for initial view)
    setupBasicScene() {
        // Guard against calling when not initialized
        if (!this.scene) {
            console.warn('⚠️ Cannot setup basic scene - scene not initialized');
            return;
        }
        
        // Create basic circular ground
        const groundGeometry = new THREE.CircleGeometry(1000, 32);
        const groundMaterial = new THREE.MeshLambertMaterial({ 
            color: 0xf8f9fa,
            transparent: true,
            opacity: 0.5
        });
        
        const groundPlane = new THREE.Mesh(groundGeometry, groundMaterial);
        groundPlane.rotation.x = -Math.PI / 2;
        groundPlane.position.y = -5;
        groundPlane.name = 'basic-ground';
        this.scene.add(groundPlane);

        const axesHelper = new THREE.AxesHelper(200);
        axesHelper.position.y = 0;
        axesHelper.name = 'basic-axes';
        this.scene.add(axesHelper);
    }

    // Setup scene elements (circular background) - called after routes are added
    setupScene() {
        // Calculate circle radius based on current bounding box
        let circleRadius = 200;
        
        if (this.boundingBox.minX !== Infinity) {
            const sizeX = this.boundingBox.maxX - this.boundingBox.minX;
            const sizeZ = this.boundingBox.maxZ - this.boundingBox.minZ;
            const maxRouteSize = Math.max(sizeX, sizeZ);
            // Circle should encompass all routes with some padding
            circleRadius = Math.max(maxRouteSize * 0.90, 200); // 90% of route size for tight fit
        }

        console.log(`🎨 Setting up circular background with radius: ${circleRadius}`);

        // Remove existing background elements
        const existingCircle = this.scene.getObjectByName('circular-ground');
        if (existingCircle) this.scene.remove(existingCircle);
        
        const existingGrid = this.scene.getObjectByName('circular-grid');
        if (existingGrid) this.scene.remove(existingGrid);
        
        // Create circular ground plane
        const groundGeometry = new THREE.CircleGeometry(circleRadius, 64);
        const groundMaterial = new THREE.MeshLambertMaterial({ 
            color: 0xf8f9fa,
            transparent: true,
            opacity: 0.8
        });
        
        const groundPlane = new THREE.Mesh(groundGeometry, groundMaterial);
        groundPlane.rotation.x = -Math.PI / 2; // Lay flat on ground
        groundPlane.position.y = -5; // Slightly below ground level
        groundPlane.name = 'circular-ground';
        groundPlane.receiveShadow = true;
        this.scene.add(groundPlane);
        
        // Create circular grid lines
        this.createCircularGrid(circleRadius);
        
        // Update axes helper (scaled to circle)
        const axesSize = circleRadius * 0.3;
        const existingAxes = this.scene.getObjectByName('axes-helper');
        if (existingAxes) this.scene.remove(existingAxes);
        
        const axesHelper = new THREE.AxesHelper(axesSize);
        axesHelper.position.y = 0;
        axesHelper.name = 'axes-helper';
        this.scene.add(axesHelper);

        // Add subtle edge markers instead of corner cones
        this.createEdgeMarkers(circleRadius);

        console.log(`✅ Circular scene created: radius ${circleRadius}, axes ${axesSize}`);
    }

    // Create circular grid lines
    createCircularGrid(radius) {
        const gridGroup = new THREE.Group();
        gridGroup.name = 'circular-grid';
        
        // Concentric circles
        const numCircles = 8;
        for (let i = 1; i <= numCircles; i++) {
            const circleRadius = (radius * i) / numCircles;
            const circleGeometry = new THREE.RingGeometry(circleRadius - 1, circleRadius + 1, 64);
            const circleMaterial = new THREE.MeshBasicMaterial({ 
                color: 0xcccccc,
                transparent: true,
                opacity: 0.3,
                side: THREE.DoubleSide
            });
            
            const circle = new THREE.Mesh(circleGeometry, circleMaterial);
            circle.rotation.x = -Math.PI / 2;
            circle.position.y = 0;
            gridGroup.add(circle);
        }
        
        // Radial lines
        const numRadials = 16;
        for (let i = 0; i < numRadials; i++) {
            const angle = (i / numRadials) * Math.PI * 2;
            const geometry = new THREE.BufferGeometry().setFromPoints([
                new THREE.Vector3(0, 0, 0),
                new THREE.Vector3(Math.cos(angle) * radius, 0, Math.sin(angle) * radius)
            ]);
            
            const material = new THREE.LineBasicMaterial({ 
                color: 0xcccccc,
                transparent: true,
                opacity: 0.2
            });
            
            const line = new THREE.Line(geometry, material);
            gridGroup.add(line);
        }
        
        this.scene.add(gridGroup);
    }

    // Create edge markers around the circle
    createEdgeMarkers(radius) {
        this.clearEdgeMarkers();
        
        const markerGeometry = new THREE.SphereGeometry(radius * 0.01, 16, 16);
        const markerMaterial = new THREE.MeshLambertMaterial({ 
            color: 0x64748b,
            transparent: true,
            opacity: 0.6
        });
        
        // Place 8 markers around the circle edge
        for (let i = 0; i < 8; i++) {
            const angle = (i / 8) * Math.PI * 2;
            const marker = new THREE.Mesh(markerGeometry, markerMaterial);
            marker.position.set(
                Math.cos(angle) * radius * 0.9, 
                radius * 0.01, 
                Math.sin(angle) * radius * 0.9
            );
            marker.name = `edge-marker-${i}`;
            this.scene.add(marker);
        }
    }

    // Clear edge markers
    clearEdgeMarkers() {
        for (let i = 0; i < 8; i++) {
            const marker = this.scene.getObjectByName(`edge-marker-${i}`);
            if (marker) this.scene.remove(marker);
        }
    }

    // Setup basic mouse controls
    setupControls() {
        let isMouseDown = false;
        let isTouchActive = false;
        let mouseX = 0;
        let mouseY = 0;
        let touchDistance = 0;
        
        // Initialize rotation to match preferred camera position (9066.7, 16001.4, 38808.7)
        const preferredPos = { x: 9066.7, y: 16001.4, z: 38808.7 };
        const preferredDistance = Math.sqrt(preferredPos.x * preferredPos.x + preferredPos.y * preferredPos.y + preferredPos.z * preferredPos.z);
        
        // Calculate spherical coordinates from preferred position
        let targetRotationX = Math.asin(preferredPos.y / preferredDistance);
        let targetRotationY = Math.atan2(preferredPos.x, preferredPos.z);
        let currentRotationX = targetRotationX;
        let currentRotationY = targetRotationY;

        console.log(`🎮 Controls initialized with rotations: X=${(targetRotationX * 180 / Math.PI).toFixed(1)}°, Y=${(targetRotationY * 180 / Math.PI).toFixed(1)}°`);

        const canvas = this.renderer.domElement;
        canvas.style.touchAction = 'none';

        canvas.addEventListener('mousedown', (event) => {
            isMouseDown = true;
            mouseX = event.clientX;
            mouseY = event.clientY;
            canvas.style.cursor = 'grabbing';
        });

        canvas.addEventListener('mouseup', () => {
            isMouseDown = false;
            canvas.style.cursor = 'grab';
        });

        canvas.addEventListener('mousemove', (event) => {
            if (!isMouseDown) return;

            const deltaX = event.clientX - mouseX;
            const deltaY = event.clientY - mouseY;

            targetRotationY += deltaX * 0.01;
            targetRotationX += deltaY * 0.01;

            // Constrain vertical rotation
            targetRotationX = Math.max(-Math.PI / 2, Math.min(Math.PI / 2, targetRotationX));

            mouseX = event.clientX;
            mouseY = event.clientY;
        });

        canvas.addEventListener('wheel', (event) => {
            event.preventDefault();
            const scaleFactor = 1.1;
            if (event.deltaY > 0) {
                this.camera.position.multiplyScalar(scaleFactor);
            } else {
                this.camera.position.multiplyScalar(1 / scaleFactor);
            }
        }, { passive: false });

        canvas.addEventListener('touchstart', (event) => {
            if (event.touches.length === 1) {
                isTouchActive = true;
                mouseX = event.touches[0].clientX;
                mouseY = event.touches[0].clientY;
            } else if (event.touches.length === 2) {
                isTouchActive = false;
                touchDistance = this._getTouchDistance(event);
            }
        }, { passive: false });

        canvas.addEventListener('touchmove', (event) => {
            event.preventDefault();
            if (event.touches.length === 1 && isTouchActive) {
                const deltaX = event.touches[0].clientX - mouseX;
                const deltaY = event.touches[0].clientY - mouseY;

                targetRotationY += deltaX * 0.01;
                targetRotationX += deltaY * 0.01;

                targetRotationX = Math.max(-Math.PI / 2, Math.min(Math.PI / 2, targetRotationX));

                mouseX = event.touches[0].clientX;
                mouseY = event.touches[0].clientY;
            } else if (event.touches.length === 2) {
                const currentDistance = this._getTouchDistance(event);
                if (touchDistance) {
                    const scaleFactor = 1 + (touchDistance - currentDistance) / 200;
                    this.camera.position.multiplyScalar(scaleFactor);
                }
                touchDistance = currentDistance;
            }
        }, { passive: false });

        canvas.addEventListener('touchend', () => {
            if (isTouchActive) {
                isTouchActive = false;
            }
            touchDistance = 0;
        });

        canvas.addEventListener('touchcancel', () => {
            isTouchActive = false;
            touchDistance = 0;
        });

        canvas.style.cursor = 'grab';

        // Update camera rotation in animation loop
        this.updateCameraRotation = () => {
            currentRotationX += (targetRotationX - currentRotationX) * 0.05;
            currentRotationY += (targetRotationY - currentRotationY) * 0.05;

            const distance = this.camera.position.length();
            this.camera.position.x = distance * Math.sin(currentRotationY) * Math.cos(currentRotationX);
            this.camera.position.y = distance * Math.sin(currentRotationX);
            this.camera.position.z = distance * Math.cos(currentRotationY) * Math.cos(currentRotationX);
            this.camera.lookAt(0, 0, 0);
            
            // Debug: Log camera position when it changes significantly
            const currentPos = this.camera.position;
            if (!this.lastLoggedPos || 
                Math.abs(currentPos.x - this.lastLoggedPos.x) > 50 ||
                Math.abs(currentPos.y - this.lastLoggedPos.y) > 50 ||
                Math.abs(currentPos.z - this.lastLoggedPos.z) > 50) {
                
                // console.log(`📷 Camera Position: x=${currentPos.x.toFixed(1)}, y=${currentPos.y.toFixed(1)}, z=${currentPos.z.toFixed(1)}, distance=${distance.toFixed(1)}`);
                this.lastLoggedPos = { ...currentPos };
            }
        };
    }

    // Helper to determine pinch distance between two touch points
    _getTouchDistance(event) {
        if (event.touches.length < 2) {
            return 0;
        }
        const [touch1, touch2] = event.touches;
        const deltaX = touch1.clientX - touch2.clientX;
        const deltaY = touch1.clientY - touch2.clientY;
        return Math.hypot(deltaX, deltaY);
    }

        // Add a route to the 3D visualization
    addRoute(routeData) {
        if (!this.isInitialized) {
            console.warn('3D viewer not initialized');
            return false;
        }

        console.log(`🎯 3D Viewer addRoute called`);
        console.log(`📂 Route name: ${routeData.filename || routeData.name || 'unnamed'}`);
        console.log(`📊 Route data structure:`, Object.keys(routeData));
        console.log(`📌 Points array:`, routeData.points ? `${routeData.points.length} points` : 'NO POINTS');
        
        if (!routeData || !routeData.points || routeData.points.length === 0) {
            console.warn(`❌ Cannot add route: ${routeData.filename || routeData.name || 'unnamed'} - no valid points`);
            return false;
        }
        
        if (routeData.points && routeData.points.length > 0) {
            console.log(`🧭 First point:`, routeData.points[0]);
            console.log(`🧭 Last point:`, routeData.points[routeData.points.length - 1]);
            
            // Check if points have the right structure
            const samplePoint = routeData.points[0];
            const hasValidStructure = samplePoint && 
                (typeof samplePoint.lat === 'number') && 
                (typeof samplePoint.lon === 'number');
                
            if (!hasValidStructure) {
                console.warn(`❌ Invalid point structure in route ${routeData.filename}:`, samplePoint);
                return false;
            }
        }

        console.log('🎮 Adding route to 3D viewer:', routeData.filename, `${routeData.points.length} points`);

        const points3D = this.convertRoutePointsTo3D(routeData);
        
        if (points3D.length === 0) {
            console.warn(`❌ No valid 3D points generated for route: ${routeData.filename}`);
            return false;
        }
        
        this.updateBoundingBox(points3D);

        // Get color for this route
        const routeColor = this.getNextColor();

        // Create route line
        const routeLine = this.createRouteLine(points3D, routeColor);
        this.scene.add(routeLine);
        
        // Create filled area if enabled
        let filledArea = null;
        if (this.settings.showFilledArea) {
            filledArea = this.createFilledArea(points3D, routeColor);
            if (filledArea) {
                this.scene.add(filledArea);
            }
        }

        // Store mesh references
        const meshData = {
            id: routeData.id,
            filename: routeData.filename,
            routeLine: routeLine,
            filledArea: filledArea,
            points3D: points3D,
            routeData: routeData
        };

        this.routeMeshes.push(meshData);
        
        // For new route additions while other routes exist, we need to update the scene
        // but we should do it efficiently to avoid visual conflicts
        this.updateSceneForNewRoute();
        
        // Position camera to show all routes
        this.positionCameraToFitRoutes();

        console.log(`✅ Route added to 3D scene. Bounding box:`, this.boundingBox);
        console.log(`📍 Camera position:`, this.camera.position);

        return true;
    }

    // Update scene background efficiently when adding new routes
    updateSceneForNewRoute() {
        this.updateSceneBackground();
    }

    // Update scene background based on current routes (for both adding and removing routes)
    updateSceneBackground() {
        // Calculate new circle radius based on current bounding box
        this.recalculateBoundingBox();
        
        let newCircleRadius = 5000; // Default large radius
        
        if (this.boundingBox.minX !== Infinity && this.routeMeshes.length > 0) {
            const sizeX = this.boundingBox.maxX - this.boundingBox.minX;
            const sizeZ = this.boundingBox.maxZ - this.boundingBox.minZ;
            const maxRouteSize = Math.max(sizeX, sizeZ);
            newCircleRadius = Math.max(maxRouteSize * 0.7, 2000);
        }
        
        // Check if existing background elements exist and their current size
        const existingCircle = this.scene.getObjectByName('circular-ground');
        
        if (!existingCircle) {
            // No existing background, create fresh scene
            this.setupScene();
            return;
        }
        
        // Check if the current background size is significantly different
        const currentRadius = existingCircle.geometry.parameters.radius;
        const radiusDifference = Math.abs(newCircleRadius - currentRadius) / currentRadius;
        
        if (radiusDifference > 0.2) {
            // Background size differs significantly (>20%), rebuild scene
            console.log(`📐 Updating scene background from ${currentRadius.toFixed(0)} to ${newCircleRadius.toFixed(0)} units`);
            this.setupScene();
        } else {
            // Current background is adequate, no need to rebuild
            console.log(`📐 Current scene background (${currentRadius.toFixed(0)} units) is adequate`);
        }
    }

    // Position camera to show all routes in view
    positionCameraToFitRoutes() {
        console.log('🎯 positionCameraToFitRoutes called, boundingBox.minX:', this.boundingBox.minX);
        
        const preferredPosition = {
            x: 20305.4,
            y: 35836.1,
            z: 42946.1,
        }

        if (this.boundingBox.minX === Infinity) {
            // No routes yet, use the preferred initial viewing position
            //
            this.camera.position.set(preferredPosition.x, preferredPosition.y, preferredPosition.z);
            this.camera.lookAt(0, 0, 0);
            console.log(`📷 Set to preferred position (no routes): x=${this.camera.position.x}, y=${this.camera.position.y}, z=${this.camera.position.z}`);
            return;
        }

        console.log('📊 Routes detected, calculating optimal position...');

        // Since routes are now centered at origin, calculate size from bounding box
        const sizeX = this.boundingBox.maxX - this.boundingBox.minX;
        const sizeZ = this.boundingBox.maxZ - this.boundingBox.minZ;
        const sizeY = this.boundingBox.maxY - this.boundingBox.minY;

        const maxSize = Math.max(sizeX, sizeZ, 1); // Minimum size for small routes
        
        // Use the preferred viewing angle proportions but scale based on route size
        const actualDistance = Math.min(maxSize * 1.2, preferredPosition.z * 2.5); // Cap maximum distance

        // Maintain the same proportional viewing angle as the preferred position
        const distanceRatio = actualDistance / preferredPosition.z;
        const cameraX = preferredPosition.x * distanceRatio;
        const cameraY = preferredPosition.y * distanceRatio;
        const cameraZ = preferredPosition.z * distanceRatio;

        // Position camera (routes are centered at origin)
        this.camera.position.set(cameraX, cameraY, cameraZ);
        
        // Look at center of routes (origin)
        this.camera.lookAt(0, 0, 0);

        console.log(`📷 Camera positioned at: x=${this.camera.position.x.toFixed(1)}, y=${this.camera.position.y.toFixed(1)}, z=${this.camera.position.z.toFixed(1)}`);
        console.log(`📦 Route bounds: ${sizeX.toFixed(0)} x ${sizeY.toFixed(0)} x ${sizeZ.toFixed(0)} units (centered at origin)`);
        console.log(`🎯 Scaled distance: ${actualDistance.toFixed(0)} (ratio: ${distanceRatio.toFixed(2)})`);
    }

    // Convert GPS points to 3D coordinates
    convertRoutePointsTo3D(routeData) {
        if (!routeData?.points?.length) {
            console.warn('⚠️ No points provided to convertRoutePointsTo3D');
            return [];
        }

        console.log(`🔄 Converting ${routeData.points.length} GPS points to 3D coordinates...`);
        
        // Validate that points have required properties
        const validPoints = routeData.points.filter(p =>
            Number.isFinite(p?.lat) && Number.isFinite(p?.lon)
        );

        if (validPoints.length === 0) {
            console.warn('⚠️ No valid GPS points found!');
            return [];
        }
        
        if (validPoints.length !== routeData.points.length) {
            console.warn(`⚠️ Filtered ${routeData.points.length - validPoints.length} invalid points`);
        }

        // Find the anchor point for coordinate system
        const { anchorLat, anchorLon, anchorElevation } = this._selectAnchorPoint(routeData);
        console.log(`📏 GPS anchor: ${anchorLat.toFixed(6)}, ${anchorLon.toFixed(6)}, ${anchorElevation}m`);

        const METERS_PER_DEG_LAT = 110540;
        const METERS_PER_DEG_LON = 111320;
        const MIN_HEIGHT = 50; // Minimum height above ground in 3D units
        const { latRange, lonRange, elevationRange } = this._getRouteBounds(validPoints);

        const widthMeters = lonRange * METERS_PER_DEG_LON * Math.cos(anchorLat * Math.PI / 180);
        const depthMeters = latRange * METERS_PER_DEG_LAT;
        const diagonal = Math.hypot(widthMeters, depthMeters);
        const targetHeight = (diagonal / 3);
        const scaleFactor = (elevationRange > 0) ? targetHeight / elevationRange : 1;

        // Convert to local coordinate system (meters from center)
        const points3D = validPoints.map((point) => {
            // Convert lat/lon to approximate meters (rough conversion)
            const x = (point.lon - anchorLon) * METERS_PER_DEG_LON * Math.cos(anchorLat * Math.PI / 180);
            const z = (anchorLat - point.lat) * METERS_PER_DEG_LAT; // Flip Z for typical coordinate system
            // Minimum 50 units above ground
            const y = Math.max(((point.elevation ?? 0) - anchorElevation), 0) * scaleFactor + MIN_HEIGHT; 

            return new THREE.Vector3(x, y, z);
        }).filter(point => !isNaN(point.x) && !isNaN(point.y) && !isNaN(point.z));

        const minY = points3D.length ? Math.min(...points3D.map(p => p.y)) : 0;
        const maxY = points3D.length ? Math.max(...points3D.map(p => p.y)) : 0;
        console.log(`🎯 Route converted: ${validPoints.length} → ${points3D.length} points, width: ${widthMeters.toFixed(1)}, depth: ${depthMeters.toFixed(1)}, diagonal: ${diagonal.toFixed(1)}, target max height: ${targetHeight.toFixed(1)}, Y range: ${minY.toFixed(0)} to ${maxY.toFixed(0)}`);
        
        return points3D;
    }

    // Utility: Get points bounds (min/max lat/lon/elevation or x/z/y)
    _getRouteBounds(points) {
        if (!points?.length) {
            return null;
        }

        const lats = points.map(p => p.lat ?? p.x);
        const lons = points.map(p => p.lon ?? p.z);
        const elevations = points.map(p => p.elevation ?? p.y ?? 0);

        const minLat =  Math.min(...lats);
        const maxLat =  Math.max(...lats);
        const minLon =  Math.min(...lons);
        const maxLon =  Math.max(...lons);
        const minElevation =  Math.min(...elevations);
        const maxElevation =  Math.max(...elevations);
        const latRange =  maxLat - minLat;
        const lonRange =  maxLon - minLon;
        const elevationRange =  maxElevation - minElevation;
        const centerLat = (minLat + maxLat) / 2;
        const centerLon = (minLon + maxLon) / 2;
        const centerElevation = (minElevation + maxElevation) / 2;

        return {
            minLat,
            maxLat,
            minLon,
            maxLon,
            minElevation,
            maxElevation,
            latRange,
            lonRange,
            elevationRange,
            centerLat,
            centerLon,
            centerElevation,
        };
    }

    _selectAnchorPoint(route) {
        if (!route.points?.length) {
            return null;
        }

        const { targetLatOffset = 0, targetLonOffset = 0, type = 'center' } = route?.metadata?.visualization?.anchor ?? {};

        // Get route bounds using utility function
        const bounds = this._getRouteBounds(route.points);
        
        // Default to the center of the route
        // Calculate true geometric center (midpoint of bounding box)
        const currentCenterLat = (bounds.minLat + bounds.maxLat) / 2;
        const currentCenterLon = (bounds.minLon + bounds.maxLon) / 2;
        const currentMinElevation = bounds.minElevation;

        const startPoint = route.points.at(0);
        const relativeStartElevation = (startPoint.elevation ?? 0) - currentMinElevation;

        switch (type) {
            case 'start': {
                // We want the start to be anchored at the center of the circle
                // So our relativeStartLat/Lon are 0 and relativeStartElevation is to adjust to the min
                console.log(`📌 Using 'start' anchor at (${startPoint.lat.toFixed(6)}, ${startPoint.lon.toFixed(6)})`);
                return { 
                    relativeStartLat: targetLatOffset,
                    relativeStartLon: targetLonOffset,
                    relativeStartElevation,
                    anchorLat: startPoint.lat + targetLatOffset,
                    anchorLon: startPoint.lon + targetLonOffset,
                    anchorElevation: bounds.minElevation,
                };
            }
            case 'end': {
                // We want the end to be anchored at the center of the circle
                // So our relativeStartLat/Lon need to be shifted based on the difference between start and end
                const endPoint = route.points.at(-1);
                const relativeStartLat = (startPoint.lat - endPoint.lat) + targetLatOffset;
                const relativeStartLon = (startPoint.lon - endPoint.lon) + targetLonOffset;
                console.log(`📌 Using 'end' anchor at (${endPoint.lat.toFixed(6)}, ${endPoint.lon.toFixed(6)}). Shifted by (${relativeStartLat.toFixed(6)}, ${relativeStartLon.toFixed(6)}, ${relativeStartElevation.toFixed(6)})`);
                return {
                    relativeStartLat,
                    relativeStartLon,
                    relativeStartElevation,
                    anchorLat: endPoint.lat + targetLatOffset,
                    anchorLon: endPoint.lon + targetLonOffset,
                    anchorElevation: bounds.minElevation,
                };
            }
            case 'center': {
                // Default to the center of the route
                const relativeStartLat = (startPoint.lat - currentCenterLat) + targetLatOffset;
                const relativeStartLon = (startPoint.lon - currentCenterLon) + targetLonOffset;
                console.log(`📌 Using 'center' anchor at (${currentCenterLat.toFixed(6)}, ${currentCenterLon.toFixed(6)}). Shifted by (${relativeStartLat.toFixed(6)}, ${relativeStartLon.toFixed(6)}, ${relativeStartElevation.toFixed(6)})`);
                return {
                    relativeStartLat,
                    relativeStartLon,
                    relativeStartElevation,
                    anchorLat: currentCenterLat + targetLatOffset,
                    anchorLon: currentCenterLon + targetLonOffset,
                    anchorElevation: bounds.minElevation,
                };
            }
            default:
                console.warn(`⚠️ Unknown anchor type: ${type}`);
                // Default to the center of the route
                const relativeStartLat = (startPoint.lat - currentCenterLat) + targetLatOffset;
                const relativeStartLon = (startPoint.lon - currentCenterLon) + targetLonOffset;
                console.log(`📌 Using default 'center' anchor at (${currentCenterLat.toFixed(6)}, ${currentCenterLon.toFixed(6)}). Shifted by (${relativeStartLat.toFixed(6)}, ${relativeStartLon.toFixed(6)}, ${relativeStartElevation.toFixed(6)})`);
                return {
                    relativeStartLat,
                    relativeStartLon,
                    relativeStartElevation,
                    anchorLat: currentCenterLat + targetLatOffset,
                    anchorLon: currentCenterLon + targetLonOffset,
                    anchorElevation: bounds.minElevation,
                };
        }
    }

    // Create route line geometry
    createRouteLine(points3D, color) {
        const geometry = new THREE.BufferGeometry().setFromPoints(points3D);
        
        // Use a thicker line material for better visibility
        const material = new THREE.LineBasicMaterial({ 
            color: color,
            linewidth: 5  // Increased from default
        });
        
        const line = new THREE.Line(geometry, material);
        console.log(`🔗 Created route line with ${points3D.length} points, color: ${color.toString(16)}`);
        
        return line;
    }

    // Create filled area under the route
    createFilledArea(points3D, color) {
        if (points3D.length < 2) return null;

        try {
            // Create vertices for filled area (route points + ground level points)
            const vertices = [];
            const indices = [];

            // Add route points
            points3D.forEach(point => {
                vertices.push(point.x, point.y, point.z);
            });

            // Add ground level points
            points3D.forEach(point => {
                vertices.push(point.x, 0, point.z);
            });

            // Create triangular faces
            for (let i = 0; i < points3D.length - 1; i++) {
                const topLeft = i;
                const topRight = i + 1;
                const bottomLeft = i + points3D.length;
                const bottomRight = i + 1 + points3D.length;

                // Two triangles per quad
                indices.push(topLeft, bottomLeft, topRight);
                indices.push(topRight, bottomLeft, bottomRight);
            }

            const geometry = new THREE.BufferGeometry();
            geometry.setAttribute('position', new THREE.Float32BufferAttribute(vertices, 3));
            geometry.setIndex(indices);
            geometry.computeVertexNormals();

            const material = new THREE.MeshLambertMaterial({
                color: color,
                transparent: true,
                opacity: 0.3,
                side: THREE.DoubleSide
            });

            const mesh = new THREE.Mesh(geometry, material);
            mesh.castShadow = true;
            mesh.receiveShadow = true;

            return mesh;

        } catch (error) {
            console.warn('Failed to create filled area:', error);
            return null;
        }
    }

    // Update bounding box with new points
    updateBoundingBox(points3D) {
        points3D.forEach(point => {
            this.boundingBox.minX = Math.min(this.boundingBox.minX, point.x);
            this.boundingBox.maxX = Math.max(this.boundingBox.maxX, point.x);
            this.boundingBox.minY = Math.min(this.boundingBox.minY, point.y);
            this.boundingBox.maxY = Math.max(this.boundingBox.maxY, point.y);
            this.boundingBox.minZ = Math.min(this.boundingBox.minZ, point.z);
            this.boundingBox.maxZ = Math.max(this.boundingBox.maxZ, point.z);
        });
    }

    // Center camera on all routes
    centerCamera() {
        if (this.routeMeshes.length === 0) return;

        const centerX = (this.boundingBox.minX + this.boundingBox.maxX) / 2;
        const centerY = (this.boundingBox.minY + this.boundingBox.maxY) / 2;
        const centerZ = (this.boundingBox.minZ + this.boundingBox.maxZ) / 2;

        const sizeX = this.boundingBox.maxX - this.boundingBox.minX;
        const sizeZ = this.boundingBox.maxZ - this.boundingBox.minZ;
        const sizeY = this.boundingBox.maxY - this.boundingBox.minY;

        const maxSize = Math.max(sizeX, sizeZ, sizeY);
        const distance = maxSize * 2;

        this.camera.position.set(
            centerX + distance * 0.5,
            centerY + distance * 0.8,
            centerZ + distance * 0.5
        );
        this.camera.lookAt(centerX, centerY, centerZ);
    }

    // Get next color for routes
    getNextColor() {
        const color = this.settings.routeColors[this.settings.colorIndex];
        this.settings.colorIndex = (this.settings.colorIndex + 1) % this.settings.routeColors.length;
        return color;
    }

    // Remove route from 3D visualization
    removeRoute(routeId) {
        const meshIndex = this.routeMeshes.findIndex(mesh => mesh.id === routeId);
        if (meshIndex === -1) return false;

        const mesh = this.routeMeshes[meshIndex];
        
        // Remove from scene
        if (mesh.routeLine) this.scene.remove(mesh.routeLine);
        if (mesh.filledArea) this.scene.remove(mesh.filledArea);

        // Remove from array
        this.routeMeshes.splice(meshIndex, 1);

        // Update scene background to potentially shrink the circle
        this.updateSceneBackground();
        
        // Position camera to show remaining routes
        this.positionCameraToFitRoutes();

        console.log(`🗑️ Removed route from 3D scene: ${routeId}`);
        return true;
    }

    // Recalculate bounding box after route removal
    recalculateBoundingBox() {
        this.boundingBox = {
            minX: Infinity, maxX: -Infinity,
            minY: Infinity, maxY: -Infinity,
            minZ: 0, maxZ: -Infinity
        };

        this.routeMeshes.forEach(mesh => {
            if (mesh.points3D) {
                this.updateBoundingBox(mesh.points3D);
            }
        });
    }

    // Clear all routes
    clearAllRoutes() {
        // Guard against calling clearAllRoutes when not initialized
        if (!this.isInitialized || !this.scene) {
            console.log('⚠️ 3D viewer not initialized, skipping clearAllRoutes');
            return;
        }
        
        this.routeMeshes.forEach(mesh => {
            if (mesh.routeLine) this.scene.remove(mesh.routeLine);
            if (mesh.filledArea) this.scene.remove(mesh.filledArea);
        });

        this.routeMeshes = [];
        this.settings.colorIndex = 0;
        this.recalculateBoundingBox();
        
        // Reset to basic scene
        this.setupBasicScene();
        
        // Return to preferred overview position
        this.camera.position.set(9066.7, 16001.4, 38808.7);
        this.camera.lookAt(0, 0, 0);
    }

    // Toggle filled area display
    toggleFilledArea(show) {
        this.settings.showFilledArea = show;
        this.routeMeshes.forEach(mesh => {
            if (mesh.filledArea) {
                mesh.filledArea.visible = show;
            }
        });
    }

    // Toggle climbing-only mode (filter out descents)
    toggleClimbingOnly(enabled) {
        this.settings.climbingOnly = enabled;
        // For now, just store the setting - would need route regeneration for full implementation
        console.log(`🏔️ Climbing-only mode: ${enabled ? 'enabled' : 'disabled'}`);
    }

    // Animation loop
    animate() {
        this.animationId = requestAnimationFrame(this.animate.bind(this));
        
        // Update camera rotation if controls are active
        if (this.updateCameraRotation) {
            this.updateCameraRotation();
        }

        this.renderer.render(this.scene, this.camera);
    }

    // Handle window resize
    resize(width, height) {
        if (!this.renderer || !this.camera) return;

        this.camera.aspect = width / height;
        this.camera.updateProjectionMatrix();
        this.renderer.setSize(width, height);
    }

    // Cleanup resources
    cleanup() {
        if (this.animationId) {
            cancelAnimationFrame(this.animationId);
            this.animationId = null;
        }

        if (this.renderer) {
            this.renderer.dispose();
            this.renderer = null;
        }

        if (this.scene) {
            // Dispose geometries and materials
            this.scene.traverse((object) => {
                if (object.geometry) object.geometry.dispose();
                if (object.material) {
                    if (object.material.length) {
                        object.material.forEach(material => material.dispose());
                    } else {
                        object.material.dispose();
                    }
                }
            });
        }

        this.scene = null;
        this.camera = null;
        this.routeMeshes = [];
        this.isInitialized = false;
    }

    // Camera Control Methods
    zoomIn() {
        if (!this.camera) return;
        const currentDistance = this.camera.position.length();
        const zoomFactor = 0.8;
        
        this.camera.position.multiplyScalar(zoomFactor);
        console.log('🔍+ Zoomed in, distance:', this.camera.position.length());
    }

    zoomOut() {
        if (!this.camera) return;
        const currentDistance = this.camera.position.length();
        const zoomFactor = 1.25;
        
        this.camera.position.multiplyScalar(zoomFactor);
        console.log('🔍- Zoomed out, distance:', this.camera.position.length());
    }

    fitToView() {
        console.log('📐 Fitting to view...');
        this.positionCameraToFitRoutes();
    }

    resetView() {
        if (!this.camera) return;
        
        // Reset to preferred overview position
        this.camera.position.set(9066.7, 16001.4, 38808.7);
        this.camera.lookAt(0, 0, 0);
        console.log('🏠 Reset to preferred viewing angle');
    }
}

export default Route3DVisualization;
