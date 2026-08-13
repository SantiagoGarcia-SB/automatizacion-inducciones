/**
 * ============================================================
 * Api.js — Funciones expuestas a google.script.run
 *
 * Capa delgada: verifica sesión → llama servicio → retorna.
 * Cada función maneja errores y retorna objetos limpios.
 * ============================================================
 */

/**
 * Retorna datos del usuario logueado (rol, permisos, jerarquía).
 * Es la primera llamada que hace el frontend al cargar.
 * Expone emailDirector y emailGerente para que el frontend muestre la cadena de supervisión.
 * @returns {{autorizado:boolean, email:string, rol?:string, cupo?:number,
 *            emailDirector?:string, emailGerente?:string}}
 * @sheets_read 0-1
 * @sheets_write 0
 */
function api_obtenerUsuarioActual() {
  try {
    return obtenerUsuarioActual_v2();
  } catch (e) {
    _registrarEvento_('ERROR', 'Api.js', 'api_obtenerUsuarioActual', e.message);
    return { autorizado: false, email: '', error: 'Error al verificar acceso' };
  }
}

/**
 * Retorna KPIs del dashboard para el usuario logueado.
 * Usa getEmailsEquipoVisible para determinar la visibilidad jerárquica:
 * - null → métricas globales (ADMIN, ASESOR)
 * - string[] → métricas del equipo visible (DIRECTOR, GERENTE, CONSULTOR, etc.)
 * @returns {{radicados:number, enAnalisis:number, pendientePS:number, errorTerceros:number, terminados:number}}
 * @sheets_read 0-2
 * @sheets_write 0
 */
function api_obtenerResumenDashboard() {
  try {
    var usuario = verificarRol(['COMERCIAL', 'CONSULTOR', 'AUXILIAR', 'ANALISTA', 'LIDER', 'DIRECTOR', 'GERENTE', 'ADMIN', 'ASESOR']);
    var emailsEquipo = getEmailsEquipoVisible(usuario.email);
    // emailsEquipo === null → sin filtro (acceso total)
    // emailsEquipo es array → filtrar por esos emails
    var cacheKey = 'RESUMEN_' + _hashEquipoVisible(emailsEquipo);

    // Intentar cache primero (TTL 60s)
    var cache = CacheService.getScriptCache();
    var cached = cache.get(cacheKey);
    if (cached) return JSON.parse(cached);

    // Cache miss → leer de Sheets
    var resumen = obtenerResumenComercial(emailsEquipo);
    cache.put(cacheKey, JSON.stringify(resumen), 60);
    return resumen;
  } catch (e) {
    _registrarEvento_('ERROR', 'Api.js', 'api_obtenerResumenDashboard', e.message);
    return _resumenVacio();
  }
}

/**
 * Retorna los lotes del usuario logueado (paginado).
 * Usa getEmailsEquipoVisible para determinar la visibilidad jerárquica:
 * - null → muestra TODOS los lotes (ADMIN, ASESOR)
 * - string[] → solo lotes del equipo visible
 * @param {number} pagina
 * @param {number} porPagina
 * @param {string} [filtroEstado] - Filtro por estado
 * @param {string} [busquedaId] - Búsqueda por ID de lote
 * @param {string|null} [fechaDesde] - Fecha inicio para búsqueda histórica (ISO string o date string)
 * @param {string|null} [fechaHasta] - Fecha fin para búsqueda histórica (ISO string o date string)
 * @returns {{datos:Array, total:number, pagina:number, totalPaginas:number}}
 * @sheets_read 1-2
 * @sheets_write 0
 */
function api_obtenerMisLotes(pagina, porPagina, filtroEstado, busquedaId, fechaDesde, fechaHasta) {
  try {
    var usuario = verificarRol(['COMERCIAL', 'CONSULTOR', 'AUXILIAR', 'ANALISTA', 'LIDER', 'DIRECTOR', 'GERENTE', 'ADMIN', 'ASESOR']);
    var emailsEquipo = getEmailsEquipoVisible(usuario.email);
    // emailsEquipo === null → sin filtro (acceso total)
    // emailsEquipo es array → filtrar por esos emails
    return obtenerLotesDeComercial(emailsEquipo, pagina, porPagina, filtroEstado, busquedaId, fechaDesde, fechaHasta);
  } catch (e) {
    _registrarEvento_('ERROR', 'Api.js', 'api_obtenerMisLotes', e.message);
    return { datos: [], total: 0, pagina: 1, totalPaginas: 0 };
  }
}

/**
 * Retorna el detalle de un lote: datos del lote + lista de solicitudes.
 * @param {string} idLote - ID del lote a consultar
 * @returns {{lote:Object, solicitudes:Array}}
 * @sheets_read 1-2
 * @sheets_write 0
 */
function api_obtenerDetalleLote(idLote) {
  try {
    verificarRol(['COMERCIAL', 'CONSULTOR', 'AUXILIAR', 'ANALISTA', 'LIDER', 'DIRECTOR', 'GERENTE', 'ADMIN', 'ASESOR']);
    return obtenerDetalleLote(idLote);
  } catch (e) {
    _registrarEvento_('ERROR', 'Api.js', 'api_obtenerDetalleLote', e.message);
    return { lote: null, solicitudes: [] };
  }
}

