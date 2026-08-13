/**
 * Unit tests para _filtrarFilasPorPeriodo — filtrado de filas por periodo mensual
 *
 * Verifica:
 * - Filtra solo filas cuya Fecha_Lote pertenece al mes/año indicado
 * - Excluye filas con Fecha_Lote vacía sin error
 * - Excluye filas con Fecha_Lote inválida (texto no parseable) sin error
 * - Normaliza campos de texto con .toString().trim().toUpperCase()
 * - Comparación de fecha sin componente horario
 * - Maneja correctamente primer y último día del mes
 * - Retorna array vacío si datos es null, vacío, o solo headers
 *
 * Requirements: 3.3, 3.5, 1.6
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { createSpreadsheetApp } from '../mocks/spreadsheet-app.mock.js';

// ─── Mapa de columnas estándar ──────────────────────────────────────────────────

const MAPA_COLUMNAS = {
  fechaLote: 0,
  solicitudInquilino: 1,
  codigoLote: 2,
  resultadoLote: 3,
  resultadoSolicitud: 4,
  registroAnalistaSai: 5
};

const HEADERS = ['Fecha Lote', 'Solicitud Inquilino', 'codigo lote', 'RESULTADO LOTE', 'RESULTADO SOLICITUD', 'REGISTRO ANALISTA SAI'];

// ─── Setup ──────────────────────────────────────────────────────────────────────

let logEventos;

function setupGlobals() {
  logEventos = [];

  const app = createSpreadsheetApp({
    'registro analisis': [HEADERS]
  });
  globalThis.SpreadsheetApp = app;
  globalThis.getArchivoAnalisisId = () => 'mock-analisis-id';
  globalThis.CacheService = { getScriptCache: () => ({ get: () => null, put: () => {} }) };

  globalThis._registrarEvento_ = function(nivel, modulo, mensaje, detalle) {
    logEventos.push({ nivel, modulo, mensaje, detalle });
  };

  globalThis.CacheWrapper_getJSON = function() { return null; };
  globalThis.CacheWrapper_putJSON = function() {};

  loadSource();
}

function loadSource() {
  const fs = require('fs');
  const path = require('path');
  const sourceCode = fs.readFileSync(
    path.resolve(__dirname, '../../Servicios_MetricasLotes.js'),
    'utf-8'
  );
  const wrapped = `(function() { ${sourceCode}\n; globalThis._filtrarFilasPorPeriodo = _filtrarFilasPorPeriodo; globalThis._mapearColumnasMetricasLotes = _mapearColumnasMetricasLotes; globalThis._metricasLotesVacias = _metricasLotesVacias; })()`;
  eval(wrapped);
}

function cleanupGlobals() {
  delete globalThis.CacheService;
  delete globalThis.SpreadsheetApp;
  delete globalThis.getArchivoAnalisisId;
  delete globalThis._registrarEvento_;
  delete globalThis.CacheWrapper_getJSON;
  delete globalThis.CacheWrapper_putJSON;
  delete globalThis._filtrarFilasPorPeriodo;
  delete globalThis._mapearColumnasMetricasLotes;
  delete globalThis._metricasLotesVacias;
}

// ─── Tests ─────────────────────────────────────────────────────────────────────

describe('_filtrarFilasPorPeriodo', () => {
  afterEach(cleanupGlobals);

  describe('Filtrado por rango de fechas', () => {
    it('incluye filas con Fecha_Lote dentro del mes solicitado', () => {
      setupGlobals();

      var datos = [
        HEADERS,
        [new Date(2025, 0, 15), 'SOL-001', 'LOTE-A', 'APROBADO', 'APROBADO', 'APROBADO'],  // Enero 2025
        [new Date(2025, 0, 1), 'SOL-002', 'LOTE-B', 'NEGADO', 'NEGADO', 'NEGADO'],          // Enero 2025 - primer día
        [new Date(2025, 0, 31), 'SOL-003', 'LOTE-C', 'APROBADO', 'NEGADO', 'APROBADO'],     // Enero 2025 - último día
      ];

      var result = _filtrarFilasPorPeriodo(datos, MAPA_COLUMNAS, 1, 2025);
      expect(result).toHaveLength(3);
    });

    it('excluye filas con Fecha_Lote fuera del mes solicitado', () => {
      setupGlobals();

      var datos = [
        HEADERS,
        [new Date(2025, 0, 15), 'SOL-001', 'LOTE-A', 'APROBADO', 'APROBADO', 'APROBADO'],  // Enero
        [new Date(2025, 1, 1), 'SOL-002', 'LOTE-B', 'NEGADO', 'NEGADO', 'NEGADO'],          // Febrero
        [new Date(2024, 11, 31), 'SOL-003', 'LOTE-C', 'APROBADO', 'NEGADO', 'APROBADO'],    // Diciembre 2024
      ];

      var result = _filtrarFilasPorPeriodo(datos, MAPA_COLUMNAS, 1, 2025);
      expect(result).toHaveLength(1);
      expect(result[0].solicitudInquilino).toBe('SOL-001');
    });

    it('incluye correctamente el primer día del mes', () => {
      setupGlobals();

      var datos = [
        HEADERS,
        [new Date(2025, 2, 1), 'SOL-001', 'LOTE-A', 'APROBADO', 'APROBADO', 'APROBADO'],  // 1 de Marzo
      ];

      var result = _filtrarFilasPorPeriodo(datos, MAPA_COLUMNAS, 3, 2025);
      expect(result).toHaveLength(1);
    });

    it('incluye correctamente el último día del mes (febrero bisiesto)', () => {
      setupGlobals();

      var datos = [
        HEADERS,
        [new Date(2024, 1, 29), 'SOL-001', 'LOTE-A', 'APROBADO', 'APROBADO', 'APROBADO'],  // 29 Feb 2024 (bisiesto)
      ];

      var result = _filtrarFilasPorPeriodo(datos, MAPA_COLUMNAS, 2, 2024);
      expect(result).toHaveLength(1);
    });

    it('excluye fecha del día siguiente al último día del mes', () => {
      setupGlobals();

      var datos = [
        HEADERS,
        [new Date(2025, 1, 1), 'SOL-001', 'LOTE-A', 'APROBADO', 'APROBADO', 'APROBADO'],  // 1 Feb = fuera de enero
      ];

      var result = _filtrarFilasPorPeriodo(datos, MAPA_COLUMNAS, 1, 2025);
      expect(result).toHaveLength(0);
    });

    it('ignora componente horario en la comparación de fechas', () => {
      setupGlobals();

      // Fecha del último día con hora 23:59:59
      var fechaConHora = new Date(2025, 0, 31, 23, 59, 59);
      var datos = [
        HEADERS,
        [fechaConHora, 'SOL-001', 'LOTE-A', 'APROBADO', 'APROBADO', 'APROBADO'],
      ];

      var result = _filtrarFilasPorPeriodo(datos, MAPA_COLUMNAS, 1, 2025);
      expect(result).toHaveLength(1);
      // El objeto Date en resultado debe tener hora 00:00:00
      expect(result[0].fechaLote.getHours()).toBe(0);
      expect(result[0].fechaLote.getMinutes()).toBe(0);
    });
  });

  describe('Exclusión de filas con fecha inválida', () => {
    it('excluye filas con Fecha_Lote vacía (string vacío)', () => {
      setupGlobals();

      var datos = [
        HEADERS,
        ['', 'SOL-001', 'LOTE-A', 'APROBADO', 'APROBADO', 'APROBADO'],
        [new Date(2025, 0, 15), 'SOL-002', 'LOTE-B', 'NEGADO', 'NEGADO', 'NEGADO'],
      ];

      var result = _filtrarFilasPorPeriodo(datos, MAPA_COLUMNAS, 1, 2025);
      expect(result).toHaveLength(1);
      expect(result[0].solicitudInquilino).toBe('SOL-002');
    });

    it('excluye filas con Fecha_Lote null', () => {
      setupGlobals();

      var datos = [
        HEADERS,
        [null, 'SOL-001', 'LOTE-A', 'APROBADO', 'APROBADO', 'APROBADO'],
      ];

      var result = _filtrarFilasPorPeriodo(datos, MAPA_COLUMNAS, 1, 2025);
      expect(result).toHaveLength(0);
    });

    it('excluye filas con Fecha_Lote undefined', () => {
      setupGlobals();

      var datos = [
        HEADERS,
        [undefined, 'SOL-001', 'LOTE-A', 'APROBADO', 'APROBADO', 'APROBADO'],
      ];

      var result = _filtrarFilasPorPeriodo(datos, MAPA_COLUMNAS, 1, 2025);
      expect(result).toHaveLength(0);
    });

    it('excluye filas con Fecha_Lote como texto no parseable', () => {
      setupGlobals();

      var datos = [
        HEADERS,
        ['texto-invalido', 'SOL-001', 'LOTE-A', 'APROBADO', 'APROBADO', 'APROBADO'],
        ['no es fecha', 'SOL-002', 'LOTE-B', 'NEGADO', 'NEGADO', 'NEGADO'],
      ];

      var result = _filtrarFilasPorPeriodo(datos, MAPA_COLUMNAS, 1, 2025);
      expect(result).toHaveLength(0);
    });

    it('no genera errores al excluir filas con fecha inválida', () => {
      setupGlobals();

      var datos = [
        HEADERS,
        ['', 'SOL-001', 'LOTE-A', 'APROBADO', 'APROBADO', 'APROBADO'],
        [null, 'SOL-002', 'LOTE-B', 'NEGADO', 'NEGADO', 'NEGADO'],
        ['xyz', 'SOL-003', 'LOTE-C', 'APROBADO', 'NEGADO', 'APROBADO'],
      ];

      _filtrarFilasPorPeriodo(datos, MAPA_COLUMNAS, 1, 2025);
      expect(logEventos).toHaveLength(0);
    });
  });

  describe('Normalización de campos de texto', () => {
    it('aplica .toString().trim().toUpperCase() a todos los campos de texto', () => {
      setupGlobals();

      var datos = [
        HEADERS,
        [new Date(2025, 0, 15), '  sol-001  ', ' lote-a ', '  aprobado  ', ' negado ', '  reconsiderado aprobado  '],
      ];

      var result = _filtrarFilasPorPeriodo(datos, MAPA_COLUMNAS, 1, 2025);
      expect(result).toHaveLength(1);
      expect(result[0].solicitudInquilino).toBe('SOL-001');
      expect(result[0].codigoLote).toBe('LOTE-A');
      expect(result[0].resultadoLote).toBe('APROBADO');
      expect(result[0].resultadoSolicitud).toBe('NEGADO');
      expect(result[0].registroAnalistaSai).toBe('RECONSIDERADO APROBADO');
    });

    it('maneja campos numéricos convirtiéndolos a string normalizado', () => {
      setupGlobals();

      var datos = [
        HEADERS,
        [new Date(2025, 0, 15), 12345, 67890, 'aprobado', 'negado', 'aprobado'],
      ];

      var result = _filtrarFilasPorPeriodo(datos, MAPA_COLUMNAS, 1, 2025);
      expect(result[0].solicitudInquilino).toBe('12345');
      expect(result[0].codigoLote).toBe('67890');
    });

    it('maneja campos vacíos/null sin error (retorna string vacío)', () => {
      setupGlobals();

      var datos = [
        HEADERS,
        [new Date(2025, 0, 15), '', null, undefined, '', ''],
      ];

      var result = _filtrarFilasPorPeriodo(datos, MAPA_COLUMNAS, 1, 2025);
      expect(result).toHaveLength(1);
      expect(result[0].solicitudInquilino).toBe('');
      expect(result[0].codigoLote).toBe('');
      expect(result[0].resultadoLote).toBe('');
      expect(result[0].resultadoSolicitud).toBe('');
      expect(result[0].registroAnalistaSai).toBe('');
    });
  });

  describe('Casos borde', () => {
    it('retorna array vacío si datos es null', () => {
      setupGlobals();
      var result = _filtrarFilasPorPeriodo(null, MAPA_COLUMNAS, 1, 2025);
      expect(result).toEqual([]);
    });

    it('retorna array vacío si datos es undefined', () => {
      setupGlobals();
      var result = _filtrarFilasPorPeriodo(undefined, MAPA_COLUMNAS, 1, 2025);
      expect(result).toEqual([]);
    });

    it('retorna array vacío si datos solo tiene headers (1 fila)', () => {
      setupGlobals();
      var datos = [HEADERS];
      var result = _filtrarFilasPorPeriodo(datos, MAPA_COLUMNAS, 1, 2025);
      expect(result).toEqual([]);
    });

    it('retorna array vacío si datos es array vacío', () => {
      setupGlobals();
      var result = _filtrarFilasPorPeriodo([], MAPA_COLUMNAS, 1, 2025);
      expect(result).toEqual([]);
    });

    it('retorna array vacío si mapa es null', () => {
      setupGlobals();
      var datos = [
        HEADERS,
        [new Date(2025, 0, 15), 'SOL-001', 'LOTE-A', 'APROBADO', 'APROBADO', 'APROBADO'],
      ];
      var result = _filtrarFilasPorPeriodo(datos, null, 1, 2025);
      expect(result).toEqual([]);
    });

    it('retorna objeto fechaLote como instancia de Date', () => {
      setupGlobals();

      var datos = [
        HEADERS,
        [new Date(2025, 0, 15), 'SOL-001', 'LOTE-A', 'APROBADO', 'APROBADO', 'APROBADO'],
      ];

      var result = _filtrarFilasPorPeriodo(datos, MAPA_COLUMNAS, 1, 2025);
      expect(result[0].fechaLote).toBeInstanceOf(Date);
      expect(result[0].fechaLote.getDate()).toBe(15);
      expect(result[0].fechaLote.getMonth()).toBe(0); // enero
      expect(result[0].fechaLote.getFullYear()).toBe(2025);
    });

    it('funciona correctamente para diciembre (mes 12)', () => {
      setupGlobals();

      var datos = [
        HEADERS,
        [new Date(2025, 11, 1), 'SOL-001', 'LOTE-A', 'APROBADO', 'APROBADO', 'APROBADO'],
        [new Date(2025, 11, 31), 'SOL-002', 'LOTE-B', 'NEGADO', 'NEGADO', 'NEGADO'],
        [new Date(2026, 0, 1), 'SOL-003', 'LOTE-C', 'APROBADO', 'NEGADO', 'APROBADO'],  // Enero 2026 = fuera
      ];

      var result = _filtrarFilasPorPeriodo(datos, MAPA_COLUMNAS, 12, 2025);
      expect(result).toHaveLength(2);
    });
  });
});
