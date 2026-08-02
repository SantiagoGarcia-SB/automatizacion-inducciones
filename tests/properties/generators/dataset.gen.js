import fc from 'fast-check';

/**
 * Generador de filas de Control_General (62 columnas).
 *
 * Esquema de columnas relevantes:
 *   col A  (index 0)  = idLote
 *   col C  (index 2)  = fecha
 *   col J  (index 9)  = estado
 *   col X  (index 23) = arrendatario
 *   col AD (index 29) = codeudor INQ
 *   col AJ (index 35) = codeudor COA1
 *   col AP (index 41) = codeudor COA2
 *   col AV (index 47) = codeudor COA3
 *   col BB (index 53) = codeudor COA4
 *   col BH (index 59) = codeudor COA5 (nota: según contexto es BB=53)
 *   col BJ (index 61) = UUID
 */

const ESTADOS = [
  'PENDIENTE RADICAR',
  'RADICADO',
  'ERROR EN TERCEROS',
  'EN PROCESO RADICACIÓN',
  'EN_EVALUACION',
  'APROBADO',
  'RECHAZADO',
];

const CODEUDOR_INDEXES = [29, 35, 41, 47, 53];

/**
 * Genera un UUID v4-like string.
 */
export function arbUuid() {
  return fc.uuid();
}

/**
 * Genera un estado válido de Control_General.
 */
export function arbEstado() {
  return fc.constantFrom(...ESTADOS);
}

/**
 * Genera una fecha en formato string (ISO-like o dd/mm/yyyy).
 */
export function arbFecha() {
  return fc.date({
    min: new Date('2023-01-01'),
    max: new Date('2026-12-31'),
  }).map((d) => {
    const dd = String(d.getDate()).padStart(2, '0');
    const mm = String(d.getMonth() + 1).padStart(2, '0');
    const yyyy = d.getFullYear();
    return `${dd}/${mm}/${yyyy}`;
  });
}

/**
 * Genera un nombre de arrendatario.
 */
export function arbArrendatario() {
  return fc.tuple(
    fc.constantFrom('Juan', 'María', 'Carlos', 'Ana', 'Pedro', 'Laura', 'Diego', 'Sofía', 'Andrés', 'Camila'),
    fc.constantFrom('García', 'Rodríguez', 'Martínez', 'López', 'González', 'Hernández', 'Pérez', 'Sánchez', 'Ramírez', 'Torres')
  ).map(([nombre, apellido]) => `${nombre} ${apellido}`);
}

/**
 * Genera un nombre de participante (codeudor) o string vacío.
 */
export function arbParticipante() {
  return fc.oneof(
    { weight: 3, arbitrary: arbArrendatario() },
    { weight: 1, arbitrary: fc.constant('') }
  );
}

/**
 * Genera un idLote numérico.
 */
export function arbIdLote() {
  return fc.integer({ min: 1, max: 99999 }).map(String);
}

/**
 * Genera una fila completa de Control_General (array de 62 elementos).
 *
 * Las columnas no especificadas se rellenan con strings aleatorios cortos
 * para simular datos variados en las demás celdas.
 */
export function arbFilaControlGeneral() {
  return fc.tuple(
    arbIdLote(),          // col 0 - idLote
    fc.string({ minLength: 0, maxLength: 20 }), // col 1
    arbFecha(),           // col 2 - fecha
    arbEstado(),          // estado (se coloca en index 9)
    arbArrendatario(),    // arrendatario (se coloca en index 23)
    arbUuid(),            // UUID (se coloca en index 61)
    arbParticipante(),    // codeudor INQ (index 29)
    arbParticipante(),    // codeudor COA1 (index 35)
    arbParticipante(),    // codeudor COA2 (index 41)
    arbParticipante(),    // codeudor COA3 (index 47)
    arbParticipante(),    // codeudor COA4 (index 53)
  ).chain(([idLote, col1, fecha, estado, arrendatario, uuid, inq, coa1, coa2, coa3, coa4]) => {
    // Generar las demás columnas como strings genéricos
    return fc.array(fc.string({ minLength: 0, maxLength: 15 }), { minLength: 62, maxLength: 62 })
      .map((fila) => {
        // Sobreescribir las columnas significativas
        fila[0] = idLote;
        fila[1] = col1;
        fila[2] = fecha;
        fila[9] = estado;
        fila[23] = arrendatario;
        fila[29] = inq;
        fila[35] = coa1;
        fila[41] = coa2;
        fila[47] = coa3;
        fila[53] = coa4;
        fila[61] = uuid;
        return fila;
      });
  });
}

/**
 * Genera un dataset completo de Control_General (array de filas).
 * @param {Object} [opciones]
 * @param {number} [opciones.minFilas=1] — Mínimo de filas
 * @param {number} [opciones.maxFilas=50] — Máximo de filas
 */
export function arbDatasetControlGeneral(opciones = {}) {
  const { minFilas = 1, maxFilas = 50 } = opciones;
  return fc.array(arbFilaControlGeneral(), { minLength: minFilas, maxLength: maxFilas });
}

/**
 * Genera un dataset con UUIDs garantizados únicos (para testear índices).
 * @param {Object} [opciones]
 * @param {number} [opciones.minFilas=1] — Mínimo de filas
 * @param {number} [opciones.maxFilas=50] — Máximo de filas
 */
export function arbDatasetConUuidsUnicos(opciones = {}) {
  const { minFilas = 1, maxFilas = 50 } = opciones;
  return fc.array(arbFilaControlGeneral(), { minLength: minFilas, maxLength: maxFilas })
    .map((filas) => {
      // Asegurar unicidad de UUIDs reescribiendo con sufijo incremental
      const seen = new Set();
      return filas.map((fila, i) => {
        let uuid = fila[61];
        if (seen.has(uuid)) {
          uuid = `${uuid.slice(0, -4)}${String(i).padStart(4, '0')}`;
        }
        seen.add(uuid);
        fila[61] = uuid;
        return fila;
      });
    });
}

/**
 * Genera un subconjunto de UUIDs existentes en un dataset dado,
 * mezclado con algunos UUIDs inexistentes (para testear referencias inválidas).
 * @param {Array} dataset — El dataset de Control_General
 * @param {Object} [opciones]
 * @param {number} [opciones.proporcionInvalidos=0.3] — Proporción de UUIDs inválidos
 */
export function arbUuidsConInvalidos(dataset, opciones = {}) {
  const { proporcionInvalidos = 0.3 } = opciones;
  const uuidsValidos = dataset.map((fila) => fila[61]).filter(Boolean);

  return fc.array(
    fc.oneof(
      { weight: Math.round((1 - proporcionInvalidos) * 10), arbitrary: fc.constantFrom(...(uuidsValidos.length > 0 ? uuidsValidos : ['placeholder-uuid'])) },
      { weight: Math.round(proporcionInvalidos * 10), arbitrary: fc.uuid() }
    ),
    { minLength: 1, maxLength: Math.max(uuidsValidos.length, 5) }
  );
}

export { ESTADOS, CODEUDOR_INDEXES };
