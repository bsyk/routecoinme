// Route Manipulation Module for RouteCoinMe
// Provides building block functions for route processing and aggregation

class RouteManipulator {
    constructor() {
        // Standard circle parameters for route coordinates
        this.maxRadius = 0.4; // ~40km radius in degrees
        this.centerLat = 0;
        this.centerLon = 0;
        this.centerElevation = 0;
    }

    // 1. Relocate a route to have a start point at a given 3D coordinate (x,y,z)
    relocateRouteToPosition(route, targetLat, targetLon, targetElevation) {
        if (!route.points || route.points.length === 0) {
            throw new Error('Route must have points to relocate');
        }

        console.log(`📍 Relocating route to position: (${targetLat.toFixed(6)}, ${targetLon.toFixed(6)}, ${targetElevation.toFixed(1)}m)`);
        
        const startPoint = route.points[0];
        const offsetLat = targetLat - startPoint.lat;
        const offsetLon = targetLon - startPoint.lon;
        const offsetElevation = targetElevation - (startPoint.elevation || 0);

        // Clone route and apply offsets
        const relocatedRoute = this._cloneRoute(route);
        
        relocatedRoute.points = route.points.map(point => ({
            ...point,
            lat: point.lat + offsetLat,
            lon: point.lon + offsetLon,
            elevation: (point.elevation || 0) + offsetElevation
        }));

        console.log(`✅ Route relocated from (${startPoint.lat.toFixed(6)}, ${startPoint.lon.toFixed(6)}) to (${targetLat.toFixed(6)}, ${targetLon.toFixed(6)})`);
        
        return relocatedRoute;
    }

    // 2. Relocate a route to normalized coordinates, centered on (0,0) and aligned to 0 on the Y axis
    normalizeRoute(route) {
        if (!route.points || route.points.length === 0) {
            throw new Error('Route must have points to normalize');
        }

        console.log(`🎯 Normalizing route: ${route.filename || 'Unnamed'}`);
        
        // Get route bounds using utility function
        const bounds = this.getRouteBounds(route);
        
        // Calculate true geometric center (midpoint of bounding box)
        const currentCenterLat = (bounds.minLat + bounds.maxLat) / 2;
        const currentCenterLon = (bounds.minLon + bounds.maxLon) / 2;
        const currentCenterElevation = (bounds.minElevation + bounds.maxElevation) / 2;

        console.log(`📊 Current center: (${currentCenterLat.toFixed(6)}, ${currentCenterLon.toFixed(6)}, ${currentCenterElevation.toFixed(1)}m)`);
        
        // Calculate route's start position relative to its center
        const startPoint = route.points[0];
        const relativeStartLat = startPoint.lat - currentCenterLat;
        const relativeStartLon = startPoint.lon - currentCenterLon;
        const relativeStartElevation = (startPoint.elevation || 0) - currentCenterElevation;

        // Target position: start point should be at (0, relativeStartLon, relativeStartElevation)
        // This centers the route on lat=0 while preserving the route's internal structure
        const targetStartLat = this.centerLat;
        const targetStartLon = this.centerLon + relativeStartLon;
        const targetStartElevation = this.centerElevation + relativeStartElevation;

        // Use relocateRouteToPosition to move start point to normalized position
        const normalizedRoute = this.relocateRouteToPosition(route, targetStartLat, targetStartLon, targetStartElevation);
        
        console.log(`✅ Route normalized and centered on (0,0)`);
        
        return normalizedRoute;
    }

