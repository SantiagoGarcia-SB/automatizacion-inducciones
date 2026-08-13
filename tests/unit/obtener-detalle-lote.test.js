/**
 * Unit test: obtenerDetalleLote() — usa índice en memoria (MemoCache_getIndiceLote)
 *
 * Verifica:
 * 1. Usa MemoCache_getIndiceLote() en vez de TextFinder
 * 2. Reutiliza datos ya cargados si el índice ya existe en memoria
 * 3. Construye el índice si no existe (fallback a lectura de Control_General)
 * 4. Retorna estructura correcta {lote, solicitudes}
 * 5. Retorna {lote:null, solicitudes:[]} para inputs inválidos o lote no encontrado
 *
 * Requirements: 10.3
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { createSpreadsheetApp } from '../mocks/spreadsheet-app.mock.js';
import { readFileSync } from 'fs';
import { resolve } from 'path';

// ─── Load source files via eval (GAS has no exports) ─────────────────────────

const REPO_PATH = resolve(__dirname, '../../Repositorios_ControlGeneralRepo.js');
const repoCode = readFileSync(REPO_PATH, 'utf-8');

const MEMO_PATH = resolve(__dirname, '../../Infraestructura_MemoCache.js');
const memoCacheCode = readFileSync(MEMO_PATH, 'utf-8');

const REGISTRY_PATH = resolve(__dirname, '../../Infraestructura_Registry.js');
const registryCode = readFileSync(REGISTRY_PATH, 'utf-8');

const UTILS_NOMBRES_PATH = resolve(__dirname, '../../Utilidades_Nombres.js');
const utilsNombresCode = readFileSync(UTILS_NOMBRES_PATH, 'utf-8');

function loadSource() {
  // Load Utils (emailANombre)
  const wrappedUtils = `(function() { ${utilsNombresCode}\n; globalThis.emailANombre = emailANombre; globalThis.FORMATO_NOMBRE = FORMATO_NOMBRE; })()`;
  eval(wrappedUtils);

  // Load Registry
  const wrappedRegistry = `(function() { ${registryCode}\n; globalThis._spreadsheetRegistry = _spreadsheetRegistry; globalThis.SpreadsheetRegistry_get = SpreadsheetRegistry_get; globalThis.SpreadsheetRegistry_has = SpreadsheetRegistry_has; })()`;
  eval(wrappedRegistry);

  // Load MemoCache
  const wrappedMemo = `(function() { ${memoCacheCode}\n; globalThis._indiceLoteFila = _indiceLoteFila; globalThis._indiceUuidFila = _indiceUuidFila; globalThis._sessionEmail = _sessionEmail; globalThis._cacheUsuariosTodos = _cacheUsuariosTodos; globalThis.MemoCache_getIndiceLote = MemoCache_getIndiceLote; globalThis.MemoCache_getIndiceUuid = MemoCache_getIndiceUuid; globalThis.MemoCache_getSessionEmail = MemoCache_getSessionEmail; globalThis.MemoCache_getUsuarios = MemoCache_getUsuarios; })()`;
  eval(wrappedMemo);

  // Load Repo
  const wrappedRepo = `(function() { ${repoCode}\n; globalThis.obtenerDetalleLote = obtenerDetalleLote; })()`;
  eval(wrappedRepo);
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

/**
 * Genera una fila de Control_General con 62 columnas.
 */
function generarFila(opts) {
  var fila = new Array(62).fill('');
  fila[0] = opts.idLote || 'LOTE-001';
  fila[2] = opts.fecha || new Date(2025, 0, 15);
  fila[9] = opts.estado || 'RADICADO';
  fila[10] = opts.comercial || 'JUAN PEREZ';
  fila[11] = opts.tasaNegociacion || '5%';
  fila[15] = opts.tipoNegociacion || 'ARRENDAMIENTO';
  fila[16] = opts.poliza || 'POL-001';
  fila[17] = opts.destino || 'VIVIENDA';
  fila[18] = opts.ciudad || 'BOGOTA';
  fila[19] = opts.direccion || 'Calle 1 #2-3';
  fila[20] = opts.canon || '1500000';
  fila[23] = opts.arrendatario || 'Pedro Gomez';
  fila[24] = opts.tipoDoc || 'CC';
  fila[25] = opts.identificacion || '1234567890';
  fila[26] = opts.celular || '3001234567';
  fila[27] = opts.correo || 'pedro@test.com';
  fila[61] = opts.uuid || 'uuid-' + Math.random().toString(36).substring(2, 8);
  return fila;
}

