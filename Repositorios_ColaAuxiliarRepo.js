/**
 * ============================================================
 * ColaAuxiliarRepo — Acceso a datos para el flujo del Auxiliar
 *
 * Lee solicitudes con estado PENDIENTE RADICAR / PENDIENTE ASIGNAR
 * de Control_General. Escribe cambios de estado al tomar/marcar.
 * ============================================================
 */

/**
 * Obtiene solicitudes disponibles para el auxiliar (estado PENDIENTE RADICAR).
 * OPTIMIZADO: Lee solo las columnas del listado. Los datos completos se leen
 * al abrir una solicitud específica (modal).
 * @returns {Array}
 */
function obtenerColaAuxiliar() {
  var hoja = SpreadsheetApp.openById(getHojaControlId()).getSheetByName('Control_General');
  if (!hoja || hoja.getLastRow() < 2) return [];

  var ultimaFila = hoja.getLastRow();
  var filasData = ultimaFila - 1;

  // Leer SOLO las columnas necesarias para el listado (6 columnas individuales)
  // A(1)=ID Lote, J(10)=Estado, X(24)=Arrendatario, Y(25)=TD, Z(26)=ID, BJ(62)=UUID
  var colEstado = hoja.getRange(2, 10, filasData, 1).getValues();
  var colIdLote = hoja.getRange(2, 1, filasData, 1).getValues();
  var colArrendatario = hoja.getRange(2, 24, filasData, 1).getValues();
  var colTipoDoc = hoja.getRange(2, 25, filasData, 1).getValues();
  var colIdentificacion = hoja.getRange(2, 26, filasData, 1).getValues();
  var colUUID = hoja.getRange(2, 62, filasData, 1).getValues();
  var colDestino = hoja.getRange(2, 18, filasData, 1).getValues();
  var colCiudad = hoja.getRange(2, 19, filasData, 1).getValues();
  var colCanon = hoja.getRange(2, 21, filasData, 1).getValues();

  var resultado = [];
  for (var i = filasData - 1; i >= 0; i--) {
    var estado = String(colEstado[i][0] || '').trim().toUpperCase();
    if (estado !== 'PENDIENTE RADICAR') continue;

    resultado.push({
      fila: i + 2,
      uuid: String(colUUID[i][0] || ''),
      idLote: String(colIdLote[i][0] || ''),
      arrendatario: String(colArrendatario[i][0] || ''),
      tipoDoc: String(colTipoDoc[i][0] || ''),
      identificacion: String(colIdentificacion[i][0] || ''),
      destino: String(colDestino[i][0] || ''),
      ciudad: String(colCiudad[i][0] || ''),
      canon: String(colCanon[i][0] || '')
    });

    if (resultado.length >= 100) break;
  }

  return resultado;
}

/**
 * Lee TODOS los datos de una solicitud específica para el modal del auxiliar.
 * Se llama solo cuando el auxiliar hace clic en "Abrir".
 * @param {number} filaNum - Número de fila en Control_General
 * @returns {Object} Datos completos de la solicitud
 */
function obtenerSolicitudCompletaAuxiliar(filaNum) {
  var hoja = SpreadsheetApp.openById(getHojaControlId()).getSheetByName('Control_General');
  if (!hoja) return null;

  var datos = hoja.getRange(filaNum, 1, 1, 62).getValues()[0];

  var sol = {
    uuid: String(datos[61] || ''),
    idLote: String(datos[0] || ''),
    fecha: datos[2] instanceof Date ? Utilities.formatDate(datos[2], 'GMT-5', 'd/MM/yyyy HH:mm') : '',
    comercial: String(datos[10] || ''),
    tasaNegociacion: String(datos[11] || ''),
    fechaInicio: datos[13] instanceof Date ? Utilities.formatDate(datos[13], 'GMT-5', 'd/MM/yyyy') : String(datos[13] || ''),
    amparo: String(datos[14] || ''),
    tipoNegociacion: String(datos[15] || ''),
    poliza: String(datos[16] || ''),
    destino: String(datos[17] || ''),
    ciudad: String(datos[18] || ''),
    direccion: String(datos[19] || ''),
    canon: String(datos[20] || ''),
    administracion: String(datos[21] || ''),
    iva: String(datos[22] || ''),
    arrendatario: String(datos[23] || ''),
    tipoDoc: String(datos[24] || ''),
    identificacion: String(datos[25] || ''),
    celular: String(datos[26] || ''),
    correo: String(datos[27] || ''),
    solicitudInquilino: String(datos[28] || ''),
    codeudores: []
  };

  var coaOffsets = [
    { inicio: 29, label: 'COA1' },
    { inicio: 35, label: 'COA2' },
    { inicio: 41, label: 'COA3' },
    { inicio: 47, label: 'COA4' },
    { inicio: 53, label: 'COA5' }
  ];
  for (var c = 0; c < coaOffsets.length; c++) {
    var off = coaOffsets[c].inicio;
    var nombreCoa = String(datos[off] || '').trim();
    if (!nombreCoa) continue;
    sol.codeudores.push({
      label: coaOffsets[c].label,
      nombre: nombreCoa,
      tipoDoc: String(datos[off + 1] || ''),
      identificacion: String(datos[off + 2] || ''),
      celular: String(datos[off + 3] || ''),
      correo: String(datos[off + 4] || ''),
      nro: String(datos[off + 5] || '')
    });
  }

  return sol;
}

