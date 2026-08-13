/**
 * ============================================================
 * INFRAESTRUCTURA_MEMOCACHE.JS — Memoización de variables de ejecución
 *
 * Variables globales que cachean datos frecuentemente consultados
 * durante la vida de una ejecución del script. Cada ejecución
 * (google.script.run o trigger) es un isolate V8 independiente,
 * por lo que las variables se limpian automáticamente al finalizar.
 *
 * Funciones expuestas:
 *   - MemoCache_getSessionEmail()
 *   - MemoCache_getUsuarios()
 *   - MemoCache_getIndiceUuid(datosControlGeneral)
 *   - MemoCache_getIndiceLote(datosControlGeneral)
 *
 * @see Requirement 2: Consolidar funciones de lectura de usuarios
 * @see Requirement 9: Consolidar lógica de verificación de roles y sesión
 * @see Requirement 10: Reducir llamadas redundantes a TextFinder
 * ============================================================
 */

/** @type {string|null} Email de la sesión actual (se resuelve 1 vez por ejecución) */
// eslint-disable-next-line no-var
var _sessionEmail = null;

/** @type {Array|null} Datos completos de USUARIOS (leerTodos memoizado) */
// eslint-disable-next-line no-var
var _cacheUsuariosTodos = null;

/** @type {Object|null} Mapa uuid → filaNum de Control_General */
// eslint-disable-next-line no-var
var _indiceUuidFila = null;

/** @type {Object|null} Mapa idLote → [filaNum] de Control_General */
// eslint-disable-next-line no-var
var _indiceLoteFila = null;


/**
 * Obtiene el email de la sesión activa (memoizado).
 * Session.getActiveUser().getEmail() se invoca como máximo 1 vez por ejecución.
 *
 * @returns {string} Email normalizado a minúsculas
 * @sheets_read 0
 */
function MemoCache_getSessionEmail() {
  if (_sessionEmail !== null) {
    return _sessionEmail;
  }

  var email = Session.getActiveUser().getEmail();
  _sessionEmail = String(email || '').toLowerCase().trim();
  return _sessionEmail;
}


/**
 * Obtiene todos los usuarios (memoizado). Lee la pestaña USUARIOS una sola vez
 * por ejecución del script. Las invocaciones subsiguientes retornan el resultado
 * cacheado en memoria.
 *
 * Usa SpreadsheetRegistry_get() para acceder al libro de control sin abrirlo
 * de nuevo si ya fue abierto en esta ejecución.
 *
 * @returns {UsuarioRecord[]} Array de usuarios, o array vacío si la pestaña no existe
 * @sheets_read 0-1 (0 en cache-hit de ejecución, 1 la primera vez)
 */
function MemoCache_getUsuarios() {
  if (_cacheUsuariosTodos !== null) {
    return _cacheUsuariosTodos;
  }

  var hojaId = getHojaControlId();
  var ss = SpreadsheetRegistry_get(hojaId);
  var hoja = ss.getSheetByName('USUARIOS');

  if (!hoja) {
    _registrarEvento_('WARN', 'Infraestructura_MemoCache.js', 'Pestaña USUARIOS no encontrada', '');
    _cacheUsuariosTodos = [];
    return _cacheUsuariosTodos;
  }

  var datos = hoja.getDataRange().getValues();
  if (datos.length < 2) {
    _cacheUsuariosTodos = [];
    return _cacheUsuariosTodos;
  }

  var resultado = [];
  for (var i = 1; i < datos.length; i++) {
    var fila = datos[i];
    var emailPrimario = String(fila[COL_EMAIL] || '').toLowerCase().trim();
    if (!emailPrimario) continue;

    var rolRaw = String(fila[COL_ROL] || '').toUpperCase().trim();
    var activoRaw = fila[COL_ACTIVO];
    var activo = (activoRaw === true || activoRaw === 'TRUE' || activoRaw === 'true');
    var cupo = Number(fila[COL_CUPO]) || 0;
    var emailDirector = String(fila[COL_EMAIL_DIRECTOR] || '').toLowerCase().trim();
    var emailGerente = String(fila[COL_EMAIL_GERENTE] || '').toLowerCase().trim();

    // Parsear EMAILS_ALTERNOS: separar por coma, normalizar, eliminar vacíos
    var emailsAlternosRaw = String(fila[COL_EMAILS_ALTERNOS] || '').trim();
    var emailsAlternos = [];
    if (emailsAlternosRaw) {
      var partes = emailsAlternosRaw.split(',');
      for (var j = 0; j < partes.length; j++) {
        var alterno = partes[j].toLowerCase().trim();
        if (alterno) {
          emailsAlternos.push(alterno);
        }
      }
    }

    resultado.push({
      email: emailPrimario,
      rol: rolRaw,
      activo: activo,
      cupo: cupo,
      emailDirector: emailDirector,
      emailGerente: emailGerente,
      emailsAlternos: emailsAlternos
    });
  }

  _cacheUsuariosTodos = resultado;
  return _cacheUsuariosTodos;
}


