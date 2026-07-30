/**
 * ============================================================
 * ConfigRepo — Acceso centralizado a configuración del sistema
 *
 * Lee Script Properties una vez por ejecución y cachea en variable
 * global. Nunca hardcodear IDs de hojas en otros archivos.
 * ============================================================
 */

/** @type {Object|null} Cache en memoria (dura solo la ejecución actual) */
var _configCache = null;

/**
 * Obtiene todas las propiedades del script (cacheado en memoria).
 * @returns {Object} Mapa clave-valor de Script Properties
 */
function _obtenerConfig() {
  if (_configCache) return _configCache;
  _configCache = PropertiesService.getScriptProperties().getProperties();
  return _configCache;
}

/**
 * @returns {string} ID del Libro de Control
 */
function getHojaControlId() {
  return _obtenerConfig()['ID_HOJA_CONTROL'] || ID_HOJA_CONTROL;
}

/**
 * @returns {string} ID del Libro de Análisis
 */
function getArchivoAnalisisId() {
  return _obtenerConfig()['ID_ARCHIVO_ANALISIS'] || ID_ARCHIVO_ANALISIS;
}

/**
 * @returns {string} ID de la carpeta raíz en Drive
 */
function getCarpetaRaizId() {
  return _obtenerConfig()['ID_CARPETA_RAIZ'] || ID_CARPETA_RAIZ;
}

/**
 * @returns {boolean} Si el nuevo frontend está activo
 */
function isNuevoFrontendActivo() {
  return _obtenerConfig()['NUEVO_FRONTEND'] === 'true';
}


// ============================================================
//  HELPER: Mapeo de columnas por nombre (fuente única)
// ============================================================

/**
 * Busca el índice (1-based) de una columna por su nombre en los headers.
 * @param {Array} headers - Array de headers (fila 1 de la hoja)
 * @param {string} nombre - Nombre exacto de la columna
 * @returns {number} Índice 1-based, o -1 si no se encuentra
 */
function obtenerIndiceColumna(headers, nombre) {
  for (var i = 0; i < headers.length; i++) {
    if (String(headers[i]).trim() === nombre) return i + 1;
  }
  return -1;
}

/**
 * Busca la columna "ASIGNADA A" con sus variantes de puntos suspensivos.
 * @param {Array} headers
 * @returns {number} Índice 1-based, o -1
 */
function obtenerColAsignadaA(headers) {
  for (var i = 0; i < headers.length; i++) {
    var h = String(headers[i]).trim();
    if (h === 'ASIGNADA A\u2026' || h === 'ASIGNADA A...' || h === 'ASIGNADA A') return i + 1;
  }
  return -1;
}

/**
 * Construye un mapa {nombreColumna: indice1Based} a partir de headers y una lista de nombres deseados.
 * @param {Array} headers
 * @param {Array} nombresDeseados
 * @returns {Object} Mapa nombre→índice
 */
function mapearColumnas(headers, nombresDeseados) {
  var mapa = {};
  for (var i = 0; i < headers.length; i++) {
    var h = String(headers[i]).trim();
    if (nombresDeseados.indexOf(h) !== -1) mapa[h] = i + 1;
  }
  return mapa;
}