/**
 * Obtiene solicitudes asignadas a un auxiliar específico.
 * Son las que están "EN PROCESO" por ese auxiliar (las tomó pero no ha marcado resultado).
 * Busca solicitudes con estado que NO es PENDIENTE RADICAR, RADICADO ni TERMINADO
 * y que fueron asignadas recientemente (usamos una marca temporal).
 * 
 * NOTA: Para esta V1, usamos la pestaña COLA_ANALISIS para trackear
 * las asignaciones del auxiliar. Si no hay datos ahí todavía,
 * retornamos vacío.
 * @param {string} emailAuxiliar
 * @returns {Array}
 */
function obtenerSolicitudesAuxiliar(emailAuxiliar) {
  // V1: Por ahora retornar vacío — el flujo real se conectará con COLA_ANALISIS
  // cuando se active la escritura
  return [];
}

/**
 * Auxiliar toma una solicitud: cambia estado a "EN PROCESO RADICACIÓN".
 * Usa LockService para evitar que dos auxiliares tomen la misma.
 * @param {string} idLote
 * @param {string} uuid
 * @param {string} emailAuxiliar
 * @returns {{ok:boolean, mensaje:string}}
 */
function tomarSolicitudAuxiliar(idLote, uuid, emailAuxiliar) {
  var lock = LockService.getScriptLock();
  if (!lock.tryLock(10000)) {
    return { ok: false, mensaje: 'Otro usuario está tomando una solicitud. Intenta de nuevo.' };
  }

  try {
    var hoja = SpreadsheetApp.openById(getHojaControlId()).getSheetByName('Control_General');

    // Buscar la fila por UUID
    var finder = hoja.createTextFinder(uuid).matchEntireCell(true);
    var celda = finder.findNext();
    if (!celda) return { ok: false, mensaje: 'Solicitud no encontrada.' };

    var fila = celda.getRow();

    // Verificar que sigue en PENDIENTE RADICAR
    var estadoActual = String(hoja.getRange(fila, 10).getValue()).trim().toUpperCase();
    if (estadoActual !== 'PENDIENTE RADICAR') {
      return { ok: false, mensaje: 'Esta solicitud ya fue tomada por alguien más.' };
    }

    // Cambiar estado (por ahora no cambiamos estado, solo la mostramos al auxiliar)
    // El auxiliar la verá en "Mis solicitudes" y la marcará RADICADO o ERROR
    // Para V1: no escribimos nada, solo retornamos OK
    return { ok: true, mensaje: 'Solicitud tomada.' };
  } finally {
    lock.releaseLock();
  }
}

/**
 * Marca una solicitud como RADICADO y guarda los números de SAI.
 * @param {string} uuid
 * @param {Object} numeros - {solicitudInquilino, nroCoa1, nroCoa2, nroCoa3, nroCoa4, nroCoa5}
 * @returns {{ok:boolean, mensaje:string}}
 */
