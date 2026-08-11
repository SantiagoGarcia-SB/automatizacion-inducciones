import { describe, it, expect } from 'vitest';
import fc from 'fast-check';
import {
  arbFilaControlGeneral,
  arbDatasetControlGeneral,
  arbDatasetConUuidsUnicos,
  arbUuidsConInvalidos,
  ESTADOS,
  CODEUDOR_INDEXES,
} from './dataset.gen.js';
import {
  arbCacheKey,
  arbCacheStore,
  arbCacheManagerState,
  arbStoreConInvalidacion,
  arbAccionConInvalidacion,
  CACHE_KEYS,
} from './cache-state.gen.js';
import {
  arbJsonPequeno,
  arbJsonMediano,
  arbJsonGrande,
  arbJsonPayload,
  arbJsonEnFrontera,
  KB,
} from './json-payload.gen.js';
import {
  arbUsuarioRecord,
  arbJerarquiaUsuarios,
  arbEmailNormalizado,
  arbEmailsAlternos,
  arbDatosEsquemaViejo,
  arbRolValido,
  arbRolInvalido,
  ROLES_VALIDOS,
  ROLES_CON_DIRECTOR,
  ROLES_CON_GERENTE,
  ROLES_SIN_SUPERVISOR,
  ROLES_VIEJOS,
} from './usuario-record.gen.js';

describe('Generadores de datos — dataset.gen.js', () => {
  it('arbFilaControlGeneral genera filas de 62 columnas', () => {
    fc.assert(
      fc.property(arbFilaControlGeneral(), (fila) => {
        expect(fila).toHaveLength(62);
      }),
      { numRuns: 50 }
    );
  });

  it('arbFilaControlGeneral coloca estado válido en index 9', () => {
    fc.assert(
      fc.property(arbFilaControlGeneral(), (fila) => {
        expect(ESTADOS).toContain(fila[9]);
      }),
      { numRuns: 50 }
    );
  });

  it('arbFilaControlGeneral coloca UUID en index 61', () => {
    fc.assert(
      fc.property(arbFilaControlGeneral(), (fila) => {
        expect(fila[61]).toBeTruthy();
        expect(typeof fila[61]).toBe('string');
      }),
      { numRuns: 50 }
    );
  });

  it('arbFilaControlGeneral coloca arrendatario en index 23', () => {
    fc.assert(
      fc.property(arbFilaControlGeneral(), (fila) => {
        expect(fila[23]).toBeTruthy();
        expect(typeof fila[23]).toBe('string');
      }),
      { numRuns: 50 }
    );
  });

  it('arbDatasetControlGeneral genera array de filas', () => {
    fc.assert(
      fc.property(arbDatasetControlGeneral({ minFilas: 5, maxFilas: 10 }), (dataset) => {
        expect(dataset.length).toBeGreaterThanOrEqual(5);
        expect(dataset.length).toBeLessThanOrEqual(10);
        dataset.forEach((fila) => expect(fila).toHaveLength(62));
      }),
      { numRuns: 20 }
    );
  });

  it('arbDatasetConUuidsUnicos produce UUIDs sin duplicados', () => {
    fc.assert(
      fc.property(arbDatasetConUuidsUnicos({ minFilas: 5, maxFilas: 20 }), (dataset) => {
        const uuids = dataset.map((f) => f[61]);
        const uniqueUuids = new Set(uuids);
        expect(uniqueUuids.size).toBe(uuids.length);
      }),
      { numRuns: 30 }
    );
  });
});

