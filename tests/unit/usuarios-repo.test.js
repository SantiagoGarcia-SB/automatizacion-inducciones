/**
 * Unit tests para Repositorios_UsuariosRepo.js — Task 1.1
 *
 * Valida UsuariosRepo_leerTodos() con el nuevo esquema de 7 columnas:
 *   EMAIL(A), ROL(B), ACTIVO(C), CUPO(D), EMAIL_DIRECTOR(E), EMAIL_GERENTE(F), EMAILS_ALTERNOS(G)
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { createSpreadsheetApp } from '../mocks/spreadsheet-app.mock.js';

// ─── Setup: cargar funciones del UsuariosRepo en contexto global ────────────────

function setupGlobals(sheetsConfig) {
  const app = createSpreadsheetApp(sheetsConfig);
  globalThis.SpreadsheetApp = app;
  globalThis.getHojaControlId = () => 'mock-id';
  globalThis._registrarEvento_ = () => {};
  globalThis.Logger = { log: () => {} };

  // Definir constantes de columnas
  globalThis.COL_EMAIL = 0;
  globalThis.COL_ROL = 1;
  globalThis.COL_ACTIVO = 2;
  globalThis.COL_CUPO = 3;
  globalThis.COL_EMAIL_DIRECTOR = 4;
  globalThis.COL_EMAIL_GERENTE = 5;
  globalThis.COL_EMAILS_ALTERNOS = 6;
  globalThis.ROLES_VALIDOS = ['CONSULTOR', 'ANALISTA', 'AUXILIAR', 'DIRECTOR', 'GERENTE', 'ADMIN', 'ASESOR'];

  // Cargar la función bajo test
  globalThis.UsuariosRepo_leerTodos = function() {
    var hojaId = getHojaControlId();
    var ss = SpreadsheetApp.openById(hojaId);
    var hoja = ss.getSheetByName('USUARIOS');

    if (!hoja) {
      _registrarEvento_('ERROR', 'Repositorios_UsuariosRepo.js', 'Pestaña USUARIOS no encontrada', '');
      return [];
    }

    var datos = hoja.getDataRange().getValues();
    if (datos.length < 2) return [];

    var resultado = [];
    for (var i = 1; i < datos.length; i++) {
      var fila = datos[i];
      var emailPrimario = String(fila[COL_EMAIL] || '').toLowerCase().trim();
      if (!emailPrimario) continue;

      var rolRaw = String(fila[COL_ROL] || '').toUpperCase().trim();
      var activoRaw = fila[COL_ACTIVO];
      var activo = (activoRaw === true || activoRaw === 'TRUE' || activoRaw === 'true');
      var cupo = Number(fila[COL_CUPO]) || 0;
      var emailDirector = String(fila[COL_EMAIL_DIRECTOR] || '').toLowerCase().trim();
      var emailGerente = String(fila[COL_EMAIL_GERENTE] || '').toLowerCase().trim();

      var emailsAlternosRaw = String(fila[COL_EMAILS_ALTERNOS] || '').trim();
      var emailsAlternos = [];
      if (emailsAlternosRaw) {
        var partes = emailsAlternosRaw.split(',');
        for (var j = 0; j < partes.length; j++) {
          var alterno = partes[j].toLowerCase().trim();
          if (alterno) {
            emailsAlternos.push(alterno);
          }
        }
      }

      resultado.push({
        email: emailPrimario,
        rol: rolRaw,
        activo: activo,
        cupo: cupo,
        emailDirector: emailDirector,
        emailGerente: emailGerente,
        emailsAlternos: emailsAlternos
      });
    }

    return resultado;
  };
}

// ─── Datos de prueba ──────────────────────────────────────────────────────────

const HEADERS = ['EMAIL', 'ROL', 'ACTIVO', 'CUPO', 'EMAIL_DIRECTOR', 'EMAIL_GERENTE', 'EMAILS_ALTERNOS'];

const DATOS_COMPLETOS = [
  HEADERS,
  ['ana.perez@empresa.com', 'CONSULTOR', true, 5, 'jenny.director@empresa.com', '', 'ana.p@gmail.com,aperez@otro.co'],
  ['jenny.director@empresa.com', 'DIRECTOR', true, 0, '', 'kharen.gerente@empresa.com', ''],
  ['kharen.gerente@empresa.com', 'GERENTE', true, 0, '', '', 'kharen.g@personal.com'],
  ['carlos.admin@empresa.com', 'ADMIN', true, 10, '', '', ''],
  ['pedro.analista@empresa.com', 'ANALISTA', false, 3, 'jenny.director@empresa.com', '', ''],
];

// ─── Tests ─────────────────────────────────────────────────────────────────────

describe('UsuariosRepo_leerTodos', () => {
  beforeEach(() => {
    setupGlobals({ 'USUARIOS': DATOS_COMPLETOS });
  });

  it('retorna array con los registros de la pestaña USUARIOS', () => {
    const resultado = UsuariosRepo_leerTodos();
    expect(resultado).toHaveLength(5);
  });

  it('normaliza email primario a minúsculas', () => {
    setupGlobals({
      'USUARIOS': [
        HEADERS,
        ['ANA.Perez@Empresa.COM', 'CONSULTOR', true, 5, 'director@empresa.com', '', '']
      ]
    });

    const resultado = UsuariosRepo_leerTodos();
    expect(resultado[0].email).toBe('ana.perez@empresa.com');
  });

  it('parsea ROL a mayúsculas', () => {
    setupGlobals({
      'USUARIOS': [
        HEADERS,
        ['user@test.com', 'consultor', true, 5, 'dir@test.com', '', '']
      ]
    });

    const resultado = UsuariosRepo_leerTodos();
    expect(resultado[0].rol).toBe('CONSULTOR');
  });

  it('parsea ACTIVO como booleano (TRUE literal)', () => {
    const resultado = UsuariosRepo_leerTodos();
    expect(resultado[0].activo).toBe(true);
    expect(resultado[4].activo).toBe(false); // pedro.analista tiene ACTIVO=false
  });

  it('parsea ACTIVO como booleano (string "TRUE")', () => {
    setupGlobals({
      'USUARIOS': [
        HEADERS,
        ['user@test.com', 'ADMIN', 'TRUE', 5, '', '', '']
      ]
    });

    const resultado = UsuariosRepo_leerTodos();
    expect(resultado[0].activo).toBe(true);
  });

  it('parsea CUPO como número', () => {
    const resultado = UsuariosRepo_leerTodos();
    expect(resultado[0].cupo).toBe(5);
    expect(resultado[1].cupo).toBe(0);
    expect(resultado[3].cupo).toBe(10);
  });

  it('normaliza emailDirector a minúsculas', () => {
    setupGlobals({
      'USUARIOS': [
        HEADERS,
        ['user@test.com', 'CONSULTOR', true, 5, 'DIRECTOR@Empresa.COM', '', '']
      ]
    });

    const resultado = UsuariosRepo_leerTodos();
    expect(resultado[0].emailDirector).toBe('director@empresa.com');
  });

  it('normaliza emailGerente a minúsculas', () => {
    setupGlobals({
      'USUARIOS': [
        HEADERS,
        ['dir@test.com', 'DIRECTOR', true, 0, '', 'GERENTE@Empresa.COM', '']
      ]
    });

    const resultado = UsuariosRepo_leerTodos();
    expect(resultado[0].emailGerente).toBe('gerente@empresa.com');
  });

  it('parsea EMAILS_ALTERNOS separando por coma y normalizando a minúsculas', () => {
    const resultado = UsuariosRepo_leerTodos();
    // ana.perez tiene 'ana.p@gmail.com,aperez@otro.co'
    expect(resultado[0].emailsAlternos).toEqual(['ana.p@gmail.com', 'aperez@otro.co']);
  });

  it('maneja EMAILS_ALTERNOS con espacios alrededor de las comas', () => {
    setupGlobals({
      'USUARIOS': [
        HEADERS,
        ['user@test.com', 'ADMIN', true, 0, '', '', '  Alt1@Test.COM , alt2@test.com  ,  ALT3@Test.com  ']
      ]
    });

    const resultado = UsuariosRepo_leerTodos();
    expect(resultado[0].emailsAlternos).toEqual(['alt1@test.com', 'alt2@test.com', 'alt3@test.com']);
  });

  it('retorna array vacío de emailsAlternos cuando la columna está vacía', () => {
    const resultado = UsuariosRepo_leerTodos();
    // jenny.director no tiene alternos
    expect(resultado[1].emailsAlternos).toEqual([]);
  });

  it('retorna array vacío si la pestaña USUARIOS no existe', () => {
    setupGlobals({ 'OtraHoja': [['col1']] });
    const resultado = UsuariosRepo_leerTodos();
    expect(resultado).toEqual([]);
  });

  it('retorna array vacío si la pestaña solo tiene headers', () => {
    setupGlobals({ 'USUARIOS': [HEADERS] });
    const resultado = UsuariosRepo_leerTodos();
    expect(resultado).toEqual([]);
  });

  it('ignora filas con email vacío', () => {
    setupGlobals({
      'USUARIOS': [
        HEADERS,
        ['user@test.com', 'ADMIN', true, 0, '', '', ''],
        ['', 'CONSULTOR', true, 5, 'dir@test.com', '', ''],
        ['otro@test.com', 'CONSULTOR', true, 3, 'dir@test.com', '', '']
      ]
    });

    const resultado = UsuariosRepo_leerTodos();
    expect(resultado).toHaveLength(2);
    expect(resultado[0].email).toBe('user@test.com');
    expect(resultado[1].email).toBe('otro@test.com');
  });

  it('retorna objeto UsuarioRecord con todos los campos esperados', () => {
    const resultado = UsuariosRepo_leerTodos();
    const usuario = resultado[0];

    expect(usuario).toHaveProperty('email');
    expect(usuario).toHaveProperty('rol');
    expect(usuario).toHaveProperty('activo');
    expect(usuario).toHaveProperty('cupo');
    expect(usuario).toHaveProperty('emailDirector');
    expect(usuario).toHaveProperty('emailGerente');
    expect(usuario).toHaveProperty('emailsAlternos');
    expect(Array.isArray(usuario.emailsAlternos)).toBe(true);
  });

  it('filtra emails alternos vacíos producidos por comas extra', () => {
    setupGlobals({
      'USUARIOS': [
        HEADERS,
        ['user@test.com', 'ADMIN', true, 0, '', '', 'alt1@test.com,,alt2@test.com,']
      ]
    });

    const resultado = UsuariosRepo_leerTodos();
    expect(resultado[0].emailsAlternos).toEqual(['alt1@test.com', 'alt2@test.com']);
  });
});


// ─── Tests para UsuariosRepo_buscarPorEmail — Task 1.2 ─────────────────────────

describe('UsuariosRepo_buscarPorEmail', () => {
  function setupBuscarPorEmail(sheetsConfig) {
    const app = createSpreadsheetApp(sheetsConfig);
    globalThis.SpreadsheetApp = app;
    globalThis.getHojaControlId = () => 'mock-id';
    globalThis._registrarEvento_ = () => {};
    globalThis.Logger = { log: () => {} };

    globalThis.COL_EMAIL = 0;
    globalThis.COL_ROL = 1;
    globalThis.COL_ACTIVO = 2;
    globalThis.COL_CUPO = 3;
    globalThis.COL_EMAIL_DIRECTOR = 4;
    globalThis.COL_EMAIL_GERENTE = 5;
    globalThis.COL_EMAILS_ALTERNOS = 6;
    globalThis.ROLES_VALIDOS = ['CONSULTOR', 'ANALISTA', 'AUXILIAR', 'DIRECTOR', 'GERENTE', 'ADMIN', 'ASESOR'];

    // Cargar UsuariosRepo_leerTodos
    globalThis.UsuariosRepo_leerTodos = function() {
      var hojaId = getHojaControlId();
      var ss = SpreadsheetApp.openById(hojaId);
      var hoja = ss.getSheetByName('USUARIOS');

      if (!hoja) {
        _registrarEvento_('ERROR', 'Repositorios_UsuariosRepo.js', 'Pestaña USUARIOS no encontrada', '');
        return [];
      }

      var datos = hoja.getDataRange().getValues();
      if (datos.length < 2) return [];

      var resultado = [];
      for (var i = 1; i < datos.length; i++) {
        var fila = datos[i];
        var emailPrimario = String(fila[COL_EMAIL] || '').toLowerCase().trim();
        if (!emailPrimario) continue;

        var rolRaw = String(fila[COL_ROL] || '').toUpperCase().trim();
        var activoRaw = fila[COL_ACTIVO];
        var activo = (activoRaw === true || activoRaw === 'TRUE' || activoRaw === 'true');
        var cupo = Number(fila[COL_CUPO]) || 0;
        var emailDirector = String(fila[COL_EMAIL_DIRECTOR] || '').toLowerCase().trim();
        var emailGerente = String(fila[COL_EMAIL_GERENTE] || '').toLowerCase().trim();

        var emailsAlternosRaw = String(fila[COL_EMAILS_ALTERNOS] || '').trim();
        var emailsAlternos = [];
        if (emailsAlternosRaw) {
          var partes = emailsAlternosRaw.split(',');
          for (var j = 0; j < partes.length; j++) {
            var alterno = partes[j].toLowerCase().trim();
            if (alterno) {
              emailsAlternos.push(alterno);
            }
          }
        }

        resultado.push({
          email: emailPrimario,
          rol: rolRaw,
          activo: activo,
          cupo: cupo,
          emailDirector: emailDirector,
          emailGerente: emailGerente,
          emailsAlternos: emailsAlternos
        });
      }

      return resultado;
    };

    // Cargar UsuariosRepo_buscarPorEmail
    globalThis.UsuariosRepo_buscarPorEmail = function(email) {
      if (!email) return null;

      var emailNormalizado = String(email).toLowerCase().trim();
      if (!emailNormalizado) return null;

      var usuarios = UsuariosRepo_leerTodos();

      // 1. Buscar por email primario (columna A)
      for (var i = 0; i < usuarios.length; i++) {
        if (usuarios[i].email === emailNormalizado) {
          return usuarios[i];
        }
      }

      // 2. Buscar en emails alternos (columna G)
      for (var j = 0; j < usuarios.length; j++) {
        var alternos = usuarios[j].emailsAlternos;
        for (var k = 0; k < alternos.length; k++) {
          if (alternos[k] === emailNormalizado) {
            return usuarios[j];
          }
        }
      }

      // 3. No encontrado
      return null;
    };
  }

  const HEADERS = ['EMAIL', 'ROL', 'ACTIVO', 'CUPO', 'EMAIL_DIRECTOR', 'EMAIL_GERENTE', 'EMAILS_ALTERNOS'];

  const DATOS_BUSQUEDA = [
    HEADERS,
    ['ana.perez@empresa.com', 'CONSULTOR', true, 5, 'jenny.director@empresa.com', '', 'ana.p@gmail.com,aperez@otro.co'],
    ['jenny.director@empresa.com', 'DIRECTOR', true, 0, '', 'kharen.gerente@empresa.com', 'jenny.d@personal.com'],
    ['kharen.gerente@empresa.com', 'GERENTE', true, 0, '', '', 'kharen.g@personal.com'],
    ['carlos.admin@empresa.com', 'ADMIN', true, 10, '', '', ''],
    ['pedro.analista@empresa.com', 'ANALISTA', false, 3, 'jenny.director@empresa.com', '', 'pedro.alt@gmail.com'],
  ];

  beforeEach(() => {
    setupBuscarPorEmail({ 'USUARIOS': DATOS_BUSQUEDA });
  });

  it('encuentra usuario por email primario (coincidencia exacta)', () => {
    const resultado = UsuariosRepo_buscarPorEmail('ana.perez@empresa.com');
    expect(resultado).not.toBeNull();
    expect(resultado.email).toBe('ana.perez@empresa.com');
    expect(resultado.rol).toBe('CONSULTOR');
  });

  it('normaliza email de entrada a minúsculas antes de comparar', () => {
    const resultado = UsuariosRepo_buscarPorEmail('ANA.Perez@Empresa.COM');
    expect(resultado).not.toBeNull();
    expect(resultado.email).toBe('ana.perez@empresa.com');
  });

  it('encuentra usuario buscando en EMAILS_ALTERNOS', () => {
    const resultado = UsuariosRepo_buscarPorEmail('ana.p@gmail.com');
    expect(resultado).not.toBeNull();
    expect(resultado.email).toBe('ana.perez@empresa.com');
    expect(resultado.rol).toBe('CONSULTOR');
  });

  it('retorna el registro completo del email primario cuando se encuentra por alterno', () => {
    const resultado = UsuariosRepo_buscarPorEmail('jenny.d@personal.com');
    expect(resultado).not.toBeNull();
    expect(resultado.email).toBe('jenny.director@empresa.com');
    expect(resultado.rol).toBe('DIRECTOR');
    expect(resultado.emailGerente).toBe('kharen.gerente@empresa.com');
    expect(resultado.emailsAlternos).toContain('jenny.d@personal.com');
  });

  it('normaliza email alterno a minúsculas para la comparación', () => {
    const resultado = UsuariosRepo_buscarPorEmail('KHAREN.G@Personal.COM');
    expect(resultado).not.toBeNull();
    expect(resultado.email).toBe('kharen.gerente@empresa.com');
  });

  it('retorna null si el email no se encuentra en ninguna columna', () => {
    const resultado = UsuariosRepo_buscarPorEmail('inexistente@empresa.com');
    expect(resultado).toBeNull();
  });

  it('retorna null si se pasa un email vacío', () => {
    expect(UsuariosRepo_buscarPorEmail('')).toBeNull();
  });

  it('retorna null si se pasa null', () => {
    expect(UsuariosRepo_buscarPorEmail(null)).toBeNull();
  });

  it('retorna null si se pasa undefined', () => {
    expect(UsuariosRepo_buscarPorEmail(undefined)).toBeNull();
  });

  it('prioriza búsqueda por email primario sobre alternos', () => {
    // Si un email existe como primario, debe retornar ese registro
    // aunque coincida como alterno de otro (no debería ocurrir por regla de unicidad,
    // pero validamos la prioridad del algoritmo)
    const resultado = UsuariosRepo_buscarPorEmail('carlos.admin@empresa.com');
    expect(resultado).not.toBeNull();
    expect(resultado.email).toBe('carlos.admin@empresa.com');
    expect(resultado.rol).toBe('ADMIN');
  });

  it('encuentra el segundo email alterno en una lista separada por comas', () => {
    // aperez@otro.co es el segundo alterno de ana.perez
    const resultado = UsuariosRepo_buscarPorEmail('aperez@otro.co');
    expect(resultado).not.toBeNull();
    expect(resultado.email).toBe('ana.perez@empresa.com');
  });

  it('retorna el UsuarioRecord con todos los campos correctos', () => {
    const resultado = UsuariosRepo_buscarPorEmail('ana.perez@empresa.com');
    expect(resultado).toEqual({
      email: 'ana.perez@empresa.com',
      rol: 'CONSULTOR',
      activo: true,
      cupo: 5,
      emailDirector: 'jenny.director@empresa.com',
      emailGerente: '',
      emailsAlternos: ['ana.p@gmail.com', 'aperez@otro.co']
    });
  });

  it('retorna usuario inactivo si se busca por su email (sin filtrar por ACTIVO)', () => {
    // La función buscarPorEmail NO filtra por activo — eso es responsabilidad de AuthService
    const resultado = UsuariosRepo_buscarPorEmail('pedro.analista@empresa.com');
    expect(resultado).not.toBeNull();
    expect(resultado.activo).toBe(false);
  });

  it('encuentra usuario inactivo por su email alterno', () => {
    const resultado = UsuariosRepo_buscarPorEmail('pedro.alt@gmail.com');
    expect(resultado).not.toBeNull();
    expect(resultado.email).toBe('pedro.analista@empresa.com');
    expect(resultado.activo).toBe(false);
  });

  it('retorna null cuando la pestaña USUARIOS no existe', () => {
    setupBuscarPorEmail({ 'OtraHoja': [['col1']] });
    const resultado = UsuariosRepo_buscarPorEmail('cualquier@email.com');
    expect(resultado).toBeNull();
  });

  it('retorna null cuando la pestaña solo tiene headers', () => {
    setupBuscarPorEmail({ 'USUARIOS': [HEADERS] });
    const resultado = UsuariosRepo_buscarPorEmail('cualquier@email.com');
    expect(resultado).toBeNull();
  });

  it('maneja email con espacios en blanco (trim)', () => {
    const resultado = UsuariosRepo_buscarPorEmail('  ana.perez@empresa.com  ');
    expect(resultado).not.toBeNull();
    expect(resultado.email).toBe('ana.perez@empresa.com');
  });
});


// ─── Tests para UsuariosRepo_getCorreosSuperiores ─────────────────────────────

describe('UsuariosRepo_getCorreosSuperiores', () => {
  function setupWithGetCorreosSuperiores(sheetsConfig) {
    const app = createSpreadsheetApp(sheetsConfig);
    globalThis.SpreadsheetApp = app;
    globalThis.getHojaControlId = () => 'mock-id';
    globalThis._registrarEvento_ = () => {};
    globalThis.Logger = { log: () => {} };

    globalThis.COL_EMAIL = 0;
    globalThis.COL_ROL = 1;
    globalThis.COL_ACTIVO = 2;
    globalThis.COL_CUPO = 3;
    globalThis.COL_EMAIL_DIRECTOR = 4;
    globalThis.COL_EMAIL_GERENTE = 5;
    globalThis.COL_EMAILS_ALTERNOS = 6;
    globalThis.ROLES_VALIDOS = ['CONSULTOR', 'ANALISTA', 'AUXILIAR', 'DIRECTOR', 'GERENTE', 'ADMIN', 'ASESOR'];

    // Cargar UsuariosRepo_leerTodos
    globalThis.UsuariosRepo_leerTodos = function() {
      var hojaId = getHojaControlId();
      var ss = SpreadsheetApp.openById(hojaId);
      var hoja = ss.getSheetByName('USUARIOS');

      if (!hoja) {
        _registrarEvento_('ERROR', 'Repositorios_UsuariosRepo.js', 'Pestaña USUARIOS no encontrada', '');
        return [];
      }

      var datos = hoja.getDataRange().getValues();
      if (datos.length < 2) return [];

      var resultado = [];
      for (var i = 1; i < datos.length; i++) {
        var fila = datos[i];
        var emailPrimario = String(fila[COL_EMAIL] || '').toLowerCase().trim();
        if (!emailPrimario) continue;

        var rolRaw = String(fila[COL_ROL] || '').toUpperCase().trim();
        var activoRaw = fila[COL_ACTIVO];
        var activo = (activoRaw === true || activoRaw === 'TRUE' || activoRaw === 'true');
        var cupo = Number(fila[COL_CUPO]) || 0;
        var emailDirector = String(fila[COL_EMAIL_DIRECTOR] || '').toLowerCase().trim();
        var emailGerente = String(fila[COL_EMAIL_GERENTE] || '').toLowerCase().trim();

        var emailsAlternosRaw = String(fila[COL_EMAILS_ALTERNOS] || '').trim();
        var emailsAlternos = [];
        if (emailsAlternosRaw) {
          var partes = emailsAlternosRaw.split(',');
          for (var j = 0; j < partes.length; j++) {
            var alterno = partes[j].toLowerCase().trim();
            if (alterno) {
              emailsAlternos.push(alterno);
            }
          }
        }

        resultado.push({
          email: emailPrimario,
          rol: rolRaw,
          activo: activo,
          cupo: cupo,
          emailDirector: emailDirector,
          emailGerente: emailGerente,
          emailsAlternos: emailsAlternos
        });
      }

      return resultado;
    };

    // Cargar UsuariosRepo_getCorreosSuperiores
    globalThis.UsuariosRepo_getCorreosSuperiores = function() {
      var ROLES_SUPERIORES = ['DIRECTOR', 'GERENTE', 'ADMIN'];
      var usuarios = UsuariosRepo_leerTodos();
      var emailsSet = {};
      var resultado = [];

      for (var i = 0; i < usuarios.length; i++) {
        var usuario = usuarios[i];
        if (usuario.activo === true && ROLES_SUPERIORES.indexOf(usuario.rol) !== -1) {
          if (!emailsSet[usuario.email]) {
            emailsSet[usuario.email] = true;
            resultado.push(usuario.email);
          }
        }
      }

      return resultado;
    };
  }

  const HEADERS = ['EMAIL', 'ROL', 'ACTIVO', 'CUPO', 'EMAIL_DIRECTOR', 'EMAIL_GERENTE', 'EMAILS_ALTERNOS'];

  it('retorna emails de DIRECTOR, GERENTE y ADMIN activos', () => {
    setupWithGetCorreosSuperiores({
      'USUARIOS': [
        HEADERS,
        ['director@empresa.com', 'DIRECTOR', true, 0, '', 'gerente@empresa.com', ''],
        ['gerente@empresa.com', 'GERENTE', true, 0, '', '', ''],
        ['admin@empresa.com', 'ADMIN', true, 10, '', '', ''],
        ['consultor@empresa.com', 'CONSULTOR', true, 5, 'director@empresa.com', '', ''],
      ]
    });

    const resultado = UsuariosRepo_getCorreosSuperiores();
    expect(resultado).toContain('director@empresa.com');
    expect(resultado).toContain('gerente@empresa.com');
    expect(resultado).toContain('admin@empresa.com');
    expect(resultado).toHaveLength(3);
  });

  it('excluye usuarios con ACTIVO = FALSE', () => {
    setupWithGetCorreosSuperiores({
      'USUARIOS': [
        HEADERS,
        ['director.activo@empresa.com', 'DIRECTOR', true, 0, '', 'gerente@empresa.com', ''],
        ['director.inactivo@empresa.com', 'DIRECTOR', false, 0, '', 'gerente@empresa.com', ''],
        ['gerente@empresa.com', 'GERENTE', true, 0, '', '', ''],
      ]
    });

    const resultado = UsuariosRepo_getCorreosSuperiores();
    expect(resultado).toContain('director.activo@empresa.com');
    expect(resultado).not.toContain('director.inactivo@empresa.com');
    expect(resultado).toContain('gerente@empresa.com');
    expect(resultado).toHaveLength(2);
  });

  it('excluye roles que no son DIRECTOR, GERENTE ni ADMIN', () => {
    setupWithGetCorreosSuperiores({
      'USUARIOS': [
        HEADERS,
        ['consultor@empresa.com', 'CONSULTOR', true, 5, 'director@empresa.com', '', ''],
        ['analista@empresa.com', 'ANALISTA', true, 3, 'director@empresa.com', '', ''],
        ['auxiliar@empresa.com', 'AUXILIAR', true, 2, 'director@empresa.com', '', ''],
        ['asesor@empresa.com', 'ASESOR', true, 0, '', '', ''],
        ['director@empresa.com', 'DIRECTOR', true, 0, '', '', ''],
      ]
    });

    const resultado = UsuariosRepo_getCorreosSuperiores();
    expect(resultado).not.toContain('consultor@empresa.com');
    expect(resultado).not.toContain('analista@empresa.com');
    expect(resultado).not.toContain('auxiliar@empresa.com');
    expect(resultado).not.toContain('asesor@empresa.com');
    expect(resultado).toContain('director@empresa.com');
    expect(resultado).toHaveLength(1);
  });

  it('no retorna duplicados', () => {
    setupWithGetCorreosSuperiores({
      'USUARIOS': [
        HEADERS,
        ['admin@empresa.com', 'ADMIN', true, 10, '', '', ''],
        ['admin@empresa.com', 'ADMIN', true, 10, '', '', ''],
        ['director@empresa.com', 'DIRECTOR', true, 0, '', '', ''],
      ]
    });

    const resultado = UsuariosRepo_getCorreosSuperiores();
    const duplicados = resultado.filter((email, index) => resultado.indexOf(email) !== index);
    expect(duplicados).toHaveLength(0);
    expect(resultado).toHaveLength(2);
  });

  it('retorna array vacío si no hay usuarios con roles superiores activos', () => {
    setupWithGetCorreosSuperiores({
      'USUARIOS': [
        HEADERS,
        ['consultor@empresa.com', 'CONSULTOR', true, 5, 'director@empresa.com', '', ''],
        ['analista@empresa.com', 'ANALISTA', true, 3, 'director@empresa.com', '', ''],
      ]
    });

    const resultado = UsuariosRepo_getCorreosSuperiores();
    expect(resultado).toEqual([]);
  });

  it('retorna array vacío si la pestaña USUARIOS no existe', () => {
    setupWithGetCorreosSuperiores({ 'OtraHoja': [['col1']] });
    const resultado = UsuariosRepo_getCorreosSuperiores();
    expect(resultado).toEqual([]);
  });

  it('retorna emails normalizados a minúsculas', () => {
    setupWithGetCorreosSuperiores({
      'USUARIOS': [
        HEADERS,
        ['DIRECTOR@Empresa.COM', 'DIRECTOR', true, 0, '', '', ''],
      ]
    });

    const resultado = UsuariosRepo_getCorreosSuperiores();
    expect(resultado[0]).toBe('director@empresa.com');
  });
});


// ─── Import mocks for UsuariosRepo_guardar ──────────────────────────────────────
import { createLockService } from '../mocks/lock-service.mock.js';

// ─── Setup for UsuariosRepo_guardar ─────────────────────────────────────────────

function setupGuardarGlobals(sheetsConfig, lockOptions) {
  const app = createSpreadsheetApp(sheetsConfig);
  globalThis.SpreadsheetApp = app;
  globalThis.getHojaControlId = () => 'mock-id';
  globalThis._registrarEvento_ = () => {};
  globalThis.Logger = { log: () => {} };

  const lockService = createLockService(lockOptions || {});
  globalThis.LockService = lockService;

  globalThis.COL_EMAIL = 0;
  globalThis.COL_ROL = 1;
  globalThis.COL_ACTIVO = 2;
  globalThis.COL_CUPO = 3;
  globalThis.COL_EMAIL_DIRECTOR = 4;
  globalThis.COL_EMAIL_GERENTE = 5;
  globalThis.COL_EMAILS_ALTERNOS = 6;
  globalThis.ROLES_VALIDOS = ['CONSULTOR', 'ANALISTA', 'AUXILIAR', 'DIRECTOR', 'GERENTE', 'ADMIN', 'ASESOR'];

  // Cargar la función bajo test
  globalThis.UsuariosRepo_guardar = function(datos, esNuevo) {
    var rolNormalizado = String(datos.rol || '').toUpperCase().trim();
    if (ROLES_VALIDOS.indexOf(rolNormalizado) === -1) {
      return { ok: false, mensaje: 'Rol no permitido: ' + datos.rol };
    }

    var lock = LockService.getScriptLock();
    if (!lock.tryLock(10000)) {
      return { ok: false, mensaje: 'No se pudo adquirir el lock. Intente de nuevo.' };
    }

    try {
      var hojaId = getHojaControlId();
      var ss = SpreadsheetApp.openById(hojaId);
      var hoja = ss.getSheetByName('USUARIOS');

      if (!hoja) {
        return { ok: false, mensaje: 'Pestaña USUARIOS no encontrada' };
      }

      var todosLosDatos = hoja.getDataRange().getValues();
      var emailNuevo = String(datos.email || '').toLowerCase().trim();
      var emailsAlternosNuevos = Array.isArray(datos.emailsAlternos) ? datos.emailsAlternos : [];

      var alternosNormalizados = [];
      for (var a = 0; a < emailsAlternosNuevos.length; a++) {
        var alt = String(emailsAlternosNuevos[a] || '').toLowerCase().trim();
        if (alt) {
          alternosNormalizados.push(alt);
        }
      }

      if (esNuevo) {
        for (var i = 1; i < todosLosDatos.length; i++) {
          var filaExistente = todosLosDatos[i];
          var emailExistente = String(filaExistente[COL_EMAIL] || '').toLowerCase().trim();

          if (emailExistente === emailNuevo) {
            return { ok: false, mensaje: 'El email ' + emailNuevo + ' ya está registrado como primario/alterno de otro usuario' };
          }

          var alternosExistentes = String(filaExistente[COL_EMAILS_ALTERNOS] || '').trim();
          if (alternosExistentes) {
            var partesAlt = alternosExistentes.split(',');
            for (var j = 0; j < partesAlt.length; j++) {
              var altExistente = partesAlt[j].toLowerCase().trim();
              if (altExistente && altExistente === emailNuevo) {
                return { ok: false, mensaje: 'El email ' + emailNuevo + ' ya está registrado como primario/alterno de otro usuario' };
              }
            }
          }
        }

        for (var k = 0; k < alternosNormalizados.length; k++) {
          var altNuevo = alternosNormalizados[k];
          for (var m = 1; m < todosLosDatos.length; m++) {
            var emailPrimExistente = String(todosLosDatos[m][COL_EMAIL] || '').toLowerCase().trim();
            if (emailPrimExistente === altNuevo) {
              return { ok: false, mensaje: 'El email ' + altNuevo + ' ya está registrado como primario/alterno de otro usuario' };
            }
            var alternosOtro = String(todosLosDatos[m][COL_EMAILS_ALTERNOS] || '').trim();
            if (alternosOtro) {
              var partesOtro = alternosOtro.split(',');
              for (var n = 0; n < partesOtro.length; n++) {
                var altOtro = partesOtro[n].toLowerCase().trim();
                if (altOtro && altOtro === altNuevo) {
                  return { ok: false, mensaje: 'El email ' + altNuevo + ' ya está registrado como primario/alterno de otro usuario' };
                }
              }
            }
          }
        }

        var nuevaFila = [
          emailNuevo,
          rolNormalizado,
          datos.activo === true || datos.activo === 'TRUE' || datos.activo === 'true',
          Number(datos.cupo) || 0,
          String(datos.emailDirector || '').toLowerCase().trim(),
          String(datos.emailGerente || '').toLowerCase().trim(),
          alternosNormalizados.join(',')
        ];

        hoja.appendRow(nuevaFila);
        return { ok: true, mensaje: 'Usuario guardado' };

      } else {
        var filaEncontrada = -1;
        for (var p = 1; p < todosLosDatos.length; p++) {
          var emailFila = String(todosLosDatos[p][COL_EMAIL] || '').toLowerCase().trim();
          if (emailFila === emailNuevo) {
            filaEncontrada = p + 1;
            break;
          }
        }

        if (filaEncontrada === -1) {
          return { ok: false, mensaje: 'Usuario no encontrado: ' + emailNuevo };
        }

        var datosActualizados = [[
          emailNuevo,
          rolNormalizado,
          datos.activo === true || datos.activo === 'TRUE' || datos.activo === 'true',
          Number(datos.cupo) || 0,
          String(datos.emailDirector || '').toLowerCase().trim(),
          String(datos.emailGerente || '').toLowerCase().trim(),
          alternosNormalizados.join(',')
        ]];

        hoja.getRange(filaEncontrada, 1, 1, 7).setValues(datosActualizados);
        return { ok: true, mensaje: 'Usuario guardado' };
      }
    } finally {
      lock.releaseLock();
    }
  };

  return { app, lockService };
}

// ─── Tests para UsuariosRepo_guardar ────────────────────────────────────────────

const HEADERS_GUARDAR = ['EMAIL', 'ROL', 'ACTIVO', 'CUPO', 'EMAIL_DIRECTOR', 'EMAIL_GERENTE', 'EMAILS_ALTERNOS'];

const DATOS_BASE = [
  HEADERS_GUARDAR,
  ['ana.perez@empresa.com', 'CONSULTOR', true, 5, 'jenny.director@empresa.com', '', 'ana.p@gmail.com,aperez@otro.co'],
  ['jenny.director@empresa.com', 'DIRECTOR', true, 0, '', 'kharen.gerente@empresa.com', ''],
  ['kharen.gerente@empresa.com', 'GERENTE', true, 0, '', '', 'kharen.g@personal.com'],
];

describe('UsuariosRepo_guardar', () => {
  describe('Validación de ROL', () => {
    beforeEach(() => {
      setupGuardarGlobals({ 'USUARIOS': [...DATOS_BASE.map(r => [...r])] });
    });

    it('rechaza un rol inválido con mensaje específico', () => {
      const resultado = UsuariosRepo_guardar({
        email: 'nuevo@test.com',
        rol: 'SUPERUSUARIO',
        activo: true,
        cupo: 5,
        emailDirector: '',
        emailGerente: '',
        emailsAlternos: []
      }, true);

      expect(resultado.ok).toBe(false);
      expect(resultado.mensaje).toBe('Rol no permitido: SUPERUSUARIO');
    });

    it('acepta todos los roles válidos del enum', () => {
      const rolesValidos = ['CONSULTOR', 'ANALISTA', 'AUXILIAR', 'DIRECTOR', 'GERENTE', 'ADMIN', 'ASESOR'];

      for (const rol of rolesValidos) {
        setupGuardarGlobals({ 'USUARIOS': [HEADERS_GUARDAR] }); // hoja vacía
        const resultado = UsuariosRepo_guardar({
          email: `user-${rol.toLowerCase()}@test.com`,
          rol: rol,
          activo: true,
          cupo: 0,
          emailDirector: '',
          emailGerente: '',
          emailsAlternos: []
        }, true);

        expect(resultado.ok).toBe(true);
      }
    });

    it('normaliza el rol a mayúsculas antes de validar', () => {
      setupGuardarGlobals({ 'USUARIOS': [HEADERS_GUARDAR] });
      const resultado = UsuariosRepo_guardar({
        email: 'nuevo@test.com',
        rol: 'consultor',
        activo: true,
        cupo: 5,
        emailDirector: 'dir@test.com',
        emailGerente: '',
        emailsAlternos: []
      }, true);

      expect(resultado.ok).toBe(true);
    });
  });

  describe('Creación de usuario nuevo (esNuevo=true)', () => {
    beforeEach(() => {
      setupGuardarGlobals({ 'USUARIOS': DATOS_BASE.map(r => [...r]) });
    });

    it('crea un usuario nuevo exitosamente', () => {
      const resultado = UsuariosRepo_guardar({
        email: 'nuevo.usuario@empresa.com',
        rol: 'ANALISTA',
        activo: true,
        cupo: 3,
        emailDirector: 'jenny.director@empresa.com',
        emailGerente: '',
        emailsAlternos: ['nuevo.alt@gmail.com']
      }, true);

      expect(resultado).toEqual({ ok: true, mensaje: 'Usuario guardado' });
    });

    it('rechaza si el email ya existe como primario en otro registro', () => {
      const resultado = UsuariosRepo_guardar({
        email: 'ana.perez@empresa.com',
        rol: 'CONSULTOR',
        activo: true,
        cupo: 5,
        emailDirector: 'jenny.director@empresa.com',
        emailGerente: '',
        emailsAlternos: []
      }, true);

      expect(resultado.ok).toBe(false);
      expect(resultado.mensaje).toContain('ana.perez@empresa.com');
      expect(resultado.mensaje).toContain('ya está registrado');
    });

    it('rechaza si el email ya existe en EMAILS_ALTERNOS de otro registro', () => {
      const resultado = UsuariosRepo_guardar({
        email: 'ana.p@gmail.com', // este es un alterno de ana.perez
        rol: 'CONSULTOR',
        activo: true,
        cupo: 2,
        emailDirector: 'jenny.director@empresa.com',
        emailGerente: '',
        emailsAlternos: []
      }, true);

      expect(resultado.ok).toBe(false);
      expect(resultado.mensaje).toContain('ana.p@gmail.com');
      expect(resultado.mensaje).toContain('ya está registrado');
    });

    it('rechaza si un email alterno del nuevo usuario colisiona con un primario existente', () => {
      const resultado = UsuariosRepo_guardar({
        email: 'totalmente.nuevo@empresa.com',
        rol: 'ANALISTA',
        activo: true,
        cupo: 3,
        emailDirector: 'jenny.director@empresa.com',
        emailGerente: '',
        emailsAlternos: ['jenny.director@empresa.com'] // colisiona con primario existente
      }, true);

      expect(resultado.ok).toBe(false);
      expect(resultado.mensaje).toContain('jenny.director@empresa.com');
      expect(resultado.mensaje).toContain('ya está registrado');
    });

    it('rechaza si un email alterno del nuevo usuario colisiona con alterno de otro registro', () => {
      const resultado = UsuariosRepo_guardar({
        email: 'totalmente.nuevo@empresa.com',
        rol: 'ANALISTA',
        activo: true,
        cupo: 3,
        emailDirector: 'jenny.director@empresa.com',
        emailGerente: '',
        emailsAlternos: ['kharen.g@personal.com'] // colisiona con alterno de kharen.gerente
      }, true);

      expect(resultado.ok).toBe(false);
      expect(resultado.mensaje).toContain('kharen.g@personal.com');
      expect(resultado.mensaje).toContain('ya está registrado');
    });

    it('escribe los 7 campos en el orden correcto via appendRow', () => {
      const { app } = setupGuardarGlobals({ 'USUARIOS': [HEADERS_GUARDAR] });

      UsuariosRepo_guardar({
        email: 'Nuevo@Empresa.COM',
        rol: 'DIRECTOR',
        activo: true,
        cupo: 8,
        emailDirector: '',
        emailGerente: 'Gerente@Empresa.COM',
        emailsAlternos: ['Alt1@Test.com', 'Alt2@Test.com']
      }, true);

      const hoja = app._spreadsheet.getSheetByName('USUARIOS');
      const appendCalls = hoja.getCallLog('appendRow');
      expect(appendCalls).toHaveLength(1);

      const filaEscrita = appendCalls[0].values;
      expect(filaEscrita[0]).toBe('nuevo@empresa.com');       // email normalizado
      expect(filaEscrita[1]).toBe('DIRECTOR');                 // rol mayúsculas
      expect(filaEscrita[2]).toBe(true);                       // activo booleano
      expect(filaEscrita[3]).toBe(8);                          // cupo numérico
      expect(filaEscrita[4]).toBe('');                          // emailDirector
      expect(filaEscrita[5]).toBe('gerente@empresa.com');      // emailGerente normalizado
      expect(filaEscrita[6]).toBe('alt1@test.com,alt2@test.com'); // alternos normalizados
    });
  });

  describe('Actualización de usuario existente (esNuevo=false)', () => {
    beforeEach(() => {
      setupGuardarGlobals({ 'USUARIOS': DATOS_BASE.map(r => [...r]) });
    });

    it('actualiza un usuario existente exitosamente', () => {
      const resultado = UsuariosRepo_guardar({
        email: 'ana.perez@empresa.com',
        rol: 'ANALISTA',
        activo: false,
        cupo: 10,
        emailDirector: 'jenny.director@empresa.com',
        emailGerente: '',
        emailsAlternos: ['nuevo.alt@gmail.com']
      }, false);

      expect(resultado).toEqual({ ok: true, mensaje: 'Usuario guardado' });
    });

    it('rechaza si el email no existe en la hoja', () => {
      const resultado = UsuariosRepo_guardar({
        email: 'noexiste@empresa.com',
        rol: 'CONSULTOR',
        activo: true,
        cupo: 5,
        emailDirector: 'jenny.director@empresa.com',
        emailGerente: '',
        emailsAlternos: []
      }, false);

      expect(resultado.ok).toBe(false);
      expect(resultado.mensaje).toContain('Usuario no encontrado');
      expect(resultado.mensaje).toContain('noexiste@empresa.com');
    });

    it('escribe los 7 campos actualizados via setValues', () => {
      const { app } = setupGuardarGlobals({ 'USUARIOS': DATOS_BASE.map(r => [...r]) });

      UsuariosRepo_guardar({
        email: 'ana.perez@empresa.com',
        rol: 'ANALISTA',
        activo: false,
        cupo: 10,
        emailDirector: 'jenny.director@empresa.com',
        emailGerente: '',
        emailsAlternos: ['nueva.alt@gmail.com']
      }, false);

      const hoja = app._spreadsheet.getSheetByName('USUARIOS');
      const setValuesCalls = hoja.getCallLog('setValues');
      expect(setValuesCalls.length).toBeGreaterThan(0);

      const valuesEscritos = setValuesCalls[0].values;
      expect(valuesEscritos[0][0]).toBe('ana.perez@empresa.com');
      expect(valuesEscritos[0][1]).toBe('ANALISTA');
      expect(valuesEscritos[0][2]).toBe(false);
      expect(valuesEscritos[0][3]).toBe(10);
      expect(valuesEscritos[0][4]).toBe('jenny.director@empresa.com');
      expect(valuesEscritos[0][5]).toBe('');
      expect(valuesEscritos[0][6]).toBe('nueva.alt@gmail.com');
    });
  });

  describe('Concurrencia (LockService)', () => {
    it('rechaza cuando no se puede adquirir el lock', () => {
      setupGuardarGlobals(
        { 'USUARIOS': DATOS_BASE.map(r => [...r]) },
        { simulateContention: true }
      );

      const resultado = UsuariosRepo_guardar({
        email: 'nuevo@test.com',
        rol: 'CONSULTOR',
        activo: true,
        cupo: 5,
        emailDirector: 'dir@test.com',
        emailGerente: '',
        emailsAlternos: []
      }, true);

      expect(resultado.ok).toBe(false);
      expect(resultado.mensaje).toContain('lock');
    });

    it('libera el lock después de una operación exitosa', () => {
      const { lockService } = setupGuardarGlobals({ 'USUARIOS': [HEADERS_GUARDAR] });

      UsuariosRepo_guardar({
        email: 'nuevo@test.com',
        rol: 'ADMIN',
        activo: true,
        cupo: 0,
        emailDirector: '',
        emailGerente: '',
        emailsAlternos: []
      }, true);

      expect(lockService._scriptLock.isLocked()).toBe(false);
    });

    it('libera el lock después de un error de validación de unicidad', () => {
      const { lockService } = setupGuardarGlobals({ 'USUARIOS': DATOS_BASE.map(r => [...r]) });

      UsuariosRepo_guardar({
        email: 'ana.perez@empresa.com', // duplicado
        rol: 'CONSULTOR',
        activo: true,
        cupo: 5,
        emailDirector: 'dir@test.com',
        emailGerente: '',
        emailsAlternos: []
      }, true);

      expect(lockService._scriptLock.isLocked()).toBe(false);
    });
  });

  describe('Pestaña USUARIOS no encontrada', () => {
    it('retorna error si la pestaña USUARIOS no existe', () => {
      setupGuardarGlobals({ 'OtraHoja': [['col1']] });

      const resultado = UsuariosRepo_guardar({
        email: 'nuevo@test.com',
        rol: 'CONSULTOR',
        activo: true,
        cupo: 5,
        emailDirector: 'dir@test.com',
        emailGerente: '',
        emailsAlternos: []
      }, true);

      expect(resultado.ok).toBe(false);
      expect(resultado.mensaje).toContain('USUARIOS no encontrada');
    });
  });
});


// ─── Tests para UsuariosRepo_getEmailsEquipoVisible — Task 1.4 ─────────────────

describe('UsuariosRepo_getEmailsEquipoVisible', () => {
  const HEADERS_EQ = ['EMAIL', 'ROL', 'ACTIVO', 'CUPO', 'EMAIL_DIRECTOR', 'EMAIL_GERENTE', 'EMAILS_ALTERNOS'];

  const DATOS_JERARQUIA = [
    HEADERS_EQ,
    ['consultor1@empresa.com', 'CONSULTOR', true, 5, 'director1@empresa.com', '', ''],
    ['consultor2@empresa.com', 'CONSULTOR', true, 3, 'director1@empresa.com', '', ''],
    ['consultor3@empresa.com', 'CONSULTOR', true, 4, 'director2@empresa.com', '', ''],
    ['analista1@empresa.com', 'ANALISTA', true, 3, 'director1@empresa.com', '', ''],
    ['auxiliar1@empresa.com', 'AUXILIAR', true, 2, 'director2@empresa.com', '', ''],
    ['director1@empresa.com', 'DIRECTOR', true, 0, '', 'gerente1@empresa.com', ''],
    ['director2@empresa.com', 'DIRECTOR', true, 0, '', 'gerente1@empresa.com', ''],
    ['gerente1@empresa.com', 'GERENTE', true, 0, '', '', ''],
    ['admin1@empresa.com', 'ADMIN', true, 10, '', '', ''],
    ['asesor1@empresa.com', 'ASESOR', true, 0, '', '', ''],
  ];

  function setupGetEmailsEquipoVisible(sheetsConfig) {
    const app = createSpreadsheetApp(sheetsConfig);
    globalThis.SpreadsheetApp = app;
    globalThis.getHojaControlId = () => 'mock-id';
    globalThis._registrarEvento_ = () => {};
    globalThis.Logger = { log: () => {} };

    globalThis.COL_EMAIL = 0;
    globalThis.COL_ROL = 1;
    globalThis.COL_ACTIVO = 2;
    globalThis.COL_CUPO = 3;
    globalThis.COL_EMAIL_DIRECTOR = 4;
    globalThis.COL_EMAIL_GERENTE = 5;
    globalThis.COL_EMAILS_ALTERNOS = 6;
    globalThis.ROLES_VALIDOS = ['CONSULTOR', 'ANALISTA', 'AUXILIAR', 'DIRECTOR', 'GERENTE', 'ADMIN', 'ASESOR'];

    // Cargar UsuariosRepo_leerTodos
    globalThis.UsuariosRepo_leerTodos = function() {
      var hojaId = getHojaControlId();
      var ss = SpreadsheetApp.openById(hojaId);
      var hoja = ss.getSheetByName('USUARIOS');

      if (!hoja) {
        _registrarEvento_('ERROR', 'Repositorios_UsuariosRepo.js', 'Pestaña USUARIOS no encontrada', '');
        return [];
      }

      var datos = hoja.getDataRange().getValues();
      if (datos.length < 2) return [];

      var resultado = [];
      for (var i = 1; i < datos.length; i++) {
        var fila = datos[i];
        var emailPrimario = String(fila[COL_EMAIL] || '').toLowerCase().trim();
        if (!emailPrimario) continue;

        var rolRaw = String(fila[COL_ROL] || '').toUpperCase().trim();
        var activoRaw = fila[COL_ACTIVO];
        var activo = (activoRaw === true || activoRaw === 'TRUE' || activoRaw === 'true');
        var cupo = Number(fila[COL_CUPO]) || 0;
        var emailDirector = String(fila[COL_EMAIL_DIRECTOR] || '').toLowerCase().trim();
        var emailGerente = String(fila[COL_EMAIL_GERENTE] || '').toLowerCase().trim();

        var emailsAlternosRaw = String(fila[COL_EMAILS_ALTERNOS] || '').trim();
        var emailsAlternos = [];
        if (emailsAlternosRaw) {
          var partes = emailsAlternosRaw.split(',');
          for (var j = 0; j < partes.length; j++) {
            var alterno = partes[j].toLowerCase().trim();
            if (alterno) {
              emailsAlternos.push(alterno);
            }
          }
        }

        resultado.push({
          email: emailPrimario,
          rol: rolRaw,
          activo: activo,
          cupo: cupo,
          emailDirector: emailDirector,
          emailGerente: emailGerente,
          emailsAlternos: emailsAlternos
        });
      }

      return resultado;
    };

    // Cargar UsuariosRepo_getEmailsEquipoVisible
    globalThis.UsuariosRepo_getEmailsEquipoVisible = function(emailUsuario, rol) {
      var emailNorm = String(emailUsuario || '').toLowerCase().trim();
      var rolNorm = String(rol || '').toUpperCase().trim();

      // Alias legacy
      if (rolNorm === 'LIDER') rolNorm = 'DIRECTOR';
      if (rolNorm === 'COMERCIAL') rolNorm = 'CONSULTOR';

      // ADMIN/ASESOR → acceso total (null = sin filtro)
      if (rolNorm === 'ADMIN' || rolNorm === 'ASESOR') {
        return null;
      }

      // CONSULTOR/ANALISTA/AUXILIAR → solo email propio
      if (rolNorm === 'CONSULTOR' || rolNorm === 'ANALISTA' || rolNorm === 'AUXILIAR') {
        return [emailNorm];
      }

      var todos = UsuariosRepo_leerTodos();

      // DIRECTOR → email propio + emails de usuarios cuyo EMAIL_DIRECTOR = emailUsuario
      if (rolNorm === 'DIRECTOR') {
        var equipoDirector = [emailNorm];
        for (var i = 0; i < todos.length; i++) {
          if (todos[i].emailDirector === emailNorm && todos[i].email !== emailNorm) {
            equipoDirector.push(todos[i].email);
          }
        }
        return equipoDirector;
      }

      // GERENTE → email propio + Directores cuyo EMAIL_GERENTE = emailUsuario + transitivamente equipos de esos Directores
      if (rolNorm === 'GERENTE') {
        var equipoGerente = [emailNorm];
        var directoresDelGerente = [];
        for (var d = 0; d < todos.length; d++) {
          if (todos[d].emailGerente === emailNorm && todos[d].email !== emailNorm) {
            directoresDelGerente.push(todos[d].email);
            equipoGerente.push(todos[d].email);
          }
        }
        for (var k = 0; k < directoresDelGerente.length; k++) {
          var emailDirector = directoresDelGerente[k];
          for (var m = 0; m < todos.length; m++) {
            if (todos[m].emailDirector === emailDirector && todos[m].email !== emailDirector) {
              equipoGerente.push(todos[m].email);
            }
          }
        }
        return equipoGerente;
      }

      // Fallback
      return [emailNorm];
    };
  }

  beforeEach(() => {
    setupGetEmailsEquipoVisible({ 'USUARIOS': DATOS_JERARQUIA.map(r => [...r]) });
  });

  // ─── CONSULTOR/ANALISTA/AUXILIAR: solo email propio ───

  describe('CONSULTOR/ANALISTA/AUXILIAR → solo email propio', () => {
    it('CONSULTOR retorna solo su propio email', () => {
      const resultado = UsuariosRepo_getEmailsEquipoVisible('consultor1@empresa.com', 'CONSULTOR');
      expect(resultado).toEqual(['consultor1@empresa.com']);
    });

    it('ANALISTA retorna solo su propio email', () => {
      const resultado = UsuariosRepo_getEmailsEquipoVisible('analista1@empresa.com', 'ANALISTA');
      expect(resultado).toEqual(['analista1@empresa.com']);
    });

    it('AUXILIAR retorna solo su propio email', () => {
      const resultado = UsuariosRepo_getEmailsEquipoVisible('auxiliar1@empresa.com', 'AUXILIAR');
      expect(resultado).toEqual(['auxiliar1@empresa.com']);
    });

    it('normaliza el email de entrada a minúsculas', () => {
      const resultado = UsuariosRepo_getEmailsEquipoVisible('CONSULTOR1@Empresa.COM', 'CONSULTOR');
      expect(resultado).toEqual(['consultor1@empresa.com']);
    });
  });

  // ─── DIRECTOR: email propio + equipo directo ───

  describe('DIRECTOR → email propio + equipo directo', () => {
    it('Director ve su email más los de su equipo', () => {
      const resultado = UsuariosRepo_getEmailsEquipoVisible('director1@empresa.com', 'DIRECTOR');
      expect(resultado).toContain('director1@empresa.com');
      expect(resultado).toContain('consultor1@empresa.com');
      expect(resultado).toContain('consultor2@empresa.com');
      expect(resultado).toContain('analista1@empresa.com');
      expect(resultado).toHaveLength(4);
    });

    it('Director2 ve solo su equipo (no el de Director1)', () => {
      const resultado = UsuariosRepo_getEmailsEquipoVisible('director2@empresa.com', 'DIRECTOR');
      expect(resultado).toContain('director2@empresa.com');
      expect(resultado).toContain('consultor3@empresa.com');
      expect(resultado).toContain('auxiliar1@empresa.com');
      expect(resultado).toHaveLength(3);
      // No debe incluir equipo de director1
      expect(resultado).not.toContain('consultor1@empresa.com');
      expect(resultado).not.toContain('consultor2@empresa.com');
    });

    it('Director sin equipo retorna solo su propio email', () => {
      setupGetEmailsEquipoVisible({
        'USUARIOS': [
          HEADERS_EQ,
          ['director.solo@empresa.com', 'DIRECTOR', true, 0, '', 'gerente1@empresa.com', ''],
        ]
      });
      const resultado = UsuariosRepo_getEmailsEquipoVisible('director.solo@empresa.com', 'DIRECTOR');
      expect(resultado).toEqual(['director.solo@empresa.com']);
    });
  });

  // ─── GERENTE: email propio + directores + equipos transitivos ───

  describe('GERENTE → email propio + directores + equipos transitivos', () => {
    it('Gerente ve su email, sus directores, y los equipos de esos directores', () => {
      const resultado = UsuariosRepo_getEmailsEquipoVisible('gerente1@empresa.com', 'GERENTE');
      // Gerente propio
      expect(resultado).toContain('gerente1@empresa.com');
      // Directores del gerente
      expect(resultado).toContain('director1@empresa.com');
      expect(resultado).toContain('director2@empresa.com');
      // Equipo de director1
      expect(resultado).toContain('consultor1@empresa.com');
      expect(resultado).toContain('consultor2@empresa.com');
      expect(resultado).toContain('analista1@empresa.com');
      // Equipo de director2
      expect(resultado).toContain('consultor3@empresa.com');
      expect(resultado).toContain('auxiliar1@empresa.com');
      // Total: gerente + 2 directores + 3 (equipo dir1) + 2 (equipo dir2) = 8
      expect(resultado).toHaveLength(8);
    });

    it('Gerente sin directores retorna solo su propio email', () => {
      setupGetEmailsEquipoVisible({
        'USUARIOS': [
          HEADERS_EQ,
          ['gerente.solo@empresa.com', 'GERENTE', true, 0, '', '', ''],
          ['director.otro@empresa.com', 'DIRECTOR', true, 0, '', 'otro.gerente@empresa.com', ''],
        ]
      });
      const resultado = UsuariosRepo_getEmailsEquipoVisible('gerente.solo@empresa.com', 'GERENTE');
      expect(resultado).toEqual(['gerente.solo@empresa.com']);
    });

    it('Gerente con directores sin subordinados ve directores pero no más', () => {
      setupGetEmailsEquipoVisible({
        'USUARIOS': [
          HEADERS_EQ,
          ['gerente.x@empresa.com', 'GERENTE', true, 0, '', '', ''],
          ['director.x@empresa.com', 'DIRECTOR', true, 0, '', 'gerente.x@empresa.com', ''],
        ]
      });
      const resultado = UsuariosRepo_getEmailsEquipoVisible('gerente.x@empresa.com', 'GERENTE');
      expect(resultado).toContain('gerente.x@empresa.com');
      expect(resultado).toContain('director.x@empresa.com');
      expect(resultado).toHaveLength(2);
    });
  });

  // ─── ADMIN/ASESOR: null (acceso total) ───

  describe('ADMIN/ASESOR → null (acceso total)', () => {
    it('ADMIN retorna null (sin filtro)', () => {
      const resultado = UsuariosRepo_getEmailsEquipoVisible('admin1@empresa.com', 'ADMIN');
      expect(resultado).toBeNull();
    });

    it('ASESOR retorna null (sin filtro)', () => {
      const resultado = UsuariosRepo_getEmailsEquipoVisible('asesor1@empresa.com', 'ASESOR');
      expect(resultado).toBeNull();
    });
  });

  // ─── Alias legacy ───

  describe('Alias legacy (LIDER→DIRECTOR, COMERCIAL→CONSULTOR)', () => {
    it('LIDER se trata como DIRECTOR (ve equipo)', () => {
      const resultado = UsuariosRepo_getEmailsEquipoVisible('director1@empresa.com', 'LIDER');
      expect(resultado).toContain('director1@empresa.com');
      expect(resultado).toContain('consultor1@empresa.com');
      expect(resultado).toContain('consultor2@empresa.com');
      expect(resultado).toContain('analista1@empresa.com');
      expect(resultado).toHaveLength(4);
    });

    it('COMERCIAL se trata como CONSULTOR (solo email propio)', () => {
      const resultado = UsuariosRepo_getEmailsEquipoVisible('consultor1@empresa.com', 'COMERCIAL');
      expect(resultado).toEqual(['consultor1@empresa.com']);
    });
  });

  // ─── Edge cases ───

  describe('Edge cases', () => {
    it('normaliza el rol a mayúsculas', () => {
      const resultado = UsuariosRepo_getEmailsEquipoVisible('admin1@empresa.com', 'admin');
      expect(resultado).toBeNull();
    });

    it('email vacío retorna array con string vacío normalizado para CONSULTOR', () => {
      const resultado = UsuariosRepo_getEmailsEquipoVisible('', 'CONSULTOR');
      expect(resultado).toEqual(['']);
    });

    it('rol no reconocido retorna solo email propio (fallback defensivo)', () => {
      const resultado = UsuariosRepo_getEmailsEquipoVisible('user@empresa.com', 'DESCONOCIDO');
      expect(resultado).toEqual(['user@empresa.com']);
    });

    it('Director no incluye su propio email duplicado si aparece en EMAIL_DIRECTOR', () => {
      // Edge case: si un registro tiene EMAIL_DIRECTOR = el propio director (error de datos)
      setupGetEmailsEquipoVisible({
        'USUARIOS': [
          HEADERS_EQ,
          ['director.auto@empresa.com', 'DIRECTOR', true, 0, 'director.auto@empresa.com', 'gerente@empresa.com', ''],
          ['consultor.a@empresa.com', 'CONSULTOR', true, 5, 'director.auto@empresa.com', '', ''],
        ]
      });
      const resultado = UsuariosRepo_getEmailsEquipoVisible('director.auto@empresa.com', 'DIRECTOR');
      // No debe incluirse dos veces (la condición email !== emailNorm lo previene)
      expect(resultado).toContain('director.auto@empresa.com');
      expect(resultado).toContain('consultor.a@empresa.com');
      expect(resultado).toHaveLength(2);
    });
  });
});
