// Cloudflare Worker for RouteCoinMe Strava Integration
// Handles server-side OAuth flow and API proxying for Strava
// 
// IMPORTANT: Set these environment variables:
//   - STRAVA_CLIENT_ID: Your Strava application client ID
//   - STRAVA_CLIENT_SECRET: Your Strava application client secret
// 
// Local dev: Use .env file (automatically loaded by Vite)
// Production: Use Cloudflare secrets (npx wrangler secret put <NAME>)
//
// Security features:
//   - HTTP-only cookies for token storage (not accessible to JavaScript)
//   - Server-side token exchange (client secret never exposed)
//   - Stateless processing (no user data stored on server)

// CORS headers for browser compatibility
const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, X-Strava-Token',
};

export default {
    async fetch(request, env, ctx) {

        // Handle CORS preflight requests
        if (request.method === 'OPTIONS') {
            return new Response(null, {
                status: 200,
                headers: corsHeaders,
            });
        }

        try {
            const url = new URL(request.url);
            console.log(`🔗 Processing request: ${request.method} ${url.pathname}`);

            // --- Authentication Endpoints ---
            if (url.pathname.startsWith('/api/auth/')) {
                if (url.pathname === '/api/auth/login') {
                    return await handleAuthLogin(request, env);
                }
                if (url.pathname === '/api/auth/callback') {
                    return await handleAuthCallback(request, env);
                }
                if (url.pathname === '/api/auth/status') {
                    return await handleAuthStatus(request, env);
                }
                if (url.pathname === '/api/auth/logout') {
                    return await handleAuthLogout(request, env);
                }
            }
            
            // Strava API requests
            if (url.pathname.startsWith('/api/strava/')) {
                const checkToken = checkStravaToken(request);
                if (!checkToken.authToken) {
                    return checkToken;
                }

                if (url.pathname === '/api/strava/activities') {
                    return await getActivities(checkToken.authToken, url.searchParams);
                }
                if (url.pathname.startsWith('/api/strava/import-activity/')) {
                    const importActivityId = url.pathname.split('/')[4];
                    return await importActivityAsRoute(checkToken.authToken, importActivityId);
                }
                if (url.pathname === '/api/strava/bulk-import' && request.method === 'POST') {
                    return await bulkImportActivities(request, checkToken.authToken);
                }
                if (url.pathname === '/api/strava/year-coin') {
                    return await createYearCoin(checkToken.authToken, url.searchParams);
                }
            }

            // 404 for unknown paths
            return new Response('Not Found', {
                status: 404,
                headers: corsHeaders,
            });

        } catch (error) {
            console.error('❌ Worker error:', error);
            return new Response(JSON.stringify({
                error: 'Internal server error',
                message: error.message
            }), {
                status: 500,
                headers: {
                    'Content-Type': 'application/json',
                    ...corsHeaders,
                },
            });
        }
    },
};

// --- Utility Functions ---
const COOKIE_NAME = 'rcm_strava_token';
function parseCookies(request) {
    const cookieHeader = request.headers.get('Cookie') || '';
    return Object.fromEntries(cookieHeader.split(/; */).filter(Boolean).map(c => {
        const idx = c.indexOf('=');
        return [decodeURIComponent(c.substring(0, idx)), decodeURIComponent(c.substring(idx + 1))];
    }));
}
function buildSetCookie(name, value, opts = {}) {
    const parts = [`${name}=${value}`];
    if (opts.maxAge !== undefined) parts.push(`Max-Age=${opts.maxAge}`);
    if (opts.path) parts.push(`Path=${opts.path}`); else parts.push('Path=/');
    if (opts.httpOnly !== false) parts.push('HttpOnly');
    if (opts.secure) parts.push('Secure');
    parts.push('SameSite=Lax');
    return parts.join('; ');
}
function getAuthToken(request) {
    const cookies = parseCookies(request);
    return request.headers.get('X-Strava-Token') || cookies[COOKIE_NAME] || null;
}
function isHttps(request) {
    const url = new URL(request.url);
    return url.protocol === 'https:';
}

