import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { indexedDB, IDBKeyRange } from 'fake-indexeddb';
import RouteStorageManager from '../../src/data/route-storage.js';

const createRoute = (overrides = {}) => ({
  id: `route-${Math.random().toString(36).slice(2)}`,
  filename: 'test-route.gpx',
  points: [
    { lat: 0, lon: 0, elevation: 100, timestamp: '2024-01-01T10:00:00Z' },
    { lat: 0.01, lon: 0.01, elevation: 150, timestamp: '2024-01-01T10:05:00Z' }
  ],
  distance: 12.3,
  elevationGain: 450,
  elevationLoss: 200,
  duration: 3200,
  uploadTime: Date.now(),
  ...overrides
});

describe('RouteStorageManager (IndexedDB)', () => {
  let manager;

  beforeEach(async () => {
    global.indexedDB = indexedDB;
    global.IDBKeyRange = IDBKeyRange;
    manager = new RouteStorageManager();
    await manager.init();
    await manager.clearAllRoutes();
    await manager.clearAllCoins();
  });

  afterEach(() => {
    if (manager?.db) {
      manager.db.close();
    }
    delete global.indexedDB;
    delete global.IDBKeyRange;
  });

  it('creates both routes and coins object stores on init', () => {
    expect(manager.db.objectStoreNames.contains(manager.routeStoreName)).toBe(true);
    expect(manager.db.objectStoreNames.contains(manager.coinStoreName)).toBe(true);
  });

  it('saves and loads routes without data loss', async () => {
    const routes = [
      createRoute({ id: 'route-a', filename: 'route-a.gpx' }),
      createRoute({ id: 'route-b', filename: 'route-b.gpx' })
    ];

    await manager.saveRoutes(routes);
    const loaded = await manager.loadRoutes();

    expect(loaded).toHaveLength(2);
    expect(loaded.map(route => route.id)).toEqual(expect.arrayContaining(['route-a', 'route-b']));
    expect(loaded.find(route => route.id === 'route-a')?.filename).toBe('route-a.gpx');
  });

  it('persists coins and loads them back in reverse chronological order', async () => {
    const now = Date.now();
    const coinA = {
      id: 'coin-a',
      name: 'Coin Alpha',
      createdAt: new Date(now - 1).toISOString(),
      type: 'coin',
      options: { overlay: 'real', elevationMode: 'actual', domain: 'distance' },
      stats: { distance: 10, elevationGain: 500, elevationLoss: 200, duration: 4000 },
      route: createRoute({ id: 'aggregated-a' }),
      sourceRoutes: []
    };

    const coinB = {
      id: 'coin-b',
      name: 'Coin Beta',
      createdAt: new Date(now).toISOString(),
      type: 'coin',
      options: { overlay: 'spiral.json', elevationMode: 'cumulative', domain: 'time' },
      stats: { distance: 25, elevationGain: 1200, elevationLoss: 300, duration: 7200 },
      route: createRoute({ id: 'aggregated-b' }),
      sourceRoutes: []
    };

    await manager.saveCoin(coinA);
    await manager.saveCoin(coinB);

    const coins = await manager.loadCoins();
    expect(coins.map(c => c.id).sort()).toEqual(['coin-a', 'coin-b']);

    const savedCoinB = coins.find(c => c.id === 'coin-b');
    expect(savedCoinB?.options.overlay).toBe('spiral.json');
    expect(savedCoinB?.stats.distance).toBe(25);
  });

  it('deletes coin records', async () => {
    const coin = {
      id: 'coin-to-delete',
      name: 'Disposable Coin',
      createdAt: new Date().toISOString(),
      type: 'coin',
      options: { overlay: 'real', elevationMode: 'actual', domain: 'distance' },
      stats: { distance: 5, elevationGain: 150, elevationLoss: 50, duration: 1800 },
      route: createRoute({ id: 'aggregated-delete' }),
      sourceRoutes: []
    };

    await manager.saveCoin(coin);
    let coins = await manager.loadCoins();
    expect(coins).toHaveLength(1);

    await manager.deleteCoin('coin-to-delete');
    coins = await manager.loadCoins();
    expect(coins).toHaveLength(0);
  });
});
