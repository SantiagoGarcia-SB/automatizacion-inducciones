/**
 * Unit tests for ejecutarRecordatoriosDiarios — orquestador de notificaciones diarias.
 * Validates: Requirements 3.1, 3.2, 3.4, 3.5
 */
import { describe, it, expect, beforeAll, beforeEach, vi } from 'vitest';
import { readFileSync } from 'fs';
import { resolve } from 'path';

let ejecutarRecordatoriosDiarios;
let _procesarRecordatoriosEnLote_;

const registrarEventoMock = vi.fn();
const sendEmailMock = vi.fn();
const getRemainingDailyQuotaMock = vi.fn();
const batchWriterMock = vi.fn().mockReturnValue(1);

// Simulated sheet data
let mockSheetHCData = [];
let mockSheetCGData = [];
let mockSheetCGLastRow = 1;

beforeAll(() => {
  const sourceCode = readFileSync(
    resolve(__dirname, '../../Notificaciones.js'),
    'utf-8'
  );

  const stubGlobals = `
    var PropertiesService = { getScriptProperties: function() { return { getProperty: function() { return ''; } }; } };
    var MailApp = { sendEmail: __sendEmailMock__, getRemainingDailyQuota: __getRemainingDailyQuotaMock__ };
    var CacheService = { getScriptCache: function() { return { get: function(){}, put: function(){} }; } };
    var SpreadsheetApp = { openById: function() { return { getSheetByName: function() { return null; } }; } };
    var ID_HOJA_CONTROL = "test-id";
    var _registrarEvento_ = __registrarEventoMock__;
    function emailANombre(email, fmt) { 
      if (!email || email.indexOf('@') === -1) return '';
      var local = email.split('@')[0];
      var parts = local.split('.');
      return parts[0].charAt(0).toUpperCase() + parts[0].slice(1);
    }
    function obtenerCorreoDeDirector() { return ''; }
    function obtenerCadenaJerarquica() { return []; }
    function _verificarCuotaEmail_() { return true; }
    function SpreadsheetRegistry_get(id) {
      return {
        getSheetByName: function(name) {
          if (name === 'Hoja_Control') {
            return {
              getDataRange: function() {
                return { getValues: function() { return __mockSheetHCData__; } };
              }
            };
          }
          if (name === 'Control_General') {
            return {
              getLastRow: function() { return __mockSheetCGLastRow__; },
              getRange: function() {
                return { getValues: function() { return __mockSheetCGData__; } };
              }
            };
          }
          return null;
        }
      };
    }
    function BatchWriter_escribir(hoja, ops) { return __batchWriterMock__(hoja, ops); }
  `;

  const fn = new Function(
    '__registrarEventoMock__',
    '__sendEmailMock__',
    '__getRemainingDailyQuotaMock__',
    '__batchWriterMock__',
    '__mockSheetHCData__',
    '__mockSheetCGData__',
    '__mockSheetCGLastRow__',
    stubGlobals + '\n' + sourceCode + '\n; return { ejecutarRecordatoriosDiarios, _procesarRecordatoriosEnLote_ };'
  );

  // We need dynamic access, so wrap in getter
  const getExports = () => {
    const fn2 = new Function(
      '__registrarEventoMock__',
      '__sendEmailMock__',
      '__getRemainingDailyQuotaMock__',
      '__batchWriterMock__',
      stubGlobals
        .replace('__mockSheetHCData__', 'this.__mockSheetHCData__')
        .replace('__mockSheetCGData__', 'this.__mockSheetCGData__')
        .replace('__mockSheetCGLastRow__', 'this.__mockSheetCGLastRow__')
      + '\n' + sourceCode + '\n; return { ejecutarRecordatoriosDiarios, _procesarRecordatoriosEnLote_ };'
    );
    return fn2;
  };

  // Simpler approach: just evaluate once, using closures for dynamic mock data
  const evalCode = `
    var __hcData__ = [];
    var __cgData__ = [];
    var __cgLastRow__ = 1;
    ${stubGlobals
      .replace(/__mockSheetHCData__/g, '__hcData__')
      .replace(/__mockSheetCGData__/g, '__cgData__')
      .replace(/__mockSheetCGLastRow__/g, '__cgLastRow__')
    }
    ${sourceCode}
    return { 
      ejecutarRecordatoriosDiarios, 
      _procesarRecordatoriosEnLote_,
      setHCData: function(d) { __hcData__ = d; },
      setCGData: function(d) { __cgData__ = d; },
      setCGLastRow: function(r) { __cgLastRow__ = r; }
    };
  `;

  const factory = new Function(
    '__registrarEventoMock__',
    '__sendEmailMock__',
    '__getRemainingDailyQuotaMock__',
    '__batchWriterMock__',
    evalCode
  );

  const exported = factory(registrarEventoMock, sendEmailMock, getRemainingDailyQuotaMock, batchWriterMock);
  ejecutarRecordatoriosDiarios = exported.ejecutarRecordatoriosDiarios;
  _procesarRecordatoriosEnLote_ = exported._procesarRecordatoriosEnLote_;

  // Store setters for dynamic data
  globalThis.__setHCData = exported.setHCData;
  globalThis.__setCGData = exported.setCGData;
  globalThis.__setCGLastRow = exported.setCGLastRow;
});