// --- Auth Handlers ---
async function handleAuthLogin(request, env) {
    console.log('🔐 Starting Strava OAuth login');
    const clientId = env.STRAVA_CLIENT_ID;
    if (!clientId) {
        return jsonResponse({ error: 'Server misconfiguration', message: 'Missing STRAVA_CLIENT_ID' }, 500);
    }
    const url = new URL(request.url);
    const origin = `${url.protocol}//${url.host}`;
    const redirectUri = encodeURIComponent(`${origin}/api/auth/callback`);
    const scope = 'read,activity:read,activity:read_all';
    const authUrl = `https://www.strava.com/oauth/authorize?client_id=${clientId}&response_type=code&redirect_uri=${redirectUri}&approval_prompt=auto&scope=${scope}`;
    return new Response(null, { status: 302, headers: { Location: authUrl, ...corsHeaders } });
}

async function handleAuthCallback(request, env) {
    console.log('🔐 Handling Strava OAuth callback');
    const clientId = env.STRAVA_CLIENT_ID;
    const clientSecret = env.STRAVA_CLIENT_SECRET;
    if (!clientId || !clientSecret) {
        return jsonResponse({ error: 'Server misconfiguration', message: 'Missing Strava credentials' }, 500);
    }
    const url = new URL(request.url);
    const code = url.searchParams.get('code');
    const error = url.searchParams.get('error');
    if (error) {
        console.warn('⚠️ OAuth denied by user');
        return jsonResponse({ error: 'Access denied' }, 400);
    }
    if (!code) {
        return jsonResponse({ error: 'Missing code' }, 400);
    }
    // Exchange code for token
    const tokenResp = await fetch('https://www.strava.com/oauth/token', {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded', 'Accept': 'application/json' },
        body: new URLSearchParams({
            client_id: clientId,
            client_secret: clientSecret,
            code,
            grant_type: 'authorization_code'
        })
    });
    if (!tokenResp.ok) {
        const body = await tokenResp.text();
        console.error('❌ Token exchange failed', tokenResp.status, body);
        return jsonResponse({ error: 'Token exchange failed', status: tokenResp.status }, 500);
    }
    const tokenData = await tokenResp.json();
    const accessToken = tokenData.access_token;
    
    if (!accessToken) {
        return jsonResponse({ error: 'No access token returned' }, 500);
    }
    const cookieSecure = isHttps(request);
    const accessCookie = buildSetCookie(COOKIE_NAME, encodeURIComponent(accessToken), { maxAge: 21600, secure: cookieSecure }); // 6h
    const origin = `${url.protocol}//${url.host}`;
    // Redirect to UI callback page where frontend will call /api/auth/status
    return new Response(null, {
        status: 302,
        headers: {
            Location: `${origin}/auth/callback`,
            'Set-Cookie': accessCookie,
            ...corsHeaders
        }
    });
}

async function handleAuthStatus(request, env) {
    const token = getAuthToken(request);
    if (!token) {
        return jsonResponse({ authenticated: false }, 401);
    }
    try {
        // Verify token by fetching athlete
        const resp = await fetch('https://www.strava.com/api/v3/athlete', {
            headers: { Authorization: `Bearer ${decodeURIComponent(token)}`, Accept: 'application/json' }
        });
        if (!resp.ok) {
            console.warn('⚠️ Token invalid');
            return jsonResponse({ authenticated: false }, 401);
        }
        const athlete = await resp.json();
        return jsonResponse({ authenticated: true, athlete }, 200);
    } catch (e) {
        console.error('❌ Auth status check failed', e);
        return jsonResponse({ authenticated: false }, 401);
    }
}

async function handleAuthLogout(request, env) {
    console.log('👋 Logging out');
    const cookieSecure = isHttps(request);
    const expiredAccess = buildSetCookie(COOKIE_NAME, '', { maxAge: 0, secure: cookieSecure });
    return new Response(JSON.stringify({ success: true }), {
        status: 200,
        headers: {
            'Content-Type': 'application/json',
            'Set-Cookie': expiredAccess,
            ...corsHeaders
        }
    });
}

function jsonResponse(obj, status) {
    return new Response(JSON.stringify(obj), { status, headers: { 'Content-Type': 'application/json', ...corsHeaders } });
}

