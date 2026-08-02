/**
 * Mock de CacheService para testing local.
 *
 * Simula el comportamiento de Google Apps Script CacheService:
 * - Almacenamiento clave-valor en memoria
 * - TTL por entrada (expiración automática)
 * - Límite de 100 KB por valor (lanza excepción al exceder)
 * - getScriptCache() retorna la instancia de caché compartida
 *
 * Uso típico:
 *   import { createCacheService } from '../mocks/cache-service.mock.js';
 *   const cacheService = createCacheService();
 *   globalThis.CacheService = cacheService;
 */

// Límite de CacheService de GAS: 100 KB por valor (100 * 1024 bytes)
const MAX_VALUE_SIZE_BYTES = 100 * 1024;

// ─── MockCache (instancia de caché) ────────────────────────────────────────────

/**
 * Mock de la instancia de Cache (lo que retorna getScriptCache()).
 */
export class MockCache {
  /**
   * @param {object} [options]
   * @param {boolean} [options.throwOnLimit=true] - Si true, lanza al exceder 100KB. Si false, trunca.
   * @param {boolean} [options.simulateUnavailable=false] - Si true, todas las operaciones lanzan error
   */
  constructor(options = {}) {
    this._store = new Map(); // key → { value: string, expiresAt: number|null }
    this._throwOnLimit = options.throwOnLimit !== false;
    this._simulateUnavailable = options.simulateUnavailable || false;
    this._callLog = [];
  }

  /**
   * Obtiene un valor del caché.
   * @param {string} key - Clave a buscar
   * @returns {string|null} - Valor almacenado o null si no existe/expiró
   */
  get(key) {
    this._callLog.push({ method: 'get', key });
    this._checkAvailability();

    const entry = this._store.get(key);
    if (!entry) return null;

    // Verificar expiración
    if (entry.expiresAt !== null && Date.now() > entry.expiresAt) {
      this._store.delete(key);
      return null;
    }

    return entry.value;
  }

  /**
   * Almacena un valor en el caché.
   * @param {string} key - Clave
   * @param {string} value - Valor a almacenar (string, máx 100KB)
   * @param {number} [expirationInSeconds] - TTL en segundos (default: 600s en GAS real)
   * @throws {Error} Si el valor excede 100 KB y throwOnLimit está activo
   */
  put(key, value, expirationInSeconds) {
    this._callLog.push({ method: 'put', key, valueSize: value.length, ttl: expirationInSeconds });
    this._checkAvailability();

    // Verificar límite de 100 KB
    const sizeBytes = new TextEncoder().encode(value).length;
    if (sizeBytes > MAX_VALUE_SIZE_BYTES) {
      if (this._throwOnLimit) {
        throw new Error(
          `CacheService: El valor para la clave "${key}" excede el límite de 100 KB ` +
          `(${(sizeBytes / 1024).toFixed(1)} KB). Máximo permitido: 100 KB por valor.`
        );
      }
      // Si no throw, trunca (modo permisivo para ciertos tests)
      return;
    }

    const ttl = expirationInSeconds || 600; // Default GAS: 600s
    const expiresAt = Date.now() + (ttl * 1000);

    this._store.set(key, { value, expiresAt });
  }

  /**
   * Almacena múltiples valores.
   * @param {Object<string, string>} values - Mapa de clave-valor
   * @param {number} [expirationInSeconds]
   */
  putAll(values, expirationInSeconds) {
    this._callLog.push({ method: 'putAll', keys: Object.keys(values) });
    for (const [key, value] of Object.entries(values)) {
      this.put(key, value, expirationInSeconds);
    }
  }

  /**
   * Elimina una clave del caché.
   * @param {string} key
   */
  remove(key) {
    this._callLog.push({ method: 'remove', key });
    this._checkAvailability();
    this._store.delete(key);
  }

  /**
   * Elimina múltiples claves.
   * @param {string[]} keys
   */
  removeAll(keys) {
    this._callLog.push({ method: 'removeAll', keys });
    this._checkAvailability();
    for (const key of keys) {
      this._store.delete(key);
    }
  }

  /**
   * Obtiene múltiples valores.
   * @param {string[]} keys
   * @returns {Object<string, string|null>}
   */
  getAll(keys) {
    this._callLog.push({ method: 'getAll', keys });
    this._checkAvailability();
    const result = {};
    for (const key of keys) {
      result[key] = this.get(key);
    }
    return result;
  }

  // ─── Métodos de inspección para tests ───────────────────────────────────────

  /**
   * Retorna el número de entradas activas (no expiradas).
   */
  getActiveEntryCount() {
    let count = 0;
    const now = Date.now();
    for (const [, entry] of this._store) {
      if (entry.expiresAt === null || now <= entry.expiresAt) {
        count++;
      }
    }
    return count;
  }

  /**
   * Retorna el log de operaciones para assertions.
   * @param {string} [method] - Filtrar por método
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

  /** Limpia todo el caché (para reset entre tests) */
  clear() {
    this._store.clear();
    this._callLog = [];
  }

  /**
   * Avanza el tiempo simulado para forzar expiración.
   * Modifica los expiresAt de todas las entradas restando ms.
   * @param {number} ms - Milisegundos a "avanzar"
   */
  advanceTime(ms) {
    for (const [key, entry] of this._store) {
      if (entry.expiresAt !== null) {
        entry.expiresAt -= ms;
      }
    }
  }

  /**
   * Activa/desactiva el modo "unavailable" (simula fallo de CacheService).
   */
  setUnavailable(flag) {
    this._simulateUnavailable = flag;
  }

  // ─── Internos ───────────────────────────────────────────────────────────────

  _checkAvailability() {
    if (this._simulateUnavailable) {
      throw new Error('CacheService no está disponible (simulado para test).');
    }
  }
}

// ─── CacheService (Factory) ────────────────────────────────────────────────────

/**
 * Crea un mock de CacheService que simula el comportamiento de GAS.
 *
 * @param {object} [options]
 * @param {boolean} [options.throwOnLimit=true] - Lanzar excepción si se excede 100KB
 * @param {boolean} [options.simulateUnavailable=false] - Simular CacheService caído
 * @returns {object} Mock de CacheService con getScriptCache(), getUserCache(), getDocumentCache()
 *
 * @example
 *   const cacheService = createCacheService();
 *   globalThis.CacheService = cacheService;
 *
 *   const cache = CacheService.getScriptCache();
 *   cache.put('key', 'value', 300);
 *   cache.get('key'); // → 'value'
 *
 * @example
 *   // Simular fallo para tests de degradación elegante
 *   const cacheService = createCacheService({ simulateUnavailable: true });
 *   globalThis.CacheService = cacheService;
 *   // Cualquier operación lanzará excepción
 */
export function createCacheService(options = {}) {
  const scriptCache = new MockCache(options);
  const userCache = new MockCache(options);
  const documentCache = new MockCache(options);

  return {
    getScriptCache() {
      return scriptCache;
    },

    getUserCache() {
      return userCache;
    },

    getDocumentCache() {
      return documentCache;
    },

    /** Acceso directo a las instancias para inspección en tests */
    _scriptCache: scriptCache,
    _userCache: userCache,
    _documentCache: documentCache
  };
}

/** Constante exportada para uso en tests */
export const CACHE_MAX_VALUE_SIZE_BYTES = MAX_VALUE_SIZE_BYTES;

export default createCacheService;
