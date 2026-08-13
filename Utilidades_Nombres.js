/**
 * Utilidades_Nombres.js
 *
 * Función canónica de conversión email-a-nombre.
 * Reemplaza: _correoANombre, _correoANombreCompleto, obtenerNombreDeComercial,
 *            obtenerNombreCompletoDeComercial, _derivarNombreDeEmail,
 *            _nombreComercialParaBusqueda.
 *
 * @fileoverview Módulo único de resolución de nombre a partir de email.
 */

/** @enum {string} Formatos de nombre soportados */
var FORMATO_NOMBRE = {
  COMPLETO: 'COMPLETO',
  MAYUSCULAS: 'MAYUSCULAS',
  PRIMER_NOMBRE: 'PRIMER_NOMBRE'
};

/**
 * Convierte un email a nombre derivado de la parte local.
 *
 * Lógica:
 *  1. Valida que el input sea un string no vacío con exactamente un "@".
 *  2. Extrae la parte local (antes de @).
 *  3. Separa por punto, descarta segmentos vacíos tras trim.
 *  4. Capitaliza según el formato solicitado.
 *
 * @param {string} email — Email a convertir
 * @param {'COMPLETO'|'MAYUSCULAS'|'PRIMER_NOMBRE'} formato
 *   - COMPLETO: "Maria Garcia" (cada palabra con inicial mayúscula, resto minúscula)
 *   - MAYUSCULAS: "MARIA GARCIA" (todo mayúsculas)
 *   - PRIMER_NOMBRE: "Maria" (solo primera palabra capitalizada)
 * @returns {string} Nombre derivado, o "" si email es inválido
 */
function emailANombre(email, formato) {
  // Validar input: debe ser string no vacío con al menos un "@"
  if (!email || typeof email !== 'string') {
    return '';
  }

  var trimmed = email.trim();
  if (trimmed === '') {
    return '';
  }

  // Debe contener exactamente un "@"
  var arrobas = trimmed.split('@');
  if (arrobas.length !== 2) {
    return '';
  }

  var parteLocal = arrobas[0];

  // Separar por punto y descartar segmentos vacíos tras trim
  var segmentos = parteLocal.split('.');
  var segmentosValidos = [];
  for (var i = 0; i < segmentos.length; i++) {
    var seg = segmentos[i].trim();
    if (seg.length > 0) {
      segmentosValidos.push(seg);
    }
  }

  // Si no hay segmentos válidos (parte local solo tiene puntos), retornar vacío
  if (segmentosValidos.length === 0) {
    return '';
  }

  // Aplicar formato
  switch (formato) {
    case FORMATO_NOMBRE.COMPLETO:
      return segmentosValidos
        .map(function(s) {
          return s.charAt(0).toUpperCase() + s.slice(1).toLowerCase();
        })
        .join(' ');

    case FORMATO_NOMBRE.MAYUSCULAS:
      return segmentosValidos
        .map(function(s) {
          return s.charAt(0).toUpperCase() + s.slice(1).toLowerCase();
        })
        .join(' ')
        .toUpperCase();

    case FORMATO_NOMBRE.PRIMER_NOMBRE:
      var primero = segmentosValidos[0];
      return primero.charAt(0).toUpperCase() + primero.slice(1).toLowerCase();

    default:
      // Formato no reconocido: tratar como COMPLETO
      return segmentosValidos
        .map(function(s) {
          return s.charAt(0).toUpperCase() + s.slice(1).toLowerCase();
        })
        .join(' ');
  }
}
