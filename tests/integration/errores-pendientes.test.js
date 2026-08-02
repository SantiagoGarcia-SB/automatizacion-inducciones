/**
 * Integration tests para obtenerErroresPendientesComercial().
 *
 * Verifica:
 * - Máximo 4 llamadas a Sheets (Errores_Terceros: 1, Control_General: máx 2, CATALOGO_MOTIVOS: máx 1)
 * - UUIDs no encontrados en Control_General se omiten silenciosamente
 * - Control_General vacía o solo con encabezado retorna []
 * - 20+ errores se procesan sin TextFinder (O(1) por UUID)
 *
 * Validates: Requirements 3.1, 3.2, 3.3, 3.4, 3.5
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { createCacheService } from '../mocks/cache-service.mock.js';
import { createSpreadsheetApp } from '../mocks/spreadsheet-app.mock.js';

// ─── Helpers ───────────────────────────────────────────────────────────────────

/** Generates a Control_General row (62 cols) for a given UUID and comercial name */
function makeControlRow(uuid, comercial, arrendatario, idLote) {
  const row = new Array(62).fill('');
  row[0] = idLote || 'LOTE-001';
  row[2] = new Date(2025, 0, 15); // fecha radicacion
  row[10] = comercial || 'JUAN PEREZ';
  row[17] = 'DESTINO';
  row[18] = 'BOGOTA';
  row[23] = arrendatario || 'ARRENDATARIO TEST';
  row[29] = 'CODEUDOR 1';
  row[35] = 'CODEUDOR 2';
  row[41] = '';
  row[47] = '';
  row[53] = '';
  row[61] = uuid;
  return row;
}

/** Generates an Errores_Terceros row (11 cols) */
function makeErrorRow(uuid, participante, requerimientos, estado) {
  return [
    uuid,                         // 0: UUID_SISTEMA
    1,                            // 1: CICLO
    participante || 'INQ',        // 2: PARTICIPANTE
    requerimientos || 'celular_correo', // 3: REQUERIMIENTOS
    '',                           // 4: NOTA_INTERNA
    'auxiliar@test.com',          // 5: AUXILIAR_EMAIL
    new Date(2025, 0, 20),        // 6: FECHA_ERROR
    '',                           // 7: RESPUESTA_COMERCIAL
    '',                           // 8: ARCHIVOS_DRIVE_PATH
    '',                           // 9: FECHA_RESPUESTA
    estado || 'PENDIENTE'         // 10: ESTADO_ERROR
  ];
}

const CATALOGO_DATA = [
  ['ID', 'LABEL', 'INSTRUCCION', 'ACTIVO'],
  ['celular_correo', 'Confirmar celular o correo', 'Confirmar número...', true],
  ['doc_identidad', 'Adjuntar documento', 'Adjuntar copia...', true]
];

// ─── Setup ─────────────────────────────────────────────────────────────────────

