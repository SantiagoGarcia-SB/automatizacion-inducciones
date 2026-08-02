/**
 * Integration test: sincronizarLoteAutomatico() — CASO A (actualizar fila existente)
 *
 * El comentario original decía "Agrupamos por fila para minimizar llamadas"
 * pero el código hacía 1 setValue() por celda cambiada. Esta prueba verifica
 * que ahora sí se agrupa: columnas contiguas que cambiaron van en 1 solo
 * setValues(), y — lo más importante — una columna NO mapeada que quede en
 * medio de dos columnas que sí cambiaron (simula una columna de evaluación/
 * fórmula del analista) NUNCA se lee ni se escribe.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { MockSpreadsheet } from '../mocks/spreadsheet-app.mock.js';

import { readFileSync } from 'fs';
import { resolve } from 'path';

const SOURCE_PATH = resolve(__dirname, '../../Sincronizacion.js');
const sourceCode = readFileSync(SOURCE_PATH, 'utf-8');

function loadSource() {
  const wrapped = `(function() {
    ${sourceCode}
    globalThis.sincronizarLoteAutomatico = sincronizarLoteAutomatico;
  })()`;
  eval(wrapped);
}

function headersControlGeneral() {
  const h = new Array(62).fill('');
  h[0] = 'ID Lote';
  h[1] = 'Fecha ingreso';
  h[2] = 'tipo negociacion';
  h[3] = 'Poliza';
  h[4] = 'Destino';
  h[5] = 'Ciudad del inmueble';
  h[9] = 'Estado';
  h[23] = 'Arrendatario';
  h[61] = 'UUID_SISTEMA';
  return h;
}

function filaControlGeneral(uuid) {
  const fila = new Array(62).fill('');
  fila[0] = 'LOTE-1';
  fila[1] = '2025-01-15';
  fila[2] = 'ARRIENDO';
  fila[3] = 'POL-1';
  fila[4] = 'BOGOTA';
  fila[5] = 'BOGOTA';
  fila[9] = 'RADICADO';
  fila[23] = 'Juan Pérez';
  fila[61] = uuid;
  return fila;
}

// idx4 ("EVALUACION_FORMULA") NO está en MAPEO_COLUMNAS a propósito — simula
// una columna de evaluación/fórmula que este motor de sincronización nunca
// debe tocar, ubicada justo entre dos columnas que sí cambian.
function headersRegistroAnalisis() {
  return ['UUID_SISTEMA', 'Fecha Lote', 'tipo negociacion', 'Poliza', 'EVALUACION_FORMULA', 'Destino', 'ciudad del inmueble', 'Arrendatario'];
}

function filaRegistroAnalisisExistente(uuid) {
  // Todo vacío salvo el UUID y un valor "protegido" en EVALUACION_FORMULA
  return [uuid, '', '', '', 'NO_TOCAR', '', '', ''];
}

function setupEnvironment(uuid) {
  const origenSS = new MockSpreadsheet({
    'Control_General': [headersControlGeneral(), filaControlGeneral(uuid)]
  });
  const destinoSS = new MockSpreadsheet({
    'registro analisis': [headersRegistroAnalisis(), filaRegistroAnalisisExistente(uuid)]
  });

  globalThis.SpreadsheetApp = {
    openById: function(id) {
      if (id === 'MOCK_CONTROL_ID') return origenSS;
      if (id === 'MOCK_ANALISIS_ID') return destinoSS;
      return origenSS;
    }
  };
  globalThis.ID_HOJA_CONTROL = 'MOCK_CONTROL_ID';
  globalThis.ID_ARCHIVO_ANALISIS = 'MOCK_ANALISIS_ID';
  globalThis.LockService = {
    getScriptLock: function() {
      return { tryLock: function() { return true; }, releaseLock: function() {} };
    }
  };
  globalThis.Logger = { log: function() {} };

  loadSource();
  return { origenSS, destinoSS };
}

describe('sincronizarLoteAutomatico() — CASO A: agrupar columnas contiguas al actualizar', () => {
  beforeEach(() => {
    delete globalThis.SpreadsheetApp;
    delete globalThis.ID_HOJA_CONTROL;
    delete globalThis.ID_ARCHIVO_ANALISIS;
    delete globalThis.LockService;
    delete globalThis.Logger;
    delete globalThis.sincronizarLoteAutomatico;
  });

  it('agrupa las columnas contiguas que cambiaron en 2 llamadas (no 6 individuales)', () => {
    const uuid = 'UUID-GRUPO-1';
    const { destinoSS } = setupEnvironment(uuid);

    globalThis.sincronizarLoteAutomatico();

    const hojaAnalisis = destinoSS.getSheetByName('registro analisis');
    // Nunca debe usar setValue individual para actualizaciones
    expect(hojaAnalisis.getCallLog('setValue').length).toBe(0);

    // Columnas 1-based que cambian: 2,3,4 (Fecha Lote/tipo/Poliza) y 6,7,8
    // (Destino/ciudad/Arrendatario) — la col 5 (EVALUACION_FORMULA) no cambia
    // y no está mapeada, así que debe quedar como 2 bloques, no 1 ni 6.
    const setValuesCalls = hojaAnalisis.getCallLog('setValues');
    expect(setValuesCalls.length).toBe(2);
  });

  it('NUNCA lee ni escribe la columna no mapeada (protege evaluación/fórmula del analista)', () => {
    const uuid = 'UUID-GRUPO-2';
    const { destinoSS } = setupEnvironment(uuid);

    globalThis.sincronizarLoteAutomatico();

    const hojaAnalisis = destinoSS.getSheetByName('registro analisis');
    const filaFinal = hojaAnalisis._fullData[1];
    expect(filaFinal[4]).toBe('NO_TOCAR'); // EVALUACION_FORMULA intacta

    // Ninguna llamada setValues debe incluir la columna 5 en su rango
    hojaAnalisis.getCallLog('setValues').forEach(call => {
      expect(call.range).not.toMatch(/C5:/);
      expect(call.range).not.toMatch(/:R\d+C5$/);
    });
  });

  it('escribe los valores correctos en cada bloque agrupado', () => {
    const uuid = 'UUID-GRUPO-3';
    const { destinoSS } = setupEnvironment(uuid);

    globalThis.sincronizarLoteAutomatico();

    const hojaAnalisis = destinoSS.getSheetByName('registro analisis');
    const filaFinal = hojaAnalisis._fullData[1];

    expect(filaFinal[1]).toBe('2025-01-15'); // Fecha Lote
    expect(filaFinal[2]).toBe('ARRIENDO');   // tipo negociacion
    expect(filaFinal[3]).toBe('POL-1');      // Poliza
    expect(filaFinal[5]).toBe('BOGOTA');     // Destino
    expect(filaFinal[6]).toBe('BOGOTA');     // ciudad del inmueble
    expect(filaFinal[7]).toBe('Juan Pérez'); // Arrendatario
  });
});
