# RouteCoinMe - Project Plan

## Project Overview

RouteCoinMe is a web application that enables users to fetch GPS route data from Strava, aggregate multiple GPX files into a single cohesive route, and visualize the combined route data in an interactive 3D environment. The application focuses on creating contiguous routes from disparate GPS tracks with flexible aggregation options.

## Core Features

### 1. GPX Data Acquisition
- **Strava Integration**: Fetch one or more GPX files from Strava API
- **Authentication**: OAuth 2.0 flow for Strava account access
- **Data Validation**: Ensure GPX files contain valid coordinate and timestamp data
- **Error Handling**: Graceful handling of API rate limits and data retrieval failures

### 2. Route Aggregation Engine
The system will provide three distinct aggregation methods, each creating fictional but meaningful representations of cumulative activity:

#### 2.1 Distance-Based Aggregation
- Aggregate routes based on cumulative distance traveled
- Read distance data directly from GPX files
- Relocate routes to create a continuous fictional path
- Maintain spatial relationships between route segments
- Create smooth transitions between route endpoints

#### 2.2 Ride Time Aggregation
- Combine routes based on actual ride duration
- Extract timing data from GPX timestamps
- Account for pauses and stops in the original routes
- Preserve temporal flow of the journey
- Relocate routes sequentially to show total effort over time

#### 2.3 Real-Time Aggregation (Elevation Focus)
- **Primary Goal**: Visualize total elevation gain and climbing achievements over time periods
- **Elevation Aggregation**: Cumulative elevation gain across multiple routes
- **Descent Filtering**: Optional removal of descending segments to show climbing-only profile
- **Route Relocation**: Position routes end-to-end to display aggregate climbing distance
- **Granularity Options**:
  - **Minute**: Fine-grained temporal control for short routes
  - **Hour**: Medium granularity for day-long adventures
  - **Day**: Coarse granularity for multi-day expeditions
- **Visualization Modes**:
  - **Total Climbing**: Show cumulative elevation gain only (descents removed)
  - **Full Profile**: Include both climbs and descents for complete route shape
- Use timestamped GPS points to create time-accurate visualizations

### 3. Coordinate Manipulation
- **Route Relocation**: Reposition subsequent routes so their start points align with the end point of the prior route, creating a fictional but contiguous aggregate route
- **Contiguity Algorithm**: Ensure routes connect seamlessly through coordinate translation
- **Gap Bridging**: Interpolate coordinates between disconnected route segments
- **Elevation Smoothing**: Handle altitude discrepancies at connection points
- **Speed Normalization**: Adjust timing data for realistic travel speeds

### 4. 3D Visualization
- **Interactive 3D Viewer**: Full rotation and zoom capabilities across all axes
- **Elevation Emphasis**: Fill area under the route line to z-axis (altitude = 0)
- **Cumulative Climbing Mode**: Option to display only upward elevation segments
- **Technology**: D3.js-based 3D rendering with WebGL acceleration
- **User Controls**:
  - Pan, zoom, and rotate
  - Toggle between aggregation views
  - Switch between full profile and climbing-only modes
  - Adjust elevation exaggeration
  - Playback animation along the route
  - Toggle descent visibility

### 5. Export & Save Functionality
- **GPX Export**: Generate and download aggregated routes as standard GPX files
- **Route Metadata**: Include custom tags and descriptions in exported files
- **Format Validation**: Ensure exported GPX files meet standard specifications
- **Batch Export**: Option to export multiple aggregated routes simultaneously

### 6. Route History & Management
- **Local Storage**: Save aggregated routes in browser local storage for quick access
- **Cloud Backup**: Optional R2 storage for cross-device synchronization
- **Route Library**: Browse and manage previously created aggregated routes
- **Route Sharing**: Generate shareable links for aggregated routes
- **Import/Export**: Backup and restore route collections

### 7. Privacy & Data Management
- **Privacy Policy**: Comprehensive data handling and user rights documentation
- **Data Deletion**: Complete user data removal including tokens, cached files, and generated routes
- **Consent Management**: Clear opt-in/opt-out controls for data storage
- **Data Portability**: Export all user data in standard formats
- **Retention Policies**: Automatic cleanup of old data based on user preferences

## Key Technical Concepts

### Fictional Route Creation
The aggregation process creates **fictional routes** that are geographically disconnected from reality but provide meaningful insights into cumulative activity. This approach enables:

- **Training Progress Visualization**: See total distance and elevation over time periods
- **Achievement Tracking**: Visualize cumulative climbing efforts across multiple rides
- **Pattern Recognition**: Identify training trends and activity patterns

### Elevation Processing Modes
1. **Full Profile Mode**: Maintains original elevation changes including climbs and descents
2. **Climbing-Only Mode**: Removes descending segments, showing only upward elevation gain
3. **Cumulative Elevation**: Tracks total elevation gained across all routes in the time period

### Route Relocation Algorithm
```
For each route after the first:
1. Calculate the end coordinates of the previous route
2. Calculate the start coordinates of the current route
3. Apply translation vector to all coordinates in current route
4. Maintain relative elevation changes within the route
5. Handle elevation continuity at connection points
```

