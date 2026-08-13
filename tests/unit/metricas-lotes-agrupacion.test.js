/**
 * Unit tests para _agruparPorLoteYCalcularMetricas — agrupación por lote y cálculo de métricas combinadas
 *
 * Verifica:
 * - Agrupa filas por codigoLote único
 * - Calcula cantidadSolicitudes como conteo de valores ÚNICOS de solicitudInquilino
 * - Calcula métricas combinadas con condiciones exactas
 * - Excluye de métricas 3-8 solicitudes con campos vacíos pero incluye en cantidadSolicitudes
 * - Ordena resultado por fechaLote descendente
 * - Omite lotes con codigoLote vacío
 *
 * Requirements: 2.1, 2.2, 2.3, 2.4, 2.5, 2.6, 2.7, 2.8, 2.9, 2.10
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
  const wrapped = `(function() { ${sourceCode}\n; globalThis._agruparPorLoteYCalcularMetricas = _agruparPorLoteYCalcularMetricas; })()`;
  eval(wrapped);
}

function cleanupGlobals() {
  delete globalThis._registrarEvento_;
  delete globalThis.CacheWrapper_getJSON;
  delete globalThis.CacheWrapper_putJSON;
  delete globalThis.SpreadsheetApp;
  delete globalThis.getArchivoAnalisisId;
  delete globalThis.CacheService;
  delete globalThis._agruparPorLoteYCalcularMetricas;
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

describe('_agruparPorLoteYCalcularMetricas', () => {
  afterEach(cleanupGlobals);

  describe('Casos borde - entradas inválidas', () => {
    it('retorna array vacío para null', () => {
      setupGlobals();
      expect(_agruparPorLoteYCalcularMetricas(null)).toEqual([]);
    });

    it('retorna array vacío para undefined', () => {
      setupGlobals();
      expect(_agruparPorLoteYCalcularMetricas(undefined)).toEqual([]);
    });

    it('retorna array vacío para array vacío', () => {
      setupGlobals();
      expect(_agruparPorLoteYCalcularMetricas([])).toEqual([]);
    });

    it('retorna array vacío para no-array', () => {
      setupGlobals();
      expect(_agruparPorLoteYCalcularMetricas('not array')).toEqual([]);
    });
  });

  describe('Agrupación por codigoLote', () => {
    it('agrupa filas por codigoLote único', () => {
      setupGlobals();

      var filas = [
        crearFila({ codigoLote: 'LOTE-001', solicitudInquilino: 'SOL-001', resultadoLote: 'APROBADO', resultadoSolicitud: 'APROBADO', registroAnalistaSai: 'APROBADO' }),
        crearFila({ codigoLote: 'LOTE-002', solicitudInquilino: 'SOL-002', resultadoLote: 'NEGADO', resultadoSolicitud: 'NEGADO', registroAnalistaSai: 'NEGADO' })
      ];

      var result = _agruparPorLoteYCalcularMetricas(filas);
      expect(result.length).toBe(2);
      expect(result.map(function(r) { return r.codigoLote; }).sort()).toEqual(['LOTE-001', 'LOTE-002']);
    });

    it('omite filas con codigoLote vacío', () => {
      setupGlobals();

      var filas = [
        crearFila({ codigoLote: '', solicitudInquilino: 'SOL-001', resultadoLote: 'APROBADO', resultadoSolicitud: 'APROBADO', registroAnalistaSai: 'APROBADO' }),
        crearFila({ codigoLote: 'LOTE-001', solicitudInquilino: 'SOL-002', resultadoLote: 'NEGADO', resultadoSolicitud: 'NEGADO', registroAnalistaSai: 'NEGADO' })
      ];

      var result = _agruparPorLoteYCalcularMetricas(filas);
      expect(result.length).toBe(1);
      expect(result[0].codigoLote).toBe('LOTE-001');
    });
  });

  describe('cantidadSolicitudes - conteo de valores únicos', () => {
    it('cuenta valores únicos de solicitudInquilino por lote', () => {
      setupGlobals();

      var filas = [
        crearFila({ codigoLote: 'LOTE-001', solicitudInquilino: 'SOL-001', resultadoLote: 'APROBADO', resultadoSolicitud: 'APROBADO', registroAnalistaSai: 'APROBADO' }),
        crearFila({ codigoLote: 'LOTE-001', solicitudInquilino: 'SOL-002', resultadoLote: 'APROBADO', resultadoSolicitud: 'APROBADO', registroAnalistaSai: 'APROBADO' }),
        crearFila({ codigoLote: 'LOTE-001', solicitudInquilino: 'SOL-001', resultadoLote: 'APROBADO', resultadoSolicitud: 'APROBADO', registroAnalistaSai: 'APROBADO' })
      ];

      var result = _agruparPorLoteYCalcularMetricas(filas);
      expect(result[0].cantidadSolicitudes).toBe(2); // SOL-001 y SOL-002
    });

    it('incluye filas con campos vacíos en cantidadSolicitudes', () => {
      setupGlobals();

      var filas = [
        crearFila({ codigoLote: 'LOTE-001', solicitudInquilino: 'SOL-001', resultadoLote: 'APROBADO', resultadoSolicitud: 'APROBADO', registroAnalistaSai: 'APROBADO' }),
        crearFila({ codigoLote: 'LOTE-001', solicitudInquilino: 'SOL-002', resultadoLote: '', resultadoSolicitud: '', registroAnalistaSai: '' }),
        crearFila({ codigoLote: 'LOTE-001', solicitudInquilino: 'SOL-003', resultadoLote: 'APROBADO', resultadoSolicitud: '', registroAnalistaSai: '' })
      ];

      var result = _agruparPorLoteYCalcularMetricas(filas);
      expect(result[0].cantidadSolicitudes).toBe(3); // Todas las solicitudes únicas se cuentan
    });

    it('incluye solicitudInquilino vacío en el conteo si existe', () => {
      setupGlobals();

      var filas = [
        crearFila({ codigoLote: 'LOTE-001', solicitudInquilino: 'SOL-001', resultadoLote: 'APROBADO', resultadoSolicitud: 'APROBADO', registroAnalistaSai: 'APROBADO' }),
        crearFila({ codigoLote: 'LOTE-001', solicitudInquilino: '', resultadoLote: 'APROBADO', resultadoSolicitud: 'APROBADO', registroAnalistaSai: 'APROBADO' })
      ];

      var result = _agruparPorLoteYCalcularMetricas(filas);
      expect(result[0].cantidadSolicitudes).toBe(2); // SOL-001 y ""
    });
  });

  describe('Métricas combinadas - condiciones exactas', () => {
    it('calcula solicitudesAprobadasEnLote correctamente', () => {
      setupGlobals();

      var filas = [
        crearFila({ codigoLote: 'LOTE-001', solicitudInquilino: 'SOL-001', resultadoLote: 'APROBADO', resultadoSolicitud: 'APROBADO', registroAnalistaSai: 'APROBADO' }),
        crearFila({ codigoLote: 'LOTE-001', solicitudInquilino: 'SOL-002', resultadoLote: 'APROBADO', resultadoSolicitud: 'APROBADO', registroAnalistaSai: 'APROBADO' }),
        crearFila({ codigoLote: 'LOTE-001', solicitudInquilino: 'SOL-003', resultadoLote: 'APROBADO', resultadoSolicitud: 'NEGADO', registroAnalistaSai: 'APROBADO' })
      ];

      var result = _agruparPorLoteYCalcularMetricas(filas);
      expect(result[0].solicitudesAprobadasEnLote).toBe(2);
    });

    it('calcula solicitudesAprobadasIndividualNegadaPorLote correctamente', () => {
      setupGlobals();

      var filas = [
        crearFila({ codigoLote: 'LOTE-001', solicitudInquilino: 'SOL-001', resultadoLote: 'NEGADO', resultadoSolicitud: 'APROBADO', registroAnalistaSai: 'APROBADO' }),
        crearFila({ codigoLote: 'LOTE-001', solicitudInquilino: 'SOL-002', resultadoLote: 'NEGADO', resultadoSolicitud: 'APROBADO', registroAnalistaSai: 'APROBADO' }),
        crearFila({ codigoLote: 'LOTE-001', solicitudInquilino: 'SOL-003', resultadoLote: 'APROBADO', resultadoSolicitud: 'APROBADO', registroAnalistaSai: 'APROBADO' })
      ];

      var result = _agruparPorLoteYCalcularMetricas(filas);
      expect(result[0].solicitudesAprobadasIndividualNegadaPorLote).toBe(2);
    });

    it('calcula solicitudesNegadasIndividualAprobadasPorLote correctamente', () => {
      setupGlobals();

      var filas = [
        crearFila({ codigoLote: 'LOTE-001', solicitudInquilino: 'SOL-001', resultadoLote: 'APROBADO', resultadoSolicitud: 'NEGADO', registroAnalistaSai: 'APROBADO' }),
        crearFila({ codigoLote: 'LOTE-001', solicitudInquilino: 'SOL-002', resultadoLote: 'APROBADO', resultadoSolicitud: 'APROBADO', registroAnalistaSai: 'APROBADO' })
      ];

      var result = _agruparPorLoteYCalcularMetricas(filas);
      expect(result[0].solicitudesNegadasIndividualAprobadasPorLote).toBe(1);
    });
  });

  describe('Métricas combinadas - solicitudesNegadas y analista', () => {
    it('calcula solicitudesNegadas correctamente', () => {
      setupGlobals();

      var filas = [
        crearFila({ codigoLote: 'LOTE-001', solicitudInquilino: 'SOL-001', resultadoLote: 'NEGADO', resultadoSolicitud: 'NEGADO', registroAnalistaSai: 'NEGADO' }),
        crearFila({ codigoLote: 'LOTE-001', solicitudInquilino: 'SOL-002', resultadoLote: 'NEGADO', resultadoSolicitud: 'NEGADO', registroAnalistaSai: 'NEGADO' }),
        crearFila({ codigoLote: 'LOTE-001', solicitudInquilino: 'SOL-003', resultadoLote: 'NEGADO', resultadoSolicitud: 'APROBADO', registroAnalistaSai: 'NEGADO' })
      ];

      var result = _agruparPorLoteYCalcularMetricas(filas);
      expect(result[0].solicitudesNegadas).toBe(2);
    });

    it('calcula aprobadaPorLoteNegadaPorAnalista correctamente', () => {
      setupGlobals();

      var filas = [
        crearFila({ codigoLote: 'LOTE-001', solicitudInquilino: 'SOL-001', resultadoLote: 'APROBADO', resultadoSolicitud: 'APROBADO', registroAnalistaSai: 'NEGADO' }),
        crearFila({ codigoLote: 'LOTE-001', solicitudInquilino: 'SOL-002', resultadoLote: 'APROBADO', resultadoSolicitud: 'NEGADO', registroAnalistaSai: 'NEGADO' }),
        crearFila({ codigoLote: 'LOTE-001', solicitudInquilino: 'SOL-003', resultadoLote: 'NEGADO', resultadoSolicitud: 'APROBADO', registroAnalistaSai: 'NEGADO' })
      ];

      var result = _agruparPorLoteYCalcularMetricas(filas);
      expect(result[0].aprobadaPorLoteNegadaPorAnalista).toBe(2);
    });

    it('calcula negadaPorLoteReconsideradaPorGerencia con contains check', () => {
      setupGlobals();

      var filas = [
        crearFila({ codigoLote: 'LOTE-001', solicitudInquilino: 'SOL-001', resultadoLote: 'NEGADO', resultadoSolicitud: 'NEGADO', registroAnalistaSai: 'RECONSIDERADO APROBADO' }),
        crearFila({ codigoLote: 'LOTE-001', solicitudInquilino: 'SOL-002', resultadoLote: 'NEGADO', resultadoSolicitud: 'APROBADO', registroAnalistaSai: 'RECONSIDERADO APROBADO POR GERENCIA' }),
        crearFila({ codigoLote: 'LOTE-001', solicitudInquilino: 'SOL-003', resultadoLote: 'NEGADO', resultadoSolicitud: 'NEGADO', registroAnalistaSai: 'APROBADO' })
      ];

      var result = _agruparPorLoteYCalcularMetricas(filas);
      expect(result[0].negadaPorLoteReconsideradaPorGerencia).toBe(2);
    });
  });

  describe('Exclusión de campos vacíos en métricas 3-8', () => {
    it('excluye de métricas 3-8 filas con resultadoLote vacío', () => {
      setupGlobals();

      var filas = [
        crearFila({ codigoLote: 'LOTE-001', solicitudInquilino: 'SOL-001', resultadoLote: '', resultadoSolicitud: 'APROBADO', registroAnalistaSai: 'APROBADO' }),
        crearFila({ codigoLote: 'LOTE-001', solicitudInquilino: 'SOL-002', resultadoLote: 'APROBADO', resultadoSolicitud: 'APROBADO', registroAnalistaSai: 'APROBADO' })
      ];

      var result = _agruparPorLoteYCalcularMetricas(filas);
      expect(result[0].cantidadSolicitudes).toBe(2); // Ambas en cantidadSolicitudes
      expect(result[0].solicitudesAprobadasEnLote).toBe(1); // Solo la segunda cuenta
    });

    it('excluye de métricas 3-8 filas con resultadoSolicitud vacío', () => {
      setupGlobals();

      var filas = [
        crearFila({ codigoLote: 'LOTE-001', solicitudInquilino: 'SOL-001', resultadoLote: 'APROBADO', resultadoSolicitud: '', registroAnalistaSai: 'APROBADO' }),
        crearFila({ codigoLote: 'LOTE-001', solicitudInquilino: 'SOL-002', resultadoLote: 'APROBADO', resultadoSolicitud: 'APROBADO', registroAnalistaSai: 'APROBADO' })
      ];

      var result = _agruparPorLoteYCalcularMetricas(filas);
      expect(result[0].cantidadSolicitudes).toBe(2);
      expect(result[0].solicitudesAprobadasEnLote).toBe(1);
    });

    it('excluye de métricas 3-8 filas con registroAnalistaSai vacío', () => {
      setupGlobals();

      var filas = [
        crearFila({ codigoLote: 'LOTE-001', solicitudInquilino: 'SOL-001', resultadoLote: 'APROBADO', resultadoSolicitud: 'APROBADO', registroAnalistaSai: '' }),
        crearFila({ codigoLote: 'LOTE-001', solicitudInquilino: 'SOL-002', resultadoLote: 'APROBADO', resultadoSolicitud: 'APROBADO', registroAnalistaSai: 'APROBADO' })
      ];

      var result = _agruparPorLoteYCalcularMetricas(filas);
      expect(result[0].cantidadSolicitudes).toBe(2);
      expect(result[0].solicitudesAprobadasEnLote).toBe(1);
    });
  });

  describe('Ordenamiento por fechaLote descendente', () => {
    it('ordena resultado por fechaLote descendente (más reciente primero)', () => {
      setupGlobals();

      var filas = [
        crearFila({ codigoLote: 'LOTE-001', fechaLote: new Date(2025, 0, 10), solicitudInquilino: 'SOL-001', resultadoLote: 'APROBADO', resultadoSolicitud: 'APROBADO', registroAnalistaSai: 'APROBADO' }),
        crearFila({ codigoLote: 'LOTE-002', fechaLote: new Date(2025, 0, 20), solicitudInquilino: 'SOL-002', resultadoLote: 'NEGADO', resultadoSolicitud: 'NEGADO', registroAnalistaSai: 'NEGADO' }),
        crearFila({ codigoLote: 'LOTE-003', fechaLote: new Date(2025, 0, 15), solicitudInquilino: 'SOL-003', resultadoLote: 'APROBADO', resultadoSolicitud: 'APROBADO', registroAnalistaSai: 'APROBADO' })
      ];

      var result = _agruparPorLoteYCalcularMetricas(filas);
      expect(result[0].codigoLote).toBe('LOTE-002'); // 20 ene
      expect(result[1].codigoLote).toBe('LOTE-003'); // 15 ene
      expect(result[2].codigoLote).toBe('LOTE-001'); // 10 ene
    });
  });

  describe('fechaLote y resultadoLote del grupo', () => {
    it('usa la primera fecha encontrada para el lote', () => {
      setupGlobals();

      var filas = [
        crearFila({ codigoLote: 'LOTE-001', fechaLote: new Date(2025, 0, 10), solicitudInquilino: 'SOL-001', resultadoLote: 'APROBADO', resultadoSolicitud: 'APROBADO', registroAnalistaSai: 'APROBADO' }),
        crearFila({ codigoLote: 'LOTE-001', fechaLote: new Date(2025, 0, 15), solicitudInquilino: 'SOL-002', resultadoLote: 'APROBADO', resultadoSolicitud: 'APROBADO', registroAnalistaSai: 'APROBADO' })
      ];

      var result = _agruparPorLoteYCalcularMetricas(filas);
      expect(result[0].fechaLote.getTime()).toBe(new Date(2025, 0, 10).getTime());
    });

    it('usa el primer resultadoLote no vacío encontrado', () => {
      setupGlobals();

      var filas = [
        crearFila({ codigoLote: 'LOTE-001', solicitudInquilino: 'SOL-001', resultadoLote: '', resultadoSolicitud: 'APROBADO', registroAnalistaSai: 'APROBADO' }),
        crearFila({ codigoLote: 'LOTE-001', solicitudInquilino: 'SOL-002', resultadoLote: 'NEGADO', resultadoSolicitud: 'NEGADO', registroAnalistaSai: 'NEGADO' })
      ];

      var result = _agruparPorLoteYCalcularMetricas(filas);
      expect(result[0].resultadoLote).toBe('NEGADO');
    });
  });

  describe('Escenario integrado - múltiples lotes con métricas variadas', () => {
    it('calcula correctamente métricas para múltiples lotes', () => {
      setupGlobals();

      var filas = [
        // LOTE-001: 3 solicitudes únicas, mezcla de estados
        crearFila({ codigoLote: 'LOTE-001', fechaLote: new Date(2025, 0, 20), solicitudInquilino: 'SOL-001', resultadoLote: 'APROBADO', resultadoSolicitud: 'APROBADO', registroAnalistaSai: 'APROBADO' }),
        crearFila({ codigoLote: 'LOTE-001', fechaLote: new Date(2025, 0, 20), solicitudInquilino: 'SOL-002', resultadoLote: 'APROBADO', resultadoSolicitud: 'NEGADO', registroAnalistaSai: 'APROBADO' }),
        crearFila({ codigoLote: 'LOTE-001', fechaLote: new Date(2025, 0, 20), solicitudInquilino: 'SOL-003', resultadoLote: 'APROBADO', resultadoSolicitud: 'APROBADO', registroAnalistaSai: 'NEGADO' }),
        // LOTE-002: 2 solicitudes únicas, todas negadas
        crearFila({ codigoLote: 'LOTE-002', fechaLote: new Date(2025, 0, 10), solicitudInquilino: 'SOL-004', resultadoLote: 'NEGADO', resultadoSolicitud: 'NEGADO', registroAnalistaSai: 'NEGADO' }),
        crearFila({ codigoLote: 'LOTE-002', fechaLote: new Date(2025, 0, 10), solicitudInquilino: 'SOL-005', resultadoLote: 'NEGADO', resultadoSolicitud: 'NEGADO', registroAnalistaSai: 'NEGADO' })
      ];

      var result = _agruparPorLoteYCalcularMetricas(filas);

      // Debe estar ordenado: LOTE-001 (20 ene) primero, LOTE-002 (10 ene) después
      expect(result[0].codigoLote).toBe('LOTE-001');
      expect(result[0].cantidadSolicitudes).toBe(3);
      expect(result[0].solicitudesAprobadasEnLote).toBe(1);
      expect(result[0].solicitudesNegadasIndividualAprobadasPorLote).toBe(1);
      expect(result[0].aprobadaPorLoteNegadaPorAnalista).toBe(1);

      expect(result[1].codigoLote).toBe('LOTE-002');
      expect(result[1].cantidadSolicitudes).toBe(2);
      expect(result[1].solicitudesNegadas).toBe(2);
    });
  });
});
