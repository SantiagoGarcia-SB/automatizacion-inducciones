/**
 * Integration test: guardarEvaluacionAnalista()
 *
 * Antes: 1 setValue() por campo enviado (hasta ~35 + 2 si finalizar). Ahora:
 * agrupa columnas contiguas en un solo setValues() por bloque.
 *
 * Restricción de correctitud no negociable: la función NUNCA debe leer/
 * reescribir columnas fuera de las que vienen explícitamente en `campos`
 * (o REGISTRO ANALISTA SAI / Fecha Evaluacion si finalizar=true), porque
 * columnas intermedias pueden tener fórmulas vivas — leerlas y reescribirlas
 * las convertiría en valores fijos.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { createSpreadsheetApp } from '../mocks/spreadsheet-app.mock.js';

import { readFileSync } from 'fs';
import { resolve } from 'path';

const SOURCE_PATH = resolve(__dirname, '../../Repositorios_AnalistaRepo.js');
const sourceCode = readFileSync(SOURCE_PATH, 'utf-8');

function loadSource() {
  const wrapped = `(function() { ${sourceCode}\n; globalThis.guardarEvaluacionAnalista = guardarEvaluacionAnalista; })()`;
  eval(wrapped);
}

// Headers con: 3 columnas del inquilino contiguas (Ingresos, Acierta, ocupacion),
// una columna NO editable en medio de un bloque (simula una fórmula), y las 2
// columnas de finalización al final, separadas.
const HEADERS = [
  'UUID_SISTEMA', 'Arrendatario',
  'Ingresos', 'Acierta', 'ocupacion',            // cols 3,4,5 — contiguas, permitidas
  'Resultado Final Inquilino (FORMULA)',          // col 6 — NO permitida, simula fórmula
  'Respuesta modelo inquilino', 'Regla Dura Inquilino', // cols 7,8 — contiguas, permitidas
  'comentarios del analista',                      // col 9 — aislada
  'REGISTRO ANALISTA SAI', 'Fecha Evaluacion'      // cols 10,11 — contiguas entre sí
];

function setupEnvironment() {
  const fila = new Array(HEADERS.length).fill('');
  fila[5] = '=SI(...)'.length ? 'VALOR_CALCULADO_DE_FORMULA' : ''; // valor que NUNCA debe tocarse

  const app = createSpreadsheetApp({
    'registro analisis': [HEADERS, fila]
  });

  globalThis.SpreadsheetApp = app;
  globalThis.getArchivoAnalisisId = () => 'mock-analisis-id';
  globalThis.CacheWrapper_getJSON = () => null; // fuerza lectura de headers desde la hoja
  globalThis.CacheWrapper_putJSON = () => {};

  loadSource();
  return { app };
}

describe('guardarEvaluacionAnalista() — agrupamiento por columnas contiguas', () => {
  beforeEach(() => {
    delete globalThis.SpreadsheetApp;
    delete globalThis.getArchivoAnalisisId;
    delete globalThis.CacheWrapper_getJSON;
    delete globalThis.CacheWrapper_putJSON;
    delete globalThis.guardarEvaluacionAnalista;
  });

  it('agrupa 3 campos contiguos (Ingresos/Acierta/ocupacion) en 1 sola llamada setValues', () => {
    const { app } = setupEnvironment();

    const resultado = globalThis.guardarEvaluacionAnalista(2, {
      Ingresos: '2000000', Acierta: 'SI', ocupacion: 'PROPIETARIO'
    }, false, 'analista@test.com');

    expect(resultado.ok).toBe(true);

    const hoja = app._spreadsheet.getSheetByName('registro analisis');
    // Debe haber exactamente 1 escritura (las 3 columnas son contiguas: 3,4,5)
    expect(hoja.getCallLog('setValue').length).toBe(0); // nunca usa setValue individual
    const setValuesCalls = hoja.getCallLog('setValues');
    expect(setValuesCalls.length).toBe(1);
    expect(setValuesCalls[0].values[0]).toEqual(['2000000', 'SI', 'PROPIETARIO']);
  });

  it('NUNCA toca la columna no permitida intermedia (protege fórmulas)', () => {
    const { app } = setupEnvironment();

    globalThis.guardarEvaluacionAnalista(2, {
      Ingresos: '2000000', Acierta: 'SI', ocupacion: 'PROPIETARIO',
      'Respuesta modelo inquilino': 'APROBADO', 'Regla Dura Inquilino': 'NO'
    }, false, 'analista@test.com');

    const hoja = app._spreadsheet.getSheetByName('registro analisis');
    const filaFinal = hoja._fullData[1];
    // La columna 6 (índice 5, "Resultado Final Inquilino (FORMULA)") debe
    // seguir intacta — nunca debió leerse ni reescribirse.
    expect(filaFinal[5]).toBe('VALOR_CALCULADO_DE_FORMULA');
    // Solo se permite leer la fila 1 (headers) — la fila 2 (datos, con la
    // "fórmula") nunca debe pasar por getValues().
    hoja.getCallLog('getValues').forEach(call => {
      expect(call.range.startsWith('R1C')).toBe(true);
    });
  });

  it('separa en 2 llamadas cuando los campos no son contiguos (Ingresos-bloque y comentarios)', () => {
    const { app } = setupEnvironment();

    globalThis.guardarEvaluacionAnalista(2, {
      Ingresos: '1000000',
      'comentarios del analista': 'Todo en orden'
    }, false, 'analista@test.com');

    const hoja = app._spreadsheet.getSheetByName('registro analisis');
    expect(hoja.getCallLog('setValues').length).toBe(2);
  });

  it('al finalizar, agrega REGISTRO ANALISTA SAI + Fecha Evaluacion agrupadas (son contiguas)', () => {
    const { app } = setupEnvironment();

    const resultado = globalThis.guardarEvaluacionAnalista(2, {}, true, 'analista@test.com');

    expect(resultado.ok).toBe(true);
    expect(resultado.mensaje).toContain('finalizada');

    const hoja = app._spreadsheet.getSheetByName('registro analisis');
    const setValuesCalls = hoja.getCallLog('setValues');
    expect(setValuesCalls.length).toBe(1);
    expect(setValuesCalls[0].values[0][0]).toBe('analista@test.com');
    expect(setValuesCalls[0].values[0][1]).toBeInstanceOf(Date);
  });

  it('ignora campos que no están en la lista de permitidos', () => {
    const { app } = setupEnvironment();

    globalThis.guardarEvaluacionAnalista(2, {
      Ingresos: '500000',
      'Arrendatario': 'Intento de sobreescribir el nombre' // NO está en `permitidos`
    }, false, 'analista@test.com');

    const hoja = app._spreadsheet.getSheetByName('registro analisis');
    const filaFinal = hoja._fullData[1];
    expect(filaFinal[1]).toBe(''); // Arrendatario nunca se tocó
  });
});