function marcarSolicitudRadicada(uuid, numeros) {
  var hoja = SpreadsheetApp.openById(getHojaControlId()).getSheetByName('Control_General');

  var finder = hoja.createTextFinder(uuid).matchEntireCell(true);
  var celda = finder.findNext();
  if (!celda) return { ok: false, mensaje: 'Solicitud no encontrada.' };

  var fila = celda.getRow();

  // Cambiar estado a RADICADO (columna J = 10)
  hoja.getRange(fila, 10).setValue('RADICADO');

  // Guardar número de solicitud del inquilino (columna 29 = Solicitud Inquilino)
  if (numeros && numeros.solicitudInquilino) {
    hoja.getRange(fila, 29).setValue(numeros.solicitudInquilino);
  }

  // Guardar NRO de codeudores (posiciones: COA1=34, COA2=40, COA3=46, COA4=52, COA5=58)
  // Cada bloque COA tiene 6 campos: nombre, TD, ID, cel, correo, NRO
  // NRO está en la posición 6 del bloque (offset +5 desde inicio)
  var nroColumnas = { nroCoa1: 35, nroCoa2: 41, nroCoa3: 47, nroCoa4: 53, nroCoa5: 59 };
  if (numeros) {
    for (var key in nroColumnas) {
      if (numeros[key]) {
        hoja.getRange(fila, nroColumnas[key]).setValue(numeros[key]);
      }
    }
  }

  // Guardar siniestros (columna 63)
  if (numeros && numeros.siniestros) {
    hoja.getRange(fila, 63).setValue(numeros.siniestros);
  }

  return { ok: true, mensaje: 'Solicitud marcada como RADICADO.' };
}

/**
 * Marca ERROR EN TERCEROS en Control_General y registra detalle en Errores_Terceros.
 * @param {string} uuid
 * @param {Array} participantes - [{participante, requerimientos}]
 * @param {string} nota - Nota interna
 * @param {string} emailAuxiliar
 * @returns {{ok:boolean, mensaje:string}}
 */
function marcarErrorEnTerceros(uuid, participantes, nota, emailAuxiliar) {
  var ss = SpreadsheetApp.openById(getHojaControlId());

  // 1. Cambiar estado en Control_General
  var hojaControl = ss.getSheetByName('Control_General');
  var finder = hojaControl.createTextFinder(uuid).matchEntireCell(true);
  var celda = finder.findNext();
  if (!celda) return { ok: false, mensaje: 'Solicitud no encontrada.' };

  var fila = celda.getRow();
  hojaControl.getRange(fila, 10).setValue('ERROR EN TERCEROS');

  // 2. Registrar en pestaña Errores_Terceros
  var hojaErrores = ss.getSheetByName('Errores_Terceros');
  if (!hojaErrores) return { ok: false, mensaje: 'Pestaña Errores_Terceros no encontrada.' };

  // Determinar ciclo (cuántos errores previos tiene este UUID)
  var datosErrores = hojaErrores.getDataRange().getValues();
  var cicloMax = 0;
  for (var i = 1; i < datosErrores.length; i++) {
    if (String(datosErrores[i][0]).trim() === uuid) {
      var ciclo = Number(datosErrores[i][1]) || 0;
      if (ciclo > cicloMax) cicloMax = ciclo;
    }
  }
  var nuevoCiclo = cicloMax + 1;

  // Insertar una fila por cada participante con error
  var filasNuevas = [];
  var fechaAhora = new Date();

  for (var p = 0; p < participantes.length; p++) {
    filasNuevas.push([
      uuid,                              // UUID_SISTEMA
      nuevoCiclo,                        // CICLO
      participantes[p].participante,     // PARTICIPANTE (INQ, COA1, etc.)
      participantes[p].requerimientos,   // REQUERIMIENTOS (separados por |)
      nota || '',                        // NOTA_INTERNA
      emailAuxiliar,                     // AUXILIAR_EMAIL
      fechaAhora,                        // FECHA_ERROR
      '',                                // RESPUESTA_COMERCIAL
      '',                                // ARCHIVOS_DRIVE_PATH
      '',                                // FECHA_RESPUESTA
      'PENDIENTE'                        // ESTADO_ERROR
    ]);
  }

  if (filasNuevas.length > 0) {
    var ultimaFila = hojaErrores.getLastRow();
    hojaErrores.getRange(ultimaFila + 1, 1, filasNuevas.length, 11).setValues(filasNuevas);
  }

  // Notificar al comercial por correo
  try {
    _notificarErrorAlComercial(uuid, participantes);
  } catch (errMail) {
    console.warn('Notificación de error no enviada: ' + errMail.message);
  }

  return { ok: true, mensaje: 'Error registrado. Se notificó al comercial.' };
}

// ============================================================
//  ERRORES — Lado comercial (ver y responder)
// ============================================================

/**
 * Obtiene errores pendientes de respuesta para un comercial.
 * Busca en Errores_Terceros por UUID de solicitudes del comercial
 * que tengan ESTADO_ERROR = 'PENDIENTE'.
 * @param {string} emailComercial
 * @returns {Array}
 */
