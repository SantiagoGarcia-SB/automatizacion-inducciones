/**
 * Unit tests para doGet non-blocking behavior (Task 11.1)
 *
 * Verifica que doGet v2:
 * - NO invoca obtenerResumenComercial() síncronamente en cache-miss
 * - Inyecta resumen serializado en datosIniciales cuando hay cache-hit
 * - Misma lógica para lotes: inyectar si cache-hit, null si cache-miss
 * - Usa CacheWrapper_getJSON (no raw CacheService.get)
 *
 * Requirements: 4.1, 4.4, 4.5
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { createCacheService } from '../mocks/cache-service.mock.js';

// ─── Constantes del CacheWrapper (replicadas) ──────────────────────────────────

const CACHE_CHUNK_SIZE = 99000;
const CACHE_MAX_TOTAL_SIZE = 500000;

// ─── Setup: simular entorno GAS ────────────────────────────────────────────────

function setupGlobalEnvironment(cacheService, options = {}) {
  // CacheService global
  globalThis.CacheService = cacheService;

  // CacheWrapper functions (versión simplificada para test)
  globalThis._padNumber_ = function(n) {
    return n < 10 ? '0' + n : '' + n;
  };

  globalThis._esCacheHeader_ = function(raw) {
    return raw.indexOf('{"_parts":') === 0;
  };

  globalThis._reconstruirFragmentos_ = function(cache, key, headerRaw) {
    var header = JSON.parse(headerRaw);
    var parts = header._parts;
    var chunks = [];
    for (var i = 1; i <= parts; i++) {
      var partKey = key + '_PART_' + globalThis._padNumber_(i);
      var chunk = cache.get(partKey);
      if (chunk === null || chunk === undefined) return null;
      chunks.push(chunk);
    }
    return JSON.parse(chunks.join(''));
  };

  globalThis.CacheWrapper_getJSON = function(key) {
    try {
      var cache = CacheService.getScriptCache();
      var raw = cache.get(key);
      if (raw === null || raw === undefined) return null;
      if (globalThis._esCacheHeader_(raw)) {
        return globalThis._reconstruirFragmentos_(cache, key, raw);
      }
      return JSON.parse(raw);
    } catch (e) {
      return null;
    }
  };

  globalThis.CacheWrapper_putJSON = function(key, obj, ttlSegundos) {
    var ttl = ttlSegundos || 600;
    try {
      var json = JSON.stringify(obj);
      if (json.length > CACHE_MAX_TOTAL_SIZE) return;
      var cache = CacheService.getScriptCache();
      if (json.length < CACHE_CHUNK_SIZE) {
        cache.put(key, json, ttl);
        return;
      }
    } catch (e) { /* omit */ }
  };

  // Mock obtenerUsuarioActual_v2
  globalThis.obtenerUsuarioActual_v2 = options.obtenerUsuarioActual_v2 || function() {
    return {
      email: 'comercial@test.com',
      nombre: 'Comercial Test',
      rol: 'COMERCIAL',
      autorizado: true
    };
  };

  // Spy: obtenerResumenComercial — should NEVER be called inside doGet
  globalThis.obtenerResumenComercial = vi.fn(function() {
    return { inducciones: 10, pendientes: 5 };
  });

  // Spy: obtenerLotesDeComercial — should NEVER be called inside doGet
  globalThis.obtenerLotesDeComercial = vi.fn(function() {
    return [{ id: 'lote1', fecha: '2025-01-01' }];
  });

  // Mock HtmlService
  var evaluatedOutput = {};
  globalThis.HtmlService = {
    createTemplateFromFile: function(filename) {
      var templateObj = {
        datosIniciales: null,
        evaluate: function() {
          evaluatedOutput.datosIniciales = templateObj.datosIniciales;
          return {
            setTitle: function() { return this; },
            setFaviconUrl: function() { return this; },
            setXFrameOptionsMode: function() { return this; },
            addMetaTag: function() { return this; }
          };
        }
      };
      return templateObj;
    },
    XFrameOptionsMode: { ALLOWALL: 'ALLOWALL' }
  };

  return evaluatedOutput;
}

// ─── doGet (extraído de Codigo.js para testing aislado) ─────────────────────────