/**
 * Retorna TODOS los lotes (sin paginación servidor) para cache en frontend.
 * El frontend pagina y filtra localmente (instantáneo).
 * Usa CacheServiceWrapper para manejar payloads > 100 KB con fragmentación automática.
 * Filtrado por vista jerárquica: cada rol ve solo los lotes de su equipo visible.
 * @returns {Array} Lista de lotes con estados
 * @sheets_read 0-2
 * @sheets_write 0
 */
function api_obtenerTodosLosLotes() {
  try {
    var usuario = verificarRol(['COMERCIAL', 'CONSULTOR', 'AUXILIAR', 'ANALISTA', 'LIDER', 'DIRECTOR', 'GERENTE', 'ADMIN', 'ASESOR']);
    var emailsEquipo = getEmailsEquipoVisible(usuario.email);
    // null → acceso total (ADMIN/ASESOR), array → filtrar por esos emails
    var filtroEmail = emailsEquipo === null ? null : emailsEquipo;
    var cacheKey = 'LOTES_' + (emailsEquipo === null ? 'GLOBAL' : usuario.email);

    // Intentar cache primero (CacheWrapper maneja fragmentación automáticamente)
    var cached = CacheWrapper_getJSON(cacheKey);
    if (cached) return cached;

    // Cache-miss → leer de Sheets
    var resultado = obtenerLotesDeComercial(filtroEmail, 1, 9999, '', '');
    var datos = resultado.datos || [];

    // CacheWrapper maneja automáticamente:
    // - JSON < 99 KB → 1 clave directa
    // - JSON 99-500 KB → fragmentación automática en _PART_01, _PART_02...
    // - JSON > 500 KB → no cachea, registra WARN
    CacheWrapper_putJSON(cacheKey, datos, 60);

    return datos;
  } catch (e) {
    _registrarEvento_('ERROR', 'Api.js', 'api_obtenerTodosLosLotes', e.message);
    return [];
  }
}

/**
 * Retorna datos mínimos de usuarios para popular filtros del dashboard.
 * Filtrado por vista jerárquica del solicitante. No expone campos sensibles (cupo, emailsAlternos).
 * Accesible por GERENTE, DIRECTOR, ADMIN, ASESOR (y aliases de transición).
 * @returns {Array<{email: string, nombre: string, rol: string, emailDirector: string, emailGerente: string, activo: boolean}>}
 * @sheets_read 1
 * @sheets_write 0
 */
function api_obtenerUsuariosDashboard() {
  try {
    var usuario = verificarRol(['GERENTE', 'DIRECTOR', 'ADMIN', 'ASESOR', 'LIDER']);
    var todos = UsuariosRepo_leerTodos();
    var emailsVisibles = getEmailsEquipoVisible(usuario.email);

    var usuariosFiltrados = todos;

    // Si emailsVisibles !== null, filtrar por equipo visible
    if (emailsVisibles !== null) {
      usuariosFiltrados = [];
      for (var i = 0; i < todos.length; i++) {
        if (emailsVisibles.indexOf(todos[i].email) !== -1) {
          usuariosFiltrados.push(todos[i]);
        }
      }
    }

    // Mapear a campos mínimos (sin cupo, sin emailsAlternos)
    var resultado = [];
    for (var j = 0; j < usuariosFiltrados.length; j++) {
      var u = usuariosFiltrados[j];
      resultado.push({
        email: u.email,
        nombre: emailANombre(u.email, 'COMPLETO'),
        rol: u.rol,
        emailDirector: u.emailDirector || '',
        emailGerente: u.emailGerente || '',
        activo: u.activo
      });
    }

    return resultado;
  } catch (e) {
    _registrarEvento_('ERROR', 'Api.js', 'api_obtenerUsuariosDashboard', e.message);
    return [];
  }
}

/**
 * Retorna la lista de usuarios registrados, filtrada según la vista jerárquica del solicitante.
 * Accesible por DIRECTOR, GERENTE, ADMIN (y LIDER como alias de transición).
 * - ADMIN/ASESOR → todos los usuarios (sin filtro)
 * - DIRECTOR/GERENTE → solo usuarios de su equipo visible
 * @returns {Array} Lista de usuarios
 * @sheets_read 1
 * @sheets_write 0
 */
function api_obtenerUsuarios() {
  try {
    var usuario = verificarRol(['DIRECTOR', 'GERENTE', 'ADMIN', 'LIDER']);
    var todos = UsuariosRepo_leerTodos();
    var emailsVisibles = getEmailsEquipoVisible(usuario.email);

    // null = acceso total (ADMIN/ASESOR)
    if (emailsVisibles === null) {
      return todos;
    }

    // Filtrar por emails del equipo visible
    var resultado = [];
    for (var i = 0; i < todos.length; i++) {
      if (emailsVisibles.indexOf(todos[i].email) !== -1) {
        resultado.push(todos[i]);
      }
    }
    return resultado;
  } catch (e) {
    _registrarEvento_('ERROR', 'Api.js', 'api_obtenerUsuarios', e.message);
    return [];
  }
}

