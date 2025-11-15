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
            elevationExaggeration: 3, // Multiply elevation by this factor
            routeWidth: 2,
            showFilledArea: true,
            showClimbingOnly: false,
            cameraDistance: 1000,
            routeColors: [
                0x2563eb, 0xdc2626, 0x059669, 0xd97706, 
                0x7c3aed, 0xdb2777, 0x0891b2, 0x65a30d
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

            // Create camera with better clipping planes
            const aspect = containerElement.clientWidth / containerElement.clientHeight;
            this.camera = new THREE.PerspectiveCamera(75, aspect, 10, 50000); // Increased far plane
            this.camera.position.set(0, 500, 800);
            this.camera.lookAt(0, 0, 0);
            console.log('✅ Camera created at:', this.camera.position);

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

    // Setup basic scene elements (minimal grid for initial view)
    setupBasicScene() {
        const gridHelper = new THREE.GridHelper(2000, 20, 0x444444, 0x888888);
        gridHelper.position.y = 0;
        gridHelper.name = 'basic-grid';
        this.scene.add(gridHelper);

        const axesHelper = new THREE.AxesHelper(200);
        axesHelper.position.y = 0;
        axesHelper.name = 'basic-axes';
        this.scene.add(axesHelper);
    }

    // Setup scene elements (grid, axes) - called after routes are added
    setupScene() {
        // Calculate grid size based on current bounding box
        let gridSize = 10000; // Default large size
        
        if (this.boundingBox.minX !== Infinity) {
            const sizeX = this.boundingBox.maxX - this.boundingBox.minX;
            const sizeZ = this.boundingBox.maxZ - this.boundingBox.minZ;
            const maxRouteSize = Math.max(sizeX, sizeZ);
            gridSize = Math.max(maxRouteSize * 3, 10000); // At least 3x route size
        }
        
        console.log(`🏗️ Setting up scene with grid size: ${gridSize}`);
        
        // Remove existing grid if any
        const existingGrid = this.scene.getObjectByName('ground-grid');
        if (existingGrid) this.scene.remove(existingGrid);
        
        // Add a dynamically sized grid at ground level
        const gridDivisions = Math.min(Math.max(Math.floor(gridSize / 200), 20), 100);
        const gridHelper = new THREE.GridHelper(gridSize, gridDivisions, 0x444444, 0x888888);
        gridHelper.position.y = 0;
        gridHelper.name = 'ground-grid';
        this.scene.add(gridHelper);

        // Add axes helper (scaled to grid)
        const axesSize = gridSize * 0.1;
        const existingAxes = this.scene.getObjectByName('axes-helper');
        if (existingAxes) this.scene.remove(existingAxes);
        
        const axesHelper = new THREE.AxesHelper(axesSize);
        axesHelper.position.y = 0;
        axesHelper.name = 'axes-helper';
        this.scene.add(axesHelper);

        // Add reference markers scaled to grid size
        this.clearReferenceMarkers();
        const markerGeometry = new THREE.ConeGeometry(gridSize * 0.02, gridSize * 0.08, 8);
        const markerMaterial = new THREE.MeshLambertMaterial({ color: 0xff6b6b });
        
        for (let i = 0; i < 4; i++) {
            const marker = new THREE.Mesh(markerGeometry, markerMaterial);
            const angle = (i / 4) * Math.PI * 2;
            const distance = gridSize * 0.3;
            marker.position.set(Math.cos(angle) * distance, gridSize * 0.02, Math.sin(angle) * distance);
            marker.name = `reference-marker-${i}`;
            this.scene.add(marker);
        }

        console.log(`✅ Scene elements added: ${gridSize}x${gridSize} grid, ${axesSize} axes, and markers`);
    }

    // Clear reference markers
    clearReferenceMarkers() {
        for (let i = 0; i < 4; i++) {
            const marker = this.scene.getObjectByName(`reference-marker-${i}`);
            if (marker) this.scene.remove(marker);
        }
    }

    // Setup basic mouse controls
    setupControls() {
        let isMouseDown = false;
        let mouseX = 0;
        let mouseY = 0;
        let targetRotationX = 0;
        let targetRotationY = 0;
        let currentRotationX = 0;
        let currentRotationY = 0;

        const canvas = this.renderer.domElement;

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

            // Clamp vertical rotation
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
        };
    }

        // Add a route to the 3D visualization
    addRoute(routeData) {
        if (!this.isInitialized) {
            console.warn('3D viewer not initialized');
            return false;
        }

        console.log('🎮 Adding route to 3D viewer:', routeData.filename, `${routeData.points.length} points`);

        const points3D = this.convertRoutePointsTo3D(routeData.points, this.settings.elevationExaggeration);
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
        
        // Update scene elements to match new bounds
        this.setupScene();
        
        // Position camera to show all routes
        this.positionCameraToFitRoutes();

        console.log(`✅ Route added to 3D scene. Bounding box:`, this.boundingBox);
        console.log(`📍 Camera position:`, this.camera.position);

        return true;
    }

    // Position camera to show all routes in view
    positionCameraToFitRoutes() {
        if (this.boundingBox.minX === Infinity) {
            // No routes yet, use default position
            this.camera.position.set(0, 1000, 2000);
            this.camera.lookAt(0, 0, 0);
            return;
        }

        const centerX = (this.boundingBox.minX + this.boundingBox.maxX) / 2;
        const centerY = (this.boundingBox.minY + this.boundingBox.maxY) / 2;
        const centerZ = (this.boundingBox.minZ + this.boundingBox.maxZ) / 2;

        const sizeX = this.boundingBox.maxX - this.boundingBox.minX;
        const sizeZ = this.boundingBox.maxZ - this.boundingBox.minZ;
        const sizeY = this.boundingBox.maxY - this.boundingBox.minY;

        const maxSize = Math.max(sizeX, sizeZ);
        const distance = Math.max(maxSize * 2, 1000); // Scale camera distance to route size

        // Position camera above and to the side of the route
        this.camera.position.set(
            centerX + distance * 0.8,
            Math.max(centerY + distance * 0.6, maxSize * 0.5), // Scale height to route size
            centerZ + distance * 0.8
        );
        
        // Look at the center of the routes
        this.camera.lookAt(centerX, centerY, centerZ);

        console.log(`📷 Camera positioned at:`, this.camera.position, `looking at:`, {x: centerX, y: centerY, z: centerZ});
        console.log(`📦 Route bounds: ${sizeX.toFixed(0)} x ${sizeY.toFixed(0)} x ${sizeZ.toFixed(0)} units`);
        console.log(`📏 Max route size: ${maxSize.toFixed(0)}, Camera distance: ${distance.toFixed(0)}`);
    }

    // Convert GPS points to 3D coordinates
    convertRoutePointsTo3D(points, elevationExaggeration = 3) {
        if (!points || points.length === 0) return [];

        // Find the center point for coordinate system
        const centerLat = points.reduce((sum, p) => sum + p.lat, 0) / points.length;
        const centerLon = points.reduce((sum, p) => sum + p.lon, 0) / points.length;
        
        // Find elevation range
        const elevations = points.map(p => p.elevation || 0);
        const minElevation = Math.min(...elevations);
        const maxElevation = Math.max(...elevations);
        
        console.log(`📏 Elevation range: ${minElevation}m to ${maxElevation}m`);

        // Convert to local coordinate system (meters from center)
        const points3D = points.map((point, index) => {
            // Convert lat/lon to approximate meters (rough conversion)
            const x = (point.lon - centerLon) * 111320 * Math.cos(centerLat * Math.PI / 180);
            const z = (centerLat - point.lat) * 110540; // Flip Z for typical coordinate system
            
            // Ensure elevation is always above ground with minimum offset
            const rawElevation = point.elevation || 0;
            const normalizedElevation = (rawElevation - minElevation) * elevationExaggeration;
            const y = Math.max(normalizedElevation + 50, 50); // Minimum 50 units above ground

            return new THREE.Vector3(x, y, z);
        }).filter(point => !isNaN(point.x) && !isNaN(point.y) && !isNaN(point.z));
        
        console.log(`🎯 Route converted: ${points3D.length} points, Y range: ${Math.min(...points3D.map(p => p.y))} to ${Math.max(...points3D.map(p => p.y))}`);
        
        return points3D;
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

        // Recalculate bounding box
        this.recalculateBoundingBox();
        this.centerCamera();

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
        this.routeMeshes.forEach(mesh => {
            if (mesh.routeLine) this.scene.remove(mesh.routeLine);
            if (mesh.filledArea) this.scene.remove(mesh.filledArea);
        });

        this.routeMeshes = [];
        this.settings.colorIndex = 0;
        this.recalculateBoundingBox();
        this.camera.position.set(0, 500, 800);
        this.camera.lookAt(0, 0, 0);
    }

    // Toggle elevation exaggeration
    setElevationExaggeration(factor) {
        this.settings.elevationExaggeration = factor;
        // Would need to regenerate all routes - for now just store the setting
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
        
        this.camera.position.set(0, 500, 800);
        this.camera.lookAt(0, 0, 0);
        console.log('🏠 Reset to default view');
    }
}

export default Route3DVisualization;
