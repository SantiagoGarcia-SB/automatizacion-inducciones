import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { readFileSync } from 'fs';
import { resolve } from 'path';
import { createHmac, randomUUID } from 'crypto';
import { createSpreadsheetApp } from '../mocks/spreadsheet-app.mock.js';

const repositorio = readFileSync(resolve(__dirname, '../../Repositorios_EntregasLey2300Repo.js'), 'utf8');
const cumplimiento = readFileSync(resolve(__dirname, '../../Cumplimiento.js'), 'utf8');
const columnasAnalisis = [
  'UUID_SISTEMA', 'codigo lote', 'Solicitud Inquilino', 'REGISTRO ANALISTA SAI', 'inmobiliaria', 'Estado Automatización', 'Fecha Evaluacion',
  'Arrendatario', 'TEL_INQ', 'CORREO_INQ', 'COA1', 'TEL_COA1', 'CORREO_COA1', 'COA2', 'TEL_COA2', 'CORREO_COA2',
  'COA3', 'TEL_COA3', 'CORREO_COA3', 'COA4', 'TEL_COA4', 'CORREO_COA4', 'COA5', 'TEL_COA5', 'CORREO_COA5'
];

function cargarCodigo() {
  eval(`(function() { ${repositorio}\n${cumplimiento}
globalThis.EntregasLey2300_crearOReutilizar = EntregasLey2300_crearOReutilizar;
globalThis.EntregasLey2300_obtenerPorUuid = EntregasLey2300_obtenerPorUuid;
globalThis.EntregasLey2300_cerrarProcesadosPorUuid = EntregasLey2300_cerrarProcesadosPorUuid;
globalThis.ENTREGAS_LEY2300_ENCABEZADOS = ENTREGAS_LEY2300_ENCABEZADOS;
globalThis._prepararEntregasLey2300Prueba = _prepararEntregasLey2300_;
})()`);
}

function instalarEntorno() {
  const controlApp = createSpreadsheetApp({});
  const analisisApp = createSpreadsheetApp({
    'registro analisis': [
      columnasAnalisis,
      ['uuid-cerrado', 'L-1', 'S-1', 'APROBADO', 'Inmobiliaria', '', new Date('2026-01-01T00:00:00.000Z'), 'Ana', '3001234567', 'ana@example.com']
    ]
  });
  globalThis.getHojaControlId = () => 'control-id';
  globalThis.getArchivoAnalisisId = () => 'analisis-id';
  globalThis.ID_ARCHIVO_ANALISIS = 'analisis-id';
  globalThis.SpreadsheetRegistry_get = id => id === 'analisis-id' ? analisisApp._spreadsheet : controlApp._spreadsheet;
  globalThis.SpreadsheetApp = { openById: () => analisisApp._spreadsheet };
  globalThis.retry = callback => callback();
  globalThis.Utilities = {
    computeHmacSha256Signature: (valor, clave) => Array.from(createHmac('sha256', String(clave)).update(String(valor)).digest()),
    base64EncodeWebSafe: bytes => Buffer.from(bytes).toString('base64url'),
    getUuid: () => randomUUID(),
    formatDate: () => '2026-01-01 00:00:00'
  };
  globalThis.PropertiesService = { getScriptProperties: () => ({ getProperty: () => 'test-hmac-secret' }) };
  cargarCodigo();
  return { controlApp, analisisApp };
}

function limpiarEntorno() {
  [
    'EntregasLey2300_crearOReutilizar', 'EntregasLey2300_obtenerPorUuid', 'EntregasLey2300_cerrarProcesadosPorUuid',
    'ENTREGAS_LEY2300_ENCABEZADOS', '_prepararEntregasLey2300Prueba', 'getHojaControlId', 'getArchivoAnalisisId',
    'ID_ARCHIVO_ANALISIS', 'SpreadsheetRegistry_get', 'SpreadsheetApp', 'retry', 'Utilities', 'PropertiesService'
  ].forEach(nombre => delete globalThis[nombre]);
}

describe('cierre automático de cola Ley 2300', () => {
  beforeEach(limpiarEntorno);
  afterEach(limpiarEntorno);

  it('limpia un UUID completamente enviado y la siguiente preparación no lo recrea ni reenvía', () => {
    const entorno = instalarEntorno();
    const primera = EntregasLey2300_crearOReutilizar({ uuid: 'uuid-cerrado', idLote: 'L-1', solicitud: 'S-1', participante: 'INQ', canal: 'EMAIL', destino: 'ana@example.com' }).entrega;
    const segunda = EntregasLey2300_crearOReutilizar({ uuid: 'uuid-cerrado', idLote: 'L-1', solicitud: 'S-1', participante: 'COA1', canal: 'SMS', destino: '3001234567' }).entrega;
    const hojaEntregas = entorno.controlApp._spreadsheet.getSheetByName('Entregas_Ley2300');
    const estado = ENTREGAS_LEY2300_ENCABEZADOS.indexOf('ESTADO');
    hojaEntregas._fullData[1][estado] = 'ENVIADO';
    hojaEntregas._fullData[2][estado] = 'ENVIADO';
    const hojaAnalisis = entorno.analisisApp._spreadsheet.getSheetByName('registro analisis');
    hojaAnalisis._fullData[1][columnasAnalisis.indexOf('Estado Automatización')] = 'Procesado 2026-01-01 00:00:00';

    const cierre = EntregasLey2300_cerrarProcesadosPorUuid(['uuid-cerrado']);
    const siguiente = _prepararEntregasLey2300Prueba();

    expect(cierre).toMatchObject({ uuidsCerrados: 1, entregasEliminadas: 2 });
    expect(EntregasLey2300_obtenerPorUuid('uuid-cerrado')).toEqual([]);
    expect(entorno.controlApp._spreadsheet.getSheetByName('Entregas_Ley2300_Eventos')._fullData).toHaveLength(1);
    expect(entorno.controlApp._spreadsheet.getSheetByName('Cierres_Ley2300')._fullData).toHaveLength(2);
    expect(siguiente.elegibles).toEqual([]);
    expect(hojaAnalisis._fullData[1][columnasAnalisis.indexOf('Estado Automatización')]).toMatch(/^Procesado/);
    expect(primera.entregaId).not.toBe(segunda.entregaId);
  });
});