/**
 * Crea o actualiza un usuario en la pestaña USUARIOS (esquema v2 de 7 columnas).
 * Accesible por DIRECTOR, GERENTE, ADMIN (y LIDER como alias de transición).
 * Usa UsuariosRepo_guardar que valida ROL contra enum y unicidad de email.
 * @param {Object} datos - {email, rol, activo, cupo, emailDirector, emailGerente, emailsAlternos}
 * @param {boolean} esNuevo - true = crear, false = actualizar
 * @returns {{ok:boolean, mensaje:string}}
 * @sheets_read 1
 * @sheets_write 1
 */
function api_guardarUsuario(datos, esNuevo) {
  try {
    verificarRol(['DIRECTOR', 'GERENTE', 'ADMIN', 'LIDER']);

    if (!datos || !datos.email || !datos.rol) {
      return { ok: false, mensaje: 'Email y rol son obligatorios.' };
    }

    // Normalizar email antes de delegar al repositorio
    datos.email = String(datos.email).toLowerCase().trim();

    // Delegar al repositorio que maneja validación de ROL, unicidad y escritura de 7 campos
    var resultado = UsuariosRepo_guardar(datos, esNuevo);

    // Invalidar cache del usuario después de un guardado exitoso
    if (resultado.ok) {
      invalidarCacheUsuario(datos);
    }

    return resultado;
  } catch (e) {
    _registrarEvento_('ERROR', 'Api.js', 'api_guardarUsuario', e.message);
    return { ok: false, mensaje: 'Error: ' + e.message };
  }
}

/**
 * Retorna todas las solicitudes de registro analisis (resumen para listado).
 * PAGINADO EN SERVIDOR: carga solo un bloque de filas para velocidad.
 * @param {number} desde - Fila inicio (0-based desde el final). 0 = las más recientes
 * @param {number} cantidad - Cuántas filas traer (default 500)
 * @returns {{datos:Array, total:number, cargadas:number}}
 * @sheets_read 1
 * @sheets_write 0
 */
function api_obtenerSolicitudes(desde, cantidad) {
  try {
    verificarRol(['DIRECTOR', 'GERENTE', 'ADMIN', 'LIDER']);
    return obtenerSolicitudesResumen(desde || 0, cantidad || 300);
  } catch (e) {
    _registrarEvento_('ERROR', 'Api.js', 'api_obtenerSolicitudes', e.message);
    return { datos: [], total: 0, cargadas: 0 };
  }
}

/**
 * Retorna el detalle completo de una solicitud (todos los campos de evaluación).
 * @param {number} filaNum - Número de fila en registro analisis
 * @returns {Object} Datos completos de la solicitud
 * @sheets_read 1
 * @sheets_write 0
 */
function api_obtenerDetalleSolicitud(filaNum) {
  try {
    verificarRol(['ANALISTA', 'AUXILIAR', 'DIRECTOR', 'GERENTE', 'ADMIN', 'LIDER']);
    return obtenerDetalleSolicitud(filaNum);
  } catch (e) {
    _registrarEvento_('ERROR', 'Api.js', 'api_obtenerDetalleSolicitud', e.message);
    return null;
  }
}

// ============================================================
//  API — AUXILIAR (Cola y gestión de solicitudes)
// ============================================================

/**
 * Retorna solicitudes en cola para el auxiliar (PENDIENTE RADICAR en Control_General).
 * Solo datos del listado (rápido). Datos completos se cargan al abrir el modal.
 * Usa vista jerárquica: ADMIN/ASESOR ven todos, otros filtran por equipo visible.
 * @returns {Array}
 * @sheets_read 1
 * @sheets_write 0
 */
function api_obtenerColaAuxiliar() {
  try {
    var usuario = verificarRol(['AUXILIAR', 'CONSULTOR', 'COMERCIAL', 'ANALISTA', 'DIRECTOR', 'GERENTE', 'ASESOR', 'ADMIN']);
    var emailsEquipo = getEmailsEquipoVisible(usuario.email);
    // null → sin filtro (ADMIN/ASESOR); array → filtrar por equipo visible
    return obtenerColaAuxiliar(emailsEquipo);
  } catch (e) {
    _registrarEvento_('ERROR', 'Api.js', 'api_obtenerColaAuxiliar', e.message);
    return [];
  }
}

/**
 * Retorna datos completos de una solicitud para el modal del auxiliar.
 * @param {number} filaNum - Fila en Control_General
 * @returns {Object}
 * @sheets_read 1
 * @sheets_write 0
 */
function api_obtenerSolicitudAuxiliar(filaNum) {
  try {
    verificarRol(['AUXILIAR', 'CONSULTOR', 'COMERCIAL', 'ANALISTA', 'DIRECTOR', 'GERENTE', 'ASESOR', 'ADMIN']);
    return obtenerSolicitudCompletaAuxiliar(filaNum);
  } catch (e) {
    _registrarEvento_('ERROR', 'Api.js', 'api_obtenerSolicitudAuxiliar', e.message);
    return null;
  }
}

