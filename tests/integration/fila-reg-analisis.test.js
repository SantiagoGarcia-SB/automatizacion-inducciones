/**
 * Integration test: sincronizarLoteAutomatico() — escritura de FILA_REG_ANALISIS
 *
 * Verifica:
 * 1. Al insertar filas nuevas en "registro analisis", se escribe el número de fila
 *    resultante (base-1) en columna H de COLA_ANALISIS, identificada por UUID.
 * 2. Si el UUID no existe en COLA_ANALISIS, no se genera error.
 * 3. Si COLA_ANALISIS no existe o está vacía, no se genera error.
 *
 * Requirements: 9.1
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { createSpreadsheetApp, MockSpreadsheet } from '../mocks/spreadsheet-app.mock.js';
import { readFileSync } from 'fs';
import { resolve } from 'path';

// ─── Load sincronizarLoteAutomatico from source ─────────────────────────────

const SOURCE_PATH = resolve(__dirname, '../../Sincronizacion.js');
const sourceCode = readFileSync(SOURCE_PATH, 'utf-8');

/**
 * Loads sincronizarLoteAutomatico into globalThis by eval'ing the source file.
 */
function loadSource() {
  // Need to extract only the function and its helpers, not the ones that use MailApp
  // We'll wrap in a function and define only what we need
  const wrapped = `(function() {
    ${sourceCode}
    globalThis.sincronizarLoteAutomatico = sincronizarLoteAutomatico;
    globalThis.obtenerMapaColumnas = obtenerMapaColumnas;
  })()`;
  eval(wrapped);
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

/**
 * Headers for Control_General (simplified for testing)
 */
function headersControlGeneral() {
  const h = new Array(62).fill('');
  h[0] = 'ID Lote';
  h[9] = 'Estado';
  h[61] = 'UUID_SISTEMA';
  // Map the required columns from MAPEO_COLUMNAS
  h[1] = 'Fecha ingreso';
  h[2] = 'tipo negociacion';
  h[3] = 'Poliza';
  h[4] = 'Destino';
  h[5] = 'Ciudad del inmueble';
  h[23] = 'Arrendatario';
  return h;
}

/**
 * Headers for registro analisis (matching what sync expects)
 */
function headersRegistroAnalisis() {
  const h = new Array(10).fill('');
  h[0] = 'UUID_SISTEMA';
  h[1] = 'Fecha Lote';
  h[2] = 'tipo negociacion';
  h[3] = 'Poliza';
  h[4] = 'codigo lote';
  h[5] = 'Destino';
  h[6] = 'ciudad del inmueble';
  h[7] = 'Arrendatario';
  return h;
}

/**
 * Headers for COLA_ANALISIS (UUID in col A, FILA_REG_ANALISIS in col H)
 */
function headersColaAnalisis() {
  return ['UUID_SISTEMA', 'ESTADO', 'TIPO', 'FECHA_CREACION', 'ID_LOTE', 'ARRENDATARIO', 'PRIORIDAD', 'FILA_REG_ANALISIS'];
}

/**
 * Creates a row for Control_General with a given UUID and estado
 */
function filaControlGeneral(uuid, idLote, estado) {
  const fila = new Array(62).fill('');
  fila[0] = idLote;
  fila[1] = '2025-01-15';
  fila[2] = 'ARRIENDO';
  fila[3] = 'POL-001';
  fila[4] = 'BOGOTA';
  fila[5] = 'BOGOTA';
  fila[9] = estado;
  fila[23] = 'Juan Pérez';
  fila[61] = uuid;
  return fila;
}

/**
 * Creates a row for COLA_ANALISIS
 */
function filaColaAnalisis(uuid, estado) {
  return [uuid, estado || 'DISPONIBLE', 'ARRIENDO', '2025-01-15', 'LOTE-001', 'Juan Pérez', '1', ''];
}

// ─── Setup ───────────────────────────────────────────────────────────────────

function setupEnvironment(controlRows, analisisRows, colaRows) {
  const controlData = [headersControlGeneral(), ...controlRows];
  const analisisData = [headersRegistroAnalisis(), ...analisisRows];

  const sheetsConfig = {
    'Control_General': controlData
  };

  // We need two separate spreadsheets: one for origen (Control_General + COLA_ANALISIS)
  // and one for destino (registro analisis)
  // Since the mock's openById always returns the same spreadsheet, we need a more
  // elaborate setup. Let's create a composite mock that routes by ID.

  const libroOrigenSheets = {
    'Control_General': controlData
  };
  if (colaRows !== undefined) {
    libroOrigenSheets['COLA_ANALISIS'] = [headersColaAnalisis(), ...colaRows];
  }

  const libroDestinoSheets = {
    'registro analisis': analisisData
  };

  const origenSS = new MockSpreadsheet(libroOrigenSheets);
  const destinoSS = new MockSpreadsheet(libroDestinoSheets);

  // Create a SpreadsheetApp that routes by ID
  globalThis.SpreadsheetApp = {
    openById: function(id) {
      if (id === 'MOCK_CONTROL_ID') return origenSS;
      if (id === 'MOCK_ANALISIS_ID') return destinoSS;
      return origenSS;
    }
  };

  globalThis.ID_HOJA_CONTROL = 'MOCK_CONTROL_ID';
  globalThis.ID_ARCHIVO_ANALISIS = 'MOCK_ANALISIS_ID';

  // Mock LockService
  globalThis.LockService = {
    getScriptLock: function() {
      return {
        tryLock: function() { return true; },
        releaseLock: function() {}
      };
    }
  };

  // Mock Logger
  globalThis.Logger = {
    log: function() {}
  };

  // Mock _registrarEvento_ (usado por la medición temporal de latencia, ver Config.js)
  globalThis._registrarEvento_ = function() {};

  // Load source
  loadSource();

  return { origenSS, destinoSS };
}

// ─── Tests ───────────────────────────────────────────────────────────────────

describe('sincronizarLoteAutomatico() — escritura de FILA_REG_ANALISIS', () => {
  beforeEach(() => {
    delete globalThis.SpreadsheetApp;
    delete globalThis.ID_HOJA_CONTROL;
    delete globalThis.ID_ARCHIVO_ANALISIS;
    delete globalThis.LockService;
    delete globalThis.Logger;
    delete globalThis._registrarEvento_;
    delete globalThis.sincronizarLoteAutomatico;
    delete globalThis.obtenerMapaColumnas;
  });

  it('escribe el número de fila en COLA_ANALISIS col H al insertar fila nueva', () => {
    // Setup: 1 solicitud RADICADO en Control_General, no existe en registro analisis
    const uuid = 'UUID-NUEVO-001';
    const controlRows = [filaControlGeneral(uuid, 'LOTE-001', 'RADICADO')];
    const analisisRows = []; // registro analisis vacío (solo header)
    const colaRows = [filaColaAnalisis(uuid, 'DISPONIBLE')];

    const { origenSS, destinoSS } = setupEnvironment(controlRows, analisisRows, colaRows);

    // Execute
    globalThis.sincronizarLoteAutomatico();

    // Verify: the new row was inserted at row 2 in registro analisis
    // (row 1 is header, so first data row is 2)
    const hojaCola = origenSS.getSheetByName('COLA_ANALISIS');
    const callLog = hojaCola.getCallLog('setValue');

    // Should have written the row number to column H (col 8)
    const filaRegCall = callLog.find(c => c.value === 2);
    expect(filaRegCall).toBeDefined();

    // Verify the actual data in COLA_ANALISIS row 2, col H (index 7)
    const dataCola = hojaCola._fullData;
    expect(dataCola[1][7]).toBe(2); // Row 2 of COLA_ANALISIS, col H = fila 2 en registro analisis
  });

  it('escribe el número correcto cuando ya hay filas en registro analisis', () => {
    const uuid = 'UUID-NUEVO-002';
    const controlRows = [filaControlGeneral(uuid, 'LOTE-002', 'RADICADO')];

    // registro analisis ya tiene 5 filas de datos existentes
    const analisisExistentes = [];
    for (let i = 0; i < 5; i++) {
      const fila = new Array(8).fill('');
      fila[0] = 'UUID-EXISTENTE-' + i;
      analisisExistentes.push(fila);
    }

    const colaRows = [filaColaAnalisis(uuid, 'DISPONIBLE')];

    const { origenSS } = setupEnvironment(controlRows, analisisExistentes, colaRows);

    globalThis.sincronizarLoteAutomatico();

    // The new row should be inserted at row 7 (1 header + 5 existing + 1 new = row 7)
    const hojaCola = origenSS.getSheetByName('COLA_ANALISIS');
    const dataCola = hojaCola._fullData;
    expect(dataCola[1][7]).toBe(7); // FILA_REG_ANALISIS = 7
  });

  it('escribe FILA_REG_ANALISIS para múltiples inserciones del mismo lote', () => {
    const uuid1 = 'UUID-MULTI-001';
    const uuid2 = 'UUID-MULTI-002';
    const uuid3 = 'UUID-MULTI-003';

    const controlRows = [
      filaControlGeneral(uuid1, 'LOTE-A', 'RADICADO'),
      filaControlGeneral(uuid2, 'LOTE-A', 'RADICADO'),
      filaControlGeneral(uuid3, 'LOTE-A', 'RADICADO')
    ];

    const analisisRows = []; // vacío
    const colaRows = [
      filaColaAnalisis(uuid1, 'DISPONIBLE'),
      filaColaAnalisis(uuid2, 'DISPONIBLE'),
      filaColaAnalisis(uuid3, 'DISPONIBLE')
    ];

    const { origenSS } = setupEnvironment(controlRows, analisisRows, colaRows);

    globalThis.sincronizarLoteAutomatico();

    const hojaCola = origenSS.getSheetByName('COLA_ANALISIS');
    const dataCola = hojaCola._fullData;

    // 3 nuevas filas insertadas en registro analisis: filas 2, 3, 4
    expect(dataCola[1][7]).toBe(2); // UUID-MULTI-001 → fila 2
    expect(dataCola[2][7]).toBe(3); // UUID-MULTI-002 → fila 3
    expect(dataCola[3][7]).toBe(4); // UUID-MULTI-003 → fila 4
  });

  it('no falla si UUID no existe en COLA_ANALISIS', () => {
    const uuid = 'UUID-SIN-COLA';
    const controlRows = [filaControlGeneral(uuid, 'LOTE-001', 'RADICADO')];
    const analisisRows = [];
    // COLA_ANALISIS tiene otros UUIDs pero no el que se inserta
    const colaRows = [filaColaAnalisis('UUID-OTRO', 'DISPONIBLE')];

    const { origenSS } = setupEnvironment(controlRows, analisisRows, colaRows);

    // Should not throw
    expect(() => globalThis.sincronizarLoteAutomatico()).not.toThrow();

    // COLA_ANALISIS should remain unchanged for the existing row
    const hojaCola = origenSS.getSheetByName('COLA_ANALISIS');
    expect(hojaCola._fullData[1][7]).toBe(''); // unchanged
  });

  it('no falla si COLA_ANALISIS no existe', () => {
    const uuid = 'UUID-SIN-HOJA';
    const controlRows = [filaControlGeneral(uuid, 'LOTE-001', 'RADICADO')];
    const analisisRows = [];

    // Don't pass colaRows — COLA_ANALISIS won't exist
    const { origenSS } = setupEnvironment(controlRows, analisisRows, undefined);

    // Should not throw
    expect(() => globalThis.sincronizarLoteAutomatico()).not.toThrow();
  });

  it('no escribe FILA_REG_ANALISIS para filas actualizadas (solo para nuevas)', () => {
    const uuid = 'UUID-YA-EXISTE';
    const controlRows = [filaControlGeneral(uuid, 'LOTE-001', 'RADICADO')];

    // registro analisis ya tiene este UUID
    const analisisExistente = new Array(8).fill('');
    analisisExistente[0] = uuid;
    const analisisRows = [analisisExistente];

    const colaRows = [filaColaAnalisis(uuid, 'DISPONIBLE')];

    const { origenSS } = setupEnvironment(controlRows, analisisRows, colaRows);

    globalThis.sincronizarLoteAutomatico();

    // FILA_REG_ANALISIS should NOT be written since it's an update, not an insert
    const hojaCola = origenSS.getSheetByName('COLA_ANALISIS');
    const setValueCalls = hojaCola.getCallLog('setValue');
    // No setValue calls should target column 8 for this row
    const filaRegCalls = setValueCalls.filter(c => typeof c.value === 'number');
    expect(filaRegCalls.length).toBe(0);
  });
});
