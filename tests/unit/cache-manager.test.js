/**
 * Unit tests for CacheManager (client-side cache module).
 * Tests the object defined in scripts_app.html.
 *
 * Requirements covered: 1.1, 1.2, 1.3, 1.4, 1.7
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';

// Replicate the CacheManager module for testing (extracted from scripts_app.html)
function createCacheManager() {
  return {
    _store: {},
    _ttls: {
      'dashboard': 30000,
      'cola-auxiliar': 0,
      'mis-solicitudes': 0,
      'asignaciones': 0,
      'errores': 0,
      'lotes': 0,
      'solicitudes': 0,
      'usuarios': 0,
      'config-motivos': 0
    },

    get: function(key) {
      if (!this._store[key]) return null;
      var entry = this._store[key];
      var ttl = this._ttls[key] || 0;
      if (ttl > 0 && (Date.now() - entry.timestamp > ttl)) {
        delete this._store[key];
        return null;
      }
      return entry.data;
    },

    set: function(key, data) {
      this._store[key] = { data: data, timestamp: Date.now() };
    },

    invalidar: function(keys) {
      if (typeof keys === 'string') keys = [keys];
      for (var i = 0; i < keys.length; i++) {
        delete this._store[keys[i]];
      }
    },

    invalidarTodo: function() {
      this._store = {};
    },

    esValido: function(key) {
      return this.get(key) !== null;
    }
  };
}

describe('CacheManager', () => {
  let cm;

  beforeEach(() => {
    cm = createCacheManager();
  });

  describe('Initialization', () => {
    it('should start with an empty store', () => {
      expect(cm._store).toEqual({});
    });

    it('should have TTL of 30000ms for dashboard', () => {
      expect(cm._ttls['dashboard']).toBe(30000);
    });

    it('should have TTL of 0 for non-dashboard keys (only explicit invalidation)', () => {
      expect(cm._ttls['cola-auxiliar']).toBe(0);
      expect(cm._ttls['mis-solicitudes']).toBe(0);
      expect(cm._ttls['asignaciones']).toBe(0);
      expect(cm._ttls['errores']).toBe(0);
      expect(cm._ttls['lotes']).toBe(0);
      expect(cm._ttls['solicitudes']).toBe(0);
      expect(cm._ttls['usuarios']).toBe(0);
      expect(cm._ttls['config-motivos']).toBe(0);
    });
  });

  describe('get(key)', () => {
    it('should return null for a key that has never been set', () => {
      expect(cm.get('cola-auxiliar')).toBeNull();
    });

    it('should return stored data for a valid key', () => {
      var testData = [{ id: 1 }, { id: 2 }];
      cm.set('cola-auxiliar', testData);
      expect(cm.get('cola-auxiliar')).toEqual(testData);
    });

    it('should return null after TTL expires for dashboard key', () => {
      vi.useFakeTimers();
      cm.set('dashboard', { total: 5 });
      expect(cm.get('dashboard')).toEqual({ total: 5 });

      // Advance time beyond TTL
      vi.advanceTimersByTime(30001);
      expect(cm.get('dashboard')).toBeNull();
      vi.useRealTimers();
    });

    it('should NOT expire keys with TTL = 0 (cola-auxiliar, lotes, etc.)', () => {
      vi.useFakeTimers();
      cm.set('cola-auxiliar', [{ uuid: 'abc' }]);

      // Advance time by a large amount
      vi.advanceTimersByTime(999999);
      expect(cm.get('cola-auxiliar')).toEqual([{ uuid: 'abc' }]);
      vi.useRealTimers();
    });

    it('should delete the entry from store when TTL expires', () => {
      vi.useFakeTimers();
      cm.set('dashboard', { total: 10 });
      vi.advanceTimersByTime(30001);
      cm.get('dashboard'); // triggers deletion
      expect(cm._store['dashboard']).toBeUndefined();
      vi.useRealTimers();
    });

    it('should return data within TTL for dashboard key', () => {
      vi.useFakeTimers();
      cm.set('dashboard', { total: 10 });
      vi.advanceTimersByTime(29999);
      expect(cm.get('dashboard')).toEqual({ total: 10 });
      vi.useRealTimers();
    });
  });

  describe('set(key, data)', () => {
    it('should store data with a timestamp', () => {
      vi.useFakeTimers({ now: 1000000 });
      cm.set('lotes', [{ id: 'L01' }]);
      expect(cm._store['lotes']).toEqual({
        data: [{ id: 'L01' }],
        timestamp: 1000000
      });
      vi.useRealTimers();
    });

    it('should overwrite existing data', () => {
      cm.set('lotes', [{ id: 'L01' }]);
      cm.set('lotes', [{ id: 'L02' }]);
      expect(cm.get('lotes')).toEqual([{ id: 'L02' }]);
    });

    it('should store falsy data values correctly (empty array)', () => {
      cm.set('cola-auxiliar', []);
      expect(cm.get('cola-auxiliar')).toEqual([]);
    });
  });

  describe('invalidar(keys)', () => {
    it('should invalidate a single key passed as string', () => {
      cm.set('cola-auxiliar', [{ uuid: '1' }]);
      cm.invalidar('cola-auxiliar');
      expect(cm.get('cola-auxiliar')).toBeNull();
    });

    it('should invalidate multiple keys passed as array', () => {
      cm.set('cola-auxiliar', [{ uuid: '1' }]);
      cm.set('dashboard', { total: 5 });
      cm.set('lotes', [{ id: 'L01' }]);

      cm.invalidar(['cola-auxiliar', 'dashboard']);
      expect(cm.get('cola-auxiliar')).toBeNull();
      expect(cm.get('dashboard')).toBeNull();
      expect(cm.get('lotes')).toEqual([{ id: 'L01' }]);
    });

    it('should not throw when invalidating a key that does not exist', () => {
      expect(() => cm.invalidar('nonexistent')).not.toThrow();
    });

    it('should not affect other keys', () => {
      cm.set('errores', [{ id: 'E1' }]);
      cm.set('usuarios', [{ email: 'a@b.com' }]);
      cm.invalidar('errores');
      expect(cm.get('usuarios')).toEqual([{ email: 'a@b.com' }]);
    });
  });

  describe('invalidarTodo()', () => {
    it('should clear all stored data', () => {
      cm.set('cola-auxiliar', [1, 2, 3]);
      cm.set('dashboard', { x: 1 });
      cm.set('lotes', []);
      cm.invalidarTodo();
      expect(cm.get('cola-auxiliar')).toBeNull();
      expect(cm.get('dashboard')).toBeNull();
      expect(cm.get('lotes')).toBeNull();
      expect(cm._store).toEqual({});
    });
  });

  describe('esValido(key)', () => {
    it('should return false for an empty key', () => {
      expect(cm.esValido('cola-auxiliar')).toBe(false);
    });

    it('should return true for a key with valid data', () => {
      cm.set('cola-auxiliar', [{ uuid: 'x' }]);
      expect(cm.esValido('cola-auxiliar')).toBe(true);
    });

    it('should return false for an expired dashboard key', () => {
      vi.useFakeTimers();
      cm.set('dashboard', { total: 5 });
      vi.advanceTimersByTime(30001);
      expect(cm.esValido('dashboard')).toBe(false);
      vi.useRealTimers();
    });

    it('should return true for a non-expired dashboard key', () => {
      vi.useFakeTimers();
      cm.set('dashboard', { total: 5 });
      vi.advanceTimersByTime(15000);
      expect(cm.esValido('dashboard')).toBe(true);
      vi.useRealTimers();
    });
  });

  describe('Requirement 1.7 — Session reset', () => {
    it('new CacheManager instance has no cached data (simulates page reload)', () => {
      // Set some data
      cm.set('dashboard', { total: 10 });
      cm.set('lotes', [{ id: 'L01' }]);

      // Simulate new session by creating a fresh instance
      var newCm = createCacheManager();
      expect(newCm.get('dashboard')).toBeNull();
      expect(newCm.get('lotes')).toBeNull();
    });
  });

  describe('Edge cases', () => {
    it('should handle unknown keys (no TTL defined) as TTL = 0', () => {
      vi.useFakeTimers();
      cm.set('unknown-key', { test: true });
      vi.advanceTimersByTime(999999);
      // TTL 0 means no expiration — only explicit invalidation
      expect(cm.get('unknown-key')).toEqual({ test: true });
      vi.useRealTimers();
    });

    it('should handle null data stored via set', () => {
      cm.set('errores', null);
      // The entry exists but data is null — get should return null (falsy path)
      // Since _store[key] exists, it checks TTL, then returns entry.data which is null
      expect(cm.get('errores')).toBeNull();
    });

    it('should store and retrieve complex nested data', () => {
      var complexData = {
        items: [
          { uuid: 'abc-123', nested: { deep: [1, 2, 3] } },
          { uuid: 'def-456', nested: { deep: [4, 5, 6] } }
        ],
        meta: { total: 2, page: 1 }
      };
      cm.set('solicitudes', complexData);
      expect(cm.get('solicitudes')).toEqual(complexData);
    });
  });
});
