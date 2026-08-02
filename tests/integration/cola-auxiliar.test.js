/**
 * Integration test: obtenerColaAuxiliar()
 *
 * Verifica:
 * 1. Solo ejecuta 1 getRange().getValues() para leer datos
 * 2. Con > 2000 filas, solo lee las últimas 2000
 * 3. Con < 2000 filas, lee todas las disponibles
 * 4. Retorna máximo 100 resultados filtrados por PENDIENTE RADICAR
 * 5. El campo `fila` referencia correctamente la fila real en la hoja
 *
 * Requirements: 2.1, 2.4, 10.1, 10.4, 10.5
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { createSpreadsheetApp } from '../mocks/spreadsheet-app.mock.js';

// ─── Load obtenerColaAuxiliar from source (GAS has no exports) ───────────────

import { readFileSync } from 'fs';
import { resolve } from 'path';

const SOURCE_PATH = resolve(__dirname, '../../Repositorios_ColaAuxiliarRepo.js');
const sourceCode = readFileSync(SOURCE_PATH, 'utf-8');

/**
 * Loads obtenerColaAuxiliar into globalThis by eval'ing the source file.
 * This simulates the GAS runtime where all functions share global scope.
 */
function loadSource() {
  // Wrap in a function to avoid strict-mode issues with function declarations
  const wrapped = `(function() { ${sourceCode}\n; globalThis.obtenerColaAuxiliar = obtenerColaAuxiliar; })()`;
  eval(wrapped);
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

/**
 * Genera una fila de Control_General con 62 columnas.
 */
function generarFila(opts) {
  var fila = new Array(62).fill('');
  fila[0] = opts.idLote || 'LOTE-001';
  fila[9] = opts.estado || '';
  fila[17] = opts.destino || 'BOGOTA';
  fila[18] = opts.ciudad || 'BOGOTA';
  fila[20] = opts.canon || '1500000';
  fila[23] = opts.arrendatario || 'Juan Pérez';
  fila[24] = opts.tipoDoc || 'CC';
  fila[25] = opts.identificacion || '123456';
  fila[61] = opts.uuid || 'uuid-' + Math.random().toString(36).slice(2, 10);
  return fila;
}

/**
 * Genera N filas con un estado dado.
 */
function generarFilas(n, estado, uuidPrefix) {
  var filas = [];
  for (var i = 0; i < n; i++) {
    filas.push(generarFila({
      estado: estado,
      uuid: (uuidPrefix || 'uuid') + '-' + i,
      arrendatario: 'Arrendatario ' + i,
      idLote: 'LOTE-' + String(i).padStart(3, '0')
    }));
  }
  return filas;
}

/**
 * Sets up the global mocks and loads obtenerColaAuxiliar.
 * @param {any[][]} dataRows - Rows of data (without header)
 * @returns The mock app for assertions
 */
function setupEnvironment(dataRows) {
  // Header row (row 1)
  const header = new Array(62).fill('HEADER');
  const allData = [header, ...dataRows];

  const app = createSpreadsheetApp({
    'Control_General': allData
  });

  globalThis.SpreadsheetApp = app;
  globalThis.getHojaControlId = () => 'mock-id';

  // Load the actual source code into global scope
  loadSource();

  return app;
}

// ─── Tests ───────────────────────────────────────────────────────────────────

describe('obtenerColaAuxiliar() — ventana de lectura', () => {
  beforeEach(() => {
    delete globalThis.SpreadsheetApp;
    delete globalThis.getHojaControlId;
    delete globalThis.obtenerColaAuxiliar;
  });

  it('solo ejecuta 1 getRange().getValues() para datos', () => {
    // 50 filas: 40 RADICADO + 10 PENDIENTE RADICAR
    const rows = [
      ...generarFilas(40, 'RADICADO', 'rad'),
      ...generarFilas(10, 'PENDIENTE RADICAR', 'pend')
    ];
    const app = setupEnvironment(rows);

    const resultado = globalThis.obtenerColaAuxiliar();

    // Verify: exactly 1 getValues call for data
    const sheet = app._spreadsheet.getSheetByName('Control_General');
    const getValuesCalls = sheet.getCallLog('getValues');
    expect(getValuesCalls.length).toBe(1);

    expect(resultado.length).toBe(10);
  });

  it('con > 2000 filas, solo lee las últimas 2000', () => {
    // 3000 data rows:
    // First 1000: PENDIENTE RADICAR (should NOT be in the reading window)
    // Next 1990: RADICADO
    // Last 10: PENDIENTE RADICAR
    const earlyRows = generarFilas(1000, 'PENDIENTE RADICAR', 'early');
    const lateRadicado = generarFilas(1990, 'RADICADO', 'late-rad');
    const latePendiente = generarFilas(10, 'PENDIENTE RADICAR', 'late-pend');
    const allRows = [...earlyRows, ...lateRadicado, ...latePendiente];

    const app = setupEnvironment(allRows);

    const resultado = globalThis.obtenerColaAuxiliar();

    // Verify getRange was called with the correct window:
    // ultimaFila = 3001 (1 header + 3000 data)
    // filasData = Math.min(3000, 2000) = 2000
    // filaInicio = Math.max(2, 3001 - 2000 + 1) = 1002
    const sheet = app._spreadsheet.getSheetByName('Control_General');
    const getRangeCalls = sheet.getCallLog('getRange');

    const dataRangeCall = getRangeCalls.find(c =>
      c.args && c.args[0] === 1002 && c.args[1] === 1 && c.args[2] === 2000 && c.args[3] === 62
    );
    expect(dataRangeCall).toBeDefined();

    // Should only return items from the last 2000 rows (10 PENDIENTE RADICAR)
    expect(resultado.length).toBe(10);

    // All results should come from the "late-pend" batch, not "early"
    for (const item of resultado) {
      expect(item.uuid).toMatch(/^late-pend-/);
    }
  });

  it('con < 2000 filas, lee todas las disponibles', () => {
    // 500 data rows: 480 RADICADO + 20 PENDIENTE RADICAR
    const rows = [
      ...generarFilas(480, 'RADICADO', 'rad'),
      ...generarFilas(20, 'PENDIENTE RADICAR', 'pend')
    ];
    const app = setupEnvironment(rows);

    const resultado = globalThis.obtenerColaAuxiliar();

    // Verify the getRange covers all 500 data rows starting from row 2:
    // ultimaFila = 501 (1 header + 500 data)
    // filasData = Math.min(500, 2000) = 500
    // filaInicio = Math.max(2, 501 - 500 + 1) = 2
    const sheet = app._spreadsheet.getSheetByName('Control_General');
    const getRangeCalls = sheet.getCallLog('getRange');

    const dataRangeCall = getRangeCalls.find(c =>
      c.args && c.args[0] === 2 && c.args[1] === 1 && c.args[2] === 500 && c.args[3] === 62
    );
    expect(dataRangeCall).toBeDefined();
    expect(resultado.length).toBe(20);
  });

  it('retorna máximo 100 resultados', () => {
    // 500 filas, todas PENDIENTE RADICAR
    const rows = generarFilas(500, 'PENDIENTE RADICAR', 'pend');
    setupEnvironment(rows);

    const resultado = globalThis.obtenerColaAuxiliar();
    expect(resultado.length).toBe(100);
  });

  it('el campo fila referencia correctamente la fila real en la hoja', () => {
    // 2500 data rows, last one is PENDIENTE RADICAR
    const rows = [
      ...generarFilas(2499, 'RADICADO', 'rad'),
      generarFila({ estado: 'PENDIENTE RADICAR', uuid: 'target-uuid' })
    ];
    setupEnvironment(rows);

    const resultado = globalThis.obtenerColaAuxiliar();

    // The target is the last data row:
    // ultimaFila = 2501 (1 header + 2500 data)
    // filasData = Math.min(2500, 2000) = 2000
    // filaInicio = Math.max(2, 2501 - 2000 + 1) = 502
    // In the block array, index 1999 (last of 2000) → fila = 502 + 1999 = 2501
    expect(resultado.length).toBe(1);
    expect(resultado[0].uuid).toBe('target-uuid');
    expect(resultado[0].fila).toBe(2501);
  });

  it('retorna array vacío si la hoja tiene solo header', () => {
    const app = createSpreadsheetApp({
      'Control_General': [new Array(62).fill('HEADER')]
    });
    globalThis.SpreadsheetApp = app;
    globalThis.getHojaControlId = () => 'mock-id';
    loadSource();

    const resultado = globalThis.obtenerColaAuxiliar();
    expect(resultado).toEqual([]);
  });
});