function obtenerErroresPendientesComercial(emailComercial) {
  var ss = SpreadsheetApp.openById(getHojaControlId());
  var hojaErrores = ss.getSheetByName('Errores_Terceros');
  if (!hojaErrores || hojaErrores.getLastRow() < 2) return [];

  // Leer todos los errores pendientes
  var datos = hojaErrores.getDataRange().getValues();
  var erroresPendientes = {};

  for (var i = 1; i < datos.length; i++) {
    if (String(datos[i][10] || '').trim() !== 'PENDIENTE') continue;
    var uuid = String(datos[i][0] || '').trim();
    if (!erroresPendientes[uuid]) {
      erroresPendientes[uuid] = { uuid: uuid, participantes: [], fechaError: '' };
    }
    erroresPendientes[uuid].participantes.push({
      participante: String(datos[i][2] || ''),
      requerimientos: String(datos[i][3] || ''),
      fila: i + 1
    });
    erroresPendientes[uuid].fechaError = datos[i][6] instanceof Date
      ? Utilities.formatDate(datos[i][6], 'GMT-5', 'd/MM/yyyy') : '';
  }

  // Cruzar con Control_General para saber cuáles son del comercial
  var hojaControl = ss.getSheetByName('Control_General');
  var nombre = _nombreComercialParaBusqueda(emailComercial);
  var resultado = [];

  for (var uuid in erroresPendientes) {
    var finder = hojaControl.createTextFinder(uuid).matchEntireCell(true);
    var celda = finder.findNext();
    if (!celda) continue;
    var fila = celda.getRow();
    var comercial = String(hojaControl.getRange(fila, 11).getValue() || '').toUpperCase().trim();
    // Si es LIDER/ADMIN ve todos, si es COMERCIAL solo los suyos
    if (nombre && comercial !== nombre) continue;

    var arrendatario = String(hojaControl.getRange(fila, 24).getValue() || '');
    var idLote = String(hojaControl.getRange(fila, 1).getValue() || '');

    var err = erroresPendientes[uuid];
    err.arrendatario = arrendatario;
    err.idLote = idLote;
    resultado.push(err);
  }

  return resultado;
}

/**
 * Guarda la respuesta del comercial a un error.
 * @param {string} uuid
 * @param {Array} respuestas - [{participante, respuesta}]
 * @param {string} emailComercial
 * @returns {{ok:boolean, mensaje:string}}
 */
function guardarCorreccionComercial(uuid, respuestas, emailComercial) {
  var ss = SpreadsheetApp.openById(getHojaControlId());
  var hojaErrores = ss.getSheetByName('Errores_Terceros');
  if (!hojaErrores) return { ok: false, mensaje: 'Pestaña Errores_Terceros no encontrada.' };

  var datos = hojaErrores.getDataRange().getValues();
  var ahora = new Date();

  for (var i = 1; i < datos.length; i++) {
    if (String(datos[i][0] || '').trim() !== uuid) continue;
    if (String(datos[i][10] || '').trim() !== 'PENDIENTE') continue;

    var participante = String(datos[i][2] || '').trim();

    // Buscar la respuesta correspondiente
    for (var r = 0; r < respuestas.length; r++) {
      if (respuestas[r].participante === participante) {
        hojaErrores.getRange(i + 1, 8).setValue(respuestas[r].respuesta); // RESPUESTA_COMERCIAL
        hojaErrores.getRange(i + 1, 10).setValue(ahora); // FECHA_RESPUESTA
        hojaErrores.getRange(i + 1, 11).setValue('CORRECCION_RECIBIDA'); // ESTADO_ERROR
        break;
      }
    }
  }

  // Notificar al auxiliar que el comercial respondió
  try {
    _notificarCorreccionAlAuxiliar(uuid, emailComercial);
  } catch (errMail) {
    console.warn('Notificación de corrección no enviada: ' + errMail.message);
  }

  return { ok: true, mensaje: 'Corrección enviada. El equipo de inducciones la revisará.' };
}

// ============================================================
//  NOTIFICACIONES POR CORREO
// ============================================================

/**
 * Notifica al comercial que una solicitud tiene error en terceros.
 * Correo breve que lo dirige al aplicativo.
 * @param {string} uuid
 * @param {Array} participantes
 */
