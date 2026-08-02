import { describe, it, expect } from 'vitest';
import fc from 'fast-check';
import {
  arbFilaControlGeneral,
  arbDatasetControlGeneral,
  arbDatasetConUuidsUnicos,
  arbUuidsConInvalidos,
  ESTADOS,
  CODEUDOR_INDEXES,
} from './dataset.gen.js';
import {
  arbCacheKey,
  arbCacheStore,
  arbCacheManagerState,
  arbStoreConInvalidacion,
  arbAccionConInvalidacion,
  CACHE_KEYS,
} from './cache-state.gen.js';
import {
  arbJsonPequeno,
  arbJsonMediano,
  arbJsonGrande,
  arbJsonPayload,
  arbJsonEnFrontera,
  KB,
} from './json-payload.gen.js';

describe('Generadores de datos — dataset.gen.js', () => {
  it('arbFilaControlGeneral genera filas de 62 columnas', () => {
    fc.assert(
      fc.property(arbFilaControlGeneral(), (fila) => {
        expect(fila).toHaveLength(62);
      }),
      { numRuns: 50 }
    );
  });

  it('arbFilaControlGeneral coloca estado válido en index 9', () => {
    fc.assert(
      fc.property(arbFilaControlGeneral(), (fila) => {
        expect(ESTADOS).toContain(fila[9]);
      }),
      { numRuns: 50 }
    );
  });

  it('arbFilaControlGeneral coloca UUID en index 61', () => {
    fc.assert(
      fc.property(arbFilaControlGeneral(), (fila) => {
        expect(fila[61]).toBeTruthy();
        expect(typeof fila[61]).toBe('string');
      }),
      { numRuns: 50 }
    );
  });

  it('arbFilaControlGeneral coloca arrendatario en index 23', () => {
    fc.assert(
      fc.property(arbFilaControlGeneral(), (fila) => {
        expect(fila[23]).toBeTruthy();
        expect(typeof fila[23]).toBe('string');
      }),
      { numRuns: 50 }
    );
  });

  it('arbDatasetControlGeneral genera array de filas', () => {
    fc.assert(
      fc.property(arbDatasetControlGeneral({ minFilas: 5, maxFilas: 10 }), (dataset) => {
        expect(dataset.length).toBeGreaterThanOrEqual(5);
        expect(dataset.length).toBeLessThanOrEqual(10);
        dataset.forEach((fila) => expect(fila).toHaveLength(62));
      }),
      { numRuns: 20 }
    );
  });

  it('arbDatasetConUuidsUnicos produce UUIDs sin duplicados', () => {
    fc.assert(
      fc.property(arbDatasetConUuidsUnicos({ minFilas: 5, maxFilas: 20 }), (dataset) => {
        const uuids = dataset.map((f) => f[61]);
        const uniqueUuids = new Set(uuids);
        expect(uniqueUuids.size).toBe(uuids.length);
      }),
      { numRuns: 30 }
    );
  });
});

describe('Generadores de datos — cache-state.gen.js', () => {
  it('arbCacheKey genera claves válidas', () => {
    fc.assert(
      fc.property(arbCacheKey(), (key) => {
        expect(CACHE_KEYS).toContain(key);
      }),
      { numRuns: 50 }
    );
  });

  it('arbCacheStore genera objetos con claves válidas y estructura { data, timestamp }', () => {
    fc.assert(
      fc.property(arbCacheStore({ minKeys: 1, maxKeys: 5 }), (store) => {
        const keys = Object.keys(store);
        expect(keys.length).toBeGreaterThanOrEqual(1);
        expect(keys.length).toBeLessThanOrEqual(5);
        keys.forEach((key) => {
          expect(CACHE_KEYS).toContain(key);
          expect(store[key]).toHaveProperty('data');
          expect(store[key]).toHaveProperty('timestamp');
          expect(typeof store[key].timestamp).toBe('number');
        });
      }),
      { numRuns: 30 }
    );
  });

  it('arbStoreConInvalidacion genera store con subset de claves a invalidar', () => {
    fc.assert(
      fc.property(arbStoreConInvalidacion(), ({ store, keysAInvalidar }) => {
        const keysConDatos = Object.keys(store);
        // Todas las claves a invalidar deben existir en el store
        keysAInvalidar.forEach((key) => {
          expect(keysConDatos).toContain(key);
        });
      }),
      { numRuns: 30 }
    );
  });

  it('arbAccionConInvalidacion genera acciones con claves de invalidación correctas', () => {
    fc.assert(
      fc.property(arbAccionConInvalidacion(), ({ accion, invalidar }) => {
        expect(typeof accion).toBe('string');
        expect(Array.isArray(invalidar)).toBe(true);
        invalidar.forEach((key) => {
          expect(CACHE_KEYS).toContain(key);
        });
      }),
      { numRuns: 20 }
    );
  });
});

describe('Generadores de datos — json-payload.gen.js', () => {
  it('arbJsonPequeno genera JSON válido de 1-10 KB', () => {
    fc.assert(
      fc.property(arbJsonPequeno(), (json) => {
        expect(() => JSON.parse(json)).not.toThrow();
        expect(json.length).toBeGreaterThanOrEqual(1 * KB);
        expect(json.length).toBeLessThanOrEqual(10 * KB);
      }),
      { numRuns: 20 }
    );
  });

  it('arbJsonMediano genera JSON válido de 10-99 KB', () => {
    fc.assert(
      fc.property(arbJsonMediano(), (json) => {
        expect(() => JSON.parse(json)).not.toThrow();
        expect(json.length).toBeGreaterThanOrEqual(10 * KB);
        expect(json.length).toBeLessThanOrEqual(99 * KB);
      }),
      { numRuns: 10 }
    );
  });

  it('arbJsonGrande genera JSON válido de 100-500 KB', () => {
    fc.assert(
      fc.property(arbJsonGrande(), (json) => {
        expect(() => JSON.parse(json)).not.toThrow();
        expect(json.length).toBeGreaterThanOrEqual(100 * KB);
        expect(json.length).toBeLessThanOrEqual(500 * KB);
      }),
      { numRuns: 5 }
    );
  });

  it('arbJsonEnFrontera genera JSON en zona 90-110 KB', () => {
    fc.assert(
      fc.property(arbJsonEnFrontera(), (json) => {
        expect(() => JSON.parse(json)).not.toThrow();
        expect(json.length).toBeGreaterThanOrEqual(90 * KB);
        expect(json.length).toBeLessThanOrEqual(110 * KB);
      }),
      { numRuns: 10 }
    );
  });
});
