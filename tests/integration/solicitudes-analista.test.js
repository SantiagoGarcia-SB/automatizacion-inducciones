/**
 * Integration test: obtenerSolicitudesAnalista() con FILA_REG_ANALISIS
 *
 * Verifica:
 * 1. Lee COLA_ANALISIS filtrando por ESTADO=EN_EVALUACION y ASIGNADA_A=email
 * 2. Accede directamente a filas de "registro analisis" usando FILA_REG_ANALISIS
 * 3. No usa TextFinder
 * 4. Máximo N+2 llamadas a Sheets (1 COLA_ANALISIS + 1 headers + N filas)
 * 5. Excluye solicitudes con FILA_REG_ANALISIS vacío/0/inválido
 * 6. Excluye solicitudes cuando UUID no coincide en la fila destino
 * 7. Logea advertencias sin interrumpir
 *
 * Requirements: 9.2, 9.3, 9.4
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { MockSpreadsheet } from '../mocks/spreadsheet-app.mock.js';
import { createCacheService } from '../mocks/cache-service.mock.js';
import { readFileSync } from 'fs';
import { resolve } from 'path';

// ─── Load source ─────────────────────────────────────────────────────────────

const SOURCE_PATH = resolve(__dirname, '../../Repositorios_AnalistaRepo.js');
const CACHE_WRAPPER_PATH = resolve(__dirname, '../../Servicios_CacheWrapper.js');
const sourceCode = readFileSync(SOURCE_PATH, 'utf-8');
const cacheWrapperCode = readFileSync(CACHE_WRAPPER_PATH, 'utf-8');

function loadSource() {
  // Load CacheWrapper first (dependency)
  const wrappedCache = `(function() { ${cacheWrapperCode}\n; globalThis.CacheWrapper_getJSON = CacheWrapper_getJSON; globalThis.CacheWrapper_putJSON = CacheWrapper_putJSON; globalThis.CacheWrapper_remove = CacheWrapper_remove; })()`;
  eval(wrappedCache);

  // Load AnalistaRepo
  const wrapped = `(function() { ${sourceCode}\n; globalThis.obtenerSolicitudesAnalista = obtenerSolicitudesAnalista; globalThis._headersRegistroAnalisis = _headersRegistroAnalisis; })()`;
  eval(wrapped);
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

const ANALISTA_EMAIL = 'analista@empresa.com';

/**
 * Headers de "registro analisis" (simplificados para el test).
 */
function getRegistroHeaders() {
  return [
    'UUID_SISTEMA',        // 0
    'codigo lote',         // 1
    'Arrendatario',        // 2
    'Id_arrendatario',     // 3
    'Canon',               // 4
    'ciudad del inmueble', // 5
    'Destino',             // 6
    'Poliza',              // 7
    'Solicitud Inquilino', // 8
    'ASIGNADA A',          // 9
    'REGISTRO ANALISTA SAI' // 10
  ];
}

/**
 * Genera una fila de COLA_ANALISIS.
 * Columns: UUID(0), ID_LOTE(1), ARRENDATARIO(2), POLIZA(3), CIUDAD(4),
 *          DESTINO(5), FECHA_LOTE(6), FILA_REG_ANALISIS(7), ESTADO(8),
 *          ASIGNADA_A(9), FECHA_ASIG(10)
 */
function generarFilaCola(opts = {}) {
  return [
    opts.uuid || 'uuid-' + Math.random().toString(36).slice(2, 10),
    opts.idLote || 'LOTE-001',
    opts.arrendatario || 'Juan Pérez',
    opts.poliza || 'POL-123',
    opts.ciudad || 'Bogotá',
    opts.destino || 'VIVIENDA',
    opts.fechaLote || '2025-01-15',
    opts.filaReg !== undefined ? opts.filaReg : 5,
    opts.estado || 'EN_EVALUACION',
    opts.asignadaA || ANALISTA_EMAIL,
    opts.fechaAsig || '2025-01-16'
  ];
}

/**
 * Genera una fila de "registro analisis" que coincide con un UUID dado.
 */
function generarFilaRegistro(uuid, opts = {}) {
  return [
    uuid,                                // UUID_SISTEMA
    opts.codigoLote || 'LOTE-001',       // codigo lote
    opts.arrendatario || 'Juan Pérez',   // Arrendatario
    opts.identificacion || '123456',     // Id_arrendatario
    opts.canon || '1500000',             // Canon
    opts.ciudad || 'Bogotá',             // ciudad del inmueble
    opts.destino || 'VIVIENDA',          // Destino
    opts.poliza || 'POL-123',            // Poliza
    opts.solicitud || 'SI',              // Solicitud Inquilino
    opts.asignadaA || ANALISTA_EMAIL,    // ASIGNADA A
    opts.regSAI || ''                    // REGISTRO ANALISTA SAI
  ];
}

