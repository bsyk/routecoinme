/**
 * Tests for STL Options
 */

import { describe, it, expect } from 'vitest';
import { DEFAULT_STL_OPTIONS, STL_PRESETS } from '../../src/export/stl-options.js';

describe('STL Options', () => {
  describe('DEFAULT_STL_OPTIONS', () => {
    it('should have all required properties', () => {
      expect(DEFAULT_STL_OPTIONS).toHaveProperty('shapeType');
      expect(DEFAULT_STL_OPTIONS).toHaveProperty('projType');
      expect(DEFAULT_STL_OPTIONS).toHaveProperty('buffer');
      expect(DEFAULT_STL_OPTIONS).toHaveProperty('vertical');
      expect(DEFAULT_STL_OPTIONS).toHaveProperty('base');
      expect(DEFAULT_STL_OPTIONS).toHaveProperty('zcut');
      expect(DEFAULT_STL_OPTIONS).toHaveProperty('bedx');
      expect(DEFAULT_STL_OPTIONS).toHaveProperty('bedy');
    });

    it('should have sensible default values', () => {
      expect(DEFAULT_STL_OPTIONS.shapeType).toBe('track');
      expect(DEFAULT_STL_OPTIONS.projType).toBe('mercator');
      expect(DEFAULT_STL_OPTIONS.buffer).toBeGreaterThan(0);
      expect(DEFAULT_STL_OPTIONS.vertical).toBeGreaterThanOrEqual(10); // At least 10x for visibility
      expect(DEFAULT_STL_OPTIONS.base).toBeGreaterThanOrEqual(0); // 0 or more (0 = no base)
      expect(DEFAULT_STL_OPTIONS.zcut).toBe(true);
      expect(DEFAULT_STL_OPTIONS.bedx).toBe(200);
      expect(DEFAULT_STL_OPTIONS.bedy).toBe(200);
    });
  });

  describe('STL_PRESETS', () => {
    it('should have standard presets', () => {
      expect(STL_PRESETS).toHaveProperty('standard');
      expect(STL_PRESETS).toHaveProperty('dramatic');
      expect(STL_PRESETS).toHaveProperty('flatMap');
      expect(STL_PRESETS).toHaveProperty('climbingCoin');
    });

    it('should have valid preset structure', () => {
      Object.values(STL_PRESETS).forEach(preset => {
        expect(preset).toHaveProperty('name');
        expect(preset).toHaveProperty('description');
        expect(preset).toHaveProperty('options');
        expect(preset.options).toHaveProperty('buffer');
        expect(preset.options).toHaveProperty('vertical');
      });
    });

    it('dramatic preset should have higher target height', () => {
      expect(STL_PRESETS.dramatic.options.targetHeight).toBeGreaterThan(
        STL_PRESETS.standard.options.targetHeight
      );
    });

    it('flatMap preset should have lower target height', () => {
      expect(STL_PRESETS.flatMap.options.targetHeight).toBeLessThan(
        STL_PRESETS.standard.options.targetHeight
      );
    });
  });
});
