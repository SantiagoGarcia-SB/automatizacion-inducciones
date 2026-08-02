/**
 * Unit test: obtenerLotesDeComercial() — ventana de lectura
 *
 * Verifica:
 * 1. Con > 2000 filas, solo lee las últimas 2000
 * 2. Con < 2000 filas, lee todas las disponibles
 * 3. Paginación funciona correctamente sobre la ventana
 * 4. Filtros de estado y búsqueda operan sobre la ventana
 *
 * Requirements: 10.2, 10.4, 10.5
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { createSpreadsheetApp } from '../mocks/spreadsheet-app.mock.js';
import { readFileSync } from 'fs';
import { resolve } from 'path';

// ─── Load source via eval (GAS has no exports) ──────────────────────────────

const SOURCE_PATH = resolve(__dirname, '../../Repositorios_ControlGeneralRepo.js');
const sourceCode = readFileSync(SOURCE_PATH, 'utf-8');

/**
 * Loads obtenerLotesDeComercial and helpers into globalThis by eval'ing the source.
 * This simulates the GAS runtime where all functions share global scope.
 */
function loadSource() {
  const wrapped = `(function() { ${sourceCode}\n; globalThis.obtenerLotesDeComercial = obtenerLotesDeComercial; globalThis._nombreComercialParaBusqueda = _nombreComercialParaBusqueda; })()`;
  eval(wrapped);
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

/**
 * Genera una fila de Control_General con 24 columnas (lo que lee la función).
 */
function generarFila(opts) {
  var fila = new Array(24).fill('');
  fila[0] = opts.idLote || 'LOTE-001';
  fila[2] = opts.fecha || new Date(2025, 0, 15);
  fila[9] = opts.estado || '';
  fila[10] = opts.comercial || 'JUAN PEREZ';
  fila[23] = opts.arrendatario || 'Arrendatario Test';
  return fila;
}

/**
 * Genera N filas con parámetros configurables.
 */
function generarFilas(n, opts) {
  var filas = [];
  for (var i = 0; i < n; i++) {
    filas.push(generarFila({
      idLote: (opts.idLotePrefix || 'LOTE') + '-' + String(i).padStart(4, '0'),
      estado: opts.estado || 'RADICADO',
      comercial: opts.comercial || 'JUAN PEREZ',
      fecha: opts.fecha || new Date(2025, 0, 15 + i),
      arrendatario: 'Arrendatario ' + i
    }));
  }
  return filas;
}

/**
 * Sets up global mocks and loads obtenerLotesDeComercial.
 * @param {any[][]} dataRows - Rows of data (without header)
 */
function setupEnvironment(dataRows) {
  const header = new Array(24).fill('HEADER');
  const allData = [header, ...dataRows];

  const app = createSpreadsheetApp({
    'Control_General': allData
  });

  globalThis.SpreadsheetApp = app;
  globalThis.getHojaControlId = () => 'mock-id';
  globalThis.Utilities = {
    formatDate: function(date, tz, fmt) {
      if (date instanceof Date) {
        return date.toLocaleDateString('es-CO');
      }
      return '';
    }
  };

  // Load the actual source code into global scope
  loadSource();

  return app;
}

// ─── Tests ───────────────────────────────────────────────────────────────────

describe('obtenerLotesDeComercial() — ventana de lectura', () => {
  beforeEach(() => {
    delete globalThis.SpreadsheetApp;
    delete globalThis.getHojaControlId;
    delete globalThis.Utilities;
    delete globalThis.obtenerLotesDeComercial;
    delete globalThis._nombreComercialParaBusqueda;
  });

  afterEach(() => {
    delete globalThis.SpreadsheetApp;
    delete globalThis.getHojaControlId;
    delete globalThis.Utilities;
    delete globalThis.obtenerLotesDeComercial;
    delete globalThis._nombreComercialParaBusqueda;
  });

  it('con > 2000 filas, solo lee las últimas 2000', () => {
    // 3000 data rows total: first 1000 with early lotes, last 2000 with late lotes
    const earlyRows = generarFilas(1000, { idLotePrefix: 'EARLY', estado: 'RADICADO' });
    const lateRows = generarFilas(2000, { idLotePrefix: 'LATE', estado: 'RADICADO' });
    const allRows = [...earlyRows, ...lateRows];

    const app = setupEnvironment(allRows);

    const resultado = globalThis.obtenerLotesDeComercial(null, 1, 10, '', '');

    // Verify: getRange should start at row 1002 (3001 - 2000 + 1), read 2000 rows, 24 cols
    const sheet = app._spreadsheet.getSheetByName('Control_General');
    const getRangeCalls = sheet.getCallLog('getRange');

    // ultimaFila = 3001 (1 header + 3000 data)
    // filasDisponibles = 3000, filasALeer = min(3000, 2000) = 2000
    // filaInicio = 3001 - 2000 + 1 = 1002
    const dataRangeCall = getRangeCalls.find(c =>
      c.args && c.args[0] === 1002 && c.args[1] === 1 && c.args[2] === 2000 && c.args[3] === 24
    );
    expect(dataRangeCall).toBeDefined();

    // Results should only come from the "LATE" lotes (the windowed portion)
    for (const lote of resultado.datos) {
      expect(lote.idLote).toMatch(/^LATE-/);
    }
  });

  it('con < 2000 filas, lee todas las disponibles', () => {
    // 500 data rows
    const rows = generarFilas(500, { idLotePrefix: 'ALL', estado: 'PENDIENTE RADICAR' });
    const app = setupEnvironment(rows);

    const resultado = globalThis.obtenerLotesDeComercial(null, 1, 10, '', '');

    // Verify: should read all 500 rows starting from row 2
    const sheet = app._spreadsheet.getSheetByName('Control_General');
    const getRangeCalls = sheet.getCallLog('getRange');

    // ultimaFila = 501 (1 header + 500 data)
    // filasDisponibles = 500, filasALeer = min(500, 2000) = 500
    // filaInicio = 501 - 500 + 1 = 2
    const dataRangeCall = getRangeCalls.find(c =>
      c.args && c.args[0] === 2 && c.args[1] === 1 && c.args[2] === 500 && c.args[3] === 24
    );
    expect(dataRangeCall).toBeDefined();

    // Should have found all 500 lotes
    expect(resultado.total).toBe(500);
  });

  it('con exactamente 2000 filas, lee todas (sin ventaneo innecesario)', () => {
    const rows = generarFilas(2000, { idLotePrefix: 'EXACT', estado: 'RADICADO' });
    const app = setupEnvironment(rows);

    const resultado = globalThis.obtenerLotesDeComercial(null, 1, 10, '', '');

    const sheet = app._spreadsheet.getSheetByName('Control_General');
    const getRangeCalls = sheet.getCallLog('getRange');

    // ultimaFila = 2001, filasDisponibles = 2000, filasALeer = 2000
    // filaInicio = 2001 - 2000 + 1 = 2
    const dataRangeCall = getRangeCalls.find(c =>
      c.args && c.args[0] === 2 && c.args[1] === 1 && c.args[2] === 2000 && c.args[3] === 24
    );
    expect(dataRangeCall).toBeDefined();
    expect(resultado.total).toBe(2000);
  });

  it('paginación funciona correctamente sobre la ventana', () => {
    // 100 distinct lotes in the window
    const rows = generarFilas(100, { idLotePrefix: 'PAG', estado: 'RADICADO' });
    setupEnvironment(rows);

    // Page 1 (10 items)
    const page1 = globalThis.obtenerLotesDeComercial(null, 1, 10, '', '');
    expect(page1.datos.length).toBe(10);
    expect(page1.total).toBe(100);
    expect(page1.pagina).toBe(1);
    expect(page1.totalPaginas).toBe(10);

    // Page 2
    const page2 = globalThis.obtenerLotesDeComercial(null, 2, 10, '', '');
    expect(page2.datos.length).toBe(10);
    expect(page2.pagina).toBe(2);

    // Pages should contain different lotes
    const idsPage1 = page1.datos.map(l => l.idLote);
    const idsPage2 = page2.datos.map(l => l.idLote);
    expect(idsPage1).not.toEqual(idsPage2);
  });

  it('filtro de estado opera sobre la ventana', () => {
    // Mix of states in the last 2000 rows
    const rowsRadicado = generarFilas(50, { idLotePrefix: 'RAD', estado: 'RADICADO' });
    const rowsPendiente = generarFilas(30, { idLotePrefix: 'PEND', estado: 'PENDIENTE RADICAR' });
    setupEnvironment([...rowsRadicado, ...rowsPendiente]);

    const resultado = globalThis.obtenerLotesDeComercial(null, 1, 100, 'PENDIENTE RADICAR', '');

    // Only lotes with PENDIENTE RADICAR state should be returned
    expect(resultado.total).toBe(30);
    for (const lote of resultado.datos) {
      expect(lote.idLote).toMatch(/^PEND-/);
    }
  });

  it('búsqueda por ID opera sobre la ventana', () => {
    const rows = generarFilas(100, { idLotePrefix: 'SEARCH', estado: 'RADICADO' });
    setupEnvironment(rows);

    const resultado = globalThis.obtenerLotesDeComercial(null, 1, 100, '', 'SEARCH-0050');

    expect(resultado.total).toBe(1);
    expect(resultado.datos[0].idLote).toBe('SEARCH-0050');
  });

  it('retorna vacío si hoja tiene solo encabezado', () => {
    setupEnvironment([]);

    const resultado = globalThis.obtenerLotesDeComercial(null, 1, 10, '', '');

    expect(resultado).toEqual({ datos: [], total: 0, pagina: 1, totalPaginas: 0 });
  });

  it('con fechaDesde especificada, lee TODAS las filas (sin ventaneo)', () => {
    // 3000 data rows — normalmente la ventana solo leería las últimas 2000
    const earlyRows = generarFilas(1000, {
      idLotePrefix: 'EARLY',
      estado: 'RADICADO',
      fecha: new Date(2024, 0, 15)
    });
    const lateRows = generarFilas(2000, {
      idLotePrefix: 'LATE',
      estado: 'RADICADO',
      fecha: new Date(2025, 5, 15)
    });
    const allRows = [...earlyRows, ...lateRows];
    const app = setupEnvironment(allRows);

    // Con fechaDesde → lee todo desde fila 2
    const resultado = globalThis.obtenerLotesDeComercial(null, 1, 10, '', '', '2024-01-01', null);

    const sheet = app._spreadsheet.getSheetByName('Control_General');
    const getRangeCalls = sheet.getCallLog('getRange');

    // Debe leer TODAS las filas (3000) desde fila 2
    const dataRangeCall = getRangeCalls.find(c =>
      c.args && c.args[0] === 2 && c.args[1] === 1 && c.args[2] === 3000 && c.args[3] === 24
    );
    expect(dataRangeCall).toBeDefined();
  });

  it('fechaDesde filtra lotes anteriores a la fecha indicada', () => {
    const earlyRows = generarFilas(5, {
      idLotePrefix: 'OLD',
      estado: 'RADICADO',
      fecha: new Date(2024, 0, 10) // Enero 2024
    });
    const lateRows = generarFilas(5, {
      idLotePrefix: 'NEW',
      estado: 'RADICADO',
      fecha: new Date(2025, 5, 10) // Junio 2025
    });
    setupEnvironment([...earlyRows, ...lateRows]);

    // Solo lotes desde Marzo 2025 en adelante
    const resultado = globalThis.obtenerLotesDeComercial(null, 1, 100, '', '', '2025-03-01', null);

    expect(resultado.total).toBe(5);
    for (const lote of resultado.datos) {
      expect(lote.idLote).toMatch(/^NEW-/);
    }
  });

  it('fechaHasta filtra lotes posteriores a la fecha indicada', () => {
    const earlyRows = generarFilas(5, {
      idLotePrefix: 'OLD',
      estado: 'RADICADO',
      fecha: new Date(2024, 0, 10) // Enero 2024
    });
    const lateRows = generarFilas(5, {
      idLotePrefix: 'NEW',
      estado: 'RADICADO',
      fecha: new Date(2025, 5, 10) // Junio 2025
    });
    setupEnvironment([...earlyRows, ...lateRows]);

    // Solo lotes hasta Febrero 2024
    const resultado = globalThis.obtenerLotesDeComercial(null, 1, 100, '', '', null, '2024-02-28');

    expect(resultado.total).toBe(5);
    for (const lote of resultado.datos) {
      expect(lote.idLote).toMatch(/^OLD-/);
    }
  });

  it('fechaDesde + fechaHasta filtra por rango completo', () => {
    const janRows = generarFilas(3, {
      idLotePrefix: 'JAN',
      estado: 'RADICADO',
      fecha: new Date(2024, 0, 15) // Enero 2024
    });
    const marRows = generarFilas(4, {
      idLotePrefix: 'MAR',
      estado: 'RADICADO',
      fecha: new Date(2024, 2, 15) // Marzo 2024
    });
    const junRows = generarFilas(2, {
      idLotePrefix: 'JUN',
      estado: 'RADICADO',
      fecha: new Date(2024, 5, 15) // Junio 2024
    });
    setupEnvironment([...janRows, ...marRows, ...junRows]);

    // Solo lotes entre Feb y Abril 2024
    const resultado = globalThis.obtenerLotesDeComercial(null, 1, 100, '', '', '2024-02-01', '2024-04-30');

    expect(resultado.total).toBe(4);
    for (const lote of resultado.datos) {
      expect(lote.idLote).toMatch(/^MAR-/);
    }
  });

  it('sin fechas, mantiene comportamiento de ventana normal', () => {
    const rows = generarFilas(3000, { idLotePrefix: 'WIN', estado: 'RADICADO' });
    const app = setupEnvironment(rows);

    // Sin fechas → ventana de 2000
    const resultado = globalThis.obtenerLotesDeComercial(null, 1, 10, '', '', null, null);

    const sheet = app._spreadsheet.getSheetByName('Control_General');
    const getRangeCalls = sheet.getCallLog('getRange');

    // Debe aplicar ventana: filaInicio = 3001 - 2000 + 1 = 1002
    const dataRangeCall = getRangeCalls.find(c =>
      c.args && c.args[0] === 1002 && c.args[1] === 1 && c.args[2] === 2000 && c.args[3] === 24
    );
    expect(dataRangeCall).toBeDefined();
  });

  it('lotes con fechas inválidas se omiten del filtrado por fechas', () => {
    const validRows = generarFilas(3, {
      idLotePrefix: 'VALID',
      estado: 'RADICADO',
      fecha: new Date(2024, 5, 15)
    });
    // Create a row with an invalid date
    const invalidRow = generarFila({
      idLote: 'INVALID-0001',
      estado: 'RADICADO',
      fecha: 'not-a-date',
      comercial: 'JUAN PEREZ'
    });
    setupEnvironment([...validRows, invalidRow]);

    const resultado = globalThis.obtenerLotesDeComercial(null, 1, 100, '', '', '2024-01-01', '2024-12-31');

    // Only valid dates should be included
    expect(resultado.total).toBe(3);
    for (const lote of resultado.datos) {
      expect(lote.idLote).toMatch(/^VALID-/);
    }
  });

  it('filtro por comercial funciona con ventana', () => {
    const rowsJuan = generarFilas(30, { idLotePrefix: 'JUAN', comercial: 'JUAN PEREZ', estado: 'RADICADO' });
    const rowsMaria = generarFilas(20, { idLotePrefix: 'MARIA', comercial: 'MARIA GARCIA', estado: 'RADICADO' });
    setupEnvironment([...rowsJuan, ...rowsMaria]);

    // null = all (LIDER/ADMIN) — windowed
    const allResult = globalThis.obtenerLotesDeComercial(null, 1, 100, '', '');
    expect(allResult.total).toBe(50); // 30 + 20

    // For COMERCIAL role: emailComercial is passed
    // The function uses _nombreComercialParaBusqueda(email) → e.g. "maria.garcia@x.com" → "MARIA GARCIA"
    const mariaResult = globalThis.obtenerLotesDeComercial('maria.garcia@company.com', 1, 100, '', '');
    expect(mariaResult.total).toBe(20);
    for (const lote of mariaResult.datos) {
      expect(lote.idLote).toMatch(/^MARIA-/);
    }
  });
});