// Handle Strava API requests
function checkStravaToken(request) {
    // Extract and validate auth token (now supports cookie fallback)
    const authTokenRaw = getAuthToken(request);
    const authToken = authTokenRaw ? decodeURIComponent(authTokenRaw) : null;

    if (!authToken) {
        return new Response(JSON.stringify({
            error: 'Authentication required',
            message: 'Valid session token required'
        }), {
            status: 401,
            headers: {
                'Content-Type': 'application/json',
                ...corsHeaders,
            },
        });
    }

    return { authToken }; // Token is valid, proceed
}

// Get activities list
async function getActivities(authToken, searchParams) {
    console.log('📊 Fetching activities list');

    try {
        // Build Strava API URL with query parameters
        const stravaUrl = new URL('https://www.strava.com/api/v3/athlete/activities');

        // Copy allowed parameters
        const allowedParams = ['page', 'per_page', 'before', 'after'];
        allowedParams.forEach(param => {
            if (searchParams.has(param)) {
                stravaUrl.searchParams.set(param, searchParams.get(param));
            }
        });

        const response = await fetch(stravaUrl.toString(), {
            method: 'GET',
            headers: {
                'Authorization': `Bearer ${authToken}`,
                'Accept': 'application/json',
            },
        });

        if (!response.ok) {
            const errorData = await response.text();
            console.error('❌ Strava API error:', response.status, errorData);

            // FIXED: ensure proper parentheses placement
            return new Response(
                JSON.stringify({
                    error: 'Strava API error',
                    status: response.status,
                    message: 'Failed to fetch activities'
                }),
                {
                    status: response.status,
                    headers: {
                        'Content-Type': 'application/json',
                        ...corsHeaders,
                    },
                }
            );
        }

        const activitiesData = await response.json();
        console.log(`✅ Fetched ${activitiesData.length} activities`);

        return new Response(JSON.stringify(activitiesData), {
            status: 200,
            headers: {
                'Content-Type': 'application/json',
                'Cache-Control': 'private, max-age=1800', // Cache in browser only for 30 minutes
                ...corsHeaders,
            },
        });

    } catch (error) {
        console.error('❌ Error fetching activities:', error);
        return new Response(
            JSON.stringify({
                error: 'Network error',
                message: 'Failed to connect to Strava API'
            }),
            {
                status: 500,
                headers: {
                    'Content-Type': 'application/json',
                    ...corsHeaders,
                },
            }
        );
    }
}

// Import activity as route (fetch activity + streams, convert to route format)
async function importActivityAsRoute(authToken, activityId) {
    console.log(`📥 Importing activity ${activityId} as route`);

    try {
        // Fetch both activity details and streams in parallel
        const [activityResponse, streamsResponse] = await Promise.all([
            fetch(`https://www.strava.com/api/v3/activities/${activityId}`, {
                method: 'GET',
                headers: {
                    'Authorization': `Bearer ${authToken}`,
                    'Accept': 'application/json',
                },
            }),
            fetch(`https://www.strava.com/api/v3/activities/${activityId}/streams?keys=latlng,altitude,time&key_by_type=true`, {
                method: 'GET',
                headers: {
                    'Authorization': `Bearer ${authToken}`,
                    'Accept': 'application/json',
                },
            })
        ]);

        if (!activityResponse.ok) {
            const errorData = await activityResponse.text();
            console.error('❌ Failed to fetch activity:', activityResponse.status, errorData);
            return new Response(JSON.stringify({
                error: 'Strava API error',
                status: activityResponse.status,
                message: `Failed to fetch activity ${activityId}`
            }), {
                status: activityResponse.status,
                headers: {
                    'Content-Type': 'application/json',
                    ...corsHeaders,
                },
            });
        }

        if (!streamsResponse.ok) {
            const errorData = await streamsResponse.text();
            console.error('❌ Failed to fetch streams:', streamsResponse.status, errorData);
            return new Response(JSON.stringify({
                error: 'Strava API error',
                status: streamsResponse.status,
                message: `Failed to fetch GPS data for activity ${activityId}`
            }), {
                status: streamsResponse.status,
                headers: {
                    'Content-Type': 'application/json',
                    ...corsHeaders,
                },
            });
        }

        const activity = await activityResponse.json();
        const streams = await streamsResponse.json();

        // Convert to route format
        const route = convertStravaActivityToRoute(activity, streams);

        console.log(`✅ Activity ${activityId} converted to route successfully`);

        return new Response(JSON.stringify(route), {
            status: 200,
            headers: {
                'Content-Type': 'application/json',
                ...corsHeaders,
            },
        });

    } catch (error) {
        console.error('❌ Error importing activity as route:', error);
        return new Response(JSON.stringify({
            error: 'Import error',
            message: error.message || 'Failed to import activity'
        }), {
            status: 500,
            headers: {
                'Content-Type': 'application/json',
                ...corsHeaders,
            },
        });
    }
}

