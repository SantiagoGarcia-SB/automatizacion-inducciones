/**
 * Unit tests para _calcularSolicitudesAprobNegReconsideradas
 *
 * Verifica:
 * - Clasifica solicitudes con REGISTRO_ANALISTA_SAI "APROBADO" como aprobadas
 * - Clasifica solicitudes con REGISTRO_ANALISTA_SAI "NEGADO" como negadas
 * - Clasifica solicitudes con REGISTRO_ANALISTA_SAI conteniendo "RECONSIDERADO APROBADO" como reconsideradas
 * - "RECONSIDERADO APROBADO" se evalúa PRIMERO (no cuenta como aprobada)
 * - Excluye filas con campo vacío
 * - Retorna objeto safe-default para entrada vacía/null
 *
 * Requirements: 1.3, 1.4, 1.7, 1.6
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
  const wrapped = `(function() { ${sourceCode}\n; globalThis._calcularSolicitudesAprobNegReconsideradas = _calcularSolicitudesAprobNegReconsideradas; })()`;
  eval(wrapped);
}

function cleanupGlobals() {
  delete globalThis._registrarEvento_;
  delete globalThis.CacheWrapper_getJSON;
  delete globalThis.CacheWrapper_putJSON;
  delete globalThis.SpreadsheetApp;
  delete globalThis.getArchivoAnalisisId;
  delete globalThis.CacheService;
  delete globalThis._calcularSolicitudesAprobNegReconsideradas;
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

describe('_calcularSolicitudesAprobNegReconsideradas', () => {
  afterEach(cleanupGlobals);

  describe('Clasificación básica', () => {
    it('cuenta solicitudes con registroAnalistaSai exactamente "APROBADO"', () => {
      setupGlobals();

      var filas = [
        crearFila({ registroAnalistaSai: 'APROBADO' }),
        crearFila({ registroAnalistaSai: 'APROBADO' }),
        crearFila({ registroAnalistaSai: 'APROBADO' })
      ];

      var result = _calcularSolicitudesAprobNegReconsideradas(filas);
      expect(result.solicitudesAprobadas).toBe(3);
      expect(result.solicitudesNegadas).toBe(0);
      expect(result.solicitudesReconsideradas).toBe(0);
    });

    it('cuenta solicitudes con registroAnalistaSai exactamente "NEGADO"', () => {
      setupGlobals();

      var filas = [
        crearFila({ registroAnalistaSai: 'NEGADO' }),
        crearFila({ registroAnalistaSai: 'NEGADO' })
      ];

      var result = _calcularSolicitudesAprobNegReconsideradas(filas);
      expect(result.solicitudesAprobadas).toBe(0);
      expect(result.solicitudesNegadas).toBe(2);
      expect(result.solicitudesReconsideradas).toBe(0);
    });

    it('cuenta solicitudes con registroAnalistaSai conteniendo "RECONSIDERADO APROBADO"', () => {
      setupGlobals();

      var filas = [
        crearFila({ registroAnalistaSai: 'RECONSIDERADO APROBADO' }),
        crearFila({ registroAnalistaSai: 'RECONSIDERADO APROBADO' })
      ];

      var result = _calcularSolicitudesAprobNegReconsideradas(filas);
      expect(result.solicitudesAprobadas).toBe(0);
      expect(result.solicitudesNegadas).toBe(0);
      expect(result.solicitudesReconsideradas).toBe(2);
    });
  });

  describe('Exclusión mutua — "RECONSIDERADO APROBADO" tiene prioridad', () => {
    it('"RECONSIDERADO APROBADO" no cuenta como aprobada', () => {
      setupGlobals();

      var filas = [
        crearFila({ registroAnalistaSai: 'RECONSIDERADO APROBADO' }),
        crearFila({ registroAnalistaSai: 'APROBADO' })
      ];

      var result = _calcularSolicitudesAprobNegReconsideradas(filas);
      expect(result.solicitudesAprobadas).toBe(1);
      expect(result.solicitudesReconsideradas).toBe(1);
    });

    it('texto con "RECONSIDERADO APROBADO" dentro de texto más largo cuenta como reconsiderada', () => {
      setupGlobals();

      var filas = [
        crearFila({ registroAnalistaSai: 'RECONSIDERADO APROBADO POR GERENCIA' })
      ];

      var result = _calcularSolicitudesAprobNegReconsideradas(filas);
      expect(result.solicitudesAprobadas).toBe(0);
      expect(result.solicitudesReconsideradas).toBe(1);
    });
  });

  describe('Conteo mixto', () => {
    it('clasifica correctamente una mezcla de estados', () => {
      setupGlobals();

      var filas = [
        crearFila({ registroAnalistaSai: 'APROBADO' }),
        crearFila({ registroAnalistaSai: 'NEGADO' }),
        crearFila({ registroAnalistaSai: 'RECONSIDERADO APROBADO' }),
        crearFila({ registroAnalistaSai: 'APROBADO' }),
        crearFila({ registroAnalistaSai: 'NEGADO' }),
        crearFila({ registroAnalistaSai: 'RECONSIDERADO APROBADO' }),
        crearFila({ registroAnalistaSai: 'APROBADO' })
      ];

      var result = _calcularSolicitudesAprobNegReconsideradas(filas);
      expect(result.solicitudesAprobadas).toBe(3);
      expect(result.solicitudesNegadas).toBe(2);
      expect(result.solicitudesReconsideradas).toBe(2);
    });
  });

  describe('Exclusión de registros vacíos', () => {
    it('no cuenta filas con registroAnalistaSai vacío', () => {
      setupGlobals();

      var filas = [
        crearFila({ registroAnalistaSai: '' }),
        crearFila({ registroAnalistaSai: 'APROBADO' }),
        crearFila({ registroAnalistaSai: '' }),
        crearFila({ registroAnalistaSai: 'NEGADO' })
      ];

      var result = _calcularSolicitudesAprobNegReconsideradas(filas);
      expect(result.solicitudesAprobadas).toBe(1);
      expect(result.solicitudesNegadas).toBe(1);
      expect(result.solicitudesReconsideradas).toBe(0);
    });
  });

  describe('Valores no reconocidos', () => {
    it('no cuenta valores que no son "APROBADO", "NEGADO" ni contienen "RECONSIDERADO APROBADO"', () => {
      setupGlobals();

      var filas = [
        crearFila({ registroAnalistaSai: 'PENDIENTE' }),
        crearFila({ registroAnalistaSai: 'EN PROCESO' }),
        crearFila({ registroAnalistaSai: 'OTRO VALOR' })
      ];

      var result = _calcularSolicitudesAprobNegReconsideradas(filas);
      expect(result.solicitudesAprobadas).toBe(0);
      expect(result.solicitudesNegadas).toBe(0);
      expect(result.solicitudesReconsideradas).toBe(0);
    });
  });

  describe('Casos borde', () => {
    it('retorna ceros para array vacío', () => {
      setupGlobals();
      var result = _calcularSolicitudesAprobNegReconsideradas([]);
      expect(result).toEqual({ solicitudesAprobadas: 0, solicitudesNegadas: 0, solicitudesReconsideradas: 0 });
    });

    it('retorna ceros para null', () => {
      setupGlobals();
      var result = _calcularSolicitudesAprobNegReconsideradas(null);
      expect(result).toEqual({ solicitudesAprobadas: 0, solicitudesNegadas: 0, solicitudesReconsideradas: 0 });
    });

    it('retorna ceros para undefined', () => {
      setupGlobals();
      var result = _calcularSolicitudesAprobNegReconsideradas(undefined);
      expect(result).toEqual({ solicitudesAprobadas: 0, solicitudesNegadas: 0, solicitudesReconsideradas: 0 });
    });

    it('retorna ceros para no-array', () => {
      setupGlobals();
      var result = _calcularSolicitudesAprobNegReconsideradas('not an array');
      expect(result).toEqual({ solicitudesAprobadas: 0, solicitudesNegadas: 0, solicitudesReconsideradas: 0 });
    });
  });
});