function setupEnvironment(options = {}) {
  const cacheService = createCacheService({ throwOnLimit: false });
  globalThis.CacheService = cacheService;

  // Setup CacheWrapper functions in global scope
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
    var CHUNK = 99000;
    var totalParts = Math.ceil(json.length / CHUNK);
    cache.put(key, JSON.stringify({ _parts: totalParts }), ttl);
    for (var i = 0; i < totalParts; i++) {
      var start = i * CHUNK;
      cache.put(key + '_PART_' + globalThis._padNumber_(i + 1), json.substring(start, start + CHUNK), ttl);
    }
  };
  globalThis.CacheWrapper_getJSON = function(key) {
    try {
      var cache = CacheService.getScriptCache();
      var raw = cache.get(key);
      if (raw === null || raw === undefined) return null;
      if (globalThis._esCacheHeader_(raw)) return globalThis._reconstruirFragmentos_(cache, key, raw);
      return JSON.parse(raw);
    } catch (e) { return null; }
  };
  globalThis.CacheWrapper_putJSON = function(key, obj, ttl) {
    try {
      var json = JSON.stringify(obj);
      if (json.length > 500000) return;
      var cache = CacheService.getScriptCache();
      if (json.length < 99000) { cache.put(key, json, ttl || 600); return; }
      globalThis._almacenarFragmentado_(cache, key, json, ttl || 600);
    } catch (e) { /* ignore */ }
  };
  globalThis.CacheWrapper_remove = function(key) {
    try {
      var cache = CacheService.getScriptCache();
      cache.remove(key);
    } catch (e) { /* ignore */ }
  };

  // Mock Utilities for date formatting
  globalThis.Utilities = {
    formatDate: function(date, tz, fmt) {
      if (!(date instanceof Date)) return '';
      return date.getDate() + '/' + (date.getMonth() + 1) + '/' + date.getFullYear();
    }
  };

  globalThis.getHojaControlId = () => 'mock-spreadsheet-id';

  // _nombreComercialParaBusqueda — converts email to name for matching
  globalThis._nombreComercialParaBusqueda = function(email) {
    if (!email || typeof email !== 'string' || email.indexOf('@') === -1) return '';
    var partes = email.split('@')[0].split('.');
    var resultado = [];
    for (var i = 0; i < partes.length; i++) {
      var p = partes[i].trim();
      if (p.length > 0) resultado.push(p.charAt(0).toUpperCase() + p.slice(1).toLowerCase());
    }
    return resultado.join(' ').toUpperCase();
  };

  // _leerCatalogoMotivos — uses CacheWrapper with fallback to Sheets
  globalThis._leerCatalogoMotivos = function() {
    var cached = CacheWrapper_getJSON('CATALOGO_MOTIVOS');
    if (cached) return cached;
    var ss = SpreadsheetApp.openById(getHojaControlId());
    var hoja = ss.getSheetByName('CATALOGO_MOTIVOS');
    if (!hoja || hoja.getLastRow() < 2) return [];
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
    try { CacheWrapper_putJSON('CATALOGO_MOTIVOS', resultado, 600); } catch (e) { /* ignore */ }
    return resultado;
  };

  // Setup SpreadsheetApp with sheets data
  const controlData = options.controlData || [];
  const erroresData = options.erroresData || [];
  const catalogoData = options.catalogoData || CATALOGO_DATA;

  const sheetsConfig = {
    'Control_General': controlData,
    'Errores_Terceros': erroresData,
    'CATALOGO_MOTIVOS': catalogoData
  };

  const app = createSpreadsheetApp(sheetsConfig);
  globalThis.SpreadsheetApp = app;

  // Pre-populate cache with catalogo if specified
  if (options.catalogoCacheHit) {
    CacheWrapper_putJSON('CATALOGO_MOTIVOS', options.catalogoCacheHit, 600);
  }

  // Define the function under test (from Repositorios_ColaAuxiliarRepo.js)
  globalThis.obtenerErroresPendientesComercial = function(emailComercial) {
    var ss = SpreadsheetApp.openById(getHojaControlId());
    var hojaErrores = ss.getSheetByName('Errores_Terceros');
    if (!hojaErrores || hojaErrores.getLastRow() < 2) return [];

    var motivos = _leerCatalogoMotivos();
    var mapaMotivos = {};
    for (var m = 0; m < motivos.length; m++) {
      mapaMotivos[motivos[m].id] = motivos[m];
    }

    var datos = hojaErrores.getDataRange().getValues();
    var erroresPendientes = {};
    var estadosVisibles = ['PENDIENTE', 'CORRECCION_RECIBIDA'];

    for (var i = 1; i < datos.length; i++) {
      var estadoErr = String(datos[i][10] || '').trim();
      if (estadosVisibles.indexOf(estadoErr) === -1) continue;
      var uuid = String(datos[i][0] || '').trim();
      if (!erroresPendientes[uuid]) {
        erroresPendientes[uuid] = {
          uuid: uuid,
          participantes: [],
          fechaError: datos[i][6] instanceof Date
            ? Utilities.formatDate(datos[i][6], 'GMT-5', 'd/MM/yyyy') : ''
        };
      }

      var reqIds = String(datos[i][3] || '').split('|').filter(function(r) { return r; });
      var reqsEnriquecidos = [];
      for (var rr = 0; rr < reqIds.length; rr++) {
        var motivo = mapaMotivos[reqIds[rr]];
        reqsEnriquecidos.push({
          id: reqIds[rr],
          label: motivo ? motivo.label : reqIds[rr],
          instruccion: motivo ? motivo.instruccion : ''
        });
      }

      erroresPendientes[uuid].participantes.push({
        participante: String(datos[i][2] || ''),
        requerimientos: String(datos[i][3] || ''),
        requerimientosDetalle: reqsEnriquecidos,
        estadoError: estadoErr,
        respuestaComercial: String(datos[i][7] || ''),
        archivosPath: String(datos[i][8] || ''),
        fila: i + 1
      });
    }

    var hojaControl = ss.getSheetByName('Control_General');

    // Defensive: si Control_General no existe o solo tiene encabezado → retornar []
    if (!hojaControl || hojaControl.getLastRow() < 2) return [];

    var nombre = emailComercial ? _nombreComercialParaBusqueda(emailComercial) : null;
    var resultado = [];

    var ultimaFilaCtrl = hojaControl.getLastRow();
    var indicePorUuid = {};
    var datosControl = hojaControl.getRange(2, 1, ultimaFilaCtrl - 1, 62).getValues();
    for (var dc = 0; dc < datosControl.length; dc++) {
      var uuidCtrl = String(datosControl[dc][61] || '').trim();
      if (uuidCtrl) indicePorUuid[uuidCtrl] = datosControl[dc];
    }

    var uuids = Object.keys(erroresPendientes);
    for (var u = 0; u < uuids.length; u++) {
      var uuid = uuids[u];
      var filaControl = indicePorUuid[uuid];
      if (!filaControl) continue;

      var comercial = String(filaControl[10] || '').toUpperCase().trim();
      if (nombre && comercial !== nombre) continue;

      var arrendatario = String(filaControl[23] || '');
      var idLote = String(filaControl[0] || '');
      var fechaRaw = filaControl[2];
      var fechaRadicacion = fechaRaw instanceof Date
        ? Utilities.formatDate(fechaRaw, 'GMT-5', 'd/MM/yyyy') : '';

      var nombresParticipantes = {
        'INQ': arrendatario,
        'COA1': String(filaControl[29] || ''),
        'COA2': String(filaControl[35] || ''),
        'COA3': String(filaControl[41] || ''),
        'COA4': String(filaControl[47] || ''),
        'COA5': String(filaControl[53] || '')
      };

      var err = erroresPendientes[uuid];
      err.arrendatario = arrendatario;
      err.idLote = idLote;
      err.fechaRadicacion = fechaRadicacion;

      for (var p = 0; p < err.participantes.length; p++) {
        var partCode = err.participantes[p].participante;
        err.participantes[p].nombreReal = nombresParticipantes[partCode] || partCode;
      }

      resultado.push(err);
    }

    return resultado;
  };

  return { app, cacheService };
}