    // 3. Resize a route to fit within our circle coordinates (40km radius)
    resizeRouteToFit(route) {
        if (!route.points || route.points.length === 0) {
            throw new Error('Route must have points to resize');
        }

        console.log(`📏 Resizing route to fit within ${this.maxRadius * 111}km radius`);
        
        // Get route bounds using utility function
        const bounds = this.getRouteBounds(route);
        const maxRange = Math.max(bounds.latRange, bounds.lonRange);
        
        console.log(`📐 Current route dimensions: ${bounds.latRange.toFixed(6)} x ${bounds.lonRange.toFixed(6)} degrees`);
        
        // Calculate scale factor to fit within our circle (use 90% of radius for safety margin)
        const usableRadius = this.maxRadius * 0.9;
        const scaleFactor = maxRange > 0 ? (usableRadius * 2) / maxRange : 1;
        
        if (scaleFactor >= 1) {
            console.log(`✅ Route already fits within radius, scaling up to fill`);
        }
        
        console.log(`📏 Applying scale factor: ${scaleFactor.toFixed(4)}`);
        
        // Calculate center point for scaling using bounds
        const centerLat = (bounds.minLat + bounds.maxLat) / 2;
        const centerLon = (bounds.minLon + bounds.maxLon) / 2;
        
        // Clone route and apply scaling
        const resizedRoute = this._cloneRoute(route);
        
        resizedRoute.points = route.points.map(point => ({
            ...point,
            lat: centerLat + (point.lat - centerLat) * scaleFactor,
            lon: centerLon + (point.lon - centerLon) * scaleFactor,
            elevation: point.elevation // Don't scale elevation
        }));

        // Update distance proportionally
        if (resizedRoute.distance) {
            resizedRoute.distance *= scaleFactor;
        }
        
        console.log(`✅ Route resized to fit within circle`);
        
        return resizedRoute;
    }

    // 4. Aggregate 2 or more routes by connecting them end-to-end
    aggregateRoutes(routes) {
        if (!routes || routes.length === 0) {
            throw new Error('No routes provided for aggregation');
        }

        if (routes.length === 1) {
            console.log(`📄 Single route provided, returning clone`);
            return this._cloneRoute(routes[0]);
        }

        console.log(`🔗 Aggregating ${routes.length} routes end-to-end`);
        
        // Use reduce to iteratively combine routes
        // First route becomes the initial accumulator, iteration starts with second route
        return routes.reduce((aggregatedRoute, currentRoute) => {
            console.log(`🔗 Connecting route: ${currentRoute.filename || 'Unnamed'}`);
            return this._connectTwoRoutes(aggregatedRoute, currentRoute);
        });
    }

    // 5. Convert a route into a cumulative elevation route
    convertToCumulativeElevation(route) {
        if (!route.points || route.points.length === 0) {
            throw new Error('Route must have points to convert elevation');
        }

        console.log(`📈 Converting route to cumulative elevation: ${route.filename || 'Unnamed'}`);
        
        const cumulativeRoute = this._cloneRoute(route);

        const cumulativeRouteData = route.points.reduce(
            ({ cumulative, lastElevation, points }, point) => {
                const currentElevation = point.elevation ?? 0;

                const gain = lastElevation !== null && currentElevation > lastElevation
                    ? currentElevation - lastElevation
                    : 0;

                const newCumulative = cumulative + gain;

                return {
                    cumulative: newCumulative,
                    lastElevation: currentElevation,
                    points: [
                        ...points,
                        {
                            ...point,
                            elevation: newCumulative,
                        }
                    ]
                };
            },
            { cumulative: 0, lastElevation: null, points: [] }
        );

        cumulativeRoute.points = cumulativeRouteData.points;

        // Update route metadata
        cumulativeRoute.filename = `${route.filename || 'Route'} (Cumulative)`;
        if (cumulativeRoute.metadata) {
            cumulativeRoute.metadata.elevationMode = 'cumulative';
            cumulativeRoute.metadata.originalElevationGain = route.elevationGain;
        } else {
            cumulativeRoute.metadata = {
                elevationMode: 'cumulative',
                originalElevationGain: route.elevationGain
            };
        }

        console.log(`✅ Converted to cumulative elevation: ${cumulativeRouteData.cumulative.toFixed(1)}m total climbing`);

        return cumulativeRoute;
    }