/**
 * Retorna las solicitudes asignadas al auxiliar logueado.
 * @returns {Array}
 * @sheets_read 1
 * @sheets_write 0
 */
function api_obtenerMisSolicitudesAuxiliar() {
  try {
    var usuario = verificarRol(['AUXILIAR', 'CONSULTOR', 'COMERCIAL', 'ANALISTA', 'DIRECTOR', 'GERENTE', 'ASESOR', 'ADMIN']);
    return obtenerSolicitudesAuxiliar(usuario.email);
  } catch (e) {
    _registrarEvento_('ERROR', 'Api.js', 'api_obtenerMisSolicitudesAuxiliar', e.message);
    return [];
  }
}

/**
 * Auxiliar toma una solicitud de la cola.
 * @param {string} idLote - ID del lote
 * @param {string} uuid - UUID de la solicitud
 * @returns {{ok:boolean, mensaje:string}}
 * @sheets_read 1
 * @sheets_write 1
 */
function api_tomarSolicitudAuxiliar(idLote, uuid) {
  try {
    var usuario = verificarRol(['AUXILIAR', 'CONSULTOR', 'COMERCIAL', 'ANALISTA', 'DIRECTOR', 'GERENTE', 'ASESOR', 'ADMIN']);
    return tomarSolicitudAuxiliar(idLote, uuid, usuario.email);
  } catch (e) {
    _registrarEvento_('ERROR', 'Api.js', 'api_tomarSolicitudAuxiliar', e.message);
    return { ok: false, mensaje: 'Error: ' + e.message };
  }
}

/**
 * Auxiliar marca una solicitud como RADICADO y guarda números de SAI.
 * @param {string} uuid - UUID de la solicitud
 * @param {Object} numeros - {solicitudInquilino, nroCoa1, nroCoa2...}
 * @returns {{ok:boolean, mensaje:string}}
 * @sheets_read 1
 * @sheets_write 1
 */
function api_marcarRadicado(uuid, numeros) {
  try {
    verificarRol(['AUXILIAR', 'CONSULTOR', 'COMERCIAL', 'ANALISTA', 'DIRECTOR', 'GERENTE', 'ASESOR', 'ADMIN']);
    return marcarSolicitudRadicada(uuid, numeros);
  } catch (e) {
    _registrarEvento_('ERROR', 'Api.js', 'api_marcarRadicado', e.message);
    return { ok: false, mensaje: 'Error: ' + e.message };
  }
}

/**
 * Auxiliar marca ERROR EN TERCEROS + guarda detalles en Errores_Terceros.
 * @param {string} uuid - UUID de la solicitud
 * @param {Array} participantes - [{participante:'INQ', requerimientos:'celular|doc'}]
 * @param {string} nota - Nota interna del auxiliar
 * @param {number} [filaNum] - Número de fila en Control_General (ya conocido desde obtenerColaAuxiliar)
 * @returns {{ok:boolean, mensaje:string}}
 * @sheets_read 2-3
 * @sheets_write 2
 */
function api_marcarErrorTerceros(uuid, participantes, nota, filaNum) {
  try {
    var usuario = verificarRol(['AUXILIAR', 'CONSULTOR', 'COMERCIAL', 'ANALISTA', 'DIRECTOR', 'GERENTE', 'ASESOR', 'ADMIN']);
    return marcarErrorEnTerceros(uuid, participantes, nota, usuario.email, filaNum);
  } catch (e) {
    _registrarEvento_('ERROR', 'Api.js', 'api_marcarErrorTerceros', e.message);
    return { ok: false, mensaje: 'Error: ' + e.message };
  }
}

// ============================================================
//  API — ANALISTA (Pedir solicitudes, evaluar)
// ============================================================

/**
 * Retorna las solicitudes asignadas al analista logueado + info de cupo.
 * @returns {{solicitudes:Array, cupo:number, activas:number}}
 * @sheets_read 1
 * @sheets_write 0
 */
function api_obtenerMisSolicitudesAnalista() {
  try {
    var usuario = verificarRol(['ANALISTA', 'DIRECTOR', 'GERENTE', 'ADMIN', 'LIDER']);
    var resultado = obtenerSolicitudesAnalista(usuario.email, usuario.cupo || 10);
    return resultado;
  } catch (e) {
    _registrarEvento_('ERROR', 'Api.js', 'api_obtenerMisSolicitudesAnalista', e.message);
    return { solicitudes: [], cupo: 0, activas: 0 };
  }
}

/**
 * Analista pide UNA solicitud de la cola (la más antigua disponible).
 * @returns {{ok:boolean, mensaje:string, solicitud?:Object}}
 * @sheets_read 1-2
 * @sheets_write 1
 */
function api_pedirSolicitudAnalista() {
  try {
    var usuario = verificarRol(['ANALISTA', 'DIRECTOR', 'GERENTE', 'ADMIN', 'LIDER']);
    return pedirSolicitudAnalista(usuario.email, usuario.cupo || 10);
  } catch (e) {
    _registrarEvento_('ERROR', 'Api.js', 'api_pedirSolicitudAnalista', e.message);
    return { ok: false, mensaje: 'Error: ' + e.message };
  }
}

