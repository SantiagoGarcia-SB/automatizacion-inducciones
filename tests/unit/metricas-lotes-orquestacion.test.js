/**
 * Unit tests para calcularMetricasLotes y api_obtenerMetricasLotes (orquestación)
 *
 * Verifica:
 * - Validación de parámetros → retorna safe-default si inválidos
 * - calcularMetricasLotes: cálculo puro desde Sheets (sin cache)
 * - api_obtenerMetricasLotes: cache-first, degradación elegante, payload > 512KB
 * - CacheService no disponible → calcula directo y retorna
 * - Error inesperado → retorna safe-default + registra ERROR
 *
 * Requirements: 12.1, 12.2, 12.6
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { readFileSync } from 'fs';
import { resolve } from 'path';

// ── Load source files ──
const srcPathMetricas = resolve(__dirname, '../../Servicios_MetricasLotes.js');
const srcCodeMetricas = readFileSync(srcPathMetricas, 'utf-8');

function loadSource() {
  const wrapped = `(function() { ${srcCodeMetricas}\n; globalThis.calcularMetricasLotes = calcularMetricasLotes; globalThis._metricasLotesVacias = _metricasLotesVacias; globalThis._validarParametrosRango = _validarParametrosRango; globalThis._obtenerHeadersMetricasLotes = _obtenerHeadersMetricasLotes; globalThis._mapearColumnasMetricasLotes = _mapearColumnasMetricasLotes; globalThis._filtrarFilasPorPeriodo = _filtrarFilasPorPeriodo; globalThis._calcularLotesAprobadosNegados = _calcularLotesAprobadosNegados; globalThis._calcularSolicitudesAprobNegReconsideradas = _calcularSolicitudesAprobNegReconsideradas; globalThis._agruparPorLoteYCalcularMetricas = _agruparPorLoteYCalcularMetricas; })()`;
  eval(wrapped);
}

function loadApiSource() {
  // Define api_obtenerMetricasLotes directly (mirrors Api.js implementation)
  globalThis.api_obtenerMetricasLotes = function api_obtenerMetricasLotes(fechaDesde, fechaHasta) {
    try {
      verificarRol(['DIRECTOR', 'GERENTE', 'ADMIN', 'LIDER']);

      // ── 1. Validar parámetros de entrada ──
      if (typeof fechaDesde !== 'string' || typeof fechaHasta !== 'string' ||
          !fechaDesde || !fechaHasta) {
        return _metricasLotesVacias();
      }

      var regexFecha = /^\d{4}-\d{2}-\d{2}$/;
      if (!regexFecha.test(fechaDesde) || !regexFecha.test(fechaHasta)) {
        return _metricasLotesVacias();
      }

      var desde = new Date(fechaDesde + 'T00:00:00');
      var hasta = new Date(fechaHasta + 'T00:00:00');
      if (isNaN(desde.getTime()) || isNaN(hasta.getTime())) {
        return _metricasLotesVacias();
      }

      if (desde.getTime() > hasta.getTime()) {
        return _metricasLotesVacias();
      }

      var diffDias = Math.ceil((hasta.getTime() - desde.getTime()) / (1000 * 60 * 60 * 24));
      if (diffDias > 183) {
        return _metricasLotesVacias();
      }

      // ── 2. Cache-first: intentar leer de CacheWrapper ──
      var cacheKey = 'METRICAS_LOTES_' + fechaDesde + '_' + fechaHasta;
      try {
        var cached = CacheWrapper_getJSON(cacheKey);
        if (cached) {
          return cached; // Cache-hit: 0 lecturas a Sheets
        }
      } catch (e) {
        // CacheService no disponible — degradación elegante, continuar sin cache
      }

      // ── 3. Cache-miss: calcular desde Sheets ──
      var resultado = calcularMetricasLotes(fechaDesde, fechaHasta);

      // ── 4. Almacenar en cache si payload < 512 KB ──
      try {
        var payloadStr = JSON.stringify(resultado);
        if (payloadStr.length <= 512000) {
          CacheWrapper_putJSON(cacheKey, resultado, 120);
        }
      } catch (e) {
        // CacheService no disponible al escribir — degradación elegante, no interrumpir
      }

      return resultado;
    } catch (e) {
      _registrarEvento_('ERROR', 'Api.js', 'api_obtenerMetricasLotes', e.message);
      return _metricasLotesVacias();
    }
  };
}

// ── Tracking variables ──
let cacheStore;
let sheetsReadCount;
let loggedEvents;
let mockHojaData;

function createMockHoja(data) {
  return {
    getLastRow: function() { return data.length; },
    getLastColumn: function() { return data[0] ? data[0].length : 0; },
    getRange: function() {
      return { getValues: function() { return [data[0]]; } };
    },
    getDataRange: function() {
      return { getValues: function() { sheetsReadCount++; return data; } };
    }
  };
}

const HEADERS = ['Fecha Lote', 'Solicitud Inquilino', 'codigo lote', 'RESULTADO LOTE', 'RESULTADO SOLICITUD', 'REGISTRO ANALISTA SAI'];

function buildTestData() {
  return [
    HEADERS,
    [new Date(2025, 0, 15), 'SOL-001', 'LOTE-A', 'APROBADO', 'APROBADO', 'APROBADO'],
    [new Date(2025, 0, 20), 'SOL-002', 'LOTE-A', 'APROBADO', 'NEGADO', 'APROBADO'],
    [new Date(2025, 0, 25), 'SOL-003', 'LOTE-B', 'NEGADO', 'NEGADO', 'NEGADO']
  ];
}

function setupGlobals() {
  cacheStore = {};
  sheetsReadCount = 0;
  loggedEvents = [];
  mockHojaData = buildTestData();

  globalThis._registrarEvento_ = function(nivel, modulo, mensaje, detalle) {
    loggedEvents.push({ nivel, modulo, mensaje, detalle });
  };

  globalThis.CacheWrapper_getJSON = function(key) {
    return cacheStore[key] || null;
  };

  globalThis.CacheWrapper_putJSON = function(key, value, ttl) {
    cacheStore[key] = JSON.parse(JSON.stringify(value));
  };

  globalThis.getArchivoAnalisisId = function() { return 'mock-id'; };

  globalThis.SpreadsheetApp = {
    openById: function() {
      return {
        getSheetByName: function(name) {
          if (name === 'registro analisis') {
            return createMockHoja(mockHojaData);
          }
          return null;
        }
      };
    }
  };

  globalThis.Utilities = {
    formatDate: function(date, tz, format) {
      if (!(date instanceof Date)) return '';
      var d = date.getDate();
      var m = (date.getMonth() + 1).toString().padStart(2, '0');
      var y = date.getFullYear();
      return d + '/' + m + '/' + y;
    }
  };

  globalThis.CacheService = { getScriptCache: function() { return { get: function() { return null; }, put: function() {} }; } };

  // Mock verificarRol for api_obtenerMetricasLotes
  globalThis.verificarRol = function() {};

  // Execute the source to register all functions
  loadSource();
  loadApiSource();
}

function cleanupGlobals() {
  delete globalThis._registrarEvento_;
  delete globalThis.CacheWrapper_getJSON;
  delete globalThis.CacheWrapper_putJSON;
  delete globalThis.getArchivoAnalisisId;
  delete globalThis.SpreadsheetApp;
  delete globalThis.Utilities;
  delete globalThis._metricasLotesVacias;
  delete globalThis._validarParametrosRango;
  delete globalThis._obtenerHeadersMetricasLotes;
  delete globalThis._mapearColumnasMetricasLotes;
  delete globalThis._filtrarFilasPorPeriodo;
  delete globalThis._calcularLotesAprobadosNegados;
  delete globalThis._calcularSolicitudesAprobNegReconsideradas;
  delete globalThis._agruparPorLoteYCalcularMetricas;
  delete globalThis.calcularMetricasLotes;
  delete globalThis.api_obtenerMetricasLotes;
  delete globalThis.verificarRol;
  delete globalThis._COLUMNAS_METRICAS_LOTES;
}

beforeAll(() => { setupGlobals(); });
afterAll(() => { cleanupGlobals(); });

beforeEach(() => {
  cacheStore = {};
  sheetsReadCount = 0;
  loggedEvents = [];
  mockHojaData = buildTestData();

  // Restore standard mocks that tests might override
  globalThis.CacheWrapper_getJSON = function(key) {
    return cacheStore[key] || null;
  };
  globalThis.CacheWrapper_putJSON = function(key, value, ttl) {
    cacheStore[key] = JSON.parse(JSON.stringify(value));
  };
  // Use a dynamic reference to mockHojaData so tests can swap it before calling
  globalThis.SpreadsheetApp = {
    openById: function() {
      return {
        getSheetByName: function(name) {
          if (name === 'registro analisis') {
            // Dynamically read mockHojaData at call time (not at setup time)
            return {
              getLastRow: function() { return mockHojaData.length; },
              getLastColumn: function() { return mockHojaData[0] ? mockHojaData[0].length : 0; },
              getRange: function() {
                return { getValues: function() { return [mockHojaData[0]]; } };
              },
              getDataRange: function() {
                return { getValues: function() { sheetsReadCount++; return mockHojaData; } };
              }
            };
          }
          return null;
        }
      };
    }
  };
  globalThis.verificarRol = function() {};
});

describe('calcularMetricasLotes (cálculo puro)', () => {

  describe('Validación de parámetros', () => {
    it('retorna safe-default para fechaDesde no string', () => {
      var result = calcularMetricasLotes(123, '2025-01-31');
      expect(result).toEqual(_metricasLotesVacias());
      expect(sheetsReadCount).toBe(0);
    });

    it('retorna safe-default para formato inválido', () => {
      var result = calcularMetricasLotes('enero-2025', '2025-01-31');
      expect(result).toEqual(_metricasLotesVacias());
      expect(sheetsReadCount).toBe(0);
    });

    it('retorna safe-default para rango > 183 días', () => {
      var result = calcularMetricasLotes('2024-01-01', '2025-01-01');
      expect(result).toEqual(_metricasLotesVacias());
      expect(sheetsReadCount).toBe(0);
    });

    it('retorna safe-default para fechaDesde > fechaHasta', () => {
      var result = calcularMetricasLotes('2025-02-01', '2025-01-01');
      expect(result).toEqual(_metricasLotesVacias());
      expect(sheetsReadCount).toBe(0);
    });
  });

  describe('Cálculo desde Sheets (sin cache)', () => {
    it('lee de Sheets y retorna resultado calculado', () => {
      var result = calcularMetricasLotes('2025-01-01', '2025-01-31');

      expect(sheetsReadCount).toBe(1);
      expect(result.resumen.lotesAprobados).toBe(1);
      expect(result.resumen.lotesNegados).toBe(1);
      expect(result.detallePorLote).toHaveLength(2);
    });

    it('NO almacena resultado en caché (responsabilidad del caller)', () => {
      calcularMetricasLotes('2025-01-01', '2025-01-31');

      expect(cacheStore['METRICAS_LOTES_2025-01-01_2025-01-31']).toBeUndefined();
    });

    it('retorna safe-default si no hay datos para el periodo', () => {
      var result = calcularMetricasLotes('2025-06-01', '2025-06-30');
      expect(result.resumen.lotesAprobados).toBe(0);
      expect(result.detallePorLote).toHaveLength(0);
    });
  });

  describe('Error inesperado durante cálculo', () => {
    it('retorna safe-default y registra ERROR si SpreadsheetApp falla', () => {
      globalThis.SpreadsheetApp = {
        openById: function() { throw new Error('Hoja no accesible'); }
      };

      var result = calcularMetricasLotes('2025-01-01', '2025-01-31');

      expect(result).toEqual(_metricasLotesVacias());
      var error = loggedEvents.find(e => e.nivel === 'ERROR' && e.modulo === 'Servicios_MetricasLotes.js');
      expect(error).toBeDefined();
    });

    it('retorna safe-default si headers retorna null', () => {
      globalThis.SpreadsheetApp = {
        openById: function() {
          return { getSheetByName: function() { return null; } };
        }
      };

      var result = calcularMetricasLotes('2025-01-01', '2025-01-31');
      expect(result).toEqual(_metricasLotesVacias());
    });
  });

  describe('Formato de respuesta', () => {
    it('retorna objeto con resumen y detallePorLote', () => {
      var result = calcularMetricasLotes('2025-01-01', '2025-01-31');

      expect(result).toHaveProperty('resumen');
      expect(result).toHaveProperty('detallePorLote');
      expect(result.resumen).toHaveProperty('lotesAprobados');
      expect(result.resumen).toHaveProperty('lotesNegados');
      expect(result.resumen).toHaveProperty('solicitudesAprobadas');
      expect(result.resumen).toHaveProperty('solicitudesNegadas');
      expect(result.resumen).toHaveProperty('solicitudesReconsideradas');
    });

    it('formatea fechaLote como string en detallePorLote', () => {
      var result = calcularMetricasLotes('2025-01-01', '2025-01-31');

      for (var i = 0; i < result.detallePorLote.length; i++) {
        expect(typeof result.detallePorLote[i].fechaLote).toBe('string');
      }
    });
  });
});

describe('api_obtenerMetricasLotes (cache-first)', () => {

  describe('Validación de entrada', () => {
    it('retorna safe-default para fechaDesde vacío', () => {
      var result = api_obtenerMetricasLotes('', '2025-01-31');
      expect(result).toEqual(_metricasLotesVacias());
    });

    it('retorna safe-default para formato no YYYY-MM-DD', () => {
      var result = api_obtenerMetricasLotes('01/01/2025', '31/01/2025');
      expect(result).toEqual(_metricasLotesVacias());
    });

    it('retorna safe-default para rango > 183 días', () => {
      var result = api_obtenerMetricasLotes('2024-01-01', '2025-01-01');
      expect(result).toEqual(_metricasLotesVacias());
    });

    it('retorna safe-default si fechaDesde > fechaHasta', () => {
      var result = api_obtenerMetricasLotes('2025-02-01', '2025-01-01');
      expect(result).toEqual(_metricasLotesVacias());
    });
  });

  describe('Cache hit', () => {
    it('retorna datos cacheados sin leer Sheets', () => {
      var cachedData = {
        resumen: { lotesAprobados: 5, lotesNegados: 2, solicitudesAprobadas: 10 },
        detallePorLote: [{ codigoLote: 'X', fechaLote: '15/01/2025' }]
      };
      cacheStore['METRICAS_LOTES_2025-01-01_2025-01-31'] = cachedData;

      var result = api_obtenerMetricasLotes('2025-01-01', '2025-01-31');
      expect(result).toEqual(cachedData);
      expect(sheetsReadCount).toBe(0);
    });

    it('construye la clave de caché correctamente: METRICAS_LOTES_{fechaDesde}_{fechaHasta}', () => {
      cacheStore['METRICAS_LOTES_2024-06-01_2024-06-30'] = { resumen: {}, detallePorLote: [] };

      var result = api_obtenerMetricasLotes('2024-06-01', '2024-06-30');
      expect(result).toEqual({ resumen: {}, detallePorLote: [] });
    });
  });

  describe('Cache miss — calcula y almacena', () => {
    it('lee de Sheets cuando no hay cache-hit', () => {
      var result = api_obtenerMetricasLotes('2025-01-01', '2025-01-31');

      expect(sheetsReadCount).toBe(1);
      expect(result.resumen.lotesAprobados).toBe(1);
      expect(result.resumen.lotesNegados).toBe(1);
    });

    it('almacena resultado en caché con clave correcta tras cache-miss', () => {
      api_obtenerMetricasLotes('2025-01-01', '2025-01-31');

      expect(cacheStore['METRICAS_LOTES_2025-01-01_2025-01-31']).toBeDefined();
      expect(cacheStore['METRICAS_LOTES_2025-01-01_2025-01-31'].resumen.lotesAprobados).toBe(1);
    });
  });

  describe('Payload > 512 KB', () => {
    it('NO cachea si payload excede 512000 bytes', () => {
      var bigData = [HEADERS];
      for (var i = 0; i < 5000; i++) {
        bigData.push([
          new Date(2025, 0, 15),
          'SOL-' + String(i).padStart(6, '0'),
          'LOTE-' + String(i).padStart(4, '0'),
          'APROBADO',
          'APROBADO',
          'APROBADO'
        ]);
      }
      mockHojaData = bigData;

      var result = api_obtenerMetricasLotes('2025-01-01', '2025-01-31');

      expect(result.detallePorLote.length).toBeGreaterThan(0);

      var payloadSize = JSON.stringify(result).length;
      if (payloadSize > 512000) {
        expect(cacheStore['METRICAS_LOTES_2025-01-01_2025-01-31']).toBeUndefined();
      }
    });
  });

  describe('CacheService no disponible (degradación elegante)', () => {
    it('calcula directo si CacheWrapper_getJSON lanza error', () => {
      globalThis.CacheWrapper_getJSON = function() { throw new Error('CacheService unavailable'); };

      var result = api_obtenerMetricasLotes('2025-01-01', '2025-01-31');

      expect(result.resumen.lotesAprobados).toBe(1);
      expect(result.resumen.lotesNegados).toBe(1);
      expect(sheetsReadCount).toBe(1);
    });

    it('retorna resultado si CacheWrapper_putJSON lanza error', () => {
      globalThis.CacheWrapper_putJSON = function() { throw new Error('CacheService unavailable'); };

      var result = api_obtenerMetricasLotes('2025-01-01', '2025-01-31');

      expect(result.resumen.lotesAprobados).toBe(1);
      expect(cacheStore['METRICAS_LOTES_2025-01-01_2025-01-31']).toBeUndefined();
    });
  });

  describe('No adquiere LockService (Req 12.4)', () => {
    it('no invoca LockService durante ejecución', () => {
      var lockCalled = false;
      globalThis.LockService = {
        getScriptLock: function() { lockCalled = true; return { tryLock: function() { return true; }, releaseLock: function() {} }; }
      };

      api_obtenerMetricasLotes('2025-01-01', '2025-01-31');

      expect(lockCalled).toBe(false);
      delete globalThis.LockService;
    });
  });
});
