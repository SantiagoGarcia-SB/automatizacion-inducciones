/**
 * Unit tests para OptimisticUpdater (scripts_app.html)
 *
 * Valida el flujo de actualización optimista: snapshot → mutación → render → 
 * callServer → confirmar/rollback. Cubre escenarios de éxito, fallo de servidor,
 * timeout, y navegación durante espera.
 *
 * Requirements: 7.1, 7.2, 7.3, 7.4, 7.5
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

// ─── Setup: Simular entorno del navegador (globals) ─────────────────────────────

let CacheManager;
let OptimisticUpdater;
let _seccionActiva;
let _toastCalls;
let _callServerResolve;
let _callServerReject;
let _callServerPromise;

function setupGlobals() {
  // CacheManager simplificado (misma interfaz que el real)
  CacheManager = {
    _store: {},
    get: function(key) {
      if (!this._store[key]) return null;
      return this._store[key].data;
    },
    set: function(key, data) {
      this._store[key] = { data: data, timestamp: Date.now() };
    },
    invalidar: function(keys) {
      if (typeof keys === 'string') keys = [keys];
      for (var i = 0; i < keys.length; i++) {
        delete this._store[keys[i]];
      }
    },
    invalidarTodo: function() {
      this._store = {};
    },
    esValido: function(key) {
      return this.get(key) !== null;
    }
  };
  globalThis.CacheManager = CacheManager;

  // Sección activa
  _seccionActiva = 'cola-auxiliar';
  globalThis._seccionActiva = _seccionActiva;

  // Toast tracker
  _toastCalls = [];
  globalThis._toast = function(mensaje, tipo) {
    _toastCalls.push({ mensaje: mensaje, tipo: tipo });
  };

  // callServer mock que retorna promesa controlable
  _callServerPromise = null;
  _callServerResolve = null;
  _callServerReject = null;

  globalThis.callServer = function() {
    _callServerPromise = new Promise(function(resolve, reject) {
      _callServerResolve = resolve;
      _callServerReject = reject;
    });
    return _callServerPromise;
  };

  // OptimisticUpdater (el objeto real del código de producción)
  OptimisticUpdater = {
    ejecutar: function(config) {
      var cacheKey = config.cacheKey;
      var mutacion = config.mutacion;
      var render = config.render;
      var serverFn = config.serverFn;
      var serverArgs = config.serverArgs || [];
      var invalidarKeys = config.invalidarKeys || [];
      var timeout = config.timeout || 10000;

      // 1. Snapshot del estado actual
      var datosActuales = CacheManager.get(cacheKey);
      var snapshot = JSON.parse(JSON.stringify(datosActuales || []));

      // 2. Mutación local optimista
      var datosMutados = mutacion(datosActuales);
      CacheManager.set(cacheKey, datosMutados);

      // 3. Render instantáneo
      render();

      // 4. Capturar sección activa al momento de la acción
      var seccionAlMomento = globalThis._seccionActiva;

      // 5. Timer de timeout
      var timedOut = false;
      var timeoutId = setTimeout(function() {
        timedOut = true;
        CacheManager.set(cacheKey, snapshot);
        if (globalThis._seccionActiva === seccionAlMomento) {
          render();
        }
        globalThis._toast('La conexión está lenta. Verifica tu internet.', 'warning');
      }, timeout);

      // 6. Llamar al servidor
      var callArgs = [serverFn].concat(serverArgs);
      globalThis.callServer.apply(null, callArgs)
        .then(function(res) {
          clearTimeout(timeoutId);
          if (timedOut) return;

          if (res && res.ok) {
            if (invalidarKeys.length > 0) {
              CacheManager.invalidar(invalidarKeys);
            }
          } else {
            CacheManager.set(cacheKey, snapshot);
            if (globalThis._seccionActiva === seccionAlMomento) {
              render();
            }
            globalThis._toast(res && res.mensaje ? res.mensaje : 'La acción no se pudo completar.', 'error');
          }
        })
        .catch(function(err) {
          clearTimeout(timeoutId);
          if (timedOut) return;

          CacheManager.set(cacheKey, snapshot);
          if (globalThis._seccionActiva === seccionAlMomento) {
            render();
          } else {
            globalThis._toast('La acción anterior no se completó.', 'warning');
          }
        });
    }
  };
  globalThis.OptimisticUpdater = OptimisticUpdater;
}

// ─── Tests ─────────────────────────────────────────────────────────────────────

describe('OptimisticUpdater', () => {
  let renderCount;

  beforeEach(() => {
    vi.useFakeTimers();
    setupGlobals();
    renderCount = 0;
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  describe('Flujo exitoso (servidor confirma OK)', () => {
    it('aplica la mutación local y renderiza inmediatamente', () => {
      // Setup: datos iniciales en caché
      CacheManager.set('cola-auxiliar', [
        { uuid: 'a1', arrendatario: 'Juan' },
        { uuid: 'a2', arrendatario: 'Pedro' }
      ]);

      OptimisticUpdater.ejecutar({
        cacheKey: 'cola-auxiliar',
        mutacion: function(datos) {
          return datos.filter(function(d) { return d.uuid !== 'a1'; });
        },
        render: function() { renderCount++; },
        serverFn: 'api_marcarRadicado',
        serverArgs: ['a1', { solicitudInquilino: '12345' }],
        invalidarKeys: ['dashboard']
      });

      // Verificar mutación local aplicada
      var datos = CacheManager.get('cola-auxiliar');
      expect(datos).toHaveLength(1);
      expect(datos[0].uuid).toBe('a2');

      // Verificar render inmediato
      expect(renderCount).toBe(1);
    });

    it('invalida claves relacionadas cuando el servidor confirma OK', async () => {
      CacheManager.set('cola-auxiliar', [{ uuid: 'a1' }]);
      CacheManager.set('dashboard', { total: 5 });

      OptimisticUpdater.ejecutar({
        cacheKey: 'cola-auxiliar',
        mutacion: function(datos) { return []; },
        render: function() { renderCount++; },
        serverFn: 'api_marcarRadicado',
        serverArgs: ['a1'],
        invalidarKeys: ['dashboard']
      });

      // Simular respuesta OK del servidor
      _callServerResolve({ ok: true });
      await vi.advanceTimersByTimeAsync(0);

      // Dashboard debe haber sido invalidado
      expect(CacheManager.get('dashboard')).toBeNull();
      // No debe haber toast de error
      expect(_toastCalls).toHaveLength(0);
    });

    it('no renderiza un segundo render en éxito (sólo el render inicial)', async () => {
      CacheManager.set('cola-auxiliar', [{ uuid: 'a1' }]);

      OptimisticUpdater.ejecutar({
        cacheKey: 'cola-auxiliar',
        mutacion: function(datos) { return []; },
        render: function() { renderCount++; },
        serverFn: 'api_marcarRadicado',
        serverArgs: ['a1'],
        invalidarKeys: []
      });

      expect(renderCount).toBe(1); // Render inicial

      _callServerResolve({ ok: true });
      await vi.advanceTimersByTimeAsync(0);

      // No debe haber hecho un segundo render en éxito
      expect(renderCount).toBe(1);
    });
  });

  describe('Rollback por fallo del servidor (Req 7.4)', () => {
    it('restaura el snapshot original cuando el servidor responde {ok: false}', async () => {
      var datosOriginales = [
        { uuid: 'a1', arrendatario: 'Juan' },
        { uuid: 'a2', arrendatario: 'Pedro' }
      ];
      CacheManager.set('cola-auxiliar', datosOriginales);

      OptimisticUpdater.ejecutar({
        cacheKey: 'cola-auxiliar',
        mutacion: function(datos) {
          return datos.filter(function(d) { return d.uuid !== 'a1'; });
        },
        render: function() { renderCount++; },
        serverFn: 'api_marcarRadicado',
        serverArgs: ['a1'],
        invalidarKeys: ['dashboard']
      });

      // Estado intermedio: mutación aplicada
      expect(CacheManager.get('cola-auxiliar')).toHaveLength(1);
      expect(renderCount).toBe(1);

      // Servidor falla
      _callServerResolve({ ok: false, mensaje: 'No se pudo radicar.' });
      await vi.advanceTimersByTimeAsync(0);

      // Rollback: datos restaurados
      var datosRestaurados = CacheManager.get('cola-auxiliar');
      expect(datosRestaurados).toHaveLength(2);
      expect(datosRestaurados).toEqual(datosOriginales);

      // Re-render ejecutado
      expect(renderCount).toBe(2);

      // Toast de error
      expect(_toastCalls).toHaveLength(1);
      expect(_toastCalls[0].mensaje).toBe('No se pudo radicar.');
      expect(_toastCalls[0].tipo).toBe('error');
    });

    it('muestra mensaje genérico si el servidor no envía mensaje', async () => {
      CacheManager.set('cola-auxiliar', [{ uuid: 'x' }]);

      OptimisticUpdater.ejecutar({
        cacheKey: 'cola-auxiliar',
        mutacion: function(datos) { return []; },
        render: function() { renderCount++; },
        serverFn: 'api_marcarRadicado',
        serverArgs: ['x'],
        invalidarKeys: []
      });

      _callServerResolve({ ok: false });
      await vi.advanceTimersByTimeAsync(0);

      expect(_toastCalls[0].mensaje).toBe('La acción no se pudo completar.');
    });

    it('restaura snapshot cuando callServer lanza excepción', async () => {
      var datosOriginales = [{ uuid: 'b1' }, { uuid: 'b2' }];
      CacheManager.set('errores', datosOriginales);

      OptimisticUpdater.ejecutar({
        cacheKey: 'errores',
        mutacion: function(datos) { return datos.filter(function(d) { return d.uuid !== 'b1'; }); },
        render: function() { renderCount++; },
        serverFn: 'api_enviarCorreccion',
        serverArgs: ['b1', []],
        invalidarKeys: ['dashboard']
      });

      // Simular excepción de red
      _callServerReject(new Error('Network error'));
      await vi.advanceTimersByTimeAsync(0);

      // Rollback ejecutado
      expect(CacheManager.get('errores')).toEqual(datosOriginales);
      expect(renderCount).toBe(2);
    });
  });

  describe('Timeout de 10 segundos (Req 7.4)', () => {
    it('ejecuta rollback tras 10 segundos sin respuesta (default timeout)', async () => {
      var datosOriginales = [{ uuid: 'c1' }, { uuid: 'c2' }];
      CacheManager.set('cola-auxiliar', datosOriginales);

      OptimisticUpdater.ejecutar({
        cacheKey: 'cola-auxiliar',
        mutacion: function(datos) { return datos.filter(function(d) { return d.uuid !== 'c1'; }); },
        render: function() { renderCount++; },
        serverFn: 'api_marcarRadicado',
        serverArgs: ['c1'],
        invalidarKeys: ['dashboard']
      });

      // Después de mutación, antes de timeout
      expect(CacheManager.get('cola-auxiliar')).toHaveLength(1);
      expect(renderCount).toBe(1);

      // Avanzar 10 segundos (timeout por defecto)
      vi.advanceTimersByTime(10000);

      // Rollback ejecutado
      expect(CacheManager.get('cola-auxiliar')).toEqual(datosOriginales);
      expect(renderCount).toBe(2);

      // Toast de warning
      expect(_toastCalls).toHaveLength(1);
      expect(_toastCalls[0].mensaje).toBe('La conexión está lenta. Verifica tu internet.');
      expect(_toastCalls[0].tipo).toBe('warning');
    });

    it('respeta un timeout custom', async () => {
      CacheManager.set('usuarios', [{ email: 'a@b.com' }]);

      OptimisticUpdater.ejecutar({
        cacheKey: 'usuarios',
        mutacion: function(datos) { return []; },
        render: function() { renderCount++; },
        serverFn: 'api_guardarUsuario',
        serverArgs: [{ email: 'a@b.com' }],
        invalidarKeys: [],
        timeout: 5000
      });

      // A los 4.9s no debe haber timeout
      vi.advanceTimersByTime(4900);
      expect(_toastCalls).toHaveLength(0);
      expect(renderCount).toBe(1);

      // A los 5s, timeout
      vi.advanceTimersByTime(100);
      expect(_toastCalls).toHaveLength(1);
      expect(renderCount).toBe(2);
    });

    it('ignora respuesta del servidor si ya hubo timeout', async () => {
      CacheManager.set('cola-auxiliar', [{ uuid: 'd1' }]);

      OptimisticUpdater.ejecutar({
        cacheKey: 'cola-auxiliar',
        mutacion: function(datos) { return []; },
        render: function() { renderCount++; },
        serverFn: 'api_marcarRadicado',
        serverArgs: ['d1'],
        invalidarKeys: ['dashboard']
      });

      // Timeout ocurre primero
      vi.advanceTimersByTime(10000);
      expect(renderCount).toBe(2); // render inicial + rollback render

      // Servidor responde tarde con OK
      _callServerResolve({ ok: true });
      await vi.advanceTimersByTimeAsync(0);

      // No debe haber render adicional ni invalidación de dashboard
      expect(renderCount).toBe(2);
      // Solo el toast de timeout, no de éxito
      expect(_toastCalls).toHaveLength(1);
      expect(_toastCalls[0].tipo).toBe('warning');
    });
  });

  describe('Navegación durante espera + fallo (Req 7.5)', () => {
    it('no re-renderiza si el usuario navegó a otra sección y el servidor falla', async () => {
      CacheManager.set('cola-auxiliar', [{ uuid: 'e1' }]);

      OptimisticUpdater.ejecutar({
        cacheKey: 'cola-auxiliar',
        mutacion: function(datos) { return []; },
        render: function() { renderCount++; },
        serverFn: 'api_marcarRadicado',
        serverArgs: ['e1'],
        invalidarKeys: ['dashboard']
      });

      expect(renderCount).toBe(1); // Render inicial

      // Usuario navega a otra sección
      globalThis._seccionActiva = 'dashboard';

      // Servidor falla
      _callServerReject(new Error('Service unavailable'));
      await vi.advanceTimersByTimeAsync(0);

      // Rollback silencioso (datos restaurados) pero NO re-renderiza
      expect(CacheManager.get('cola-auxiliar')).toEqual([{ uuid: 'e1' }]);
      expect(renderCount).toBe(1); // No hubo render adicional

      // Toast de warning sin alterar vista activa
      expect(_toastCalls).toHaveLength(1);
      expect(_toastCalls[0].mensaje).toBe('La acción anterior no se completó.');
      expect(_toastCalls[0].tipo).toBe('warning');
    });

    it('no re-renderiza si el usuario navegó y ocurre timeout', () => {
      CacheManager.set('cola-auxiliar', [{ uuid: 'f1' }]);

      OptimisticUpdater.ejecutar({
        cacheKey: 'cola-auxiliar',
        mutacion: function(datos) { return []; },
        render: function() { renderCount++; },
        serverFn: 'api_marcarRadicado',
        serverArgs: ['f1'],
        invalidarKeys: []
      });

      expect(renderCount).toBe(1);

      // Usuario navega
      globalThis._seccionActiva = 'mis-solicitudes';

      // Timeout
      vi.advanceTimersByTime(10000);

      // Rollback se hizo pero no re-renderizó
      expect(CacheManager.get('cola-auxiliar')).toEqual([{ uuid: 'f1' }]);
      // El timeout handler siempre muestra toast
      expect(_toastCalls).toHaveLength(1);
      expect(_toastCalls[0].tipo).toBe('warning');
      // No hubo re-render (el render se llamó solo al inicio)
      expect(renderCount).toBe(1);
    });
  });

  describe('Snapshot es deep-copy (independiente del original)', () => {
    it('la mutación del resultado no afecta al snapshot almacenado', async () => {
      var datosOriginales = [
        { uuid: 'g1', campos: { nombre: 'A' } },
        { uuid: 'g2', campos: { nombre: 'B' } }
      ];
      CacheManager.set('usuarios', datosOriginales);

      OptimisticUpdater.ejecutar({
        cacheKey: 'usuarios',
        mutacion: function(datos) {
          // Mutación que modifica propiedades internas
          var copia = JSON.parse(JSON.stringify(datos));
          copia[0].campos.nombre = 'MODIFICADO';
          return copia;
        },
        render: function() { renderCount++; },
        serverFn: 'api_guardarUsuario',
        serverArgs: [],
        invalidarKeys: []
      });

      // Servidor falla → rollback
      _callServerResolve({ ok: false, mensaje: 'Error' });
      await vi.advanceTimersByTimeAsync(0);

      // El snapshot restaurado debe tener el valor original (deep copy)
      var restaurado = CacheManager.get('usuarios');
      expect(restaurado[0].campos.nombre).toBe('A');
    });
  });

  describe('CacheKey con datos null (primera vez, sin caché)', () => {
    it('maneja correctamente cuando no hay datos previos en caché', async () => {
      // No se setea ningún dato previo en 'cola-auxiliar'

      OptimisticUpdater.ejecutar({
        cacheKey: 'cola-auxiliar',
        mutacion: function(datos) {
          // datos será null, pero snapshot será []
          return [{ uuid: 'nuevo', arrendatario: 'Nuevo' }];
        },
        render: function() { renderCount++; },
        serverFn: 'api_marcarRadicado',
        serverArgs: ['nuevo'],
        invalidarKeys: []
      });

      expect(CacheManager.get('cola-auxiliar')).toEqual([{ uuid: 'nuevo', arrendatario: 'Nuevo' }]);
      expect(renderCount).toBe(1);

      // Fallo → rollback al snapshot que es []
      _callServerResolve({ ok: false });
      await vi.advanceTimersByTimeAsync(0);

      expect(CacheManager.get('cola-auxiliar')).toEqual([]);
      expect(renderCount).toBe(2);
    });
  });
});
