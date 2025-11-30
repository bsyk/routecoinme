#!/usr/bin/env node

import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { JSDOM } from 'jsdom';
import GPXParser from '../src/data/gpx-parser.js';
import RouteManipulator from '../src/data/route-manipulator.js';

// Ensure DOMParser exists for GPXParser in Node.
if (typeof globalThis.DOMParser === 'undefined') {
    const { window } = new JSDOM();
    globalThis.DOMParser = window.DOMParser;
}

// Provide crypto.randomUUID for RouteManipulator when running in Node.
if (!globalThis.crypto) {
    globalThis.crypto = {};
}
if (typeof globalThis.crypto.randomUUID !== 'function') {
    globalThis.crypto.randomUUID = crypto.randomUUID.bind(crypto);
}

const TARGET_POINT_COUNT = 10000;

function printUsage() {
    console.log(`Usage: node tools/convert-gpx-to-predetermined.js <input.gpx> <output.json> [--name "Display Name"]`);
}

function parseArgs(argv) {
    const args = argv.slice(2);
    if (args.length < 2 || args.includes('--help') || args.includes('-h')) {
        printUsage();
        process.exit(1);
    }

    const [inputPath, outputPath, ...rest] = args;

    const options = {};
    for (let i = 0; i < rest.length; i++) {
        const value = rest[i];
        if (value === '--name' && typeof rest[i + 1] === 'string') {
            options.name = rest[i + 1];
            i += 1;
        }
    }

    return { inputPath, outputPath, options };
}

function buildRouteObject(routeData) {
    return {
        filename: routeData.filename,
        points: routeData.points.map(point => ({
            lat: point.lat,
            lon: point.lon,
            elevation: point.elevation ?? 0,
            timestamp: point.timestamp ? new Date(point.timestamp).toISOString() : undefined
        })),
        metadata: routeData.metadata,
        distance: routeData.distance,
        elevationGain: routeData.elevationGain,
        elevationLoss: routeData.elevationLoss,
        duration: routeData.duration,
        uploadTime: routeData.uploadTime
    };
}

function sanitizePoints(points) {
    return points.map(point => ({
        lat: point.lat,
        lon: point.lon
    }));
}

async function convertGPX(inputPath, outputPath, options) {
    console.log(`📂 Reading GPX file from ${inputPath}`);
    const rawContent = await fs.readFile(inputPath, 'utf8');

    const gpxParser = new GPXParser();
    const xmlDoc = gpxParser.parseXML(rawContent);
    const routeData = gpxParser.extractRouteData(xmlDoc, path.basename(inputPath));

    const manipulator = new RouteManipulator();

    console.log('🎯 Normalizing route coordinates');
    const normalizedRoute = manipulator.normalizeRoute(buildRouteObject(routeData));

    console.log(`🔁 Resampling route to ${TARGET_POINT_COUNT} points`);
    const resampledRoute = manipulator.resampleRoute(normalizedRoute, TARGET_POINT_COUNT);

    const output = {
        filename: path.basename(outputPath),
        points: sanitizePoints(resampledRoute.points),
        metadata: {
            name: options.name || routeData.metadata?.name || path.parse(outputPath).name,
            creator: routeData.metadata?.creator || 'https://routecoin.me/'
        }
    };

    console.log(`💾 Writing predetermined path to ${outputPath}`);
    await fs.writeFile(outputPath, JSON.stringify(output, null, 2));

    console.log('✅ Conversion complete');
}

async function main() {
    try {
        const { inputPath, outputPath, options } = parseArgs(process.argv);
        await convertGPX(inputPath, outputPath, options);
    } catch (error) {
        console.error('❌ Failed to convert GPX:', error.message);
        process.exit(1);
    }
}

const executedDirectly = process.argv[1]
    ? path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)
    : false;

if (executedDirectly) {
    await main();
}
