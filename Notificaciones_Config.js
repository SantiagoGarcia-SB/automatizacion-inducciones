/**
 * ============================================================
 * NOTIFICACIONES_CONFIG.JS — Gobierno administrativo de notificaciones
 *
 * Centraliza la configuración allowlisted de notificaciones, persiste sus
 * políticas en el libro de control y reconcilia únicamente los triggers
 * administrados por este módulo.
 * ============================================================
 */

var NOTIFICACIONES_CONFIG_HOJA = 'CONFIG_NOTIFICACIONES';
var NOTIFICACIONES_CONFIG_CACHE = 'CONFIG_NOTIFICACIONES_V1';
var NOTIFICACIONES_CONFIG_TTL = 300;
var NOTIFICACIONES_ZONA_HORARIA = 'America/Bogota';

var NOTIFICACIONES_POLITICAS = [
  {
    id: 'recordatorios_diarios',
    nombre: 'Recordatorios de pendientes',
    descripcion: 'Recordatorios de paz y salvo y errores en terceros.',
    tipo: 'PROGRAMADA_DIARIA',
    activa: true,
    agendas: [{ hora: 8, minuto: 0, cadaDias: 1 }],
    handlers: ['ejecutarRecordatoriosDiarios', 'enviarRecordatoriosPazYSalvoDiario', 'enviarRecordatoriosErrorTercerosDiario']
  },
  {
    id: 'reporte_gestion',
    nombre: 'Reporte de gestión',
    descripcion: 'Resumen de inducciones para administradores.',
    tipo: 'PROGRAMADA_SEMANAL',
    activa: true,
    agendas: [
      { diasSemana: ['MONDAY', 'TUESDAY', 'WEDNESDAY', 'THURSDAY', 'FRIDAY'], hora: 17, minuto: 0 },
      { diasSemana: ['SATURDAY'], hora: 12, minuto: 30 }
    ],
    handlers: ['enviarReporteGestionInducciones']
  },
  {
    id: 'reporte_cierre_mensual',
    nombre: 'Reporte de cierre mensual',
    descripcion: 'Resumen individual y consolidado de cierre mensual.',
    tipo: 'PROGRAMADA_MENSUAL',
    activa: true,
    agendas: [{ diaMes: 1, hora: 7, minuto: 0 }],
    handlers: ['enviarReportesCierreMes']
  },
  {
    id: 'salud_sistema',
    nombre: 'Alertas de salud del sistema',
    descripcion: 'Verificación y alertas operativas de la plataforma.',
    tipo: 'PROGRAMADA_DIARIA',
    activa: true,
    agendas: [{ hora: 7, minuto: 0, cadaDias: 1 }],
    handlers: ['verificarSaludDelSistema']
  },
  {
    id: 'cumplimiento_ley_2300',
    nombre: 'Cumplimiento Ley 2300',
    descripcion: 'Procesamiento periódico de solicitudes aprobadas.',
    tipo: 'PROGRAMADA_INTERVALO',
    activa: true,
    agendas: [{ hora: 6, minuto: 0, cadaDias: 15 }],
    handlers: ['procesarDatosMejorado']
  },
  { id: 'ingreso_exitoso', nombre: 'Confirmación de ingreso', descripcion: 'Aviso al comercial después de radicar un lote.', tipo: 'EVENTO', activa: true, agendas: [], handlers: [] },
  { id: 'paz_y_salvo', nombre: 'Solicitud de paz y salvo', descripcion: 'Aviso al cambiar un lote a pendiente de paz y salvo.', tipo: 'EVENTO', activa: true, agendas: [], handlers: [] },
  { id: 'cambio_estado', nombre: 'Cambio de estado del lote', descripcion: 'Aviso al comercial al iniciar o terminar el análisis.', tipo: 'EVENTO', activa: true, agendas: [], handlers: [] },
  { id: 'error_terceros', nombre: 'Error en terceros', descripcion: 'Solicitud de corrección al comercial.', tipo: 'EVENTO', activa: true, agendas: [], handlers: [] },
  { id: 'correccion_recibida', nombre: 'Corrección recibida', descripcion: 'Aviso al auxiliar cuando el comercial responde.', tipo: 'EVENTO', activa: true, agendas: [], handlers: [] },
  { id: 'resultados_lote', nombre: 'Resultados de inducción', descripcion: 'Envío de resultados y documentos al comercial.', tipo: 'EVENTO_MANUAL', activa: true, agendas: [], handlers: [] }
];

