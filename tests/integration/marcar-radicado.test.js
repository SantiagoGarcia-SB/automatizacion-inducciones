/**
 * Integration test: marcarSolicitudRadicada()
 *
 * Antes de la optimización esta función hacía hasta ~16 llamadas a Sheets
 * (TextFinder + getValue de estado + hasta 8 setValue individuales + hasta
 * 6 getValue individuales para armar la fila de COLA_ANALISIS). Ahora debe
 * quedar en: 1 TextFinder + 1 lectura de fila completa + 1 escritura de fila
 * completa + 1 appendRow en COLA_ANALISIS = 4 llamadas, sin ningún
 * getValue/setValue de celda individual.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { createSpreadsheetApp } from '../mocks/spreadsheet-app.mock.js';
import { createLockService } from '../mocks/lock-service.mock.js';

import { readFileSync } from 'fs';
import { resolve } from 'path';

const SOURCE_PATH = resolve(__dirname, '../../Repositorios_ColaAuxiliarRepo.js');
const sourceCode = readFileSync(SOURCE_PATH, 'utf-8');

function loadSource() {
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
  globalThis.Utilities = {
    formatDate: function(date) {
      return date instanceof Date ? date.toISOString().slice(0, 10) : '';
    }
  };

  const lockService = createLockService({ simulateContention: !!opts.lockNoDisponible });
  globalThis.LockService = lockService;

  loadSource();

  return { app };
}

describe('marcarSolicitudRadicada() — escritura batch', () => {
  beforeEach(() => {
    delete globalThis.SpreadsheetApp;
    delete globalThis.LockService;
    delete globalThis.getHojaControlId;
    delete globalThis.Utilities;
    delete globalThis.marcarSolicitudRadicada;
  });

  it('usa exactamente 1 lectura y 1 escritura de fila completa en Control_General (sin getValue/setValue individuales)', () => {
    const filaControl = generarFilaControlGeneral({ uuid: 'uuid-100' });
    const { app } = setupEnvironment({ filaControl });

    const resultado = globalThis.marcarSolicitudRadicada('uuid-100', {
      solicitudInquilino: 'SOL-999',
      nroCoa1: 'NRO-1',
      siniestros: 'SIN-1'
    });

    expect(resultado.ok).toBe(true);

    const hojaControl = app._spreadsheet.getSheetByName('Control_General');
    expect(hojaControl.getCallLog('getValue').length).toBe(0);
    expect(hojaControl.getCallLog('setValue').length).toBe(0);
    expect(hojaControl.getCallLog('getValues').length).toBe(1);
    expect(hojaControl.getCallLog('setValues').length).toBe(1);
    expect(hojaControl.getCallLog('TextFinder.findNext').length).toBe(1);
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
});
