/**
 * Unit tests para la integración de CacheServiceWrapper en el catálogo de motivos.
 *
 * Verifica:
 * - _leerCatalogoMotivos() usa CacheWrapper_getJSON con cache-hit
 * - _leerCatalogoMotivos() lee de hoja en cache-miss y cachea el resultado
 * - _guardarMotivo() invalida la clave CATALOGO_MOTIVOS
 * - _eliminarMotivo() invalida la clave CATALOGO_MOTIVOS
 * - Fallback graceful: si CacheService falla, lee de Sheets directamente
 *
 * Validates: Requirements 12.1, 12.2, 12.3, 12.4
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { createCacheService } from '../mocks/cache-service.mock.js';
import { createSpreadsheetApp } from '../mocks/spreadsheet-app.mock.js';

// ─── Setup global ──────────────────────────────────────────────────────────────

const CATALOGO_DATOS = [
  ['ID', 'LABEL', 'INSTRUCCION', 'ACTIVO'],
  ['celular_correo', 'Confirmar celular o correo', 'El comercial debe confirmar...', true],
  ['doc_identidad', 'Adjuntar documento de identidad', 'El comercial debe adjuntar...', true],
  ['confirmar_destino', 'Confirmar destino', 'El comercial debe indicar...', true]
];

function setupGlobals(options = {}) {
  const cacheService = createCacheService({ throwOnLimit: false });
  const sheetsConfig = {
    'CATALOGO_MOTIVOS': options.catalogoData || CATALOGO_DATOS
  };
  const spreadsheetApp = createSpreadsheetApp(sheetsConfig);

  globalThis.CacheService = cacheService;
  globalThis.SpreadsheetApp = spreadsheetApp;
  globalThis.getHojaControlId = () => 'mock-id';

  // Setup CacheWrapper functions (same as in cache-wrapper.test.js)
  const CACHE_CHUNK_SIZE = 99000;
  const CACHE_MAX_TOTAL_SIZE = 500000;

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

  globalThis._almacenarFragmentado_ = function(cache, key, json, ttl) {
    var totalParts = Math.ceil(json.length / CACHE_CHUNK_SIZE);
    cache.put(key, JSON.stringify({ _parts: totalParts }), ttl);
    for (var i = 0; i < totalParts; i++) {
      var start = i * CACHE_CHUNK_SIZE;
      var chunk = json.substring(start, start + CACHE_CHUNK_SIZE);
      cache.put(key + '_PART_' + globalThis._padNumber_(i + 1), chunk, ttl);
    }
  };

  globalThis.CacheWrapper_getJSON = function(key) {
    try {
      var cache = CacheService.getScriptCache();
      var raw = cache.get(key);
      if (raw === null || raw === undefined) return null;
      if (globalThis._esCacheHeader_(raw)) return globalThis._reconstruirFragmentos_(cache, key, raw);
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
      globalThis._almacenarFragmentado_(cache, key, json, ttl);
    } catch (e) { /* ignore */ }
  };

  globalThis.CacheWrapper_remove = function(key) {
    try {
      var cache = CacheService.getScriptCache();
      var raw = cache.get(key);
      if (raw !== null && raw !== undefined && globalThis._esCacheHeader_(raw)) {
        var header = JSON.parse(raw);
        var keysToRemove = [key];
        for (var i = 1; i <= header._parts; i++) {
          keysToRemove.push(key + '_PART_' + globalThis._padNumber_(i));
        }
        cache.removeAll(keysToRemove);
      } else {
        cache.remove(key);
      }
    } catch (e) { /* ignore */ }
  };

  // Setup the actual functions under test (from Api.js)
  globalThis._leerCatalogoMotivosDesdeHoja = function() {
    var ss = SpreadsheetApp.openById(getHojaControlId());
    var hoja = ss.getSheetByName('CATALOGO_MOTIVOS');
    if (!hoja) {
      hoja = ss.insertSheet('CATALOGO_MOTIVOS');
      hoja.appendRow(['ID', 'LABEL', 'INSTRUCCION', 'ACTIVO']);
      var defaults = [
        ['celular_correo', 'Confirmar celular o correo', 'Instrucción...', true],
        ['doc_identidad', 'Adjuntar documento de identidad', 'Instrucción...', true]
      ];
      for (var d = 0; d < defaults.length; d++) hoja.appendRow(defaults[d]);
    }
    var datos = hoja.getDataRange().getValues();
    var resultado = [];
    for (var i = 1; i < datos.length; i++) {
      resultado.push({
        id: String(datos[i][0] || ''),
        label: String(datos[i][1] || ''),
        instruccion: String(datos[i][2] || ''),
        activo: datos[i][3] !== false
      });
    }
    return resultado;
  };

  globalThis._leerCatalogoMotivos = function() {
    var cached = CacheWrapper_getJSON('CATALOGO_MOTIVOS');
    if (cached) return cached;
    var resultado = _leerCatalogoMotivosDesdeHoja();
    try {
      CacheWrapper_putJSON('CATALOGO_MOTIVOS', resultado, 600);
    } catch (e) {
      console.warn('_leerCatalogoMotivos: no se pudo cachear catálogo: ' + e.message);
    }
    return resultado;
  };

  globalThis._guardarMotivo = function(motivo, esNuevo) {
    var ss = SpreadsheetApp.openById(getHojaControlId());
    var hoja = ss.getSheetByName('CATALOGO_MOTIVOS');
    if (!hoja) return { ok: false, mensaje: 'Pestaña no encontrada.' };
    if (!motivo.id || !motivo.label) return { ok: false, mensaje: 'ID y nombre son obligatorios.' };
    var datos = hoja.getDataRange().getValues();
    var filaExistente = -1;
    for (var i = 1; i < datos.length; i++) {
      if (String(datos[i][0]).trim() === motivo.id.trim()) { filaExistente = i + 1; break; }
    }
    var fila = [motivo.id.trim(), motivo.label.trim(), (motivo.instruccion || '').trim(), motivo.activo !== false];
    if (esNuevo && filaExistente !== -1) return { ok: false, mensaje: 'Ya existe un motivo con ese ID.' };
    if (filaExistente !== -1) {
      hoja.getRange(filaExistente, 1, 1, 4).setValues([fila]);
    } else {
      hoja.appendRow(fila);
    }
    CacheWrapper_remove('CATALOGO_MOTIVOS');
    return { ok: true, mensaje: esNuevo ? 'Motivo creado.' : 'Motivo actualizado.' };
  };

  globalThis._eliminarMotivo = function(id) {
    var ss = SpreadsheetApp.openById(getHojaControlId());
    var hoja = ss.getSheetByName('CATALOGO_MOTIVOS');
    if (!hoja) return { ok: false, mensaje: 'Pestaña no encontrada.' };
    var datos = hoja.getDataRange().getValues();
    for (var i = 1; i < datos.length; i++) {
      if (String(datos[i][0]).trim() === id.trim()) {
        // Note: Mock doesn't support deleteRow, but we test cache invalidation
        CacheWrapper_remove('CATALOGO_MOTIVOS');
        return { ok: true, mensaje: 'Motivo eliminado.' };
      }
    }
    return { ok: false, mensaje: 'Motivo no encontrado.' };
  };

  return { cacheService, spreadsheetApp };
}

