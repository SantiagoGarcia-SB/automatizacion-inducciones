/**
 * ============================================================
 * SERVICIOS_CACHEWRAPPER.JS — Caché servidor con fragmentación automática
 * El Libertador - Ingreso de Inducciones
 *
 * Capa sobre CacheService que maneja:
 *   - Serialización/deserialización JSON transparente
 *   - Fragmentación automática para payloads > 99 KB
 *   - Reconstrucción transparente al leer
 *   - Degradación elegante ante fallos de CacheService
 *
 * Interfaz pública:
 *   CacheWrapper_getJSON(key): Object|null
 *   CacheWrapper_putJSON(key, obj, ttlSegundos): void
 *   CacheWrapper_remove(key): void
 *
 * Reglas de fragmentación:
 *   - JSON < 99 KB → 1 clave directa
 *   - JSON 99-500 KB → fragmentar en claves key_PART_01, key_PART_02...
 *     con header key → {"_parts": N}
 *   - JSON > 500 KB → no cachear, log WARN
 * ============================================================
 */

// ─── Constantes ────────────────────────────────────────────────────────────────

/** Tamaño máximo por fragmento (99 KB en caracteres) */
var CACHE_CHUNK_SIZE = 99000;

/** Tamaño máximo total para fragmentación (500 KB en caracteres) */
var CACHE_MAX_TOTAL_SIZE = 500000;

// ─── Funciones públicas ────────────────────────────────────────────────────────

/**
 * Lee un valor JSON del CacheService, reconstruyendo fragmentos si es necesario.
 *
 * @param {string} key — Clave del caché
 * @returns {Object|null} — Objeto parseado o null si no hay datos/cache-miss
 */
function CacheWrapper_getJSON(key) {
  try {
    var cache = CacheService.getScriptCache();
    var raw = cache.get(key);

    if (raw === null || raw === undefined) {
      return null;
    }

    // Detectar si es un header de fragmentación
    if (_esCacheHeader_(raw)) {
      return _reconstruirFragmentos_(cache, key, raw);
    }

    // Valor simple, parsear directamente
    return JSON.parse(raw);
  } catch (e) {
    // Cualquier error → tratar como cache-miss
    console.warn('CacheWrapper_getJSON: error leyendo clave "' + key + '": ' + e.message);
    return null;
  }
}

/**
 * Almacena un objeto como JSON en CacheService con fragmentación automática.
 *
 * @param {string} key — Clave del caché
 * @param {*} obj — Objeto a serializar y almacenar
 * @param {number} [ttlSegundos=600] — TTL en segundos (default: 600s)
 */
function CacheWrapper_putJSON(key, obj, ttlSegundos) {
  var ttl = ttlSegundos || 600;

  try {
    var json = JSON.stringify(obj);
    var size = json.length;

    // Payload > 500 KB → no cachear, log WARN
    if (size > CACHE_MAX_TOTAL_SIZE) {
      console.warn(
        'CacheWrapper_putJSON: payload para "' + key + '" excede 500 KB (' +
        Math.round(size / 1024) + ' KB). No se almacena en caché.'
      );
      return;
    }

    var cache = CacheService.getScriptCache();

    // Payload < 99 KB → almacenar directamente
    if (size < CACHE_CHUNK_SIZE) {
      cache.put(key, json, ttl);
      return;
    }

    // Payload 99-500 KB → fragmentar
    _almacenarFragmentado_(cache, key, json, ttl);

  } catch (e) {
    // Error en CacheService.put() → omitir y continuar
    console.warn('CacheWrapper_putJSON: error almacenando clave "' + key + '": ' + e.message);
  }
}

/**
 * Elimina una clave del CacheService y sus fragmentos asociados.
 *
 * @param {string} key — Clave a eliminar
 */
function CacheWrapper_remove(key) {
  try {
    var cache = CacheService.getScriptCache();
    var raw = cache.get(key);

    if (raw !== null && raw !== undefined && _esCacheHeader_(raw)) {
      // Eliminar fragmentos
      var header = JSON.parse(raw);
      var parts = header._parts;
      var keysToRemove = [key];

      for (var i = 1; i <= parts; i++) {
        keysToRemove.push(key + '_PART_' + _padNumber_(i));
      }

      cache.removeAll(keysToRemove);
    } else {
      cache.remove(key);
    }
  } catch (e) {
    // Error al eliminar → omitir silenciosamente
    console.warn('CacheWrapper_remove: error eliminando clave "' + key + '": ' + e.message);
  }
}

// ─── Funciones internas ────────────────────────────────────────────────────────

/**
 * Verifica si un valor raw del caché es un header de fragmentación.
 * @param {string} raw — Valor leído del caché
 * @returns {boolean}
 */
function _esCacheHeader_(raw) {
  return raw.indexOf('{"_parts":') === 0;
}

/**
 * Reconstruye un valor fragmentado leyendo N partes del caché.
 * @param {Object} cache — Instancia de ScriptCache
 * @param {string} key — Clave base
 * @param {string} headerRaw — Valor del header (JSON con _parts)
 * @returns {Object|null} — Objeto reconstruido o null si falta algún fragmento
 */
function _reconstruirFragmentos_(cache, key, headerRaw) {
  var header = JSON.parse(headerRaw);
  var parts = header._parts;
  var chunks = [];

  for (var i = 1; i <= parts; i++) {
    var partKey = key + '_PART_' + _padNumber_(i);
    var chunk = cache.get(partKey);

    if (chunk === null || chunk === undefined) {
      // Fragmento faltante → cache-miss
      return null;
    }

    chunks.push(chunk);
  }

  var fullJson = chunks.join('');
  return JSON.parse(fullJson);
}

/**
 * Almacena un JSON grande fragmentado en CacheService.
 * @param {Object} cache — Instancia de ScriptCache
 * @param {string} key — Clave base
 * @param {string} json — String JSON completo
 * @param {number} ttl — TTL en segundos
 */
function _almacenarFragmentado_(cache, key, json, ttl) {
  var totalParts = Math.ceil(json.length / CACHE_CHUNK_SIZE);

  // Almacenar header
  cache.put(key, JSON.stringify({ _parts: totalParts }), ttl);

  // Almacenar fragmentos
  for (var i = 0; i < totalParts; i++) {
    var start = i * CACHE_CHUNK_SIZE;
    var chunk = json.substring(start, start + CACHE_CHUNK_SIZE);
    var partKey = key + '_PART_' + _padNumber_(i + 1);

    cache.put(partKey, chunk, ttl);
  }
}

/**
 * Formatea un número a 2 dígitos con cero inicial.
 * @param {number} n
 * @returns {string} — Ej: "01", "02", "12"
 */
function _padNumber_(n) {
  return n < 10 ? '0' + n : '' + n;
}