function doGet(e) {
  if (e && e.parameter && e.parameter.v === '2') {
    var template = HtmlService.createTemplateFromFile('IndexNuevo');
    var usuario = obtenerUsuarioActual_v2();
    var datosIniciales = { usuario: usuario };

    // Pre-cargar resumen y lotes SOLO si ya están en CacheService (lectura rápida, no bloquea).
    // En cache-miss, el cliente los pide vía google.script.run con skeleton normal.
    // NUNCA se invoca obtenerResumenComercial() ni obtenerLotesDeComercial() aquí.
    if (usuario && usuario.autorizado) {
      var verTodos = (usuario.rol === 'LIDER' || usuario.rol === 'ADMIN');

      // Resumen: cache-hit → inyectar, cache-miss → null (cliente pide async)
      var resumenKey = 'RESUMEN_' + (verTodos ? 'GLOBAL' : usuario.email);
      var resumenCached = CacheWrapper_getJSON(resumenKey);
      datosIniciales.resumen = resumenCached || null;

      // Lotes: misma lógica — inyectar si cache-hit, null si cache-miss
      var lotesKey = verTodos ? 'LOTES_GLOBAL' : 'LOTES_' + usuario.email;
      var lotesCached = CacheWrapper_getJSON(lotesKey);
      datosIniciales.lotes = lotesCached || null;
    }

    template.datosIniciales = JSON.stringify(datosIniciales);
    return template.evaluate()
      .setTitle('Inducciones | El Libertador')
      .setFaviconUrl('https://www.ellibertador.co/favicon.ico')
      .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL)
      .addMetaTag('viewport', 'width=device-width, initial-scale=1');
  }

  return null; // v1 fallback (not relevant for this test)
}

// ─── Tests ─────────────────────────────────────────────────────────────────────