/**
 * Obtiene o construye el índice UUID → filaNum desde los datos de Control_General.
 * El UUID se encuentra en la columna BJ (índice 61, 0-based).
 * El número de fila retornado es 1-based (índice + 2 para compensar encabezados en fila 1).
 *
 * Si el índice ya fue construido en esta ejecución, se retorna el cacheado.
 * Si se pasan nuevos datos, se reconstruye el índice.
 *
 * @param {Array} datosControlGeneral — Datos ya leídos de Control_General (incluye encabezados en [0])
 * @returns {Object<string, number>} Mapa UUID → número de fila (1-based en la hoja)
 * @sheets_read 0
 */
function MemoCache_getIndiceUuid(datosControlGeneral) {
  if (_indiceUuidFila !== null && !datosControlGeneral) {
    return _indiceUuidFila;
  }

  var COL_UUID = 61; // Columna BJ (0-based)
  var indice = {};

  if (datosControlGeneral && datosControlGeneral.length > 1) {
    for (var i = 1; i < datosControlGeneral.length; i++) {
      var uuid = String(datosControlGeneral[i][COL_UUID] || '').trim();
      if (uuid) {
        // filaNum = índice + 2 (fila 1 es encabezado, datos empiezan en fila 2)
        indice[uuid] = i + 1;
      }
    }
  }

  _indiceUuidFila = indice;
  return _indiceUuidFila;
}


/**
 * Obtiene o construye el índice idLote → [filaNum] desde los datos de Control_General.
 * El ID de lote se encuentra en la columna A (índice 0, 0-based).
 * El número de fila retornado es 1-based (índice + 2 para compensar encabezados en fila 1).
 *
 * Un mismo ID de lote puede tener múltiples filas (solicitudes del mismo lote).
 *
 * Si el índice ya fue construido en esta ejecución, se retorna el cacheado.
 * Si se pasan nuevos datos, se reconstruye el índice.
 *
 * @param {Array} datosControlGeneral — Datos ya leídos de Control_General (incluye encabezados en [0])
 * @returns {Object<string, number[]>} Mapa idLote → array de números de fila (1-based)
 * @sheets_read 0
 */
function MemoCache_getIndiceLote(datosControlGeneral) {
  if (_indiceLoteFila !== null && !datosControlGeneral) {
    return _indiceLoteFila;
  }

  var COL_LOTE = 0; // Columna A (0-based)
  var indice = {};

  if (datosControlGeneral && datosControlGeneral.length > 1) {
    for (var i = 1; i < datosControlGeneral.length; i++) {
      var idLote = String(datosControlGeneral[i][COL_LOTE] || '').trim();
      if (idLote) {
        // filaNum = índice + 2 (fila 1 es encabezado, datos empiezan en fila 2)
        var filaNum = i + 1;
        if (!indice[idLote]) {
          indice[idLote] = [filaNum];
        } else {
          indice[idLote].push(filaNum);
        }
      }
    }
  }

  _indiceLoteFila = indice;
  return _indiceLoteFila;
}
