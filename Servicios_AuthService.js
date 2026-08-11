/**
 * ============================================================
 * AuthService — Autenticación y control de acceso
 *
 * Lee la pestaña USUARIOS del Libro de Control para determinar
 * rol y permisos del usuario logueado. Usa CacheService para
 * evitar lecturas repetidas a Sheets.
 * ============================================================
 */

/**
 * Obtiene los datos del usuario actual (sesión Google Workspace).
 * Retorna campos de jerarquía (emailDirector, emailGerente) para el frontend.
 * @returns {{autorizado:boolean, email:string, rol?:string, cupo?:number,
 *            emailDirector?:string, emailGerente?:string}}
 */
function obtenerUsuarioActual_v2() {
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
}

/**
 * Verifica que el usuario actual tenga uno de los roles permitidos.
 * Lanza excepción si no tiene acceso.
 * @param {string[]} rolesPermitidos - Array de roles válidos
 * @returns {{email:string, nombre:string, rol:string, cupo:number}}
 */
function verificarRol(rolesPermitidos) {
  var usuario = obtenerUsuarioActual_v2();
  if (!usuario.autorizado) {
    throw new Error('NO_AUTORIZADO');
  }
  if (!_rolCoincide(usuario.rol, rolesPermitidos)) {
    throw new Error('SIN_PERMISOS');
  }
  return usuario;
}

/**
 * Verifica si un rol coincide con alguno de los roles permitidos,
 * considerando los alias legacy bidireccionales.
 * CONSULTOR ↔ COMERCIAL, DIRECTOR ↔ LIDER
 * @param {string} rolUsuario - Rol actual del usuario
 * @param {string[]} rolesPermitidos - Array de roles aceptados
 * @returns {boolean} true si el rol coincide directamente o por alias
 */
function _rolCoincide(rolUsuario, rolesPermitidos) {
  if (rolesPermitidos.indexOf(rolUsuario) !== -1) return true;

  // Aliases bidireccionales para período de transición
  var ALIASES = {
    'CONSULTOR': 'COMERCIAL',
    'COMERCIAL': 'CONSULTOR',
    'DIRECTOR': 'LIDER',
    'LIDER': 'DIRECTOR',
    'ADMIN': 'ADMINISTRADOR',
    'ADMINISTRADOR': 'ADMIN'
  };

  var alias = ALIASES[rolUsuario];
  if (alias && rolesPermitidos.indexOf(alias) !== -1) return true;

  return false;
}

/**
 * Busca un usuario por email (primario o alterno). Usa CacheService (TTL 120s).
 * Cachea bajo TODAS las claves del usuario: email primario + cada alterno.
 * Degradación elegante: si CacheService no está disponible, lee directamente de Sheets.
 *
 * @param {string} email - Email normalizado a minúsculas
 * @returns {UsuarioRecord|null} Datos del usuario o null si no existe
 */
