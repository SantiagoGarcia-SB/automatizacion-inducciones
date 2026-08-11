import fc from 'fast-check';

/**
 * Generador de datos para UsuarioRecord y jerarquía organizacional.
 *
 * Esquema nuevo USUARIOS (7 columnas):
 *   EMAIL (A), ROL (B), ACTIVO (C), CUPO (D),
 *   EMAIL_DIRECTOR (E), EMAIL_GERENTE (F), EMAILS_ALTERNOS (G)
 *
 * Jerarquía:
 *   CONSULTOR/ANALISTA/AUXILIAR → EMAIL_DIRECTOR → DIRECTOR
 *   DIRECTOR → EMAIL_GERENTE → GERENTE
 *   GERENTE/ADMIN/ASESOR → sin supervisor
 *
 * Esquema viejo (8 columnas) para migración:
 *   EMAIL(A), NOMBRE(B), ROL(C), CUPO(D), DIRECTOR(E), BACKUP(F), BACKUP_ACTIVO(G), ACTIVO(H)
 */

/** Roles válidos del nuevo esquema */
export const ROLES_VALIDOS = [
  'CONSULTOR',
  'ANALISTA',
  'AUXILIAR',
  'DIRECTOR',
  'GERENTE',
  'ADMIN',
  'ASESOR',
];

/** Roles que requieren EMAIL_DIRECTOR */
export const ROLES_CON_DIRECTOR = ['CONSULTOR', 'ANALISTA', 'AUXILIAR'];

/** Roles que requieren EMAIL_GERENTE */
export const ROLES_CON_GERENTE = ['DIRECTOR'];

/** Roles sin supervisor requerido */
export const ROLES_SIN_SUPERVISOR = ['GERENTE', 'ADMIN', 'ASESOR'];

/** Roles del esquema viejo */
export const ROLES_VIEJOS = ['COMERCIAL', 'LIDER', 'ANALISTA', 'AUXILIAR', 'ADMIN', 'ASESOR'];

/**
 * Genera un rol válido del nuevo esquema (uno de los 7 valores permitidos).
 * @returns {fc.Arbitrary<string>}
 */
export function arbRolValido() {
  return fc.constantFrom(...ROLES_VALIDOS);
}

/**
 * Genera un string aleatorio que NO esté en el enum de roles válidos.
 * @returns {fc.Arbitrary<string>}
 */
export function arbRolInvalido() {
  return fc.string({ minLength: 1, maxLength: 20 })
    .filter((s) => !ROLES_VALIDOS.includes(s.toUpperCase()) && s.trim().length > 0);
}

/**
 * Genera un email normalizado a minúsculas.
 * Formato: localpart@domain.tld con caracteres válidos.
 * @returns {fc.Arbitrary<string>}
 */
export function arbEmailNormalizado() {
  return fc.tuple(
    fc.stringOf(fc.constantFrom(...'abcdefghijklmnopqrstuvwxyz0123456789'.split('')), { minLength: 3, maxLength: 12 }),
    fc.constantFrom('segurosbolivar.com', 'gmail.com', 'empresa.co', 'correo.com', 'outlook.com')
  ).map(([local, domain]) => `${local}@${domain}`);
}

/**
 * Genera una lista de 0-5 emails alternos separados por coma.
 * Retorna el string tal como se almacenaría en la columna EMAILS_ALTERNOS.
 * @returns {fc.Arbitrary<string>}
 */
export function arbEmailsAlternos() {
  return fc.array(arbEmailNormalizado(), { minLength: 0, maxLength: 5 })
    .map((emails) => emails.join(','));
}

/**
 * Genera un UsuarioRecord válido con email, rol y campos condicionales según rol.
 *
 * - Si ROL ∈ {CONSULTOR, ANALISTA, AUXILIAR} → emailDirector es email válido
 * - Si ROL = DIRECTOR → emailGerente es email válido
 * - Si ROL ∈ {GERENTE, ADMIN, ASESOR} → sin supervisor
 *
 * @returns {fc.Arbitrary<Object>} UsuarioRecord
 */
export function arbUsuarioRecord() {
  return fc.tuple(
    arbEmailNormalizado(),
    arbRolValido(),
    fc.boolean(),
    fc.integer({ min: 0, max: 50 }),
    arbEmailNormalizado(), // posible emailDirector
    arbEmailNormalizado(), // posible emailGerente
    fc.array(arbEmailNormalizado(), { minLength: 0, maxLength: 5 })
  ).map(([email, rol, activo, cupo, emailDirector, emailGerente, alternos]) => {
    return {
      email,
      rol,
      activo,
      cupo,
      emailDirector: ROLES_CON_DIRECTOR.includes(rol) ? emailDirector : '',
      emailGerente: ROLES_CON_GERENTE.includes(rol) ? emailGerente : '',
      emailsAlternos: alternos,
    };
  });
}

/**
 * Genera un dataset completo con relaciones jerárquicas válidas:
 * Gerente → Director(es) → Subordinado(s)
 *
 * Garantiza integridad referencial:
 * - Cada subordinado apunta a un Director existente
 * - Cada Director apunta a un Gerente existente
 *
 * @param {Object} [opciones]
 * @param {number} [opciones.minGerentes=1]
 * @param {number} [opciones.maxGerentes=2]
 * @param {number} [opciones.minDirectoresPorGerente=1]
 * @param {number} [opciones.maxDirectoresPorGerente=3]
 * @param {number} [opciones.minSubordinadosPorDirector=1]
 * @param {number} [opciones.maxSubordinadosPorDirector=4]
 * @returns {fc.Arbitrary<Object>} { gerentes, directores, subordinados, todos }
 */