// Convert Strava activity and streams to route format
function convertStravaActivityToRoute(activity, streams) {
    const { latlng, altitude, time } = streams;
    
    if (!latlng || !latlng.data) {
        throw new Error('No GPS data available for this activity');
    }

    // Map GPS points with elevation and timestamps
    const points = latlng.data.map((coord, index) => ({
        lat: coord[0],
        lon: coord[1],
        elevation: altitude?.data ? altitude.data[index] || 0 : 0,
        timestamp: time?.data ? new Date(activity.start_date).getTime() + (time.data[index] * 1000) : null
    }));

    // Return route in the format expected by the client
    return {
        id: `strava_${activity.id}`, // Use Strava ID as primary key to prevent duplicates
        filename: `${activity.name}.gpx`,
        name: activity.name,
        type: activity.sport_type || activity.type, // Use sport_type, fallback to type for compatibility
        points: points,
        distance: activity.distance / 1000, // Convert meters to km
        elevationGain: activity.total_elevation_gain || 0,
        duration: activity.elapsed_time,
        startTime: new Date(activity.start_date).toISOString(),
        source: 'strava',
        metadata: {
            stravaId: activity.id,
            imported: new Date().toISOString()
        }
    };
}

// Bulk import activities between two dates with optional type filtering
async function bulkImportActivities(request, authToken) {
    console.log('📥 Starting bulk import');

    try {
        const body = await request.json();
        const { startDate, endDate, activityTypes, existingIds = [] } = body;

        if (!startDate || !endDate) {
            return new Response(JSON.stringify({
                error: 'Missing parameters',
                message: 'startDate and endDate are required'
            }), {
                status: 400,
                headers: {
                    'Content-Type': 'application/json',
                    ...corsHeaders,
                },
            });
        }

        // Convert dates to Unix timestamps (Strava expects seconds)
        const afterTimestamp = Math.floor(new Date(startDate).getTime() / 1000);
        const beforeTimestamp = Math.floor(new Date(endDate).getTime() / 1000);

        console.log(`📅 Fetching activities from ${startDate} to ${endDate}`);
        if (activityTypes && activityTypes.length > 0) {
            console.log(`🎯 Filtering by types: ${activityTypes.join(', ')}`);
        }
        if (existingIds.length > 0) {
            console.log(`⏭️  Skipping ${existingIds.length} already-imported activities`);
        }

        // Convert existing IDs to a Set for O(1) lookup (remove 'strava_' prefix)
        const existingStravaIds = new Set(
            existingIds
                .filter(id => id.startsWith('strava_'))
                .map(id => id.replace('strava_', ''))
        );

        // Fetch and process activities with parallel stream fetching
        const routes = [];
        const errors = [];
        const skipped = [];
        const streamPromises = [];
        
        let page = 1;
        const perPage = 200; // Max allowed by Strava

        while (true) {
            const stravaUrl = new URL('https://www.strava.com/api/v3/athlete/activities');
            stravaUrl.searchParams.set('after', afterTimestamp.toString());
            stravaUrl.searchParams.set('before', beforeTimestamp.toString());
            stravaUrl.searchParams.set('page', page.toString());
            stravaUrl.searchParams.set('per_page', perPage.toString());

            const response = await fetch(stravaUrl.toString(), {
                method: 'GET',
                headers: {
                    'Authorization': `Bearer ${authToken}`,
                    'Accept': 'application/json',
                },
            });

            if (!response.ok) {
                const errorData = await response.text();
                console.error('❌ Failed to fetch activities:', response.status, errorData);
                return new Response(JSON.stringify({
                    error: 'Strava API error',
                    status: response.status,
                    message: 'Failed to fetch activities'
                }), {
                    status: response.status,
                    headers: {
                        'Content-Type': 'application/json',
                        ...corsHeaders,
                    },
                });
            }

            const pageActivities = await response.json();
            
            if (pageActivities.length === 0) {
                break; // No more activities
            }

            // Filter and kick off parallel stream fetches for this page
            for (const activity of pageActivities) {
                // Skip if already imported
                if (existingStravaIds.has(activity.id.toString())) {
                    skipped.push({
                        activityId: activity.id,
                        name: activity.name,
                        reason: 'Already imported'
                    });
                    continue;
                }

                // Filter by activity sport_type if specified
                if (activityTypes && activityTypes.length > 0 && !activityTypes.includes(activity.sport_type)) {
                    continue;
                }

                // Kick off parallel stream fetch
                const streamPromise = fetchActivityStreams(activity, authToken)
                    .then(result => {
                        if (result.success) {
                            routes.push(result.route);
                        } else {
                            errors.push(result.error);
                        }
                    })
                    .catch(error => {
                        console.error(`❌ Unexpected error for activity ${activity.id}:`, error);
                        errors.push({
                            activityId: activity.id,
                            name: activity.name,
                            error: error.message || 'Unexpected error'
                        });
                    });

                streamPromises.push(streamPromise);
            }
            
            if (pageActivities.length < perPage) {
                break; // Last page
            }

            page++;
        }

        // Wait for all parallel stream fetches to complete
        console.log(`⏳ Waiting for ${streamPromises.length} parallel stream fetches to complete...`);
        await Promise.all(streamPromises);

        console.log(`✅ Bulk import complete: ${routes.length} routes imported, ${skipped.length} skipped, ${errors.length} errors`);

        return new Response(JSON.stringify({
            success: true,
            routes: routes,
            errors: errors,
            skipped: skipped,
            summary: {
                total: routes.length + skipped.length + errors.length,
                imported: routes.length,
                skipped: skipped.length,
                failed: errors.length
            }
        }), {
            status: 200,
            headers: {
                'Content-Type': 'application/json',
                ...corsHeaders,
            },
        });

    } catch (error) {
        console.error('❌ Bulk import error:', error);
        return new Response(JSON.stringify({
            error: 'Bulk import error',
            message: error.message || 'Failed to import activities'
        }), {
            status: 500,
            headers: {
                'Content-Type': 'application/json',
                ...corsHeaders,
            },
        });
    }
}

