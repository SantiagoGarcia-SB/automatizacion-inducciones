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