/**
 * Setup environment with separate spreadsheets for COLA_ANALISIS and registro analisis.
 */
function setupEnvironment(colaData, registroData) {
  const headers = getRegistroHeaders();
  const registroFull = [headers, ...registroData];
  const colaHeaders = ['UUID', 'ID_LOTE', 'ARRENDATARIO', 'POLIZA', 'CIUDAD', 'DESTINO', 'FECHA_LOTE', 'FILA_REG_ANALISIS', 'ESTADO', 'ASIGNADA_A', 'FECHA_ASIG'];
  const colaFull = [colaHeaders, ...colaData];

  // Create separate spreadsheets for each ID
  const ssControl = new MockSpreadsheet({ 'COLA_ANALISIS': colaFull });
  const ssAnalisis = new MockSpreadsheet({ 'registro analisis': registroFull });

  // SpreadsheetApp.openById routes to different spreadsheets by ID
  globalThis.SpreadsheetApp = {
    openById(id) {
      if (id === 'mock-control-id') return ssControl;
      if (id === 'mock-analisis-id') return ssAnalisis;
      return ssControl;
    },
    _ssControl: ssControl,
    _ssAnalisis: ssAnalisis
  };

  globalThis.getHojaControlId = () => 'mock-control-id';
  globalThis.getArchivoAnalisisId = () => 'mock-analisis-id';

  // Setup CacheService
  const cacheService = createCacheService();
  globalThis.CacheService = cacheService;

  // Suppress console.warn for clean test output (but still track calls)
  globalThis.console = { ...console, warn: vi.fn() };

  loadSource();

  return { ssControl, ssAnalisis, cacheService };
}

// ─── Tests ───────────────────────────────────────────────────────────────────

