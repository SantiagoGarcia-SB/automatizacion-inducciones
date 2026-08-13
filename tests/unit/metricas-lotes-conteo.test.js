/**
 * Unit tests para _calcularLotesAprobadosNegados — conteo de lotes distintos aprobados/negados
 *
 * Verifica:
 * - Agrupa filas por codigoLote (valores distintos)
 * - Cuenta lotes con resultadoLote "APROBADO" y "NEGADO" por separado
 * - Un lote solo se cuenta una vez aunque tenga múltiples solicitudes
 * - Usa el primer resultadoLote no vacío encontrado para un lote dado
 * - Retorna {lotesAprobados: 0, lotesNegados: 0} para entrada vacía/null
 * - No cuenta lotes con resultadoLote vacío o diferente a APROBADO/NEGADO
 *
 * Requirements: 1.1, 1.2
 */
import { describe, it, expect, afterEach } from 'vitest';

// ─── Setup ──────────────────────────────────────────────────────────────────────

function setupGlobals() {
  globalThis._registrarEvento_ = function() {};
  globalThis.CacheWrapper_getJSON = function() { return null; };
  globalThis.CacheWrapper_putJSON = function() {};
  globalThis.SpreadsheetApp = { openById: function() { return { getSheetByName: function() { return null; } }; } };
  globalThis.getArchivoAnalisisId = function() { return 'mock-id'; };
  globalThis.CacheService = { getScriptCache: function() { return { get: function() { return null; }, put: function() {} }; } };

  loadSource();
}

function loadSource() {
  const fs = require('fs');
  const path = require('path');
  const sourceCode = fs.readFileSync(
    path.resolve(__dirname, '../../Servicios_MetricasLotes.js'),
    'utf-8'
  );
  const wrapped = `(function() { ${sourceCode}\n; globalThis._calcularLotesAprobadosNegados = _calcularLotesAprobadosNegados; })()`;
  eval(wrapped);
}

function cleanupGlobals() {
  delete globalThis._registrarEvento_;
  delete globalThis.CacheWrapper_getJSON;
  delete globalThis.CacheWrapper_putJSON;
  delete globalThis.SpreadsheetApp;
  delete globalThis.getArchivoAnalisisId;
  delete globalThis.CacheService;
  delete globalThis._calcularLotesAprobadosNegados;
}

// ─── Helpers ────────────────────────────────────────────────────────────────────

function crearFila(opts) {
  return {
    fechaLote: opts.fechaLote !== undefined ? opts.fechaLote : new Date(2025, 0, 15),
    solicitudInquilino: opts.solicitudInquilino !== undefined ? opts.solicitudInquilino : 'SOL-001',
    codigoLote: opts.codigoLote !== undefined ? opts.codigoLote : 'LOTE-A',
    resultadoLote: opts.resultadoLote !== undefined ? opts.resultadoLote : '',
    resultadoSolicitud: opts.resultadoSolicitud !== undefined ? opts.resultadoSolicitud : '',
    registroAnalistaSai: opts.registroAnalistaSai !== undefined ? opts.registroAnalistaSai : ''
  };
}

// ─── Tests ─────────────────────────────────────────────────────────────────────