beforeEach(() => {
  registrarEventoMock.mockClear();
  sendEmailMock.mockClear();
  getRemainingDailyQuotaMock.mockReset();
  batchWriterMock.mockClear();
});

describe('ejecutarRecordatoriosDiarios', () => {

  describe('quota verification — aborts if insufficient', () => {
    it('aborts and logs WARN when quota is less than total emails required', () => {
      // Setup: 2 lotes paz y salvo + 1 lote error terceros = 3 emails needed
      const thirtyDaysAgo = new Date();
      thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 10);

      globalThis.__setHCData([
        ['Header', 'Email', '', '', '', 'IdLote'],
        ['', 'comercial1@empresa.com', '', '', '', 'LOTE-001'],
        ['', 'comercial2@empresa.com', '', '', '', 'LOTE-002'],
        ['', 'comercial3@empresa.com', '', '', '', 'LOTE-003']
      ]);

      globalThis.__setCGData([
        ['IdLote', '', '', '', '', '', '', '', '', 'Estado', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', 'FechaAviso'],
        ['LOTE-001', '', thirtyDaysAgo, '', '', '', '', '', '', 'PENDIENTE PAZ Y SALVO', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', null],
        ['LOTE-002', '', thirtyDaysAgo, '', '', '', '', '', '', 'PENDIENTE PAZ Y SALVO', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', null],
        ['LOTE-003', '', thirtyDaysAgo, '', '', '', '', '', '', 'ERROR EN TERCEROS', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', null]
      ]);
      globalThis.__setCGLastRow(4);

      // Only 2 emails available but 3 needed
      getRemainingDailyQuotaMock.mockReturnValue(2);

      ejecutarRecordatoriosDiarios();

      // Should abort — no emails sent
      expect(sendEmailMock).not.toHaveBeenCalled();
      // Should log WARN about quota
      expect(registrarEventoMock).toHaveBeenCalledWith(
        'WARN',
        'Notificaciones.js',
        expect.stringContaining('cuota insuficiente'),
        expect.stringContaining('Requeridos: 3')
      );
    });

    it('proceeds when quota is sufficient', () => {
      const tenDaysAgo = new Date();
      tenDaysAgo.setDate(tenDaysAgo.getDate() - 10);

      globalThis.__setHCData([
        ['Header', 'Email', '', '', '', 'IdLote'],
        ['', 'comercial1@empresa.com', '', '', '', 'LOTE-001']
      ]);

      globalThis.__setCGData([
        ['IdLote', '', '', '', '', '', '', '', '', 'Estado', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', 'FechaAviso'],
        ['LOTE-001', '', tenDaysAgo, '', '', '', '', '', '', 'PENDIENTE PAZ Y SALVO', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', null]
      ]);
      globalThis.__setCGLastRow(2);

      getRemainingDailyQuotaMock.mockReturnValue(100);

      ejecutarRecordatoriosDiarios();

      // Should send email
      expect(sendEmailMock).toHaveBeenCalledTimes(1);
    });
  });

  describe('single data read — processes both types from same data', () => {
    it('sends reminders for both paz y salvo and error en terceros', () => {
      const tenDaysAgo = new Date();
      tenDaysAgo.setDate(tenDaysAgo.getDate() - 10);

      globalThis.__setHCData([
        ['Header', 'Email', '', '', '', 'IdLote'],
        ['', 'ps@empresa.com', '', '', '', 'LOTE-PS'],
        ['', 'et@empresa.com', '', '', '', 'LOTE-ET']
      ]);

      globalThis.__setCGData([
        ['IdLote', '', '', '', '', '', '', '', '', 'Estado', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', 'FechaAviso'],
        ['LOTE-PS', '', tenDaysAgo, '', '', '', '', '', '', 'PENDIENTE PAZ Y SALVO', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', null],
        ['LOTE-ET', '', tenDaysAgo, '', '', '', '', '', '', 'ERROR EN TERCEROS', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', null]
      ]);
      globalThis.__setCGLastRow(3);

      getRemainingDailyQuotaMock.mockReturnValue(100);

      ejecutarRecordatoriosDiarios();

      // Should send 2 emails — one for each type
      expect(sendEmailMock).toHaveBeenCalledTimes(2);

      // First call should be paz y salvo (processed first)
      const firstCall = sendEmailMock.mock.calls[0][0];
      expect(firstCall.to).toBe('ps@empresa.com');
      expect(firstCall.subject).toContain('Paz y salvo');

      // Second call should be error en terceros
      const secondCall = sendEmailMock.mock.calls[1][0];
      expect(secondCall.to).toBe('et@empresa.com');
      expect(secondCall.subject).toContain('Error en terceros');
    });
  });

  describe('skips lotes with less than 3 days elapsed', () => {
    it('does not send reminders for lotes with fewer than 3 days', () => {
      const oneDayAgo = new Date();
      oneDayAgo.setDate(oneDayAgo.getDate() - 1);

      globalThis.__setHCData([
        ['Header', 'Email', '', '', '', 'IdLote'],
        ['', 'recent@empresa.com', '', '', '', 'LOTE-NEW']
      ]);

      globalThis.__setCGData([
        ['IdLote', '', '', '', '', '', '', '', '', 'Estado', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', 'FechaAviso'],
        ['LOTE-NEW', '', oneDayAgo, '', '', '', '', '', '', 'PENDIENTE PAZ Y SALVO', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', null]
      ]);
      globalThis.__setCGLastRow(2);

      getRemainingDailyQuotaMock.mockReturnValue(100);

      ejecutarRecordatoriosDiarios();

      expect(sendEmailMock).not.toHaveBeenCalled();
    });
  });

  describe('batch writes for date updates', () => {
    it('calls BatchWriter_escribir to update fecha de aviso after sending', () => {
      const tenDaysAgo = new Date();
      tenDaysAgo.setDate(tenDaysAgo.getDate() - 10);

      globalThis.__setHCData([
        ['Header', 'Email', '', '', '', 'IdLote'],
        ['', 'batch@empresa.com', '', '', '', 'LOTE-B1']
      ]);

      globalThis.__setCGData([
        ['IdLote', '', '', '', '', '', '', '', '', 'Estado', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', 'FechaAviso'],
        ['LOTE-B1', '', tenDaysAgo, '', '', '', '', '', '', 'PENDIENTE PAZ Y SALVO', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', null],
        ['LOTE-B1', '', tenDaysAgo, '', '', '', '', '', '', 'PENDIENTE PAZ Y SALVO', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', null]
      ]);
      globalThis.__setCGLastRow(3);

      getRemainingDailyQuotaMock.mockReturnValue(100);

      ejecutarRecordatoriosDiarios();

      // BatchWriter should be called with operations for both rows (fila 2 and 3)
      expect(batchWriterMock).toHaveBeenCalled();
      const ops = batchWriterMock.mock.calls[0][1];
      expect(ops).toHaveLength(2);
      expect(ops[0].fila).toBe(2);
      expect(ops[0].columna).toBe(61);
      expect(ops[1].fila).toBe(3);
      expect(ops[1].columna).toBe(61);
    });
  });

  describe('returns early for empty data', () => {
    it('returns without sending when Control_General has no data rows', () => {
      globalThis.__setHCData([['Header', 'Email', '', '', '', 'IdLote']]);
      globalThis.__setCGData([['IdLote', '', '', '', '', '', '', '', '', 'Estado']]);
      globalThis.__setCGLastRow(1);

      getRemainingDailyQuotaMock.mockReturnValue(100);

      ejecutarRecordatoriosDiarios();

      expect(sendEmailMock).not.toHaveBeenCalled();
    });
  });
});