function _notificarErrorAlComercial(uuid, participantes) {
  // Obtener email del comercial desde Control_General
  var hoja = SpreadsheetApp.openById(getHojaControlId()).getSheetByName('Control_General');
  var finder = hoja.createTextFinder(uuid).matchEntireCell(true);
  var celda = finder.findNext();
  if (!celda) return;

  var fila = celda.getRow();
  var arrendatario = String(hoja.getRange(fila, 24).getValue() || '');
  var idLote = String(hoja.getRange(fila, 1).getValue() || '');
  var comercialNombre = String(hoja.getRange(fila, 11).getValue() || '');

  // Buscar email del comercial en Hoja_Control
  var hojaLog = SpreadsheetApp.openById(getHojaControlId()).getSheetByName('Hoja_Control');
  var dataLog = hojaLog.getDataRange().getValues();
  var emailComercial = '';
  for (var i = 1; i < dataLog.length; i++) {
    if (String(dataLog[i][5] || '').trim() === idLote) {
      emailComercial = String(dataLog[i][1] || '').trim();
      break;
    }
  }

  if (!emailComercial || emailComercial.indexOf('@') === -1) return;

  var nombre = emailComercial.split('@')[0].split('.')[0];
  nombre = nombre.charAt(0).toUpperCase() + nombre.slice(1);

  var htmlBody = _envolver_([
    _bloque_cabecera_('Acción requerida'),
    _bloque_barra_estado_(_C_ROJO, '&#9888;', 'Necesitamos tu ayuda'),
    _bloque_cuerpo_inicio_(
      'Hola, ' + nombre,
      'Encontramos un detalle que necesita corrección para la solicitud de <strong>' + arrendatario + '</strong> del lote <strong>' + idLote + '</strong>. Ingresa al aplicativo para ver qué necesitamos y enviar la información.'
    ),
    _bloque_nota_('<strong>Ingresa al aplicativo</strong> → sección "Pendientes" para ver el detalle y responder.'),
    _bloque_pie_()
  ].join(''));

  MailApp.sendEmail({
    to: emailComercial,
    cc: CORREOS_LIDERES.join(','),
    bcc: BCC_AUDITORIA,
    subject: '⚠️ Necesitamos tu ayuda · ' + arrendatario,
    htmlBody: htmlBody,
    name: 'Inducciones · El Libertador SA'
  });
}

/**
 * Notifica al auxiliar que el comercial envió una corrección.
 * @param {string} uuid
 * @param {string} emailComercial
 */
function _notificarCorreccionAlAuxiliar(uuid, emailComercial) {
  // Buscar quién registró el error (AUXILIAR_EMAIL en Errores_Terceros)
  var hojaErrores = SpreadsheetApp.openById(getHojaControlId()).getSheetByName('Errores_Terceros');
  if (!hojaErrores) return;

  var datos = hojaErrores.getDataRange().getValues();
  var emailAuxiliar = '';
  var arrendatario = '';

  for (var i = 1; i < datos.length; i++) {
    if (String(datos[i][0] || '').trim() === uuid) {
      emailAuxiliar = String(datos[i][5] || '').trim();
      break;
    }
  }

  if (!emailAuxiliar || emailAuxiliar.indexOf('@') === -1) return;

  // Obtener arrendatario
  var hoja = SpreadsheetApp.openById(getHojaControlId()).getSheetByName('Control_General');
  var finder = hoja.createTextFinder(uuid).matchEntireCell(true);
  var celda = finder.findNext();
  if (celda) arrendatario = String(hoja.getRange(celda.getRow(), 24).getValue() || '');

  var nombreComercial = emailComercial.split('@')[0].split('.').map(function(p) {
    return p.charAt(0).toUpperCase() + p.slice(1);
  }).join(' ');

  var htmlBody = _envolver_([
    _bloque_cabecera_('Corrección recibida'),
    _bloque_barra_estado_('#0fbdb7', '&#10003;', 'Respuesta del comercial'),
    _bloque_cuerpo_inicio_(
      'Corrección recibida',
      '<strong>' + nombreComercial + '</strong> envió la corrección para la solicitud de <strong>' + arrendatario + '</strong>. Revísala en el aplicativo y procede con la radicación en SAI.'
    ),
    _bloque_nota_('Ingresa al aplicativo → sección "Cola radicación" para revisar la corrección.'),
    _bloque_pie_()
  ].join(''));

  MailApp.sendEmail({
    to: emailAuxiliar,
    cc: CORREOS_LIDERES.join(','),
    bcc: BCC_AUDITORIA,
    subject: '⚡ Corrección recibida · ' + arrendatario,
    htmlBody: htmlBody,
    name: 'Inducciones · El Libertador SA'
  });
}