// Helper function to fetch activity streams and convert to route
async function fetchActivityStreams(activity, authToken) {
    try {
        console.log(`📥 Fetching streams for activity ${activity.id}: ${activity.name}`);
        
        const streamsResponse = await fetch(
            `https://www.strava.com/api/v3/activities/${activity.id}/streams?keys=latlng,altitude,time&key_by_type=true`,
            {
                method: 'GET',
                headers: {
                    'Authorization': `Bearer ${authToken}`,
                    'Accept': 'application/json',
                },
            }
        );

        if (!streamsResponse.ok) {
            console.warn(`⚠️ Failed to fetch streams for activity ${activity.id}`);
            return {
                success: false,
                error: {
                    activityId: activity.id,
                    name: activity.name,
                    error: 'Failed to fetch GPS data'
                }
            };
        }

        const streams = await streamsResponse.json();
        const route = convertStravaActivityToRoute(activity, streams);
        
        return {
            success: true,
            route: route
        };

    } catch (error) {
        console.error(`❌ Error fetching streams for activity ${activity.id}:`, error);
        return {
            success: false,
            error: {
                activityId: activity.id,
                name: activity.name,
                error: error.message || 'Failed to process activity'
            }
        };
    }
}

// Create a Year Coin by aggregating all cycling activities for a given year
async function createYearCoin(authToken, searchParams) {
    console.log('📅 Creating Year Coin');

    try {
        const year = searchParams.get('year') || new Date().getFullYear().toString();

        // Default cycling activity types (same as Bulk Import)
        const defaultActivityTypes = [
            'Ride',
            'VirtualRide',
            'EBikeRide',
            'GravelRide',
            'MountainBikeRide',
            'EMountainBikeRide'
        ];

        // Parse activity types from query params (comma-separated) or use defaults
        const typesParam = searchParams.get('types');
        const activityTypes = typesParam
            ? typesParam.split(',').map(t => t.trim()).filter(Boolean)
            : defaultActivityTypes;

        // Calculate year boundaries
        const startDate = new Date(`${year}-01-01T00:00:00Z`);
        const endDate = new Date(`${year}-12-31T23:59:59Z`);

        const afterTimestamp = Math.floor(startDate.getTime() / 1000);
        const beforeTimestamp = Math.floor(endDate.getTime() / 1000);

        console.log(`📅 Fetching activities for ${year}`);
        console.log(`🚴 Activity types: ${activityTypes.join(', ')}`);
        console.log(`📅 Date range: ${startDate.toISOString()} to ${endDate.toISOString()}`);

        // Fetch all activities for the year
        const allActivities = [];
        let page = 1;
        const perPage = 200;

        while (true) {
            const stravaUrl = new URL('https://www.strava.com/api/v3/athlete/activities');
            stravaUrl.searchParams.set('after', afterTimestamp.toString());
            stravaUrl.searchParams.set('before', beforeTimestamp.toString());
            stravaUrl.searchParams.set('page', page.toString());
            stravaUrl.searchParams.set('per_page', perPage.toString());

            const response = await fetch(stravaUrl.toString(), {
                method: 'GET',
                headers: {
                    'Authorization': `Bearer ${authToken}`,
                    'Accept': 'application/json',
                },
            });

            if (!response.ok) {
                throw new Error(`Failed to fetch activities: ${response.statusText}`);
            }

            const pageActivities = await response.json();

            if (pageActivities.length === 0) {
                break;
            }

            // Filter by activity types (check both sport_type and type for compatibility)
            const filteredActivities = pageActivities.filter(activity =>
                activityTypes.includes(activity.sport_type) || activityTypes.includes(activity.type)
            );

            allActivities.push(...filteredActivities);

            if (pageActivities.length < perPage) {
                break;
            }

            page++;
        }

        if (allActivities.length === 0) {
            return new Response(JSON.stringify({
                error: 'No activities found',
                message: `No cycling activities found for ${year}`
            }), {
                status: 404,
                headers: {
                    'Content-Type': 'application/json',
                    ...corsHeaders,
                },
            });
        }

        console.log(`✅ Found ${allActivities.length} cycling activities for ${year}`);

        // Sort activities by date (oldest first)
        allActivities.sort((a, b) =>
            new Date(a.start_date).getTime() - new Date(b.start_date).getTime()
        );

        // Fetch streams for all activities in parallel
        console.log(`📥 Fetching GPS data for ${allActivities.length} activities...`);
        const routePromises = allActivities.map(activity => fetchActivityStreams(activity, authToken));
        const routeResults = await Promise.all(routePromises);

        // Filter successful routes
        const routes = routeResults
            .filter(result => result.success)
            .map(result => result.route);

        if (routes.length === 0) {
            return new Response(JSON.stringify({
                error: 'No GPS data found',
                message: 'Could not fetch GPS data for any activities'
            }), {
                status: 500,
                headers: {
                    'Content-Type': 'application/json',
                    ...corsHeaders,
                },
            });
        }

        console.log(`✅ Successfully fetched GPS data for ${routes.length} activities`);

        // Aggregate routes: recenter to first activity's center, connect end-to-end
        console.log(`🔗 Aggregating ${routes.length} routes...`);
        const aggregatedRoute = aggregateRoutesForYearCoin(routes);

        // Resample to 10,000 points
        console.log(`🔄 Resampling to 10,000 points...`);
        const resampledRoute = resampleRoute(aggregatedRoute, 10000);

        console.log(`✅ Year Coin created successfully:`);
        console.log(`   Points: ${resampledRoute.points.length}`);
        console.log(`   Distance: ${resampledRoute.distance.toFixed(2)}km`);
        console.log(`   Elevation Gain: ${resampledRoute.elevationGain.toFixed(0)}m`);

        return new Response(JSON.stringify({
            success: true,
            route: resampledRoute,
            metadata: {
                year: year,
                activityTypes: activityTypes,
                totalActivities: routes.length,
                totalDistance: resampledRoute.distance,
                totalElevationGain: resampledRoute.elevationGain,
                startDate: routes[0].startTime,
                endDate: routes[routes.length - 1].startTime
            }
        }), {
            status: 200,
            headers: {
                'Content-Type': 'application/json',
                ...corsHeaders,
            },
        });

    } catch (error) {
        console.error('❌ Year Coin creation error:', error);
        return new Response(JSON.stringify({
            error: 'Year Coin creation error',
            message: error.message || 'Failed to create Year Coin'
        }), {
            status: 500,
            headers: {
                'Content-Type': 'application/json',
                ...corsHeaders,
            },
        });
    }
}

