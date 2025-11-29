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

export default {
    async fetch(request, env, ctx) {
        // CORS headers for browser compatibility
        const corsHeaders = {
            'Access-Control-Allow-Origin': '*',
            'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
            'Access-Control-Allow-Headers': 'Content-Type, X-Strava-Token, X-Request-Timestamp',
        };

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
            if (url.pathname === '/api/auth/login') {
                return await handleAuthLogin(request, env, corsHeaders);
            }
            if (url.pathname === '/api/auth/callback') {
                return await handleAuthCallback(request, env, corsHeaders);
            }
            if (url.pathname === '/api/auth/status') {
                return await handleAuthStatus(request, env, corsHeaders);
            }
            if (url.pathname === '/api/auth/logout') {
                return await handleAuthLogout(request, env, corsHeaders);
            }

            // Route API requests
            if (url.pathname.startsWith('/api/strava/')) {
                return await handleStravaAPI(request, url, corsHeaders, env);
            }

            // Handle root path
            if (url.pathname === '/') {
                return new Response('RouteCoinMe Strava API Worker - Running', {
                    status: 200,
                    headers: {
                        'Content-Type': 'text/plain',
                        ...corsHeaders,
                    },
                });
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
async function handleAuthLogin(request, env, corsHeaders) {
    console.log('🔐 Starting Strava OAuth login');
    const clientId = env.STRAVA_CLIENT_ID;
    if (!clientId) {
        return jsonResponse({ error: 'Server misconfiguration', message: 'Missing STRAVA_CLIENT_ID' }, 500, corsHeaders);
    }
    const url = new URL(request.url);
    const origin = `${url.protocol}//${url.host}`;
    const redirectUri = encodeURIComponent(`${origin}/api/auth/callback`);
    const scope = 'read,activity:read,activity:read_all';
    const authUrl = `https://www.strava.com/oauth/authorize?client_id=${clientId}&response_type=code&redirect_uri=${redirectUri}&approval_prompt=auto&scope=${scope}`;
    return new Response(null, { status: 302, headers: { Location: authUrl, ...corsHeaders } });
}

async function handleAuthCallback(request, env, corsHeaders) {
    console.log('🔐 Handling Strava OAuth callback');
    const clientId = env.STRAVA_CLIENT_ID;
    const clientSecret = env.STRAVA_CLIENT_SECRET;
    if (!clientId || !clientSecret) {
        return jsonResponse({ error: 'Server misconfiguration', message: 'Missing Strava credentials' }, 500, corsHeaders);
    }
    const url = new URL(request.url);
    const code = url.searchParams.get('code');
    const error = url.searchParams.get('error');
    if (error) {
        console.warn('⚠️ OAuth denied by user');
        return jsonResponse({ error: 'Access denied' }, 400, corsHeaders);
    }
    if (!code) {
        return jsonResponse({ error: 'Missing code' }, 400, corsHeaders);
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
        return jsonResponse({ error: 'Token exchange failed', status: tokenResp.status }, 500, corsHeaders);
    }
    const tokenData = await tokenResp.json();
    const accessToken = tokenData.access_token;
    const athlete = tokenData.athlete;
    if (!accessToken) {
        return jsonResponse({ error: 'No access token returned' }, 500, corsHeaders);
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

async function handleAuthStatus(request, env, corsHeaders) {
    const token = getAuthToken(request);
    if (!token) {
        return jsonResponse({ authenticated: false }, 401, corsHeaders);
    }
    try {
        // Verify token by fetching athlete
        const resp = await fetch('https://www.strava.com/api/v3/athlete', {
            headers: { Authorization: `Bearer ${decodeURIComponent(token)}`, Accept: 'application/json' }
        });
        if (!resp.ok) {
            console.warn('⚠️ Token invalid');
            return jsonResponse({ authenticated: false }, 401, corsHeaders);
        }
        const athlete = await resp.json();
        return jsonResponse({ authenticated: true, athlete }, 200, corsHeaders);
    } catch (e) {
        console.error('❌ Auth status check failed', e);
        return jsonResponse({ authenticated: false }, 401, corsHeaders);
    }
}

async function handleAuthLogout(request, env, corsHeaders) {
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

function jsonResponse(obj, status, corsHeaders) {
    return new Response(JSON.stringify(obj), { status, headers: { 'Content-Type': 'application/json', ...corsHeaders } });
}

// Handle Strava API requests
async function handleStravaAPI(request, url, corsHeaders, env) {
    // Extract and validate auth token (now supports cookie fallback)
    const authTokenRaw = getAuthToken(request);
    const authToken = authTokenRaw ? decodeURIComponent(authTokenRaw) : null;
    const timestamp = request.headers.get('X-Request-Timestamp');

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

    // Validate timestamp (optional)
    if (timestamp) {
        const tokenAge = Date.now() - parseInt(timestamp);
        const maxAge = 5 * 60 * 1000; // 5 minutes
        if (tokenAge > maxAge) {
            return new Response(JSON.stringify({
                error: 'Token expired',
                message: 'Authentication token is too old'
            }), {
                status: 401,
                headers: {
                    'Content-Type': 'application/json',
                    ...corsHeaders,
                },
            });
        }
    }

    // Route to specific Strava API handlers
    const path = url.pathname.replace('/api/strava/', '');

    switch (true) {
        case path === 'athlete':
            return await getAthlete(authToken, corsHeaders);
        case path === 'activities':
            return await getActivities(authToken, url.searchParams, corsHeaders);
        case path.startsWith('activity/'):
            const activityId = path.split('/')[1];
            return await getActivity(authToken, activityId, corsHeaders);
        case path.startsWith('streams/'):
            const streamActivityId = path.split('/')[1];
            return await getActivityStreams(authToken, streamActivityId, url.searchParams, corsHeaders);
        default:
            return new Response(JSON.stringify({
                error: 'Unknown endpoint',
                message: `Endpoint ${path} not found`
            }), {
                status: 404,
                headers: {
                    'Content-Type': 'application/json',
                    ...corsHeaders,
                },
            });
    }
}

// Get athlete information
async function getAthlete(authToken, corsHeaders) {
    console.log('👤 Fetching athlete information');

    try {
        const response = await fetch('https://www.strava.com/api/v3/athlete', {
            method: 'GET',
            headers: {
                'Authorization': `Bearer ${authToken}`,
                'Accept': 'application/json',
            },
        });

        if (!response.ok) {
            const errorData = await response.text();
            console.error('❌ Strava API error:', response.status, errorData);

            return new Response(JSON.stringify({
                error: 'Strava API error',
                status: response.status,
                message: 'Failed to fetch athlete data'
            }), {
                status: response.status,
                headers: {
                    'Content-Type': 'application/json',
                    ...corsHeaders,
                },
            });
        }

        const athleteData = await response.json();
        console.log('✅ Athlete data fetched successfully');

        return new Response(JSON.stringify(athleteData), {
            status: 200,
            headers: {
                'Content-Type': 'application/json',
                ...corsHeaders,
            },
        });

    } catch (error) {
        console.error('❌ Error fetching athlete:', error);
        return new Response(JSON.stringify({
            error: 'Network error',
            message: 'Failed to connect to Strava API'
        }), {
            status: 500,
            headers: {
                'Content-Type': 'application/json',
                ...corsHeaders,
            },
        });
    }
}

// Get activities list
async function getActivities(authToken, searchParams, corsHeaders) {
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

// Get specific activity
async function getActivity(authToken, activityId, corsHeaders) {
    console.log(`📝 Fetching activity ${activityId}`);

    try {
        const response = await fetch(`https://www.strava.com/api/v3/activities/${activityId}`, {
            method: 'GET',
            headers: {
                'Authorization': `Bearer ${authToken}`,
                'Accept': 'application/json',
            },
        });

        if (!response.ok) {
            const errorData = await response.text();
            console.error('❌ Strava API error:', response.status, errorData);

            return new Response(JSON.stringify({
                error: 'Strava API error',
                status: response.status,
                message: `Failed to fetch activity ${activityId}`
            }), {
                status: response.status,
                headers: {
                    'Content-Type': 'application/json',
                    ...corsHeaders,
                },
            });
        }

        const activityData = await response.json();
        console.log(`✅ Activity ${activityId} fetched successfully`);

        return new Response(JSON.stringify(activityData), {
            status: 200,
            headers: {
                'Content-Type': 'application/json',
                ...corsHeaders,
            },
        });

    } catch (error) {
        console.error('❌ Error fetching activity:', error);
        return new Response(JSON.stringify({
            error: 'Network error',
            message: 'Failed to connect to Strava API'
        }), {
            status: 500,
            headers: {
                'Content-Type': 'application/json',
                ...corsHeaders,
            },
        });
    }
}

// Get activity streams (GPS data)
async function getActivityStreams(authToken, activityId, searchParams, corsHeaders) {
    console.log(`🗺️ Fetching streams for activity ${activityId}`);

    try {
        // Build Strava streams API URL
        const stravaUrl = new URL(`https://www.strava.com/api/v3/activities/${activityId}/streams`);

        // Set default stream types if not provided
        const keys = searchParams.get('keys') || 'latlng,altitude,time';
        const keyByType = searchParams.get('key_by_type') || 'true';

        stravaUrl.searchParams.set('keys', keys);
        stravaUrl.searchParams.set('key_by_type', keyByType);

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

            return new Response(JSON.stringify({
                error: 'Strava API error',
                status: response.status,
                message: `Failed to fetch streams for activity ${activityId}`
            }), {
                status: response.status,
                headers: {
                    'Content-Type': 'application/json',
                    ...corsHeaders,
                },
            });
        }

        const streamsData = await response.json();
        console.log(`✅ Streams for activity ${activityId} fetched successfully`);

        return new Response(JSON.stringify(streamsData), {
            status: 200,
            headers: {
                'Content-Type': 'application/json',
                ...corsHeaders,
            },
        });

    } catch (error) {
        console.error('❌ Error fetching streams:', error);
        return new Response(JSON.stringify({
            error: 'Network error',
            message: 'Failed to connect to Strava API'
        }), {
            status: 500,
            headers: {
                'Content-Type': 'application/json',
                ...corsHeaders,
            },
        });
    }
}
