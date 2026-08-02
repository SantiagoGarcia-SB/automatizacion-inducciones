/**
 * Integration test: pedirSolicitudAnalista()
 *
 * Verifica:
 * 1. Exactamente 1 setValues() en COLA_ANALISIS (1 fila × 3 columnas) por invocación
 * 2. Máximo 1 escritura en "registro analisis"
 * 3. Si setValues() en COLA_ANALISIS falla → {ok: false}, lock liberado, sin escribir en registro analisis
 *
 * Requirements: 6.1, 6.2, 6.3, 6.4
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { createSpreadsheetApp, MockRange } from '../mocks/spreadsheet-app.mock.js';
import { createLockService } from '../mocks/lock-service.mock.js';

// ─── Load source code (GAS has no exports) ──────────────────────────────────

import { readFileSync } from 'fs';
import { resolve } from 'path';

const SOURCE_PATH = resolve(__dirname, '../../Repositorios_AnalistaRepo.js');
const sourceCode = readFileSync(SOURCE_PATH, 'utf-8');

/**
 * Loads pedirSolicitudAnalista (and its helper _headersRegistroAnalisis)
 * into globalThis by eval'ing the source file.
 */
function loadSource() {
  const wrapped = `(function() { ${sourceCode}\n; globalThis.pedirSolicitudAnalista = pedirSolicitudAnalista; globalThis._headersRegistroAnalisis = _headersRegistroAnalisis; })()`;
  eval(wrapped);
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

/**
 * Genera una fila de COLA_ANALISIS con 11 columnas:
 * UUID(0), ID_LOTE(1), ARRENDATARIO(2), POLIZA(3), CIUDAD(4),
 * DESTINO(5), FECHA_LOTE(6), FILA_REG_ANALISIS(7), ESTADO(8),
 * ASIGNADA_A(9), FECHA_ASIG(10)
 */
function generarFilaCola(opts = {}) {
  return [
    opts.uuid || 'uuid-' + Math.random().toString(36).slice(2, 10),
    opts.idLote || 'LOTE-001',
    opts.arrendatario || 'Juan Pérez',
    opts.poliza || 'POL-001',
    opts.ciudad || 'BOGOTA',
    opts.destino || 'VIVIENDA',
    opts.fechaLote || new Date('2025-01-01'),
    opts.filaReg || 5,
    opts.estado || 'DISPONIBLE',
    opts.asignadaA || '',
    opts.fechaAsig || ''
  ];
}

/**
 * Genera headers y una fila en "registro analisis" con columna ASIGNADA A
 */
function generarRegistroAnalisis(uuid) {
  const headers = ['UUID_SISTEMA', 'Arrendatario', 'ASIGNADA A', 'Fecha Evaluacion'];
  const fila = [uuid, 'Juan Pérez', '', ''];
  return { headers, data: [headers, fila] };
}

/**
 * Setup del entorno con mocks configurables.
 * @param {object} opts
 * @param {any[][]} opts.colaData - Datos de COLA_ANALISIS (con header)
 * @param {any[][]} opts.registroData - Datos de "registro analisis" (con header)
 * @param {boolean} [opts.simulateSetValuesFail=false] - Si true, setValues lanza excepción
 * @param {boolean} [opts.lockAvailable=true] - Si false, tryLock retorna false
 */
function setupEnvironment(opts) {
  // Configurar SpreadsheetApp con dos spreadsheets potenciales
  // Para simplificar el mock, usamos el mismo spreadsheet para ambos IDs
  const colaData = opts.colaData || [];
  const registroData = opts.registroData || [];

  const app = createSpreadsheetApp({
    'COLA_ANALISIS': colaData,
    'registro analisis': registroData
  });

  // Si hay que simular fallo en setValues, parchear el MockRange
  if (opts.simulateSetValuesFail) {
    const originalGetRange = app._spreadsheet.getSheetByName('COLA_ANALISIS').getRange.bind(
      app._spreadsheet.getSheetByName('COLA_ANALISIS')
    );
    const hojaCola = app._spreadsheet.getSheetByName('COLA_ANALISIS');
    const originalFn = hojaCola.getRange.bind(hojaCola);

    hojaCola.getRange = function(row, col, numRows, numCols) {
      const range = originalFn(row, col, numRows, numCols);
      // Interceptar solo la llamada de escritura batch (9, 1, 3) = cols 9-11
      if (col === 9 && numRows === 1 && numCols === 3) {
        const originalSetValues = range.setValues.bind(range);
        range.setValues = function(values) {
          hojaCola._callLog.push({ method: 'setValues', range: range._describe(), values, failed: true });
          throw new Error('Simulated setValues failure: Service unavailable');
        };
      }
      return range;
    };
  }

  globalThis.SpreadsheetApp = app;
  globalThis.getHojaControlId = () => 'mock-control-id';
  globalThis.getArchivoAnalisisId = () => 'mock-analisis-id';

  // Mock CacheWrapper (used by _headersRegistroAnalisis)
  globalThis.CacheWrapper_getJSON = (key) => null;
  globalThis.CacheWrapper_putJSON = (key, val, ttl) => {};

  // Setup LockService
  const lockService = createLockService({
    simulateContention: !opts.lockAvailable
  });
  globalThis.LockService = lockService;

  // Load the source
  loadSource();

  return { app, lockService };
}

// ─── Tests ───────────────────────────────────────────────────────────────────

describe('pedirSolicitudAnalista() — escritura batch', () => {
  beforeEach(() => {
    delete globalThis.SpreadsheetApp;
    delete globalThis.LockService;
    delete globalThis.getHojaControlId;
    delete globalThis.getArchivoAnalisisId;
    delete globalThis.CacheWrapper_getJSON;
    delete globalThis.CacheWrapper_putJSON;
    delete globalThis.pedirSolicitudAnalista;
    delete globalThis._headersRegistroAnalisis;
  });

  it('usa exactamente 1 setValues() en COLA_ANALISIS de 1 fila × 3 columnas', () => {
    const uuid = 'test-uuid-001';
    const colaHeader = ['UUID', 'ID_LOTE', 'ARRENDATARIO', 'POLIZA', 'CIUDAD', 'DESTINO', 'FECHA_LOTE', 'FILA_REG', 'ESTADO', 'ASIGNADA_A', 'FECHA_ASIG'];
    const colaData = [
      colaHeader,
      generarFilaCola({ uuid, estado: 'DISPONIBLE' })
    ];

    const registro = generarRegistroAnalisis(uuid);

    const { app } = setupEnvironment({
      colaData,
      registroData: registro.data,
      lockAvailable: true
    });

    const resultado = globalThis.pedirSolicitudAnalista('analista@test.com', 5);

    expect(resultado.ok).toBe(true);

    // Verificar que en COLA_ANALISIS hay exactamente 1 llamada setValues
    const hojaCola = app._spreadsheet.getSheetByName('COLA_ANALISIS');
    const setValuesCalls = hojaCola.getCallLog('setValues');
    expect(setValuesCalls.length).toBe(1);

    // Verificar que el rango es 1 fila × 3 columnas (cols 9-11)
    const call = setValuesCalls[0];
    expect(call.values).toHaveLength(1);       // 1 fila
    expect(call.values[0]).toHaveLength(3);    // 3 columnas
    expect(call.values[0][0]).toBe('EN_EVALUACION');
    expect(call.values[0][1]).toBe('analista@test.com');
    expect(call.values[0][2]).toBeInstanceOf(Date);
  });

  it('usa máximo 1 llamada de escritura en "registro analisis"', () => {
    const uuid = 'test-uuid-002';
    const colaHeader = ['UUID', 'ID_LOTE', 'ARRENDATARIO', 'POLIZA', 'CIUDAD', 'DESTINO', 'FECHA_LOTE', 'FILA_REG', 'ESTADO', 'ASIGNADA_A', 'FECHA_ASIG'];
    const colaData = [
      colaHeader,
      generarFilaCola({ uuid, estado: 'DISPONIBLE' })
    ];

    const registro = generarRegistroAnalisis(uuid);

    const { app } = setupEnvironment({
      colaData,
      registroData: registro.data,
      lockAvailable: true
    });

    const resultado = globalThis.pedirSolicitudAnalista('analista@test.com', 5);

    expect(resultado.ok).toBe(true);

    // Verificar escrituras en "registro analisis"
    const hojaReg = app._spreadsheet.getSheetByName('registro analisis');
    const setValueCalls = hojaReg.getCallLog('setValue');
    const setValuesBatchCalls = hojaReg.getCallLog('setValues');

    // Máximo 1 llamada de escritura total
    const totalEscrituras = setValueCalls.length + setValuesBatchCalls.length;
    expect(totalEscrituras).toBeLessThanOrEqual(1);
  });

  it('si setValues() en COLA_ANALISIS falla → retorna {ok: false}', () => {
    const uuid = 'test-uuid-003';
    const colaHeader = ['UUID', 'ID_LOTE', 'ARRENDATARIO', 'POLIZA', 'CIUDAD', 'DESTINO', 'FECHA_LOTE', 'FILA_REG', 'ESTADO', 'ASIGNADA_A', 'FECHA_ASIG'];
    const colaData = [
      colaHeader,
      generarFilaCola({ uuid, estado: 'DISPONIBLE' })
    ];

    const registro = generarRegistroAnalisis(uuid);

    const { app } = setupEnvironment({
      colaData,
      registroData: registro.data,
      lockAvailable: true,
      simulateSetValuesFail: true
    });

    const resultado = globalThis.pedirSolicitudAnalista('analista@test.com', 5);

    // Debe retornar ok: false
    expect(resultado.ok).toBe(false);
    expect(resultado.mensaje).toContain('asignación');
  });

  it('si setValues() falla → no escribe en "registro analisis"', () => {
    const uuid = 'test-uuid-004';
    const colaHeader = ['UUID', 'ID_LOTE', 'ARRENDATARIO', 'POLIZA', 'CIUDAD', 'DESTINO', 'FECHA_LOTE', 'FILA_REG', 'ESTADO', 'ASIGNADA_A', 'FECHA_ASIG'];
    const colaData = [
      colaHeader,
      generarFilaCola({ uuid, estado: 'DISPONIBLE' })
    ];

    const registro = generarRegistroAnalisis(uuid);

    const { app } = setupEnvironment({
      colaData,
      registroData: registro.data,
      lockAvailable: true,
      simulateSetValuesFail: true
    });

    globalThis.pedirSolicitudAnalista('analista@test.com', 5);

    // Verificar que NO hubo escrituras en "registro analisis"
    const hojaReg = app._spreadsheet.getSheetByName('registro analisis');
    const setValueCalls = hojaReg.getCallLog('setValue');
    const setValuesBatchCalls = hojaReg.getCallLog('setValues');

    expect(setValueCalls.length).toBe(0);
    expect(setValuesBatchCalls.length).toBe(0);
  });

  it('si setValues() falla → lock se libera correctamente', () => {
    const uuid = 'test-uuid-005';
    const colaHeader = ['UUID', 'ID_LOTE', 'ARRENDATARIO', 'POLIZA', 'CIUDAD', 'DESTINO', 'FECHA_LOTE', 'FILA_REG', 'ESTADO', 'ASIGNADA_A', 'FECHA_ASIG'];
    const colaData = [
      colaHeader,
      generarFilaCola({ uuid, estado: 'DISPONIBLE' })
    ];

    const registro = generarRegistroAnalisis(uuid);

    const { lockService } = setupEnvironment({
      colaData,
      registroData: registro.data,
      lockAvailable: true,
      simulateSetValuesFail: true
    });

    globalThis.pedirSolicitudAnalista('analista@test.com', 5);

    // Verificar que el lock fue liberado
    const lock = lockService._scriptLock;
    expect(lock.isLocked()).toBe(false);

    // Verificar que releaseLock fue llamado
    const releaseCalls = lock.getCallLog('releaseLock');
    expect(releaseCalls.length).toBeGreaterThanOrEqual(1);
  });

  it('si no se puede adquirir lock → retorna {ok: false} sin escrituras', () => {
    const uuid = 'test-uuid-006';
    const colaHeader = ['UUID', 'ID_LOTE', 'ARRENDATARIO', 'POLIZA', 'CIUDAD', 'DESTINO', 'FECHA_LOTE', 'FILA_REG', 'ESTADO', 'ASIGNADA_A', 'FECHA_ASIG'];
    const colaData = [
      colaHeader,
      generarFilaCola({ uuid, estado: 'DISPONIBLE' })
    ];

    const registro = generarRegistroAnalisis(uuid);

    const { app } = setupEnvironment({
      colaData,
      registroData: registro.data,
      lockAvailable: false
    });

    const resultado = globalThis.pedirSolicitudAnalista('analista@test.com', 5);

    expect(resultado.ok).toBe(false);
    expect(resultado.mensaje).toContain('Intenta de nuevo');

    // No debe haber escrituras en ninguna hoja
    const hojaCola = app._spreadsheet.getSheetByName('COLA_ANALISIS');
    const hojaReg = app._spreadsheet.getSheetByName('registro analisis');
    expect(hojaCola.getCallLog('setValues').length).toBe(0);
    expect(hojaReg.getCallLog('setValue').length).toBe(0);
  });
});