/**
 * Retorna las políticas visibles para la interfaz, inicializando la hoja si es necesario.
 * @returns {Array<Object>} Políticas de notificación normalizadas.
 */
function NotificationConfig_listar() {
  var cache = CacheService.getScriptCache();
  try {
    var valorCache = cache.get(NOTIFICACIONES_CONFIG_CACHE);
    if (valorCache) return JSON.parse(valorCache);
  } catch (e) {
    console.warn('NotificationConfig_listar: caché no disponible. ' + e.message);
  }

  var configuraciones = NotificationConfig_leerDesdeHoja_();
  try {
    cache.put(NOTIFICACIONES_CONFIG_CACHE, JSON.stringify(configuraciones), NOTIFICACIONES_CONFIG_TTL);
  } catch (e) {
    console.warn('NotificationConfig_listar: no se pudo actualizar caché. ' + e.message);
  }
  return configuraciones;
}

/**
 * Determina si una notificación está habilitada. Ante una falla de lectura,
 * mantiene habilitado el flujo para no perder una comunicación operativa.
 * @param {string} id Identificador allowlisted de la política.
 * @returns {boolean} true si puede enviarse o ejecutarse.
 */
function NotificationConfig_estaActiva(id) {
  try {
    var politica = NotificationConfig_buscar_(NotificationConfig_listar(), id);
    return politica ? politica.activa === true : true;
  } catch (e) {
    _registrarEvento_('ERROR', 'Notificaciones_Config.js', 'No se pudo consultar política de notificación', 'Política: ' + id);
    return true;
  }
}

/**
 * Registra una supresión por configuración sin incluir destinatarios ni contenido.
 * @param {string} id Identificador allowlisted de la política.
 */
function NotificationConfig_registrarSupresion(id) {
  _registrarEvento_('INFO', 'Notificaciones_Config.js', 'Notificación suprimida por configuración', 'Política: ' + id);
}

/**
 * Guarda una política validada y reconcilia los triggers administrados.
 * @param {Object} entrada Datos recibidos desde la interfaz.
 * @param {string} actor Email del administrador que realizó el cambio.
 * @returns {{ok:boolean,mensaje:string,configuracion?:Object}} Resultado del guardado.
 */
function NotificationConfig_guardar(entrada, actor) {
  var validada = NotificationConfig_validarEntrada_(entrada);
  if (!validada.ok) return validada;

  var lock = LockService.getScriptLock();
  if (!lock.tryLock(30000)) {
    return { ok: false, mensaje: 'Hay otro cambio de configuración en curso. Intenta nuevamente.' };
  }

  try {
    var configuraciones = NotificationConfig_leerDesdeHoja_();
    var indice = NotificationConfig_indice_(configuraciones, validada.configuracion.id);
    if (indice === -1) return { ok: false, mensaje: 'La notificación no está disponible.' };

    configuraciones[indice] = validada.configuracion;
    NotificationConfig_escribir_(configuraciones, actor);
    NotificationConfig_reconciliarSinBloqueo_(configuraciones);
    NotificationConfig_invalidarCache_();

    _registrarEvento_('INFO', 'Notificaciones_Config.js', 'Configuración de notificación actualizada', 'Política: ' + validada.configuracion.id);
    return { ok: true, mensaje: 'Configuración guardada y agendas actualizadas.', configuracion: validada.configuracion };
  } catch (e) {
    _registrarEvento_('ERROR', 'Notificaciones_Config.js', 'No se pudo guardar configuración de notificación', 'Política: ' + String(entrada && entrada.id || 'desconocida'));
    return { ok: false, mensaje: 'No se pudo guardar la configuración. Intenta nuevamente.' };
  } finally {
    lock.releaseLock();
  }
}

/**
 * Reemplaza de forma idempotente los triggers de las políticas programadas.
 * Se conserva para ejecución manual durante la migración.
 * @returns {{ok:boolean,mensaje:string}} Resultado de la reconciliación.
 */