## Technical Architecture

### Frontend Stack
- **Framework**: Vanilla JavaScript with modern ES6+ features
- **Visualization**: D3.js with Three.js for 3D rendering
- **UI Framework**: Custom CSS with modern design patterns
- **Build Tools**: Vite for development and production builds
- **Authentication**: Strava OAuth 2.0 implementation

### Backend Infrastructure (Cloudflare Workers)
- **Runtime**: Cloudflare Workers for serverless execution
- **API Gateway**: RESTful endpoints for GPX processing
- **Authentication Handler**: Strava OAuth token management

### Storage Solutions (Cloudflare)
- **R2**: Large GPX file storage and processed route caching
- **D1**: User session data and route metadata
- **Workers KV**: API keys, configuration, and temporary data

## Application Architecture

### Frontend Components

#### 1. Authentication Module
```
├── strava-auth.js          # OAuth flow management
├── token-storage.js        # Secure token handling
└── auth-ui.js             # Login/logout interface
```

#### 2. Data Management
```
├── gpx-fetcher.js         # Strava API integration
├── gpx-parser.js          # GPX file parsing and validation
├── gpx-exporter.js        # Generate downloadable GPX files
├── route-aggregator.js    # Core aggregation algorithms
├── elevation-processor.js # Climbing-only and cumulative elevation logic
├── coordinate-relocator.js # Route repositioning algorithms
├── local-storage.js       # Browser-based route persistence
├── cloud-sync.js          # Optional R2 synchronization
└── data-store.js          # Client-side data management
```

#### 3. Visualization Engine
```
├── 3d-renderer.js         # D3/Three.js 3D visualization
├── route-animator.js      # Route playback functionality
├── ui-controls.js         # User interaction controls
└── visualization-utils.js # Helper functions
```

#### 4. User Interface
```
├── main-dashboard.js          # Primary application interface
├── aggregation-controls.js    # Aggregation method selection
├── elevation-mode-toggle.js   # Climbing-only vs full profile controls
├── file-manager.js            # GPX file management UI
├── route-history.js           # Previously aggregated routes browser
├── export-controls.js         # GPX download and sharing options
├── privacy-controls.js        # Data management and deletion options
└── settings-panel.js          # User preferences
```

### Backend Services

#### 1. Cloudflare Workers
```
├── workers/
│   ├── auth-handler.js    # Strava OAuth endpoints
│   ├── gpx-processor.js   # GPX aggregation service
│   ├── data-deletion.js   # User data cleanup service
│   ├── api-router.js      # Request routing
│   └── cors-handler.js    # CORS management
```

#### 2. Storage Schema
```
# D1 Database Tables
├── users                 # User account information
├── sessions              # Active user sessions
├── routes                # Processed route metadata
├── user_preferences      # Privacy settings and data retention choices
└── aggregation_jobs      # Processing queue

# R2 Storage Structure
├── gpx-files/            # Original GPX files (optional storage)
├── processed-routes/     # Aggregated GPX outputs (optional storage)
├── user-exports/         # Generated GPX files for download
└── cache/               # Temporary processing files

# Workers KV
├── strava-tokens/       # OAuth tokens (encrypted)
├── app-config/          # Application settings
├── privacy-policies/    # Versioned privacy policy documents
└── rate-limits/         # API usage tracking

# Local Storage (Browser)
├── aggregated-routes/   # Primary storage for user's aggregated routes
├── export-history/      # Download history and metadata
└── user-preferences/    # Privacy choices and app settings
```

## User Experience Flow

### 1. Authentication
1. User visits RouteCoinMe web application
2. Clicks "Connect with Strava"
3. Redirected to Strava OAuth consent screen
4. Returns with authorization code
5. Backend exchanges code for access token
6. User gains access to main dashboard

### 2. Route Selection
1. Application displays available Strava activities
2. User selects multiple GPX files/activities
3. Preview of selected routes shown on map
4. User confirms selection

### 3. Aggregation Configuration
1. User chooses aggregation method:
   - Distance-based
   - Ride time
   - Real-time (with granularity selection)
2. Sets parameters for chosen method
3. Previews aggregation strategy

### 4. Processing
1. Backend processes GPX files using Cloudflare Workers
2. Applies coordinate manipulation for contiguity
3. Stores processed route in R2
4. Returns processing status to frontend

### 5. Visualization
1. 3D visualization loads with processed route
2. User can rotate, zoom, and explore the route
3. Elevation profile clearly visible with filled area
4. Optional route animation playback

### 6. Export & Save
1. User reviews the aggregated route
2. Adds custom name and description
3. Chooses storage option (local browser storage or cloud sync)
4. Downloads GPX file for external use
5. Route saved to personal library for future access

### 7. Route Management
1. Access route history from main dashboard
2. Browse previously aggregated routes with metadata
3. Re-download or share existing routes
4. Delete routes from personal library
5. Export entire route collection

## Privacy & Data Management Features

### Data Storage Options
- **Local-First Approach**: Primary storage in browser local storage
- **Optional Cloud Sync**: User can choose to sync routes across devices via R2
- **Minimal Server Storage**: Only store essential data with user consent

