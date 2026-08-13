/**
 * Unit tests for contarRadicacionesPorResultadoEnRango — optimized for single read.
 * Validates: Requirements 4.5
 */
import { describe, it, expect, beforeAll, beforeEach, afterEach } from 'vitest';
import { readFileSync } from 'fs';
import { resolve } from 'path';

let contarRadicacionesPorResultadoEnRango;
let openByIdCallCount;

function setupGlobals() {
  openByIdCallCount = 0;

  // Mock SpreadsheetRegistry_get
  globalThis.SpreadsheetRegistry_get = function (id) {
    openByIdCallCount++;
    return {
      getSheetByName: function (name) {
        if (name === 'Hoja_Control') {
          return {
            getDataRange: function () {
              return {
                getValues: function () {
                  return buildSampleData();
                }
              };
            }
          };
        }
        return null;
      }
    };
  };

  globalThis.ID_HOJA_CONTROL = 'mock-id-control';
}

function buildSampleData() {
  // Headers + rows simulating Hoja_Control
  // Col 0: Fecha, Col 1: Email, Col 2: (unused), Col 3: Resultado, Col 4: (unused), Col 5: ID Lote
  return [
    ['Fecha', 'Email', 'Unused', 'Resultado', 'Unused2', 'ID_Lote'], // header
    [new Date(2026, 5, 10), 'comercial.a@empresa.com', '', 'EXITOSO', '', 'LOTE-001'],
    [new Date(2026, 5, 15), 'comercial.a@empresa.com', '', 'EXITOSO', '', 'LOTE-002'],
    [new Date(2026, 5, 20), 'comercial.a@empresa.com', '', 'FALLIDO', '', 'LOTE-003'],
    [new Date(2026, 5, 25), 'comercial.b@empresa.com', '', 'EXITOSO', '', 'LOTE-004'],
    [new Date(2026, 6, 5), 'comercial.a@empresa.com', '', 'EXITOSO', '', 'LOTE-005'],
    [new Date(2026, 4, 15), 'comercial.a@empresa.com', '', 'FALLIDO', '', 'LOTE-006'],
    // Duplicate lote to test Set deduplication
    [new Date(2026, 5, 12), 'comercial.a@empresa.com', '', 'EXITOSO', '', 'LOTE-001'],
  ];
}

function cleanupGlobals() {
  delete globalThis.SpreadsheetRegistry_get;
  delete globalThis.ID_HOJA_CONTROL;
}

beforeAll(() => {
  const sourceCode = readFileSync(
    resolve(__dirname, '../../Reportes.js'),
    'utf-8'
  );

  // We need to provide minimal stubs for all the global dependencies used in Reportes.js
  globalThis.SpreadsheetApp = { openById: function () { return { getSheetByName: function () { return null; } }; } };
  globalThis.Logger = { log: function () {} };
  globalThis.Utilities = { formatDate: function () { return ''; } };
  globalThis.MailApp = { sendEmail: function () {}, getRemainingDailyQuota: function () { return 100; } };
  globalThis.Session = { getActiveUser: function () { return { getEmail: function () { return 'test@test.com'; } }; } };
  globalThis.ScriptApp = { getProjectTriggers: function () { return []; }, newTrigger: function () { return { timeBased: function () { return { onWeekDay: function () { return this; }, atHour: function () { return this; }, nearMinute: function () { return this; }, create: function () {}, onMonthDay: function () { return this; } }; } }; } };
  globalThis.retry = function (fn) { return fn(); };
  globalThis.ID_HOJA_CONTROL = 'mock-id';
  globalThis.ID_ARCHIVO_ANALISIS = 'mock-analisis-id';
  globalThis.BCC_AUDITORIA = '';
  globalThis._verificarCuotaEmail_ = function () { return true; };
  globalThis._registrarEvento_ = function () {};
  globalThis.UsuariosRepo_leerTodos = function () { return []; };
  globalThis.UsuariosRepo_getCorreosAdmin = function () { return []; };
  globalThis.emailANombre = function (email, fmt) { return 'Test'; };
  globalThis.CacheWrapper_getJSON = function () { return null; };
  globalThis.CacheWrapper_putJSON = function () {};
  globalThis.SpreadsheetRegistry_get = function () { return { getSheetByName: function () { return null; } }; };

  // Extract just contarRadicacionesPorResultadoEnRango
  // Use Function constructor to avoid polluting test scope with all Reportes.js functions
  const wrappedCode = `
    var MESES_ES = ["enero","febrero","marzo","abril","mayo","junio","julio","agosto","septiembre","octubre","noviembre","diciembre"];
    ${sourceCode}
    return { contarRadicacionesPorResultadoEnRango };
  `;

  try {
    const fn = new Function(wrappedCode);
    const exported = fn();
    contarRadicacionesPorResultadoEnRango = exported.contarRadicacionesPorResultadoEnRango;
  } catch (e) {
    // If the full file can't be evaluated due to missing deps, extract just the function
    const fnMatch = sourceCode.match(/function contarRadicacionesPorResultadoEnRango[\s\S]*?^}/m);
    if (fnMatch) {
      const fnCode = fnMatch[0] + '\n return { contarRadicacionesPorResultadoEnRango };';
      const fn2 = new Function(fnCode);
      contarRadicacionesPorResultadoEnRango = fn2().contarRadicacionesPorResultadoEnRango;
    }
  }
});