function reconciliarConfiguracionNotificaciones() {
  var lock = LockService.getScriptLock();
  if (!lock.tryLock(30000)) {
    return { ok: false, mensaje: 'Hay otra reconciliación en curso. Intenta nuevamente.' };
  }

  try {
    NotificationConfig_reconciliarSinBloqueo_(NotificationConfig_listar());
    return { ok: true, mensaje: 'Agendas de notificaciones reconciliadas.' };
  } catch (e) {
    _registrarEvento_('ERROR', 'Notificaciones_Config.js', 'No se pudieron reconciliar agendas', 'Error interno al crear triggers.');
    return { ok: false, mensaje: 'No se pudieron actualizar las agendas.' };
  } finally {
    lock.releaseLock();
  }
}

/**
 * Retorna handlers que deben existir según las políticas programadas activas.
 * @returns {Array<string>} Handlers esperados por la verificación de salud.
 */
function NotificationConfig_handlersProgramadosActivos() {
  var configuraciones = NotificationConfig_listar();
  var handlers = [];
  for (var i = 0; i < configuraciones.length; i++) {
    var politica = configuraciones[i];
    if (!NotificationConfig_esProgramada_(politica) || !politica.activa) continue;
    for (var j = 0; j < politica.handlers.length; j++) {
      if (politica.handlers[j].indexOf('enviarRecordatorios') === 0) continue;
      handlers.push(politica.handlers[j]);
    }
  }
  return handlers;
}

/**
 * Lee las políticas de la hoja y completa las faltantes con valores por defecto.
 * @returns {Array<Object>} Políticas normalizadas.
 */
function NotificationConfig_leerDesdeHoja_() {
  var hoja = NotificationConfig_obtenerHoja_();
  var filas = hoja.getDataRange().getValues();
  var porId = {};

  for (var i = 1; i < filas.length; i++) {
    var id = String(filas[i][0] || '').trim();
    if (!id) continue;
    porId[id] = filas[i];
  }

  var resultado = [];
  var faltantes = [];
  for (var j = 0; j < NOTIFICACIONES_POLITICAS.length; j++) {
    var base = NOTIFICACIONES_POLITICAS[j];
    var fila = porId[base.id];
    if (!fila) {
      resultado.push(NotificationConfig_clonarPolitica_(base));
      faltantes.push(NotificationConfig_fila_(base, '', ''));
      continue;
    }
    resultado.push(NotificationConfig_desdeFila_(fila, base));
  }

  if (faltantes.length > 0) {
    hoja.getRange(hoja.getLastRow() + 1, 1, faltantes.length, 7).setValues(faltantes);
  }
  return resultado;
}

/**
 * Crea la pestaña de configuración cuando aún no existe.
 * @returns {GoogleAppsScript.Spreadsheet.Sheet} Hoja de configuración.
 */
function NotificationConfig_obtenerHoja_() {
  var ss = SpreadsheetRegistry_get(getHojaControlId());
  var hoja = ss.getSheetByName(NOTIFICACIONES_CONFIG_HOJA);
  if (hoja) return hoja;

  hoja = ss.insertSheet(NOTIFICACIONES_CONFIG_HOJA);
  hoja.appendRow(['ID', 'NOMBRE', 'TIPO', 'ACTIVA', 'AGENDA_JSON', 'ACTUALIZADO_EN', 'ACTUALIZADO_POR']);
  hoja.getRange(1, 1, 1, 7).setFontWeight('bold').setBackground('#253150').setFontColor('#ffffff');
  hoja.setFrozenRows(1);
  hoja.setColumnWidths(1, 7, 160);
  return hoja;
}

/**
 * Convierte la fila de la hoja a una política y usa defaults ante datos corruptos.
 * @param {Array} fila Fila de la hoja.
 * @param {Object} base Definición allowlisted de la política.
 * @returns {Object} Política normalizada.
 */
function NotificationConfig_desdeFila_(fila, base) {
  var politica = NotificationConfig_clonarPolitica_(base);
  politica.activa = fila[3] !== false && String(fila[3]).toUpperCase() !== 'FALSE';
  try {
    var agendas = JSON.parse(String(fila[4] || '[]'));
    var validacion = NotificationConfig_validarAgendas_(base.tipo, agendas);
    if (validacion.ok) politica.agendas = validacion.agendas;
  } catch (e) {
    _registrarEvento_('WARN', 'Notificaciones_Config.js', 'Agenda inválida, se aplicó valor por defecto', 'Política: ' + base.id);
  }
  return politica;
}