    // 6. Convert a route to time-domain by aggregating points along a time-series
    convertToTimeDomain(route, timeStepMs = null) {
        if (!route.points || route.points.length === 0) {
            throw new Error('Route must have points to convert to time domain');
        }

        console.log(`⏰ Converting route to time domain: ${route.filename || 'Unnamed'}`);
        
        // Filter points that have timestamps
        const timestampedPoints = route.points.filter(point => point.timestamp);
        
        if (timestampedPoints.length === 0) {
            throw new Error('Route must have timestamped points for time domain conversion');
        }

        // Sort by timestamp
        timestampedPoints.sort((a, b) => new Date(a.timestamp) - new Date(b.timestamp));
        
        const startTime = new Date(timestampedPoints[0].timestamp);
        const endTime = new Date(timestampedPoints[timestampedPoints.length - 1].timestamp);
        const totalTimespan = endTime - startTime; // milliseconds
        
        console.log(`📅 Time range: ${startTime.toISOString()} to ${endTime.toISOString()}`);
        console.log(`⏱️ Total timespan: ${Math.round(totalTimespan / 1000 / 60)} minutes`);
        
        // Auto-select time step if not provided
        if (!timeStepMs) {
            if (totalTimespan < 24 * 60 * 60 * 1000) { // Less than 24 hours
                timeStepMs = 60 * 1000; // 1 minute
            } else if (totalTimespan < 28 * 24 * 60 * 60 * 1000) { // Less than 28 days
                timeStepMs = 60 * 60 * 1000; // 1 hour
            } else {
                timeStepMs = 24 * 60 * 60 * 1000; // 1 day
            }
        }
        
        const stepLabel = timeStepMs === 60 * 1000 ? 'minute' : 
                         timeStepMs === 60 * 60 * 1000 ? 'hour' : 'day';
        
        console.log(`⏰ Using ${stepLabel} time steps (${timeStepMs / 1000}s intervals)`);
        
        // Create time-aggregated points
        const timeAggregatedPoints = [];
        
        for (let currentTime = startTime; currentTime <= endTime; currentTime = new Date(currentTime.getTime() + timeStepMs)) {
            const nextTime = new Date(currentTime.getTime() + timeStepMs);
            
            // Find points within this time step
            const pointsInStep = timestampedPoints.filter(point => {
                const pointTime = new Date(point.timestamp);
                return pointTime >= currentTime && pointTime < nextTime;
            });

            if (pointsInStep.length === 0) continue;

            // Summarize points in this time step
            const maxElevation = Math.max(...pointsInStep.map(p => p.elevation || 0));
            const avgLat = pointsInStep.reduce((sum, p) => sum + p.lat, 0) / pointsInStep.length;
            const avgLon = pointsInStep.reduce((sum, p) => sum + p.lon, 0) / pointsInStep.length;

            timeAggregatedPoints.push({
                lat: avgLat,
                lon: avgLon,
                elevation: maxElevation,
                timestamp: currentTime.toISOString(),
                timeStep: stepLabel,
                pointCount: pointsInStep.length,
                originalPoints: pointsInStep // Keep reference to original points
            });
        }
        
        // Create the time-domain route
        const timeDomainRoute = this._cloneRoute(route);
        timeDomainRoute.points = timeAggregatedPoints;
        timeDomainRoute.filename = `${route.filename || 'Route'} (Time Domain)`;
        
        if (timeDomainRoute.metadata) {
            timeDomainRoute.metadata.timeDomain = true;
            timeDomainRoute.metadata.timeStepMs = timeStepMs;
            timeDomainRoute.metadata.timeStep = stepLabel;
        } else {
            timeDomainRoute.metadata = {
                timeDomain: true,
                timeStepMs: timeStepMs,
                timeStep: stepLabel
            };
        }
        
        console.log(`✅ Converted to time domain: ${timeAggregatedPoints.length} time points from ${timestampedPoints.length} original points`);
        
        return timeDomainRoute;
    }

    // Private helper: Connect two routes end-to-end
    _connectTwoRoutes(firstRoute, secondRoute) {
        if (!firstRoute.points || firstRoute.points.length === 0) {
            return this._cloneRoute(secondRoute);
        }
        
        if (!secondRoute.points || secondRoute.points.length === 0) {
            return this._cloneRoute(firstRoute);
        }
        
        console.log(`🔗 Connecting ${firstRoute.filename || 'Route1'} (${firstRoute.points.length} points) to ${secondRoute.filename || 'Route2'} (${secondRoute.points.length} points)`);
        
        // Get the end point of the first route
        const firstRouteEnd = firstRoute.points[firstRoute.points.length - 1];
        
        // Relocate second route to start at the end of the first route
        const relocatedSecondRoute = this.relocateRouteToPosition(
            secondRoute,
            firstRouteEnd.lat,
            firstRouteEnd.lon,
            firstRouteEnd.elevation || 0
        );
        
        // Combine points (skip first point of second route to avoid duplication)
        const combinedPoints = [
            ...firstRoute.points,
            ...relocatedSecondRoute.points.slice(1)
        ];
        
        // Create combined route
        const combinedRoute = {
            id: firstRoute.id || this._generateRouteId(),
            filename: `${firstRoute.filename || 'Route1'} + ${secondRoute.filename || 'Route2'}`,
            points: combinedPoints,
            distance: (firstRoute.distance || 0) + (secondRoute.distance || 0),
            elevationGain: (firstRoute.elevationGain || 0) + (secondRoute.elevationGain || 0),
            elevationLoss: (firstRoute.elevationLoss || 0) + (secondRoute.elevationLoss || 0),
            duration: (firstRoute.duration || 0) + (secondRoute.duration || 0),
            uploadTime: firstRoute.uploadTime || Date.now(),
            metadata: {
                combined: true,
                sourceRoutes: [
                    {
                        id: firstRoute.id,
                        filename: firstRoute.filename,
                        points: firstRoute.points.length
                    },
                    {
                        id: secondRoute.id,
                        filename: secondRoute.filename,
                        points: secondRoute.points.length
                    }
                ],
                ...firstRoute.metadata
            }
        };
        
        console.log(`✅ Routes connected: ${combinedPoints.length} total points`);
        
        return combinedRoute;
    }