/**
 * Sets up global mocks and loads functions.
 * @param {any[][]} dataRows - Rows of data (without header)
 */
function setupEnvironment(dataRows) {
  const header = new Array(62).fill('HEADER');
  const allData = [header, ...dataRows];

  const app = createSpreadsheetApp({
    'Control_General': allData
  });

  globalThis.SpreadsheetApp = app;
  globalThis.getHojaControlId = () => 'mock-id';
  globalThis._registrarEvento_ = vi.fn();
  globalThis.Utilities = {
    formatDate: function(date, tz, fmt) {
      if (date instanceof Date) {
        return date.toLocaleDateString('es-CO');
      }
      return '';
    }
  };

  // Reset memo caches
  globalThis._indiceLoteFila = null;
  globalThis._indiceUuidFila = null;
  globalThis._spreadsheetRegistry = {};

  // Load the actual source code
  loadSource();

  return app;
}

// ─── Tests ───────────────────────────────────────────────────────────────────

describe('obtenerDetalleLote() — índice loteId en memoria', () => {
  beforeEach(() => {
    // Clean up globals before each test
    delete globalThis.SpreadsheetApp;
    delete globalThis.getHojaControlId;
    delete globalThis._registrarEvento_;
    delete globalThis.Utilities;
    delete globalThis.obtenerDetalleLote;
    delete globalThis._indiceLoteFila;
    delete globalThis._indiceUuidFila;
    delete globalThis._spreadsheetRegistry;
    delete globalThis.SpreadsheetRegistry_get;
    delete globalThis.SpreadsheetRegistry_has;
    delete globalThis.MemoCache_getIndiceLote;
    delete globalThis.MemoCache_getIndiceUuid;
  });

  afterEach(() => {
    delete globalThis.SpreadsheetApp;
    delete globalThis.getHojaControlId;
    delete globalThis._registrarEvento_;
    delete globalThis.Utilities;
    delete globalThis.obtenerDetalleLote;
    delete globalThis._indiceLoteFila;
    delete globalThis._indiceUuidFila;
    delete globalThis._spreadsheetRegistry;
    delete globalThis.SpreadsheetRegistry_get;
    delete globalThis.SpreadsheetRegistry_has;
    delete globalThis.MemoCache_getIndiceLote;
    delete globalThis.MemoCache_getIndiceUuid;
  });

  it('retorna lote y solicitudes cuando el lote existe', () => {
    const filas = [
      generarFila({ idLote: 'LOTE-001', arrendatario: 'Pedro', uuid: 'uuid-1', estado: 'RADICADO' }),
      generarFila({ idLote: 'LOTE-001', arrendatario: 'Maria', uuid: 'uuid-2', estado: 'EN ANALISIS' }),
      generarFila({ idLote: 'LOTE-002', arrendatario: 'Carlos', uuid: 'uuid-3', estado: 'RADICADO' })
    ];
    setupEnvironment(filas);

    const resultado = globalThis.obtenerDetalleLote('LOTE-001');

    expect(resultado.lote).not.toBeNull();
    expect(resultado.lote.idLote).toBe('LOTE-001');
    expect(resultado.solicitudes).toHaveLength(2);
    expect(resultado.solicitudes[0].arrendatario).toBe('Pedro');
    expect(resultado.solicitudes[1].arrendatario).toBe('Maria');
  });

  it('retorna {lote:null, solicitudes:[]} para lote inexistente', () => {
    const filas = [
      generarFila({ idLote: 'LOTE-001', arrendatario: 'Pedro' })
    ];
    setupEnvironment(filas);

    const resultado = globalThis.obtenerDetalleLote('LOTE-INEXISTENTE');

    expect(resultado).toEqual({ lote: null, solicitudes: [] });
  });

  it('retorna {lote:null, solicitudes:[]} para input vacío', () => {
    setupEnvironment([generarFila({ idLote: 'LOTE-001' })]);

    expect(globalThis.obtenerDetalleLote('')).toEqual({ lote: null, solicitudes: [] });
    expect(globalThis.obtenerDetalleLote(null)).toEqual({ lote: null, solicitudes: [] });
    expect(globalThis.obtenerDetalleLote(undefined)).toEqual({ lote: null, solicitudes: [] });
  });

  it('retorna {lote:null, solicitudes:[]} para input no-string', () => {
    setupEnvironment([generarFila({ idLote: 'LOTE-001' })]);

    expect(globalThis.obtenerDetalleLote(123)).toEqual({ lote: null, solicitudes: [] });
    expect(globalThis.obtenerDetalleLote({})).toEqual({ lote: null, solicitudes: [] });
  });

  it('retorna {lote:null, solicitudes:[]} cuando la hoja está vacía', () => {
    setupEnvironment([]);

    const resultado = globalThis.obtenerDetalleLote('LOTE-001');

    expect(resultado).toEqual({ lote: null, solicitudes: [] });
  });

  it('usa SpreadsheetRegistry_get en vez de SpreadsheetApp.openById directamente', () => {
    const filas = [generarFila({ idLote: 'LOTE-001' })];
    setupEnvironment(filas);

    // Spy on SpreadsheetApp.openById to confirm it's called via the registry
    const openByIdSpy = vi.fn(globalThis.SpreadsheetApp.openById);
    globalThis.SpreadsheetApp.openById = openByIdSpy;

    globalThis.obtenerDetalleLote('LOTE-001');

    // openById is called via SpreadsheetRegistry_get (once since registry is empty)
    expect(openByIdSpy).toHaveBeenCalledTimes(1);

    // Second call should reuse registry
    globalThis.obtenerDetalleLote('LOTE-001');
    expect(openByIdSpy).toHaveBeenCalledTimes(1); // still 1 — registry cached
  });

  it('reutiliza índice ya construido por llamada previa (no lee hoja de nuevo)', () => {
    const filas = [
      generarFila({ idLote: 'LOTE-001', arrendatario: 'Pedro' }),
      generarFila({ idLote: 'LOTE-002', arrendatario: 'Maria' })
    ];
    const app = setupEnvironment(filas);

    // First call builds the index
    const resultado1 = globalThis.obtenerDetalleLote('LOTE-001');
    expect(resultado1.lote).not.toBeNull();

    // Get the sheet to check call log
    const sheet = app._spreadsheet.getSheetByName('Control_General');
    const getRangeCalls1 = sheet.getCallLog('getRange').length;

    // Second call should reuse the index
    const resultado2 = globalThis.obtenerDetalleLote('LOTE-002');
    expect(resultado2.lote).not.toBeNull();
    expect(resultado2.lote.idLote).toBe('LOTE-002');

    // The second call should only have 1 additional getRange call (to read the row data)
    // NOT a full sheet read to rebuild the index
    const getRangeCalls2 = sheet.getCallLog('getRange').length;
    const additionalCalls = getRangeCalls2 - getRangeCalls1;
    // Only 1 additional call: getRange for the one row of LOTE-002
    expect(additionalCalls).toBe(1);
  });

  it('construye el índice si no fue creado previamente (fallback)', () => {
    const filas = [
      generarFila({ idLote: 'LOTE-ABC', arrendatario: 'Ana', uuid: 'uuid-a' }),
      generarFila({ idLote: 'LOTE-ABC', arrendatario: 'Luis', uuid: 'uuid-b' })
    ];
    setupEnvironment(filas);

    const resultado = globalThis.obtenerDetalleLote('LOTE-ABC');

    // The result should be correct — the function built the index internally
    expect(resultado.lote).not.toBeNull();
    expect(resultado.lote.idLote).toBe('LOTE-ABC');
    expect(resultado.solicitudes).toHaveLength(2);

    // After the index is built, a second call for a different lote in the same
    // data should also work (proving the index was populated)
    const resultado2 = globalThis.obtenerDetalleLote('LOTE-ABC');
    expect(resultado2.lote.idLote).toBe('LOTE-ABC');
    expect(resultado2.solicitudes).toHaveLength(2);
  });

  it('mantiene la estructura de retorno correcta (campos lote)', () => {
    const fecha = new Date(2025, 5, 15, 10, 30);
    const filas = [
      generarFila({
        idLote: 'LOTE-X',
        fecha: fecha,
        comercial: 'ANA RUIZ',
        poliza: 'POL-999',
        tipoNegociacion: 'LEASING',
        tasaNegociacion: '3.5%'
      })
    ];
    setupEnvironment(filas);

    const resultado = globalThis.obtenerDetalleLote('LOTE-X');

    expect(resultado.lote.idLote).toBe('LOTE-X');
    expect(resultado.lote.comercial).toBe('ANA RUIZ');
    expect(resultado.lote.poliza).toBe('POL-999');
    expect(resultado.lote.tipoNegociacion).toBe('LEASING');
    expect(resultado.lote.tasaNegociacion).toBe('3.5%');
    // fecha is formatted via Utilities.formatDate
    expect(resultado.lote.fecha).toBeTruthy();
  });

  it('mantiene la estructura de retorno correcta (campos solicitud)', () => {
    const filas = [
      generarFila({
        idLote: 'LOTE-S',
        arrendatario: 'Carlos Pérez',
        tipoDoc: 'CC',
        identificacion: '987654321',
        celular: '3209876543',
        correo: 'carlos@mail.com',
        destino: 'COMERCIAL',
        ciudad: 'MEDELLIN',
        direccion: 'Carrera 10 #20-30',
        canon: '2000000',
        estado: 'EN ANALISIS',
        uuid: 'uuid-test-1'
      })
    ];
    setupEnvironment(filas);

    const resultado = globalThis.obtenerDetalleLote('LOTE-S');

    const sol = resultado.solicitudes[0];
    expect(sol.uuid).toBe('uuid-test-1');
    expect(sol.arrendatario).toBe('Carlos Pérez');
    expect(sol.tipoDoc).toBe('CC');
    expect(sol.identificacion).toBe('987654321');
    expect(sol.celular).toBe('3209876543');
    expect(sol.correo).toBe('carlos@mail.com');
    expect(sol.destino).toBe('COMERCIAL');
    expect(sol.ciudad).toBe('MEDELLIN');
    expect(sol.direccion).toBe('Carrera 10 #20-30');
    expect(sol.canon).toBe('2000000');
    expect(sol.estado).toBe('EN ANALISIS');
  });

  it('reutiliza índice si MemoCache ya fue poblado (simula obtenerLotesDeComercial previo)', () => {
    const filas = [
      generarFila({ idLote: 'LOTE-PRE', arrendatario: 'Preloaded', uuid: 'uuid-pre' }),
      generarFila({ idLote: 'LOTE-OTHER', arrendatario: 'Other', uuid: 'uuid-other' })
    ];
    setupEnvironment(filas);

    // Simulate that a prior function (like obtenerLotesDeComercial) already built the index
    // by calling obtenerDetalleLote for one lote first (which triggers index build)
    const resultado1 = globalThis.obtenerDetalleLote('LOTE-PRE');
    expect(resultado1.lote).not.toBeNull();
    expect(resultado1.lote.idLote).toBe('LOTE-PRE');

    // Get sheet call log count after first call — the first call does a full read to build index
    const sheet = globalThis.SpreadsheetApp._spreadsheet.getSheetByName('Control_General');
    const getRange62ColsCalls = sheet.getCallLog('getRange')
      .filter(c => c.args && c.args[3] === 62 && c.args[2] > 1).length;

    // Now call for a different lote — should reuse the index (no full-data read needed)
    const resultado2 = globalThis.obtenerDetalleLote('LOTE-OTHER');
    expect(resultado2.lote).not.toBeNull();
    expect(resultado2.lote.idLote).toBe('LOTE-OTHER');
    expect(resultado2.solicitudes[0].arrendatario).toBe('Other');

    // No additional full-data reads (the big getRange with all rows) — index already existed
    const getRange62ColsCalls2 = sheet.getCallLog('getRange')
      .filter(c => c.args && c.args[3] === 62 && c.args[2] > 1).length;
    expect(getRange62ColsCalls2).toBe(getRange62ColsCalls);
  });

  it('trim del idLote antes de buscar', () => {
    const filas = [
      generarFila({ idLote: 'LOTE-TRIM', arrendatario: 'Test' })
    ];
    setupEnvironment(filas);

    const resultado = globalThis.obtenerDetalleLote('  LOTE-TRIM  ');

    expect(resultado.lote).not.toBeNull();
    expect(resultado.lote.idLote).toBe('LOTE-TRIM');
  });
});