/**
 * Retorna datos completos de una solicitud para el formulario de evaluación.
 * @param {number} filaNum - Fila en registro analisis
 * @returns {Object}
 * @sheets_read 1
 * @sheets_write 0
 */
function api_obtenerSolicitudParaEvaluar(filaNum) {
  try {
    verificarRol(['ANALISTA', 'DIRECTOR', 'GERENTE', 'ADMIN', 'LIDER']);
    return obtenerDetalleSolicitud(filaNum);
  } catch (e) {
    _registrarEvento_('ERROR', 'Api.js', 'api_obtenerSolicitudParaEvaluar', e.message);
    return null;
  }
}

/**
 * Guarda la evaluación del analista en registro analisis.
 * @param {number} filaNum - Fila en registro analisis
 * @param {Object} datos - {ingresos, acierta, ocupacion, respuestaModelo, reglaDura, ...por COA, comentarios}
 * @param {boolean} finalizar - Si true, marca REGISTRO ANALISTA SAI + Fecha Evaluacion
 * @returns {{ok:boolean, mensaje:string}}
 * @sheets_read 1
 * @sheets_write 1-6
 */
function api_guardarEvaluacion(filaNum, datos, finalizar) {
  try {
    var usuario = verificarRol(['ANALISTA', 'DIRECTOR', 'GERENTE', 'ADMIN', 'LIDER']);
    return guardarEvaluacionAnalista(filaNum, datos, finalizar, usuario.email);
  } catch (e) {
    _registrarEvento_('ERROR', 'Api.js', 'api_guardarEvaluacion', e.message);
    return { ok: false, mensaje: 'Error: ' + e.message };
  }
}

// (fin de las funciones del analista)

// ============================================================
//  API — COMERCIAL (Errores en terceros — ver y responder)
// ============================================================

/**
 * Retorna los errores pendientes de respuesta del comercial logueado.
 * Usa vista jerárquica: ADMIN/ASESOR ven todos, otros filtran por equipo visible.
 * @returns {Array}
 * @sheets_read 1
 * @sheets_write 0
 */
function api_obtenerMisErroresPendientes() {
  try {
    var usuario = verificarRol(['COMERCIAL', 'CONSULTOR', 'AUXILIAR', 'ANALISTA', 'DIRECTOR', 'GERENTE', 'ASESOR', 'ADMIN']);
    var emailsEquipo = getEmailsEquipoVisible(usuario.email);
    // null → sin filtro (ADMIN/ASESOR); array → filtrar por equipo visible
    return obtenerErroresPendientesComercial(emailsEquipo);
  } catch (e) {
    _registrarEvento_('ERROR', 'Api.js', 'api_obtenerMisErroresPendientes', e.message);
    return [];
  }
}

/**
 * Comercial envía la corrección de un error en terceros.
 * @param {string} uuid - UUID de la solicitud
 * @param {Array} respuestas - [{participante, respuesta}]
 * @returns {{ok:boolean, mensaje:string}}
 * @sheets_read 1-2
 * @sheets_write 1-2
 */
function api_enviarCorreccion(uuid, respuestas) {
  try {
    var usuario = verificarRol(['COMERCIAL', 'CONSULTOR', 'AUXILIAR', 'ANALISTA', 'DIRECTOR', 'GERENTE', 'ASESOR', 'ADMIN']);
    return guardarCorreccionComercial(uuid, respuestas, usuario.email);
  } catch (e) {
    _registrarEvento_('ERROR', 'Api.js', 'api_enviarCorreccion', e.message);
    return { ok: false, mensaje: 'Error: ' + e.message };
  }
}

// ============================================================
//  API — ASIGNACIONES (Líder reasigna/libera)
// ============================================================

/**
 * Retorna todas las solicitudes asignadas a analistas (en evaluación).
 * @returns {Array}
 * @sheets_read 1
 * @sheets_write 0
 */
function api_obtenerAsignaciones() {
  try {
    verificarRol(['DIRECTOR', 'GERENTE', 'ADMIN', 'LIDER']);
    return obtenerAsignacionesActivas();
  } catch (e) {
    _registrarEvento_('ERROR', 'Api.js', 'api_obtenerAsignaciones', e.message);
    return [];
  }
}

/**
 * Reasigna una solicitud a otro analista o la libera.
 * @param {number} filaNum - Fila en registro analisis
 * @param {string} nuevoEmail - Email del nuevo analista (vacío = liberar)
 * @returns {{ok:boolean, mensaje:string}}
 * @sheets_read 1
 * @sheets_write 1
 */
function api_reasignarSolicitud(filaNum, nuevoEmail) {
  try {
    verificarRol(['DIRECTOR', 'GERENTE', 'ADMIN', 'LIDER']);
    return reasignarSolicitud(filaNum, nuevoEmail);
  } catch (e) {
    _registrarEvento_('ERROR', 'Api.js', 'api_reasignarSolicitud', e.message);
    return { ok: false, mensaje: 'Error: ' + e.message };
  }
}

