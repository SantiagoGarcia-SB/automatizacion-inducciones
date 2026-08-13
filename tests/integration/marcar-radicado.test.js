/**
 * Integration test: marcarSolicitudRadicada()
 *
 * Refactorizado para usar MemoCache_getIndiceUuid() en vez de TextFinder.
 * Ahora la función:
 *   1. Busca el UUID en el índice en memoria (mapa UUID → fila)
 *   2. Lee la fila completa
 *   3. Verifica que el UUID en la fila coincida (detección de edición concurrente)
 *   4. Escribe la fila completa
 *   5. Inserta en COLA_ANALISIS
 *
 * Llamadas Sheets: 0-1 getDataRange (si índice no cacheado) + 1 getValues + 1 setValues + 1 appendRow
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { createSpreadsheetApp } from '../mocks/spreadsheet-app.mock.js';
import { createLockService } from '../mocks/lock-service.mock.js';

import { readFileSync } from 'fs';
import { resolve } from 'path';

const SOURCE_PATH = resolve(__dirname, '../../Repositorios_ColaAuxiliarRepo.js');
const MEMO_CACHE_PATH = resolve(__dirname, '../../Infraestructura_MemoCache.js');
const REGISTRY_PATH = resolve(__dirname, '../../Infraestructura_Registry.js');

const sourceCode = readFileSync(SOURCE_PATH, 'utf-8');
const memoCacheCode = readFileSync(MEMO_CACHE_PATH, 'utf-8');
const registryCode = readFileSync(REGISTRY_PATH, 'utf-8');

function loadSource() {
  // Load registry first (provides SpreadsheetRegistry_get)
  const wrappedRegistry = `(function() { ${registryCode} \n; globalThis.SpreadsheetRegistry_get = SpreadsheetRegistry_get; globalThis.SpreadsheetRegistry_has = SpreadsheetRegistry_has; globalThis._spreadsheetRegistry = _spreadsheetRegistry; })()`;
  eval(wrappedRegistry);

  // Load MemoCache (provides MemoCache_getIndiceUuid and global _indiceUuidFila)
  const wrappedMemo = `(function() { ${memoCacheCode} \n; globalThis.MemoCache_getIndiceUuid = MemoCache_getIndiceUuid; globalThis._indiceUuidFila = _indiceUuidFila; })()`;
  eval(wrappedMemo);

  // Load the main source
  const wrapped = `(function() { ${sourceCode}\n; globalThis.marcarSolicitudRadicada = marcarSolicitudRadicada; })()`;
  eval(wrapped);
}

/**
 * Genera una fila de Control_General (63 columnas) con los índices reales
 * que toca marcarSolicitudRadicada.
 *   0: ID Lote | 2: Fecha ingreso | 9: Estado | 16: Poliza | 17: Destino
 *   18: Ciudad | 23: Arrendatario | 28: Solicitud Inquilino
 *   34/40/46/52/58: NRO COA1-5 | 61: UUID_SISTEMA | 62: Siniestros
 */
function generarFilaControlGeneral(opts = {}) {
  const fila = new Array(63).fill('');
  fila[0] = opts.idLote || 'LOTE-001';
  fila[2] = opts.fechaIngreso || new Date('2026-07-20');
  fila[9] = opts.estado || 'PENDIENTE RADICAR';
  fila[16] = opts.poliza || 'POL-001';
  fila[17] = opts.destino || 'VIVIENDA';
  fila[18] = opts.ciudad || 'BOGOTA';
  fila[23] = opts.arrendatario || 'Juan Pérez';
  fila[61] = opts.uuid || 'uuid-001';
  return fila;
}

function setupEnvironment(opts) {
  const headerRow = new Array(63).fill('');
  const app = createSpreadsheetApp({
    'Control_General': [headerRow, opts.filaControl],
    'COLA_ANALISIS': [['UUID_SISTEMA', 'ID_LOTE', 'ARRENDATARIO', 'POLIZA', 'CIUDAD', 'DESTINO', 'FECHA_LOTE', 'FILA_REG_ANALISIS', 'ESTADO', 'ASIGNADA_A', 'FECHA_ASIGNACION']]
  });

  globalThis.SpreadsheetApp = app;
  globalThis.getHojaControlId = () => 'mock-control-id';
  globalThis._registrarEvento_ = () => {}; // no-op for safety
  globalThis.Utilities = {
    formatDate: function(date) {
      return date instanceof Date ? date.toISOString().slice(0, 10) : '';
    }
  };

  const lockService = createLockService({ simulateContention: !!opts.lockNoDisponible });
  globalThis.LockService = lockService;

  // Reset the SpreadsheetRegistry so it uses our mock
  globalThis._spreadsheetRegistry = {};

  loadSource();

  // Set the UUID index AFTER loadSource to avoid being overwritten by MemoCache init
  if (!opts.noPreBuildIndex) {
    const uuid = String(opts.filaControl[61] || '').trim();
    if (uuid) {
      // Fila 2 (1-based) because row 1 is header
      globalThis._indiceUuidFila = { [uuid]: 2 };
    } else {
      globalThis._indiceUuidFila = {};
    }
  } else {
    globalThis._indiceUuidFila = null;
  }

  return { app };
}

