/**
 * ============================================================
 * UsuariosRepo — Acceso a datos de la pestaña USUARIOS (esquema v2)
 *
 * Nuevo esquema de 7 columnas:
 *   A=EMAIL, B=ROL, C=ACTIVO, D=CUPO,
 *   E=EMAIL_DIRECTOR, F=EMAIL_GERENTE, G=EMAILS_ALTERNOS
 *
 * Funciones globales (Google Apps Script, sin módulos):
 *   - UsuariosRepo_leerTodos()
 *   - UsuariosRepo_buscarPorEmail(email)
 *   - UsuariosRepo_guardar(datos, esNuevo)
 *   - UsuariosRepo_getEmailsEquipoVisible(emailUsuario, rol)
 *   - UsuariosRepo_getCorreosSuperiores() [deprecated — usar obtenerCorreosSuperiores() de AuthService]
 * ============================================================
 */

// ─── Constantes de columnas (índices 0-based) ───────────────
// Orden real en la hoja: EMAIL, ROL, ACTIVO, EMAIL_DIRECTOR, EMAIL_GERENTE, EMAILS_ALTERNOS, CUPO
var COL_EMAIL          = 0;
var COL_ROL            = 1;
var COL_ACTIVO         = 2;
var COL_EMAIL_DIRECTOR = 3;
var COL_EMAIL_GERENTE  = 4;
var COL_EMAILS_ALTERNOS = 5;
var COL_CUPO           = 6;

/** Roles válidos en el sistema */
var ROLES_VALIDOS = ['CONSULTOR', 'ANALISTA', 'AUXILIAR', 'DIRECTOR', 'GERENTE', 'ADMIN', 'ASESOR'];

/**
 * @typedef {Object} UsuarioRecord
 * @property {string} email          - Email primario (col A, normalizado a minúsculas)
 * @property {string} rol            - Rol del usuario (col B)
 * @property {boolean} activo        - Estado activo (col C)
 * @property {number} cupo           - Cupo máximo de solicitudes (col D)
 * @property {string} emailDirector  - Email del director supervisor (col E)
 * @property {string} emailGerente   - Email del gerente supervisor (col F)
 * @property {string[]} emailsAlternos - Lista de emails alternos (col G, parseada)
 */

/**
 * Escribe o actualiza un registro de usuario (7 columnas).
 * @param {UsuarioRecord} datos
 * @param {boolean} esNuevo
 * @returns {{ok: boolean, mensaje: string}}
 */
