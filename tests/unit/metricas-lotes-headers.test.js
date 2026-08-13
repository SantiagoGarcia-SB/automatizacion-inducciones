/**
 * Unit tests para Servicios_MetricasLotes.js — lectura de headers y mapeo de columnas
 *
 * Verifica:
 * - _obtenerHeadersMetricasLotes() lee headers desde hoja y los cachea con TTL 300s
 * - _obtenerHeadersMetricasLotes() retorna desde caché si existe (cache-hit)
 * - _obtenerHeadersMetricasLotes() retorna null + registra ERROR si hoja no existe
 * - _obtenerHeadersMetricasLotes() degrada elegantemente si CacheService no disponible
 * - _mapearColumnasMetricasLotes() mapea correctamente las 6 columnas requeridas
 * - _mapearColumnasMetricasLotes() retorna null + registra ERROR si falta columna
 * - _mapearColumnasMetricasLotes() soporta variaciones de case en headers
 *
 * Requirements: 5.3, 1.6
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { createSpreadsheetApp } from '../mocks/spreadsheet-app.mock.js';
import { createCacheService } from '../mocks/cache-service.mock.js';

// ─── Headers completos de la hoja "registro analisis" (mínimo para métricas) ──

const HEADERS_COMPLETOS = [
  'Fecha Lote', 'Solicitud Inquilino', 'codigo lote',
  'RESULTADO LOTE', 'RESULTADO SOLICITUD', 'REGISTRO ANALISTA SAI',
  'Otro Campo', 'Arrendatario'
];

// ─── Setup global para simular entorno GAS ─────────────────────────────────────

let cacheService;
let logEventos;

function setupGlobals(sheetsConfig, cacheOptions) {
  cacheService = createCacheService(cacheOptions || {});
  globalThis.CacheService = cacheService;
  logEventos = [];

  const app = createSpreadsheetApp(sheetsConfig || {
    'registro analisis': [HEADERS_COMPLETOS]
  });
  globalThis.SpreadsheetApp = app;
  globalThis.SpreadsheetRegistry_get = () => app._spreadsheet;

  globalThis.getArchivoAnalisisId = () => 'mock-analisis-id';

  globalThis._registrarEvento_ = function(nivel, modulo, mensaje, detalle) {
    logEventos.push({ nivel, modulo, mensaje, detalle });
  };

  // CacheWrapper — versión simplificada que delega a CacheService
  globalThis.CacheWrapper_getJSON = function(key) {
    try {
      var cache = CacheService.getScriptCache();
      var raw = cache.get(key);
      if (!raw) return null;
      return JSON.parse(raw);
    } catch (e) {
      return null;
    }
  };

  globalThis.CacheWrapper_putJSON = function(key, obj, ttlSegundos) {
    var ttl = ttlSegundos || 600;
    try {
      var json = JSON.stringify(obj);
      var cache = CacheService.getScriptCache();
      cache.put(key, json, ttl);
    } catch (e) {
      // Degradación elegante
    }
  };

  // Cargar el código fuente
  loadSource();
}

function loadSource() {
  const fs = require('fs');
  const path = require('path');
  const sourceCode = fs.readFileSync(
    path.resolve(__dirname, '../../Servicios_MetricasLotes.js'),
    'utf-8'
  );
  const wrapped = `(function() { ${sourceCode}\n; globalThis._obtenerHeadersMetricasLotes = _obtenerHeadersMetricasLotes; globalThis._mapearColumnasMetricasLotes = _mapearColumnasMetricasLotes; globalThis._metricasLotesVacias = _metricasLotesVacias; globalThis._COLUMNAS_METRICAS_LOTES = _COLUMNAS_METRICAS_LOTES; })()`;
  eval(wrapped);
}

function cleanupGlobals() {
  delete globalThis.CacheService;
  delete globalThis.SpreadsheetApp;
  delete globalThis.getArchivoAnalisisId;
  delete globalThis._registrarEvento_;
  delete globalThis.CacheWrapper_getJSON;
  delete globalThis.CacheWrapper_putJSON;
  delete globalThis._obtenerHeadersMetricasLotes;
  delete globalThis._mapearColumnasMetricasLotes;
  delete globalThis._metricasLotesVacias;
  delete globalThis._COLUMNAS_METRICAS_LOTES;
}

// ─── Tests ─────────────────────────────────────────────────────────────────────

describe('_obtenerHeadersMetricasLotes', () => {
  afterEach(cleanupGlobals);

  it('lee headers de la hoja y los retorna como array de strings trimmed', () => {
    setupGlobals({
      'registro analisis': [['  Fecha Lote  ', 'Solicitud Inquilino', 'codigo lote', 'RESULTADO LOTE', 'RESULTADO SOLICITUD', 'REGISTRO ANALISTA SAI']]
    });

    var result = _obtenerHeadersMetricasLotes();
    expect(result).toEqual([
      'Fecha Lote', 'Solicitud Inquilino', 'codigo lote',
      'RESULTADO LOTE', 'RESULTADO SOLICITUD', 'REGISTRO ANALISTA SAI'
    ]);
  });

  it('cachea headers con clave HDR_METRICAS_LOTES y TTL 300s', () => {
    setupGlobals({
      'registro analisis': [HEADERS_COMPLETOS]
    });

    _obtenerHeadersMetricasLotes();

    // Verificar que se almacenó en caché
    var cached = CacheWrapper_getJSON('HDR_METRICAS_LOTES');
    expect(cached).not.toBeNull();
    expect(cached).toEqual(HEADERS_COMPLETOS);

    // Verificar TTL 300s
    var putCalls = cacheService._scriptCache.getCallLog('put');
    var hdrPut = putCalls.find(c => c.key === 'HDR_METRICAS_LOTES');
    expect(hdrPut).toBeDefined();
    expect(hdrPut.ttl).toBe(300);
  });

  it('retorna desde caché sin leer Sheets en cache-hit', () => {
    setupGlobals({
      'registro analisis': [HEADERS_COMPLETOS]
    });

    // Pre-poblar caché
    CacheWrapper_putJSON('HDR_METRICAS_LOTES', ['Col1', 'Col2'], 300);

    // Resetear logs del sheet para verificar que NO se lee
    var sheet = SpreadsheetApp.openById('any')._sheets['registro analisis'];
    sheet.resetCallLog();

    var result = _obtenerHeadersMetricasLotes();
    expect(result).toEqual(['Col1', 'Col2']);

    // No debe haber llamado getRange en la hoja
    var rangeCalls = sheet.getCallLog('getRange');
    expect(rangeCalls).toHaveLength(0);
  });

  it('retorna null y registra ERROR si hoja no existe', () => {
    setupGlobals({
      'otra_hoja': [['algo']]
    });

    var result = _obtenerHeadersMetricasLotes();
    expect(result).toBeNull();

    // Verificar que se registró el error
    expect(logEventos).toHaveLength(1);
    expect(logEventos[0].nivel).toBe('ERROR');
    expect(logEventos[0].modulo).toBe('Servicios_MetricasLotes.js');
    expect(logEventos[0].mensaje).toBe('_obtenerHeadersMetricasLotes');
    expect(logEventos[0].detalle).toContain('no encontrada');
  });

  it('retorna null y registra ERROR si openById falla', () => {
    setupGlobals({
      'registro analisis': [HEADERS_COMPLETOS]
    });

    // Forzar error en openById
    globalThis.SpreadsheetApp = {
      openById: function() { throw new Error('Permission denied'); }
    };

    var result = _obtenerHeadersMetricasLotes();
    expect(result).toBeNull();

    expect(logEventos).toHaveLength(1);
    expect(logEventos[0].nivel).toBe('ERROR');
    expect(logEventos[0].detalle).toContain('Permission denied');
  });

  it('funciona sin caché si CacheService no está disponible (degradación elegante)', () => {
    setupGlobals(
      { 'registro analisis': [HEADERS_COMPLETOS] },
      { simulateUnavailable: true }
    );

    // CacheWrapper_getJSON retornará null (caché inaccesible)
    // CacheWrapper_putJSON fallará silenciosamente
    // Pero la función debe seguir leyendo de la hoja
    var result = _obtenerHeadersMetricasLotes();
    expect(result).toEqual(HEADERS_COMPLETOS);
    expect(logEventos).toHaveLength(0); // Sin errores
  });
});

describe('_mapearColumnasMetricasLotes', () => {
  afterEach(cleanupGlobals);

  it('mapea correctamente las 6 columnas requeridas', () => {
    setupGlobals();

    var headers = ['Fecha Lote', 'Solicitud Inquilino', 'codigo lote', 'RESULTADO LOTE', 'RESULTADO SOLICITUD', 'REGISTRO ANALISTA SAI'];
    var mapa = _mapearColumnasMetricasLotes(headers);

    expect(mapa).toEqual({
      fechaLote: 0,
      solicitudInquilino: 1,
      codigoLote: 2,
      resultadoLote: 3,
      resultadoSolicitud: 4,
      registroAnalistaSai: 5,
      sucursal: -1
    });
  });

  it('mapea correctamente cuando las columnas están en posiciones distintas', () => {
    setupGlobals();

    var headers = ['ID', 'Otro', 'Fecha Lote', 'Dato', 'codigo lote', 'Solicitud Inquilino', 'RESULTADO LOTE', 'RESULTADO SOLICITUD', 'Extra', 'REGISTRO ANALISTA SAI'];
    var mapa = _mapearColumnasMetricasLotes(headers);

    expect(mapa).toEqual({
      fechaLote: 2,
      solicitudInquilino: 5,
      codigoLote: 4,
      resultadoLote: 6,
      resultadoSolicitud: 7,
      registroAnalistaSai: 9,
      sucursal: -1
    });
  });

  it('busca columnas de forma case-insensitive', () => {
    setupGlobals();

    var headers = ['fecha lote', 'solicitud inquilino', 'Codigo Lote', 'resultado lote', 'Resultado Solicitud', 'registro analista sai'];
    var mapa = _mapearColumnasMetricasLotes(headers);

    expect(mapa).not.toBeNull();
    expect(mapa.fechaLote).toBe(0);
    expect(mapa.solicitudInquilino).toBe(1);
    expect(mapa.codigoLote).toBe(2);
    expect(mapa.resultadoLote).toBe(3);
    expect(mapa.resultadoSolicitud).toBe(4);
    expect(mapa.registroAnalistaSai).toBe(5);
  });

  it('retorna null y registra ERROR si falta una columna requerida', () => {
    setupGlobals();

    var headers = ['Fecha Lote', 'Solicitud Inquilino', 'codigo lote', 'RESULTADO LOTE'];
    // Faltan: RESULTADO SOLICITUD y REGISTRO ANALISTA SAI

    var mapa = _mapearColumnasMetricasLotes(headers);
    expect(mapa).toBeNull();

    expect(logEventos).toHaveLength(1);
    expect(logEventos[0].nivel).toBe('ERROR');
    expect(logEventos[0].detalle).toContain('RESULTADO SOLICITUD');
    expect(logEventos[0].detalle).toContain('REGISTRO ANALISTA SAI');
  });

  it('retorna null si headers es null', () => {
    setupGlobals();
    expect(_mapearColumnasMetricasLotes(null)).toBeNull();
  });

  it('retorna null si headers no es un array', () => {
    setupGlobals();
    expect(_mapearColumnasMetricasLotes('no es array')).toBeNull();
  });

  it('retorna null si headers es array vacío (no contiene ninguna columna)', () => {
    setupGlobals();
    var mapa = _mapearColumnasMetricasLotes([]);
    expect(mapa).toBeNull();
    expect(logEventos.length).toBeGreaterThan(0);
    expect(logEventos[0].nivel).toBe('ERROR');
  });
});
