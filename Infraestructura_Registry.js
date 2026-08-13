/**
 * ============================================================
 * INFRAESTRUCTURA_REGISTRY.JS — Registro centralizado de instancias de Spreadsheet
 *
 * Garantiza que cada libro de cálculo se abra una sola vez por ejecución
 * del script (una invocación vía google.script.run o trigger).
 *
 * Almacena como máximo 2 instancias (ID_HOJA_CONTROL, ID_ARCHIVO_ANALISIS).
 * Se limpia automáticamente al terminar la ejecución (isolate V8).
 *
 * @see Requirement 1: Consolidar apertura repetida de libros de cálculo
 * ============================================================
 */

/** @type {Object<string, GoogleAppsScript.Spreadsheet.Spreadsheet>} */
// eslint-disable-next-line no-var
var _spreadsheetRegistry = {};

/**
 * Obtiene una instancia de Spreadsheet, abriendo el libro solo si no está
 * en el registro. Si openById lanza excepción, la propaga sin almacenar null.
 *
 * @param {string} spreadsheetId — ID del libro de cálculo
 * @returns {GoogleAppsScript.Spreadsheet.Spreadsheet}
 * @throws {Error} Si openById falla (ID inválido, permisos insuficientes)
 * @sheets_read 0-1 (0 si ya abierto, 1 la primera vez)
 */
function SpreadsheetRegistry_get(spreadsheetId) {
  if (_spreadsheetRegistry[spreadsheetId]) {
    return _spreadsheetRegistry[spreadsheetId];
  }

  // openById puede lanzar excepción — se propaga sin almacenar null
  var ss = SpreadsheetApp.openById(spreadsheetId);
  _spreadsheetRegistry[spreadsheetId] = ss;
  return ss;
}

/**
 * Verifica si un libro ya fue abierto en esta ejecución.
 *
 * @param {string} spreadsheetId — ID del libro de cálculo
 * @returns {boolean} true si el libro ya está en el registro
 */
function SpreadsheetRegistry_has(spreadsheetId) {
  return !!_spreadsheetRegistry[spreadsheetId];
}