// ============================================================
//  API — REPORTES
// ============================================================

/**
 * Envía el reporte de gestión por correo (el mismo que envía el trigger diario).
 * @returns {{ok:boolean, mensaje:string}}
 * @sheets_read 3-4
 * @sheets_write 0
 */
function api_enviarReporteGestion() {
  try {
    verificarRol(['DIRECTOR', 'GERENTE', 'ADMIN', 'LIDER']);
    enviarReporteGestionInducciones();
    return { ok: true, mensaje: 'Reporte enviado.' };
  } catch (e) {
    _registrarEvento_('ERROR', 'Api.js', 'api_enviarReporteGestion', e.message);
    return { ok: false, mensaje: 'Error: ' + e.message };
  }
}

/**
 * Envía el reporte de cierre de mes a cada comercial activo (el mismo que
 * envía el trigger mensual del día 1). Puede tardar varios segundos si hay
 * muchos comerciales activos — se ejecuta 1 por 1.
 * @returns {{ok:boolean, mensaje:string}}
 * @sheets_read 2-3
 * @sheets_write 0
 */
function api_enviarReportesCierreMes() {
  try {
    verificarRol(['DIRECTOR', 'GERENTE', 'ADMIN', 'LIDER']);
    enviarReportesCierreMes();
    return { ok: true, mensaje: 'Reportes de cierre de mes enviados.' };
  } catch (e) {
    _registrarEvento_('ERROR', 'Api.js', 'api_enviarReportesCierreMes', e.message);
    return { ok: false, mensaje: 'Error: ' + e.message };
  }
}

// ============================================================
//  API — CONFIGURACIÓN (Catálogo de motivos)
// ============================================================

/**
 * Retorna el catálogo de motivos de error en terceros.
 * @returns {Array}
 * @sheets_read 0-1
 * @sheets_write 0
 */
function api_obtenerCatalogoMotivos() {
  try {
    verificarRol(['DIRECTOR', 'GERENTE', 'ADMIN', 'LIDER']);
    return _leerCatalogoMotivos();
  } catch (e) {
    return [];
  }
}

/**
 * Guarda (crea o actualiza) un motivo en el catálogo.
 * @param {Object} motivo - {id, label, instruccion, activo}
 * @param {boolean} esNuevo
 * @returns {{ok:boolean, mensaje:string}}
 * @sheets_read 1
 * @sheets_write 1
 */
function api_guardarMotivo(motivo, esNuevo) {
  try {
    verificarRol(['DIRECTOR', 'GERENTE', 'ADMIN', 'LIDER']);
    return _guardarMotivo(motivo, esNuevo);
  } catch (e) {
    return { ok: false, mensaje: 'Error: ' + e.message };
  }
}

/**
 * Elimina un motivo del catálogo.
 * @param {string} id
 * @returns {{ok:boolean, mensaje:string}}
 * @sheets_read 1
 * @sheets_write 1
 */
function api_eliminarMotivo(id) {
  try {
    verificarRol(['DIRECTOR', 'GERENTE', 'ADMIN', 'LIDER']);
    return _eliminarMotivo(id);
  } catch (e) {
    return { ok: false, mensaje: 'Error: ' + e.message };
  }
}

// ── Funciones internas del catálogo ──

function _leerCatalogoMotivos() {
  // Intentar leer desde CacheService primero (TTL 600s)
  var cached = CacheWrapper_getJSON('CATALOGO_MOTIVOS');
  if (cached) return cached;

  // Cache-miss o error en CacheService → leer directamente de Sheets
  var resultado = _leerCatalogoMotivosDesdeHoja();

  // Almacenar en caché para próximas lecturas (TTL 600s = 10 min)
  try {
    CacheWrapper_putJSON('CATALOGO_MOTIVOS', resultado, 600);
  } catch (e) {
    // Si falla el put, continuar sin cachear (degradación elegante)
    console.warn('_leerCatalogoMotivos: no se pudo cachear catálogo: ' + e.message);
  }

  return resultado;
}

/**
 * Lee el catálogo de motivos directamente de la hoja CATALOGO_MOTIVOS.
 * Crea la pestaña con datos por defecto si no existe.
 * @returns {Array} Lista de motivos [{id, label, instruccion, activo}]
 */