function UsuariosRepo_guardar(datos, esNuevo) {
  // Validar ROL contra enum
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
    var ss = SpreadsheetRegistry_get(hojaId);
    var hoja = ss.getSheetByName('USUARIOS');

    if (!hoja) {
      return { ok: false, mensaje: 'Pestaña USUARIOS no encontrada' };
    }

    var todosLosDatos = hoja.getDataRange().getValues();
    var emailNuevo = String(datos.email || '').toLowerCase().trim();
    var emailsAlternosNuevos = Array.isArray(datos.emailsAlternos) ? datos.emailsAlternos : [];

    // Normalizar emails alternos
    var alternosNormalizados = [];
    for (var a = 0; a < emailsAlternosNuevos.length; a++) {
      var alt = String(emailsAlternosNuevos[a] || '').toLowerCase().trim();
      if (alt) {
        alternosNormalizados.push(alt);
      }
    }

    if (esNuevo) {
      // Validar que el email primario no exista en otro registro
      for (var i = 1; i < todosLosDatos.length; i++) {
        var filaExistente = todosLosDatos[i];
        var emailExistente = String(filaExistente[COL_EMAIL] || '').toLowerCase().trim();

        if (emailExistente === emailNuevo) {
          return { ok: false, mensaje: 'El email ' + emailNuevo + ' ya está registrado como primario/alterno de otro usuario' };
        }

        // Verificar si el email nuevo está en los alternos de otro registro
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

      // Validar que cada email alterno del nuevo usuario no colisione con emails primarios existentes
      for (var k = 0; k < alternosNormalizados.length; k++) {
        var altNuevo = alternosNormalizados[k];
        for (var m = 1; m < todosLosDatos.length; m++) {
          var emailPrimExistente = String(todosLosDatos[m][COL_EMAIL] || '').toLowerCase().trim();
          if (emailPrimExistente === altNuevo) {
            return { ok: false, mensaje: 'El email ' + altNuevo + ' ya está registrado como primario/alterno de otro usuario' };
          }
          // Verificar también contra alternos de otros registros
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

      // Escribir nueva fila con 7 campos (orden: EMAIL, ROL, ACTIVO, EMAIL_DIRECTOR, EMAIL_GERENTE, EMAILS_ALTERNOS, CUPO)
      var nuevaFila = [
        emailNuevo,
        rolNormalizado,
        datos.activo === true || datos.activo === 'TRUE' || datos.activo === 'true',
        String(datos.emailDirector || '').toLowerCase().trim(),
        String(datos.emailGerente || '').toLowerCase().trim(),
        alternosNormalizados.join(','),
        Number(datos.cupo) || 0
      ];

      hoja.appendRow(nuevaFila);
      return { ok: true, mensaje: 'Usuario guardado' };

    } else {
      // Actualizar: buscar fila existente por email primario
      var filaEncontrada = -1;
      for (var p = 1; p < todosLosDatos.length; p++) {
        var emailFila = String(todosLosDatos[p][COL_EMAIL] || '').toLowerCase().trim();
        if (emailFila === emailNuevo) {
          filaEncontrada = p + 1; // +1 porque getRange es 1-based
          break;
        }
      }

      if (filaEncontrada === -1) {
        return { ok: false, mensaje: 'Usuario no encontrado: ' + emailNuevo };
      }

      // Actualizar los 7 campos de la fila (orden: EMAIL, ROL, ACTIVO, EMAIL_DIRECTOR, EMAIL_GERENTE, EMAILS_ALTERNOS, CUPO)
      var datosActualizados = [[
        emailNuevo,
        rolNormalizado,
        datos.activo === true || datos.activo === 'TRUE' || datos.activo === 'true',
        String(datos.emailDirector || '').toLowerCase().trim(),
        String(datos.emailGerente || '').toLowerCase().trim(),
        alternosNormalizados.join(','),
        Number(datos.cupo) || 0
      ]];

      hoja.getRange(filaEncontrada, 1, 1, 7).setValues(datosActualizados);
      return { ok: true, mensaje: 'Usuario guardado' };
    }
  } finally {
    lock.releaseLock();
  }
}

/**
 * Lee todos los usuarios de la pestaña USUARIOS (nuevo esquema 7 columnas).
 * Delega a MemoCache_getUsuarios() para aprovechar la memoización por ejecución.
 * @returns {UsuarioRecord[]}
 */
function UsuariosRepo_leerTodos() {
  return MemoCache_getUsuarios();
}

/**
 * Retorna emails de usuarios con roles superiores activos.
 * Reemplazo de obtenerCorreosLideres().
 * @returns {string[]}
 */
function UsuariosRepo_getCorreosSuperiores() {
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
}

/**
 * Retorna emails de usuarios con rol ADMIN activos.
 * Usado para alertas de sistema (lotes estancados, salud) que solo
 * deben llegar a administradores.
 * @returns {string[]}
 */
function UsuariosRepo_getCorreosAdmin() {
  var usuarios = UsuariosRepo_leerTodos();
  var resultado = [];

  for (var i = 0; i < usuarios.length; i++) {
    var usuario = usuarios[i];
    if (usuario.activo === true && usuario.rol === 'ADMIN') {
      resultado.push(usuario.email);
    }
  }

  return resultado;
}

/**
 * Retorna los emails del equipo visible para un usuario dado.
 * Implementa la resolución transitiva de jerarquía.
 *
 * - CONSULTOR/ANALISTA/AUXILIAR → [emailUsuario]
 * - DIRECTOR → [emailUsuario] + emails de usuarios cuyo EMAIL_DIRECTOR = emailUsuario
 * - GERENTE → [emailUsuario] + Directores cuyo EMAIL_GERENTE = emailUsuario + transitivamente equipos de esos Directores
 * - ADMIN/ASESOR → null (sin filtro, acceso total)
 *
 * Aliases legacy: LIDER → DIRECTOR, COMERCIAL → CONSULTOR
 *
 * @param {string} emailUsuario
 * @param {string} rol
 * @returns {string[]|null} Lista de emails visibles, o null para acceso total (ADMIN/ASESOR)
 */
function UsuariosRepo_getEmailsEquipoVisible(emailUsuario, rol) {
  var emailNorm = String(emailUsuario || '').toLowerCase().trim();
  var rolNorm = String(rol || '').toUpperCase().trim();

  // Alias legacy
  if (rolNorm === 'LIDER') rolNorm = 'DIRECTOR';
  if (rolNorm === 'COMERCIAL') rolNorm = 'CONSULTOR';
  if (rolNorm === 'ADMINISTRADOR') rolNorm = 'ADMIN';

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
    // Encontrar los Directores del Gerente
    var directoresDelGerente = [];
    for (var d = 0; d < todos.length; d++) {
      if (todos[d].emailGerente === emailNorm && todos[d].email !== emailNorm) {
        directoresDelGerente.push(todos[d].email);
        equipoGerente.push(todos[d].email);
      }
    }
    // Para cada Director, buscar sus subordinados
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

  // Fallback: rol no reconocido → solo email propio (defensivo)
  return [emailNorm];
}

/**
 * Busca un usuario por email primario o alterno.
 * Primero busca coincidencia exacta en columna EMAIL (A),
 * luego busca en EMAILS_ALTERNOS (G) de cada registro.
 *
 * @param {string} email - Email a buscar (se normaliza a minúsculas)
 * @returns {UsuarioRecord|null} El registro completo del email primario, o null si no se encuentra
 */
function UsuariosRepo_buscarPorEmail(email) {
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
}
/**
 * Resuelve el conjunto de correos que un Director puede consultar según el alcance elegido.
 * Solo permite el equipo propio, el equipo de un Director activo de la misma gerencia,
 * o todos los equipos asociados a esa gerencia.
 *
 * @param {string} emailDirector - Email del Director autenticado.
 * @param {{tipo:string,directorEmail?:string}|null|undefined} alcance - Alcance solicitado desde la interfaz.
 * @returns {string[]} Correos autorizados para consultar.
 * @throws {Error} ALCANCE_INVALIDO si el alcance no pertenece al Director autenticado.
 */
function UsuariosRepo_resolverAlcanceDirector(emailDirector, alcance) {
  var emailNorm = String(emailDirector || '').toLowerCase().trim();
  var directorAutenticado = UsuariosRepo_buscarPorEmail(emailNorm);
  if (!directorAutenticado || !directorAutenticado.activo || directorAutenticado.rol !== 'DIRECTOR') {
    throw new Error('ALCANCE_INVALIDO');
  }

  var alcanceNormalizado = _normalizarAlcanceDirector_(alcance);
  var todos = UsuariosRepo_leerTodos();

  if (alcanceNormalizado.tipo === 'MI_EQUIPO') {
    return _obtenerEquipoDirector_(todos, emailNorm);
  }

  var emailGerente = String(directorAutenticado.emailGerente || '').toLowerCase().trim();
  if (!emailGerente) {
    throw new Error('ALCANCE_INVALIDO');
  }

  if (alcanceNormalizado.tipo === 'EQUIPO_DIRECTOR') {
    var directorSeleccionado = UsuariosRepo_buscarPorEmail(alcanceNormalizado.directorEmail);
    if (!directorSeleccionado || !directorSeleccionado.activo || directorSeleccionado.rol !== 'DIRECTOR' ||
        String(directorSeleccionado.emailGerente || '').toLowerCase().trim() !== emailGerente) {
      throw new Error('ALCANCE_INVALIDO');
    }
    return _obtenerEquipoDirector_(todos, directorSeleccionado.email);
  }

  var equiposGerencia = [];
  for (var i = 0; i < todos.length; i++) {
    var usuario = todos[i];
    if (usuario.rol !== 'DIRECTOR' || String(usuario.emailGerente || '').toLowerCase().trim() !== emailGerente) continue;
    equiposGerencia = equiposGerencia.concat(_obtenerEquipoDirector_(todos, usuario.email));
  }
  return _eliminarDuplicadosEmails_(equiposGerencia);
}

/**
 * Retorna las opciones de alcance disponibles para un Director autenticado.
 * @param {string} emailDirector - Email del Director autenticado.
 * @returns {Array<{tipo:string,directorEmail?:string,nombre:string}>} Opciones autorizadas para la interfaz.
 */
function UsuariosRepo_getOpcionesAlcanceDirector(emailDirector) {
  var emailNorm = String(emailDirector || '').toLowerCase().trim();
  var directorAutenticado = UsuariosRepo_buscarPorEmail(emailNorm);
  var opciones = [{ tipo: 'MI_EQUIPO', nombre: 'Mi equipo' }];

  if (!directorAutenticado || !directorAutenticado.activo || directorAutenticado.rol !== 'DIRECTOR') {
    return opciones;
  }

  var emailGerente = String(directorAutenticado.emailGerente || '').toLowerCase().trim();
  if (!emailGerente) return opciones;

  var todos = UsuariosRepo_leerTodos();
  var tieneOtroDirector = false;
  for (var i = 0; i < todos.length; i++) {
    var usuario = todos[i];
    if (usuario.rol !== 'DIRECTOR' || !usuario.activo || usuario.email === emailNorm) continue;
    if (String(usuario.emailGerente || '').toLowerCase().trim() !== emailGerente) continue;
    opciones.push({
      tipo: 'EQUIPO_DIRECTOR',
      directorEmail: usuario.email,
      nombre: 'Equipo de ' + emailANombre(usuario.email, 'COMPLETO')
    });
    tieneOtroDirector = true;
  }

  if (tieneOtroDirector) {
    opciones.push({ tipo: 'TODA_GERENCIA', nombre: 'Toda mi gerencia' });
  }

  return opciones;
}

/**
 * Normaliza y valida la forma del alcance recibido desde la interfaz.
 * @param {{tipo:string,directorEmail?:string}|null|undefined} alcance - Alcance solicitado.
 * @returns {{tipo:string,directorEmail?:string}} Alcance normalizado.
 * @private
 */
function _normalizarAlcanceDirector_(alcance) {
  if (alcance === null || alcance === undefined) return { tipo: 'MI_EQUIPO' };
  if (typeof alcance !== 'object' || Array.isArray(alcance)) throw new Error('ALCANCE_INVALIDO');

  var claves = Object.keys(alcance).sort();
  var tipo = String(alcance.tipo || '').toUpperCase().trim();
  if (tipo === 'MI_EQUIPO' || tipo === 'TODA_GERENCIA') {
    if (claves.length !== 1 || claves[0] !== 'tipo') throw new Error('ALCANCE_INVALIDO');
    return { tipo: tipo };
  }

  if (tipo === 'EQUIPO_DIRECTOR') {
    if (claves.length !== 2 || claves[0] !== 'directorEmail' || claves[1] !== 'tipo') throw new Error('ALCANCE_INVALIDO');
    var directorEmail = String(alcance.directorEmail || '').toLowerCase().trim();
    if (!directorEmail || directorEmail.indexOf('@') === -1) throw new Error('ALCANCE_INVALIDO');
    return { tipo: tipo, directorEmail: directorEmail };
  }

  throw new Error('ALCANCE_INVALIDO');
}

/**
 * Obtiene el Director y sus subordinados directos sin repetir correos.
 * @param {UsuarioRecord[]} usuarios - Usuarios registrados.
 * @param {string} emailDirector - Email del Director objetivo.
 * @returns {string[]} Correos del equipo.
 * @private
 */
function _obtenerEquipoDirector_(usuarios, emailDirector) {
  var emailNorm = String(emailDirector || '').toLowerCase().trim();
  var equipo = [emailNorm];
  for (var i = 0; i < usuarios.length; i++) {
    if (usuarios[i].emailDirector === emailNorm && usuarios[i].email !== emailNorm) {
      equipo.push(usuarios[i].email);
    }
  }
  return _eliminarDuplicadosEmails_(equipo);
}

/**
 * Elimina correos repetidos conservando el orden de la primera aparición.
 * @param {string[]} emails - Correos a normalizar.
 * @returns {string[]} Correos únicos.
 * @private
 */
function _eliminarDuplicadosEmails_(emails) {
  var vistos = {};
  var resultado = [];
  for (var i = 0; i < emails.length; i++) {
    var email = String(emails[i] || '').toLowerCase().trim();
    if (!email || vistos[email]) continue;
    vistos[email] = true;
    resultado.push(email);
  }
  return resultado;
}