describe('Generadores de datos — cache-state.gen.js', () => {
  it('arbCacheKey genera claves válidas', () => {
    fc.assert(
      fc.property(arbCacheKey(), (key) => {
        expect(CACHE_KEYS).toContain(key);
      }),
      { numRuns: 50 }
    );
  });

  it('arbCacheStore genera objetos con claves válidas y estructura { data, timestamp }', () => {
    fc.assert(
      fc.property(arbCacheStore({ minKeys: 1, maxKeys: 5 }), (store) => {
        const keys = Object.keys(store);
        expect(keys.length).toBeGreaterThanOrEqual(1);
        expect(keys.length).toBeLessThanOrEqual(5);
        keys.forEach((key) => {
          expect(CACHE_KEYS).toContain(key);
          expect(store[key]).toHaveProperty('data');
          expect(store[key]).toHaveProperty('timestamp');
          expect(typeof store[key].timestamp).toBe('number');
        });
      }),
      { numRuns: 30 }
    );
  });

  it('arbStoreConInvalidacion genera store con subset de claves a invalidar', () => {
    fc.assert(
      fc.property(arbStoreConInvalidacion(), ({ store, keysAInvalidar }) => {
        const keysConDatos = Object.keys(store);
        // Todas las claves a invalidar deben existir en el store
        keysAInvalidar.forEach((key) => {
          expect(keysConDatos).toContain(key);
        });
      }),
      { numRuns: 30 }
    );
  });

  it('arbAccionConInvalidacion genera acciones con claves de invalidación correctas', () => {
    fc.assert(
      fc.property(arbAccionConInvalidacion(), ({ accion, invalidar }) => {
        expect(typeof accion).toBe('string');
        expect(Array.isArray(invalidar)).toBe(true);
        invalidar.forEach((key) => {
          expect(CACHE_KEYS).toContain(key);
        });
      }),
      { numRuns: 20 }
    );
  });
});

describe('Generadores de datos — json-payload.gen.js', () => {
  it('arbJsonPequeno genera JSON válido de 1-10 KB', () => {
    fc.assert(
      fc.property(arbJsonPequeno(), (json) => {
        expect(() => JSON.parse(json)).not.toThrow();
        expect(json.length).toBeGreaterThanOrEqual(1 * KB);
        expect(json.length).toBeLessThanOrEqual(10 * KB);
      }),
      { numRuns: 20 }
    );
  });

  it('arbJsonMediano genera JSON válido de 10-99 KB', () => {
    fc.assert(
      fc.property(arbJsonMediano(), (json) => {
        expect(() => JSON.parse(json)).not.toThrow();
        expect(json.length).toBeGreaterThanOrEqual(10 * KB);
        expect(json.length).toBeLessThanOrEqual(99 * KB);
      }),
      { numRuns: 10 }
    );
  });

  it('arbJsonGrande genera JSON válido de 100-500 KB', () => {
    fc.assert(
      fc.property(arbJsonGrande(), (json) => {
        expect(() => JSON.parse(json)).not.toThrow();
        expect(json.length).toBeGreaterThanOrEqual(100 * KB);
        expect(json.length).toBeLessThanOrEqual(500 * KB);
      }),
      { numRuns: 5 }
    );
  });

  it('arbJsonEnFrontera genera JSON en zona 90-110 KB', () => {
    fc.assert(
      fc.property(arbJsonEnFrontera(), (json) => {
        expect(() => JSON.parse(json)).not.toThrow();
        expect(json.length).toBeGreaterThanOrEqual(90 * KB);
        expect(json.length).toBeLessThanOrEqual(110 * KB);
      }),
      { numRuns: 10 }
    );
  });
});


