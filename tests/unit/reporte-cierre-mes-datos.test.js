/**
 * Unit tests: piezas de datos del reporte de cierre de mes.
 *   - _rangosMesActualYAnterior_ (Reportes.js) — función pura, sin Sheets.
 *   - contarLotesRadicadosEnRango (Codigo.js) — cuenta lotes por rango de fechas.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { createSpreadsheetApp } from '../mocks/spreadsheet-app.mock.js';
import { readFileSync } from 'fs';
import { resolve } from 'path';

describe('_rangosMesActualYAnterior_() — función pura', () => {
  const sourceCode = readFileSync(resolve(__dirname, '../../Reportes.js'), 'utf-8');

  function loadSource() {
    const wrapped = `(function() { ${sourceCode}\n; globalThis._rangosMesActualYAnterior_ = _rangosMesActualYAnterior_; })()`;
    eval(wrapped);
  }

  beforeEach(() => {
    delete globalThis._rangosMesActualYAnterior_;
    loadSource();
  });

  it('calcula el rango correcto para un mes con 31 días', () => {
    const r = globalThis._rangosMesActualYAnterior_(new Date(2026, 6, 15)); // 15 de julio 2026
    expect(r.esteMes.inicio).toEqual(new Date(2026, 6, 1, 0, 0, 0, 0));
    expect(r.esteMes.fin).toEqual(new Date(2026, 6, 31, 23, 59, 59, 999));
    expect(r.esteMes.nombre).toBe('julio');
  });

  it('calcula correctamente el mes anterior cruzando de febrero a enero', () => {
    const r = globalThis._rangosMesActualYAnterior_(new Date(2026, 1, 10)); // 10 de febrero 2026
    expect(r.mesAnterior.inicio).toEqual(new Date(2026, 0, 1, 0, 0, 0, 0));
    expect(r.mesAnterior.fin).toEqual(new Date(2026, 0, 31, 23, 59, 59, 999));
    expect(r.mesAnterior.nombre).toBe('enero');
  });

  it('cruza correctamente de enero a diciembre del año anterior', () => {
    const r = globalThis._rangosMesActualYAnterior_(new Date(2026, 0, 5)); // 5 de enero 2026
    expect(r.mesAnterior.inicio).toEqual(new Date(2025, 11, 1, 0, 0, 0, 0));
    expect(r.mesAnterior.fin).toEqual(new Date(2025, 11, 31, 23, 59, 59, 999));
    expect(r.mesAnterior.nombre).toBe('diciembre');
  });

  it('maneja correctamente meses de 28/29/30 días (febrero, abril)', () => {
    const rFeb = globalThis._rangosMesActualYAnterior_(new Date(2026, 1, 15)); // febrero 2026 (no bisiesto)
    expect(rFeb.esteMes.fin.getDate()).toBe(28);

    const rAbr = globalThis._rangosMesActualYAnterior_(new Date(2026, 3, 15)); // abril
    expect(rAbr.esteMes.fin.getDate()).toBe(30);
  });
});

describe('contarLotesRadicadosEnRango() — Hoja_Control', () => {
  const sourceCode = readFileSync(resolve(__dirname, '../../Codigo.js'), 'utf-8');

  function loadSource() {
    const wrapped = `(function() { ${sourceCode}\n; globalThis.contarLotesRadicadosEnRango = contarLotesRadicadosEnRango; })()`;
    eval(wrapped);
  }

  // Hoja_Control: Fecha(0) Email(1) Poliza(2) Resultado(3) Detalle(4) IdLote(5) Observaciones(6)
  function filaLog(fecha, email, resultado, idLote) {
    return [fecha, email, 'POL-1', resultado, '', idLote, ''];
  }

  function setupEnvironment(filas) {
    const app = createSpreadsheetApp({
      'Hoja_Control': [['Fecha', 'Email', 'Poliza', 'Resultado', 'Detalle', 'IdLote', 'Observaciones'], ...filas]
    });
    globalThis.SpreadsheetApp = app;
    loadSource();
    return { app };
  }

  beforeEach(() => {
    delete globalThis.SpreadsheetApp;
    delete globalThis.contarLotesRadicadosEnRango;
  });

  it('cuenta solo los lotes EXITOSO del comercial dentro del rango de fechas', () => {
    setupEnvironment([
      filaLog(new Date(2026, 6, 5), 'ana@test.com', 'EXITOSO', 'LOTE-A'),
      filaLog(new Date(2026, 6, 10), 'ana@test.com', 'EXITOSO', 'LOTE-B'),
      filaLog(new Date(2026, 6, 20), 'ana@test.com', 'FALLIDO', 'LOTE-C'), // fallido, no cuenta
      filaLog(new Date(2026, 5, 28), 'ana@test.com', 'EXITOSO', 'LOTE-D'), // fuera de rango (junio)
      filaLog(new Date(2026, 6, 12), 'otro@test.com', 'EXITOSO', 'LOTE-E'), // otro comercial
    ]);

    const total = globalThis.contarLotesRadicadosEnRango(
      'ana@test.com',
      new Date(2026, 6, 1, 0, 0, 0, 0),
      new Date(2026, 6, 31, 23, 59, 59, 999)
    );

    expect(total).toBe(2);
  });

  it('no cuenta el mismo lote dos veces si aparece en varias filas', () => {
    setupEnvironment([
      filaLog(new Date(2026, 6, 5), 'ana@test.com', 'EXITOSO', 'LOTE-A'),
      filaLog(new Date(2026, 6, 5), 'ana@test.com', 'EXITOSO', 'LOTE-A'), // duplicado
    ]);

    const total = globalThis.contarLotesRadicadosEnRango(
      'ana@test.com',
      new Date(2026, 6, 1, 0, 0, 0, 0),
      new Date(2026, 6, 31, 23, 59, 59, 999)
    );

    expect(total).toBe(1);
  });

  it('retorna 0 si la hoja no tiene filas de datos', () => {
    setupEnvironment([]);
    const total = globalThis.contarLotesRadicadosEnRango('ana@test.com', new Date(2026, 6, 1), new Date(2026, 6, 31));
    expect(total).toBe(0);
  });

  it('es insensible a mayúsculas/minúsculas en el email', () => {
    setupEnvironment([
      filaLog(new Date(2026, 6, 5), 'Ana@Test.com', 'EXITOSO', 'LOTE-A'),
    ]);

    const total = globalThis.contarLotesRadicadosEnRango(
      'ana@test.com',
      new Date(2026, 6, 1, 0, 0, 0, 0),
      new Date(2026, 6, 31, 23, 59, 59, 999)
    );

    expect(total).toBe(1);
  });
});
