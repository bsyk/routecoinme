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
    convertToTimeDomain(route, startTime, endTime, stepSizeMs) {
        if (!route.points || route.points.length === 0) {
            throw new Error('Route must have points to convert to time domain');
        }

        if (!startTime || !endTime || !stepSizeMs) {
            throw new Error('startTime, endTime, and stepSizeMs are all required parameters');
        }

        console.log(`⏰ Converting route to time domain: ${route.filename || 'Unnamed'}`);
        
        if (startTime >= endTime) {
            throw new Error('startTime must be before endTime');
        }
        
        const totalTimespan = endTime - startTime;
        
        console.log(`📅 Time range: ${startTime.toISOString()} to ${endTime.toISOString()}`);
        console.log(`⏱️ Total timespan: ${Math.round(totalTimespan / 1000 / 60)} minutes`);
        console.log(`⏰ Using time steps (${stepSizeMs / 1000}s intervals)`);
        
        // Filter and sort points that have timestamps
        const timestampedPoints = route.points
            .filter(point => point.timestamp)
            .sort((a, b) => new Date(a.timestamp) - new Date(b.timestamp));
        
        if (timestampedPoints.length === 0) {
            throw new Error('Route must have timestamped points for time domain conversion');
        }

        console.log(`🔄 Processing ${timestampedPoints.length} timestamped points in single O(n) pass`);

        // Single-pass functional approach: accumulate best points by time step
        const timeStepsBestPoints = timestampedPoints.reduce((stepMap, sourcePoint) => {
            const pointTime = new Date(sourcePoint.timestamp);
            
            // Find which time step this point belongs to
            const stepStart = this._stepStartMs(pointTime.getTime(), startTime.getTime(), stepSizeMs);
            const stepKey = stepStart.toString();
            
            // Only include points that fall within our time range
            if (stepStart >= startTime.getTime() && stepStart < endTime.getTime()) {
                const existing = stepMap[stepKey];
                
                // Keep the point with highest elevation for each time step
                if (!existing || (sourcePoint.elevation || 0) > (existing.elevation || 0)) {
                    stepMap[stepKey] = sourcePoint;
                }
            }
            
            return stepMap;
        }, {});

        console.log(`✅ Found source data for ${Object.keys(timeStepsBestPoints).length} time steps`);

        // Generate complete time series using functional reduce approach
        const start = this._stepStartMs(startTime.getTime(), startTime.getTime(), stepSizeMs); // snap to step boundary
        const end = endTime.getTime();
        const count = Math.ceil((end - start) / stepSizeMs);

        const allTimeSteps = Array.from(
            { length: count },
            (_, i) => start + i * stepSizeMs
        );

        const timeAggregatedPoints = allTimeSteps.reduce((acc, currentTimeMs) => {
            const stepKey = currentTimeMs.toString();
            const stepData = timeStepsBestPoints[stepKey];
            
            if (stepData) {
                // We have source data for this time step
                const resultPoint = {
                    ...stepData,
                    timestamp: new Date(currentTimeMs).toISOString(),
                };
                
                acc.push(resultPoint);
            } else {
                // No source data - clone the prior point with updated timestamp
                const priorPoint = acc.at(-1) || {
                    lat: timestampedPoints[0].lat,
                    lon: timestampedPoints[0].lon,
                    elevation: timestampedPoints[0].elevation || 0
                };
                
                const resultPoint = {
                    ...priorPoint,
                    timestamp: new Date(currentTimeMs).toISOString(),
                };
                
                acc.push(resultPoint);
            }
            
            return acc;
        }, []);
        
        // Create the time-domain route
        const timeDomainRoute = this._cloneRoute(route);
        timeDomainRoute.points = timeAggregatedPoints;
        timeDomainRoute.filename = `${route.filename || 'Route'} (Time Domain)`;
        
        timeDomainRoute.metadata = {
            ...timeDomainRoute.metadata,
            timeDomain: true,
            startTime: startTime,
            endTime: endTime,
            stepSizeMs: stepSizeMs,
            completeTimeRange: true
        };
        
        const interpolatedCount = timeAggregatedPoints.filter(p => !p.hasSourceData).length;
        const sourceDataCount = timeAggregatedPoints.filter(p => p.hasSourceData).length;
        
        console.log(`✅ Converted to time domain: ${timeAggregatedPoints.length} time points (${sourceDataCount} from source data, ${interpolatedCount} interpolated)`);
        
        return timeDomainRoute;
    }

    // 7. Resample a route to a specific point count (interpolate up or downsample down)
    resampleRoute(route, targetPointCount) {
        if (!route.points || route.points.length === 0) {
            throw new Error('Route must have points to resample');
        }

        if (targetPointCount < 2) {
            throw new Error('Target point count must be at least 2');
        }

        if (route.points.length === targetPointCount) {
            console.log(`✅ Route already has ${targetPointCount} points, returning clone`);
            return this._cloneRoute(route);
        }

        console.log(`🔄 Resampling route from ${route.points.length} to ${targetPointCount} points`);

        const originalPoints = route.points;
        const isUpsampling = targetPointCount > originalPoints.length;
        
        let resampledPoints;
        
        if (isUpsampling) {
            // Interpolate points to increase count
            resampledPoints = this._upsamplePoints(originalPoints, targetPointCount);
            console.log(`📈 Upsampled route by interpolating ${targetPointCount - originalPoints.length} new points`);
        } else {
            // Downsample points to decrease count
            resampledPoints = this._downsamplePoints(originalPoints, targetPointCount);
            console.log(`📉 Downsampled route by removing ${originalPoints.length - targetPointCount} points`);
        }

        // Create resampled route
        const resampledRoute = this._cloneRoute(route);
        resampledRoute.points = resampledPoints;
        resampledRoute.filename = `${route.filename || 'Route'} (${targetPointCount} points)`;
        
        // Update metadata
        resampledRoute.metadata = {
            ...resampledRoute.metadata,
            resampled: true,
            originalPointCount: originalPoints.length,
            targetPointCount: targetPointCount,
            resampleMethod: isUpsampling ? 'interpolation' : 'downsampling'
        };

        // Recalculate route statistics since point density changed
        const stats = this.calculateRouteStats(resampledRoute);
        resampledRoute.distance = stats.distance;
        resampledRoute.elevationGain = stats.elevationGain;
        resampledRoute.elevationLoss = stats.elevationLoss;
        resampledRoute.duration = stats.duration;

        console.log(`✅ Route resampled: ${resampledPoints.length} points, ${stats.distance.toFixed(1)}km distance`);

        return resampledRoute;
    }

    // 8. Apply a predetermined path to a route (overlay lat/lon while keeping elevation/time)
    async applyPredeterminedPath(route, predeterminedPathName) {
        if (!route.points || route.points.length === 0) {
            throw new Error('Route must have points to apply predetermined path');
        }

        console.log(`🗺️ Applying predetermined path '${predeterminedPathName}' to route: ${route.filename || 'Unnamed'}`);
        
        try {
            // Step 1: Resample the provided route to 10000 points
            console.log(`📏 Resampling provided route to 10000 points...`);
            const resampledRoute = this.resampleRoute(route, 10000);
            
            // Step 2: Load the predetermined path
            console.log(`📂 Loading predetermined path: ${predeterminedPathName}`);
            const predeterminedPath = await this._loadPredeterminedPath(predeterminedPathName);
            
            // Step 3: Resample the predetermined path to 10000 points if needed
            let pathTemplate;
            if (predeterminedPath.points.length !== 10000) {
                console.log(`📏 Resampling predetermined path from ${predeterminedPath.points.length} to 10000 points...`);
                pathTemplate = this.resampleRoute(predeterminedPath, 10000);
            } else {
                console.log(`✅ Predetermined path already has 10000 points`);
                pathTemplate = predeterminedPath;
            }
            
            // Step 3.5: Normalize and resize predetermined path to consistent size
            console.log(`🎯 Normalizing and resizing predetermined path to fit standard radius...`);
            pathTemplate = this.normalizeRoute(pathTemplate);
            pathTemplate = this.resizeRouteToFit(pathTemplate);
            
            // Step 4: Apply the predetermined lat/lon while preserving elevation and time
            console.log(`🔄 Applying predetermined lat/lon coordinates...`);
            const overlayedPoints = resampledRoute.points.map((originalPoint, index) => {
                const templatePoint = pathTemplate.points[index];
                
                return {
                    ...originalPoint, // Keep all original fields (elevation, timestamp, etc.)
                    lat: templatePoint.lat, // Override with predetermined lat
                    lon: templatePoint.lon, // Override with predetermined lon
                };
            });
            
            // Step 5: Create the new route with overlayed path
            const overlayedRoute = this._cloneRoute(resampledRoute);
            overlayedRoute.points = overlayedPoints;
            overlayedRoute.filename = `${route.filename || 'Route'} (${predeterminedPathName})`;
            
            // Update metadata
            overlayedRoute.metadata = {
                ...overlayedRoute.metadata,
                predeterminedPath: true,
                pathTemplate: predeterminedPathName,
                originalRoute: route.filename,
                overlayMethod: 'lat_lon_overlay',
                preservedData: ['elevation', 'timestamp', 'other_fields']
            };
            
            // IMPORTANT: Keep original route statistics - predetermined path only provides coordinates!
            // The predetermined path is just a coordinate template, not real route data
            overlayedRoute.distance = resampledRoute.distance; // Original aggregated distance
            overlayedRoute.elevationGain = resampledRoute.elevationGain; // Original aggregated elevation gain
            overlayedRoute.elevationLoss = resampledRoute.elevationLoss; // Original aggregated elevation loss
            overlayedRoute.duration = resampledRoute.duration; // Original aggregated duration
            
            console.log(`✅ Applied predetermined path: ${overlayedPoints.length} points`);
            console.log(`📊 Preserved original stats: ${overlayedRoute.distance.toFixed(1)}km distance, ${overlayedRoute.elevationGain.toFixed(1)}m gain, ${overlayedRoute.elevationLoss.toFixed(1)}m loss`);
            console.log(`⏱️ Preserved duration: ${(overlayedRoute.duration / 60).toFixed(1)} minutes`);
            
            return overlayedRoute;
            
        } catch (error) {
            console.error(`❌ Failed to apply predetermined path '${predeterminedPathName}':`, error.message);
            throw new Error(`Failed to apply predetermined path: ${error.message}`);
        }
    }

    // 9. Vertically scale a route's elevation to a target range
    scaleElevation(route, targetMaxHeight = 10000) {
        if (!route.points || route.points.length === 0) {
            throw new Error('Route must have points to scale elevation');
        }

        console.log(`📏 Scaling route elevation to target max height: ${targetMaxHeight}m`);
        
        // Get current elevation bounds
        const bounds = this.getRouteBounds(route);
        const currentElevationRange = bounds.elevationRange;
        const currentMinElevation = bounds.minElevation;
        const currentMaxElevation = bounds.maxElevation;
        
        if (currentElevationRange === 0) {
            console.log(`⚠️ Route has no elevation variation, keeping elevations unchanged`);
            return this._cloneRoute(route);
        }
        
        console.log(`📊 Current elevation: ${currentMinElevation.toFixed(1)}m to ${currentMaxElevation.toFixed(1)}m (${currentElevationRange.toFixed(1)}m range)`);
        
        // Scale the elevation range to target height while preserving relative differences
        const scaleFactor = targetMaxHeight / currentElevationRange;
        console.log(`📐 Scale factor: ${scaleFactor.toFixed(4)} (preserving relative elevation)`);
        
        // Create scaled route
        const scaledRoute = this._cloneRoute(route);
        
        scaledRoute.points = route.points.map(point => {
            const originalElevation = point.elevation || 0;
            
            // Scale relative to the minimum elevation
            const relativeElevation = originalElevation - currentMinElevation;
            const scaledElevation = relativeElevation * scaleFactor;
            
            return {
                ...point,
                elevation: scaledElevation,
                originalElevation: originalElevation // Preserve original for reference
            };
        });
        
        // Update route metadata
        scaledRoute.filename = `${route.filename || 'Route'} (Scaled ${(targetMaxHeight/1000).toFixed(1)}km)`;
        scaledRoute.metadata = {
            ...scaledRoute.metadata,
            elevationScaled: true,
            originalElevationRange: currentElevationRange,
            targetMaxHeight: targetMaxHeight,
            elevationScaleFactor: scaleFactor,
            originalMinElevation: currentMinElevation,
            originalMaxElevation: currentMaxElevation
        };
        
        // Recalculate elevation statistics
        const newBounds = this.getRouteBounds(scaledRoute);
        const stats = this.calculateRouteStats(scaledRoute);
        
        scaledRoute.elevationGain = stats.elevationGain;
        scaledRoute.elevationLoss = stats.elevationLoss;
        
        console.log(`✅ Elevation scaled from ${currentElevationRange.toFixed(1)}m to ${newBounds.elevationRange.toFixed(1)}m range`);
        console.log(`📊 New elevation: ${newBounds.minElevation.toFixed(1)}m to ${newBounds.maxElevation.toFixed(1)}m`);
        console.log(`⛰️ Scaled elevation gain: ${scaledRoute.elevationGain.toFixed(1)}m, loss: ${scaledRoute.elevationLoss.toFixed(1)}m`);
        
        return scaledRoute;
    }

    // Private helper: Load a predetermined path from file
    async _loadPredeterminedPath(pathName) {
        try {
            // Construct the path to the predetermined route file
            const filePath = `/predetermined-paths/${pathName}`;
            console.log(`📂 Fetching predetermined path from: ${filePath}`);
            
            // Fetch the file (this assumes the files are served from public/predetermined-paths/)
            const response = await fetch(filePath);
            
            if (!response.ok) {
                throw new Error(`HTTP ${response.status}: ${response.statusText}`);
            }
            
            const pathData = JSON.parse(await response.text());
            
            // Validate the loaded path data
            if (!pathData.points || !Array.isArray(pathData.points)) {
                throw new Error('Predetermined path must have a points array');
            }
            
            if (pathData.points.length === 0) {
                throw new Error('Predetermined path cannot be empty');
            }
            
            // Validate that points have required lat/lon fields
            const invalidPoints = pathData.points.filter(p => 
                typeof p.lat !== 'number' || typeof p.lon !== 'number'
            );
            
            if (invalidPoints.length > 0) {
                throw new Error(`Predetermined path has ${invalidPoints.length} points missing lat/lon coordinates`);
            }
            
            console.log(`✅ Loaded predetermined path: ${pathData.points.length} points`);
            
            // Ensure the path has required route structure
            return {
                id: pathData.id || `predetermined_${pathName}`,
                filename: pathData.filename || pathName,
                points: pathData.points,
                distance: pathData.distance || 0,
                elevationGain: pathData.elevationGain || 0,
                elevationLoss: pathData.elevationLoss || 0,
                duration: pathData.duration || 0,
                metadata: {
                    ...pathData.metadata,
                    predeterminedPath: true,
                    pathSource: pathName
                }
            };
            
        } catch (error) {
            if (error.name === 'TypeError' && error.message.includes('fetch')) {
                throw new Error(`Cannot load predetermined path '${pathName}' - file not found or network error`);
            }
            throw error;
        }
    }

    // Private helper: Interpolate points to increase point count
    _upsamplePoints(originalPoints, targetPointCount) {
        const n = originalPoints.length;
        if (n < 2) return [...originalPoints]; // Not enough points to interpolate

        const segmentCount = targetPointCount - 1; // Number of intervals in target array

        // Generate all middle points
        const middlePoints = Array.from({ length: targetPointCount - 2 }, (_, i) => {
            const progress = (i + 1) / segmentCount; // 0..1 relative position
            const sourcePosition = progress * (n - 1); // fractional index in original array

            const lowerIndex = Math.floor(sourcePosition);
            const upperIndex = Math.min(Math.ceil(sourcePosition), n - 1);
            const t = sourcePosition - lowerIndex; // weight for upper point

            const lowerPoint = originalPoints[lowerIndex];
            const upperPoint = originalPoints[upperIndex];

            // Interpolate each field numerically
            return {
                ...lowerPoint, // start with lower point's data
                lat: lowerPoint.lat + (upperPoint.lat - lowerPoint.lat) * t,
                lon: lowerPoint.lon + (upperPoint.lon - lowerPoint.lon) * t,
                elevation: (lowerPoint.elevation || 0) + ((upperPoint.elevation || 0) - (lowerPoint.elevation || 0)) * t,
            };
        });

        // Return first point + middle points + last point
        return [
            { ...originalPoints[0] }, // first
            ...middlePoints,
            { ...originalPoints.at(-1) } // last
        ];
    }


    // Private helper: Downsample points to decrease point count
    _downsamplePoints(originalPoints, targetPointCount) {
        // Calculate how many original points to combine for each target point
        const segmentCount = targetPointCount - 1;
        const originalSegmentSize = (originalPoints.length - 1) / segmentCount;

        // Generate middle points functionally
        const middlePoints = Array.from({ length: targetPointCount - 2 }, (_, i) => {
            // Calculate start and end of the current segment
            const segmentStart = 1 + i * originalSegmentSize; // Skip first point
            const segmentEnd = 1 + (i + 1) * originalSegmentSize;

            const startIndex = Math.floor(segmentStart);
            const endIndex = Math.min(Math.ceil(segmentEnd), originalPoints.length - 1);

            // Get all points in this segment
            const segmentPoints = originalPoints.slice(startIndex, endIndex + 1);

            if (segmentPoints.length === 0) {
                // Fallback to nearest point
                return { ...originalPoints[startIndex] };
            }

            // Interpolate position between points of the segment using the max elevation
            return this._getCenterPoint(segmentPoints, true);
        });

        // Combine first point, middle points, and last point
        return [
            // Always keep first point exactly
            { ...originalPoints[0] },
            ...middlePoints,
            // Always keep last point exactly
            { ...originalPoints.at(-1) },
        ];
    }

    _getCenterPoint(points, useMaxElevation = false) {
        const bounds = this.getRouteBounds({ points });
        return {
            ...points[0], // Copy other fields from first point
            lat: bounds.centerLat,
            lon: bounds.centerLon,
            // Timestamps may not be present
            ...( bounds.centerTimestamp && { timestamp: bounds.centerTimestamp }),
            elevation: useMaxElevation ? bounds.maxElevation : bounds.centerElevation
        }
    }

    _stepStartMs(pointTimeMs, startTimeMs, stepSizeMs) {
        return Math.floor((pointTimeMs - startTimeMs) / stepSizeMs) * stepSizeMs + startTimeMs;
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
        
        return this.resampleRoute(combinedRoute, 10000);
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
        return `route_${crypto.randomUUID()}`;
    }


    // Utility: Get route bounds (min/max lat/lon/elevation)
    getRouteBounds(route) {
        if (!route.points || route.points.length === 0) {
            return null;
        }

        const lats = route.points.map(p => p.lat);
        const lons = route.points.map(p => p.lon);
        const elevations = route.points.map(p => p.elevation || 0);

        const minLat =  Math.min(...lats);
        const maxLat =  Math.max(...lats);
        const minLon =  Math.min(...lons);
        const maxLon =  Math.max(...lons);
        const minElevation =  Math.min(...elevations);
        const maxElevation =  Math.max(...elevations);
        const minTimestamp =  Math.min(...route.points.map(p => p.timestamp ? new Date(p.timestamp).getTime() : Infinity));
        const maxTimestamp =  Math.max(...route.points.map(p => p.timestamp ? new Date(p.timestamp).getTime() : -Infinity));
        const latRange =  maxLat - minLat;
        const lonRange =  maxLon - minLon;
        const elevationRange =  maxElevation - minElevation;
        const timestampRange =  maxTimestamp - minTimestamp;
        const centerLat = (minLat + maxLat) / 2;
        const centerLon = (minLon + maxLon) / 2;
        const centerElevation = (minElevation + maxElevation) / 2;
        const centerTimestamp = (minTimestamp + maxTimestamp) / 2;

        return {
            minLat,
            maxLat,
            minLon,
            maxLon,
            minElevation,
            maxElevation,
            minTimestamp,
            maxTimestamp,
            latRange,
            lonRange,
            elevationRange,
            timestampRange,
            centerLat,
            centerLon,
            centerElevation,
            centerTimestamp
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

        // Use functional reduce to calculate distance and elevation changes
        const stats = route.points.slice(1).reduce((acc, currPoint, index) => {
            const prevPoint = route.points[index]; // index is offset by slice(1)

            // Calculate distance
            acc.distance += this.calculateDistance(
                prevPoint.lat, prevPoint.lon,
                currPoint.lat, currPoint.lon
            );

            // Calculate elevation changes
            if (prevPoint.elevation !== undefined && currPoint.elevation !== undefined) {
                const elevationChange = currPoint.elevation - prevPoint.elevation;
                if (elevationChange > 0) {
                    acc.elevationGain += elevationChange;
                } else {
                    acc.elevationLoss += Math.abs(elevationChange);
                }
            }

            return acc;
        }, {
            distance: 0,
            elevationGain: 0,
            elevationLoss: 0
        });

        // Calculate duration if timestamps are available
        const firstPoint = route.points.find(p => p.timestamp);
        const lastPoint = [...route.points].reverse().find(p => p.timestamp);
        
        const duration = firstPoint && lastPoint 
            ? (new Date(lastPoint.timestamp) - new Date(firstPoint.timestamp)) / 1000
            : 0;

        return {
            distance: stats.distance,
            elevationGain: stats.elevationGain,
            elevationLoss: stats.elevationLoss,
            duration: duration
        };
    }
}

export default RouteManipulator;
