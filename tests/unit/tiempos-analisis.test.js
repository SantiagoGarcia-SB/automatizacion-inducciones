/**
 * Unit tests: Tiempos_Analisis.js
 *
 * Trigger onEdit sobre "registro analisis": sella Inicio Analisis (primera
 * edición) y Fin Analisis (última edición) en Control_General, por UUID.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { createSpreadsheetApp } from '../mocks/spreadsheet-app.mock.js';
import { createLockService } from '../mocks/lock-service.mock.js';
import { readFileSync } from 'fs';
import { resolve } from 'path';

const leer = (f) => readFileSync(resolve(__dirname, '../../' + f), 'utf-8');

const api = eval(`(function() { ${leer('Infraestructura_Concurrencia.js')}\n${leer('Asignaciones.js')}\n${leer('Tiempos_Analisis.js')}
  ; return {
    entrada: TiemposAnalisis_columnasEntrada_,
    registrar: registrarTiemposAnalisis
  }; })()`);

const HDR = ['UUID_SISTEMA', 'ASIGNADA A…', 'Ingresos', 'Acierta', 'ocupacion', 'Resultado Final Inquilino',
  'Ingresos COA1', 'Ocupacion COA1', 'ocupacion COA1', 'comentarios del analista', 'REGISTRO ANALISTA SAI'];
const C = { uuid: 1, asignada: 2, ingresos: 3, acierta: 4, ocupacion: 5, resultadoFinal: 6, ingresosCoa1: 7, ocupCoa1a: 8, ocupCoa1b: 9, coment: 10, sai: 11 };

let analisis, control;

function setup(filasAnalisis, filasControl) {
  analisis = createSpreadsheetApp({ 'registro analisis': [HDR, ...filasAnalisis] });
  control = createSpreadsheetApp({ Control_General: [['ID Lote', 'UUID_SISTEMA'], ...filasControl] });
  globalThis.getHojaControlId = () => 'control';
  globalThis.SpreadsheetRegistry_get = () => control._spreadsheet;
  globalThis.LockService = createLockService();
}

const hojaA = () => analisis._spreadsheet.getSheetByName('registro analisis');
const hojaC = () => control._spreadsheet.getSheetByName('Control_General');

// Evento onEdit simulado sobre una celda (o bloque) de registro analisis
function edicion(fila, col, { filas = 1, cols = 1, value = 'x' } = {}) {
  const hoja = hojaA();
  const range = hoja.getRange(fila, col, filas, cols);
  range.getSheet = () => hoja;
  return { range, value: filas === 1 && cols === 1 ? value : undefined };
}

const fila = (uuid, asignada = 'A PELAEZ', sai = '') => {
  const f = new Array(HDR.length).fill('');
  f[0] = uuid;
  f[1] = asignada;
  f[10] = sai;
  return f;
};

describe('columnas de entrada del analista', () => {
  it('incluye campos del inquilino, COAs (con variantes de mayúsculas) y comentarios; excluye calculadas', () => {
    expect(api.entrada(HDR)).toEqual([C.ingresos, C.acierta, C.ocupacion, C.ingresosCoa1, C.ocupCoa1a, C.ocupCoa1b, C.coment]);
  });
});

describe('registrarTiemposAnalisis()', () => {
  beforeEach(() => { vi.useRealTimers(); });

  it('primera edición sella Inicio y Fin; crea las columnas en Control_General', () => {
    setup([fila('u1')], [['L1', 'u1']]);
    const antes = Date.now();
    const r = api.registrar(edicion(2, C.ingresos));

    expect(r).toEqual({ filas: 1 });
    const hc = hojaC();
    expect(hc._fullData[0].slice(2)).toEqual(['Inicio Analisis', 'Fin Analisis']);
    expect(hc._fullData[1][2]).toBeInstanceOf(Date);
    expect(hc._fullData[1][2].getTime()).toBeGreaterThanOrEqual(antes);
    expect(hc._fullData[1][3]).toBeInstanceOf(Date);
  });

  it('el Inicio no se mueve en ediciones posteriores y el Fin sí avanza', () => {
    setup([fila('u1')], [['L1', 'u1']]);
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2026, 9, 1, 9, 0));
    api.registrar(edicion(2, C.ingresos));
    vi.setSystemTime(new Date(2026, 9, 1, 11, 30));
    api.registrar(edicion(2, C.acierta));

    const f = hojaC()._fullData[1];
    expect(f[2]).toEqual(new Date(2026, 9, 1, 9, 0));
    expect(f[3]).toEqual(new Date(2026, 9, 1, 11, 30));
  });

  it('ignora ediciones en columnas que no son campos del analista', () => {
    setup([fila('u1')], [['L1', 'u1']]);
    expect(api.registrar(edicion(2, C.resultadoFinal))).toBeUndefined();
    expect(api.registrar(edicion(2, C.asignada))).toBeUndefined();
    expect(hojaC()._fullData[0]).toEqual(['ID Lote', 'UUID_SISTEMA']); // ni columnas creadas
  });

  it('ignora filas sin asignar y filas ya terminadas (REGISTRO ANALISTA SAI)', () => {
    setup([fila('u1', ''), fila('u2', 'A PELAEZ', 'a@x.co')], [['L1', 'u1'], ['L1', 'u2']]);
    expect(api.registrar(edicion(2, C.ingresos))).toEqual({ filas: 0 });
    expect(api.registrar(edicion(3, C.ingresos))).toEqual({ filas: 0 });
  });

  it('borrar el contenido de una celda no cuenta como diligenciar', () => {
    setup([fila('u1')], [['L1', 'u1']]);
    expect(api.registrar(edicion(2, C.ingresos, { value: '' }))).toBeUndefined();
  });

  it('ignora otras hojas y el encabezado', () => {
    setup([fila('u1')], [['L1', 'u1']]);
    expect(api.registrar(edicion(1, C.ingresos))).toBeUndefined();
    const otra = edicion(2, C.ingresos);
    otra.range.getSheet = () => ({ getName: () => 'otra hoja' });
    expect(api.registrar(otra)).toBeUndefined();
  });

  it('pegado en varias filas sella cada solicitud asignada', () => {
    setup([fila('u1'), fila('u2'), fila('u3', '')], [['L1', 'u1'], ['L1', 'u2'], ['L1', 'u3']]);
    const r = api.registrar(edicion(2, C.ingresos, { filas: 3, cols: 2 }));
    expect(r).toEqual({ filas: 2 });
    const hc = hojaC()._fullData;
    expect(hc[1][2]).toBeInstanceOf(Date);
    expect(hc[2][2]).toBeInstanceOf(Date);
    expect(hc[3][2]).toBeFalsy(); // u3 sin asignar
  });

  it('no usa el lock global en la ruta normal (columnas ya creadas): no bloquea a nadie', () => {
    setup([fila('u1')], [['L1', 'u1']]);
    api.registrar(edicion(2, C.ingresos)); // la primera vez crea las columnas (sí toma el lock, brevemente)
    const lock = globalThis.LockService.getScriptLock();
    const espia = vi.spyOn(lock, 'tryLock');
    const r = api.registrar(edicion(2, C.acierta));
    expect(r).toEqual({ filas: 1 });
    expect(espia).not.toHaveBeenCalled();
  });

  it('UUID sin fila en Control_General no sella ni falla', () => {
    setup([fila('uX')], [['L1', 'u1']]);
    expect(api.registrar(edicion(2, C.ingresos))).toEqual({ filas: 0 });
  });
});
