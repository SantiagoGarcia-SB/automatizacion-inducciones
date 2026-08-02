/**
 * Mock de SpreadsheetApp para testing local.
 *
 * Simula la jerarquía: SpreadsheetApp → Spreadsheet → Sheet → Range
 * con datos en memoria configurables por test.
 *
 * Uso típico:
 *   import { createSpreadsheetApp } from '../mocks/spreadsheet-app.mock.js';
 *   const app = createSpreadsheetApp({
 *     'Control_General': { data: [[...], [...]], headers: [...] },
 *     'registro analisis': { data: [[...]], headers: [...] }
 *   });
 *   globalThis.SpreadsheetApp = app;
 */

// ─── Range ─────────────────────────────────────────────────────────────────────

/**
 * Mock de Range — representa un rango de celdas en memoria.
 * @param {any[][]} data - Subset de datos que cubre este rango
 * @param {object} sheet - Referencia a la Sheet padre (para escrituras)
 * @param {number} startRow - Fila de inicio (1-based)
 * @param {number} startCol - Columna de inicio (1-based)
 */
export class MockRange {
  constructor(data, sheet, startRow, startCol) {
    this._data = data;
    this._sheet = sheet;
    this._startRow = startRow;
    this._startCol = startCol;
  }

  /** Retorna los valores del rango como array 2D */
  getValues() {
    this._sheet._callLog.push({ method: 'getValues', range: this._describe() });
    return this._data.map(row => [...row]);
  }

  /** Retorna el valor de la primera celda del rango */
  getValue() {
    this._sheet._callLog.push({ method: 'getValue', range: this._describe() });
    if (this._data.length === 0 || this._data[0].length === 0) return '';
    return this._data[0][0];
  }

  /** Escribe un valor en la primera celda del rango */
  setValue(value) {
    this._sheet._callLog.push({ method: 'setValue', range: this._describe(), value });
    if (this._data.length > 0 && this._data[0].length > 0) {
      this._data[0][0] = value;
      // Reflejar en la data completa de la hoja
      const rowIdx = this._startRow - 1;
      const colIdx = this._startCol - 1;
      if (this._sheet._fullData[rowIdx]) {
        this._sheet._fullData[rowIdx][colIdx] = value;
      }
    }
    return this;
  }

  /** Escribe un array 2D en el rango */
  setValues(values) {
    this._sheet._callLog.push({ method: 'setValues', range: this._describe(), values });
    for (let r = 0; r < values.length; r++) {
      for (let c = 0; c < values[r].length; c++) {
        const rowIdx = this._startRow - 1 + r;
        const colIdx = this._startCol - 1 + c;
        if (this._sheet._fullData[rowIdx]) {
          this._sheet._fullData[rowIdx][colIdx] = values[r][c];
        }
        if (this._data[r]) {
          this._data[r][c] = values[r][c];
        }
      }
    }
    return this;
  }

  /** Retorna el número de fila del inicio del rango (1-based) */
  getRow() {
    return this._startRow;
  }

  /** Retorna el número de columna del inicio del rango (1-based) */
  getColumn() {
    return this._startCol;
  }

  /** Retorna el número de filas del rango */
  getNumRows() {
    return this._data.length;
  }

  /** Retorna el número de columnas del rango */
  getNumColumns() {
    return this._data.length > 0 ? this._data[0].length : 0;
  }

  /** Limpia las validaciones de datos del rango (no-op en mock) */
  clearDataValidations() {
    this._sheet._callLog.push({ method: 'clearDataValidations', range: this._describe() });
    return this;
  }

  _describe() {
    const numRows = this._data.length;
    const numCols = this._data.length > 0 ? this._data[0].length : 0;
    return `R${this._startRow}C${this._startCol}:R${this._startRow + numRows - 1}C${this._startCol + numCols - 1}`;
  }
}

// ─── TextFinder ────────────────────────────────────────────────────────────────

/**
 * Mock de TextFinder — busca texto en la data de la hoja.
 */
export class MockTextFinder {
  constructor(sheet, searchText) {
    this._sheet = sheet;
    this._searchText = searchText;
    this._matchCase = false;
    this._matchEntireCell = false;
  }

