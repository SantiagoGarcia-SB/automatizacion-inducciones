/**
 * Unit tests: obtenerLotesPendientesPazYSalvo() (Repositorios_ControlGeneralRepo.js)
 *
 * Usada por el reporte de cierre de mes para armar la sección "esto necesita
 * tu acción". Verifica el filtro por comercial+estado y el cálculo de días
 * de espera (misma lógica que enviarRecordatoriosPazYSalvoDiario).
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { createSpreadsheetApp } from '../mocks/spreadsheet-app.mock.js';
import { readFileSync } from 'fs';
import { resolve } from 'path';

const sourceCode = readFileSync(resolve(__dirname, '../../Repositorios_ControlGeneralRepo.js'), 'utf-8');

function loadSource() {
  const wrapped = `(function() { ${sourceCode}\n; globalThis.obtenerLotesPendientesPazYSalvo = obtenerLotesPendientesPazYSalvo; })()`;
  eval(wrapped);
}

// Control_General: 61 columnas (índice 0-60). Índices relevantes:
// 0=ID Lote, 2=Fecha ingreso, 9=Estado, 10=Comercial, 60=Fecha aviso (col BI)
function filaControl(opts = {}) {
  const fila = new Array(61).fill('');
  fila[0] = opts.idLote || 'LOTE-1';
  fila[2] = opts.fechaIngreso || new Date();
  fila[9] = opts.estado || 'PENDIENTE PAZ Y SALVO';
  fila[10] = opts.comercial || 'JUAN PEREZ';
  fila[60] = opts.fechaAviso || '';
  return fila;
}

function setupEnvironment(filas) {
  const headers = new Array(61).fill('');
  const app = createSpreadsheetApp({
    'Control_General': [headers, ...filas]
  });
  globalThis.SpreadsheetApp = app;
  globalThis.getHojaControlId = () => 'mock-control-id';
  loadSource();
  return { app };
}

describe('obtenerLotesPendientesPazYSalvo()', () => {
  beforeEach(() => {
    delete globalThis.SpreadsheetApp;
    delete globalThis.getHojaControlId;
    delete globalThis.obtenerLotesPendientesPazYSalvo;
    vi.useRealTimers();
  });

  it('solo retorna lotes del comercial indicado, en estado PENDIENTE PAZ Y SALVO', () => {
    setupEnvironment([
      filaControl({ idLote: 'LOTE-A', comercial: 'JUAN PEREZ', estado: 'PENDIENTE PAZ Y SALVO' }),
      filaControl({ idLote: 'LOTE-B', comercial: 'JUAN PEREZ', estado: 'RADICADO' }), // otro estado
      filaControl({ idLote: 'LOTE-C', comercial: 'MARIA GOMEZ', estado: 'PENDIENTE PAZ Y SALVO' }), // otro comercial
    ]);

    const resultado = globalThis.obtenerLotesPendientesPazYSalvo('JUAN PEREZ');

    expect(resultado.length).toBe(1);
    expect(resultado[0].idLote).toBe('LOTE-A');
  });

  it('calcula los días desde la fecha de aviso (BI) si existe, no desde la fecha de ingreso', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2026, 6, 20)); // 20 de julio 2026

    setupEnvironment([
      filaControl({
        idLote: 'LOTE-A',
        fechaIngreso: new Date(2026, 6, 1),   // hace 19 días
        fechaAviso: new Date(2026, 6, 15)     // hace 5 días — este debe usarse
      }),
    ]);

    const resultado = globalThis.obtenerLotesPendientesPazYSalvo('JUAN PEREZ');
    expect(resultado[0].dias).toBe(5);
  });

  it('usa la fecha de ingreso si nunca se ha enviado un aviso', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2026, 6, 20));

    setupEnvironment([
      filaControl({ idLote: 'LOTE-A', fechaIngreso: new Date(2026, 6, 10), fechaAviso: '' }), // hace 10 días
    ]);

    const resultado = globalThis.obtenerLotesPendientesPazYSalvo('JUAN PEREZ');
    expect(resultado[0].dias).toBe(10);
  });

  it('no duplica un lote que aparece en varias filas (mismo lote, varios contratos)', () => {
    setupEnvironment([
      filaControl({ idLote: 'LOTE-A' }),
      filaControl({ idLote: 'LOTE-A' }),
    ]);

    const resultado = globalThis.obtenerLotesPendientesPazYSalvo('JUAN PEREZ');
    expect(resultado.length).toBe(1);
  });

  it('retorna array vacío si no hay coincidencias', () => {
    setupEnvironment([
      filaControl({ comercial: 'OTRO COMERCIAL' }),
    ]);

    const resultado = globalThis.obtenerLotesPendientesPazYSalvo('JUAN PEREZ');
    expect(resultado).toEqual([]);
  });
});