    // Private helper: Deep clone a route object
    _cloneRoute(route) {
        return {
            ...route,
            points: route.points.map(point => ({ ...point })),
            metadata: route.metadata ? { ...route.metadata } : undefined
        };
    }

    // Private helper: Generate a unique route ID
    _generateRouteId() {
        return 'route_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9);
    }

    // Utility: Get route bounds (min/max lat/lon/elevation)
    getRouteBounds(route) {
        if (!route.points || route.points.length === 0) {
            return null;
        }

        const lats = route.points.map(p => p.lat);
        const lons = route.points.map(p => p.lon);
        const elevations = route.points.map(p => p.elevation || 0);

        return {
            minLat: Math.min(...lats),
            maxLat: Math.max(...lats),
            minLon: Math.min(...lons),
            maxLon: Math.max(...lons),
            minElevation: Math.min(...elevations),
            maxElevation: Math.max(...elevations),
            latRange: Math.max(...lats) - Math.min(...lats),
            lonRange: Math.max(...lons) - Math.min(...lons),
            elevationRange: Math.max(...elevations) - Math.min(...elevations)
        };
    }

    // Utility: Calculate distance between two points (Haversine formula)
    calculateDistance(lat1, lon1, lat2, lon2) {
        const R = 6371; // Earth's radius in kilometers
        const dLat = (lat2 - lat1) * Math.PI / 180;
        const dLon = (lon2 - lon1) * Math.PI / 180;
        const a = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
                  Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
                  Math.sin(dLon / 2) * Math.sin(dLon / 2);
        const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
        return R * c; // Distance in kilometers
    }

    // Utility: Calculate route statistics
    calculateRouteStats(route) {
        if (!route.points || route.points.length < 2) {
            return {
                distance: 0,
                elevationGain: 0,
                elevationLoss: 0,
                duration: 0
            };
        }

        let totalDistance = 0;
        let totalElevationGain = 0;
        let totalElevationLoss = 0;
        let lastElevation = null;

        for (let i = 1; i < route.points.length; i++) {
            const prevPoint = route.points[i - 1];
            const currPoint = route.points[i];

            // Calculate distance
            totalDistance += this.calculateDistance(
                prevPoint.lat, prevPoint.lon,
                currPoint.lat, currPoint.lon
            );

            // Calculate elevation changes
            if (prevPoint.elevation !== undefined && currPoint.elevation !== undefined) {
                const elevationChange = currPoint.elevation - prevPoint.elevation;
                if (elevationChange > 0) {
                    totalElevationGain += elevationChange;
                } else {
                    totalElevationLoss += Math.abs(elevationChange);
                }
            }
        }

        // Calculate duration if timestamps are available
        let totalDuration = 0;
        const firstPoint = route.points.find(p => p.timestamp);
        const lastPoint = [...route.points].reverse().find(p => p.timestamp);
        
        if (firstPoint && lastPoint) {
            totalDuration = (new Date(lastPoint.timestamp) - new Date(firstPoint.timestamp)) / 1000;
        }

        return {
            distance: totalDistance,
            elevationGain: totalElevationGain,
            elevationLoss: totalElevationLoss,
            duration: totalDuration
        };
    }
}

export default RouteManipulator;