// Route manipulation helpers for Year Coin

function aggregateRoutesForYearCoin(routes) {
    if (routes.length === 0) {
        throw new Error('No routes to aggregate');
    }

    if (routes.length === 1) {
        return { ...routes[0] };
    }

    console.log(`🎯 Getting start point of first route...`);
    const firstRoute = routes[0];
    const anchorPoint = firstRoute.points[0]; // Use the start point of the first route

    console.log(`📍 Anchor point (start of first route): (${anchorPoint.lat.toFixed(6)}, ${anchorPoint.lon.toFixed(6)}, ${(anchorPoint.elevation || 0).toFixed(1)}m)`);

    // Process all routes - anchor each route's start to the same point
    const processedRoutes = routes.map((route, index) => {
        console.log(`🔄 Processing route ${index + 1}/${routes.length}: ${route.name}`);

        // Anchor this route's start point to the anchor point
        const anchoredRoute = anchorRouteToPoint(route, anchorPoint);

        return anchoredRoute;
    });

    // Connect routes with fictional lines back to anchor point
    console.log(`🔗 Connecting ${processedRoutes.length} routes with return lines to anchor...`);
    let aggregatedRoute = processedRoutes[0];

    for (let i = 1; i < processedRoutes.length; i++) {
        aggregatedRoute = connectTwoRoutesWithAnchor(aggregatedRoute, processedRoutes[i], anchorPoint);
    }

    // Update metadata
    aggregatedRoute.filename = `${routes.length}_Routes_YearCoin.gpx`;
    aggregatedRoute.name = `${routes.length} Routes Year Coin`;
    aggregatedRoute.metadata = {
        ...aggregatedRoute.metadata,
        yearCoin: true,
        totalRoutes: routes.length,
        sourceRoutes: routes.map(r => ({
            id: r.id,
            name: r.name,
            distance: r.distance,
            elevationGain: r.elevationGain
        }))
    };

    console.log(`✅ Aggregated route: ${aggregatedRoute.points.length} points, ${aggregatedRoute.distance.toFixed(1)}km`);

    return aggregatedRoute;
}