/**
 * Persiste el conjunto completo de políticas normalizadas.
 * @param {Array<Object>} configuraciones Políticas a persistir.
 * @param {string} actor Email del administrador.
 */
function NotificationConfig_escribir_(configuraciones, actor) {
  var hoja = NotificationConfig_obtenerHoja_();
  var filas = [];
  for (var i = 0; i < configuraciones.length; i++) {
    filas.push(NotificationConfig_fila_(configuraciones[i], new Date(), actor));
  }
  if (hoja.getLastRow() > 1) hoja.getRange(2, 1, hoja.getLastRow() - 1, 7).clearContent();
  hoja.getRange(2, 1, filas.length, 7).setValues(filas);
}

/**
 * Crea una fila persistible sin exponer información técnica al frontend.
 * @param {Object} politica Política normalizada.
 * @param {Date|string} actualizadoEn Fecha de actualización.
 * @param {string} actualizadoPor Actor del cambio.
 * @returns {Array} Fila para la hoja.
 */
function NotificationConfig_fila_(politica, actualizadoEn, actualizadoPor) {
  return [
    politica.id,
    politica.nombre,
    politica.tipo,
    politica.activa === true,
    JSON.stringify(politica.agendas || []),
    actualizadoEn || '',
    actualizadoPor || ''
  ];
}

/**
 * Reemplaza exclusivamente los triggers bajo administración de esta funcionalidad.
 * @param {Array<Object>} configuraciones Políticas ya normalizadas.
 */
function NotificationConfig_reconciliarSinBloqueo_(configuraciones) {
  var handlersAdministrados = NotificationConfig_handlersAdministrados_();
  var triggers = ScriptApp.getProjectTriggers();
  for (var i = 0; i < triggers.length; i++) {
    if (handlersAdministrados.indexOf(triggers[i].getHandlerFunction()) !== -1) {
      ScriptApp.deleteTrigger(triggers[i]);
    }
  }

  NotificationConfig_asegurarTriggerPazYSalvo_();
  for (var j = 0; j < configuraciones.length; j++) {
    var politica = configuraciones[j];
    if (!politica.activa || !NotificationConfig_esProgramada_(politica)) continue;
    NotificationConfig_crearTriggersPolitica_(politica);
  }
}

/**
 * Crea el trigger instalable de edición para Paz y Salvo si no existe.
 */
function NotificationConfig_asegurarTriggerPazYSalvo_() {
  var triggers = ScriptApp.getProjectTriggers();
  for (var i = 0; i < triggers.length; i++) {
    if (triggers[i].getHandlerFunction() === 'enviarCorreoPazYSalvo') return;
  }
  ScriptApp.newTrigger('enviarCorreoPazYSalvo').forSpreadsheet(getHojaControlId()).onEdit().create();
}

/**
 * Construye los triggers asociados a una política programada validada.
 * @param {Object} politica Política programada.
 */
function NotificationConfig_crearTriggersPolitica_(politica) {
  var handler = politica.handlers[0];
  for (var i = 0; i < politica.agendas.length; i++) {
    var agenda = politica.agendas[i];
    if (politica.tipo === 'PROGRAMADA_SEMANAL') {
      for (var j = 0; j < agenda.diasSemana.length; j++) {
        ScriptApp.newTrigger(handler).timeBased().inTimezone(NOTIFICACIONES_ZONA_HORARIA)
          .onWeekDay(ScriptApp.WeekDay[agenda.diasSemana[j]])
          .atHour(agenda.hora).nearMinute(agenda.minuto).create();
      }
      continue;
    }
    if (politica.tipo === 'PROGRAMADA_MENSUAL') {
      ScriptApp.newTrigger(handler).timeBased().inTimezone(NOTIFICACIONES_ZONA_HORARIA)
        .onMonthDay(agenda.diaMes).atHour(agenda.hora).nearMinute(agenda.minuto).create();
      continue;
    }
    ScriptApp.newTrigger(handler).timeBased().inTimezone(NOTIFICACIONES_ZONA_HORARIA)
      .everyDays(agenda.cadaDias).atHour(agenda.hora).nearMinute(agenda.minuto).create();
  }
}