describe('Generadores de datos — usuario-record.gen.js', () => {
  it('arbRolValido genera un rol del enum permitido', () => {
    fc.assert(
      fc.property(arbRolValido(), (rol) => {
        expect(ROLES_VALIDOS).toContain(rol);
      }),
      { numRuns: 50 }
    );
  });

  it('arbRolInvalido genera un string que NO está en el enum', () => {
    fc.assert(
      fc.property(arbRolInvalido(), (rol) => {
        expect(ROLES_VALIDOS).not.toContain(rol.toUpperCase());
      }),
      { numRuns: 50 }
    );
  });

  it('arbEmailNormalizado genera emails en minúsculas con @', () => {
    fc.assert(
      fc.property(arbEmailNormalizado(), (email) => {
        expect(email).toBe(email.toLowerCase());
        expect(email).toContain('@');
        expect(email.split('@')).toHaveLength(2);
        expect(email.split('@')[0].length).toBeGreaterThanOrEqual(3);
        expect(email.split('@')[1].length).toBeGreaterThanOrEqual(1);
      }),
      { numRuns: 50 }
    );
  });

  it('arbEmailsAlternos genera string de emails separados por coma (0-5)', () => {
    fc.assert(
      fc.property(arbEmailsAlternos(), (alternos) => {
        if (alternos === '') {
          // caso vacío (0 emails)
          expect(alternos).toBe('');
        } else {
          const emails = alternos.split(',');
          expect(emails.length).toBeGreaterThanOrEqual(1);
          expect(emails.length).toBeLessThanOrEqual(5);
          emails.forEach((e) => {
            expect(e).toContain('@');
            expect(e).toBe(e.toLowerCase());
          });
        }
      }),
      { numRuns: 50 }
    );
  });

  it('arbUsuarioRecord genera registros con campos condicionales correctos según rol', () => {
    fc.assert(
      fc.property(arbUsuarioRecord(), (usuario) => {
        expect(ROLES_VALIDOS).toContain(usuario.rol);
        expect(typeof usuario.email).toBe('string');
        expect(usuario.email).toContain('@');
        expect(typeof usuario.activo).toBe('boolean');
        expect(typeof usuario.cupo).toBe('number');
        expect(usuario.cupo).toBeGreaterThanOrEqual(0);
        expect(Array.isArray(usuario.emailsAlternos)).toBe(true);

        // Campos condicionales según rol
        if (ROLES_CON_DIRECTOR.includes(usuario.rol)) {
          expect(usuario.emailDirector).toContain('@');
          expect(usuario.emailGerente).toBe('');
        } else if (ROLES_CON_GERENTE.includes(usuario.rol)) {
          expect(usuario.emailGerente).toContain('@');
          expect(usuario.emailDirector).toBe('');
        } else {
          // GERENTE, ADMIN, ASESOR
          expect(usuario.emailDirector).toBe('');
          expect(usuario.emailGerente).toBe('');
        }
      }),
      { numRuns: 100 }
    );
  });

  it('arbJerarquiaUsuarios genera dataset con integridad referencial', () => {
    fc.assert(
      fc.property(arbJerarquiaUsuarios(), ({ gerentes, directores, subordinados, todos }) => {
        // Hay al menos 1 gerente, 1 director, 1 subordinado
        expect(gerentes.length).toBeGreaterThanOrEqual(1);
        expect(directores.length).toBeGreaterThanOrEqual(1);
        expect(subordinados.length).toBeGreaterThanOrEqual(1);
        expect(todos.length).toBe(gerentes.length + directores.length + subordinados.length);

        // Todos los gerentes tienen rol GERENTE
        gerentes.forEach((g) => expect(g.rol).toBe('GERENTE'));

        // Todos los directores tienen rol DIRECTOR y apuntan a un gerente existente
        const emailsGerentes = gerentes.map((g) => g.email);
        directores.forEach((d) => {
          expect(d.rol).toBe('DIRECTOR');
          expect(emailsGerentes).toContain(d.emailGerente);
        });

        // Todos los subordinados apuntan a un director existente
        const emailsDirectores = directores.map((d) => d.email);
        subordinados.forEach((s) => {
          expect(ROLES_CON_DIRECTOR).toContain(s.rol);
          expect(emailsDirectores).toContain(s.emailDirector);
        });
      }),
      { numRuns: 50 }
    );
  });

  it('arbDatosEsquemaViejo genera filas de 8 columnas con roles viejos', () => {
    fc.assert(
      fc.property(arbDatosEsquemaViejo({ minFilas: 3, maxFilas: 10 }), (filas) => {
        expect(filas.length).toBeGreaterThanOrEqual(3);
        expect(filas.length).toBeLessThanOrEqual(10);
        filas.forEach((fila) => {
          expect(fila).toHaveLength(8);
          // EMAIL (A) debe contener @
          expect(fila[0]).toContain('@');
          // NOMBRE (B) es string no vacío
          expect(fila[1].length).toBeGreaterThan(0);
          // ROL (C) es uno de los roles viejos
          expect(ROLES_VIEJOS).toContain(fila[2]);
          // CUPO (D) es string numérico
          expect(Number(fila[3])).not.toBeNaN();
          // ACTIVO (H) es TRUE o FALSE
          expect(['TRUE', 'FALSE']).toContain(fila[7]);
        });
      }),
      { numRuns: 30 }
    );
  });
});
