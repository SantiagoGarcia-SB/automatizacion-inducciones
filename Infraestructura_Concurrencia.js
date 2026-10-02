/**
 * ============================================================
 * Infraestructura_Concurrencia — buenas prácticas para no pisarse
 *
 * Problema: LockService.getScriptLock() es UN SOLO lock para todo el proyecto.
 * Si una función lo retiene mientras genera PDF, envía correos o llama a
 * Gemini/Drive, todas las demás (radicar, pedir solicitud, onEdit, botones)
 * esperan o fallan.
 *
 * Reglas:
 *  1. Nunca retener el lock global durante trabajo lento (PDF, correo, Drive,
 *     UrlFetch, recorridos largos de hojas).
 *  2. Para "que no corran dos a la vez" usar un PRÉSTAMO (Lease): el lock
 *     global se toma solo unos milisegundos para anotar quién es el dueño y
 *     hasta cuándo; el trabajo se hace SIN lock. Si el dueño falla, el
 *     préstamo vence solo (ttl).
 *  3. Los onEdit que escriben celdas propias no necesitan lock.
 *  4. Crear columnas al final de una hoja sí es una sección crítica
 *     (dos creadores simultáneos escribirían el mismo encabezado):
 *     usar Columnas_asegurar_, que solo toma el lock si falta alguna.
 * ============================================================
 */

var LEASE_PREFIJO_ = 'LEASE_';
var LEASE_ESPERA_LOCK_MS_ = 5000;

/**
 * Intenta tomar el préstamo `nombre` por `ttlMs`.
 * @param {string} nombre
 * @param {number} ttlMs Vigencia máxima; vence solo si el dueño no lo libera.
 * @returns {string|null} Token del dueño, o null si otro lo tiene vigente.
 */
function Lease_adquirir(nombre, ttlMs) {
  var lock = LockService.getScriptLock();
  if (!lock.tryLock(LEASE_ESPERA_LOCK_MS_)) return null;
  try {
    var props = PropertiesService.getScriptProperties();
    var clave = LEASE_PREFIJO_ + nombre;
    var ahora = Date.now();

    var actual = props.getProperty(clave);
    if (actual) {
      try {
        var o = JSON.parse(actual);
        if (o && o.hasta > ahora) return null; // otro lo tiene vigente
      } catch (e) { /* valor corrupto: se pisa */ }
    }

    var token = Utilities.getUuid();
    props.setProperty(clave, JSON.stringify({ token: token, hasta: ahora + ttlMs }));
    return token;
  } finally {
    lock.releaseLock();
  }
}

/**
 * Libera el préstamo solo si el token coincide (no libera el de otro).
 * Nunca lanza.
 * @param {string} nombre
 * @param {string|null} token
 */
function Lease_liberar(nombre, token) {
  if (!token) return;
  var lock = LockService.getScriptLock();
  var tomado = false;
  try {
    tomado = lock.tryLock(LEASE_ESPERA_LOCK_MS_);
    var props = PropertiesService.getScriptProperties();
    var clave = LEASE_PREFIJO_ + nombre;
    var actual = props.getProperty(clave);
    if (!actual) return;
    var o = JSON.parse(actual);
    if (o && o.token === token) props.deleteProperty(clave);
  } catch (e) {
    /* si falla, el préstamo vence solo por ttl */
  } finally {
    if (tomado) lock.releaseLock();
  }
}

// ============================================================
//  COLUMNAS AL FINAL DE UNA HOJA
// ============================================================

/** Clave de encabezado: sin tildes ni signos ("F.H Asignación" → "FHASIGNACION"). */
function Columnas_clave_(valor) {
  return String(valor === undefined || valor === null ? '' : valor)
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, '');
}

/** Índice 1-based de una columna por encabezado, 0 si no existe. */
function Columnas_buscar_(encabezados, nombre) {
  var objetivo = Columnas_clave_(nombre);
  for (var i = 0; i < encabezados.length; i++) {
    if (Columnas_clave_(encabezados[i]) === objetivo) return i + 1;
  }
  return 0;
}

/**
 * Garantiza que existan las columnas `nombres` en la fila 1 de `hoja`,
 * agregando al final las que falten. Camino rápido sin lock cuando ya existen;
 * si falta alguna toma el lock global solo para crearlas (y vuelve a comprobar
 * dentro, por si otro la creó mientras tanto).
 *
 * @param {GoogleAppsScript.Spreadsheet.Sheet} hoja
 * @param {string[]} nombres
 * @returns {Object} Mapa nombre → índice de columna (1-based).
 * @throws {Error} Si no se consigue el lock para crear.
 */
function Columnas_asegurar_(hoja, nombres) {
  var leer = function () {
    var ultima = hoja.getLastColumn();
    return ultima ? hoja.getRange(1, 1, 1, ultima).getValues()[0] : [];
  };
  var resolver = function (enc) {
    var mapa = {};
    var faltan = [];
    nombres.forEach(function (n) {
      var c = Columnas_buscar_(enc, n);
      if (c) mapa[n] = c; else faltan.push(n);
    });
    return { mapa: mapa, faltan: faltan };
  };

  var r = resolver(leer());
  if (!r.faltan.length) return r.mapa;

  var lock = LockService.getScriptLock();
  if (!lock.tryLock(15000)) {
    throw new Error('No se pudo reservar la creación de columnas en ' + hoja.getName());
  }
  try {
    var enc = leer();
    r = resolver(enc);
    if (r.faltan.length) {
      var ultima = hoja.getLastColumn();
      var maxCols = typeof hoja.getMaxColumns === 'function' ? hoja.getMaxColumns() : Infinity;
      var necesarias = ultima + r.faltan.length;
      if (necesarias > maxCols) hoja.insertColumnsAfter(maxCols, necesarias - maxCols);

      hoja.getRange(1, ultima + 1, 1, r.faltan.length).setValues([r.faltan]);
      r.faltan.forEach(function (n, i) { r.mapa[n] = ultima + 1 + i; });
    }
    return r.mapa;
  } finally {
    lock.releaseLock();
  }
}
