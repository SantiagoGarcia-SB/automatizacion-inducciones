/**
 * Registra en Historial_Estados los cambios manuales, de una celda a la vez,
 * realizados sobre la columna Estado de Control_General.
 *
 * Este handler debe ejecutarse mediante un trigger instalable de edición.
 * @param {GoogleAppsScript.Events.SheetsOnEdit} e Evento de edición de Sheets.
 * @returns {void}
 */
function registrarCambioEstadoManual(e) {
  if (!e || !e.range || !e.source) return;

  var rangoEditado = e.range;
  var hojaControl = rangoEditado.getSheet();
  if (hojaControl.getName() !== 'Control_General' || rangoEditado.getRow() < 2) return;
  if (rangoEditado.getNumRows() !== 1 || rangoEditado.getNumColumns() !== 1) return;

  var encabezados = hojaControl.getRange(1, 1, 1, hojaControl.getLastColumn()).getDisplayValues()[0];
  var columnas = HistorialEstados_obtenerColumnas_(encabezados);
  if (columnas.estado === 0 || rangoEditado.getColumn() !== columnas.estado) return;

  var estadoAnterior = HistorialEstados_normalizarValor_(e.oldValue);
  var estadoNuevo = Object.prototype.hasOwnProperty.call(e, 'value')
    ? HistorialEstados_normalizarValor_(e.value)
    : HistorialEstados_normalizarValor_(rangoEditado.getDisplayValue());

  if (estadoAnterior === estadoNuevo || (!estadoAnterior && !estadoNuevo)) return;

  var bloqueo = LockService.getScriptLock();
  if (!bloqueo.tryLock(10000)) {
    console.warn('No se pudo adquirir el bloqueo para registrar el cambio de estado.');
    return;
  }

  try {
    var uuid = columnas.uuid ? HistorialEstados_normalizarValor_(hojaControl.getRange(rangoEditado.getRow(), columnas.uuid).getDisplayValue()) : '';
    var idLote = columnas.idLote ? HistorialEstados_normalizarValor_(hojaControl.getRange(rangoEditado.getRow(), columnas.idLote).getDisplayValue()) : '';
    var hojaHistorial = HistorialEstados_obtenerHoja_(e.source);

    hojaHistorial.appendRow([
      new Date(),
      uuid,
      idLote,
      estadoAnterior,
      estadoNuevo,
      HistorialEstados_obtenerUsuarioEditor_(),
      'EDICION_MANUAL_CONTROL_GENERAL'
    ]);
  } catch (error) {
    console.error('No se pudo registrar el cambio manual de estado: ' + error.message);
  } finally {
    bloqueo.releaseLock();
  }
}

/**
 * Crea de forma idempotente el trigger instalable que audita cambios manuales de Estado.
 * Debe ejecutarse una sola vez desde el editor de Apps Script por un administrador autorizado.
 * @returns {{ok:boolean,mensaje:string}} Resultado de la configuración.
 */
function configurarTriggerHistorialEstados() {
  var handler = 'registrarCambioEstadoManual';
  var triggers = ScriptApp.getProjectTriggers();

  for (var i = 0; i < triggers.length; i++) {
    if (triggers[i].getHandlerFunction() === handler) {
      ScriptApp.deleteTrigger(triggers[i]);
    }
  }

  ScriptApp.newTrigger(handler)
    .forSpreadsheet(getHojaControlId())
    .onEdit()
    .create();

  return { ok: true, mensaje: 'Trigger de historial de estados configurado.' };
}

/**
 * Resuelve las columnas necesarias de Control_General a partir de sus encabezados.
 * @param {string[]} encabezados Encabezados de la primera fila de la hoja.
 * @returns {{estado:number,uuid:number,idLote:number}} Índices de columna base 1.
 */
function HistorialEstados_obtenerColumnas_(encabezados) {
  var columnas = { estado: 0, uuid: 0, idLote: 0 };

  for (var i = 0; i < encabezados.length; i++) {
    var encabezado = HistorialEstados_normalizarEncabezado_(encabezados[i]);
    if (encabezado === 'ESTADO') columnas.estado = i + 1;
    if (encabezado === 'UUID_SISTEMA') columnas.uuid = i + 1;
    if (encabezado === 'ID LOTE') columnas.idLote = i + 1;
  }

  return columnas;
}

/**
 * Obtiene o crea la hoja de auditoría con sus encabezados.
 * @param {GoogleAppsScript.Spreadsheet.Spreadsheet} libro Libro de control editado.
 * @returns {GoogleAppsScript.Spreadsheet.Sheet} Hoja Historial_Estados.
 */
function HistorialEstados_obtenerHoja_(libro) {
  var hoja = libro.getSheetByName('Historial_Estados');
  if (hoja) return hoja;

  hoja = libro.insertSheet('Historial_Estados');
  hoja.appendRow([
    'FECHA_CAMBIO',
    'UUID_SISTEMA',
    'ID_LOTE',
    'ESTADO_ANTERIOR',
    'ESTADO_NUEVO',
    'USUARIO_EDITOR',
    'ORIGEN'
  ]);
  hoja.getRange(1, 1, 1, 7)
    .setFontWeight('bold')
    .setBackground('#253150')
    .setFontColor('white');
  hoja.setFrozenRows(1);

  return hoja;
}

/**
 * Obtiene el correo del editor cuando Google Workspace lo expone al trigger.
 * @returns {string} Correo del editor o indicador de no disponibilidad.
 */
function HistorialEstados_obtenerUsuarioEditor_() {
  var email = Session.getActiveUser().getEmail();
  return email ? String(email).trim().toLowerCase() : 'NO DISPONIBLE';
}

/**
 * Normaliza valores de celdas antes de compararlos o persistirlos.
 * @param {*} valor Valor de evento o de celda.
 * @returns {string} Texto sin espacios externos.
 */
function HistorialEstados_normalizarValor_(valor) {
  return String(valor === undefined || valor === null ? '' : valor).trim();
}

/**
 * Normaliza encabezados para compararlos sin sensibilidad a mayúsculas.
 * @param {*} encabezado Encabezado de una columna.
 * @returns {string} Encabezado normalizado.
 */
function HistorialEstados_normalizarEncabezado_(encabezado) {
  return HistorialEstados_normalizarValor_(encabezado).toUpperCase();
}