describe('obtenerSolicitudesAnalista() — FILA_REG_ANALISIS optimizado', () => {
  beforeEach(() => {
    delete globalThis.SpreadsheetApp;
    delete globalThis.getHojaControlId;
    delete globalThis.getArchivoAnalisisId;
    delete globalThis.CacheService;
    delete globalThis.obtenerSolicitudesAnalista;
    delete globalThis._headersRegistroAnalisis;
    delete globalThis.CacheWrapper_getJSON;
    delete globalThis.CacheWrapper_putJSON;
    delete globalThis.CacheWrapper_remove;
  });

  it('lee COLA_ANALISIS y accede directamente a filas por FILA_REG_ANALISIS', () => {
    const uuid1 = 'uuid-sol-1';
    const uuid2 = 'uuid-sol-2';

    const colaData = [
      generarFilaCola({ uuid: uuid1, filaReg: 2, estado: 'EN_EVALUACION', asignadaA: ANALISTA_EMAIL }),
      generarFilaCola({ uuid: uuid2, filaReg: 3, estado: 'EN_EVALUACION', asignadaA: ANALISTA_EMAIL }),
      generarFilaCola({ uuid: 'uuid-otro', filaReg: 4, estado: 'DISPONIBLE', asignadaA: '' })
    ];

    // registro analisis: header in row 1, data in rows 2, 3, 4
    const registroData = [
      generarFilaRegistro(uuid1, { arrendatario: 'Ana García' }),
      generarFilaRegistro(uuid2, { arrendatario: 'Carlos López' }),
      generarFilaRegistro('uuid-otro', { arrendatario: 'Otro' })
    ];

    setupEnvironment(colaData, registroData);

    const resultado = globalThis.obtenerSolicitudesAnalista(ANALISTA_EMAIL, 10);

    expect(resultado.solicitudes).toHaveLength(2);
    expect(resultado.solicitudes[0].arrendatario).toBe('Ana García');
    expect(resultado.solicitudes[1].arrendatario).toBe('Carlos López');
    expect(resultado.activas).toBe(2);
  });

  it('no usa TextFinder — no aparece en callLog', () => {
    const uuid1 = 'uuid-test-1';

    const colaData = [
      generarFilaCola({ uuid: uuid1, filaReg: 2, estado: 'EN_EVALUACION', asignadaA: ANALISTA_EMAIL })
    ];
    const registroData = [
      generarFilaRegistro(uuid1)
    ];

    const { ssAnalisis } = setupEnvironment(colaData, registroData);

    globalThis.obtenerSolicitudesAnalista(ANALISTA_EMAIL, 10);

    const hojaRegistro = ssAnalisis.getSheetByName('registro analisis');
    const textFinderCalls = hojaRegistro.getCallLog('createTextFinder');
    expect(textFinderCalls).toHaveLength(0);
  });

  it('máximo N+2 llamadas a Sheets (1 COLA_ANALISIS + 1 headers + N filas)', () => {
    // 5 solicitudes activas
    const uuids = ['uuid-a', 'uuid-b', 'uuid-c', 'uuid-d', 'uuid-e'];
    const colaData = uuids.map((uuid, i) =>
      generarFilaCola({ uuid, filaReg: i + 2, estado: 'EN_EVALUACION', asignadaA: ANALISTA_EMAIL })
    );
    const registroData = uuids.map(uuid => generarFilaRegistro(uuid));

    const { ssControl, ssAnalisis } = setupEnvironment(colaData, registroData);

    globalThis.obtenerSolicitudesAnalista(ANALISTA_EMAIL, 10);

    // Count Sheets API calls:
    const hojaCola = ssControl.getSheetByName('COLA_ANALISIS');
    const hojaRegistro = ssAnalisis.getSheetByName('registro analisis');

    // COLA_ANALISIS: 1 call (getDataRange → getValues)
    const colaGetValuesCalls = hojaCola.getCallLog('getValues');
    expect(colaGetValuesCalls.length).toBe(1);

    // registro analisis: 1 headers read + 5 row reads = 6 getValues
    const regGetValuesCalls = hojaRegistro.getCallLog('getValues');
    expect(regGetValuesCalls.length).toBe(5 + 1); // N + 1 (headers)

    // Total logical Sheets calls: 1 (COLA) + 1 (headers) + 5 (rows) = 7 = N+2
  });

  it('excluye solicitudes con FILA_REG_ANALISIS vacío', () => {
    const uuid1 = 'uuid-valid';
    const uuid2 = 'uuid-empty-fila';

    const colaData = [
      generarFilaCola({ uuid: uuid1, filaReg: 2, estado: 'EN_EVALUACION', asignadaA: ANALISTA_EMAIL }),
      generarFilaCola({ uuid: uuid2, filaReg: '', estado: 'EN_EVALUACION', asignadaA: ANALISTA_EMAIL })
    ];
    const registroData = [
      generarFilaRegistro(uuid1, { arrendatario: 'Válido' })
    ];

    setupEnvironment(colaData, registroData);

    const resultado = globalThis.obtenerSolicitudesAnalista(ANALISTA_EMAIL, 10);

    expect(resultado.solicitudes).toHaveLength(1);
    expect(resultado.solicitudes[0].arrendatario).toBe('Válido');
    expect(resultado.activas).toBe(2); // ambas están activas en COLA
  });

  it('excluye solicitudes con FILA_REG_ANALISIS = 0', () => {
    const uuid1 = 'uuid-valid';
    const uuid2 = 'uuid-zero-fila';

    const colaData = [
      generarFilaCola({ uuid: uuid1, filaReg: 2, estado: 'EN_EVALUACION', asignadaA: ANALISTA_EMAIL }),
      generarFilaCola({ uuid: uuid2, filaReg: 0, estado: 'EN_EVALUACION', asignadaA: ANALISTA_EMAIL })
    ];
    const registroData = [
      generarFilaRegistro(uuid1)
    ];

    setupEnvironment(colaData, registroData);

    const resultado = globalThis.obtenerSolicitudesAnalista(ANALISTA_EMAIL, 10);

    expect(resultado.solicitudes).toHaveLength(1);
  });

  it('excluye solicitudes cuando UUID no coincide en fila destino', () => {
    const uuid1 = 'uuid-match';
    const uuid2 = 'uuid-mismatch';

    const colaData = [
      generarFilaCola({ uuid: uuid1, filaReg: 2, estado: 'EN_EVALUACION', asignadaA: ANALISTA_EMAIL }),
      generarFilaCola({ uuid: uuid2, filaReg: 3, estado: 'EN_EVALUACION', asignadaA: ANALISTA_EMAIL })
    ];
    const registroData = [
      generarFilaRegistro(uuid1, { arrendatario: 'Correcto' }),
      generarFilaRegistro('uuid-DIFERENTE', { arrendatario: 'UUID no coincide' })
    ];

    setupEnvironment(colaData, registroData);

    const resultado = globalThis.obtenerSolicitudesAnalista(ANALISTA_EMAIL, 10);

    expect(resultado.solicitudes).toHaveLength(1);
    expect(resultado.solicitudes[0].arrendatario).toBe('Correcto');
  });

  it('logea advertencia cuando FILA_REG_ANALISIS es inválido', () => {
    const colaData = [
      generarFilaCola({ uuid: 'uuid-bad', filaReg: 'abc', estado: 'EN_EVALUACION', asignadaA: ANALISTA_EMAIL })
    ];
    const registroData = [
      generarFilaRegistro('uuid-bad')
    ];

    setupEnvironment(colaData, registroData);

    globalThis.obtenerSolicitudesAnalista(ANALISTA_EMAIL, 10);

    expect(globalThis.console.warn).toHaveBeenCalled();
  });

  it('logea advertencia cuando UUID no coincide', () => {
    const colaData = [
      generarFilaCola({ uuid: 'uuid-expected', filaReg: 2, estado: 'EN_EVALUACION', asignadaA: ANALISTA_EMAIL })
    ];
    const registroData = [
      generarFilaRegistro('uuid-WRONG')
    ];

    setupEnvironment(colaData, registroData);

    globalThis.obtenerSolicitudesAnalista(ANALISTA_EMAIL, 10);

    expect(globalThis.console.warn).toHaveBeenCalled();
  });

  it('respeta el límite cupoMax para lecturas de filas', () => {
    // 8 solicitudes activas, cupoMax = 3
    const uuids = Array.from({ length: 8 }, (_, i) => 'uuid-' + i);
    const colaData = uuids.map((uuid, i) =>
      generarFilaCola({ uuid, filaReg: i + 2, estado: 'EN_EVALUACION', asignadaA: ANALISTA_EMAIL })
    );
    const registroData = uuids.map(uuid => generarFilaRegistro(uuid));

    const { ssAnalisis } = setupEnvironment(colaData, registroData);

    const resultado = globalThis.obtenerSolicitudesAnalista(ANALISTA_EMAIL, 3);

    // Solo debería leer las primeras 3 filas (limitado por cupoMax)
    expect(resultado.solicitudes).toHaveLength(3);
    expect(resultado.activas).toBe(8); // activas reales en COLA

    // Verify only 3 row reads + 1 header read = 4 getValues calls on registro
    const hojaRegistro = ssAnalisis.getSheetByName('registro analisis');
    const regGetValuesCalls = hojaRegistro.getCallLog('getValues');
    expect(regGetValuesCalls.length).toBe(3 + 1); // cupoMax + headers
  });

  it('retorna vacío si COLA_ANALISIS no existe', () => {
    const ssControl = new MockSpreadsheet({}); // No COLA_ANALISIS sheet
    const ssAnalisis = new MockSpreadsheet({ 'registro analisis': [getRegistroHeaders()] });

    globalThis.SpreadsheetApp = {
      openById(id) {
        if (id === 'mock-control-id') return ssControl;
        if (id === 'mock-analisis-id') return ssAnalisis;
        return ssControl;
      }
    };
    globalThis.getHojaControlId = () => 'mock-control-id';
    globalThis.getArchivoAnalisisId = () => 'mock-analisis-id';

    const cacheService = createCacheService();
    globalThis.CacheService = cacheService;
    globalThis.console = { ...console, warn: vi.fn() };

    loadSource();

    const resultado = globalThis.obtenerSolicitudesAnalista(ANALISTA_EMAIL, 10);
    expect(resultado.solicitudes).toEqual([]);
    expect(resultado.activas).toBe(0);
  });

  it('retorna vacío si no hay solicitudes EN_EVALUACION para el analista', () => {
    const colaData = [
      generarFilaCola({ uuid: 'uuid-1', filaReg: 2, estado: 'DISPONIBLE', asignadaA: '' }),
      generarFilaCola({ uuid: 'uuid-2', filaReg: 3, estado: 'EN_EVALUACION', asignadaA: 'otro@empresa.com' })
    ];
    const registroData = [
      generarFilaRegistro('uuid-1'),
      generarFilaRegistro('uuid-2')
    ];

    setupEnvironment(colaData, registroData);

    const resultado = globalThis.obtenerSolicitudesAnalista(ANALISTA_EMAIL, 10);
    expect(resultado.solicitudes).toEqual([]);
    expect(resultado.activas).toBe(0);
  });

  it('email matching es case-insensitive', () => {
    const uuid1 = 'uuid-case';

    const colaData = [
      generarFilaCola({ uuid: uuid1, filaReg: 2, estado: 'EN_EVALUACION', asignadaA: 'Analista@Empresa.COM' })
    ];
    const registroData = [
      generarFilaRegistro(uuid1, { arrendatario: 'Case Test' })
    ];

    setupEnvironment(colaData, registroData);

    const resultado = globalThis.obtenerSolicitudesAnalista('analista@empresa.com', 10);
    expect(resultado.solicitudes).toHaveLength(1);
    expect(resultado.solicitudes[0].arrendatario).toBe('Case Test');
  });
});
