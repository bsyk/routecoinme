// Pre-defined waypoints extracted from Stelvio Pass GPX file
// These coordinates have been processed to remove elevation and relocated to our fictional circle

class StelvioWaypoints {
    constructor() {
        this.waypoints = null;
        this.isLoaded = false;
    }

    // Load and process the Stelvio Pass GPX file
    async loadStelvioWaypoints() {
        if (this.isLoaded) {
            return this.waypoints;
        }

        try {
            console.log('🏔️ Loading Stelvio Pass waypoints...');
            
            // Load the GPX file content
            const gpxContent = await this.loadStelvioGPX();
            
            // Parse the GPX content
            const parser = new DOMParser();
            const xmlDoc = parser.parseFromString(gpxContent, 'text/xml');
            
            // Extract track points
            const trackPoints = xmlDoc.querySelectorAll('trkpt');
            const rawPoints = Array.from(trackPoints).map(point => ({
                lat: parseFloat(point.getAttribute('lat')),
                lon: parseFloat(point.getAttribute('lon'))
            }));

            console.log(`🗺️ Extracted ${rawPoints.length} raw points from Stelvio Pass`);

            // Process the points for our fictional coordinate system
            this.waypoints = this.processWaypoints(rawPoints);
            this.isLoaded = true;

            console.log(`✅ Processed ${this.waypoints.length} Stelvio waypoints`);
            return this.waypoints;

        } catch (error) {
            console.error('❌ Failed to load Stelvio waypoints:', error);
            // Return empty array as fallback
            this.waypoints = [];
            this.isLoaded = true;
            return this.waypoints;
        }
    }

    // Load the Stelvio Pass GPX file content
    async loadStelvioGPX() {
        const response = await fetch('./Stelvio_Pass.gpx');
        if (!response.ok) {
            throw new Error(`Failed to load Stelvio Pass GPX: ${response.status}`);
        }
        return await response.text();
    }

    // Process raw coordinates into our fictional coordinate system
    processWaypoints(rawPoints) {
        if (rawPoints.length === 0) {
            return [];
        }

        console.log('🔄 Processing Stelvio coordinates into fictional circle system...');

        // Calculate bounds of the original route
        const minLat = Math.min(...rawPoints.map(p => p.lat));
        const maxLat = Math.max(...rawPoints.map(p => p.lat));
        const minLon = Math.min(...rawPoints.map(p => p.lon));
        const maxLon = Math.max(...rawPoints.map(p => p.lon));

        const latRange = maxLat - minLat;
        const lonRange = maxLon - minLon;

        console.log(`📏 Original route bounds: ${minLat.toFixed(4)} to ${maxLat.toFixed(4)} lat, ${minLon.toFixed(4)} to ${maxLon.toFixed(4)} lon`);
        console.log(`📏 Range: ${latRange.toFixed(4)}° lat, ${lonRange.toFixed(4)}° lon`);

        // Define our fictional circle parameters (matching the switchback generation)
        const maxRadius = 0.4; // ~40km radius in degrees
        const border = maxRadius * 0.05;
        const usableRadius = maxRadius - border;

        // Normalize the points to 0-1 range
        const normalizedPoints = rawPoints.map(point => ({
            x: (point.lon - minLon) / lonRange,
            y: (point.lat - minLat) / latRange
        }));

        // Scale and position within our circular coordinate system
        // We want to maintain the shape but fit it within our circle
        const processedPoints = normalizedPoints.map(point => {
            // Center the normalized coordinates around 0
            const centeredX = (point.x - 0.5) * 2; // -1 to 1
            const centeredY = (point.y - 0.5) * 2; // -1 to 1

            // Scale to fit within our usable radius
            // Use the larger dimension to ensure the entire route fits
            const maxDimension = Math.max(
                Math.abs(centeredX),
                Math.abs(centeredY)
            );
            
            const scaleFactor = maxDimension > 0 ? (usableRadius * 0.9) / maxDimension : 1;
            
            const finalX = centeredX * scaleFactor;
            const finalY = centeredY * scaleFactor;

            return {
                lat: finalY, // In our coordinate system, Y becomes latitude
                lon: finalX  // In our coordinate system, X becomes longitude
            };
        });

        console.log(`🎨 Processed ${processedPoints.length} waypoints into fictional coordinate system`);
        console.log(`📍 Sample waypoint: lat=${processedPoints[0].lat.toFixed(6)}, lon=${processedPoints[0].lon.toFixed(6)}`);

        return processedPoints;
    }

    // Get waypoints for use in switchback generation
    async getWaypoints() {
        return await this.loadStelvioWaypoints();
    }

    // Get a subset of waypoints if needed (for performance)
    async getDownsampledWaypoints(targetCount = 1000) {
        const waypoints = await this.getWaypoints();
        
        if (waypoints.length <= targetCount) {
            return waypoints;
        }

        // Downsample while preserving the route character
        const step = waypoints.length / targetCount;
        const downsampledPoints = [];
        
        for (let i = 0; i < waypoints.length; i += step) {
            const index = Math.floor(i);
            if (index < waypoints.length) {
                downsampledPoints.push(waypoints[index]);
            }
        }

        console.log(`📉 Downsampled from ${waypoints.length} to ${downsampledPoints.length} waypoints`);
        return downsampledPoints;
    }
}

export default StelvioWaypoints;