describe('_calcularLotesAprobadosNegados', () => {
  afterEach(cleanupGlobals);

  describe('Conteo básico de lotes', () => {
    it('cuenta un lote aprobado correctamente', () => {
      setupGlobals();

      var filas = [
        crearFila({ codigoLote: 'LOTE-001', resultadoLote: 'APROBADO' })
      ];

      var result = _calcularLotesAprobadosNegados(filas);
      expect(result.lotesAprobados).toBe(1);
      expect(result.lotesNegados).toBe(0);
    });

    it('cuenta un lote negado correctamente', () => {
      setupGlobals();

      var filas = [
        crearFila({ codigoLote: 'LOTE-001', resultadoLote: 'NEGADO' })
      ];

      var result = _calcularLotesAprobadosNegados(filas);
      expect(result.lotesAprobados).toBe(0);
      expect(result.lotesNegados).toBe(1);
    });

    it('cuenta múltiples lotes con resultados mixtos', () => {
      setupGlobals();

      var filas = [
        crearFila({ codigoLote: 'LOTE-001', resultadoLote: 'APROBADO' }),
        crearFila({ codigoLote: 'LOTE-002', resultadoLote: 'NEGADO' }),
        crearFila({ codigoLote: 'LOTE-003', resultadoLote: 'APROBADO' }),
        crearFila({ codigoLote: 'LOTE-004', resultadoLote: 'NEGADO' }),
        crearFila({ codigoLote: 'LOTE-005', resultadoLote: 'APROBADO' })
      ];

      var result = _calcularLotesAprobadosNegados(filas);
      expect(result.lotesAprobados).toBe(3);
      expect(result.lotesNegados).toBe(2);
    });
  });

  describe('Agrupación por codigoLote - un lote se cuenta una sola vez', () => {
    it('un lote con múltiples solicitudes se cuenta una sola vez', () => {
      setupGlobals();

      var filas = [
        crearFila({ codigoLote: 'LOTE-001', solicitudInquilino: 'SOL-001', resultadoLote: 'APROBADO' }),
        crearFila({ codigoLote: 'LOTE-001', solicitudInquilino: 'SOL-002', resultadoLote: 'APROBADO' }),
        crearFila({ codigoLote: 'LOTE-001', solicitudInquilino: 'SOL-003', resultadoLote: 'APROBADO' })
      ];

      var result = _calcularLotesAprobadosNegados(filas);
      expect(result.lotesAprobados).toBe(1);
      expect(result.lotesNegados).toBe(0);
    });

    it('varios lotes distintos con múltiples solicitudes cada uno', () => {
      setupGlobals();

      var filas = [
        crearFila({ codigoLote: 'LOTE-001', solicitudInquilino: 'SOL-001', resultadoLote: 'APROBADO' }),
        crearFila({ codigoLote: 'LOTE-001', solicitudInquilino: 'SOL-002', resultadoLote: 'APROBADO' }),
        crearFila({ codigoLote: 'LOTE-002', solicitudInquilino: 'SOL-003', resultadoLote: 'NEGADO' }),
        crearFila({ codigoLote: 'LOTE-002', solicitudInquilino: 'SOL-004', resultadoLote: 'NEGADO' }),
        crearFila({ codigoLote: 'LOTE-003', solicitudInquilino: 'SOL-005', resultadoLote: 'APROBADO' })
      ];

      var result = _calcularLotesAprobadosNegados(filas);
      expect(result.lotesAprobados).toBe(2);
      expect(result.lotesNegados).toBe(1);
    });
  });

  describe('Primer resultadoLote no vacío para lote', () => {
    it('usa el primer resultadoLote no vacío encontrado para un lote', () => {
      setupGlobals();

      var filas = [
        crearFila({ codigoLote: 'LOTE-001', resultadoLote: '' }),          // vacío
        crearFila({ codigoLote: 'LOTE-001', resultadoLote: 'APROBADO' }), // primer no vacío
        crearFila({ codigoLote: 'LOTE-001', resultadoLote: 'NEGADO' })    // se ignora
      ];

      var result = _calcularLotesAprobadosNegados(filas);
      expect(result.lotesAprobados).toBe(1);
      expect(result.lotesNegados).toBe(0);
    });

    it('no sobrescribe resultado no vacío con uno posterior', () => {
      setupGlobals();

      var filas = [
        crearFila({ codigoLote: 'LOTE-001', resultadoLote: 'NEGADO' }),
        crearFila({ codigoLote: 'LOTE-001', resultadoLote: 'APROBADO' })
      ];

      var result = _calcularLotesAprobadosNegados(filas);
      expect(result.lotesAprobados).toBe(0);
      expect(result.lotesNegados).toBe(1);
    });
  });

  describe('Lotes sin resultadoLote válido', () => {
    it('no cuenta lotes cuyo resultadoLote queda vacío', () => {
      setupGlobals();

      var filas = [
        crearFila({ codigoLote: 'LOTE-001', resultadoLote: '' }),
        crearFila({ codigoLote: 'LOTE-001', resultadoLote: '' })
      ];

      var result = _calcularLotesAprobadosNegados(filas);
      expect(result.lotesAprobados).toBe(0);
      expect(result.lotesNegados).toBe(0);
    });

    it('no cuenta lotes con resultadoLote diferente a APROBADO/NEGADO', () => {
      setupGlobals();

      var filas = [
        crearFila({ codigoLote: 'LOTE-001', resultadoLote: 'PENDIENTE' }),
        crearFila({ codigoLote: 'LOTE-002', resultadoLote: 'EN PROCESO' })
      ];

      var result = _calcularLotesAprobadosNegados(filas);
      expect(result.lotesAprobados).toBe(0);
      expect(result.lotesNegados).toBe(0);
    });
  });

  describe('Filas sin codigoLote', () => {
    it('ignora filas con codigoLote vacío', () => {
      setupGlobals();

      var filas = [
        crearFila({ codigoLote: '', resultadoLote: 'APROBADO' }),
        crearFila({ codigoLote: 'LOTE-001', resultadoLote: 'NEGADO' })
      ];

      var result = _calcularLotesAprobadosNegados(filas);
      expect(result.lotesAprobados).toBe(0);
      expect(result.lotesNegados).toBe(1);
    });
  });

  describe('Casos borde', () => {
    it('retorna {lotesAprobados: 0, lotesNegados: 0} para array vacío', () => {
      setupGlobals();
      var result = _calcularLotesAprobadosNegados([]);
      expect(result).toEqual({ lotesAprobados: 0, lotesNegados: 0 });
    });

    it('retorna {lotesAprobados: 0, lotesNegados: 0} para null', () => {
      setupGlobals();
      var result = _calcularLotesAprobadosNegados(null);
      expect(result).toEqual({ lotesAprobados: 0, lotesNegados: 0 });
    });

    it('retorna {lotesAprobados: 0, lotesNegados: 0} para undefined', () => {
      setupGlobals();
      var result = _calcularLotesAprobadosNegados(undefined);
      expect(result).toEqual({ lotesAprobados: 0, lotesNegados: 0 });
    });

    it('retorna {lotesAprobados: 0, lotesNegados: 0} para no-array', () => {
      setupGlobals();
      var result = _calcularLotesAprobadosNegados('not an array');
      expect(result).toEqual({ lotesAprobados: 0, lotesNegados: 0 });
    });
  });
});