export function arbJerarquiaUsuarios(opciones = {}) {
  const {
    minGerentes = 1,
    maxGerentes = 2,
    minDirectoresPorGerente = 1,
    maxDirectoresPorGerente = 3,
    minSubordinadosPorDirector = 1,
    maxSubordinadosPorDirector = 4,
  } = opciones;

  return fc.integer({ min: minGerentes, max: maxGerentes }).chain((numGerentes) => {
    // Generar gerentes
    return fc.array(
      fc.tuple(arbEmailNormalizado(), fc.boolean(), fc.integer({ min: 0, max: 50 })),
      { minLength: numGerentes, maxLength: numGerentes }
    ).chain((gerentesData) => {
      const gerentes = gerentesData.map(([email, activo, cupo]) => ({
        email,
        rol: 'GERENTE',
        activo,
        cupo,
        emailDirector: '',
        emailGerente: '',
        emailsAlternos: [],
      }));

      // Para cada gerente, generar directores
      return fc.tuple(
        ...gerentes.map(() =>
          fc.integer({ min: minDirectoresPorGerente, max: maxDirectoresPorGerente })
        )
      ).chain((numDirectoresPorGerente) => {
        const directoresArbs = gerentes.map((gerente, i) =>
          fc.array(
            fc.tuple(arbEmailNormalizado(), fc.boolean(), fc.integer({ min: 0, max: 50 })),
            { minLength: numDirectoresPorGerente[i], maxLength: numDirectoresPorGerente[i] }
          ).map((datos) =>
            datos.map(([email, activo, cupo]) => ({
              email,
              rol: 'DIRECTOR',
              activo,
              cupo,
              emailDirector: '',
              emailGerente: gerente.email,
              emailsAlternos: [],
            }))
          )
        );

        return fc.tuple(...directoresArbs).chain((directoresGrupos) => {
          const directores = directoresGrupos.flat();

          // Para cada director, generar subordinados
          const subordinadosArbs = directores.map((director) =>
            fc.array(
              fc.tuple(
                arbEmailNormalizado(),
                fc.constantFrom(...ROLES_CON_DIRECTOR),
                fc.boolean(),
                fc.integer({ min: 0, max: 50 })
              ),
              { minLength: minSubordinadosPorDirector, maxLength: maxSubordinadosPorDirector }
            ).map((datos) =>
              datos.map(([email, rol, activo, cupo]) => ({
                email,
                rol,
                activo,
                cupo,
                emailDirector: director.email,
                emailGerente: '',
                emailsAlternos: [],
              }))
            )
          );

          return fc.tuple(...subordinadosArbs).map((subordinadosGrupos) => {
            const subordinados = subordinadosGrupos.flat();
            const todos = [...gerentes, ...directores, ...subordinados];
            return { gerentes, directores, subordinados, todos };
          });
        });
      });
    });
  });
}

/**
 * Genera filas en formato viejo (8 columnas) para tests de migración.
 * Esquema viejo: EMAIL(A), NOMBRE(B), ROL(C), CUPO(D), DIRECTOR(E), BACKUP(F), BACKUP_ACTIVO(G), ACTIVO(H)
 *
 * @param {Object} [opciones]
 * @param {number} [opciones.minFilas=1]
 * @param {number} [opciones.maxFilas=20]
 * @returns {fc.Arbitrary<Array<Array<string>>>} Array de filas de 8 columnas
 */
export function arbDatosEsquemaViejo(opciones = {}) {
  const { minFilas = 1, maxFilas = 20 } = opciones;

  const arbFilaVieja = fc.tuple(
    arbEmailNormalizado(),                                          // EMAIL (A)
    fc.tuple(                                                       // NOMBRE (B)
      fc.constantFrom('Juan', 'María', 'Carlos', 'Ana', 'Pedro', 'Laura', 'Diego', 'Sofía'),
      fc.constantFrom('García', 'Rodríguez', 'Martínez', 'López', 'González', 'Pérez')
    ).map(([n, a]) => `${n} ${a}`),
    fc.constantFrom(...ROLES_VIEJOS),                               // ROL (C)
    fc.integer({ min: 0, max: 50 }).map(String),                    // CUPO (D)
    fc.oneof(                                                       // DIRECTOR (E)
      { weight: 3, arbitrary: arbEmailNormalizado() },
      { weight: 1, arbitrary: fc.constant('') }
    ),
    fc.oneof(                                                       // BACKUP (F)
      { weight: 2, arbitrary: arbEmailNormalizado() },
      { weight: 2, arbitrary: fc.constant('') }
    ),
    fc.constantFrom('TRUE', 'FALSE', ''),                           // BACKUP_ACTIVO (G)
    fc.constantFrom('TRUE', 'FALSE')                                // ACTIVO (H)
  ).map(([email, nombre, rol, cupo, director, backup, backupActivo, activo]) => {
    return [email, nombre, rol, cupo, director, backup, backupActivo, activo];
  });

  return fc.array(arbFilaVieja, { minLength: minFilas, maxLength: maxFilas });
}