function _leerCatalogoMotivosDesdeHoja() {
  var ss = SpreadsheetApp.openById(getHojaControlId());
  var hoja = ss.getSheetByName('CATALOGO_MOTIVOS');
  if (!hoja) {
    // Crear la pestaña si no existe con datos por defecto
    hoja = ss.insertSheet('CATALOGO_MOTIVOS');
    hoja.appendRow(['ID', 'LABEL', 'INSTRUCCION', 'ACTIVO']);
    hoja.getRange(1, 1, 1, 4).setFontWeight('bold').setBackground('#253150').setFontColor('#ffffff');
    hoja.setFrozenRows(1);
    var defaults = [
      ['celular_correo', 'Confirmar celular o correo', 'El comercial debe confirmar el número de celular o correo electrónico correcto del participante indicado.', true],
      ['doc_identidad', 'Adjuntar documento de identidad', 'El comercial debe adjuntar copia legible del documento de identidad (cédula o pasaporte) del participante indicado.', true],
      ['cert_existencia', 'Adjuntar cert. existencia y representación legal', 'El comercial debe adjuntar el certificado de existencia y representación legal vigente (no mayor a 30 días) de la empresa.', true],
      ['confirmar_destino', 'Confirmar destino específico del inmueble', 'El comercial debe indicar con precisión el uso o actividad económica que se desarrollará en el inmueble.', true],
      ['confirmar_direccion', 'Confirmar la dirección', 'El comercial debe confirmar la dirección completa y correcta del inmueble tal como está registrada en SAI.', true]
    ];
    hoja.getRange(2, 1, defaults.length, 4).setValues(defaults);
  }

  var datos = hoja.getDataRange().getValues();
  var resultado = [];
  for (var i = 1; i < datos.length; i++) {
    resultado.push({
      id: String(datos[i][0] || ''),
      label: String(datos[i][1] || ''),
      instruccion: String(datos[i][2] || ''),
      activo: datos[i][3] !== false
    });
  }
  return resultado;
}

function _guardarMotivo(motivo, esNuevo) {
  var ss = SpreadsheetApp.openById(getHojaControlId());
  var hoja = ss.getSheetByName('CATALOGO_MOTIVOS');
  if (!hoja) return { ok: false, mensaje: 'Pestaña no encontrada.' };

  if (!motivo.id || !motivo.label) return { ok: false, mensaje: 'ID y nombre son obligatorios.' };

  var datos = hoja.getDataRange().getValues();
  var filaExistente = -1;
  for (var i = 1; i < datos.length; i++) {
    if (String(datos[i][0]).trim() === motivo.id.trim()) { filaExistente = i + 1; break; }
  }

  var fila = [motivo.id.trim(), motivo.label.trim(), (motivo.instruccion || '').trim(), motivo.activo !== false];

  if (esNuevo && filaExistente !== -1) return { ok: false, mensaje: 'Ya existe un motivo con ese ID.' };

  if (filaExistente !== -1) {
    hoja.getRange(filaExistente, 1, 1, 4).setValues([fila]);
  } else {
    hoja.appendRow(fila);
  }

  // Invalidar caché del catálogo para que la próxima lectura obtenga datos frescos
  CacheWrapper_remove('CATALOGO_MOTIVOS');

  return { ok: true, mensaje: esNuevo ? 'Motivo creado.' : 'Motivo actualizado.' };
}

function _eliminarMotivo(id) {
  var ss = SpreadsheetApp.openById(getHojaControlId());
  var hoja = ss.getSheetByName('CATALOGO_MOTIVOS');
  if (!hoja) return { ok: false, mensaje: 'Pestaña no encontrada.' };

  var datos = hoja.getDataRange().getValues();
  for (var i = 1; i < datos.length; i++) {
    if (String(datos[i][0]).trim() === id.trim()) {
      hoja.deleteRow(i + 1);
      // Invalidar caché del catálogo para que la próxima lectura obtenga datos frescos
      CacheWrapper_remove('CATALOGO_MOTIVOS');
      return { ok: true, mensaje: 'Motivo eliminado.' };
    }
  }
  return { ok: false, mensaje: 'Motivo no encontrado.' };
}

// ============================================================
//  API — MÉTRICAS OPERATIVAS DE LOTES
// ============================================================

/**
 * API: Obtiene métricas operativas de lotes para un rango de fechas.
 * Estrategia cache-first: intenta leer de CacheWrapper antes de acceder a Sheets.
 * NO adquiere LockService para permitir ejecución en paralelo con api_obtenerMetricasLotesHistorico.
 *
 * Clave de cache: METRICAS_LOTES_{fechaDesde}_{fechaHasta}
 * TTL: 120 segundos (solo si payload < 512 KB)
 *
 * @param {string} fechaDesde - Fecha inicio en formato YYYY-MM-DD
 * @param {string} fechaHasta - Fecha fin en formato YYYY-MM-DD (rango máximo 183 días)
 * @returns {{resumen: Object, detallePorLote: Array}}
 * @sheets_read 0 en cache-hit, 1-2 en cache-miss
 * @sheets_write 0
 */
