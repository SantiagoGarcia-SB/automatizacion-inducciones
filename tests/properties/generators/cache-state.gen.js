import fc from 'fast-check';

/**
 * Generador de estados del CacheManager (cliente).
 *
 * El CacheManager almacena:
 *   _store: { key: { data, timestamp } }
 *
 * Claves válidas del sistema:
 *   'dashboard', 'cola-auxiliar', 'mis-solicitudes', 'asignaciones',
 *   'errores', 'lotes', 'solicitudes', 'usuarios', 'config-motivos'
 */

export const CACHE_KEYS = [
  'dashboard',
  'cola-auxiliar',
  'mis-solicitudes',
  'asignaciones',
  'errores',
  'lotes',
  'solicitudes',
  'usuarios',
  'config-motivos',
];

/**
 * Genera una clave válida del CacheManager.
 */
export function arbCacheKey() {
  return fc.constantFrom(...CACHE_KEYS);
}

/**
 * Genera un subconjunto no vacío de claves del CacheManager.
 */
export function arbCacheKeySubset() {
  return fc.subarray(CACHE_KEYS, { minLength: 1, maxLength: CACHE_KEYS.length });
}

/**
 * Genera un timestamp realista (dentro de la última hora).
 */
export function arbTimestamp() {
  const now = Date.now();
  return fc.integer({ min: now - 3600000, max: now });
}

/**
 * Genera datos de dashboard (KPIs).
 */
export function arbDashboardData() {
  return fc.record({
    inducciones: fc.integer({ min: 0, max: 500 }),
    pendienteRadicar: fc.integer({ min: 0, max: 100 }),
    radicados: fc.integer({ min: 0, max: 200 }),
    enProceso: fc.integer({ min: 0, max: 150 }),
    errores: fc.integer({ min: 0, max: 50 }),
  });
}

/**
 * Genera un item de cola auxiliar.
 */
export function arbColaItem() {
  return fc.record({
    fila: fc.integer({ min: 2, max: 10000 }),
    uuid: fc.uuid(),
    arrendatario: fc.string({ minLength: 3, maxLength: 40 }),
    idLote: fc.nat({ max: 99999 }).map(String),
    fecha: fc.date({ min: new Date('2023-01-01'), max: new Date('2026-12-31') }).map((d) => d.toISOString().slice(0, 10)),
    estado: fc.constantFrom('PENDIENTE RADICAR', 'EN PROCESO RADICACIÓN'),
  });
}

/**
 * Genera una lista de items para vistas tipo lista (cola, errores, solicitudes).
 */
export function arbListaItems() {
  return fc.array(arbColaItem(), { minLength: 0, maxLength: 30 });
}

/**
 * Genera datos variados de caché (polimórfico según el tipo de vista).
 */
export function arbCacheData() {
  return fc.oneof(
    arbDashboardData(),
    arbListaItems(),
    fc.array(fc.record({
      id: fc.integer({ min: 1, max: 9999 }),
      nombre: fc.string({ minLength: 2, maxLength: 30 }),
      email: fc.emailAddress(),
      rol: fc.constantFrom('COMERCIAL', 'AUXILIAR', 'ANALISTA', 'LIDER', 'ADMIN'),
    }), { minLength: 0, maxLength: 20 }),
    fc.array(fc.record({
      codigo: fc.nat({ max: 9999 }).map(String),
      descripcion: fc.string({ minLength: 5, maxLength: 100 }),
      activo: fc.boolean(),
    }), { minLength: 0, maxLength: 15 })
  );
}

/**
 * Genera una entrada individual del store: { data, timestamp }.
 */
export function arbCacheEntry() {
  return fc.tuple(arbCacheData(), arbTimestamp()).map(([data, timestamp]) => ({
    data,
    timestamp,
  }));
}

/**
 * Genera un store completo del CacheManager con N claves pobladas.
 * @param {Object} [opciones]
 * @param {number} [opciones.minKeys=0] — Mínimo de claves con datos
 * @param {number} [opciones.maxKeys=9] — Máximo de claves con datos (9 = todas)
 */
export function arbCacheStore(opciones = {}) {
  const { minKeys = 0, maxKeys = CACHE_KEYS.length } = opciones;

  return fc.subarray(CACHE_KEYS, { minLength: minKeys, maxLength: maxKeys })
    .chain((keys) => {
      if (keys.length === 0) return fc.constant({});
      // Generar una entrada por cada clave seleccionada
      return fc.tuple(...keys.map(() => arbCacheEntry()))
        .map((entries) => {
          const store = {};
          keys.forEach((key, i) => {
            store[key] = entries[i];
          });
          return store;
        });
    });
}

/**
 * Genera un estado completo del CacheManager (como se vería internamente).
 * @param {Object} [opciones]
 * @param {number} [opciones.minKeys=1] — Mínimo de claves
 * @param {number} [opciones.maxKeys=9] — Máximo de claves
 */
export function arbCacheManagerState(opciones = {}) {
  const { minKeys = 1, maxKeys = CACHE_KEYS.length } = opciones;
  return arbCacheStore({ minKeys, maxKeys });
}

/**
 * Genera un par (store con datos, subconjunto de claves a invalidar).
 * Útil para testear que la invalidación selectiva funciona correctamente.
 */
export function arbStoreConInvalidacion() {
  return arbCacheStore({ minKeys: 3, maxKeys: CACHE_KEYS.length })
    .chain((store) => {
      const keysConDatos = Object.keys(store);
      if (keysConDatos.length === 0) {
        return fc.constant({ store, keysAInvalidar: [] });
      }
      return fc.subarray(keysConDatos, { minLength: 1, maxLength: keysConDatos.length })
        .map((keysAInvalidar) => ({ store, keysAInvalidar }));
    });
}

/**
 * Genera una acción del usuario con sus claves de invalidación correspondientes
 * (según la tabla de invalidación del diseño).
 */
export function arbAccionConInvalidacion() {
  const acciones = [
    { accion: 'radicar', invalidar: ['cola-auxiliar', 'dashboard'] },
    { accion: 'marcar-error', invalidar: ['cola-auxiliar', 'dashboard'] },
    { accion: 'enviar-correccion', invalidar: ['errores', 'dashboard'] },
    { accion: 'pedir-solicitud', invalidar: ['mis-solicitudes', 'asignaciones'] },
    { accion: 'guardar-usuario', invalidar: ['usuarios'] },
    { accion: 'eliminar-usuario', invalidar: ['usuarios'] },
    { accion: 'guardar-motivo', invalidar: ['config-motivos', 'errores'] },
    { accion: 'eliminar-motivo', invalidar: ['config-motivos', 'errores'] },
    { accion: 'reasignar', invalidar: ['asignaciones', 'mis-solicitudes'] },
  ];

  return fc.constantFrom(...acciones);
}