/**
 * Valida estrictamente el payload editable recibido desde la interfaz.
 * @param {Object} entrada Payload recibido.
 * @returns {{ok:boolean,mensaje?:string,configuracion?:Object}} Resultado de validación.
 */
function NotificationConfig_validarEntrada_(entrada) {
  if (!entrada || typeof entrada !== 'object' || Array.isArray(entrada)) {
    return { ok: false, mensaje: 'Configuración inválida.' };
  }
  var claves = Object.keys(entrada).sort();
  var permitidas = ['activa', 'agendas', 'id'];
  if (claves.length !== permitidas.length || claves.some(function(clave, indice) { return clave !== permitidas[indice]; })) {
    return { ok: false, mensaje: 'La configuración contiene campos no permitidos.' };
  }
  if (typeof entrada.id !== 'string' || typeof entrada.activa !== 'boolean' || !Array.isArray(entrada.agendas)) {
    return { ok: false, mensaje: 'La configuración tiene un formato inválido.' };
  }

  var base = NotificationConfig_buscar_(NOTIFICACIONES_POLITICAS, entrada.id);
  if (!base) return { ok: false, mensaje: 'La notificación no está permitida.' };
  var validacion = NotificationConfig_validarAgendas_(base.tipo, entrada.agendas);
  if (!validacion.ok) return validacion;

  var politica = NotificationConfig_clonarPolitica_(base);
  politica.activa = entrada.activa;
  politica.agendas = validacion.agendas;
  return { ok: true, configuracion: politica };
}

/**
 * Valida las agendas según el tipo allowlisted de cada notificación.
 * @param {string} tipo Tipo de política.
 * @param {Array} agendas Agendas a validar.
 * @returns {{ok:boolean,mensaje?:string,agendas?:Array}} Resultado de validación.
 */
function NotificationConfig_validarAgendas_(tipo, agendas) {
  if (tipo === 'EVENTO' || tipo === 'EVENTO_MANUAL') {
    return agendas.length === 0 ? { ok: true, agendas: [] } : { ok: false, mensaje: 'Las notificaciones por evento no admiten agendas.' };
  }
  var esSemanal = tipo === 'PROGRAMADA_SEMANAL';
  if (!Array.isArray(agendas) || agendas.length === 0 || agendas.length > 7 || (!esSemanal && agendas.length !== 1)) {
    return { ok: false, mensaje: 'Debes configurar una agenda válida para esta notificación.' };
  }

  var resultado = [];
  var horariosSemanales = {};
  for (var i = 0; i < agendas.length; i++) {
    var validacion = NotificationConfig_validarAgenda_(tipo, agendas[i]);
    if (!validacion.ok) return validacion;
    if (esSemanal) {
      for (var j = 0; j < validacion.agenda.diasSemana.length; j++) {
        var llave = validacion.agenda.diasSemana[j] + '_' + validacion.agenda.hora + '_' + validacion.agenda.minuto;
        if (horariosSemanales[llave]) return { ok: false, mensaje: 'No puedes repetir un día y hora en la agenda.' };
        horariosSemanales[llave] = true;
      }
    }
    resultado.push(validacion.agenda);
  }
  return { ok: true, agendas: resultado };
}

/**
 * Normaliza una agenda individual y rechaza claves o valores fuera de rango.
 * @param {string} tipo Tipo de política.
 * @param {Object} agenda Agenda recibida.
 * @returns {{ok:boolean,mensaje?:string,agenda?:Object}} Resultado de validación.
 */
