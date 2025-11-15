// Route Map Visualization using Leaflet.js
import L from 'leaflet';

class RouteMapVisualization {
    constructor(containerId = 'route-map') {
        this.containerId = containerId;
        this.map = null;
        this.routeLayers = [];
        this.markerLayers = [];
        this.currentBounds = null;
        this.colors = [
            '#2563eb', '#dc2626', '#059669', '#d97706', 
            '#7c3aed', '#db2777', '#0891b2', '#65a30d'
        ];
        this.colorIndex = 0;
    }

    // Initialize the map
    initializeMap(containerElement) {
        try {
            // Clear any existing map
            if (this.map) {
                this.map.remove();
            }

            // Create map instance
            this.map = L.map(containerElement, {
                zoomControl: true,
                scrollWheelZoom: true,
                doubleClickZoom: true,
                boxZoom: true,
                keyboard: true,
                dragging: true,
                touchZoom: true
            });

            // Add OpenStreetMap tiles
            L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
                attribution: '© <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
                maxZoom: 18,
                minZoom: 3
            }).addTo(this.map);

            // Set default view (will be updated when routes are added)
            this.map.setView([40.7128, -74.0060], 10); // Default to NYC

            console.log('🗺️ Map initialized successfully');
            return true;
        } catch (error) {
            console.error('❌ Failed to initialize map:', error);
            return false;
        }
    }

    // Add a single route to the map
    addRoute(routeData, options = {}) {
        if (!this.map) {
            console.error('Map not initialized');
            return null;
        }

        if (!routeData.points || routeData.points.length === 0) {
            console.error('No GPS points in route data');
            return null;
        }

        const {
            color = this.getNextColor(),
            weight = 3,
            opacity = 0.7,
            showMarkers = true,
            showElevationPopup = true
        } = options;

        try {
            // Convert GPS points to Leaflet LatLng format
            const latLngs = routeData.points
                .filter(point => point.lat && point.lon) // Filter out invalid points
                .map(point => [point.lat, point.lon]);

            if (latLngs.length === 0) {
                console.error('No valid GPS coordinates found');
                return null;
            }

            // Create polyline for the route
            const routeLine = L.polyline(latLngs, {
                color: color,
                weight: weight,
                opacity: opacity,
                smoothFactor: 1,
                lineCap: 'round',
                lineJoin: 'round'
            });

            // Add click popup with route info
            routeLine.bindPopup(this.createRoutePopup(routeData), {
                maxWidth: 300,
                className: 'route-popup'
            });

            // Add route to map
            routeLine.addTo(this.map);

            // Store layer reference
            const routeLayer = {
                id: routeData.id || `route_${Date.now()}`,
                name: routeData.filename || 'Unnamed Route',
                polyline: routeLine,
                color: color,
                data: routeData,
                markers: []
            };

            // Add start/end markers if requested
            if (showMarkers) {
                this.addRouteMarkers(routeLayer, latLngs);
            }

            this.routeLayers.push(routeLayer);

            // Fit map to show all routes
            this.fitMapToRoutes();

            console.log(`🗺️ Route added to map: ${routeLayer.name}`);
            return routeLayer;

        } catch (error) {
            console.error('❌ Failed to add route to map:', error);
            return null;
        }
    }

    // Add start/end markers for a route
    addRouteMarkers(routeLayer, latLngs) {
        if (latLngs.length === 0) return;

        // Start marker (green)
        const startMarker = L.circleMarker(latLngs[0], {
            color: '#059669',
            fillColor: '#10b981',
            fillOpacity: 0.8,
            radius: 6,
            weight: 2
        });

        startMarker.bindTooltip('Start', {
            permanent: false,
            direction: 'top',
            className: 'route-tooltip'
        });

        startMarker.addTo(this.map);
        routeLayer.markers.push(startMarker);

        // End marker (red) - only if different from start
        if (latLngs.length > 1) {
            const endMarker = L.circleMarker(latLngs[latLngs.length - 1], {
                color: '#dc2626',
                fillColor: '#ef4444',
                fillOpacity: 0.8,
                radius: 6,
                weight: 2
            });

            endMarker.bindTooltip('Finish', {
                permanent: false,
                direction: 'top',
                className: 'route-tooltip'
            });

            endMarker.addTo(this.map);
            routeLayer.markers.push(endMarker);
        }
    }

    // Create popup content for route information
    createRoutePopup(routeData) {
        const duration = routeData.duration ? this.formatDuration(routeData.duration) : 'Unknown';
        const date = routeData.metadata?.time || routeData.uploadTime;
        const formattedDate = date ? new Date(date).toLocaleDateString() : 'Unknown';

        return `
            <div class="route-popup-content">
                <h4>${routeData.filename || 'Unnamed Route'}</h4>
                <div class="route-stats-popup">
                    <div><strong>📏 Distance:</strong> ${routeData.distance?.toFixed(1) || '0'} km</div>
                    <div><strong>⛰️ Elevation Gain:</strong> ${Math.round(routeData.elevationGain || 0)} m</div>
                    <div><strong>⏱️ Duration:</strong> ${duration}</div>
                    <div><strong>📅 Date:</strong> ${formattedDate}</div>
                    <div><strong>📍 Points:</strong> ${routeData.pointCount || 0}</div>
                </div>
                ${routeData.metadata?.description ? `<p><em>${routeData.metadata.description}</em></p>` : ''}
            </div>
        `;
    }

    // Format duration from seconds to human readable
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

    // Get next color for route visualization
    getNextColor() {
        const color = this.colors[this.colorIndex];
        this.colorIndex = (this.colorIndex + 1) % this.colors.length;
        return color;
    }

    // Fit map view to show all routes
    fitMapToRoutes() {
        if (this.routeLayers.length === 0) return;

        try {
            // Collect all route bounds
            const allLatLngs = [];
            this.routeLayers.forEach(layer => {
                if (layer.polyline) {
                    const latLngs = layer.polyline.getLatLngs();
                    allLatLngs.push(...latLngs);
                }
            });

            if (allLatLngs.length > 0) {
                const group = new L.featureGroup(this.routeLayers.map(layer => layer.polyline));
                this.map.fitBounds(group.getBounds(), { padding: [10, 10] });
                this.currentBounds = group.getBounds();
            }
        } catch (error) {
            console.warn('Could not fit map to routes:', error);
        }
    }

    // Remove a specific route from the map
    removeRoute(routeId) {
        const layerIndex = this.routeLayers.findIndex(layer => layer.id === routeId);
        if (layerIndex === -1) return false;

        const layer = this.routeLayers[layerIndex];
        
        // Remove polyline
        if (layer.polyline) {
            this.map.removeLayer(layer.polyline);
        }

        // Remove markers
        layer.markers.forEach(marker => {
            this.map.removeLayer(marker);
        });

        // Remove from array
        this.routeLayers.splice(layerIndex, 1);

        // Refit map if routes remain
        if (this.routeLayers.length > 0) {
            this.fitMapToRoutes();
        }

        console.log(`🗑️ Route removed: ${layer.name}`);
        return true;
    }

    // Clear all routes from the map
    clearAllRoutes() {
        this.routeLayers.forEach(layer => {
            if (layer.polyline) {
                this.map.removeLayer(layer.polyline);
            }
            layer.markers.forEach(marker => {
                this.map.removeLayer(marker);
            });
        });

        this.routeLayers = [];
        this.colorIndex = 0;
        
        // Reset map view
        this.map.setView([40.7128, -74.0060], 10);
        
        console.log('🧹 All routes cleared from map');
    }

    // Get map container dimensions
    getMapSize() {
        if (!this.map) return null;
        const container = this.map.getContainer();
        return {
            width: container.clientWidth,
            height: container.clientHeight
        };
    }

    // Resize map (call after container size changes)
    resize() {
        if (this.map) {
            this.map.invalidateSize();
        }
    }

    // Get current map bounds
    getCurrentBounds() {
        return this.map ? this.map.getBounds() : null;
    }

    // Destroy map instance
    destroy() {
        if (this.map) {
            this.map.remove();
            this.map = null;
        }
        this.routeLayers = [];
        this.markerLayers = [];
    }
}

export default RouteMapVisualization;
