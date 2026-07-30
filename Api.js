/**
 * ============================================================
 * Api.js — Funciones expuestas a google.script.run
 *
 * Capa delgada: verifica sesión → llama servicio → retorna.
 * Cada función maneja errores y retorna objetos limpios.
 * ============================================================
 */

/**
 * Retorna datos del usuario logueado (rol, nombre, permisos).
 * Es la primera llamada que hace el frontend al cargar.
 * @returns {{autorizado:boolean, email:string, nombre?:string, rol?:string, cupo?:number}}
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
 * LIDER/ADMIN → métricas globales (todos los comerciales).
 * COMERCIAL → solo sus propias métricas.
 * @returns {{radicados:number, enAnalisis:number, pendientePS:number, errorTerceros:number, terminados:number}}
 */
function api_obtenerResumenDashboard() {
  try {
    var usuario = verificarRol(['COMERCIAL', 'AUXILIAR', 'ANALISTA', 'LIDER', 'ADMIN']);
    var verTodos = (usuario.rol === 'LIDER' || usuario.rol === 'ADMIN');
    var cacheKey = 'RESUMEN_' + (verTodos ? 'GLOBAL' : usuario.email);

    // Intentar cache primero (TTL 60s)
    var cache = CacheService.getScriptCache();
    var cached = cache.get(cacheKey);
    if (cached) return JSON.parse(cached);

    // Cache miss → leer de Sheets
    var resumen = obtenerResumenComercial(verTodos ? null : usuario.email);
    cache.put(cacheKey, JSON.stringify(resumen), 60);
    return resumen;
  } catch (e) {
    _registrarEvento_('ERROR', 'Api.js', 'api_obtenerResumenDashboard', e.message);
    return _resumenVacio();
  }
}

/**
 * Retorna los lotes del usuario logueado (paginado).
 * Si es LIDER/ADMIN → muestra TODOS los lotes.
 * Si es COMERCIAL → solo los suyos.
 * @param {number} pagina
 * @param {number} porPagina
 * @returns {{datos:Array, total:number, pagina:number, totalPaginas:number}}
 */
function api_obtenerMisLotes(pagina, porPagina, filtroEstado, busquedaId) {
  try {
    var usuario = verificarRol(['COMERCIAL', 'AUXILIAR', 'ANALISTA', 'LIDER', 'ADMIN']);
    var verTodos = (usuario.rol === 'LIDER' || usuario.rol === 'ADMIN');
    return obtenerLotesDeComercial(verTodos ? null : usuario.email, pagina, porPagina, filtroEstado, busquedaId);
  } catch (e) {
    _registrarEvento_('ERROR', 'Api.js', 'api_obtenerMisLotes', e.message);
    return { datos: [], total: 0, pagina: 1, totalPaginas: 0 };
  }
}

/**
 * Retorna el detalle de un lote: datos del lote + lista de solicitudes.
 * @param {string} idLote - ID del lote a consultar
 * @returns {{lote:Object, solicitudes:Array}}
 */
function api_obtenerDetalleLote(idLote) {
  try {
    verificarRol(['COMERCIAL', 'AUXILIAR', 'ANALISTA', 'LIDER', 'ADMIN']);
    return obtenerDetalleLote(idLote);
  } catch (e) {
    _registrarEvento_('ERROR', 'Api.js', 'api_obtenerDetalleLote', e.message);
    return { lote: null, solicitudes: [] };
  }
}

/**
 * Retorna TODOS los lotes (sin paginación servidor) para cache en frontend.
 * El frontend pagina y filtra localmente (instantáneo).
 * @returns {Array} Lista de lotes con estados
 */
function api_obtenerTodosLosLotes() {
  try {
    var usuario = verificarRol(['COMERCIAL', 'AUXILIAR', 'ANALISTA', 'LIDER', 'ADMIN']);
    var verTodos = (usuario.rol === 'LIDER' || usuario.rol === 'ADMIN');
    var cacheKey = 'LOTES_' + (verTodos ? 'GLOBAL' : usuario.email);

    var cache = CacheService.getScriptCache();
    var cached = cache.get(cacheKey);
    if (cached) return JSON.parse(cached);

    var resultado = obtenerLotesDeComercial(verTodos ? null : usuario.email, 1, 9999, '', '');
    var datos = resultado.datos || [];

    // Cache solo si el payload no excede 100KB
    var json = JSON.stringify(datos);
    if (json.length < 90000) {
      cache.put(cacheKey, json, 60);
    }
    return datos;
  } catch (e) {
    _registrarEvento_('ERROR', 'Api.js', 'api_obtenerTodosLosLotes', e.message);
    return [];
  }
}

