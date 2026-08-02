/**
 * Integration test: guardarCorreccionComercial()
 *
 * Antes: leía Errores_Terceros dos veces completas (una para buscar la fila
 * a corregir, otra para buscar el email del auxiliar) y escribía hasta 3
 * setValue() individuales por participante. Ahora: 1 sola lectura reutilizada
 * + 1 setValues() de 4 columnas contiguas (8-11) por participante encontrado.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { createSpreadsheetApp } from '../mocks/spreadsheet-app.mock.js';

import { readFileSync } from 'fs';
import { resolve } from 'path';

const SOURCE_PATH = resolve(__dirname, '../../Repositorios_ColaAuxiliarRepo.js');
const sourceCode = readFileSync(SOURCE_PATH, 'utf-8');

function loadSource() {
  const wrapped = `(function() { ${sourceCode}\n; globalThis.guardarCorreccionComercial = guardarCorreccionComercial; })()`;
  eval(wrapped);
}

// Errores_Terceros: UUID(0) CICLO(1) PARTICIPANTE(2) REQUERIMIENTOS(3) NOTA(4)
// AUXILIAR_EMAIL(5) FECHA_ERROR(6) RESPUESTA_COMERCIAL(7) ARCHIVOS_DRIVE_PATH(8)
// FECHA_RESPUESTA(9) ESTADO_ERROR(10)
const HEADERS_ERRORES = [
  'UUID_SISTEMA', 'CICLO', 'PARTICIPANTE', 'REQUERIMIENTOS', 'NOTA_INTERNA',
  'AUXILIAR_EMAIL', 'FECHA_ERROR', 'RESPUESTA_COMERCIAL', 'ARCHIVOS_DRIVE_PATH',
  'FECHA_RESPUESTA', 'ESTADO_ERROR'
];

function setupEnvironment(filasErrores) {
  const app = createSpreadsheetApp({
    'Errores_Terceros': [HEADERS_ERRORES, ...filasErrores],
    'Control_General': [new Array(30).fill('')]
  });

  globalThis.SpreadsheetApp = app;
  globalThis.getHojaControlId = () => 'mock-control-id';
  globalThis.getCarpetaRaizId = () => 'mock-carpeta-id';
  globalThis.notificarCorreccionAlAuxiliar = function() {};

  loadSource();
  return { app };
}

function filaError(opts = {}) {
  return [
    opts.uuid || 'uuid-1', opts.ciclo || 1, opts.participante || 'INQ',
    opts.requerimientos || 'celular_correo', '', opts.auxiliarEmail || 'aux@test.com',
    new Date(), '', opts.archivoPrevio || '', '', opts.estado || 'PENDIENTE'
  ];
}

describe('guardarCorreccionComercial() — lectura única + escritura agrupada', () => {
  beforeEach(() => {
    delete globalThis.SpreadsheetApp;
    delete globalThis.getHojaControlId;
    delete globalThis.getCarpetaRaizId;
    delete globalThis.notificarCorreccionAlAuxiliar;
    delete globalThis.guardarCorreccionComercial;
  });

  it('lee Errores_Terceros UNA sola vez (antes eran 2 lecturas completas)', () => {
    const { app } = setupEnvironment([filaError({ uuid: 'uuid-1', participante: 'INQ' })]);

    globalThis.guardarCorreccionComercial('uuid-1', [{ participante: 'INQ', respuesta: 'Ya actualicé el dato' }], 'comercial@test.com');

    const hojaErrores = app._spreadsheet.getSheetByName('Errores_Terceros');
    expect(hojaErrores.getCallLog('getDataRange').length).toBe(1);
  });

  it('escribe las 4 columnas de respuesta en 1 sola llamada setValues, sin setValue individuales', () => {
    const { app } = setupEnvironment([filaError({ uuid: 'uuid-2', participante: 'COA1' })]);

    const resultado = globalThis.guardarCorreccionComercial('uuid-2',
      [{ participante: 'COA1', respuesta: 'Corregido' }], 'comercial@test.com');

    expect(resultado.ok).toBe(true);

    const hojaErrores = app._spreadsheet.getSheetByName('Errores_Terceros');
    expect(hojaErrores.getCallLog('setValue').length).toBe(0);
    const setValuesCalls = hojaErrores.getCallLog('setValues');
    expect(setValuesCalls.length).toBe(1);
    expect(setValuesCalls[0].values[0][0]).toBe('Corregido');       // RESPUESTA_COMERCIAL
    expect(setValuesCalls[0].values[0][2]).toBeInstanceOf(Date);    // FECHA_RESPUESTA
    expect(setValuesCalls[0].values[0][3]).toBe('CORRECCION_RECIBIDA'); // ESTADO_ERROR
  });

  it('preserva ARCHIVOS_DRIVE_PATH existente cuando no llega un archivo nuevo', () => {
    const { app } = setupEnvironment([
      filaError({ uuid: 'uuid-3', participante: 'INQ', archivoPrevio: 'https://drive/existente.pdf' })
    ]);

    globalThis.guardarCorreccionComercial('uuid-3', [{ participante: 'INQ', respuesta: 'Ok' }], 'comercial@test.com');

    const hojaErrores = app._spreadsheet.getSheetByName('Errores_Terceros');
    const filaFinal = hojaErrores._fullData[1];
    expect(filaFinal[8]).toBe('https://drive/existente.pdf'); // no se borró
  });

  it('ignora filas que no están en estado PENDIENTE', () => {
    const { app } = setupEnvironment([
      filaError({ uuid: 'uuid-4', participante: 'INQ', estado: 'CORRECCION_RECIBIDA' })
    ]);

    globalThis.guardarCorreccionComercial('uuid-4', [{ participante: 'INQ', respuesta: 'Otra vez' }], 'comercial@test.com');

    const hojaErrores = app._spreadsheet.getSheetByName('Errores_Terceros');
    expect(hojaErrores.getCallLog('setValues').length).toBe(0);
  });
});