function api_obtenerMetricasLotes(fechaDesde, fechaHasta) {
  try {
    verificarRol(['DIRECTOR', 'GERENTE', 'ADMIN', 'LIDER']);

    // ── 1. Validar parámetros de entrada ──
    if (typeof fechaDesde !== 'string' || typeof fechaHasta !== 'string' ||
        !fechaDesde || !fechaHasta) {
      return _metricasLotesVacias();
    }

    var regexFecha = /^\d{4}-\d{2}-\d{2}$/;
    if (!regexFecha.test(fechaDesde) || !regexFecha.test(fechaHasta)) {
      return _metricasLotesVacias();
    }

    var desde = new Date(fechaDesde + 'T00:00:00');
    var hasta = new Date(fechaHasta + 'T00:00:00');
    if (isNaN(desde.getTime()) || isNaN(hasta.getTime())) {
      return _metricasLotesVacias();
    }

    if (desde.getTime() > hasta.getTime()) {
      return _metricasLotesVacias();
    }

    var diffDias = Math.ceil((hasta.getTime() - desde.getTime()) / (1000 * 60 * 60 * 24));
    if (diffDias > 183) {
      return _metricasLotesVacias();
    }

    // ── 2. Cache-first: intentar leer de CacheWrapper ──
    var cacheKey = 'METRICAS_LOTES_' + fechaDesde + '_' + fechaHasta;
    try {
      var cached = CacheWrapper_getJSON(cacheKey);
      if (cached) {
        return cached; // Cache-hit: 0 lecturas a Sheets
      }
    } catch (e) {
      // CacheService no disponible — degradación elegante, continuar sin cache
    }

    // ── 3. Cache-miss: calcular desde Sheets ──
    var resultado = calcularMetricasLotes(fechaDesde, fechaHasta);

    // ── 4. Almacenar en cache si payload < 512 KB ──
    try {
      var payloadStr = JSON.stringify(resultado);
      if (payloadStr.length <= 512000) {
        CacheWrapper_putJSON(cacheKey, resultado, 120);
      }
    } catch (e) {
      // CacheService no disponible al escribir — degradación elegante, no interrumpir
    }

    return resultado;
  } catch (e) {
    _registrarEvento_('ERROR', 'Api.js', 'api_obtenerMetricasLotes', e.message);
    return _metricasLotesVacias();
  }
}

/**
 * API: Obtiene el desglose de estados operativos para el pipeline.
 * Filtra Control_General por rango de fechas (col C) y excluye TERMINADO.
 *
 * @param {string} fechaDesde - YYYY-MM-DD
 * @param {string} fechaHasta - YYYY-MM-DD
 * @returns {{desglose: Object, detalle: Array}}
 * @sheets_read 1
 * @sheets_write 0
 */
function api_obtenerDetalleEnProceso(fechaDesde, fechaHasta) {
  try {
    verificarRol(['DIRECTOR', 'GERENTE', 'ADMIN', 'LIDER']);

    if (!fechaDesde || !fechaHasta) {
      return { desglose: {}, detalle: [] };
    }

    return _obtenerEstadosOperativosEnProceso(fechaDesde, fechaHasta);
  } catch (e) {
    _registrarEvento_('ERROR', 'Api.js', 'api_obtenerDetalleEnProceso', e.message);
    return { desglose: {}, detalle: [] };
  }
}

/**
 * API: Obtiene métricas históricas de lotes/solicitudes para los últimos N meses.
 * Usado para la gráfica de tendencia. Se llama bajo demanda (en paralelo con métricas).
 *
 * Lee registro_analisis una sola vez y filtra por cada mes en memoria.
 * No adquiere LockService ni comparte dependencias de escritura, permitiendo
 * ejecución en paralelo con api_obtenerMetricasLotes sin serialización.
 *
 * Para rangos > 90 días (cantidadMeses > 3), usa getRange() limitado a las
 * columnas necesarias (máximo 17) en vez de leer todas las 100+ columnas.
 *
 * @param {number} cantidadMeses - Cantidad de meses hacia atrás (1-12, default 6)
 * @returns {Array<{mes:number, anio:number, etiqueta:string, lotesAprobados:number, lotesNegados:number, solicitudesAprobadas:number, solicitudesNegadas:number}>}
 * @sheets_read 0 en cache-hit, 1 en cache-miss
 * @sheets_write 0
 */
function api_obtenerMetricasLotesHistorico(cantidadMeses) {
  try {
    verificarRol(['DIRECTOR', 'GERENTE', 'ADMIN', 'LIDER']);
    return calcularMetricasLotesHistorico(cantidadMeses || 6);
  } catch (e) {
    _registrarEvento_('ERROR', 'Api.js', 'api_obtenerMetricasLotesHistorico', e.message);
    return [];
  }
}

// ── Funciones internas de Api.js ──

/**
 * Genera una clave de cache estable para el equipo visible del usuario.
 * - null → 'GLOBAL' (acceso total, ADMIN/ASESOR)
 * - string[] → hash simple basado en los emails ordenados
 * @param {string[]|null} emailsEquipo - Array de emails o null
 * @returns {string} Clave corta para uso en cacheKey
 */
function _hashEquipoVisible(emailsEquipo) {
  if (emailsEquipo === null) return 'GLOBAL';
  if (!Array.isArray(emailsEquipo) || emailsEquipo.length === 0) return 'EMPTY';
  // Para un solo email, usar el email directamente (más legible en cache)
  if (emailsEquipo.length === 1) return emailsEquipo[0];
  // Para múltiples emails, generar un hash simple y estable
  var sorted = emailsEquipo.slice().sort();
  var hash = 0;
  var str = sorted.join(',');
  for (var i = 0; i < str.length; i++) {
    var ch = str.charCodeAt(i);
    hash = ((hash << 5) - hash) + ch;
    hash = hash & hash; // Convert to 32bit integer
  }
  return 'EQ_' + (hash >>> 0).toString(36);
}