/**
 * Retorna la lista de todos los usuarios registrados.
 * Solo accesible por LIDER y ADMIN.
 * @returns {Array} Lista de usuarios
 */
function api_obtenerUsuarios() {
  try {
    verificarRol(['LIDER', 'ADMIN']);
    return _leerPestanaUsuarios();
  } catch (e) {
    _registrarEvento_('ERROR', 'Api.js', 'api_obtenerUsuarios', e.message);
    return [];
  }
}

/**
 * Crea o actualiza un usuario en la pestaña USUARIOS.
 * Solo accesible por LIDER y ADMIN.
 * @param {Object} datos - {email, nombre, rol, cupo, director, backup, backupActivo, activo}
 * @param {boolean} esNuevo - true = crear, false = actualizar
 * @returns {{ok:boolean, mensaje:string}}
 */
function api_guardarUsuario(datos, esNuevo) {
  try {
    verificarRol(['LIDER', 'ADMIN']);

    if (!datos || !datos.email || !datos.nombre || !datos.rol) {
      return { ok: false, mensaje: 'Email, nombre y rol son obligatorios.' };
    }

    var email = datos.email.toLowerCase().trim();
    var hoja = SpreadsheetApp.openById(getHojaControlId()).getSheetByName('USUARIOS');
    if (!hoja) return { ok: false, mensaje: 'Pestaña USUARIOS no encontrada.' };

    var todosLosDatos = hoja.getDataRange().getValues();

    // Buscar si ya existe
    var filaExistente = -1;
    for (var i = 1; i < todosLosDatos.length; i++) {
      if (String(todosLosDatos[i][0]).toLowerCase().trim() === email) {
        filaExistente = i + 1; // fila en Sheets (1-based)
        break;
      }
    }

    var filaValores = [
      email,
      datos.nombre.trim(),
      datos.rol.toUpperCase().trim(),
      Number(datos.cupo) || 0,
      (datos.director || '').trim(),
      (datos.backup || '').trim(),
      datos.backupActivo === true,
      datos.activo !== false
    ];

    if (esNuevo && filaExistente !== -1) {
      return { ok: false, mensaje: 'Ya existe un usuario con ese email.' };
    }

    if (filaExistente !== -1) {
      // Actualizar
      hoja.getRange(filaExistente, 1, 1, filaValores.length).setValues([filaValores]);
    } else {
      // Crear
      hoja.appendRow(filaValores);
    }

    // Invalidar cache
    invalidarCacheUsuario(email);

    return { ok: true, mensaje: esNuevo ? 'Usuario creado.' : 'Usuario actualizado.' };
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
 */
function api_obtenerSolicitudes(desde, cantidad) {
  try {
    verificarRol(['LIDER', 'ADMIN']);
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
 */
function api_obtenerDetalleSolicitud(filaNum) {
  try {
    verificarRol(['LIDER', 'ADMIN', 'ANALISTA', 'AUXILIAR']);
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
 * @returns {Array}
 */
function api_obtenerColaAuxiliar() {
  try {
    verificarRol(['AUXILIAR', 'LIDER', 'ADMIN']);
    return obtenerColaAuxiliar();
  } catch (e) {
    _registrarEvento_('ERROR', 'Api.js', 'api_obtenerColaAuxiliar', e.message);
    return [];
  }
}

/**
 * Retorna datos completos de una solicitud para el modal del auxiliar.
 * @param {number} filaNum - Fila en Control_General
 * @returns {Object}
 */
function api_obtenerSolicitudAuxiliar(filaNum) {
  try {
    verificarRol(['AUXILIAR', 'LIDER', 'ADMIN']);
    return obtenerSolicitudCompletaAuxiliar(filaNum);
  } catch (e) {
    _registrarEvento_('ERROR', 'Api.js', 'api_obtenerSolicitudAuxiliar', e.message);
    return null;
  }
}

/**
 * Retorna las solicitudes asignadas al auxiliar logueado.
 * @returns {Array}
 */
function api_obtenerMisSolicitudesAuxiliar() {
  try {
    var usuario = verificarRol(['AUXILIAR', 'LIDER', 'ADMIN']);
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
 */
function api_tomarSolicitudAuxiliar(idLote, uuid) {
  try {
    var usuario = verificarRol(['AUXILIAR', 'LIDER', 'ADMIN']);
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
 */
function api_marcarRadicado(uuid, numeros) {
  try {
    verificarRol(['AUXILIAR', 'LIDER', 'ADMIN']);
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
 * @returns {{ok:boolean, mensaje:string}}
 */
function api_marcarErrorTerceros(uuid, participantes, nota) {
  try {
    var usuario = verificarRol(['AUXILIAR', 'LIDER', 'ADMIN']);
    return marcarErrorEnTerceros(uuid, participantes, nota, usuario.email);
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
 */
function api_obtenerMisSolicitudesAnalista() {
  try {
    var usuario = verificarRol(['ANALISTA', 'LIDER', 'ADMIN']);
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
 */
function api_pedirSolicitudAnalista() {
  try {
    var usuario = verificarRol(['ANALISTA', 'LIDER', 'ADMIN']);
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
 */
function api_obtenerSolicitudParaEvaluar(filaNum) {
  try {
    verificarRol(['ANALISTA', 'LIDER', 'ADMIN']);
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
 */
function api_guardarEvaluacion(filaNum, datos, finalizar) {
  try {
    var usuario = verificarRol(['ANALISTA', 'LIDER', 'ADMIN']);
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
 * @returns {Array}
 */
function api_obtenerMisErroresPendientes() {
  try {
    var usuario = verificarRol(['COMERCIAL', 'LIDER', 'ADMIN']);
    var verTodos = (usuario.rol === 'LIDER' || usuario.rol === 'ADMIN');
    return obtenerErroresPendientesComercial(verTodos ? null : usuario.email);
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
 */
function api_enviarCorreccion(uuid, respuestas) {
  try {
    var usuario = verificarRol(['COMERCIAL', 'LIDER', 'ADMIN']);
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
 */
function api_obtenerAsignaciones() {
  try {
    verificarRol(['LIDER', 'ADMIN']);
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
 */
function api_reasignarSolicitud(filaNum, nuevoEmail) {
  try {
    verificarRol(['LIDER', 'ADMIN']);
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
 */
function api_enviarReporteGestion() {
  try {
    verificarRol(['LIDER', 'ADMIN']);
    enviarReporteGestionInducciones();
    return { ok: true, mensaje: 'Reporte enviado.' };
  } catch (e) {
    _registrarEvento_('ERROR', 'Api.js', 'api_enviarReporteGestion', e.message);
    return { ok: false, mensaje: 'Error: ' + e.message };
  }
}

// ============================================================
//  API — CONFIGURACIÓN (Catálogo de motivos)
// ============================================================

/**
 * Retorna el catálogo de motivos de error en terceros.
 * @returns {Array}
 */
function api_obtenerCatalogoMotivos() {
  try {
    verificarRol(['LIDER', 'ADMIN']);
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
 */
function api_guardarMotivo(motivo, esNuevo) {
  try {
    verificarRol(['LIDER', 'ADMIN']);
    return _guardarMotivo(motivo, esNuevo);
  } catch (e) {
    return { ok: false, mensaje: 'Error: ' + e.message };
  }
}

/**
 * Elimina un motivo del catálogo.
 * @param {string} id
 * @returns {{ok:boolean, mensaje:string}}
 */
function api_eliminarMotivo(id) {
  try {
    verificarRol(['LIDER', 'ADMIN']);
    return _eliminarMotivo(id);
  } catch (e) {
    return { ok: false, mensaje: 'Error: ' + e.message };
  }
}

// ── Funciones internas del catálogo ──

function _leerCatalogoMotivos() {
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
      return { ok: true, mensaje: 'Motivo eliminado.' };
    }
  }
  return { ok: false, mensaje: 'Motivo no encontrado.' };
}
