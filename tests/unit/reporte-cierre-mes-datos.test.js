/**
 * Unit tests: piezas de datos del reporte de cierre de mes.
 *   - _rangosMesCierreYComparacion_ (Reportes.js) — función pura, sin Sheets.
 *   - contarLotesRadicadosEnRango (Codigo.js) — cuenta lotes por rango de fechas.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { createSpreadsheetApp } from '../mocks/spreadsheet-app.mock.js';
import { readFileSync } from 'fs';
import { resolve } from 'path';

describe('_rangosMesCierreYComparacion_() — función pura', () => {
  const sourceCode = readFileSync(resolve(__dirname, '../../Reportes.js'), 'utf-8');

  function loadSource() {
    const wrapped = `(function() { ${sourceCode}\n; globalThis._rangosMesCierreYComparacion_ = _rangosMesCierreYComparacion_; })()`;
    eval(wrapped);
  }

  beforeEach(() => {
    delete globalThis._rangosMesCierreYComparacion_;
    loadSource();
  });

  it('REGRESIÓN: disparado el día 1 de agosto, el mes a reportar es julio (no agosto)', () => {
    // Bug real encontrado en producción: el botón manual usado el 1 de agosto
    // reportó "cierre de agosto" (casi sin datos, el mes recién empezaba) en
    // vez de "cierre de julio" (el mes que de verdad ya había terminado).
    const r = globalThis._rangosMesCierreYComparacion_(new Date(2026, 7, 1)); // 1 de agosto 2026
    expect(r.mesReporte.nombre).toBe('julio');
    expect(r.mesReporte.inicio).toEqual(new Date(2026, 6, 1, 0, 0, 0, 0));
    expect(r.mesReporte.fin).toEqual(new Date(2026, 6, 31, 23, 59, 59, 999));
  });

  it('el mes de comparación es el anterior al mes reportado, no al de la fecha de referencia', () => {
    const r = globalThis._rangosMesCierreYComparacion_(new Date(2026, 7, 15)); // 15 de agosto 2026
    expect(r.mesReporte.nombre).toBe('julio');
    expect(r.mesComparacion.nombre).toBe('junio');
  });

  it('calcula el rango correcto para un mes con 31 días', () => {
    const r = globalThis._rangosMesCierreYComparacion_(new Date(2026, 7, 15)); // referencia: agosto → reporta julio
    expect(r.mesReporte.inicio).toEqual(new Date(2026, 6, 1, 0, 0, 0, 0));
    expect(r.mesReporte.fin).toEqual(new Date(2026, 6, 31, 23, 59, 59, 999));
    expect(r.mesReporte.nombre).toBe('julio');
  });

  it('calcula correctamente el mes de comparación cruzando de febrero a enero', () => {
    const r = globalThis._rangosMesCierreYComparacion_(new Date(2026, 2, 10)); // referencia: marzo → reporta febrero, compara enero
    expect(r.mesComparacion.inicio).toEqual(new Date(2026, 0, 1, 0, 0, 0, 0));
    expect(r.mesComparacion.fin).toEqual(new Date(2026, 0, 31, 23, 59, 59, 999));
    expect(r.mesComparacion.nombre).toBe('enero');
  });

  it('cruza correctamente de enero a diciembre del año anterior (referencia: cualquier día de enero)', () => {
    const r = globalThis._rangosMesCierreYComparacion_(new Date(2026, 0, 5)); // 5 de enero 2026 → reporta diciembre 2025
    expect(r.mesReporte.inicio).toEqual(new Date(2025, 11, 1, 0, 0, 0, 0));
    expect(r.mesReporte.fin).toEqual(new Date(2025, 11, 31, 23, 59, 59, 999));
    expect(r.mesReporte.nombre).toBe('diciembre');
  });

  it('cruza correctamente de febrero a diciembre del año anterior para el mes de comparación', () => {
    const r = globalThis._rangosMesCierreYComparacion_(new Date(2026, 1, 5)); // 5 de febrero 2026 → reporta enero, compara diciembre 2025
    expect(r.mesComparacion.inicio).toEqual(new Date(2025, 11, 1, 0, 0, 0, 0));
    expect(r.mesComparacion.fin).toEqual(new Date(2025, 11, 31, 23, 59, 59, 999));
    expect(r.mesComparacion.nombre).toBe('diciembre');
  });

  it('maneja correctamente meses de 28/30 días como mes reportado (marzo→febrero, mayo→abril)', () => {
    const rFeb = globalThis._rangosMesCierreYComparacion_(new Date(2026, 2, 15)); // marzo 2026 → reporta febrero (no bisiesto)
    expect(rFeb.mesReporte.fin.getDate()).toBe(28);

    const rAbr = globalThis._rangosMesCierreYComparacion_(new Date(2026, 4, 15)); // mayo → reporta abril
    expect(rAbr.mesReporte.fin.getDate()).toBe(30);
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
