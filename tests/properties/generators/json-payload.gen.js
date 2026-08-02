import fc from 'fast-check';

/**
 * Generador de strings JSON de tamaño variable para testear
 * la fragmentación de CacheService (límite 100 KB por clave).
 *
 * Rangos de tamaño:
 *   - Pequeño: 1 KB - 10 KB (cabe en una clave sin fragmentar)
 *   - Mediano: 10 KB - 99 KB (cabe en una clave sin fragmentar)
 *   - Grande: 100 KB - 500 KB (requiere fragmentación)
 *   - Excesivo: 500 KB - 600 KB (no se debe cachear)
 */

const KB = 1024;

/**
 * Genera un objeto JSON-serializable con propiedades variadas.
 */
export function arbJsonObject() {
  return fc.oneof(
    fc.record({
      id: fc.uuid(),
      nombre: fc.string({ minLength: 2, maxLength: 50 }),
      valor: fc.double({ min: -10000, max: 10000, noNaN: true }),
      activo: fc.boolean(),
      fecha: fc.date({ min: new Date('2020-01-01'), max: new Date('2026-12-31') }).map((d) => d.toISOString()),
    }),
    fc.record({
      uuid: fc.uuid(),
      estado: fc.constantFrom('PENDIENTE RADICAR', 'RADICADO', 'ERROR EN TERCEROS', 'EN PROCESO RADICACIÓN'),
      arrendatario: fc.string({ minLength: 3, maxLength: 40 }),
      idLote: fc.nat({ max: 99999 }).map(String),
      campos: fc.array(fc.string({ minLength: 1, maxLength: 20 }), { minLength: 1, maxLength: 10 }),
    }),
    fc.record({
      codigo: fc.nat({ max: 9999 }).map(String),
      descripcion: fc.string({ minLength: 5, maxLength: 100 }),
      subcategorias: fc.array(fc.string({ minLength: 2, maxLength: 30 }), { minLength: 0, maxLength: 5 }),
    })
  );
}

/**
 * Genera un string JSON cuyo tamaño en bytes está entre minSize y maxSize.
 * Usa un array de objetos para escalar el tamaño.
 *
 * @param {number} minSize — Tamaño mínimo en bytes
 * @param {number} maxSize — Tamaño máximo en bytes
 */
export function arbJsonPayloadDeRango(minSize, maxSize) {
  // Estimamos ~200 bytes por objeto, ajustamos la cantidad de items
  const minItems = Math.max(1, Math.ceil(minSize / 200));
  const maxItems = Math.ceil(maxSize / 100);

  return fc.array(arbJsonObject(), { minLength: minItems, maxLength: maxItems })
    .map((arr) => {
      let json = JSON.stringify(arr);

      // Si es demasiado pequeño, rellenar con un campo padding
      if (json.length < minSize) {
        const padding = 'x'.repeat(minSize - json.length + 10);
        arr.push({ _padding: padding });
        json = JSON.stringify(arr);
      }

      // Si es demasiado grande, truncar el array
      while (json.length > maxSize && arr.length > 1) {
        arr.pop();
        json = JSON.stringify(arr);
      }

      // Ajuste fino: si aún excede, recortar un campo del último objeto
      if (json.length > maxSize) {
        json = json.slice(0, maxSize - 1) + ']';
        // Intentar que siga siendo JSON válido
        try {
          JSON.parse(json);
        } catch {
          // Fallback: generar un array simple del tamaño deseado
          const targetLen = Math.floor((minSize + maxSize) / 2);
          json = JSON.stringify({ data: 'a'.repeat(Math.max(0, targetLen - 12)) });
        }
      }

      return json;
    })
    .filter((json) => {
      const len = json.length;
      return len >= minSize && len <= maxSize;
    });
}

/**
 * Genera un JSON payload pequeño (1 KB - 10 KB).
 * Cabe en una sola clave de CacheService sin fragmentar.
 */
export function arbJsonPequeno() {
  return arbJsonPayloadDeRango(1 * KB, 10 * KB);
}

/**
 * Genera un JSON payload mediano (10 KB - 99 KB).
 * Cabe en una sola clave de CacheService sin fragmentar.
 */
export function arbJsonMediano() {
  return arbJsonPayloadDeRango(10 * KB, 99 * KB);
}

/**
 * Genera un JSON payload grande (100 KB - 500 KB).
 * Requiere fragmentación para almacenarse en CacheService.
 */
export function arbJsonGrande() {
  return arbJsonPayloadDeRango(100 * KB, 500 * KB);
}

/**
 * Genera un JSON payload excesivo (> 500 KB, hasta 600 KB).
 * No se debe cachear según las reglas del sistema.
 */
export function arbJsonExcesivo() {
  return arbJsonPayloadDeRango(500 * KB + 1, 600 * KB);
}

/**
 * Genera un JSON payload de tamaño variable (1 KB - 600 KB).
 * Cubre todos los rangos para testing general.
 */
export function arbJsonPayload() {
  return fc.oneof(
    { weight: 2, arbitrary: arbJsonPequeno() },
    { weight: 2, arbitrary: arbJsonMediano() },
    { weight: 3, arbitrary: arbJsonGrande() },
    { weight: 1, arbitrary: arbJsonExcesivo() }
  );
}

/**
 * Genera un JSON payload específicamente en la zona frontera (90-110 KB)
 * donde el comportamiento cambia entre "una clave" y "fragmentar".
 */
export function arbJsonEnFrontera() {
  return arbJsonPayloadDeRango(90 * KB, 110 * KB);
}

/**
 * Genera un JSON payload que REQUIERE fragmentación (100 KB - 500 KB)
 * útil para testear la property 8 (round-trip sin pérdida).
 */
export function arbJsonParaFragmentar() {
  return arbJsonGrande();
}

/**
 * Genera un string JSON sencillo de un tamaño exacto aproximado.
 * Útil para tests que necesitan un tamaño preciso.
 * @param {number} targetBytes — Tamaño objetivo en bytes
 */
export function arbJsonDeTamano(targetBytes) {
  return fc.constant(null).map(() => {
    const overhead = 20; // {"data":"..."}
    const contentLen = Math.max(0, targetBytes - overhead);
    return JSON.stringify({ data: 'a'.repeat(contentLen) });
  });
}

export { KB };
