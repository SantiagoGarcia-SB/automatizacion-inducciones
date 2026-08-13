/**
 * ============================================================
 * AuthService — Autenticación y control de acceso
 *
 * Lee la pestaña USUARIOS del Libro de Control para determinar
 * rol y permisos del usuario logueado. Usa CacheService para
 * evitar lecturas repetidas a Sheets.
 *
 * Punto único de entrada: resolverSesion()
 * - Usa MemoCache_getSessionEmail() para obtener email (1 vez por ejecución)
 * - Consulta CacheService (TTL 120s) con clave 'USR_' + email
 * - En cache-miss, busca en MemoCache_getUsuarios() (lectura memoizada)
 * - Resultado memoizado en _sesionResuelta para reutilización intra-ejecución
 *
 * @see Requirement 9: Consolidar lógica de verificación de roles y sesión
 * ============================================================
 */

/** @type {SesionResuelta|null} Resultado memoizado de resolverSesion() para la ejecución actual */
// eslint-disable-next-line no-var
var _sesionResuelta = null;

/**
 * Punto único de entrada de autenticación. Resuelve toda la información
 * del usuario en una sola operación:
 *   1. MemoCache_getSessionEmail() para obtener email (máximo 1 vez por ejecución)
 *   2. CacheService con clave 'USR_' + email (TTL 120s)
 *   3. Si cache-miss: MemoCache_getUsuarios() para buscar usuario en memoria
 *
 * El resultado se memoiza en _sesionResuelta para reutilización dentro de la
 * misma ejecución (verificarRol, obtenerUsuarioActual_v2, etc.).
 *
 * @returns {{autorizado: boolean, email: string, rol?: string, cupo?: number,
 *            emailDirector?: string, emailGerente?: string}}
 * @sheets_read 0-1 (0 en cache-hit de CacheService, 1 en cache-miss si MemoCache no tiene datos)
 */
function resolverSesion() {
  // Memoización: si ya se resolvió en esta ejecución, retornar resultado previo
  if (_sesionResuelta !== null) {
    return _sesionResuelta;
  }

  // 1. Obtener email de la sesión (máximo 1 llamada a Session.getActiveUser().getEmail())
  var email = MemoCache_getSessionEmail();

  if (!email) {
    _sesionResuelta = { autorizado: false, email: '' };
    return _sesionResuelta;
  }

  // 2. Intentar CacheService primero (TTL 120s)
  var usuario = null;
  var key = 'USR_' + email;

  try {
    var cache = CacheService.getScriptCache();
    var cached = cache.get(key);
    if (cached) {
      usuario = JSON.parse(cached);
    }
  } catch (e) {
    // CacheService no disponible — continuar sin cache (degradación elegante)
  }

  // 3. Cache-miss: buscar en MemoCache_getUsuarios() (búsqueda en memoria, sin lectura extra a Sheets)
  if (!usuario) {
    var usuarios = MemoCache_getUsuarios();
    var emailNorm = email.toLowerCase().trim();

    // Buscar por email primario
    for (var i = 0; i < usuarios.length; i++) {
      if (usuarios[i].email === emailNorm) {
        usuario = usuarios[i];
        break;
      }
    }

    // Si no se encuentra por primario, buscar en emails alternos
    if (!usuario) {
      for (var j = 0; j < usuarios.length; j++) {
        var alternos = usuarios[j].emailsAlternos || [];
        for (var k = 0; k < alternos.length; k++) {
          if (alternos[k] === emailNorm) {
            usuario = usuarios[j];
            break;
          }
        }
        if (usuario) break;
      }
    }

    // Si se encontró, cachear en CacheService para próximas ejecuciones
    if (usuario) {
      try {
        var cacheEscribir = CacheService.getScriptCache();
        var json = JSON.stringify(usuario);
        cacheEscribir.put(key, json, 120);

        // Cachear también bajo email primario si buscamos por alterno
        if (usuario.email !== emailNorm) {
          cacheEscribir.put('USR_' + usuario.email, json, 120);
        }

        // Cachear bajo cada email alterno
        var alts = usuario.emailsAlternos || [];
        for (var m = 0; m < alts.length; m++) {
          if (alts[m] && alts[m] !== emailNorm) {
            cacheEscribir.put('USR_' + alts[m], json, 120);
          }
        }
      } catch (e) {
        // CacheService no disponible — se retorna el resultado sin cachear
      }
    }
  }

  // 4. Construir resultado
  if (!usuario || !usuario.activo) {
    _sesionResuelta = { autorizado: false, email: email };
    return _sesionResuelta;
  }

  _sesionResuelta = {
    autorizado: true,
    email: usuario.email,
    rol: usuario.rol,
    cupo: usuario.cupo || 0,
    emailDirector: usuario.emailDirector || '',
    emailGerente: usuario.emailGerente || ''
  };

  return _sesionResuelta;
}

/**
 * Obtiene los datos del usuario actual (sesión Google Workspace).
 * Delega a resolverSesion() para backward compatibility.
 * Retorna campos de jerarquía (emailDirector, emailGerente) para el frontend.
 *
 * @returns {{autorizado:boolean, email:string, rol?:string, cupo?:number,
 *            emailDirector?:string, emailGerente?:string}}
 * @sheets_read 0-1 (delega a resolverSesion)
 */
