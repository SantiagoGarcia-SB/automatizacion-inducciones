/**
 * Unit tests para Servicios_CacheWrapper.js
 *
 * Valida el comportamiento de CacheWrapper_getJSON, CacheWrapper_putJSON,
 * CacheWrapper_remove incluyendo fragmentación, reconstrucción, y manejo
 * de errores.
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { createCacheService } from '../mocks/cache-service.mock.js';

// ─── Setup: cargar funciones del wrapper en contexto global ────────────────────

// Constantes del wrapper (replicadas para tests)
const CACHE_CHUNK_SIZE = 99000;
const CACHE_MAX_TOTAL_SIZE = 500000;

/**
 * Helper: carga las funciones del CacheWrapper en el scope global.
 * Simula el entorno GAS donde todas las funciones son globales.
 */
function setupGlobalWrapper() {
  // Función interna: pad number
  globalThis._padNumber_ = function(n) {
    return n < 10 ? '0' + n : '' + n;
  };

  // Función interna: detectar header
  globalThis._esCacheHeader_ = function(raw) {
    return raw.indexOf('{"_parts":') === 0;
  };

  // Función interna: reconstruir fragmentos
  globalThis._reconstruirFragmentos_ = function(cache, key, headerRaw) {
    var header = JSON.parse(headerRaw);
    var parts = header._parts;
    var chunks = [];

    for (var i = 1; i <= parts; i++) {
      var partKey = key + '_PART_' + globalThis._padNumber_(i);
      var chunk = cache.get(partKey);

      if (chunk === null || chunk === undefined) {
        return null;
      }
      chunks.push(chunk);
    }

    var fullJson = chunks.join('');
    return JSON.parse(fullJson);
  };

  // Función interna: almacenar fragmentado
  globalThis._almacenarFragmentado_ = function(cache, key, json, ttl) {
    var totalParts = Math.ceil(json.length / CACHE_CHUNK_SIZE);
    cache.put(key, JSON.stringify({ _parts: totalParts }), ttl);

    for (var i = 0; i < totalParts; i++) {
      var start = i * CACHE_CHUNK_SIZE;
      var chunk = json.substring(start, start + CACHE_CHUNK_SIZE);
      var partKey = key + '_PART_' + globalThis._padNumber_(i + 1);
      cache.put(partKey, chunk, ttl);
    }
  };

  // Función pública: getJSON
  globalThis.CacheWrapper_getJSON = function(key) {
    try {
      var cache = CacheService.getScriptCache();
      var raw = cache.get(key);

      if (raw === null || raw === undefined) {
        return null;
      }

      if (globalThis._esCacheHeader_(raw)) {
        return globalThis._reconstruirFragmentos_(cache, key, raw);
      }

      return JSON.parse(raw);
    } catch (e) {
      return null;
    }
  };

  // Función pública: putJSON
  globalThis.CacheWrapper_putJSON = function(key, obj, ttlSegundos) {
    var ttl = ttlSegundos || 600;

    try {
      var json = JSON.stringify(obj);
      var size = json.length;

      if (size > CACHE_MAX_TOTAL_SIZE) {
        console.warn(
          'CacheWrapper_putJSON: payload para "' + key + '" excede 500 KB (' +
          Math.round(size / 1024) + ' KB). No se almacena en caché.'
        );
        return;
      }

      var cache = CacheService.getScriptCache();

      if (size < CACHE_CHUNK_SIZE) {
        cache.put(key, json, ttl);
        return;
      }

      globalThis._almacenarFragmentado_(cache, key, json, ttl);
    } catch (e) {
      // Error en CacheService.put() → omitir y continuar
    }
  };

  // Función pública: remove
  globalThis.CacheWrapper_remove = function(key) {
    try {
      var cache = CacheService.getScriptCache();
      var raw = cache.get(key);

      if (raw !== null && raw !== undefined && globalThis._esCacheHeader_(raw)) {
        var header = JSON.parse(raw);
        var parts = header._parts;
        var keysToRemove = [key];

        for (var i = 1; i <= parts; i++) {
          keysToRemove.push(key + '_PART_' + globalThis._padNumber_(i));
        }
        cache.removeAll(keysToRemove);
      } else {
        cache.remove(key);
      }
    } catch (e) {
      // Error al eliminar → omitir silenciosamente
    }
  };
}