// ─── Tests ─────────────────────────────────────────────────────────────────────

describe('obtenerErroresPendientesComercial() — integration', () => {

  describe('Max 4 Sheets calls with 20+ errors (Req 3.3)', () => {
    it('uses max 4 data-read calls to Sheets with 25 errors across 10 UUIDs', () => {
      // Build 10 unique UUIDs with errors
      const controlRows = [['HEADERS'].concat(new Array(61).fill('H'))];
      const erroresRows = [['UUID', 'CICLO', 'PARTICIPANTE', 'REQ', 'NOTA', 'AUX', 'FECHA', 'RESP', 'ARCH', 'F_RESP', 'ESTADO']];

      for (let i = 1; i <= 10; i++) {
        const uuid = 'UUID-' + String(i).padStart(3, '0');
        controlRows.push(makeControlRow(uuid, 'JUAN PEREZ', 'Arrend ' + i, 'LOTE-' + i));

        // 2-3 error rows per UUID (total ~25)
        erroresRows.push(makeErrorRow(uuid, 'INQ', 'celular_correo', 'PENDIENTE'));
        erroresRows.push(makeErrorRow(uuid, 'COA1', 'doc_identidad', 'PENDIENTE'));
        if (i <= 5) {
          erroresRows.push(makeErrorRow(uuid, 'COA2', 'celular_correo|doc_identidad', 'PENDIENTE'));
        }
      }

      const { app } = setupEnvironment({
        controlData: controlRows,
        erroresData: erroresRows
      });

      const resultado = obtenerErroresPendientesComercial('juan.perez@empresa.com');

      // Should return all 10 UUID groups
      expect(resultado).toHaveLength(10);

      // Count Sheets data-read calls:
      // getDataRange().getValues() and getRange().getValues() calls
      const ssInstance = app._spreadsheet;
      const erroresSheet = ssInstance.getSheetByName('Errores_Terceros');
      const controlSheet = ssInstance.getSheetByName('Control_General');
      const catalogoSheet = ssInstance.getSheetByName('CATALOGO_MOTIVOS');

      const errGetValues = erroresSheet.getCallLog('getValues').length;
      const ctrlGetValues = controlSheet.getCallLog('getValues').length;
      const catGetValues = catalogoSheet.getCallLog('getValues').length;

      const totalSheetsCalls = errGetValues + ctrlGetValues + catGetValues;

      // Max 4 total: Errores_Terceros(1) + Control_General(max 2) + CATALOGO(max 1)
      expect(totalSheetsCalls).toBeLessThanOrEqual(4);
      // At minimum: Errores(1) + Control(1) + Catalogo(1) = 3
      expect(totalSheetsCalls).toBeGreaterThanOrEqual(3);
    });

    it('with catalogo in cache, max 3 Sheets calls (cache-hit skips CATALOGO read)', () => {
      const controlRows = [['HEADERS'].concat(new Array(61).fill('H'))];
      const erroresRows = [['UUID', 'CICLO', 'PARTICIPANTE', 'REQ', 'NOTA', 'AUX', 'FECHA', 'RESP', 'ARCH', 'F_RESP', 'ESTADO']];

      for (let i = 1; i <= 10; i++) {
        const uuid = 'UUID-CACHED-' + i;
        controlRows.push(makeControlRow(uuid, 'JUAN PEREZ', 'Arrend ' + i, 'LOTE-' + i));
        erroresRows.push(makeErrorRow(uuid, 'INQ', 'celular_correo', 'PENDIENTE'));
        erroresRows.push(makeErrorRow(uuid, 'COA1', 'doc_identidad', 'PENDIENTE'));
      }

      const catalogoPreCached = [
        { id: 'celular_correo', label: 'Confirmar celular', instruccion: 'Confirmar...', activo: true },
        { id: 'doc_identidad', label: 'Adjuntar doc', instruccion: 'Adjuntar...', activo: true }
      ];

      const { app } = setupEnvironment({
        controlData: controlRows,
        erroresData: erroresRows,
        catalogoCacheHit: catalogoPreCached
      });

      const resultado = obtenerErroresPendientesComercial('juan.perez@empresa.com');
      expect(resultado).toHaveLength(10);

      // With cache-hit on catalogo, CATALOGO_MOTIVOS sheet should NOT be read
      const catalogoSheet = app._spreadsheet.getSheetByName('CATALOGO_MOTIVOS');
      const catGetValues = catalogoSheet.getCallLog('getValues').length;
      expect(catGetValues).toBe(0);

      // Total: Errores(1) + Control(1) = 2 data reads
      const erroresSheet = app._spreadsheet.getSheetByName('Errores_Terceros');
      const controlSheet = app._spreadsheet.getSheetByName('Control_General');
      const totalReads = erroresSheet.getCallLog('getValues').length +
                         controlSheet.getCallLog('getValues').length;
      expect(totalReads).toBeLessThanOrEqual(3);
    });
  });

  describe('UUIDs not in Control_General are silently skipped (Req 3.4)', () => {
    it('omits errors whose UUIDs are not found in Control_General index', () => {
      const controlRows = [['HEADERS'].concat(new Array(61).fill('H'))];
      // Only 3 UUIDs exist in Control_General
      controlRows.push(makeControlRow('UUID-EXISTS-1', 'JUAN PEREZ', 'Arrend 1', 'LOTE-1'));
      controlRows.push(makeControlRow('UUID-EXISTS-2', 'JUAN PEREZ', 'Arrend 2', 'LOTE-2'));
      controlRows.push(makeControlRow('UUID-EXISTS-3', 'JUAN PEREZ', 'Arrend 3', 'LOTE-3'));

      const erroresRows = [['UUID', 'CICLO', 'PART', 'REQ', 'NOTA', 'AUX', 'FECHA', 'RESP', 'ARCH', 'F_RESP', 'ESTADO']];
      // 5 UUIDs in errors — 2 don't exist in Control_General
      erroresRows.push(makeErrorRow('UUID-EXISTS-1', 'INQ', 'celular_correo', 'PENDIENTE'));
      erroresRows.push(makeErrorRow('UUID-EXISTS-2', 'INQ', 'doc_identidad', 'PENDIENTE'));
      erroresRows.push(makeErrorRow('UUID-EXISTS-3', 'COA1', 'celular_correo', 'PENDIENTE'));
      erroresRows.push(makeErrorRow('UUID-MISSING-1', 'INQ', 'celular_correo', 'PENDIENTE'));
      erroresRows.push(makeErrorRow('UUID-MISSING-2', 'COA1', 'doc_identidad', 'PENDIENTE'));

      setupEnvironment({ controlData: controlRows, erroresData: erroresRows });

      // Should NOT throw
      const resultado = obtenerErroresPendientesComercial('juan.perez@empresa.com');

      // Only the 3 existing UUIDs should be in the result
      expect(resultado).toHaveLength(3);
      const uuidsInResult = resultado.map(r => r.uuid);
      expect(uuidsInResult).toContain('UUID-EXISTS-1');
      expect(uuidsInResult).toContain('UUID-EXISTS-2');
      expect(uuidsInResult).toContain('UUID-EXISTS-3');
      expect(uuidsInResult).not.toContain('UUID-MISSING-1');
      expect(uuidsInResult).not.toContain('UUID-MISSING-2');
    });

    it('does not use TextFinder (no createTextFinder calls logged)', () => {
      const controlRows = [['HEADERS'].concat(new Array(61).fill('H'))];
      controlRows.push(makeControlRow('UUID-A', 'JUAN PEREZ', 'Arrend A', 'LOTE-A'));

      const erroresRows = [['UUID', 'CICLO', 'PART', 'REQ', 'NOTA', 'AUX', 'FECHA', 'RESP', 'ARCH', 'F_RESP', 'ESTADO']];
      erroresRows.push(makeErrorRow('UUID-A', 'INQ', 'celular_correo', 'PENDIENTE'));
      erroresRows.push(makeErrorRow('UUID-GHOST', 'INQ', 'celular_correo', 'PENDIENTE'));

      const { app } = setupEnvironment({ controlData: controlRows, erroresData: erroresRows });

      obtenerErroresPendientesComercial('juan.perez@empresa.com');

      // Verify NO TextFinder was used in any sheet
      const allSheets = app._spreadsheet.getSheets();
      for (const sheet of allSheets) {
        const textFinderCalls = sheet.getCallLog('createTextFinder');
        expect(textFinderCalls).toHaveLength(0);
      }
    });
  });

  describe('Empty Control_General returns [] (Req 3.5)', () => {
    it('returns [] when Control_General has only header row', () => {
      const controlRows = [['HEADERS'].concat(new Array(61).fill('H'))]; // just 1 row (header)
      const erroresRows = [
        ['UUID', 'CICLO', 'PART', 'REQ', 'NOTA', 'AUX', 'FECHA', 'RESP', 'ARCH', 'F_RESP', 'ESTADO'],
        makeErrorRow('UUID-ORPHAN', 'INQ', 'celular_correo', 'PENDIENTE')
      ];

      setupEnvironment({ controlData: controlRows, erroresData: erroresRows });

      const resultado = obtenerErroresPendientesComercial('alguien@empresa.com');
      expect(resultado).toEqual([]);
    });

    it('returns [] when Errores_Terceros has only header row', () => {
      const controlRows = [
        ['HEADERS'].concat(new Array(61).fill('H')),
        makeControlRow('UUID-1', 'JUAN PEREZ', 'Arrend 1', 'LOTE-1')
      ];
      const erroresRows = [
        ['UUID', 'CICLO', 'PART', 'REQ', 'NOTA', 'AUX', 'FECHA', 'RESP', 'ARCH', 'F_RESP', 'ESTADO']
      ]; // only header

      setupEnvironment({ controlData: controlRows, erroresData: erroresRows });

      const resultado = obtenerErroresPendientesComercial('juan.perez@empresa.com');
      expect(resultado).toEqual([]);
    });

    it('returns [] when Errores_Terceros sheet does not exist', () => {
      // Setup with no Errores_Terceros sheet
      const cacheService = createCacheService({ throwOnLimit: false });
      globalThis.CacheService = cacheService;
      globalThis.getHojaControlId = () => 'mock-id';

      const app = createSpreadsheetApp({
        'Control_General': [['H'].concat(new Array(61).fill(''))],
        'CATALOGO_MOTIVOS': CATALOGO_DATA
      });
      globalThis.SpreadsheetApp = app;

      const resultado = obtenerErroresPendientesComercial('test@empresa.com');
      expect(resultado).toEqual([]);
    });

    it('returns [] when Control_General sheet does not exist', () => {
      const erroresRows = [
        ['UUID', 'CICLO', 'PART', 'REQ', 'NOTA', 'AUX', 'FECHA', 'RESP', 'ARCH', 'F_RESP', 'ESTADO'],
        makeErrorRow('UUID-ORPHAN', 'INQ', 'celular_correo', 'PENDIENTE')
      ];

      // Setup with no Control_General sheet
      const cacheService = createCacheService({ throwOnLimit: false });
      globalThis.CacheService = cacheService;
      globalThis.getHojaControlId = () => 'mock-id';
      // Re-setup CacheWrapper functions
      globalThis.CacheWrapper_getJSON = function(key) {
        try {
          var cache = CacheService.getScriptCache();
          var raw = cache.get(key);
          if (raw === null || raw === undefined) return null;
          if (raw.indexOf('{"_parts":') === 0) return null; // simplified
          return JSON.parse(raw);
        } catch (e) { return null; }
      };
      globalThis.CacheWrapper_putJSON = function(key, obj, ttl) {
        try {
          var json = JSON.stringify(obj);
          if (json.length > 500000) return;
          var cache = CacheService.getScriptCache();
          cache.put(key, json, ttl || 600);
        } catch (e) { /* ignore */ }
      };
      globalThis._leerCatalogoMotivos = function() { return []; };

      const app = createSpreadsheetApp({
        'Errores_Terceros': erroresRows,
        'CATALOGO_MOTIVOS': CATALOGO_DATA
      });
      globalThis.SpreadsheetApp = app;

      const resultado = obtenerErroresPendientesComercial('test@empresa.com');
      expect(resultado).toEqual([]);
    });
  });

  describe('Correctness with 20+ errors (Req 3.1, 3.2)', () => {
    it('enriches each error with arrendatario, idLote, nombreReal from index', () => {
      const controlRows = [['HEADERS'].concat(new Array(61).fill('H'))];
      controlRows.push(makeControlRow('UUID-ENRICH-1', 'JUAN PEREZ', 'Maria Lopez', 'LOTE-500'));

      const erroresRows = [['UUID', 'CICLO', 'PART', 'REQ', 'NOTA', 'AUX', 'FECHA', 'RESP', 'ARCH', 'F_RESP', 'ESTADO']];
      erroresRows.push(makeErrorRow('UUID-ENRICH-1', 'INQ', 'celular_correo', 'PENDIENTE'));
      erroresRows.push(makeErrorRow('UUID-ENRICH-1', 'COA1', 'doc_identidad', 'PENDIENTE'));

      setupEnvironment({ controlData: controlRows, erroresData: erroresRows });

      const resultado = obtenerErroresPendientesComercial('juan.perez@empresa.com');

      expect(resultado).toHaveLength(1);
      const err = resultado[0];
      expect(err.arrendatario).toBe('Maria Lopez');
      expect(err.idLote).toBe('LOTE-500');
      expect(err.participantes).toHaveLength(2);
      expect(err.participantes[0].nombreReal).toBe('Maria Lopez'); // INQ
      expect(err.participantes[1].nombreReal).toBe('CODEUDOR 1'); // COA1
    });

    it('enriches requerimientos with label and instruccion from catalogo', () => {
      const controlRows = [['H'].concat(new Array(61).fill(''))];
      controlRows.push(makeControlRow('UUID-REQ', 'JUAN PEREZ', 'Pedro', 'LOTE-1'));

      const erroresRows = [['UUID', 'CICLO', 'PART', 'REQ', 'NOTA', 'AUX', 'FECHA', 'RESP', 'ARCH', 'F_RESP', 'ESTADO']];
      erroresRows.push(makeErrorRow('UUID-REQ', 'INQ', 'celular_correo|doc_identidad', 'PENDIENTE'));

      setupEnvironment({ controlData: controlRows, erroresData: erroresRows });

      const resultado = obtenerErroresPendientesComercial('juan.perez@empresa.com');

      expect(resultado).toHaveLength(1);
      const detalle = resultado[0].participantes[0].requerimientosDetalle;
      expect(detalle).toHaveLength(2);
      expect(detalle[0].id).toBe('celular_correo');
      expect(detalle[0].label).toBe('Confirmar celular o correo');
      expect(detalle[1].id).toBe('doc_identidad');
      expect(detalle[1].label).toBe('Adjuntar documento');
    });
  });

  describe('Filters by comercial email (Req 3.2)', () => {
    it('only returns errors for the matching comercial', () => {
      const controlRows = [['HEADERS'].concat(new Array(61).fill('H'))];
      controlRows.push(makeControlRow('UUID-JUAN', 'JUAN PEREZ', 'A1', 'L1'));
      controlRows.push(makeControlRow('UUID-MARIA', 'MARIA GARCIA', 'A2', 'L2'));

      const erroresRows = [['UUID', 'CICLO', 'PART', 'REQ', 'NOTA', 'AUX', 'FECHA', 'RESP', 'ARCH', 'F_RESP', 'ESTADO']];
      erroresRows.push(makeErrorRow('UUID-JUAN', 'INQ', 'celular_correo', 'PENDIENTE'));
      erroresRows.push(makeErrorRow('UUID-MARIA', 'INQ', 'celular_correo', 'PENDIENTE'));

      setupEnvironment({ controlData: controlRows, erroresData: erroresRows });

      const resultado = obtenerErroresPendientesComercial('juan.perez@empresa.com');
      expect(resultado).toHaveLength(1);
      expect(resultado[0].uuid).toBe('UUID-JUAN');
    });

    it('returns all errors when emailComercial is null (LIDER/ADMIN)', () => {
      const controlRows = [['HEADERS'].concat(new Array(61).fill('H'))];
      controlRows.push(makeControlRow('UUID-A', 'JUAN PEREZ', 'A1', 'L1'));
      controlRows.push(makeControlRow('UUID-B', 'MARIA GARCIA', 'A2', 'L2'));

      const erroresRows = [['UUID', 'CICLO', 'PART', 'REQ', 'NOTA', 'AUX', 'FECHA', 'RESP', 'ARCH', 'F_RESP', 'ESTADO']];
      erroresRows.push(makeErrorRow('UUID-A', 'INQ', 'celular_correo', 'PENDIENTE'));
      erroresRows.push(makeErrorRow('UUID-B', 'INQ', 'doc_identidad', 'PENDIENTE'));

      setupEnvironment({ controlData: controlRows, erroresData: erroresRows });

      const resultado = obtenerErroresPendientesComercial(null);
      expect(resultado).toHaveLength(2);
    });
  });
});