function obtenerUsuarioActual_v2() {
  return resolverSesion();
}

/**
 * Verifica que el usuario actual tenga uno de los roles permitidos.
 * Reutiliza resultado de resolverSesion() (memoizado en _sesionResuelta).
 * Lanza excepción si no tiene acceso.
 *
 * @param {string[]} rolesPermitidos - Array de roles válidos
 * @returns {{email:string, rol:string, cupo:number, emailDirector:string, emailGerente:string}}
 * @throws {Error} NO_AUTORIZADO | SIN_PERMISOS
 * @sheets_read 0 (reutiliza sesión ya resuelta)
 */
function verificarRol(rolesPermitidos) {
  var sesion = resolverSesion();
  if (!sesion.autorizado) {
    throw new Error('NO_AUTORIZADO');
  }
  if (!_rolCoincide(sesion.rol, rolesPermitidos)) {
    throw new Error('SIN_PERMISOS');
  }
  return sesion;
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
 * Función canónica: retorna emails de usuarios activos con rol DIRECTOR, GERENTE o ADMIN.
 * Usa MemoCache_getUsuarios() para memoización (no requiere variable de cache propia).
 * Reemplaza: obtenerCorreosLideres (Codigo.js), UsuariosRepo_getCorreosSuperiores.
 *
 * @returns {string[]}
 * @sheets_read 0 (usa MemoCache_getUsuarios)
 */
function obtenerCorreosSuperiores() {
  var ROLES_SUPERIORES = ['DIRECTOR', 'GERENTE', 'ADMIN'];
  var usuarios = MemoCache_getUsuarios();
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
}



/**
 * Obtiene la cadena jerárquica directa de un usuario de la jerarquía comercial
 * más los ADMIN activos (jerarquía de análisis, siempre en copia).
 * 
 * Para CONSULTOR: sube a su DIRECTOR + ADMIN.
 * Para otros roles: solo retorna ADMIN activos.
 * (GERENTE no recibe CC en correos individuales — solo recibe su reporte de equipo)
 *
 * @param {string} emailUsuario - Email del usuario
 * @returns {string[]} Array de emails para CC (sin duplicados)
 */
function obtenerCadenaJerarquica(emailUsuario) {
  var resultado = [];
  var vistos = {};

  // 1. Buscar al usuario
  var usuario = UsuariosRepo_buscarPorEmail(emailUsuario);

  // 2. Si es CONSULTOR, resolver cadena comercial (solo DIRECTOR)
  if (usuario && (usuario.rol === 'CONSULTOR' || usuario.rol === 'COMERCIAL')) {
    if (usuario.emailDirector) {
      var emailDirector = usuario.emailDirector;
      var director = UsuariosRepo_buscarPorEmail(emailDirector);

      if (director && director.activo && emailDirector.includes('@')) {
        resultado.push(emailDirector);
        vistos[emailDirector] = true;
      }
    }
  }

  // 3. Siempre incluir ADMIN activos en CC
  var admins = UsuariosRepo_getCorreosAdmin();
  for (var i = 0; i < admins.length; i++) {
    if (!vistos[admins[i]]) {
      resultado.push(admins[i]);
      vistos[admins[i]] = true;
    }
  }

  return resultado;
}

/**
 * Retorna la lista de emails visible para el usuario autenticado.
 * Wrapper cacheado sobre UsuariosRepo_getEmailsEquipoVisible.
 *
 * Estrategia de resolución del rol:
 *   1. CacheService con clave 'EQUIPO_' + email (TTL 60s) — cache across-execution
 *   2. Si _sesionResuelta ya contiene el usuario (verificarRol/resolverSesion previo), reutiliza el rol directamente
 *   3. Fallback: _obtenerUsuarioPorEmail() para resolver el rol (Req 9.5)
 *
 * Si la función retorna null (ADMIN/ASESOR = sin filtro), cachea 'NULL' como sentinel.
 *
 * @param {string} email - Email del usuario
 * @returns {string[]|null} Lista de emails visibles, o null para acceso total
 * @sheets_read 0-1 (0 si cache-hit o sesión ya resuelta, 1 en fallback)
 */
function getEmailsEquipoVisible(email) {
  var emailNorm = String(email || '').toLowerCase().trim();
  if (!emailNorm) return [emailNorm];

  var key = 'EQUIPO_' + emailNorm;

  // 1. Intentar leer del cache (across-execution)
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

  // 2. Resolver el rol del usuario
  var rolUsuario = null;

  // Si resolverSesion/verificarRol ya fue llamado y el email coincide, reutilizar (Req 9.1)
  if (_sesionResuelta !== null && _sesionResuelta.autorizado && _sesionResuelta.email === emailNorm) {
    rolUsuario = _sesionResuelta.rol;
  } else {
    // Fallback: resolver vía _obtenerUsuarioPorEmail (Req 9.5)
    var usuario = _obtenerUsuarioPorEmail(emailNorm);
    if (!usuario) return [emailNorm];
    rolUsuario = usuario.rol;
  }

  var resultado = UsuariosRepo_getEmailsEquipoVisible(emailNorm, rolUsuario);

  // 3. Cachear resultado (60s)
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
