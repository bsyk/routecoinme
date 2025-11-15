// GPX File Parser and Handler
class GPXParser {
    constructor() {
        this.supportedFormats = ['.gpx', '.xml'];
        this.maxFileSize = 50 * 1024 * 1024; // 50MB
    }

    // Parse GPX file content
    async parseGPXFile(file) {
        try {
            console.log(`📁 Parsing GPX file: ${file.name} (${(file.size / 1024).toFixed(1)}KB)`);
            
            // Validate file
            this.validateFile(file);
            
            // Read file content
            const content = await this.readFileContent(file);
            
            // Parse XML
            const xmlDoc = this.parseXML(content);
            
            // Extract GPS data
            const routeData = this.extractRouteData(xmlDoc, file.name);
            
            console.log(`✅ Successfully parsed GPX: ${routeData.points.length} points, ${routeData.distance.toFixed(2)}km`);
            return routeData;
            
        } catch (error) {
            console.error(`❌ Error parsing GPX file ${file.name}:`, error);
            throw new Error(`Failed to parse ${file.name}: ${error.message}`);
        }
    }

    // Validate file before processing
    validateFile(file) {
        // Check file type
        const fileExtension = file.name.toLowerCase().slice(file.name.lastIndexOf('.'));
        if (!this.supportedFormats.includes(fileExtension)) {
            throw new Error(`Unsupported file format. Please upload a GPX (.gpx) file.`);
        }

        // Check file size
        if (file.size > this.maxFileSize) {
            throw new Error(`File too large. Please upload a file smaller than 50MB.`);
        }

        // Check if file is empty
        if (file.size === 0) {
            throw new Error(`File is empty.`);
        }
    }

