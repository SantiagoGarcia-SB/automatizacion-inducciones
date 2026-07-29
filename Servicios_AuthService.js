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
 * @returns {{autorizado:boolean, email:string, nombre?:string, rol?:string, cupo?:number}}
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
    nombre: usuario.nombre,
    rol: usuario.rol,
    cupo: usuario.cupo || 0
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
  if (rolesPermitidos.indexOf(usuario.rol) === -1) {
    throw new Error('SIN_PERMISOS');
  }
  return usuario;
}

/**
 * Busca un usuario por email. Usa CacheService (TTL 120s).
 * @param {string} email - Email en minúsculas
 * @returns {Object|null} Datos del usuario o null si no existe
 */
function _obtenerUsuarioPorEmail(email) {
  var cache = CacheService.getScriptCache();
  var key = 'USR_' + email;
  var cached = cache.get(key);

  if (cached) {
    return JSON.parse(cached);
  }

  // Cache miss → leer toda la pestaña USUARIOS (pequeña, ~50 filas)
  var usuarios = _leerPestanaUsuarios();
  var encontrado = null;

  for (var i = 0; i < usuarios.length; i++) {
    if (usuarios[i].email === email) {
      encontrado = usuarios[i];
      break;
    }
  }

  if (encontrado) {
    cache.put(key, JSON.stringify(encontrado), 120);
  }

  return encontrado;
}

/**
 * Lee la pestaña USUARIOS completa y retorna array de objetos.
 * @returns {Object[]} Lista de usuarios
 */
function _leerPestanaUsuarios() {
  var hojaId = getHojaControlId();
  var ss = SpreadsheetApp.openById(hojaId);
  var hoja = ss.getSheetByName('USUARIOS');

  if (!hoja) {
    Logger.log('WARN: Pestaña USUARIOS no encontrada');
    return [];
  }

  var datos = hoja.getDataRange().getValues();
  if (datos.length < 2) return [];

  var resultado = [];
  for (var i = 1; i < datos.length; i++) {
    var fila = datos[i];
    var emailFila = String(fila[0] || '').toLowerCase().trim();
    if (!emailFila) continue;

    resultado.push({
      email: emailFila,
      nombre: String(fila[1] || '').trim(),
      rol: String(fila[2] || '').toUpperCase().trim(),
      cupo: Number(fila[3]) || 0,
      director: String(fila[4] || '').trim(),
      backup: String(fila[5] || '').trim(),
      backupActivo: fila[6] === true,
      activo: fila[7] !== false
    });
  }

  return resultado;
}

/**
 * Invalida el cache de un usuario específico (usar al editar USUARIOS).
 * @param {string} email - Email del usuario a invalidar
 */
function invalidarCacheUsuario(email) {
  var cache = CacheService.getScriptCache();
  cache.remove('USR_' + email.toLowerCase().trim());
}