function getRouteCenter(route) {
    const lats = route.points.map(p => p.lat);
    const lons = route.points.map(p => p.lon);

    const minLat = Math.min(...lats);
    const maxLat = Math.max(...lats);
    const minLon = Math.min(...lons);
    const maxLon = Math.max(...lons);

    return {
        lat: (minLat + maxLat) / 2,
        lon: (minLon + maxLon) / 2,
        elevation: route.points[0].elevation || 0
    };
}

function anchorRouteToPoint(route, anchorPoint) {
    // Relocate route so its start point matches the anchor point
    const currentStartPoint = route.points[0];

    const offsetLat = anchorPoint.lat - currentStartPoint.lat;
    const offsetLon = anchorPoint.lon - currentStartPoint.lon;
    const offsetElevation = (anchorPoint.elevation || 0) - (currentStartPoint.elevation || 0);

    return {
        ...route,
        points: route.points.map(point => ({
            ...point,
            lat: point.lat + offsetLat,
            lon: point.lon + offsetLon,
            elevation: (point.elevation || 0) + offsetElevation
        }))
    };
}

function connectTwoRoutesWithAnchor(firstRoute, secondRoute, anchorPoint) {
    const firstRouteEnd = firstRoute.points[firstRoute.points.length - 1];
    const secondRouteStart = secondRoute.points[0]; // This should be at the anchor point

    // Create a fictional straight line from the end of the first route back to the anchor point
    // (which is also the start of the second route)
    console.log(`🔗 Creating fictional return line from end of route back to anchor point`);

    // Create interpolated points for the connecting line (excluding endpoints to avoid duplication)
    const connectionPoints = createConnectionLine(firstRouteEnd, anchorPoint, 20);

    // Combine points: firstRoute + connectionLine + secondRoute
    const combinedPoints = [
        ...firstRoute.points,
        ...connectionPoints, // Middle points only (no endpoints)
        ...secondRoute.points
    ];

    // Calculate distance of the fictional connection line (for logging only - not added to total)
    const connectionDistance = calculateDistance(firstRouteEnd, anchorPoint);
    console.log(`📏 Fictional return line: ${connectionDistance.toFixed(1)}km (not included in total distance)`);

    return {
        id: firstRoute.id,
        filename: firstRoute.filename,
        name: firstRoute.name,
        points: combinedPoints,
        // Don't include fictional connection distance in the total - only count actual riding
        distance: (firstRoute.distance || 0) + (secondRoute.distance || 0),
        elevationGain: (firstRoute.elevationGain || 0) + (secondRoute.elevationGain || 0),
        duration: (firstRoute.duration || 0) + (secondRoute.duration || 0),
        startTime: firstRoute.startTime,
        metadata: {
            ...firstRoute.metadata
        }
    };
}