### Privacy Controls
- **Granular Permissions**: Choose what data to store and where
- **Data Transparency**: Clear visibility into all stored information
- **Easy Deletion**: One-click removal of all associated data
- **Export Everything**: Download complete data archive

### Compliance Features
- **Privacy Policy**: Comprehensive, easy-to-understand data practices
- **Cookie Consent**: GDPR-compliant consent management
- **Right to be Forgotten**: Complete data deletion on user request
- **Data Portability**: Export user data in standard formats

## Development Phases

### Phase 1: Foundation (Weeks 1-2)
- Set up Cloudflare Workers environment
- Implement Strava OAuth integration
- Create basic GPX parsing functionality
- Develop simple 2D route visualization

### Phase 2: Core Aggregation (Weeks 3-4)
- Implement distance-based aggregation
- Add ride time aggregation
- Develop coordinate manipulation algorithms
- Create real-time aggregation with granularity options
- Build GPX export functionality

### Phase 3: 3D Visualization (Weeks 5-6)
- Integrate D3.js and Three.js for 3D rendering
- Implement interactive controls (pan, zoom, rotate)
- Add elevation area filling
- Optimize rendering performance
- Create route history and management UI

### Phase 4: Privacy & Data Management (Week 7)
- Implement local storage for aggregated routes
- Create privacy policy and consent management
- Build data deletion functionality
- Add optional cloud synchronization
- Develop data export features

### Phase 5: Polish & Performance (Week 8)
- Enhance UI/UX with modern design
- Implement route animation features
- Add data caching and optimization
- Comprehensive testing and bug fixes

### Phase 6: Deployment & Monitoring (Week 9)
- Production deployment on Cloudflare
- Performance monitoring setup
- User analytics integration
- Documentation completion
- Privacy compliance audit

## Technical Considerations

### Performance Optimization
- **Client-side caching**: Store processed routes locally
- **Progressive loading**: Stream large GPX datasets
- **WebGL acceleration**: Leverage GPU for 3D rendering
- **CDN optimization**: Use Cloudflare's global network

### Security Measures
- **OAuth token encryption**: Secure storage of Strava tokens
- **Rate limiting**: Prevent API abuse
- **Input validation**: Sanitize all GPX data
- **CORS configuration**: Restrict cross-origin requests
- **Data encryption**: Encrypt sensitive data in local storage and cloud storage
- **Secure deletion**: Cryptographically secure data wiping

### Privacy Compliance
- **GDPR Compliance**: Full compliance with European privacy regulations
- **CCPA Compliance**: California Consumer Privacy Act adherence
- **Minimal Data Collection**: Collect only necessary data with explicit consent
- **Transparent Practices**: Clear communication about data usage
- **User Rights**: Easy access to view, export, and delete personal data

### Scalability Planning
- **Serverless architecture**: Auto-scaling with Cloudflare Workers
- **Database optimization**: Efficient queries with D1
- **Storage management**: Automated cleanup of old files
- **Monitoring**: Real-time performance tracking

## Risk Mitigation

### Technical Risks
- **Strava API changes**: Implement robust error handling and API versioning
- **Large file processing**: Implement streaming and chunking strategies
- **3D rendering performance**: Fallback to 2D view for low-end devices
- **Browser compatibility**: Progressive enhancement approach

### Business Risks
- **API rate limits**: Implement intelligent caching and batching
- **User adoption**: Focus on intuitive UX and clear value proposition
- **Data privacy**: Transparent data handling policies and compliance
- **Privacy Regulations**: Stay current with evolving privacy laws
- **User Trust**: Maintain transparency and control over personal data

## Success Metrics

### User Engagement
- Number of routes processed per user
- Time spent in 3D visualization
- Return user rate
- Route sharing frequency
- GPX export usage
- Route library utilization

### Privacy & Trust Metrics
- Privacy policy acceptance rate
- Data deletion requests
- Cloud sync adoption rate
- User retention after privacy controls introduction

### Technical Performance
- Average processing time per GPX file
- 3D rendering frame rate
- API response times
- Error rates and user satisfaction

## Future Enhancements

### Advanced Features
- **Multi-user collaboration**: Shared route planning
- **Social sharing**: Export to social media platforms
- **Mobile optimization**: Responsive design for tablets and phones
- **Advanced analytics**: Route statistics and insights
- **Offline Mode**: Full functionality without internet connection
- **Route Comparison**: Compare multiple aggregated routes side-by-side
- **GPX Validation**: Advanced GPX file error checking and repair

### Integration Opportunities
- **Additional GPS platforms**: Garmin Connect, Polar Flow
- **Mapping services**: Integration with Google Maps, Mapbox
- **Weather data**: Historical weather overlay
- **Training analysis**: Performance metrics integration

## Conclusion

RouteCoinMe represents a comprehensive solution for GPS route aggregation and visualization. By leveraging modern web technologies, Cloudflare's infrastructure, and intuitive 3D visualization, the application will provide users with an unprecedented way to view and analyze their cycling adventures. The phased development approach ensures systematic progress while maintaining focus on user experience and technical excellence.