  matchCase(flag) {
    this._matchCase = flag;
    return this;
  }

  matchEntireCell(flag) {
    this._matchEntireCell = flag;
    return this;
  }

  /** Retorna el primer Range que contiene el texto buscado, o null */
  findNext() {
    this._sheet._callLog.push({ method: 'TextFinder.findNext', searchText: this._searchText });
    for (let r = 0; r < this._sheet._fullData.length; r++) {
      for (let c = 0; c < this._sheet._fullData[r].length; c++) {
        const cellValue = String(this._sheet._fullData[r][c]);
        if (this._matches(cellValue)) {
          const rangeData = [this._sheet._fullData[r].slice(c, c + 1)];
          return new MockRange(rangeData, this._sheet, r + 1, c + 1);
        }
      }
    }
    return null;
  }

  /** Retorna todos los Range que contienen el texto buscado */
  findAll() {
    this._sheet._callLog.push({ method: 'TextFinder.findAll', searchText: this._searchText });
    const results = [];
    for (let r = 0; r < this._sheet._fullData.length; r++) {
      for (let c = 0; c < this._sheet._fullData[r].length; c++) {
        const cellValue = String(this._sheet._fullData[r][c]);
        if (this._matches(cellValue)) {
          const rangeData = [this._sheet._fullData[r].slice(c, c + 1)];
          results.push(new MockRange(rangeData, this._sheet, r + 1, c + 1));
        }
      }
    }
    return results;
  }

  _matches(cellValue) {
    const search = this._matchCase ? this._searchText : this._searchText.toLowerCase();
    const value = this._matchCase ? cellValue : cellValue.toLowerCase();
    if (this._matchEntireCell) {
      return value === search;
    }
    return value.includes(search);
  }
}

// ─── Sheet ─────────────────────────────────────────────────────────────────────

/**
 * Mock de Sheet — hoja de cálculo en memoria.
 */
export class MockSheet {
  /**
   * @param {string} name - Nombre de la hoja
   * @param {any[][]} data - Array 2D con todos los datos (fila 0 = headers si aplica)
   */
  constructor(name, data = []) {
    this._name = name;
    this._fullData = data.map(row => [...row]);
    this._callLog = [];
  }

  getName() {
    return this._name;
  }

  /** Retorna la última fila con contenido (1-based) */
  getLastRow() {
    this._callLog.push({ method: 'getLastRow' });
    return this._fullData.length;
  }

  /** Retorna la última columna con contenido (1-based) */
  getLastColumn() {
    this._callLog.push({ method: 'getLastColumn' });
    if (this._fullData.length === 0) return 0;
    return Math.max(...this._fullData.map(row => row.length));
  }

  /**
   * Obtiene un Range de la hoja.
   * Soporta firmas:
   *   getRange(row, col)
   *   getRange(row, col, numRows)
   *   getRange(row, col, numRows, numCols)
   *   getRange('A1:Z100') — notación A1 simplificada
   */
  getRange(rowOrNotation, col, numRows, numCols) {
    this._callLog.push({
      method: 'getRange',
      args: [rowOrNotation, col, numRows, numCols].filter(a => a !== undefined)
    });

    // Notación A1 simplificada (para cobertura básica)
    if (typeof rowOrNotation === 'string') {
      return this._getRangeByNotation(rowOrNotation);
    }

    const startRow = rowOrNotation;
    const startCol = col || 1;
    const rows = numRows || 1;
    const cols = numCols || (this._fullData.length > 0 ? this._fullData[0].length : 1);

    const data = [];
    for (let r = 0; r < rows; r++) {
      const rowIdx = startRow - 1 + r;
      if (rowIdx >= 0 && rowIdx < this._fullData.length) {
        const rowData = [];
        for (let c = 0; c < cols; c++) {
          const colIdx = startCol - 1 + c;
          rowData.push(
            colIdx < this._fullData[rowIdx].length ? this._fullData[rowIdx][colIdx] : ''
          );
        }
        data.push(rowData);
      } else {
        data.push(new Array(cols).fill(''));
      }
    }

    return new MockRange(data, this, startRow, startCol);
  }