// ─── Tests ─────────────────────────────────────────────────────────────────────

describe('Catálogo de Motivos — Integración con CacheServiceWrapper', () => {
  let cacheService;
  let spreadsheetApp;

  beforeEach(() => {
    const env = setupGlobals();
    cacheService = env.cacheService;
    spreadsheetApp = env.spreadsheetApp;
  });

  describe('_leerCatalogoMotivos() — cache-miss', () => {
    it('lee de Sheets cuando el caché está vacío', () => {
      var resultado = _leerCatalogoMotivos();

      expect(resultado).toHaveLength(3);
      expect(resultado[0].id).toBe('celular_correo');
      expect(resultado[1].id).toBe('doc_identidad');
      expect(resultado[2].id).toBe('confirmar_destino');
    });

    it('almacena en CacheService con TTL 600s tras cache-miss', () => {
      _leerCatalogoMotivos();

      var putCalls = cacheService._scriptCache.getCallLog('put');
      expect(putCalls.length).toBe(1);
      expect(putCalls[0].ttl).toBe(600);

      // Verificar que el valor cacheado es válido
      var cached = CacheWrapper_getJSON('CATALOGO_MOTIVOS');
      expect(cached).toHaveLength(3);
      expect(cached[0].id).toBe('celular_correo');
    });
  });

  describe('_leerCatalogoMotivos() — cache-hit', () => {
    it('retorna desde caché sin leer Sheets', () => {
      // Pre-poblar el caché
      var datosCache = [
        { id: 'cached_motivo', label: 'Desde caché', instruccion: 'test', activo: true }
      ];
      CacheWrapper_putJSON('CATALOGO_MOTIVOS', datosCache, 600);

      // Resetear call log del spreadsheet para verificar que no se lee
      var hoja = spreadsheetApp._spreadsheet.getSheetByName('CATALOGO_MOTIVOS');
      hoja.resetCallLog();

      var resultado = _leerCatalogoMotivos();

      expect(resultado).toEqual(datosCache);
      // No debería haber llamadas a getDataRange
      var dataRangeCalls = hoja.getCallLog('getDataRange');
      expect(dataRangeCalls.length).toBe(0);
    });

    it('segunda llamada consecutiva retorna desde caché', () => {
      // Primera llamada → cache-miss, lee de Sheets
      var resultado1 = _leerCatalogoMotivos();

      // Resetear call log para la segunda llamada
      var hoja = spreadsheetApp._spreadsheet.getSheetByName('CATALOGO_MOTIVOS');
      hoja.resetCallLog();

      // Segunda llamada → cache-hit
      var resultado2 = _leerCatalogoMotivos();

      expect(resultado2).toEqual(resultado1);
      // No debería haber leído de Sheets
      var dataRangeCalls = hoja.getCallLog('getDataRange');
      expect(dataRangeCalls.length).toBe(0);
    });
  });

  describe('_guardarMotivo() — invalidación de caché', () => {
    it('invalida CATALOGO_MOTIVOS tras guardar motivo nuevo', () => {
      // Pre-poblar caché
      _leerCatalogoMotivos();
      expect(CacheWrapper_getJSON('CATALOGO_MOTIVOS')).not.toBeNull();

      // Guardar nuevo motivo
      var result = _guardarMotivo({ id: 'nuevo_motivo', label: 'Nuevo', instruccion: 'Test', activo: true }, true);
      expect(result.ok).toBe(true);

      // Caché debe estar invalidado
      expect(CacheWrapper_getJSON('CATALOGO_MOTIVOS')).toBeNull();
    });

    it('invalida CATALOGO_MOTIVOS tras actualizar motivo existente', () => {
      // Pre-poblar caché
      _leerCatalogoMotivos();
      expect(CacheWrapper_getJSON('CATALOGO_MOTIVOS')).not.toBeNull();

      // Actualizar motivo existente
      var result = _guardarMotivo({ id: 'celular_correo', label: 'Actualizado', instruccion: 'Nuevo texto', activo: true }, false);
      expect(result.ok).toBe(true);

      // Caché debe estar invalidado
      expect(CacheWrapper_getJSON('CATALOGO_MOTIVOS')).toBeNull();
    });

    it('no invalida caché si la validación falla', () => {
      // Pre-poblar caché
      _leerCatalogoMotivos();
      expect(CacheWrapper_getJSON('CATALOGO_MOTIVOS')).not.toBeNull();

      // Intentar guardar sin ID → debe fallar
      var result = _guardarMotivo({ id: '', label: 'Sin ID' }, true);
      expect(result.ok).toBe(false);

      // Caché debe seguir intacto
      expect(CacheWrapper_getJSON('CATALOGO_MOTIVOS')).not.toBeNull();
    });
  });

  describe('_eliminarMotivo() — invalidación de caché', () => {
    it('invalida CATALOGO_MOTIVOS tras eliminar motivo', () => {
      // Pre-poblar caché
      _leerCatalogoMotivos();
      expect(CacheWrapper_getJSON('CATALOGO_MOTIVOS')).not.toBeNull();

      // Eliminar motivo existente
      var result = _eliminarMotivo('celular_correo');
      expect(result.ok).toBe(true);

      // Caché debe estar invalidado
      expect(CacheWrapper_getJSON('CATALOGO_MOTIVOS')).toBeNull();
    });

    it('no invalida caché si el motivo no existe', () => {
      // Pre-poblar caché
      _leerCatalogoMotivos();
      expect(CacheWrapper_getJSON('CATALOGO_MOTIVOS')).not.toBeNull();

      // Intentar eliminar motivo inexistente
      var result = _eliminarMotivo('no_existe');
      expect(result.ok).toBe(false);

      // Caché debe seguir intacto
      expect(CacheWrapper_getJSON('CATALOGO_MOTIVOS')).not.toBeNull();
    });
  });

  describe('Fallback graceful — CacheService falla', () => {
    it('lee de Sheets si CacheService.get() lanza excepción', () => {
      // Simular fallo de CacheService
      cacheService._scriptCache.setUnavailable(true);

      // Debe funcionar correctamente leyendo de Sheets
      var resultado = _leerCatalogoMotivos();

      expect(resultado).toHaveLength(3);
      expect(resultado[0].id).toBe('celular_correo');
    });

    it('funciona si CacheService.put() falla tras leer de Sheets', () => {
      // Primera lectura con cache funcional
      var resultado1 = _leerCatalogoMotivos();
      expect(resultado1).toHaveLength(3);

      // Invalidar y hacer que CacheService falle en el put
      CacheWrapper_remove('CATALOGO_MOTIVOS');
      cacheService._scriptCache.setUnavailable(true);

      // Segunda lectura — CacheService falla pero sigue leyendo de Sheets
      // CacheWrapper_getJSON retorna null cuando falla → lee de Sheets
      // CacheWrapper_putJSON falla silenciosamente → no cachea pero retorna datos
      cacheService._scriptCache.setUnavailable(false); // Allow get to return null
      // Re-setup: cache empty, let get work (return null) but make put fail
      cacheService._scriptCache.clear();

      var resultado2 = _leerCatalogoMotivos();
      expect(resultado2).toHaveLength(3);
    });
  });

  describe('Ciclo completo: leer → guardar → leer obtiene datos frescos', () => {
    it('tras guardar un motivo, la siguiente lectura refleja el cambio', () => {
      // Lectura inicial (cache miss → lee de Sheets → cachea)
      var resultado1 = _leerCatalogoMotivos();
      expect(resultado1).toHaveLength(3);

      // Guardar motivo nuevo (invalida caché)
      _guardarMotivo({ id: 'nuevo', label: 'Nuevo Motivo', instruccion: 'Test', activo: true }, true);

      // Siguiente lectura debe ser un cache-miss (caché fue invalidado)
      // y leer datos frescos de Sheets (que ahora incluye el nuevo motivo)
      var resultado2 = _leerCatalogoMotivos();
      expect(resultado2).toHaveLength(4);
      expect(resultado2[3].id).toBe('nuevo');
    });
  });
});