describe('doGet v2 — Non-blocking cache behavior (Task 11.1)', () => {
  let cacheService;
  let evaluatedOutput;

  beforeEach(() => {
    cacheService = createCacheService({ throwOnLimit: false });
    evaluatedOutput = setupGlobalEnvironment(cacheService);
  });

  describe('Requirement 4.1 — cache-miss no invoca obtenerResumenComercial()', () => {
    it('asigna datosIniciales.resumen = null cuando CacheService retorna null para resumen', () => {
      // No poner nada en caché → cache-miss
      doGet({ parameter: { v: '2' } });

      var datos = JSON.parse(evaluatedOutput.datosIniciales);
      expect(datos.resumen).toBeNull();
    });

    it('NUNCA llama a obtenerResumenComercial() síncronamente', () => {
      doGet({ parameter: { v: '2' } });

      expect(globalThis.obtenerResumenComercial).not.toHaveBeenCalled();
    });

    it('NUNCA llama a obtenerLotesDeComercial() síncronamente', () => {
      doGet({ parameter: { v: '2' } });

      expect(globalThis.obtenerLotesDeComercial).not.toHaveBeenCalled();
    });
  });

  describe('Requirement 4.4 — cache-hit inyecta resumen serializado', () => {
    it('inyecta el resumen desde caché cuando hay cache-hit para comercial', () => {
      var resumenEsperado = { inducciones: 45, pendienteRadicar: 12, errores: 3 };
      cacheService._scriptCache.put(
        'RESUMEN_comercial@test.com',
        JSON.stringify(resumenEsperado),
        60
      );

      doGet({ parameter: { v: '2' } });

      var datos = JSON.parse(evaluatedOutput.datosIniciales);
      expect(datos.resumen).toEqual(resumenEsperado);
    });

    it('inyecta resumen GLOBAL para rol LIDER', () => {
      globalThis.obtenerUsuarioActual_v2 = function() {
        return { email: 'lider@test.com', nombre: 'Líder', rol: 'LIDER', autorizado: true };
      };

      var resumenGlobal = { inducciones: 200, totales: 500 };
      cacheService._scriptCache.put('RESUMEN_GLOBAL', JSON.stringify(resumenGlobal), 60);

      doGet({ parameter: { v: '2' } });

      var datos = JSON.parse(evaluatedOutput.datosIniciales);
      expect(datos.resumen).toEqual(resumenGlobal);
    });

    it('inyecta resumen GLOBAL para rol ADMIN', () => {
      globalThis.obtenerUsuarioActual_v2 = function() {
        return { email: 'admin@test.com', nombre: 'Admin', rol: 'ADMIN', autorizado: true };
      };

      var resumenGlobal = { inducciones: 300, totales: 800 };
      cacheService._scriptCache.put('RESUMEN_GLOBAL', JSON.stringify(resumenGlobal), 60);

      doGet({ parameter: { v: '2' } });

      var datos = JSON.parse(evaluatedOutput.datosIniciales);
      expect(datos.resumen).toEqual(resumenGlobal);
    });
  });

  describe('Requirement 4.5 — Lotes: cache-hit inyecta, cache-miss = null', () => {
    it('asigna datosIniciales.lotes = null cuando no hay caché de lotes', () => {
      doGet({ parameter: { v: '2' } });

      var datos = JSON.parse(evaluatedOutput.datosIniciales);
      expect(datos.lotes).toBeNull();
    });

    it('inyecta lotes desde caché para comercial cuando hay cache-hit', () => {
      var lotesEsperados = [
        { id: 'LOTE-001', fecha: '2025-01-15', registros: 5 },
        { id: 'LOTE-002', fecha: '2025-01-16', registros: 3 }
      ];
      cacheService._scriptCache.put(
        'LOTES_comercial@test.com',
        JSON.stringify(lotesEsperados),
        60
      );

      doGet({ parameter: { v: '2' } });

      var datos = JSON.parse(evaluatedOutput.datosIniciales);
      expect(datos.lotes).toEqual(lotesEsperados);
    });

    it('inyecta LOTES_GLOBAL para rol LIDER', () => {
      globalThis.obtenerUsuarioActual_v2 = function() {
        return { email: 'lider@test.com', nombre: 'Líder', rol: 'LIDER', autorizado: true };
      };

      var lotesGlobal = [{ id: 'G-001', registros: 50 }];
      cacheService._scriptCache.put('LOTES_GLOBAL', JSON.stringify(lotesGlobal), 60);

      doGet({ parameter: { v: '2' } });

      var datos = JSON.parse(evaluatedOutput.datosIniciales);
      expect(datos.lotes).toEqual(lotesGlobal);
    });

    it('usa clave LOTES_GLOBAL para rol ADMIN', () => {
      globalThis.obtenerUsuarioActual_v2 = function() {
        return { email: 'admin@test.com', nombre: 'Admin', rol: 'ADMIN', autorizado: true };
      };

      var lotesGlobal = [{ id: 'G-002', registros: 80 }];
      cacheService._scriptCache.put('LOTES_GLOBAL', JSON.stringify(lotesGlobal), 60);

      doGet({ parameter: { v: '2' } });

      var datos = JSON.parse(evaluatedOutput.datosIniciales);
      expect(datos.lotes).toEqual(lotesGlobal);
    });
  });

  describe('Degradación elegante ante fallo de CacheService', () => {
    it('asigna resumen = null y lotes = null si CacheService falla', () => {
      cacheService._scriptCache.setUnavailable(true);

      doGet({ parameter: { v: '2' } });

      var datos = JSON.parse(evaluatedOutput.datosIniciales);
      expect(datos.resumen).toBeNull();
      expect(datos.lotes).toBeNull();
    });

    it('no lanza excepción si CacheService falla', () => {
      cacheService._scriptCache.setUnavailable(true);

      expect(() => {
        doGet({ parameter: { v: '2' } });
      }).not.toThrow();
    });
  });

  describe('Usuario no autorizado', () => {
    it('no intenta leer caché si usuario no está autorizado', () => {
      globalThis.obtenerUsuarioActual_v2 = function() {
        return { email: 'nadie@test.com', nombre: 'Nadie', rol: null, autorizado: false };
      };

      doGet({ parameter: { v: '2' } });

      var datos = JSON.parse(evaluatedOutput.datosIniciales);
      expect(datos.resumen).toBeUndefined();
      expect(datos.lotes).toBeUndefined();

      // No debió acceder al caché
      var getCalls = cacheService._scriptCache.getCallLog('get');
      expect(getCalls.length).toBe(0);
    });
  });

  describe('Independencia resumen/lotes', () => {
    it('puede tener resumen en caché pero lotes no (y viceversa)', () => {
      var resumen = { inducciones: 10 };
      cacheService._scriptCache.put(
        'RESUMEN_comercial@test.com',
        JSON.stringify(resumen),
        60
      );
      // No poner lotes en caché

      doGet({ parameter: { v: '2' } });

      var datos = JSON.parse(evaluatedOutput.datosIniciales);
      expect(datos.resumen).toEqual(resumen);
      expect(datos.lotes).toBeNull();
    });

    it('puede tener lotes en caché pero resumen no', () => {
      var lotes = [{ id: 'L1' }];
      cacheService._scriptCache.put(
        'LOTES_comercial@test.com',
        JSON.stringify(lotes),
        60
      );
      // No poner resumen en caché

      doGet({ parameter: { v: '2' } });

      var datos = JSON.parse(evaluatedOutput.datosIniciales);
      expect(datos.resumen).toBeNull();
      expect(datos.lotes).toEqual(lotes);
    });
  });
});
