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
 * Auxiliar toma una solicitud: cambia estado a "EN PROCESO RADICACIÓN" + escribe su email.
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

    // Verificar que sigue en PENDIENTE RADICAR (no tomada por otro)
    var estadoActual = String(hoja.getRange(fila, 10).getValue()).trim().toUpperCase();
    if (estadoActual !== 'PENDIENTE RADICAR') {
      return { ok: false, mensaje: 'Esta solicitud ya fue tomada por alguien más.' };
    }

    // Reservar: no cambiamos estado aún (se cambia al marcar RADICADO o ERROR),
    // pero esto confirma que nadie más la tomó durante este lock.
    return { ok: true, mensaje: 'Solicitud verificada y disponible.' };
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
  var lock = LockService.getScriptLock();
  if (!lock.tryLock(10000)) {
    return { ok: false, mensaje: 'Otro proceso está radicando. Intenta de nuevo.' };
  }

  try {
    var hoja = SpreadsheetApp.openById(getHojaControlId()).getSheetByName('Control_General');

    var finder = hoja.createTextFinder(uuid).matchEntireCell(true);
    var celda = finder.findNext();
    if (!celda) return { ok: false, mensaje: 'Solicitud no encontrada.' };

    var fila = celda.getRow();

    // Verificar que no se haya radicado ya (idempotencia)
    var estadoActual = String(hoja.getRange(fila, 10).getValue() || '').trim().toUpperCase();
    if (estadoActual === 'RADICADO') {
      return { ok: false, mensaje: 'Esta solicitud ya fue marcada como RADICADO.' };
    }

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

  // Insertar en COLA_ANALISIS para que el analista pueda tomarlo rápidamente
  try {
    var hojaColaA = SpreadsheetApp.openById(getHojaControlId()).getSheetByName('COLA_ANALISIS');
    if (hojaColaA) {
      var arrendatario = String(hoja.getRange(fila, 24).getValue() || '');
      var poliza = String(hoja.getRange(fila, 17).getValue() || '');
      var ciudad = String(hoja.getRange(fila, 19).getValue() || '');
      var destino = String(hoja.getRange(fila, 18).getValue() || '');
      var idLote = String(hoja.getRange(fila, 1).getValue() || '');
      var fechaLote = hoja.getRange(fila, 3).getValue();
      var fechaStr = fechaLote instanceof Date ? Utilities.formatDate(fechaLote, 'GMT-5', 'yyyy-MM-dd') : '';

      hojaColaA.appendRow([
        uuid,           // UUID_SISTEMA
        idLote,         // ID_LOTE
        arrendatario,   // ARRENDATARIO
        poliza,         // POLIZA
        ciudad,         // CIUDAD
        destino,        // DESTINO
        fechaStr,       // FECHA_LOTE
        fila,           // FILA_REG_ANALISIS (no aplica aquí, se llenará en sync)
        'DISPONIBLE',   // ESTADO
        '',             // ASIGNADA_A
        ''              // FECHA_ASIGNACION
      ]);
    }
  } catch (errCola) {
    console.warn('No se pudo insertar en COLA_ANALISIS: ' + errCola.message);
  }

  return { ok: true, mensaje: 'Solicitud marcada como RADICADO.' };
  } finally {
    lock.releaseLock();
  }
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

  // Notificar al comercial por correo (delegado al servicio de notificaciones)
  try {
    var hojaCtrl = ss.getSheetByName('Control_General');
    var finderCtrl = hojaCtrl.createTextFinder(uuid).matchEntireCell(true);
    var celdaCtrl = finderCtrl.findNext();
    if (celdaCtrl) {
      var filaCtrl = celdaCtrl.getRow();
      var arrendatarioNotif = String(hojaCtrl.getRange(filaCtrl, 24).getValue() || '');
      var idLoteNotif = String(hojaCtrl.getRange(filaCtrl, 1).getValue() || '');
      // Buscar email del comercial
      var hojaLog = ss.getSheetByName('Hoja_Control');
      var emailComercial = '';
      if (hojaLog) {
        var dataLog = hojaLog.getDataRange().getValues();
        for (var lg = 1; lg < dataLog.length; lg++) {
          if (String(dataLog[lg][5] || '').trim() === idLoteNotif) { emailComercial = String(dataLog[lg][1] || '').trim(); break; }
        }
      }
      notificarErrorAlComercial(uuid, arrendatarioNotif, idLoteNotif, emailComercial);
    }
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

  // Leer catálogo de motivos para enriquecer con instrucciones
  var motivos = _leerCatalogoMotivos();
  var mapaMotivos = {};
  for (var m = 0; m < motivos.length; m++) {
    mapaMotivos[motivos[m].id] = motivos[m];
  }

  // Leer todos los errores pendientes
  var datos = hojaErrores.getDataRange().getValues();
  var erroresPendientes = {};

  // Para LIDER/ADMIN (nombre=null) mostrar PENDIENTE + CORRECCION_RECIBIDA
  // Para COMERCIAL (nombre tiene valor) mostrar AMBOS también (pero con distintas vistas)
  var estadosVisibles = ['PENDIENTE', 'CORRECCION_RECIBIDA'];

  for (var i = 1; i < datos.length; i++) {
    var estadoErr = String(datos[i][10] || '').trim();
    if (estadosVisibles.indexOf(estadoErr) === -1) continue;
    var uuid = String(datos[i][0] || '').trim();
    if (!erroresPendientes[uuid]) {
      erroresPendientes[uuid] = {
        uuid: uuid,
        participantes: [],
        fechaError: datos[i][6] instanceof Date ? Utilities.formatDate(datos[i][6], 'GMT-5', 'd/MM/yyyy') : ''
      };
    }

    // Parsear requerimientos y enriquecer con instrucciones
    var reqIds = String(datos[i][3] || '').split('|').filter(function(r) { return r; });
    var reqsEnriquecidos = [];
    for (var rr = 0; rr < reqIds.length; rr++) {
      var motivo = mapaMotivos[reqIds[rr]];
      reqsEnriquecidos.push({
        id: reqIds[rr],
        label: motivo ? motivo.label : reqIds[rr],
        instruccion: motivo ? motivo.instruccion : ''
      });
    }

    erroresPendientes[uuid].participantes.push({
      participante: String(datos[i][2] || ''),
      requerimientos: String(datos[i][3] || ''),
      requerimientosDetalle: reqsEnriquecidos,
      estadoError: estadoErr,
      respuestaComercial: String(datos[i][7] || ''),
      archivosPath: String(datos[i][8] || ''),
      fila: i + 1
    });
  }

  // Cruzar con Control_General — leer 1 vez y armar índice por UUID
  var hojaControl = ss.getSheetByName('Control_General');
  var nombre = emailComercial ? _nombreComercialParaBusqueda(emailComercial) : null;
  var resultado = [];

  // Leer toda la data de Control_General en 1 llamada y armar mapa UUID→fila
  var ultimaFilaCtrl = hojaControl.getLastRow();
  var indicePorUuid = {};
  if (ultimaFilaCtrl > 1) {
    var datosControl = hojaControl.getRange(2, 1, ultimaFilaCtrl - 1, 62).getValues();
    for (var dc = 0; dc < datosControl.length; dc++) {
      var uuidCtrl = String(datosControl[dc][61] || '').trim();
      if (uuidCtrl) indicePorUuid[uuidCtrl] = datosControl[dc];
    }
  }

  var uuids = Object.keys(erroresPendientes);
  for (var u = 0; u < uuids.length; u++) {
    var uuid = uuids[u];
    var filaControl = indicePorUuid[uuid];
    if (!filaControl) continue;

    var comercial = String(filaControl[10] || '').toUpperCase().trim();
    if (nombre && comercial !== nombre) continue;

    var arrendatario = String(filaControl[23] || '');
    var idLote = String(filaControl[0] || '');
    var fechaRaw = filaControl[2];
    var fechaRadicacion = fechaRaw instanceof Date ? Utilities.formatDate(fechaRaw, 'GMT-5', 'd/MM/yyyy') : '';

    var nombresParticipantes = {
      'INQ': arrendatario,
      'COA1': String(filaControl[29] || ''),
      'COA2': String(filaControl[35] || ''),
      'COA3': String(filaControl[41] || ''),
      'COA4': String(filaControl[47] || ''),
      'COA5': String(filaControl[53] || '')
    };

    var err = erroresPendientes[uuid];
    err.arrendatario = arrendatario;
    err.idLote = idLote;
    err.fechaRadicacion = fechaRadicacion;

    for (var p = 0; p < err.participantes.length; p++) {
      var partCode = err.participantes[p].participante;
      err.participantes[p].nombreReal = nombresParticipantes[partCode] || partCode;
    }

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

        // Subir archivo a Drive si existe
        if (respuestas[r].archivo && respuestas[r].archivo.bytes) {
          try {
            var archivoData = respuestas[r].archivo;
            var base64 = archivoData.bytes.split(',')[1] || archivoData.bytes;
            var blob = Utilities.newBlob(Utilities.base64Decode(base64), archivoData.tipo, archivoData.nombre);

            // Crear carpeta de correcciones si no existe
            var carpetaRaiz = DriveApp.getFolderById(getCarpetaRaizId());
            var carpetasCorr = carpetaRaiz.getFoldersByName('correcciones');
            var carpetaCorr = carpetasCorr.hasNext() ? carpetasCorr.next() : carpetaRaiz.createFolder('correcciones');

            var archivo = carpetaCorr.createFile(blob);
            archivo.setName(uuid + '_' + participante + '_' + archivoData.nombre);
            var urlArchivo = archivo.getUrl();

            hojaErrores.getRange(i + 1, 9).setValue(urlArchivo); // ARCHIVOS_DRIVE_PATH
          } catch (errDrive) {
            console.warn('No se pudo subir archivo: ' + errDrive.message);
          }
        }
        break;
      }
    }
  }

  // Notificar al auxiliar que el comercial respondió (delegado al servicio)
  try {
    var hojaErr = ss.getSheetByName('Errores_Terceros');
    var emailAux = '';
    var arrNotif = '';
    if (hojaErr) {
      var datosErr = hojaErr.getDataRange().getValues();
      for (var e = 1; e < datosErr.length; e++) {
        if (String(datosErr[e][0] || '').trim() === uuid) { emailAux = String(datosErr[e][5] || '').trim(); break; }
      }
    }
    var hojaCtrl2 = ss.getSheetByName('Control_General');
    var finderCtrl2 = hojaCtrl2.createTextFinder(uuid).matchEntireCell(true);
    var celdaCtrl2 = finderCtrl2.findNext();
    if (celdaCtrl2) arrNotif = String(hojaCtrl2.getRange(celdaCtrl2.getRow(), 24).getValue() || '');
    notificarCorreccionAlAuxiliar(arrNotif, emailAux, emailComercial);
  } catch (errMail) {
    console.warn('Notificación de corrección no enviada: ' + errMail.message);
  }

  return { ok: true, mensaje: 'Corrección enviada. El equipo de inducciones la revisará.' };
}