describe('marcarSolicitudRadicada() — índice UUID en memoria', () => {
  beforeEach(() => {
    delete globalThis.SpreadsheetApp;
    delete globalThis.LockService;
    delete globalThis.getHojaControlId;
    delete globalThis.Utilities;
    delete globalThis.marcarSolicitudRadicada;
    delete globalThis.SpreadsheetRegistry_get;
    delete globalThis.SpreadsheetRegistry_has;
    delete globalThis._spreadsheetRegistry;
    delete globalThis.MemoCache_getIndiceUuid;
    delete globalThis._indiceUuidFila;
    delete globalThis._registrarEvento_;
    delete globalThis._sessionEmail;
    delete globalThis._cacheUsuariosTodos;
    delete globalThis._indiceLoteFila;
  });

  it('usa índice UUID en memoria y realiza 1 lectura + 1 escritura de fila (sin TextFinder)', () => {
    const filaControl = generarFilaControlGeneral({ uuid: 'uuid-100' });
    const { app } = setupEnvironment({ filaControl });

    const resultado = globalThis.marcarSolicitudRadicada('uuid-100', {
      solicitudInquilino: 'SOL-999',
      nroCoa1: 'NRO-1',
      siniestros: 'SIN-1'
    });

    expect(resultado.ok).toBe(true);

    const hojaControl = app._spreadsheet.getSheetByName('Control_General');
    // No debe usar TextFinder
    expect(hojaControl.getCallLog('TextFinder.findNext').length).toBe(0);
    expect(hojaControl.getCallLog('createTextFinder').length).toBe(0);
    // Debe usar getValues y setValues (1 lectura + 1 escritura de fila)
    expect(hojaControl.getCallLog('getValue').length).toBe(0);
    expect(hojaControl.getCallLog('setValue').length).toBe(0);
    expect(hojaControl.getCallLog('getValues').length).toBe(1);
    expect(hojaControl.getCallLog('setValues').length).toBe(1);
  });

  it('inserta en COLA_ANALISIS exactamente 1 vez, con los datos correctos leídos de la misma fila', () => {
    const filaControl = generarFilaControlGeneral({
      uuid: 'uuid-200', idLote: 'LOTE-XYZ', poliza: 'POL-777',
      ciudad: 'CALI', destino: 'COMERCIO', arrendatario: 'María Gómez'
    });
    const { app } = setupEnvironment({ filaControl });

    globalThis.marcarSolicitudRadicada('uuid-200', {});

    const hojaCola = app._spreadsheet.getSheetByName('COLA_ANALISIS');
    const appends = hojaCola.getCallLog('appendRow');
    expect(appends.length).toBe(1);
    expect(appends[0].values[0]).toBe('uuid-200');       // UUID_SISTEMA
    expect(appends[0].values[1]).toBe('LOTE-XYZ');       // ID_LOTE
    expect(appends[0].values[2]).toBe('María Gómez');    // ARRENDATARIO
    expect(appends[0].values[3]).toBe('POL-777');        // POLIZA
    expect(appends[0].values[4]).toBe('CALI');           // CIUDAD
    expect(appends[0].values[5]).toBe('COMERCIO');       // DESTINO
    expect(appends[0].values[8]).toBe('DISPONIBLE');     // ESTADO
  });

  it('guarda los NRO de los 5 codeudores y siniestros en las columnas correctas', () => {
    const filaControl = generarFilaControlGeneral({ uuid: 'uuid-300' });
    const { app } = setupEnvironment({ filaControl });

    globalThis.marcarSolicitudRadicada('uuid-300', {
      solicitudInquilino: 'SOL-1',
      nroCoa1: 'A1', nroCoa2: 'A2', nroCoa3: 'A3', nroCoa4: 'A4', nroCoa5: 'A5',
      siniestros: 'S-1'
    });

    const hojaControl = app._spreadsheet.getSheetByName('Control_General');
    const filaFinal = hojaControl._fullData[1]; // fila 2 (0-based índice 1)

    expect(filaFinal[9]).toBe('RADICADO');   // Estado
    expect(filaFinal[28]).toBe('SOL-1');     // Solicitud Inquilino (col 29)
    expect(filaFinal[34]).toBe('A1');        // NRO COA1 (col 35)
    expect(filaFinal[40]).toBe('A2');        // NRO COA2 (col 41)
    expect(filaFinal[46]).toBe('A3');        // NRO COA3 (col 47)
    expect(filaFinal[52]).toBe('A4');        // NRO COA4 (col 53)
    expect(filaFinal[58]).toBe('A5');        // NRO COA5 (col 59)
    expect(filaFinal[62]).toBe('S-1');       // Siniestros (col 63)
  });

  it('idempotencia: si ya está RADICADO, no escribe nada y retorna ok:false', () => {
    const filaControl = generarFilaControlGeneral({ uuid: 'uuid-400', estado: 'RADICADO' });
    const { app } = setupEnvironment({ filaControl });

    const resultado = globalThis.marcarSolicitudRadicada('uuid-400', { solicitudInquilino: 'X' });

    expect(resultado.ok).toBe(false);
    expect(resultado.mensaje).toContain('ya fue marcada');

    const hojaControl = app._spreadsheet.getSheetByName('Control_General');
    expect(hojaControl.getCallLog('setValues').length).toBe(0);

    const hojaCola = app._spreadsheet.getSheetByName('COLA_ANALISIS');
    expect(hojaCola.getCallLog('appendRow').length).toBe(0);
  });

  it('si no se puede adquirir el lock, retorna ok:false sin tocar ninguna hoja', () => {
    const filaControl = generarFilaControlGeneral({ uuid: 'uuid-500' });
    const { app } = setupEnvironment({ filaControl, lockNoDisponible: true });

    const resultado = globalThis.marcarSolicitudRadicada('uuid-500', {});

    expect(resultado.ok).toBe(false);
    const hojaControl = app._spreadsheet.getSheetByName('Control_General');
    expect(hojaControl.getCallLog('getValues').length).toBe(0);
    expect(hojaControl.getCallLog('setValues').length).toBe(0);
  });

  it('retorna ok:false si UUID no está en el índice (solicitud no encontrada)', () => {
    const filaControl = generarFilaControlGeneral({ uuid: 'uuid-existente' });
    const { app } = setupEnvironment({ filaControl });

    // Buscar un UUID que no existe en el índice
    const resultado = globalThis.marcarSolicitudRadicada('uuid-inexistente', {});

    expect(resultado.ok).toBe(false);
    expect(resultado.mensaje).toContain('no encontrada');

    const hojaControl = app._spreadsheet.getSheetByName('Control_General');
    expect(hojaControl.getCallLog('setValues').length).toBe(0);
  });

  it('retorna ok:false si la fila ya no contiene el UUID esperado (edición concurrente)', () => {
    // Setup: el índice dice que 'uuid-original' está en fila 2,
    // pero la fila realmente tiene 'uuid-cambiado' (otro proceso lo movió)
    const filaControl = generarFilaControlGeneral({ uuid: 'uuid-cambiado' });
    const { app } = setupEnvironment({ filaControl });

    // Forzar el índice a mapear 'uuid-original' → fila 2
    globalThis._indiceUuidFila = { 'uuid-original': 2 };

    const resultado = globalThis.marcarSolicitudRadicada('uuid-original', {
      solicitudInquilino: 'SOL-X'
    });

    expect(resultado.ok).toBe(false);
    expect(resultado.mensaje).toContain('cambió de posición');

    // No debe haber escrito nada
    const hojaControl = app._spreadsheet.getSheetByName('Control_General');
    expect(hojaControl.getCallLog('setValues').length).toBe(0);

    const hojaCola = app._spreadsheet.getSheetByName('COLA_ANALISIS');
    expect(hojaCola.getCallLog('appendRow').length).toBe(0);
  });

  it('si el índice no está precargado, lee datos completos y construye el índice', () => {
    const filaControl = generarFilaControlGeneral({ uuid: 'uuid-600' });
    const { app } = setupEnvironment({ filaControl, noPreBuildIndex: true });

    const resultado = globalThis.marcarSolicitudRadicada('uuid-600', {
      solicitudInquilino: 'SOL-600'
    });

    expect(resultado.ok).toBe(true);

    // Should have called getDataRange to build the index
    const hojaControl = app._spreadsheet.getSheetByName('Control_General');
    expect(hojaControl.getCallLog('getDataRange').length).toBe(1);
  });
});