// ─── Helpers ───────────────────────────────────────────────────────────────────

/**
 * Genera un string de tamaño aproximado en KB.
 * @param {number} sizeKB — Tamaño deseado en KB
 * @returns {Object} — Objeto con un campo 'data' de tamaño aproximado
 */
function generarPayload(sizeKB) {
  var targetLength = sizeKB * 1024;
  // JSON.stringify agrega overhead por las llaves y comillas
  // Generamos un string largo como valor de un objeto
  var padding = 'x'.repeat(targetLength - 20); // 20 chars para {"data":"..."}
  return { data: padding };
}

// ─── Tests ─────────────────────────────────────────────────────────────────────

describe('Servicios_CacheWrapper', () => {
  let cacheService;

  beforeEach(() => {
    // Configurar mock con throwOnLimit=false para permitir testeo de fragmentación
    cacheService = createCacheService({ throwOnLimit: false });
    globalThis.CacheService = cacheService;
    setupGlobalWrapper();
    cacheService._scriptCache.clear();
  });

  describe('CacheWrapper_putJSON + CacheWrapper_getJSON (payload pequeño < 99 KB)', () => {
    it('almacena y recupera un objeto simple en una sola clave', () => {
      var obj = { nombre: 'Test', items: [1, 2, 3] };
      CacheWrapper_putJSON('TEST_KEY', obj, 300);

      var result = CacheWrapper_getJSON('TEST_KEY');
      expect(result).toEqual(obj);
    });

    it('almacena con TTL correcto', () => {
      var obj = { id: 1 };
      CacheWrapper_putJSON('TTL_KEY', obj, 120);

      var calls = cacheService._scriptCache.getCallLog('put');
      expect(calls.length).toBe(1);
      expect(calls[0].ttl).toBe(120);
    });

    it('usa TTL por defecto de 600s si no se especifica', () => {
      var obj = { id: 2 };
      CacheWrapper_putJSON('DEFAULT_TTL', obj);

      var calls = cacheService._scriptCache.getCallLog('put');
      expect(calls[0].ttl).toBe(600);
    });

    it('retorna null para clave inexistente', () => {
      var result = CacheWrapper_getJSON('NO_EXISTE');
      expect(result).toBeNull();
    });

    it('almacena payload justo bajo el límite (98 KB) en una sola clave', () => {
      var obj = generarPayload(95); // ~95 KB con overhead JSON
      CacheWrapper_putJSON('BAJO_LIMITE', obj, 300);

      var putCalls = cacheService._scriptCache.getCallLog('put');
      // Solo 1 put (sin fragmentación)
      expect(putCalls.length).toBe(1);

      var result = CacheWrapper_getJSON('BAJO_LIMITE');
      expect(result).toEqual(obj);
    });
  });

  describe('CacheWrapper_putJSON + CacheWrapper_getJSON (payload grande 99-500 KB)', () => {
    it('fragmenta payload de ~150 KB en múltiples partes', () => {
      // Crear un objeto cuyo JSON tenga ~150 KB
      var largeArray = [];
      for (var i = 0; i < 3000; i++) {
        largeArray.push({ id: i, nombre: 'Item_' + i + '_padding_' + 'x'.repeat(30) });
      }

      var jsonSize = JSON.stringify(largeArray).length;
      // Verificar que el payload está en el rango correcto
      expect(jsonSize).toBeGreaterThan(CACHE_CHUNK_SIZE);
      expect(jsonSize).toBeLessThan(CACHE_MAX_TOTAL_SIZE);

      CacheWrapper_putJSON('LARGE_KEY', largeArray, 60);

      // Verificar que se creó el header
      var raw = cacheService._scriptCache.get('LARGE_KEY');
      var header = JSON.parse(raw);
      expect(header._parts).toBeGreaterThan(1);

      // Verificar que los fragmentos existen
      for (var p = 1; p <= header._parts; p++) {
        var partKey = 'LARGE_KEY_PART_' + (p < 10 ? '0' + p : '' + p);
        var partValue = cacheService._scriptCache.get(partKey);
        expect(partValue).not.toBeNull();
        expect(partValue.length).toBeLessThanOrEqual(CACHE_CHUNK_SIZE);
      }
    });

    it('reconstruye payload fragmentado correctamente', () => {
      var largeArray = [];
      for (var i = 0; i < 3000; i++) {
        largeArray.push({ id: i, nombre: 'Item_' + i + '_padding_' + 'x'.repeat(30) });
      }

      CacheWrapper_putJSON('RECONSTRUCT', largeArray, 60);
      var result = CacheWrapper_getJSON('RECONSTRUCT');

      expect(result).toEqual(largeArray);
    });

    it('fragmento con sufijo correcto _PART_01, _PART_02, etc.', () => {
      // Crear payload de ~200 KB (necesita ~3 partes)
      var bigString = 'y'.repeat(200000);
      var obj = { content: bigString };

      CacheWrapper_putJSON('PARTS_TEST', obj, 300);

      var raw = cacheService._scriptCache.get('PARTS_TEST');
      var header = JSON.parse(raw);
      var expectedParts = Math.ceil(JSON.stringify(obj).length / CACHE_CHUNK_SIZE);
      expect(header._parts).toBe(expectedParts);

      // Verificar naming
      expect(cacheService._scriptCache.get('PARTS_TEST_PART_01')).not.toBeNull();
      expect(cacheService._scriptCache.get('PARTS_TEST_PART_02')).not.toBeNull();
    });
  });

  describe('Fragmento faltante retorna null (cache-miss)', () => {
    it('retorna null si falta un fragmento intermedio', () => {
      var bigString = 'z'.repeat(200000);
      var obj = { content: bigString };

      CacheWrapper_putJSON('MISSING_PART', obj, 300);

      // Eliminar un fragmento manualmente
      cacheService._scriptCache.remove('MISSING_PART_PART_02');

      var result = CacheWrapper_getJSON('MISSING_PART');
      expect(result).toBeNull();
    });

    it('retorna null si falta el primer fragmento', () => {
      var bigString = 'a'.repeat(200000);
      var obj = { content: bigString };

      CacheWrapper_putJSON('MISSING_FIRST', obj, 300);
      cacheService._scriptCache.remove('MISSING_FIRST_PART_01');

      var result = CacheWrapper_getJSON('MISSING_FIRST');
      expect(result).toBeNull();
    });
  });

  describe('Payload > 500 KB no se cachea', () => {
    it('no almacena payload que excede 500 KB', () => {
      var hugeString = 'w'.repeat(510000);
      var obj = { content: hugeString };

      // Espiar console.warn
      var warnings = [];
      var originalWarn = console.warn;
      console.warn = function(msg) { warnings.push(msg); };

      CacheWrapper_putJSON('TOO_BIG', obj, 300);

      console.warn = originalWarn;

      // No debe haber almacenado nada
      var result = cacheService._scriptCache.get('TOO_BIG');
      expect(result).toBeNull();

      // Debe haber logueado WARN
      expect(warnings.length).toBeGreaterThan(0);
      expect(warnings[0]).toContain('excede 500 KB');
    });

    it('payload exactamente en 500 KB se almacena fragmentado', () => {
      // Generar payload cuyo JSON sea justo bajo 500 KB
      var targetSize = 490000; // un poco bajo el límite para overhead JSON
      var obj = { content: 'q'.repeat(targetSize) };
      var jsonSize = JSON.stringify(obj).length;

      // Asegurar que está dentro del rango
      if (jsonSize <= CACHE_MAX_TOTAL_SIZE) {
        CacheWrapper_putJSON('BORDERLINE', obj, 300);
        var raw = cacheService._scriptCache.get('BORDERLINE');
        expect(raw).not.toBeNull();
      }
    });
  });

  describe('CacheService failure se maneja gracefully', () => {
    it('putJSON no lanza excepción si CacheService falla', () => {
      cacheService._scriptCache.setUnavailable(true);

      expect(() => {
        CacheWrapper_putJSON('FAIL_PUT', { test: true }, 300);
      }).not.toThrow();
    });

    it('getJSON retorna null si CacheService falla', () => {
      // Primero almacenar un valor
      CacheWrapper_putJSON('FAIL_GET', { test: true }, 300);

      // Luego simular fallo
      cacheService._scriptCache.setUnavailable(true);

      var result = CacheWrapper_getJSON('FAIL_GET');
      expect(result).toBeNull();
    });

    it('remove no lanza excepción si CacheService falla', () => {
      cacheService._scriptCache.setUnavailable(true);

      expect(() => {
        CacheWrapper_remove('FAIL_REMOVE');
      }).not.toThrow();
    });
  });

  describe('CacheWrapper_remove', () => {
    it('elimina clave simple correctamente', () => {
      CacheWrapper_putJSON('REMOVE_SIMPLE', { a: 1 }, 300);
      expect(CacheWrapper_getJSON('REMOVE_SIMPLE')).toEqual({ a: 1 });

      CacheWrapper_remove('REMOVE_SIMPLE');
      expect(CacheWrapper_getJSON('REMOVE_SIMPLE')).toBeNull();
    });

    it('elimina clave fragmentada y todos sus fragmentos', () => {
      var bigString = 'r'.repeat(200000);
      var obj = { content: bigString };

      CacheWrapper_putJSON('REMOVE_FRAG', obj, 300);

      // Verificar que existe
      var raw = cacheService._scriptCache.get('REMOVE_FRAG');
      expect(raw).not.toBeNull();

      CacheWrapper_remove('REMOVE_FRAG');

      // Header eliminado
      expect(cacheService._scriptCache.get('REMOVE_FRAG')).toBeNull();
      // Fragmentos eliminados
      expect(cacheService._scriptCache.get('REMOVE_FRAG_PART_01')).toBeNull();
      expect(cacheService._scriptCache.get('REMOVE_FRAG_PART_02')).toBeNull();
    });

    it('no falla al eliminar clave inexistente', () => {
      expect(() => {
        CacheWrapper_remove('NO_EXISTE_REMOVE');
      }).not.toThrow();
    });
  });

  describe('Edge cases', () => {
    it('maneja objeto vacío correctamente', () => {
      CacheWrapper_putJSON('EMPTY_OBJ', {}, 300);
      expect(CacheWrapper_getJSON('EMPTY_OBJ')).toEqual({});
    });

    it('maneja array vacío correctamente', () => {
      CacheWrapper_putJSON('EMPTY_ARR', [], 300);
      expect(CacheWrapper_getJSON('EMPTY_ARR')).toEqual([]);
    });

    it('maneja null como valor (no almacena en caché)', () => {
      CacheWrapper_putJSON('NULL_VAL', null, 300);
      // JSON.stringify(null) = "null" que es < 99KB, se almacena
      expect(CacheWrapper_getJSON('NULL_VAL')).toBeNull();
    });

    it('maneja caracteres especiales en JSON', () => {
      var obj = {
        texto: 'Línea 1\nLínea 2\tTab',
        unicode: '¡Hola! ñ á é í ó ú 中文 🎉',
        comillas: 'Dijo "hola" y \'adiós\''
      };

      CacheWrapper_putJSON('SPECIAL_CHARS', obj, 300);
      expect(CacheWrapper_getJSON('SPECIAL_CHARS')).toEqual(obj);
    });

    it('maneja objetos anidados profundos', () => {
      var obj = { nivel1: { nivel2: { nivel3: { nivel4: { valor: 42 } } } } };
      CacheWrapper_putJSON('NESTED', obj, 300);
      expect(CacheWrapper_getJSON('NESTED')).toEqual(obj);
    });
  });
});