beforeEach(() => {
  setupGlobals();
});

afterEach(() => {
  cleanupGlobals();
});

describe('contarRadicacionesPorResultadoEnRango', () => {
  const junio2026Inicio = new Date(2026, 5, 1, 0, 0, 0, 0);
  const junio2026Fin = new Date(2026, 5, 30, 23, 59, 59, 999);

  describe('with datosPreCargados (pre-loaded data)', () => {
    it('uses provided data without calling SpreadsheetRegistry_get', () => {
      const datos = buildSampleData();
      const result = contarRadicacionesPorResultadoEnRango(
        'comercial.a@empresa.com', junio2026Inicio, junio2026Fin, datos
      );
      expect(openByIdCallCount).toBe(0);
      expect(result.exitosos).toBe(2); // LOTE-001 (dedup), LOTE-002
      expect(result.fallidos).toBe(1); // LOTE-003
      expect(result.total).toBe(3);
    });

    it('filters correctly by email', () => {
      const datos = buildSampleData();
      const result = contarRadicacionesPorResultadoEnRango(
        'comercial.b@empresa.com', junio2026Inicio, junio2026Fin, datos
      );
      expect(openByIdCallCount).toBe(0);
      expect(result.exitosos).toBe(1); // LOTE-004
      expect(result.fallidos).toBe(0);
      expect(result.total).toBe(1);
    });

    it('filters correctly by date range', () => {
      const datos = buildSampleData();
      const mayo2026Inicio = new Date(2026, 4, 1, 0, 0, 0, 0);
      const mayo2026Fin = new Date(2026, 4, 31, 23, 59, 59, 999);
      const result = contarRadicacionesPorResultadoEnRango(
        'comercial.a@empresa.com', mayo2026Inicio, mayo2026Fin, datos
      );
      expect(result.exitosos).toBe(0);
      expect(result.fallidos).toBe(1); // LOTE-006
      expect(result.total).toBe(1);
    });

    it('returns zeros when email not found', () => {
      const datos = buildSampleData();
      const result = contarRadicacionesPorResultadoEnRango(
        'nobody@empresa.com', junio2026Inicio, junio2026Fin, datos
      );
      expect(result).toEqual({ exitosos: 0, fallidos: 0, total: 0 });
    });

    it('calling multiple times with same pre-loaded data does not trigger reads', () => {
      const datos = buildSampleData();
      contarRadicacionesPorResultadoEnRango('comercial.a@empresa.com', junio2026Inicio, junio2026Fin, datos);
      contarRadicacionesPorResultadoEnRango('comercial.b@empresa.com', junio2026Inicio, junio2026Fin, datos);
      contarRadicacionesPorResultadoEnRango('comercial.a@empresa.com', new Date(2026, 6, 1), new Date(2026, 6, 31), datos);
      expect(openByIdCallCount).toBe(0);
    });
  });

  describe('without datosPreCargados (fallback to sheet read)', () => {
    it('reads from SpreadsheetRegistry_get when no pre-loaded data provided', () => {
      const result = contarRadicacionesPorResultadoEnRango(
        'comercial.a@empresa.com', junio2026Inicio, junio2026Fin
      );
      expect(openByIdCallCount).toBe(1);
      expect(result.exitosos).toBe(2);
      expect(result.fallidos).toBe(1);
      expect(result.total).toBe(3);
    });

    it('returns zeros when Hoja_Control sheet does not exist', () => {
      globalThis.SpreadsheetRegistry_get = function () {
        openByIdCallCount++;
        return { getSheetByName: function () { return null; } };
      };
      const result = contarRadicacionesPorResultadoEnRango(
        'comercial.a@empresa.com', junio2026Inicio, junio2026Fin
      );
      expect(result).toEqual({ exitosos: 0, fallidos: 0, total: 0 });
    });
  });

  describe('edge cases', () => {
    it('handles null email gracefully', () => {
      const datos = buildSampleData();
      const result = contarRadicacionesPorResultadoEnRango(
        null, junio2026Inicio, junio2026Fin, datos
      );
      expect(result).toEqual({ exitosos: 0, fallidos: 0, total: 0 });
    });

    it('handles empty pre-loaded array by falling back to sheet read', () => {
      const result = contarRadicacionesPorResultadoEnRango(
        'comercial.a@empresa.com', junio2026Inicio, junio2026Fin, []
      );
      // Empty array triggers fallback
      expect(openByIdCallCount).toBe(1);
    });

    it('deduplicates lote IDs using Set (same lote counted once)', () => {
      const datos = buildSampleData();
      // LOTE-001 appears twice for comercial.a in June -> should count as 1
      const result = contarRadicacionesPorResultadoEnRango(
        'comercial.a@empresa.com', junio2026Inicio, junio2026Fin, datos
      );
      expect(result.exitosos).toBe(2); // LOTE-001 + LOTE-002 (not 3)
    });

    it('is case-insensitive for email comparison', () => {
      const datos = buildSampleData();
      const result = contarRadicacionesPorResultadoEnRango(
        'COMERCIAL.A@EMPRESA.COM', junio2026Inicio, junio2026Fin, datos
      );
      expect(result.exitosos).toBe(2);
      expect(result.fallidos).toBe(1);
    });
  });
});
