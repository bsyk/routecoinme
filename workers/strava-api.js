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
        id: `strava_${activity.id}`,
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
        const { startDate, endDate, activityTypes } = body;

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

        // Fetch all activities in the date range (paginated)
        const allActivities = [];
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

            allActivities.push(...pageActivities);
            
            if (pageActivities.length < perPage) {
                break; // Last page
            }

            page++;
        }

        console.log(`✅ Found ${allActivities.length} activities in date range`);

        // Filter by activity sport_type if specified
        let filteredActivities = allActivities;
        if (activityTypes && activityTypes.length > 0) {
            filteredActivities = allActivities.filter(activity => 
                activityTypes.includes(activity.sport_type)
            );
            console.log(`✅ Filtered to ${filteredActivities.length} activities matching sport types`);
        }

        // Import each activity (fetch streams and convert to route)
        const routes = [];
        const errors = [];

        for (const activity of filteredActivities) {
            try {
                console.log(`📥 Importing activity ${activity.id}: ${activity.name}`);
                
                // Fetch streams for this activity
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
                    errors.push({
                        activityId: activity.id,
                        name: activity.name,
                        error: 'Failed to fetch GPS data'
                    });
                    continue;
                }

                const streams = await streamsResponse.json();
                const route = convertStravaActivityToRoute(activity, streams);
                routes.push(route);

            } catch (error) {
                console.error(`❌ Error importing activity ${activity.id}:`, error);
                errors.push({
                    activityId: activity.id,
                    name: activity.name,
                    error: error.message
                });
            }
        }

        console.log(`✅ Bulk import complete: ${routes.length} routes imported, ${errors.length} errors`);

        return new Response(JSON.stringify({
            success: true,
            routes: routes,
            errors: errors,
            summary: {
                total: filteredActivities.length,
                imported: routes.length,
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