  /** Retorna un Range que cubre toda la data de la hoja */
  getDataRange() {
    this._callLog.push({ method: 'getDataRange' });
    const lastRow = this._fullData.length;
    const lastCol = this.getLastColumn();
    if (lastRow === 0) {
      return new MockRange([], this, 1, 1);
    }
    return this.getRange(1, 1, lastRow, lastCol);
  }

  /** Crea un TextFinder para buscar texto en la hoja */
  createTextFinder(searchText) {
    this._callLog.push({ method: 'createTextFinder', searchText });
    return new MockTextFinder(this, searchText);
  }

  /** Agrega una fila al final de la hoja */
  appendRow(values) {
    this._callLog.push({ method: 'appendRow', values });
    this._fullData.push([...values]);
    return this;
  }

  /** Inserta filas vacías después de una posición */
  insertRowsAfter(afterRow, howMany) {
    this._callLog.push({ method: 'insertRowsAfter', afterRow, howMany });
    const emptyRows = Array.from({ length: howMany }, () =>
      new Array(this.getLastColumn() || 1).fill('')
    );
    this._fullData.splice(afterRow, 0, ...emptyRows);
    return this;
  }

  /**
   * Obtiene el log de llamadas para assertions en tests.
   * @param {string} [method] - Filtrar por método específico
   */
  getCallLog(method) {
    if (method) {
      return this._callLog.filter(entry => entry.method === method);
    }
    return [...this._callLog];
  }

  /** Resetea el log de llamadas */
  resetCallLog() {
    this._callLog = [];
  }

  // ─── Helpers privados ─────────────────────────────────────────────────────

  _getRangeByNotation(notation) {
    // Soporte básico para notación tipo "A1:C10"
    // Para tests que usan notación simple
    const fullData = this._fullData;
    return new MockRange(
      fullData.map(row => [...row]),
      this,
      1,
      1
    );
  }
}

// ─── Spreadsheet ───────────────────────────────────────────────────────────────

/**
 * Mock de Spreadsheet — contiene múltiples hojas.
 */
export class MockSpreadsheet {
  /**
   * @param {Object<string, any[][]>} sheetsConfig - { nombreHoja: datosArray2D }
   */
  constructor(sheetsConfig = {}) {
    this._sheets = {};
    for (const [name, data] of Object.entries(sheetsConfig)) {
      this._sheets[name] = new MockSheet(name, data);
    }
  }

  getSheetByName(name) {
    return this._sheets[name] || null;
  }

  getSheets() {
    return Object.values(this._sheets);
  }

  /** Agrega una hoja en runtime (para tests de setup) */
  insertSheet(name) {
    this._sheets[name] = new MockSheet(name, []);
    return this._sheets[name];
  }
}

// ─── SpreadsheetApp (Factory) ──────────────────────────────────────────────────

/**
 * Crea un mock de SpreadsheetApp con hojas pre-configuradas.
 *
 * @param {Object<string, any[][]>} sheetsConfig - Mapa de nombre de hoja → datos 2D
 * @param {Object} [options] - Opciones adicionales
 * @param {string} [options.id] - ID del spreadsheet (para openById)
 * @returns {object} Mock de SpreadsheetApp
 *
 * @example
 *   const app = createSpreadsheetApp({
 *     'Control_General': [
 *       ['col1', 'col2', ...],  // headers
 *       ['val1', 'val2', ...],  // fila 2
 *     ],
 *     'registro analisis': [...]
 *   });
 *   globalThis.SpreadsheetApp = app;
 */
export function createSpreadsheetApp(sheetsConfig = {}, options = {}) {
  const spreadsheet = new MockSpreadsheet(sheetsConfig);
  const spreadsheetId = options.id || 'mock-spreadsheet-id';

  return {
    openById(id) {
      return spreadsheet;
    },

    getActiveSpreadsheet() {
      return spreadsheet;
    },

    getActive() {
      return spreadsheet;
    },

    /** Acceso directo al MockSpreadsheet para inspección en tests */
    _spreadsheet: spreadsheet,
    _id: spreadsheetId
  };
}

export default createSpreadsheetApp;