function _obtenerUsuarioPorEmail(email) {
  var key = 'USR_' + email;

  // 1. Intentar leer del cache (degradación elegante si cache no disponible)
  try {
    var cache = CacheService.getScriptCache();
    var cached = cache.get(key);
    if (cached) {
      return JSON.parse(cached);
    }
  } catch (e) {
    // CacheService no disponible — continuar sin cache
  }

  // 2. Cache miss → buscar en Sheets via UsuariosRepo (busca en primario + alternos)
  var encontrado = UsuariosRepo_buscarPorEmail(email);

  if (!encontrado) {
    return null;
  }

  // 3. Cachear bajo TODAS las claves: email primario + cada alterno (TTL 120s)
  try {
    var cacheParaEscribir = CacheService.getScriptCache();
    var json = JSON.stringify(encontrado);

    // Cachear bajo email primario
    cacheParaEscribir.put('USR_' + encontrado.email, json, 120);

    // Cachear bajo cada email alterno
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
}

// _leerPestanaUsuarios — ELIMINADA (reemplazada por UsuariosRepo_leerTodos y UsuariosRepo_buscarPorEmail)

/**
 * Invalida el cache de un usuario específico (usar al editar USUARIOS).
 * Acepta un UsuarioRecord completo o un string (backward compatible).
 *
 * - Si recibe UsuarioRecord: elimina cache de emailPrimario + cada alterno + EQUIPO_
 * - Si recibe string: elimina solo la clave USR_ de ese email (legacy)
 *
 * @param {UsuarioRecord|string} usuarioOEmail - Objeto usuario completo o email string
 */
function invalidarCacheUsuario(usuarioOEmail) {
  try {
    var cache = CacheService.getScriptCache();

    // Backward compatible: si es string, usar lógica legacy
    if (typeof usuarioOEmail === 'string') {
      var emailNorm = usuarioOEmail.toLowerCase().trim();
      cache.remove('USR_' + emailNorm);
      cache.remove('EQUIPO_' + emailNorm);
      return;
    }

    // Si es UsuarioRecord: invalidar todas las claves
    if (usuarioOEmail && typeof usuarioOEmail === 'object') {
      var emailPrimario = String(usuarioOEmail.email || '').toLowerCase().trim();

      if (emailPrimario) {
        cache.remove('USR_' + emailPrimario);
        cache.remove('EQUIPO_' + emailPrimario);
      }

      // Eliminar cache de cada email alterno
      var alternos = usuarioOEmail.emailsAlternos;
      if (Array.isArray(alternos)) {
        for (var i = 0; i < alternos.length; i++) {
          var alterno = String(alternos[i] || '').toLowerCase().trim();
          if (alterno) {
            cache.remove('USR_' + alterno);
            cache.remove('EQUIPO_' + alterno);
          }
        }
      }
    }
  } catch (e) {
    // Degradación elegante: si CacheService falla, no interrumpir la operación
    if (typeof Logger !== 'undefined' && Logger.log) {
      Logger.log('WARN: Error al invalidar cache de usuario: ' + e.message);
    }
  }
}

/**
 * Obtiene el correo del director de un usuario dado.
 * Lee de la columna EMAIL_DIRECTOR de la pestaña USUARIOS.
 * Reemplaza la versión anterior que leía de la pestaña CORREOS.
 * @param {string} emailUsuario
 * @returns {string} Email del director, o '' si no tiene
 */
function obtenerCorreoDeDirector(emailUsuario) {
  var usuario = UsuariosRepo_buscarPorEmail(emailUsuario);
  if (!usuario) return '';
  return usuario.emailDirector || '';
}

/**
 * Obtiene correos de roles superiores activos (DIRECTOR, GERENTE, ADMIN).
 * Cachea en memoria de ejecución para evitar múltiples lecturas en la misma invocación.
 * @returns {string[]}
 */
var _cacheCorreosSuperiores = null;
function obtenerCorreosSuperiores() {
  if (_cacheCorreosSuperiores !== null) {
    return _cacheCorreosSuperiores;
  }
  _cacheCorreosSuperiores = UsuariosRepo_getCorreosSuperiores();
  return _cacheCorreosSuperiores;
}

/**
 * Alias de transición. Llama a obtenerCorreosSuperiores().
 * Mantiene compatibilidad con código existente que usa el nombre viejo.
 * @returns {string[]}
 */
function obtenerCorreosLideres() {
  return obtenerCorreosSuperiores();
}

/**
 * Retorna la lista de emails visible para el usuario autenticado.
 * Wrapper cacheado sobre UsuariosRepo_getEmailsEquipoVisible.
 *
 * Clave de cache: 'EQUIPO_' + email, TTL 60s.
 * Si la función retorna null (ADMIN/ASESOR = sin filtro), cachea 'NULL' como sentinel.
 *
 * @param {string} email - Email del usuario
 * @returns {string[]|null} Lista de emails visibles, o null para acceso total
 */
function getEmailsEquipoVisible(email) {
  var emailNorm = String(email || '').toLowerCase().trim();
  if (!emailNorm) return [emailNorm];

  var key = 'EQUIPO_' + emailNorm;

  // Intentar leer del cache
  try {
    var cache = CacheService.getScriptCache();
    var cached = cache.get(key);
    if (cached) {
      if (cached === 'NULL') return null;
      return JSON.parse(cached);
    }
  } catch (e) {
    // CacheService no disponible
  }

  // Necesitamos el rol del usuario para la resolución
  var usuario = _obtenerUsuarioPorEmail(emailNorm);
  if (!usuario) return [emailNorm];

  var resultado = UsuariosRepo_getEmailsEquipoVisible(emailNorm, usuario.rol);

  // Cachear resultado (60s)
  try {
    var cacheEscribir = CacheService.getScriptCache();
    if (resultado === null) {
      cacheEscribir.put(key, 'NULL', 60);
    } else {
      cacheEscribir.put(key, JSON.stringify(resultado), 60);
    }
  } catch (e) {
    // CacheService no disponible
  }

  return resultado;
}