    // Read file content as text
    readFileContent(file) {
        return new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = (e) => resolve(e.target.result);
            reader.onerror = () => reject(new Error('Failed to read file'));
            reader.readAsText(file);
        });
    }

    // Parse XML content
    parseXML(content) {
        const parser = new DOMParser();
        const xmlDoc = parser.parseFromString(content, 'text/xml');
        
        // Check for parsing errors
        const parseError = xmlDoc.querySelector('parsererror');
        if (parseError) {
            throw new Error('Invalid XML format');
        }

        return xmlDoc;
    }

    // Extract route data from GPX XML
    extractRouteData(xmlDoc, filename) {
        const trackPoints = xmlDoc.querySelectorAll('trkpt');
        const routePoints = xmlDoc.querySelectorAll('rtept');
        const waypoints = xmlDoc.querySelectorAll('wpt');

        // Combine all point types, prioritizing track points
        let points = [];
        
        if (trackPoints.length > 0) {
            points = Array.from(trackPoints).map(point => this.parsePoint(point));
        } else if (routePoints.length > 0) {
            points = Array.from(routePoints).map(point => this.parsePoint(point));
        } else if (waypoints.length > 0) {
            points = Array.from(waypoints).map(point => this.parsePoint(point));
        }

        if (points.length === 0) {
            throw new Error('No GPS points found in GPX file');
        }

        // Extract metadata
        const metadata = this.extractMetadata(xmlDoc);
        
        // Calculate statistics
        const stats = this.calculateStats(points);

        return {
            filename,
            points,
            metadata,
            ...stats,
            uploadTime: new Date().toISOString()
        };
    }

    // Parse individual GPS point
    parsePoint(pointElement) {
        const lat = parseFloat(pointElement.getAttribute('lat'));
        const lon = parseFloat(pointElement.getAttribute('lon'));
        
        if (isNaN(lat) || isNaN(lon)) {
            throw new Error('Invalid coordinates in GPX file');
        }

        // Extract elevation
        const eleElement = pointElement.querySelector('ele');
        const elevation = eleElement ? parseFloat(eleElement.textContent) : null;

        // Extract timestamp
        const timeElement = pointElement.querySelector('time');
        const timestamp = timeElement ? new Date(timeElement.textContent) : null;

        // Extract name/description if available
        const nameElement = pointElement.querySelector('name');
        const name = nameElement ? nameElement.textContent : null;

        return {
            lat,
            lon,
            elevation,
            timestamp,
            name
        };
    }

    // Extract GPX metadata
    extractMetadata(xmlDoc) {
        const metadata = {};

        // Track/route name
        const nameElement = xmlDoc.querySelector('trk > name, rte > name');
        if (nameElement) metadata.name = nameElement.textContent;

        // Description
        const descElement = xmlDoc.querySelector('trk > desc, rte > desc');
        if (descElement) metadata.description = descElement.textContent;

        // Creator/source
        const gpxElement = xmlDoc.querySelector('gpx');
        if (gpxElement && gpxElement.getAttribute('creator')) {
            metadata.creator = gpxElement.getAttribute('creator');
        }

        // Time
        const timeElement = xmlDoc.querySelector('metadata > time, trk > time');
        if (timeElement) metadata.time = new Date(timeElement.textContent);

        return metadata;
    }

    // Calculate route statistics
    calculateStats(points) {
        if (points.length < 2) {
            return { distance: 0, elevationGain: 0, elevationLoss: 0, duration: 0 };
        }

        let totalDistance = 0;
        let elevationGain = 0;
        let elevationLoss = 0;
        let minElevation = Infinity;
        let maxElevation = -Infinity;

        for (let i = 1; i < points.length; i++) {
            const prev = points[i - 1];
            const curr = points[i];

            // Calculate distance between points (Haversine formula)
            const distance = this.calculateDistance(prev.lat, prev.lon, curr.lat, curr.lon);
            totalDistance += distance;

            // Calculate elevation changes
            if (prev.elevation !== null && curr.elevation !== null) {
                const elevDiff = curr.elevation - prev.elevation;
                if (elevDiff > 0) {
                    elevationGain += elevDiff;
                } else {
                    elevationLoss += Math.abs(elevDiff);
                }

                minElevation = Math.min(minElevation, curr.elevation);
                maxElevation = Math.max(maxElevation, curr.elevation);
            }
        }

        // Calculate duration if timestamps are available
        let duration = 0;
        const firstPoint = points.find(p => p.timestamp);
        const lastPoint = points.slice().reverse().find(p => p.timestamp);
        if (firstPoint && lastPoint && firstPoint.timestamp && lastPoint.timestamp) {
            duration = (lastPoint.timestamp - firstPoint.timestamp) / 1000; // seconds
        }

        return {
            distance: totalDistance, // km
            elevationGain: elevationGain || 0, // meters
            elevationLoss: elevationLoss || 0, // meters
            minElevation: minElevation === Infinity ? null : minElevation,
            maxElevation: maxElevation === -Infinity ? null : maxElevation,
            duration: duration, // seconds
            pointCount: points.length
        };
    }

    // Calculate distance between two GPS points using Haversine formula
    calculateDistance(lat1, lon1, lat2, lon2) {
        const R = 6371; // Earth's radius in km
        const dLat = this.toRadians(lat2 - lat1);
        const dLon = this.toRadians(lon2 - lon1);
        const a = 
            Math.sin(dLat / 2) * Math.sin(dLat / 2) +
            Math.cos(this.toRadians(lat1)) * Math.cos(this.toRadians(lat2)) *
            Math.sin(dLon / 2) * Math.sin(dLon / 2);
        const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
        return R * c;
    }

    toRadians(degrees) {
        return degrees * (Math.PI / 180);
    }

    // Convert route data back to GPX format for export
    generateGPX(routeData, options = {}) {
        const { 
            includeTime = true, 
            includeElevation = true,
            trackName = routeData.filename || 'RouteCoinMe Route'
        } = options;

        let gpxContent = `<?xml version="1.0" encoding="UTF-8"?>
<gpx version="1.1" creator="RouteCoinMe" xmlns="http://www.topografix.com/GPX/1/1">
    <metadata>
        <name>${trackName}</name>
        <desc>Generated by RouteCoinMe</desc>
        <time>${new Date().toISOString()}</time>
    </metadata>
    <trk>
        <name>${trackName}</name>
        <trkseg>`;

        routeData.points.forEach(point => {
            gpxContent += `
            <trkpt lat="${point.lat}" lon="${point.lon}">`;
            
            if (includeElevation && point.elevation !== null) {
                gpxContent += `
                <ele>${point.elevation}</ele>`;
            }
            
            if (includeTime && point.timestamp) {
                gpxContent += `
                <time>${point.timestamp.toISOString()}</time>`;
            }
            
            gpxContent += `
            </trkpt>`;
        });

        gpxContent += `
        </trkseg>
    </trk>
</gpx>`;

        return gpxContent;
    }
}

export default GPXParser;
