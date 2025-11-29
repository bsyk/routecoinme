// Cloudflare Worker for RouteCoinMe Strava Integration
// Stateless server-side processing for Strava API calls
// Maintains privacy by not storing or logging any user data

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

// Handle Strava API requests
async function handleStravaAPI(request, url, corsHeaders, env) {
    // Extract and validate auth token
    const authToken = request.headers.get('X-Strava-Token');
    const timestamp = request.headers.get('X-Request-Timestamp');

    if (!authToken) {
        return new Response(JSON.stringify({ 
            error: 'Authentication required',
            message: 'X-Strava-Token header is required' 
        }), {
            status: 401,
            headers: {
                'Content-Type': 'application/json',
                ...corsHeaders,
            },
        });
    }

    // Validate timestamp (token should be recent)
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
