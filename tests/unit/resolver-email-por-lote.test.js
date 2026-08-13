/**
 * Unit tests for resolverEmailPorLote — resolución de email por ID de lote.
 * Validates: Requirements 3.1, 3.5
 */
import { describe, it, expect, beforeAll, vi } from 'vitest';
import { readFileSync } from 'fs';
import { resolve } from 'path';

let resolverEmailPorLote;
const registrarEventoMock = vi.fn();

beforeAll(() => {
  const sourceCode = readFileSync(
    resolve(__dirname, '../../Notificaciones.js'),
    'utf-8'
  );

  // Stub GAS globals that Notificaciones.js references at top level
  const stubGlobals = `
    var PropertiesService = { getScriptProperties: function() { return { getProperty: function() { return ''; } }; } };
    var MailApp = { sendEmail: function() {}, getRemainingDailyQuota: function() { return 100; } };
    var CacheService = { getScriptCache: function() { return { get: function(){}, put: function(){} }; } };
    var SpreadsheetApp = { openById: function() { return { getSheetByName: function() { return null; } }; } };
    var ID_HOJA_CONTROL = "test-id";
    var _registrarEvento_ = __registrarEventoMock__;
    function emailANombre() { return ''; }
    function obtenerCorreoDeDirector() { return ''; }
    function obtenerCadenaJerarquica() { return []; }
    function _verificarCuotaEmail_() { return true; }
    function SpreadsheetRegistry_get() { return { getSheetByName: function() { return null; } }; }
    function BatchWriter_escribir() { return 0; }
  `;

  const fn = new Function('__registrarEventoMock__', stubGlobals + '\n' + sourceCode + '\n; return { resolverEmailPorLote };');
  const exported = fn(registrarEventoMock);
  resolverEmailPorLote = exported.resolverEmailPorLote;
});

describe('resolverEmailPorLote', () => {
  beforeAll(() => {
    registrarEventoMock.mockClear();
  });

  describe('happy path — returns email', () => {
    it('returns email when idLote exists in map and email contains @', () => {
      const mapa = { 'LOTE-001': 'maria.garcia@empresa.com' };
      expect(resolverEmailPorLote(mapa, 'LOTE-001')).toBe('maria.garcia@empresa.com');
    });

    it('trims whitespace from idLote before lookup', () => {
      const mapa = { 'LOTE-002': 'juan@empresa.com' };
      expect(resolverEmailPorLote(mapa, '  LOTE-002  ')).toBe('juan@empresa.com');
    });

    it('trims whitespace from the resolved email', () => {
      const mapa = { 'LOTE-003': '  pedro@empresa.com  ' };
      expect(resolverEmailPorLote(mapa, 'LOTE-003')).toBe('pedro@empresa.com');
    });
  });

  describe('returns null and logs WARN when idLote not found', () => {
    it('returns null when idLote is not in the map', () => {
      const mapa = { 'LOTE-001': 'maria@empresa.com' };
      registrarEventoMock.mockClear();
      expect(resolverEmailPorLote(mapa, 'LOTE-999')).toBeNull();
      expect(registrarEventoMock).toHaveBeenCalledWith(
        'WARN',
        'Notificaciones.js',
        expect.stringContaining('no encontrado'),
        expect.stringContaining('LOTE-999')
      );
    });

    it('returns null when map is empty', () => {
      registrarEventoMock.mockClear();
      expect(resolverEmailPorLote({}, 'LOTE-001')).toBeNull();
      expect(registrarEventoMock).toHaveBeenCalledWith(
        'WARN',
        expect.any(String),
        expect.any(String),
        expect.stringContaining('LOTE-001')
      );
    });
  });

  describe('returns null and logs WARN when email is invalid', () => {
    it('returns null when email does not contain @', () => {
      const mapa = { 'LOTE-001': 'email-sin-arroba' };
      registrarEventoMock.mockClear();
      expect(resolverEmailPorLote(mapa, 'LOTE-001')).toBeNull();
      expect(registrarEventoMock).toHaveBeenCalledWith(
        'WARN',
        'Notificaciones.js',
        expect.stringContaining('sin'),
        expect.stringContaining('LOTE-001')
      );
    });

    it('returns null when email is empty string', () => {
      const mapa = { 'LOTE-001': '' };
      registrarEventoMock.mockClear();
      expect(resolverEmailPorLote(mapa, 'LOTE-001')).toBeNull();
      expect(registrarEventoMock).toHaveBeenCalled();
    });

    it('returns null when email is only whitespace', () => {
      const mapa = { 'LOTE-001': '   ' };
      registrarEventoMock.mockClear();
      expect(resolverEmailPorLote(mapa, 'LOTE-001')).toBeNull();
      expect(registrarEventoMock).toHaveBeenCalled();
    });
  });

  describe('returns null and logs WARN for invalid inputs', () => {
    it('returns null when mapaLoteEmail is null', () => {
      registrarEventoMock.mockClear();
      expect(resolverEmailPorLote(null, 'LOTE-001')).toBeNull();
      expect(registrarEventoMock).toHaveBeenCalledWith(
        'WARN',
        expect.any(String),
        expect.any(String),
        expect.any(String)
      );
    });

    it('returns null when mapaLoteEmail is undefined', () => {
      registrarEventoMock.mockClear();
      expect(resolverEmailPorLote(undefined, 'LOTE-001')).toBeNull();
      expect(registrarEventoMock).toHaveBeenCalled();
    });

    it('returns null when idLote is empty string', () => {
      registrarEventoMock.mockClear();
      expect(resolverEmailPorLote({ 'X': 'a@b.com' }, '')).toBeNull();
      expect(registrarEventoMock).toHaveBeenCalled();
    });

    it('returns null when idLote is not a string (number)', () => {
      registrarEventoMock.mockClear();
      expect(resolverEmailPorLote({ '123': 'a@b.com' }, 123)).toBeNull();
      expect(registrarEventoMock).toHaveBeenCalled();
    });

    it('returns null when idLote is null', () => {
      registrarEventoMock.mockClear();
      expect(resolverEmailPorLote({ 'X': 'a@b.com' }, null)).toBeNull();
      expect(registrarEventoMock).toHaveBeenCalled();
    });
  });
});