// Create a fictional straight line between two points with interpolated intermediate points
function createConnectionLine(startPoint, endPoint, numIntermediatePoints = 20) {
    const connectionPoints = [];

    // Create intermediate points (excluding the endpoints themselves)
    for (let i = 1; i <= numIntermediatePoints; i++) {
        const t = i / (numIntermediatePoints + 1); // Progress from start to end (0 to 1, excluding 0 and 1)

        const interpolatedPoint = {
            lat: startPoint.lat + (endPoint.lat - startPoint.lat) * t,
            lon: startPoint.lon + (endPoint.lon - startPoint.lon) * t,
            elevation: (startPoint.elevation || 0) + ((endPoint.elevation || 0) - (startPoint.elevation || 0)) * t,
            timestamp: startPoint.timestamp || endPoint.timestamp || null
        };

        connectionPoints.push(interpolatedPoint);
    }

    return connectionPoints;
}

// Calculate distance between two points using Haversine formula
function calculateDistance(point1, point2) {
    const R = 6371; // Earth's radius in kilometers
    const lat1 = point1.lat * Math.PI / 180;
    const lat2 = point2.lat * Math.PI / 180;
    const dLat = (point2.lat - point1.lat) * Math.PI / 180;
    const dLon = (point2.lon - point1.lon) * Math.PI / 180;

    const a = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
              Math.cos(lat1) * Math.cos(lat2) *
              Math.sin(dLon / 2) * Math.sin(dLon / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));

    return R * c; // Distance in kilometers
}

function resampleRoute(route, targetPointCount) {
    if (route.points.length === targetPointCount) {
        return route;
    }

    console.log(`🔄 Resampling from ${route.points.length} to ${targetPointCount} points`);

    const originalPoints = route.points;
    const n = originalPoints.length;

    if (n < 2) {
        return route;
    }

    if (targetPointCount < 2) {
        targetPointCount = 2;
    }

    const segmentCount = targetPointCount - 1;

    // Generate middle points through interpolation
    const resampledPoints = [originalPoints[0]]; // Start with first point

    for (let i = 1; i < targetPointCount - 1; i++) {
        const progress = i / segmentCount; // 0..1
        const sourcePosition = progress * (n - 1); // fractional index

        const lowerIndex = Math.floor(sourcePosition);
        const upperIndex = Math.min(Math.ceil(sourcePosition), n - 1);
        const t = sourcePosition - lowerIndex;

        const lowerPoint = originalPoints[lowerIndex];
        const upperPoint = originalPoints[upperIndex];

        // Interpolate
        const interpolatedPoint = {
            lat: lowerPoint.lat + (upperPoint.lat - lowerPoint.lat) * t,
            lon: lowerPoint.lon + (upperPoint.lon - lowerPoint.lon) * t,
            elevation: (lowerPoint.elevation || 0) + ((upperPoint.elevation || 0) - (lowerPoint.elevation || 0)) * t,
            timestamp: lowerPoint.timestamp || upperPoint.timestamp || null
        };

        resampledPoints.push(interpolatedPoint);
    }

    // Add last point
    resampledPoints.push(originalPoints[n - 1]);

    console.log(`✅ Resampled to ${resampledPoints.length} points`);

    return {
        ...route,
        points: resampledPoints
    };
}
