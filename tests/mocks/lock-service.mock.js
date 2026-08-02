/**
 * Mock de LockService para testing local.
 *
 * Simula el comportamiento de Google Apps Script LockService:
 * - getScriptLock() / getDocumentLock() / getUserLock()
 * - tryLock(timeoutMs) — intenta adquirir el lock
 * - releaseLock() — libera el lock
 * - hasLock() — verifica si el lock está adquirido
 * - waitLock(timeoutMs) — bloquea hasta adquirir o timeout
 *
 * Soporta simulación de contención (lock ya adquirido por otro proceso).
 *
 * Uso típico:
 *   import { createLockService } from '../mocks/lock-service.mock.js';
 *   const lockService = createLockService();
 *   globalThis.LockService = lockService;
 */

// ─── MockLock ──────────────────────────────────────────────────────────────────

/**
 * Mock de Lock — un candado distribuido en memoria.
 */
export class MockLock {
  /**
   * @param {object} [options]
   * @param {boolean} [options.simulateContention=false] - Si true, tryLock siempre falla (simula lock tomado por otro)
   * @param {number} [options.contentionReleaseAfterMs=0] - Si > 0, la contención se libera después de N ms
   */
  constructor(options = {}) {
    this._locked = false;
    this._simulateContention = options.simulateContention || false;
    this._contentionReleaseAfterMs = options.contentionReleaseAfterMs || 0;
    this._contentionStartTime = options.simulateContention ? Date.now() : null;
    this._callLog = [];
  }

  /**
   * Intenta adquirir el lock dentro del timeout.
   * @param {number} timeoutInMillis - Tiempo máximo de espera (ms)
   * @returns {boolean} true si se adquirió, false si no se pudo
   */
  tryLock(timeoutInMillis) {
    this._callLog.push({ method: 'tryLock', timeout: timeoutInMillis, timestamp: Date.now() });

    if (this._locked) {
      // Lock ya tomado por esta misma instancia (re-entrant no soportado en GAS)
      return false;
    }

    if (this._isContended()) {
      return false;
    }

    this._locked = true;
    return true;
  }

  /**
   * Espera hasta adquirir el lock o lanza excepción si se excede el timeout.
   * En el mock, se comporta como tryLock pero lanza en vez de retornar false.
   * @param {number} timeoutInMillis
   * @throws {Error} Si no se pudo adquirir dentro del timeout
   */
  waitLock(timeoutInMillis) {
    this._callLog.push({ method: 'waitLock', timeout: timeoutInMillis, timestamp: Date.now() });

    if (this._locked) {
      throw new Error('No se pudo adquirir el lock: ya está tomado (timeout).');
    }

    if (this._isContended()) {
      throw new Error(
        `No se pudo adquirir el lock dentro de ${timeoutInMillis}ms (contención simulada).`
      );
    }

    this._locked = true;
  }

  /**
   * Libera el lock.
   */
  releaseLock() {
    this._callLog.push({ method: 'releaseLock', timestamp: Date.now() });
    this._locked = false;
  }

  /**
   * Verifica si el lock está actualmente adquirido por este script.
   * @returns {boolean}
   */
  hasLock() {
    this._callLog.push({ method: 'hasLock', timestamp: Date.now() });
    return this._locked;
  }

  // ─── Control de simulación para tests ─────────────────────────────────────

  /**
   * Activa la simulación de contención (otro proceso tiene el lock).
   * tryLock retornará false hasta que se desactive.
   */
  simulateContention() {
    this._simulateContention = true;
    this._contentionStartTime = Date.now();
  }

  /**
   * Desactiva la contención simulada (el lock está disponible).
   */
  releaseContention() {
    this._simulateContention = false;
    this._contentionStartTime = null;
  }

  /**
   * Verifica si el lock está adquirido (para inspección en tests).
   */
  isLocked() {
    return this._locked;
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

  /** Reset completo del lock */
  reset() {
    this._locked = false;
    this._simulateContention = false;
    this._contentionStartTime = null;
    this._callLog = [];
  }

  // ─── Internos ─────────────────────────────────────────────────────────────

  _isContended() {
    if (!this._simulateContention) return false;

    // Si se configuró liberación después de N ms, verificar si ya pasó el tiempo
    if (this._contentionReleaseAfterMs > 0 && this._contentionStartTime) {
      const elapsed = Date.now() - this._contentionStartTime;
      if (elapsed >= this._contentionReleaseAfterMs) {
        this._simulateContention = false;
        return false;
      }
    }

    return true;
  }
}

// ─── LockService (Factory) ─────────────────────────────────────────────────────

/**
 * Crea un mock de LockService que simula el comportamiento de GAS.
 *
 * @param {object} [options]
 * @param {boolean} [options.simulateContention=false] - Todas las instancias inician con contención
 * @param {number} [options.contentionReleaseAfterMs=0] - Contención se libera después de N ms
 * @returns {object} Mock de LockService con getScriptLock(), getDocumentLock(), getUserLock()
 *
 * @example
 *   // Uso normal — locks disponibles
 *   const lockService = createLockService();
 *   globalThis.LockService = lockService;
 *   const lock = LockService.getScriptLock();
 *   if (lock.tryLock(5000)) {
 *     // ... sección crítica ...
 *     lock.releaseLock();
 *   }
 *
 * @example
 *   // Simular contención (otro usuario tiene el lock)
 *   const lockService = createLockService({ simulateContention: true });
 *   globalThis.LockService = lockService;
 *   const lock = LockService.getScriptLock();
 *   lock.tryLock(5000); // → false (contención)
 *
 * @example
 *   // Contención que se libera después de 200ms
 *   const lockService = createLockService({
 *     simulateContention: true,
 *     contentionReleaseAfterMs: 200
 *   });
 */
export function createLockService(options = {}) {
  const scriptLock = new MockLock(options);
  const documentLock = new MockLock(options);
  const userLock = new MockLock(options);

  return {
    getScriptLock() {
      return scriptLock;
    },

    getDocumentLock() {
      return documentLock;
    },

    getUserLock() {
      return userLock;
    },

    /** Acceso directo a las instancias para inspección en tests */
    _scriptLock: scriptLock,
    _documentLock: documentLock,
    _userLock: userLock
  };
}

export default createLockService;
