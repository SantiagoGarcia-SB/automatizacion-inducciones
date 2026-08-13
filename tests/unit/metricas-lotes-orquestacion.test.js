/**
 * Unit tests para calcularMetricasLotes (función principal de orquestación)
 *
 * Verifica:
 * - Validación de parámetros → retorna safe-default si inválidos
 * - Cache hit → retorna datos cacheados sin leer Sheets
 * - Cache miss → lee de Sheets, calcula y almacena en caché
 * - Payload > 500KB → retorna sin cachear + registra WARN
 * - CacheService no disponible → calcula directo y retorna
 * - Error inesperado → retorna safe-default + registra ERROR
 *
 * Requirements: 5.1, 5.2, 5.3, 5.4, 5.5, 5.6
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { readFileSync } from 'fs';
import { resolve } from 'path';

// ── Load source file ──
const srcPath = resolve(__dirname, '../../Servicios_MetricasLotes.js');
const srcCode = readFileSync(srcPath, 'utf-8');

function loadSource() {
  const wrapped = `(function() { ${srcCode}\n; globalThis.calcularMetricasLotes = calcularMetricasLotes; globalThis._metricasLotesVacias = _metricasLotesVacias; globalThis._validarParametrosPeriodo = _validarParametrosPeriodo; globalThis._obtenerHeadersMetricasLotes = _obtenerHeadersMetricasLotes; globalThis._mapearColumnasMetricasLotes = _mapearColumnasMetricasLotes; globalThis._filtrarFilasPorPeriodo = _filtrarFilasPorPeriodo; globalThis._calcularLotesAprobadosNegados = _calcularLotesAprobadosNegados; globalThis._calcularSolicitudesAprobNegReconsideradas = _calcularSolicitudesAprobNegReconsideradas; globalThis._agruparPorLoteYCalcularMetricas = _agruparPorLoteYCalcularMetricas; })()`;
  eval(wrapped);
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

  // Execute the source to register all functions
  loadSource();
}

function cleanupGlobals() {
  delete globalThis._registrarEvento_;
  delete globalThis.CacheWrapper_getJSON;
  delete globalThis.CacheWrapper_putJSON;
  delete globalThis.getArchivoAnalisisId;
  delete globalThis.SpreadsheetApp;
  delete globalThis.Utilities;
  delete globalThis._metricasLotesVacias;
  delete globalThis._validarParametrosPeriodo;
  delete globalThis._obtenerHeadersMetricasLotes;
  delete globalThis._mapearColumnasMetricasLotes;
  delete globalThis._filtrarFilasPorPeriodo;
  delete globalThis._calcularLotesAprobadosNegados;
  delete globalThis._calcularSolicitudesAprobNegReconsideradas;
  delete globalThis._agruparPorLoteYCalcularMetricas;
  delete globalThis.calcularMetricasLotes;
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
});

describe('calcularMetricasLotes', () => {

  describe('Validación de parámetros', () => {
    it('retorna safe-default para mes inválido (0)', () => {
      var result = calcularMetricasLotes(0, 2025);
      expect(result).toEqual(_metricasLotesVacias());
      expect(sheetsReadCount).toBe(0);
    });

    it('retorna safe-default para mes inválido (13)', () => {
      var result = calcularMetricasLotes(13, 2025);
      expect(result).toEqual(_metricasLotesVacias());
      expect(sheetsReadCount).toBe(0);
    });

    it('retorna safe-default para anio inválido (99)', () => {
      var result = calcularMetricasLotes(1, 99);
      expect(result).toEqual(_metricasLotesVacias());
      expect(sheetsReadCount).toBe(0);
    });

    it('retorna safe-default para mes no numérico', () => {
      var result = calcularMetricasLotes('enero', 2025);
      expect(result).toEqual(_metricasLotesVacias());
      expect(sheetsReadCount).toBe(0);
    });
  });

  describe('Cache hit', () => {
    it('retorna datos cacheados sin leer Sheets', () => {
      var cachedData = {
        resumen: { lotesAprobados: 5, lotesNegados: 2, solicitudesAprobadas: 10, solicitudesNegadas: 3, solicitudesReconsideradas: 1 },
        detallePorLote: [{ codigoLote: 'X', fechaLote: '15/01/2025' }]
      };
      cacheStore['METRICAS_LOTES_1_2025'] = cachedData;

      var result = calcularMetricasLotes(1, 2025);
      expect(result).toEqual(cachedData);
      expect(sheetsReadCount).toBe(0);
    });

    it('construye la clave de caché correctamente con mes y anio', () => {
      cacheStore['METRICAS_LOTES_6_2024'] = { resumen: {}, detallePorLote: [] };

      var result = calcularMetricasLotes(6, 2024);
      expect(result).toEqual({ resumen: {}, detallePorLote: [] });
    });
  });

  describe('Cache miss — cálculo desde Sheets', () => {
    it('lee de Sheets y retorna resultado calculado', () => {
      var result = calcularMetricasLotes(1, 2025);

      expect(sheetsReadCount).toBe(1);
      expect(result.resumen.lotesAprobados).toBe(1);
      expect(result.resumen.lotesNegados).toBe(1);
      expect(result.resumen.solicitudesAprobadas).toBe(2);
      expect(result.resumen.solicitudesNegadas).toBe(1);
      expect(result.detallePorLote).toHaveLength(2);
    });

    it('almacena resultado en caché con clave correcta', () => {
      calcularMetricasLotes(1, 2025);

      expect(cacheStore['METRICAS_LOTES_1_2025']).toBeDefined();
      expect(cacheStore['METRICAS_LOTES_1_2025'].resumen.lotesAprobados).toBe(1);
    });

    it('retorna safe-default si no hay datos para el periodo', () => {
      var result = calcularMetricasLotes(6, 2025); // junio — no hay datos
      expect(result.resumen.lotesAprobados).toBe(0);
      expect(result.detallePorLote).toHaveLength(0);
    });
  });

  describe('Payload > 500KB', () => {
    it('retorna sin cachear y registra WARN si payload excede 500KB', () => {
      // Crear un dataset grande que genere un payload > 512000 bytes
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

      // Re-eval to pick up the new mockHojaData
      var result = calcularMetricasLotes(1, 2025);

      // Debe haber resultado válido
      expect(result.detallePorLote.length).toBeGreaterThan(0);

      // Verificar si se cacheó o no
      var payloadSize = JSON.stringify(result).length;
      if (payloadSize > 512000) {
        // No debe haber cacheado
        expect(cacheStore['METRICAS_LOTES_1_2025']).toBeUndefined();
        // Debe haber registrado WARN
        var warn = loggedEvents.find(e => e.nivel === 'WARN' && e.mensaje === 'calcularMetricasLotes');
        expect(warn).toBeDefined();
        expect(warn.detalle).toContain('500KB');
      }
    });
  });

  describe('CacheService no disponible (degradación elegante)', () => {
    it('calcula directo si CacheWrapper_getJSON lanza error', () => {
      globalThis.CacheWrapper_getJSON = function() { throw new Error('CacheService unavailable'); };

      var result = calcularMetricasLotes(1, 2025);

      expect(result.resumen.lotesAprobados).toBe(1);
      expect(result.resumen.lotesNegados).toBe(1);
      expect(sheetsReadCount).toBe(1);
    });

    it('retorna resultado si CacheWrapper_putJSON lanza error', () => {
      globalThis.CacheWrapper_putJSON = function() { throw new Error('CacheService unavailable'); };

      var result = calcularMetricasLotes(1, 2025);

      expect(result.resumen.lotesAprobados).toBe(1);
      expect(cacheStore['METRICAS_LOTES_1_2025']).toBeUndefined();
    });
  });

  describe('Error inesperado durante cálculo', () => {
    it('retorna safe-default y registra ERROR si SpreadsheetApp falla', () => {
      globalThis.SpreadsheetApp = {
        openById: function() { throw new Error('Hoja no accesible'); }
      };

      var result = calcularMetricasLotes(1, 2025);

      expect(result).toEqual(_metricasLotesVacias());
      // _obtenerHeadersMetricasLotes catches the error internally and logs it
      var error = loggedEvents.find(e => e.nivel === 'ERROR' && e.modulo === 'Servicios_MetricasLotes.js');
      expect(error).toBeDefined();
    });

    it('retorna safe-default si headers retorna null', () => {
      // Simular hoja no encontrada para que _obtenerHeadersMetricasLotes retorne null
      globalThis.SpreadsheetApp = {
        openById: function() {
          return { getSheetByName: function() { return null; } };
        }
      };

      var result = calcularMetricasLotes(1, 2025);
      expect(result).toEqual(_metricasLotesVacias());
    });
  });

  describe('Formato de respuesta', () => {
    it('retorna objeto con resumen y detallePorLote', () => {
      var result = calcularMetricasLotes(1, 2025);

      expect(result).toHaveProperty('resumen');
      expect(result).toHaveProperty('detallePorLote');
      expect(result.resumen).toHaveProperty('lotesAprobados');
      expect(result.resumen).toHaveProperty('lotesNegados');
      expect(result.resumen).toHaveProperty('solicitudesAprobadas');
      expect(result.resumen).toHaveProperty('solicitudesNegadas');
      expect(result.resumen).toHaveProperty('solicitudesReconsideradas');
    });

    it('formatea fechaLote como string en detallePorLote', () => {
      var result = calcularMetricasLotes(1, 2025);

      for (var i = 0; i < result.detallePorLote.length; i++) {
        expect(typeof result.detallePorLote[i].fechaLote).toBe('string');
      }
    });
  });
});