function NotificationConfig_validarAgenda_(tipo, agenda) {
  if (!agenda || typeof agenda !== 'object' || Array.isArray(agenda)) return { ok: false, mensaje: 'La agenda tiene un formato inválido.' };
  var clavesEsperadas = tipo === 'PROGRAMADA_SEMANAL'
    ? ['diasSemana', 'hora', 'minuto']
    : tipo === 'PROGRAMADA_MENSUAL'
      ? ['diaMes', 'hora', 'minuto']
      : ['cadaDias', 'hora', 'minuto'];
  var clavesRecibidas = Object.keys(agenda).sort();
  if (clavesRecibidas.length !== clavesEsperadas.length || clavesRecibidas.some(function(clave, indice) { return clave !== clavesEsperadas[indice]; })) {
    return { ok: false, mensaje: 'La agenda contiene campos no permitidos.' };
  }

  var base = { hora: agenda.hora, minuto: agenda.minuto };
  if (!NotificationConfig_esEnteroEnRango_(base.hora, 0, 23) || !NotificationConfig_esEnteroEnRango_(base.minuto, 0, 59)) {
    return { ok: false, mensaje: 'La hora o el minuto no son válidos.' };
  }

  if (tipo === 'PROGRAMADA_SEMANAL') {
    var dias = agenda.diasSemana;
    var permitidos = ['FRIDAY', 'MONDAY', 'SATURDAY', 'SUNDAY', 'THURSDAY', 'TUESDAY', 'WEDNESDAY'];
    if (!Array.isArray(dias) || dias.length === 0 || dias.length > 7 || dias.some(function(dia) { return permitidos.indexOf(dia) === -1; }) || dias.some(function(dia, indice) { return dias.indexOf(dia) !== indice; })) {
      return { ok: false, mensaje: 'Los días de la semana no son válidos.' };
    }
    return { ok: true, agenda: { diasSemana: dias.slice().sort(), hora: base.hora, minuto: base.minuto } };
  }
  if (tipo === 'PROGRAMADA_MENSUAL') {
    if (!NotificationConfig_esEnteroEnRango_(agenda.diaMes, 1, 28)) return { ok: false, mensaje: 'El día de mes debe estar entre 1 y 28.' };
    return { ok: true, agenda: { diaMes: agenda.diaMes, hora: base.hora, minuto: base.minuto } };
  }
  if (!NotificationConfig_esEnteroEnRango_(agenda.cadaDias, 1, 31)) return { ok: false, mensaje: 'La frecuencia debe estar entre 1 y 31 días.' };
  return { ok: true, agenda: { hora: base.hora, minuto: base.minuto, cadaDias: agenda.cadaDias } };
}

/**
 * @param {*} valor Valor a validar.
 * @param {number} minimo Límite inferior.
 * @param {number} maximo Límite superior.
 * @returns {boolean} true si es entero dentro del rango.
 */
function NotificationConfig_esEnteroEnRango_(valor, minimo, maximo) {
  return typeof valor === 'number' && isFinite(valor) && Math.floor(valor) === valor && valor >= minimo && valor <= maximo;
}

/**
 * @returns {Array<string>} Todos los handlers que el reconciliador puede eliminar.
 */
function NotificationConfig_handlersAdministrados_() {
  var handlers = [];
  for (var i = 0; i < NOTIFICACIONES_POLITICAS.length; i++) {
    handlers = handlers.concat(NOTIFICACIONES_POLITICAS[i].handlers || []);
  }
  return handlers;
}

/**
 * @param {Object} politica Política a evaluar.
 * @returns {boolean} true para políticas con trigger temporal.
 */
function NotificationConfig_esProgramada_(politica) {
  return politica.tipo.indexOf('PROGRAMADA_') === 0;
}

/**
 * @param {Array<Object>} lista Lista de políticas.
 * @param {string} id Identificador de política.
 * @returns {Object|null} Política encontrada.
 */
function NotificationConfig_buscar_(lista, id) {
  var indice = NotificationConfig_indice_(lista, id);
  return indice === -1 ? null : lista[indice];
}

/**
 * @param {Array<Object>} lista Lista de políticas.
 * @param {string} id Identificador de política.
 * @returns {number} Índice o -1.
 */
function NotificationConfig_indice_(lista, id) {
  for (var i = 0; i < lista.length; i++) {
    if (lista[i].id === id) return i;
  }
  return -1;
}

/**
 * @param {Object} politica Política base.
 * @returns {Object} Copia segura para exponer o modificar.
 */
function NotificationConfig_clonarPolitica_(politica) {
  return {
    id: politica.id,
    nombre: politica.nombre,
    descripcion: politica.descripcion,
    tipo: politica.tipo,
    activa: politica.activa === true,
    agendas: JSON.parse(JSON.stringify(politica.agendas || [])),
    handlers: (politica.handlers || []).slice()
  };
}

/**
 * Elimina la caché después de una actualización persistida.
 */
function NotificationConfig_invalidarCache_() {
  try {
    CacheService.getScriptCache().remove(NOTIFICACIONES_CONFIG_CACHE);
  } catch (e) {
    console.warn('NotificationConfig_invalidarCache: no se pudo invalidar caché. ' + e.message);
  }
}
