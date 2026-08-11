/**
 * Unit tests para Servicios_AuthService.js — Task 2.5
 *
 * Valida:
 *   - obtenerCorreoDeDirector(email): lee EMAIL_DIRECTOR de Hoja_Usuarios
 *   - obtenerCorreosSuperiores(): wrapper cacheado en memoria sobre UsuariosRepo_getCorreosSuperiores
 *   - obtenerCorreosLideres(): alias de transición de obtenerCorreosSuperiores
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { createSpreadsheetApp } from '../mocks/spreadsheet-app.mock.js';

// ─── Datos de prueba ──────────────────────────────────────────────────────────

const HEADERS = ['EMAIL', 'ROL', 'ACTIVO', 'CUPO', 'EMAIL_DIRECTOR', 'EMAIL_GERENTE', 'EMAILS_ALTERNOS'];

const DATOS_USUARIOS = [
  HEADERS,
  ['ana.perez@empresa.com', 'CONSULTOR', true, 5, 'jenny.director@empresa.com', '', 'ana.p@gmail.com,aperez@otro.co'],
  ['jenny.director@empresa.com', 'DIRECTOR', true, 0, '', 'kharen.gerente@empresa.com', ''],
  ['kharen.gerente@empresa.com', 'GERENTE', true, 0, '', '', 'kharen.g@personal.com'],
  ['carlos.admin@empresa.com', 'ADMIN', true, 10, '', '', ''],
  ['pedro.analista@empresa.com', 'ANALISTA', false, 3, 'jenny.director@empresa.com', '', 'pedro.alt@gmail.com'],
  ['maria.auxiliar@empresa.com', 'AUXILIAR', true, 2, 'jenny.director@empresa.com', '', ''],
  ['director.inactivo@empresa.com', 'DIRECTOR', false, 0, '', 'kharen.gerente@empresa.com', ''],
];

// ─── Setup global ────────────────────────────────────────────────────────────

function setupGlobals(sheetsConfig) {
  const app = createSpreadsheetApp(sheetsConfig || { 'USUARIOS': DATOS_USUARIOS });
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

  // UsuariosRepo_leerTodos (copiar lógica de producción)
  globalThis.UsuariosRepo_leerTodos = function() {
    var hojaId = getHojaControlId();
    var ss = SpreadsheetApp.openById(hojaId);
    var hoja = ss.getSheetByName('USUARIOS');
    if (!hoja) return [];

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
          if (alterno) emailsAlternos.push(alterno);
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

  // UsuariosRepo_buscarPorEmail (copiar lógica de producción)
  globalThis.UsuariosRepo_buscarPorEmail = function(email) {
    if (!email) return null;
    var emailNormalizado = String(email).toLowerCase().trim();
    if (!emailNormalizado) return null;

    var usuarios = UsuariosRepo_leerTodos();

    for (var i = 0; i < usuarios.length; i++) {
      if (usuarios[i].email === emailNormalizado) return usuarios[i];
    }

    for (var j = 0; j < usuarios.length; j++) {
      var alternos = usuarios[j].emailsAlternos;
      for (var k = 0; k < alternos.length; k++) {
        if (alternos[k] === emailNormalizado) return usuarios[j];
      }
    }
    return null;
  };

  // UsuariosRepo_getCorreosSuperiores (copiar lógica de producción)
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

  // Reset cache de memoria de ejecución
  globalThis._cacheCorreosSuperiores = null;

  // Funciones bajo test (copiar lógica de AuthService)
  globalThis.obtenerCorreoDeDirector = function(emailUsuario) {
    var usuario = UsuariosRepo_buscarPorEmail(emailUsuario);
    if (!usuario) return '';
    return usuario.emailDirector || '';
  };

  globalThis.obtenerCorreosSuperiores = function() {
    if (globalThis._cacheCorreosSuperiores !== null) {
      return globalThis._cacheCorreosSuperiores;
    }
    globalThis._cacheCorreosSuperiores = UsuariosRepo_getCorreosSuperiores();
    return globalThis._cacheCorreosSuperiores;
  };

  globalThis.obtenerCorreosLideres = function() {
    return obtenerCorreosSuperiores();
  };
}

// ─── Tests para obtenerCorreoDeDirector ─────────────────────────────────────────

describe('obtenerCorreoDeDirector', () => {
  beforeEach(() => {
    setupGlobals();
  });

  it('retorna EMAIL_DIRECTOR de un consultor', () => {
    const resultado = obtenerCorreoDeDirector('ana.perez@empresa.com');
    expect(resultado).toBe('jenny.director@empresa.com');
  });

  it('retorna EMAIL_DIRECTOR buscando por email alterno', () => {
    const resultado = obtenerCorreoDeDirector('ana.p@gmail.com');
    expect(resultado).toBe('jenny.director@empresa.com');
  });

  it('retorna string vacío si el usuario no tiene EMAIL_DIRECTOR', () => {
    const resultado = obtenerCorreoDeDirector('carlos.admin@empresa.com');
    expect(resultado).toBe('');
  });

  it('retorna string vacío si el email no existe en el sistema', () => {
    const resultado = obtenerCorreoDeDirector('inexistente@empresa.com');
    expect(resultado).toBe('');
  });

  it('retorna string vacío si se pasa email vacío', () => {
    const resultado = obtenerCorreoDeDirector('');
    expect(resultado).toBe('');
  });

  it('retorna string vacío si se pasa null', () => {
    const resultado = obtenerCorreoDeDirector(null);
    expect(resultado).toBe('');
  });

  it('normaliza email de entrada (case-insensitive)', () => {
    const resultado = obtenerCorreoDeDirector('ANA.Perez@Empresa.COM');
    expect(resultado).toBe('jenny.director@empresa.com');
  });

  it('retorna EMAIL_DIRECTOR de un analista', () => {
    const resultado = obtenerCorreoDeDirector('pedro.analista@empresa.com');
    expect(resultado).toBe('jenny.director@empresa.com');
  });

  it('retorna EMAIL_DIRECTOR de un auxiliar', () => {
    const resultado = obtenerCorreoDeDirector('maria.auxiliar@empresa.com');
    expect(resultado).toBe('jenny.director@empresa.com');
  });

  it('retorna EMAIL_GERENTE vacío para un Director (no lo confunde)', () => {
    // obtenerCorreoDeDirector devuelve emailDirector, no emailGerente
    const resultado = obtenerCorreoDeDirector('jenny.director@empresa.com');
    expect(resultado).toBe('');
  });
});

// ─── Tests para obtenerCorreosSuperiores ──────────────────────────────────────

describe('obtenerCorreosSuperiores', () => {
  beforeEach(() => {
    setupGlobals();
  });

  it('retorna emails de DIRECTOR, GERENTE y ADMIN activos', () => {
    const resultado = obtenerCorreosSuperiores();
    expect(resultado).toContain('jenny.director@empresa.com');
    expect(resultado).toContain('kharen.gerente@empresa.com');
    expect(resultado).toContain('carlos.admin@empresa.com');
  });

  it('excluye usuarios con ACTIVO = FALSE', () => {
    const resultado = obtenerCorreosSuperiores();
    expect(resultado).not.toContain('director.inactivo@empresa.com');
  });

  it('excluye roles CONSULTOR, ANALISTA, AUXILIAR, ASESOR', () => {
    const resultado = obtenerCorreosSuperiores();
    expect(resultado).not.toContain('ana.perez@empresa.com');
    expect(resultado).not.toContain('pedro.analista@empresa.com');
    expect(resultado).not.toContain('maria.auxiliar@empresa.com');
  });

  it('cachea resultado en memoria para llamadas subsecuentes', () => {
    const primera = obtenerCorreosSuperiores();
    // Mutar datos subyacentes para probar que no se relee
    globalThis.UsuariosRepo_getCorreosSuperiores = () => ['diferente@test.com'];
    const segunda = obtenerCorreosSuperiores();
    expect(segunda).toEqual(primera);
  });

  it('retorna array vacío si no hay superiores activos', () => {
    setupGlobals({
      'USUARIOS': [
        HEADERS,
        ['consultor@empresa.com', 'CONSULTOR', true, 5, 'dir@empresa.com', '', ''],
      ]
    });
    const resultado = obtenerCorreosSuperiores();
    expect(resultado).toEqual([]);
  });
});

// ─── Tests para obtenerCorreosLideres (alias) ────────────────────────────────

describe('obtenerCorreosLideres', () => {
  beforeEach(() => {
    setupGlobals();
  });

  it('retorna el mismo resultado que obtenerCorreosSuperiores', () => {
    const superiores = obtenerCorreosSuperiores();
    // Reset cache para que obtenerCorreosLideres haga su propia llamada
    globalThis._cacheCorreosSuperiores = null;
    const lideres = obtenerCorreosLideres();
    expect(lideres).toEqual(superiores);
  });

  it('contiene DIRECTOR, GERENTE y ADMIN activos', () => {
    const resultado = obtenerCorreosLideres();
    expect(resultado).toContain('jenny.director@empresa.com');
    expect(resultado).toContain('kharen.gerente@empresa.com');
    expect(resultado).toContain('carlos.admin@empresa.com');
  });

  it('no contiene usuarios inactivos', () => {
    const resultado = obtenerCorreosLideres();
    expect(resultado).not.toContain('director.inactivo@empresa.com');
  });

  it('es un alias funcional de obtenerCorreosSuperiores', () => {
    // Verificar que ambas funciones retornan la misma referencia (desde cache)
    const resultA = obtenerCorreosLideres();
    const resultB = obtenerCorreosSuperiores();
    expect(resultA).toBe(resultB);
  });
});


// ─── Tests para _rolCoincide — Task 2.6 (Alias roles legacy) ────────────────────

describe('_rolCoincide — alias de roles legacy (Task 2.6)', () => {
  beforeEach(() => {
    // Cargar _rolCoincide en contexto global
    globalThis._rolCoincide = function(rolUsuario, rolesPermitidos) {
      if (rolesPermitidos.indexOf(rolUsuario) !== -1) return true;

      var ALIASES = {
        'CONSULTOR': 'COMERCIAL',
        'COMERCIAL': 'CONSULTOR',
        'DIRECTOR': 'LIDER',
        'LIDER': 'DIRECTOR'
      };

      var alias = ALIASES[rolUsuario];
      if (alias && rolesPermitidos.indexOf(alias) !== -1) return true;

      return false;
    };
  });

  describe('coincidencia directa (sin alias)', () => {
    it('retorna true si el rol está directamente en la lista de permitidos', () => {
      expect(_rolCoincide('CONSULTOR', ['CONSULTOR', 'ANALISTA'])).toBe(true);
    });

    it('retorna true para DIRECTOR en lista que incluye DIRECTOR', () => {
      expect(_rolCoincide('DIRECTOR', ['DIRECTOR', 'ADMIN'])).toBe(true);
    });

    it('retorna true para ADMIN en lista que incluye ADMIN', () => {
      expect(_rolCoincide('ADMIN', ['ADMIN'])).toBe(true);
    });

    it('retorna true para GERENTE en lista que incluye GERENTE', () => {
      expect(_rolCoincide('GERENTE', ['GERENTE', 'ADMIN'])).toBe(true);
    });

    it('retorna false si el rol no está en la lista y no tiene alias activo', () => {
      expect(_rolCoincide('ANALISTA', ['CONSULTOR', 'DIRECTOR'])).toBe(false);
    });
  });

  describe('alias CONSULTOR ↔ COMERCIAL (bidireccional)', () => {
    it('CONSULTOR acepta cuando rolesPermitidos incluye COMERCIAL', () => {
      expect(_rolCoincide('CONSULTOR', ['COMERCIAL'])).toBe(true);
    });

    it('COMERCIAL acepta cuando rolesPermitidos incluye CONSULTOR', () => {
      expect(_rolCoincide('COMERCIAL', ['CONSULTOR'])).toBe(true);
    });

    it('CONSULTOR acepta cuando rolesPermitidos incluye COMERCIAL entre otros', () => {
      expect(_rolCoincide('CONSULTOR', ['ADMIN', 'COMERCIAL', 'GERENTE'])).toBe(true);
    });

    it('COMERCIAL acepta cuando rolesPermitidos incluye CONSULTOR entre otros', () => {
      expect(_rolCoincide('COMERCIAL', ['DIRECTOR', 'CONSULTOR'])).toBe(true);
    });
  });

  describe('alias DIRECTOR ↔ LIDER (bidireccional)', () => {
    it('DIRECTOR acepta cuando rolesPermitidos incluye LIDER', () => {
      expect(_rolCoincide('DIRECTOR', ['LIDER'])).toBe(true);
    });

    it('LIDER acepta cuando rolesPermitidos incluye DIRECTOR', () => {
      expect(_rolCoincide('LIDER', ['DIRECTOR'])).toBe(true);
    });

    it('DIRECTOR acepta cuando rolesPermitidos incluye LIDER entre otros', () => {
      expect(_rolCoincide('DIRECTOR', ['CONSULTOR', 'LIDER', 'ADMIN'])).toBe(true);
    });

    it('LIDER acepta cuando rolesPermitidos incluye DIRECTOR entre otros', () => {
      expect(_rolCoincide('LIDER', ['CONSULTOR', 'DIRECTOR'])).toBe(true);
    });
  });

  describe('roles sin alias definido', () => {
    it('ANALISTA no tiene alias — solo coincide por inclusión directa', () => {
      expect(_rolCoincide('ANALISTA', ['ANALISTA'])).toBe(true);
      expect(_rolCoincide('ANALISTA', ['CONSULTOR', 'DIRECTOR'])).toBe(false);
    });

    it('AUXILIAR no tiene alias — solo coincide por inclusión directa', () => {
      expect(_rolCoincide('AUXILIAR', ['AUXILIAR'])).toBe(true);
      expect(_rolCoincide('AUXILIAR', ['COMERCIAL', 'LIDER'])).toBe(false);
    });

    it('GERENTE no tiene alias — solo coincide por inclusión directa', () => {
      expect(_rolCoincide('GERENTE', ['GERENTE'])).toBe(true);
      expect(_rolCoincide('GERENTE', ['LIDER', 'COMERCIAL'])).toBe(false);
    });

    it('ADMIN no tiene alias — solo coincide por inclusión directa', () => {
      expect(_rolCoincide('ADMIN', ['ADMIN'])).toBe(true);
      expect(_rolCoincide('ADMIN', ['CONSULTOR', 'DIRECTOR'])).toBe(false);
    });

    it('ASESOR no tiene alias — solo coincide por inclusión directa', () => {
      expect(_rolCoincide('ASESOR', ['ASESOR'])).toBe(true);
      expect(_rolCoincide('ASESOR', ['COMERCIAL', 'LIDER'])).toBe(false);
    });
  });

  describe('edge cases', () => {
    it('retorna false si rolesPermitidos está vacío', () => {
      expect(_rolCoincide('CONSULTOR', [])).toBe(false);
    });

    it('retorna false si el rol es un string vacío', () => {
      expect(_rolCoincide('', ['CONSULTOR', 'COMERCIAL'])).toBe(false);
    });

    it('coincidencia directa tiene prioridad sobre alias', () => {
      expect(_rolCoincide('CONSULTOR', ['CONSULTOR', 'COMERCIAL'])).toBe(true);
    });
  });
});

// ─── Tests para verificarRol con alias legacy — Task 2.6 ────────────────────────

describe('verificarRol — integración con alias legacy (Task 2.6)', () => {
  function setupVerificarRol(sessionEmail) {
    const sheetsConfig = {
      'USUARIOS': [
        HEADERS,
        ['consultor@empresa.com', 'CONSULTOR', true, 5, 'director@empresa.com', '', ''],
        ['director@empresa.com', 'DIRECTOR', true, 0, '', 'gerente@empresa.com', ''],
        ['gerente@empresa.com', 'GERENTE', true, 0, '', '', ''],
        ['admin@empresa.com', 'ADMIN', true, 10, '', '', ''],
        ['analista@empresa.com', 'ANALISTA', true, 3, 'director@empresa.com', '', ''],
        ['auxiliar@empresa.com', 'AUXILIAR', true, 2, 'director@empresa.com', '', ''],
        ['asesor@empresa.com', 'ASESOR', true, 0, '', '', ''],
      ]
    };

    setupGlobals(sheetsConfig);

    globalThis.Session = {
      getActiveUser: () => ({
        getEmail: () => sessionEmail || 'consultor@empresa.com'
      })
    };

    // Simular CacheService
    const cacheStore = {};
    globalThis.CacheService = {
      getScriptCache: () => ({
        get: (key) => cacheStore[key] || null,
        put: (key, value, ttl) => { cacheStore[key] = value; },
        remove: (key) => { delete cacheStore[key]; }
      })
    };

    // Cargar _rolCoincide
    globalThis._rolCoincide = function(rolUsuario, rolesPermitidos) {
      if (rolesPermitidos.indexOf(rolUsuario) !== -1) return true;

      var ALIASES = {
        'CONSULTOR': 'COMERCIAL',
        'COMERCIAL': 'CONSULTOR',
        'DIRECTOR': 'LIDER',
        'LIDER': 'DIRECTOR'
      };

      var alias = ALIASES[rolUsuario];
      if (alias && rolesPermitidos.indexOf(alias) !== -1) return true;

      return false;
    };

    // Cargar obtenerUsuarioActual_v2 simplificado
    globalThis.obtenerUsuarioActual_v2 = function() {
      var email = Session.getActiveUser().getEmail().toLowerCase().trim();
      var ss = SpreadsheetApp.openById(getHojaControlId());
      var hoja = ss.getSheetByName('USUARIOS');

      if (!hoja) return { autorizado: false, email: email };

      var datos = hoja.getDataRange().getValues();
      for (var i = 1; i < datos.length; i++) {
        var fila = datos[i];
        var emailFila = String(fila[0] || '').toLowerCase().trim();
        if (emailFila === email) {
          var activo = (fila[2] === true || fila[2] === 'TRUE' || fila[2] === 'true');
          if (!activo) return { autorizado: false, email: email };
          return {
            autorizado: true,
            email: emailFila,
            rol: String(fila[1] || '').toUpperCase().trim(),
            cupo: Number(fila[3]) || 0
          };
        }
      }
      return { autorizado: false, email: email };
    };

    // Cargar verificarRol
    globalThis.verificarRol = function(rolesPermitidos) {
      var usuario = obtenerUsuarioActual_v2();
      if (!usuario.autorizado) {
        throw new Error('NO_AUTORIZADO');
      }
      if (!_rolCoincide(usuario.rol, rolesPermitidos)) {
        throw new Error('SIN_PERMISOS');
      }
      return usuario;
    };
  }

  it('CONSULTOR pasa verificación cuando rolesPermitidos incluye COMERCIAL', () => {
    setupVerificarRol('consultor@empresa.com');
    const resultado = verificarRol(['COMERCIAL', 'ADMIN']);
    expect(resultado.autorizado).toBe(true);
    expect(resultado.rol).toBe('CONSULTOR');
  });

  it('DIRECTOR pasa verificación cuando rolesPermitidos incluye LIDER', () => {
    setupVerificarRol('director@empresa.com');
    const resultado = verificarRol(['LIDER', 'ADMIN']);
    expect(resultado.autorizado).toBe(true);
    expect(resultado.rol).toBe('DIRECTOR');
  });

  it('CONSULTOR pasa verificación con su nombre directo', () => {
    setupVerificarRol('consultor@empresa.com');
    const resultado = verificarRol(['CONSULTOR']);
    expect(resultado.autorizado).toBe(true);
    expect(resultado.rol).toBe('CONSULTOR');
  });

  it('DIRECTOR pasa verificación con su nombre directo', () => {
    setupVerificarRol('director@empresa.com');
    const resultado = verificarRol(['DIRECTOR']);
    expect(resultado.autorizado).toBe(true);
    expect(resultado.rol).toBe('DIRECTOR');
  });

  it('lanza SIN_PERMISOS si el rol no coincide ni por alias', () => {
    setupVerificarRol('consultor@empresa.com');
    expect(() => verificarRol(['ADMIN', 'GERENTE'])).toThrow('SIN_PERMISOS');
  });

  it('lanza NO_AUTORIZADO si el usuario no está autenticado', () => {
    setupVerificarRol('noexiste@empresa.com');
    expect(() => verificarRol(['CONSULTOR'])).toThrow('NO_AUTORIZADO');
  });

  it('ANALISTA no tiene alias — lanza SIN_PERMISOS si rolesPermitidos solo tiene COMERCIAL/LIDER', () => {
    setupVerificarRol('analista@empresa.com');
    expect(() => verificarRol(['COMERCIAL', 'LIDER'])).toThrow('SIN_PERMISOS');
  });

  it('GERENTE pasa verificación sin alias', () => {
    setupVerificarRol('gerente@empresa.com');
    const resultado = verificarRol(['GERENTE']);
    expect(resultado.autorizado).toBe(true);
    expect(resultado.rol).toBe('GERENTE');
  });
});


// ─── Tests para _obtenerUsuarioPorEmail (Task 2.1) ──────────────────────────────
import { createCacheService } from '../mocks/cache-service.mock.js';

function setupObtenerUsuarioPorEmail(options = {}) {
  const sheetsConfig = options.sheetsConfig || { 'USUARIOS': DATOS_USUARIOS };
  const cacheOptions = options.cacheOptions || {};

  const app = createSpreadsheetApp(sheetsConfig);
  globalThis.SpreadsheetApp = app;
  globalThis.getHojaControlId = () => 'mock-id';
  globalThis._registrarEvento_ = () => {};
  globalThis.Logger = { log: () => {} };

  const cacheService = createCacheService(cacheOptions);
  globalThis.CacheService = cacheService;

  globalThis.COL_EMAIL = 0;
  globalThis.COL_ROL = 1;
  globalThis.COL_ACTIVO = 2;
  globalThis.COL_CUPO = 3;
  globalThis.COL_EMAIL_DIRECTOR = 4;
  globalThis.COL_EMAIL_GERENTE = 5;
  globalThis.COL_EMAILS_ALTERNOS = 6;
  globalThis.ROLES_VALIDOS = ['CONSULTOR', 'ANALISTA', 'AUXILIAR', 'DIRECTOR', 'GERENTE', 'ADMIN', 'ASESOR'];

  // UsuariosRepo_leerTodos
  globalThis.UsuariosRepo_leerTodos = function() {
    var hojaId = getHojaControlId();
    var ss = SpreadsheetApp.openById(hojaId);
    var hoja = ss.getSheetByName('USUARIOS');
    if (!hoja) return [];

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
          if (alterno) emailsAlternos.push(alterno);
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

  // UsuariosRepo_buscarPorEmail
  globalThis.UsuariosRepo_buscarPorEmail = function(email) {
    if (!email) return null;
    var emailNormalizado = String(email).toLowerCase().trim();
    if (!emailNormalizado) return null;

    var usuarios = UsuariosRepo_leerTodos();

    for (var i = 0; i < usuarios.length; i++) {
      if (usuarios[i].email === emailNormalizado) return usuarios[i];
    }

    for (var j = 0; j < usuarios.length; j++) {
      var alternos = usuarios[j].emailsAlternos;
      for (var k = 0; k < alternos.length; k++) {
        if (alternos[k] === emailNormalizado) return usuarios[j];
      }
    }
    return null;
  };

  // _obtenerUsuarioPorEmail (función bajo test - Task 2.1)
  globalThis._obtenerUsuarioPorEmail = function(email) {
    var key = 'USR_' + email;

    try {
      var cache = CacheService.getScriptCache();
      var cached = cache.get(key);
      if (cached) {
        return JSON.parse(cached);
      }
    } catch (e) {
      // CacheService no disponible — continuar sin cache
    }

    var encontrado = UsuariosRepo_buscarPorEmail(email);

    if (!encontrado) {
      return null;
    }

    try {
      var cacheParaEscribir = CacheService.getScriptCache();
      var json = JSON.stringify(encontrado);

      cacheParaEscribir.put('USR_' + encontrado.email, json, 120);

      var alternos = encontrado.emailsAlternos || [];
      for (var i = 0; i < alternos.length; i++) {
        if (alternos[i]) {
          cacheParaEscribir.put('USR_' + alternos[i], json, 120);
        }
      }
    } catch (e) {
      // CacheService no disponible — se retorna el resultado sin cachear
    }

    return encontrado;
  };

  return { cacheService, app };
}

// ─── Tests ─────────────────────────────────────────────────────────────────────

describe('_obtenerUsuarioPorEmail (Task 2.1 - Req 2.1, 2.2, 2.3, 2.4, 2.7)', () => {
  beforeEach(() => {
    setupObtenerUsuarioPorEmail();
  });

  // ─── Búsqueda por email primario ──────────────────────────────────────────

  describe('Búsqueda por email primario', () => {
    it('encuentra usuario por email primario', () => {
      const resultado = _obtenerUsuarioPorEmail('ana.perez@empresa.com');
      expect(resultado).not.toBeNull();
      expect(resultado.email).toBe('ana.perez@empresa.com');
      expect(resultado.rol).toBe('CONSULTOR');
    });

    it('retorna UsuarioRecord con todos los campos del nuevo esquema', () => {
      const resultado = _obtenerUsuarioPorEmail('ana.perez@empresa.com');
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

    it('retorna null si el email no existe', () => {
      const resultado = _obtenerUsuarioPorEmail('noexiste@empresa.com');
      expect(resultado).toBeNull();
    });
  });

  // ─── Búsqueda por emails alternos ─────────────────────────────────────────

  describe('Búsqueda por emails alternos (Req 2.2, 2.3, 2.4)', () => {
    it('encuentra usuario por email alterno', () => {
      const resultado = _obtenerUsuarioPorEmail('ana.p@gmail.com');
      expect(resultado).not.toBeNull();
      expect(resultado.email).toBe('ana.perez@empresa.com');
    });

    it('encuentra usuario por segundo email alterno', () => {
      const resultado = _obtenerUsuarioPorEmail('aperez@otro.co');
      expect(resultado).not.toBeNull();
      expect(resultado.email).toBe('ana.perez@empresa.com');
    });

    it('retorna registro completo del email primario al buscar por alterno', () => {
      const resultado = _obtenerUsuarioPorEmail('kharen.g@personal.com');
      expect(resultado).not.toBeNull();
      expect(resultado.email).toBe('kharen.gerente@empresa.com');
      expect(resultado.rol).toBe('GERENTE');
    });
  });

  // ─── Cacheo multi-clave (Req 2.7) ─────────────────────────────────────────

  describe('Cacheo bajo múltiples claves (Req 2.7)', () => {
    it('cachea bajo clave del email primario con TTL 120s', () => {
      const { cacheService } = setupObtenerUsuarioPorEmail();
      _obtenerUsuarioPorEmail('ana.perez@empresa.com');

      const cache = cacheService.getScriptCache();
      const cached = cache.get('USR_ana.perez@empresa.com');
      expect(cached).not.toBeNull();

      const parsed = JSON.parse(cached);
      expect(parsed.email).toBe('ana.perez@empresa.com');
    });

    it('cachea bajo clave de cada email alterno', () => {
      const { cacheService } = setupObtenerUsuarioPorEmail();
      _obtenerUsuarioPorEmail('ana.perez@empresa.com');

      const cache = cacheService.getScriptCache();

      const cachedAlt1 = cache.get('USR_ana.p@gmail.com');
      const cachedAlt2 = cache.get('USR_aperez@otro.co');

      expect(cachedAlt1).not.toBeNull();
      expect(cachedAlt2).not.toBeNull();

      expect(JSON.parse(cachedAlt1).email).toBe('ana.perez@empresa.com');
      expect(JSON.parse(cachedAlt2).email).toBe('ana.perez@empresa.com');
    });

    it('cachea N+1 claves (1 primario + N alternos)', () => {
      const { cacheService } = setupObtenerUsuarioPorEmail();
      _obtenerUsuarioPorEmail('ana.perez@empresa.com');

      const cache = cacheService.getScriptCache();
      const putCalls = cache.getCallLog('put');

      // ana.perez tiene 2 alternos → 3 puts totales
      expect(putCalls).toHaveLength(3);
      expect(putCalls[0].key).toBe('USR_ana.perez@empresa.com');
      expect(putCalls[1].key).toBe('USR_ana.p@gmail.com');
      expect(putCalls[2].key).toBe('USR_aperez@otro.co');
    });

    it('usa TTL de 120 segundos en todas las claves', () => {
      const { cacheService } = setupObtenerUsuarioPorEmail();
      _obtenerUsuarioPorEmail('ana.perez@empresa.com');

      const cache = cacheService.getScriptCache();
      const putCalls = cache.getCallLog('put');

      for (const call of putCalls) {
        expect(call.ttl).toBe(120);
      }
    });

    it('al buscar por alterno, también cachea todas las claves del usuario', () => {
      const { cacheService } = setupObtenerUsuarioPorEmail();
      _obtenerUsuarioPorEmail('ana.p@gmail.com');

      const cache = cacheService.getScriptCache();
      const putCalls = cache.getCallLog('put');

      // Debe cachear primario + 2 alternos = 3
      expect(putCalls).toHaveLength(3);

      const keys = putCalls.map(c => c.key);
      expect(keys).toContain('USR_ana.perez@empresa.com');
      expect(keys).toContain('USR_ana.p@gmail.com');
      expect(keys).toContain('USR_aperez@otro.co');
    });

    it('no cachea claves adicionales si el usuario no tiene alternos', () => {
      const { cacheService } = setupObtenerUsuarioPorEmail();
      _obtenerUsuarioPorEmail('carlos.admin@empresa.com');

      const cache = cacheService.getScriptCache();
      const putCalls = cache.getCallLog('put');

      // carlos.admin no tiene alternos → solo 1 put (email primario)
      expect(putCalls).toHaveLength(1);
      expect(putCalls[0].key).toBe('USR_carlos.admin@empresa.com');
    });
  });

  // ─── Cache hit ─────────────────────────────────────────────────────────────

  describe('Cache hit', () => {
    it('retorna del cache sin llamar a UsuariosRepo en cache hit', () => {
      const { cacheService } = setupObtenerUsuarioPorEmail();
      const cache = cacheService.getScriptCache();

      // Pre-cargar cache
      const usuario = {
        email: 'pre.cached@empresa.com',
        rol: 'ADMIN',
        activo: true,
        cupo: 10,
        emailDirector: '',
        emailGerente: '',
        emailsAlternos: []
      };
      cache.put('USR_pre.cached@empresa.com', JSON.stringify(usuario), 120);
      cache.resetCallLog();

      const resultado = _obtenerUsuarioPorEmail('pre.cached@empresa.com');
      expect(resultado).toEqual(usuario);

      // No debe haber puts (ya estaba en cache)
      const putCalls = cache.getCallLog('put');
      expect(putCalls).toHaveLength(0);
    });

    it('retorna del cache cuando se busca por email alterno ya cacheado', () => {
      const { cacheService } = setupObtenerUsuarioPorEmail();

      // Primera búsqueda cachea bajo primario + alternos
      _obtenerUsuarioPorEmail('ana.perez@empresa.com');

      const cache = cacheService.getScriptCache();
      cache.resetCallLog();

      // Segunda búsqueda por alterno debería ser cache hit
      const resultado = _obtenerUsuarioPorEmail('ana.p@gmail.com');
      expect(resultado).not.toBeNull();
      expect(resultado.email).toBe('ana.perez@empresa.com');

      // Solo debe haber un get (cache hit), sin puts
      const putCalls = cache.getCallLog('put');
      expect(putCalls).toHaveLength(0);
    });
  });

  // ─── Degradación elegante (fallback sin cache) ─────────────────────────────

  describe('Degradación elegante con CacheService no disponible', () => {
    it('retorna usuario correctamente cuando CacheService lanza error', () => {
      setupObtenerUsuarioPorEmail({ cacheOptions: { simulateUnavailable: true } });

      const resultado = _obtenerUsuarioPorEmail('ana.perez@empresa.com');
      expect(resultado).not.toBeNull();
      expect(resultado.email).toBe('ana.perez@empresa.com');
      expect(resultado.rol).toBe('CONSULTOR');
    });

    it('retorna usuario por alterno cuando CacheService no está disponible', () => {
      setupObtenerUsuarioPorEmail({ cacheOptions: { simulateUnavailable: true } });

      const resultado = _obtenerUsuarioPorEmail('kharen.g@personal.com');
      expect(resultado).not.toBeNull();
      expect(resultado.email).toBe('kharen.gerente@empresa.com');
    });

    it('retorna null cuando email no existe y CacheService no está disponible', () => {
      setupObtenerUsuarioPorEmail({ cacheOptions: { simulateUnavailable: true } });

      const resultado = _obtenerUsuarioPorEmail('noexiste@empresa.com');
      expect(resultado).toBeNull();
    });

    it('no lanza excepción cuando CacheService falla', () => {
      setupObtenerUsuarioPorEmail({ cacheOptions: { simulateUnavailable: true } });

      expect(() => {
        _obtenerUsuarioPorEmail('ana.perez@empresa.com');
      }).not.toThrow();
    });
  });

  // ─── UsuarioRecord nuevo esquema ───────────────────────────────────────────

  describe('Retorno de UsuarioRecord (nuevo esquema 7 campos)', () => {
    it('retorna objeto con campo emailDirector', () => {
      const resultado = _obtenerUsuarioPorEmail('ana.perez@empresa.com');
      expect(resultado.emailDirector).toBe('jenny.director@empresa.com');
    });

    it('retorna objeto con campo emailGerente', () => {
      const resultado = _obtenerUsuarioPorEmail('jenny.director@empresa.com');
      expect(resultado.emailGerente).toBe('kharen.gerente@empresa.com');
    });

    it('retorna objeto con campo emailsAlternos como array', () => {
      const resultado = _obtenerUsuarioPorEmail('ana.perez@empresa.com');
      expect(Array.isArray(resultado.emailsAlternos)).toBe(true);
      expect(resultado.emailsAlternos).toEqual(['ana.p@gmail.com', 'aperez@otro.co']);
    });

    it('NO retorna campos obsoletos (nombre, backup, backupActivo)', () => {
      const resultado = _obtenerUsuarioPorEmail('ana.perez@empresa.com');
      expect(resultado).not.toHaveProperty('nombre');
      expect(resultado).not.toHaveProperty('backup');
      expect(resultado).not.toHaveProperty('backupActivo');
    });
  });

  // ─── Edge cases ────────────────────────────────────────────────────────────

  describe('Edge cases', () => {
    it('retorna usuario inactivo (la función NO filtra por activo)', () => {
      const resultado = _obtenerUsuarioPorEmail('pedro.analista@empresa.com');
      expect(resultado).not.toBeNull();
      expect(resultado.activo).toBe(false);
    });

    it('retorna usuario inactivo buscando por su alterno', () => {
      const resultado = _obtenerUsuarioPorEmail('pedro.alt@gmail.com');
      expect(resultado).not.toBeNull();
      expect(resultado.email).toBe('pedro.analista@empresa.com');
      expect(resultado.activo).toBe(false);
    });

    it('retorna null cuando pestaña USUARIOS no existe', () => {
      setupObtenerUsuarioPorEmail({ sheetsConfig: { 'OtraHoja': [['col1']] } });
      const resultado = _obtenerUsuarioPorEmail('cualquier@email.com');
      expect(resultado).toBeNull();
    });
  });
});

// ─── Tests para obtenerUsuarioActual_v2 (Task 2.2 — Req 2.5, 2.6, 7.4) ────────

describe('obtenerUsuarioActual_v2 (Task 2.2 - Req 2.5, 2.6, 7.4)', () => {
  function setupObtenerUsuarioActual(sessionEmail, sheetsOverride) {
    const sheetsConfig = sheetsOverride || { 'USUARIOS': DATOS_USUARIOS };
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

    // Mock Session
    globalThis.Session = {
      getActiveUser: () => ({
        getEmail: () => sessionEmail
      })
    };

    // Mock CacheService
    const cacheStore = {};
    globalThis.CacheService = {
      getScriptCache: () => ({
        get: (key) => cacheStore[key] || null,
        put: (key, value, ttl) => { cacheStore[key] = value; },
        remove: (key) => { delete cacheStore[key]; }
      })
    };

    // UsuariosRepo_leerTodos
    globalThis.UsuariosRepo_leerTodos = function() {
      var hojaId = getHojaControlId();
      var ss = SpreadsheetApp.openById(hojaId);
      var hoja = ss.getSheetByName('USUARIOS');
      if (!hoja) return [];

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
            if (alterno) emailsAlternos.push(alterno);
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

    // UsuariosRepo_buscarPorEmail
    globalThis.UsuariosRepo_buscarPorEmail = function(email) {
      if (!email) return null;
      var emailNormalizado = String(email).toLowerCase().trim();
      if (!emailNormalizado) return null;

      var usuarios = UsuariosRepo_leerTodos();

      for (var i = 0; i < usuarios.length; i++) {
        if (usuarios[i].email === emailNormalizado) return usuarios[i];
      }

      for (var j = 0; j < usuarios.length; j++) {
        var alternos = usuarios[j].emailsAlternos;
        for (var k = 0; k < alternos.length; k++) {
          if (alternos[k] === emailNormalizado) return usuarios[j];
        }
      }
      return null;
    };

    // _obtenerUsuarioPorEmail (production logic from Task 2.1)
    globalThis._obtenerUsuarioPorEmail = function(email) {
      var key = 'USR_' + email;

      try {
        var cache = CacheService.getScriptCache();
        var cached = cache.get(key);
        if (cached) {
          return JSON.parse(cached);
        }
      } catch (e) {}

      var encontrado = UsuariosRepo_buscarPorEmail(email);
      if (!encontrado) return null;

      try {
        var cacheParaEscribir = CacheService.getScriptCache();
        var json = JSON.stringify(encontrado);
        cacheParaEscribir.put('USR_' + encontrado.email, json, 120);

        var alternos = encontrado.emailsAlternos || [];
        for (var i = 0; i < alternos.length; i++) {
          if (alternos[i]) {
            cacheParaEscribir.put('USR_' + alternos[i], json, 120);
          }
        }
      } catch (e) {}

      return encontrado;
    };

    // obtenerUsuarioActual_v2 (production logic - Task 2.2 refactored)
    globalThis.obtenerUsuarioActual_v2 = function() {
      var email = Session.getActiveUser().getEmail().toLowerCase().trim();
      var usuario = _obtenerUsuarioPorEmail(email);

      if (!usuario || !usuario.activo) {
        return { autorizado: false, email: email };
      }

      return {
        autorizado: true,
        email: usuario.email,
        rol: usuario.rol,
        cupo: usuario.cupo || 0,
        emailDirector: usuario.emailDirector || '',
        emailGerente: usuario.emailGerente || ''
      };
    };
  }

  // ─── Respuesta autorizada con campos de jerarquía (Req 7.4) ───────────────

  describe('Respuesta autorizada con campos de jerarquía (Req 7.4)', () => {
    it('retorna emailDirector para un consultor', () => {
      setupObtenerUsuarioActual('ana.perez@empresa.com');
      const resultado = obtenerUsuarioActual_v2();
      expect(resultado.autorizado).toBe(true);
      expect(resultado.emailDirector).toBe('jenny.director@empresa.com');
    });

    it('retorna emailGerente para un director', () => {
      setupObtenerUsuarioActual('jenny.director@empresa.com');
      const resultado = obtenerUsuarioActual_v2();
      expect(resultado.autorizado).toBe(true);
      expect(resultado.emailGerente).toBe('kharen.gerente@empresa.com');
    });

    it('retorna emailDirector vacío para un director (no tiene director)', () => {
      setupObtenerUsuarioActual('jenny.director@empresa.com');
      const resultado = obtenerUsuarioActual_v2();
      expect(resultado.emailDirector).toBe('');
    });

    it('retorna emailGerente vacío para un consultor (no tiene gerente)', () => {
      setupObtenerUsuarioActual('ana.perez@empresa.com');
      const resultado = obtenerUsuarioActual_v2();
      expect(resultado.emailGerente).toBe('');
    });

    it('retorna emailDirector y emailGerente vacíos para admin', () => {
      setupObtenerUsuarioActual('carlos.admin@empresa.com');
      const resultado = obtenerUsuarioActual_v2();
      expect(resultado.autorizado).toBe(true);
      expect(resultado.emailDirector).toBe('');
      expect(resultado.emailGerente).toBe('');
    });

    it('retorna todos los campos esperados en la respuesta', () => {
      setupObtenerUsuarioActual('ana.perez@empresa.com');
      const resultado = obtenerUsuarioActual_v2();
      expect(resultado).toEqual({
        autorizado: true,
        email: 'ana.perez@empresa.com',
        rol: 'CONSULTOR',
        cupo: 5,
        emailDirector: 'jenny.director@empresa.com',
        emailGerente: ''
      });
    });

    it('NO retorna campo nombre (columna eliminada)', () => {
      setupObtenerUsuarioActual('ana.perez@empresa.com');
      const resultado = obtenerUsuarioActual_v2();
      expect(resultado).not.toHaveProperty('nombre');
    });
  });

  // ─── Acceso denegado (Req 2.5, 2.6) ──────────────────────────────────────

  describe('Acceso denegado (Req 2.5, 2.6)', () => {
    it('retorna autorizado:false si el email no existe en el sistema', () => {
      setupObtenerUsuarioActual('inexistente@empresa.com');
      const resultado = obtenerUsuarioActual_v2();
      expect(resultado).toEqual({
        autorizado: false,
        email: 'inexistente@empresa.com'
      });
    });

    it('retorna autorizado:false si el usuario está inactivo (ACTIVO=FALSE)', () => {
      setupObtenerUsuarioActual('pedro.analista@empresa.com');
      const resultado = obtenerUsuarioActual_v2();
      expect(resultado).toEqual({
        autorizado: false,
        email: 'pedro.analista@empresa.com'
      });
    });

    it('retorna email normalizado a minúsculas en respuesta denegada', () => {
      setupObtenerUsuarioActual('NOEXISTE@EMPRESA.COM');
      const resultado = obtenerUsuarioActual_v2();
      expect(resultado.email).toBe('noexiste@empresa.com');
    });

    it('no incluye campos de jerarquía en respuesta denegada', () => {
      setupObtenerUsuarioActual('inexistente@empresa.com');
      const resultado = obtenerUsuarioActual_v2();
      expect(resultado).not.toHaveProperty('rol');
      expect(resultado).not.toHaveProperty('cupo');
      expect(resultado).not.toHaveProperty('emailDirector');
      expect(resultado).not.toHaveProperty('emailGerente');
    });
  });

  // ─── Normalización y resolución de identidad ──────────────────────────────

  describe('Normalización y resolución por alternos', () => {
    it('normaliza email de sesión a minúsculas', () => {
      setupObtenerUsuarioActual('ANA.PEREZ@EMPRESA.COM');
      const resultado = obtenerUsuarioActual_v2();
      expect(resultado.autorizado).toBe(true);
      expect(resultado.email).toBe('ana.perez@empresa.com');
    });

    it('resuelve usuario por email alterno y retorna datos del primario', () => {
      setupObtenerUsuarioActual('ana.p@gmail.com');
      const resultado = obtenerUsuarioActual_v2();
      expect(resultado.autorizado).toBe(true);
      expect(resultado.email).toBe('ana.perez@empresa.com');
      expect(resultado.emailDirector).toBe('jenny.director@empresa.com');
    });

    it('resuelve usuario por email alterno de gerente', () => {
      setupObtenerUsuarioActual('kharen.g@personal.com');
      const resultado = obtenerUsuarioActual_v2();
      expect(resultado.autorizado).toBe(true);
      expect(resultado.email).toBe('kharen.gerente@empresa.com');
      expect(resultado.rol).toBe('GERENTE');
    });
  });

  // ─── Cupo con valor por defecto ───────────────────────────────────────────

  describe('Cupo con valor por defecto', () => {
    it('retorna cupo del usuario cuando tiene valor', () => {
      setupObtenerUsuarioActual('ana.perez@empresa.com');
      const resultado = obtenerUsuarioActual_v2();
      expect(resultado.cupo).toBe(5);
    });

    it('retorna cupo 0 cuando el usuario no tiene cupo definido', () => {
      setupObtenerUsuarioActual('jenny.director@empresa.com');
      const resultado = obtenerUsuarioActual_v2();
      expect(resultado.cupo).toBe(0);
    });
  });
});


// ─── Tests para getEmailsEquipoVisible (Task 2.4 — Req 3.6) ─────────────────────

describe('getEmailsEquipoVisible (Task 2.4 - Req 3.6)', () => {
  const HEADERS_EQ = ['EMAIL', 'ROL', 'ACTIVO', 'CUPO', 'EMAIL_DIRECTOR', 'EMAIL_GERENTE', 'EMAILS_ALTERNOS'];

  const DATOS_JERARQUIA = [
    HEADERS_EQ,
    ['consultor1@empresa.com', 'CONSULTOR', true, 5, 'director1@empresa.com', '', ''],
    ['consultor2@empresa.com', 'CONSULTOR', true, 3, 'director1@empresa.com', '', ''],
    ['director1@empresa.com', 'DIRECTOR', true, 0, '', 'gerente1@empresa.com', ''],
    ['gerente1@empresa.com', 'GERENTE', true, 0, '', '', ''],
    ['admin1@empresa.com', 'ADMIN', true, 10, '', '', ''],
    ['asesor1@empresa.com', 'ASESOR', true, 0, '', '', ''],
    ['analista1@empresa.com', 'ANALISTA', true, 3, 'director1@empresa.com', '', 'analista.alt@gmail.com'],
  ];

  function setupGetEmailsEquipoVisible(options = {}) {
    const sheetsConfig = options.sheetsConfig || { 'USUARIOS': DATOS_JERARQUIA };
    const cacheOptions = options.cacheOptions || {};

    const app = createSpreadsheetApp(sheetsConfig);
    globalThis.SpreadsheetApp = app;
    globalThis.getHojaControlId = () => 'mock-id';
    globalThis._registrarEvento_ = () => {};
    globalThis.Logger = { log: () => {} };

    const cacheService = createCacheService(cacheOptions);
    globalThis.CacheService = cacheService;

    globalThis.COL_EMAIL = 0;
    globalThis.COL_ROL = 1;
    globalThis.COL_ACTIVO = 2;
    globalThis.COL_CUPO = 3;
    globalThis.COL_EMAIL_DIRECTOR = 4;
    globalThis.COL_EMAIL_GERENTE = 5;
    globalThis.COL_EMAILS_ALTERNOS = 6;
    globalThis.ROLES_VALIDOS = ['CONSULTOR', 'ANALISTA', 'AUXILIAR', 'DIRECTOR', 'GERENTE', 'ADMIN', 'ASESOR'];

    // UsuariosRepo_leerTodos
    globalThis.UsuariosRepo_leerTodos = function() {
      var hojaId = getHojaControlId();
      var ss = SpreadsheetApp.openById(hojaId);
      var hoja = ss.getSheetByName('USUARIOS');
      if (!hoja) return [];

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
            if (alterno) emailsAlternos.push(alterno);
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

    // UsuariosRepo_buscarPorEmail
    globalThis.UsuariosRepo_buscarPorEmail = function(email) {
      if (!email) return null;
      var emailNormalizado = String(email).toLowerCase().trim();
      if (!emailNormalizado) return null;

      var usuarios = UsuariosRepo_leerTodos();

      for (var i = 0; i < usuarios.length; i++) {
        if (usuarios[i].email === emailNormalizado) return usuarios[i];
      }

      for (var j = 0; j < usuarios.length; j++) {
        var alternos = usuarios[j].emailsAlternos;
        for (var k = 0; k < alternos.length; k++) {
          if (alternos[k] === emailNormalizado) return usuarios[j];
        }
      }
      return null;
    };

    // UsuariosRepo_getEmailsEquipoVisible
    globalThis.UsuariosRepo_getEmailsEquipoVisible = function(emailUsuario, rol) {
      var emailNorm = String(emailUsuario || '').toLowerCase().trim();
      var rolNorm = String(rol || '').toUpperCase().trim();

      if (rolNorm === 'LIDER') rolNorm = 'DIRECTOR';
      if (rolNorm === 'COMERCIAL') rolNorm = 'CONSULTOR';

      if (rolNorm === 'ADMIN' || rolNorm === 'ASESOR') return null;

      if (rolNorm === 'CONSULTOR' || rolNorm === 'ANALISTA' || rolNorm === 'AUXILIAR') {
        return [emailNorm];
      }

      var todos = UsuariosRepo_leerTodos();

      if (rolNorm === 'DIRECTOR') {
        var equipoDirector = [emailNorm];
        for (var i = 0; i < todos.length; i++) {
          if (todos[i].emailDirector === emailNorm && todos[i].email !== emailNorm) {
            equipoDirector.push(todos[i].email);
          }
        }
        return equipoDirector;
      }

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
          var emailDir = directoresDelGerente[k];
          for (var m = 0; m < todos.length; m++) {
            if (todos[m].emailDirector === emailDir && todos[m].email !== emailDir) {
              equipoGerente.push(todos[m].email);
            }
          }
        }
        return equipoGerente;
      }

      return [emailNorm];
    };

    // _obtenerUsuarioPorEmail
    globalThis._obtenerUsuarioPorEmail = function(email) {
      var key = 'USR_' + email;

      try {
        var cache = CacheService.getScriptCache();
        var cached = cache.get(key);
        if (cached) {
          return JSON.parse(cached);
        }
      } catch (e) {}

      var encontrado = UsuariosRepo_buscarPorEmail(email);
      if (!encontrado) return null;

      try {
        var cacheParaEscribir = CacheService.getScriptCache();
        var json = JSON.stringify(encontrado);
        cacheParaEscribir.put('USR_' + encontrado.email, json, 120);
        var alternos = encontrado.emailsAlternos || [];
        for (var i = 0; i < alternos.length; i++) {
          if (alternos[i]) {
            cacheParaEscribir.put('USR_' + alternos[i], json, 120);
          }
        }
      } catch (e) {}

      return encontrado;
    };

    // getEmailsEquipoVisible (función bajo test — Task 2.4)
    globalThis.getEmailsEquipoVisible = function(email) {
      var emailNorm = String(email || '').toLowerCase().trim();
      if (!emailNorm) return [emailNorm];

      var key = 'EQUIPO_' + emailNorm;

      try {
        var cache = CacheService.getScriptCache();
        var cached = cache.get(key);
        if (cached) {
          if (cached === 'NULL') return null;
          return JSON.parse(cached);
        }
      } catch (e) {}

      var usuario = _obtenerUsuarioPorEmail(emailNorm);
      if (!usuario) return [emailNorm];

      var resultado = UsuariosRepo_getEmailsEquipoVisible(emailNorm, usuario.rol);

      try {
        var cacheEscribir = CacheService.getScriptCache();
        if (resultado === null) {
          cacheEscribir.put(key, 'NULL', 60);
        } else {
          cacheEscribir.put(key, JSON.stringify(resultado), 60);
        }
      } catch (e) {}

      return resultado;
    };

    return { cacheService, app };
  }

  // ─── Resolución por rol ────────────────────────────────────────────────────

  describe('Resolución por rol (delegando a UsuariosRepo)', () => {
    beforeEach(() => {
      setupGetEmailsEquipoVisible();
    });

    it('CONSULTOR retorna solo su propio email', () => {
      const resultado = getEmailsEquipoVisible('consultor1@empresa.com');
      expect(resultado).toEqual(['consultor1@empresa.com']);
    });

    it('ANALISTA retorna solo su propio email', () => {
      const resultado = getEmailsEquipoVisible('analista1@empresa.com');
      expect(resultado).toEqual(['analista1@empresa.com']);
    });

    it('DIRECTOR retorna su email + equipo directo', () => {
      const resultado = getEmailsEquipoVisible('director1@empresa.com');
      expect(resultado).toContain('director1@empresa.com');
      expect(resultado).toContain('consultor1@empresa.com');
      expect(resultado).toContain('consultor2@empresa.com');
      expect(resultado).toContain('analista1@empresa.com');
    });

    it('GERENTE retorna su email + directores + equipos transitivos', () => {
      const resultado = getEmailsEquipoVisible('gerente1@empresa.com');
      expect(resultado).toContain('gerente1@empresa.com');
      expect(resultado).toContain('director1@empresa.com');
      expect(resultado).toContain('consultor1@empresa.com');
      expect(resultado).toContain('consultor2@empresa.com');
      expect(resultado).toContain('analista1@empresa.com');
    });

    it('ADMIN retorna null (acceso total)', () => {
      const resultado = getEmailsEquipoVisible('admin1@empresa.com');
      expect(resultado).toBeNull();
    });

    it('ASESOR retorna null (acceso total)', () => {
      const resultado = getEmailsEquipoVisible('asesor1@empresa.com');
      expect(resultado).toBeNull();
    });
  });

  // ─── Cache con clave EQUIPO_ ───────────────────────────────────────────────

  describe('Cache con clave EQUIPO_ + email (TTL 60s)', () => {
    it('cachea resultado de array bajo clave EQUIPO_email', () => {
      const { cacheService } = setupGetEmailsEquipoVisible();
      getEmailsEquipoVisible('consultor1@empresa.com');

      const cache = cacheService.getScriptCache();
      const cached = cache.get('EQUIPO_consultor1@empresa.com');
      expect(cached).not.toBeNull();
      expect(JSON.parse(cached)).toEqual(['consultor1@empresa.com']);
    });

    it('cachea NULL sentinel para ADMIN (resultado null)', () => {
      const { cacheService } = setupGetEmailsEquipoVisible();
      getEmailsEquipoVisible('admin1@empresa.com');

      const cache = cacheService.getScriptCache();
      const cached = cache.get('EQUIPO_admin1@empresa.com');
      expect(cached).toBe('NULL');
    });

    it('usa TTL de 60 segundos', () => {
      const { cacheService } = setupGetEmailsEquipoVisible();
      getEmailsEquipoVisible('consultor1@empresa.com');

      const cache = cacheService.getScriptCache();
      const putCalls = cache.getCallLog('put').filter(c => c.key.startsWith('EQUIPO_'));
      expect(putCalls.length).toBeGreaterThan(0);
      expect(putCalls[0].ttl).toBe(60);
    });

    it('retorna valor cacheado en la segunda llamada', () => {
      const { cacheService } = setupGetEmailsEquipoVisible();

      // Primera llamada — cache miss
      const primera = getEmailsEquipoVisible('consultor1@empresa.com');

      // Mutar datos subyacentes (simular cambio)
      globalThis.UsuariosRepo_getEmailsEquipoVisible = () => ['otro@email.com'];

      // Segunda llamada — debe retornar del cache
      const segunda = getEmailsEquipoVisible('consultor1@empresa.com');
      expect(segunda).toEqual(primera);
    });

    it('retorna null desde cache cuando sentinel es NULL', () => {
      const { cacheService } = setupGetEmailsEquipoVisible();

      // Primera llamada para ADMIN — cachea NULL
      getEmailsEquipoVisible('admin1@empresa.com');

      // Mutar: ahora si se vuelve a llamar, usaría cache
      globalThis.UsuariosRepo_getEmailsEquipoVisible = () => ['no-deberia-retornar-esto'];

      const segunda = getEmailsEquipoVisible('admin1@empresa.com');
      expect(segunda).toBeNull();
    });
  });

  // ─── Degradación elegante (CacheService no disponible) ────────────────────

  describe('Degradación elegante (CacheService no disponible)', () => {
    it('funciona sin cache (lee directo de Repo)', () => {
      setupGetEmailsEquipoVisible({ cacheOptions: { simulateUnavailable: true } });

      const resultado = getEmailsEquipoVisible('consultor1@empresa.com');
      expect(resultado).toEqual(['consultor1@empresa.com']);
    });

    it('retorna null para ADMIN sin cache', () => {
      setupGetEmailsEquipoVisible({ cacheOptions: { simulateUnavailable: true } });

      const resultado = getEmailsEquipoVisible('admin1@empresa.com');
      expect(resultado).toBeNull();
    });

    it('no lanza excepción cuando CacheService falla', () => {
      setupGetEmailsEquipoVisible({ cacheOptions: { simulateUnavailable: true } });

      expect(() => {
        getEmailsEquipoVisible('director1@empresa.com');
      }).not.toThrow();
    });
  });

  // ─── Edge cases ────────────────────────────────────────────────────────────

  describe('Edge cases', () => {
    beforeEach(() => {
      setupGetEmailsEquipoVisible();
    });

    it('email vacío retorna array con string vacío', () => {
      const resultado = getEmailsEquipoVisible('');
      expect(resultado).toEqual(['']);
    });

    it('email null retorna array con string vacío', () => {
      const resultado = getEmailsEquipoVisible(null);
      expect(resultado).toEqual(['']);
    });

    it('normaliza email de entrada a minúsculas', () => {
      const resultado = getEmailsEquipoVisible('CONSULTOR1@Empresa.COM');
      expect(resultado).toEqual(['consultor1@empresa.com']);
    });

    it('email no registrado retorna array con solo ese email', () => {
      const resultado = getEmailsEquipoVisible('noexiste@empresa.com');
      expect(resultado).toEqual(['noexiste@empresa.com']);
    });
  });
});
