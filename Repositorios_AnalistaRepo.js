/**
 * ============================================================
 * AnalistaRepo — Acceso a datos para el flujo del Analista
 *
 * Lee/escribe en "registro analisis" del Libro de Análisis.
 * Usa COLA_ANALISIS para asignación rápida.
 * ============================================================
 */

/**
 * Helper: headers cacheados de "registro analisis" (comparte clave con AnalisisRepo).
 * @param {Sheet} hoja
 * @returns {string[]}
 */
function _headersRegistroAnalisis(hoja) {
  var cache = CacheService.getScriptCache();
  var cached = cache.get('HDR_REG_ANALISIS');
  if (cached) return JSON.parse(cached);
  var headers = hoja.getRange(1, 1, 1, hoja.getLastColumn()).getValues()[0].map(function(h) { return String(h || '').trim(); });
  cache.put('HDR_REG_ANALISIS', JSON.stringify(headers), 300);
  return headers;
}

/**
 * Obtiene las solicitudes asignadas a un analista + info de cupo.
 * OPTIMIZADO: Usa TextFinder para buscar solo filas del analista (no lee toda la hoja).
 * @param {string} emailAnalista
 * @param {number} cupoMax
 * @returns {{solicitudes:Array, cupo:number, activas:number}}
 */
function obtenerSolicitudesAnalista(emailAnalista, cupoMax) {
  var hoja = SpreadsheetApp.openById(getArchivoAnalisisId()).getSheetByName('registro analisis');
  if (!hoja || hoja.getLastRow() < 2) return { solicitudes: [], cupo: cupoMax || 0, activas: 0 };

  var headers = _headersRegistroAnalisis(hoja);

  // Encontrar columnas necesarias
  var colAsignada = -1, colRegSAI = -1, colArrendatario = -1;
  var colId = -1, colCanon = -1, colCiudad = -1, colDestino = -1, colLote = -1, colPoliza = -1, colSolicitud = -1;

  for (var h = 0; h < headers.length; h++) {
    var hdr = String(headers[h]).trim();
    if (hdr === 'ASIGNADA A\u2026' || hdr === 'ASIGNADA A...' || hdr === 'ASIGNADA A') colAsignada = h + 1;
    if (hdr === 'REGISTRO ANALISTA SAI') colRegSAI = h + 1;
    if (hdr === 'Arrendatario') colArrendatario = h + 1;
    if (hdr === 'Id_arrendatario') colId = h + 1;
    if (hdr === 'Canon') colCanon = h + 1;
    if (hdr === 'ciudad del inmueble') colCiudad = h + 1;
    if (hdr === 'Destino') colDestino = h + 1;
    if (hdr === 'codigo lote') colLote = h + 1;
    if (hdr === 'Poliza') colPoliza = h + 1;
    if (hdr === 'Solicitud Inquilino') colSolicitud = h + 1;
  }

  if (colAsignada === -1) return { solicitudes: [], cupo: cupoMax || 0, activas: 0 };

  // TextFinder: buscar el email del analista en la columna ASIGNADA A (rápido)
  var finder = hoja.getRange(2, colAsignada, hoja.getLastRow() - 1, 1)
    .createTextFinder(emailAnalista).matchCase(false);
  var celdas = finder.findAll();

  // Filtrar solo las que NO tienen REGISTRO SAI (no finalizadas)
  var solicitudes = [];
  for (var i = 0; i < celdas.length; i++) {
    var fila = celdas[i].getRow();
    var regSAI = colRegSAI > 0 ? String(hoja.getRange(fila, colRegSAI).getValue() || '').trim() : '';
    if (regSAI) continue; // Ya finalizada

    // Leer fila completa de una vez (1 llamada en vez de 8)
    var maxCol = Math.max(colArrendatario, colId, colCanon, colCiudad, colDestino, colLote, colPoliza, colSolicitud);
    var filaData = hoja.getRange(fila, 1, 1, maxCol).getValues()[0];

    solicitudes.push({
      fila: fila,
      arrendatario: colArrendatario > 0 ? String(filaData[colArrendatario - 1] || '') : '',
      identificacion: colId > 0 ? String(filaData[colId - 1] || '') : '',
      canon: colCanon > 0 ? String(filaData[colCanon - 1] || '') : '',
      ciudad: colCiudad > 0 ? String(filaData[colCiudad - 1] || '') : '',
      destino: colDestino > 0 ? String(filaData[colDestino - 1] || '') : '',
      codigoLote: colLote > 0 ? String(filaData[colLote - 1] || '') : '',
      poliza: colPoliza > 0 ? String(filaData[colPoliza - 1] || '') : '',
      solicitudInquilino: colSolicitud > 0 ? String(filaData[colSolicitud - 1] || '') : ''
    });
  }

  return { solicitudes: solicitudes, cupo: cupoMax || 0, activas: solicitudes.length };
}

/**
 * Asigna UNA solicitud al analista.
 * OPTIMIZADO: Lee de COLA_ANALISIS (pestaña pequeña) en vez de registro analisis.
 * @param {string} emailAnalista
 * @param {number} cupoMax
 * @returns {{ok:boolean, mensaje:string, solicitud:Object}}
 */
function pedirSolicitudAnalista(emailAnalista, cupoMax) {
  var lock = LockService.getScriptLock();
  if (!lock.tryLock(10000)) {
    return { ok: false, mensaje: 'Otro analista está pidiendo. Intenta de nuevo.' };
  }

  try {
    var ss = SpreadsheetApp.openById(getHojaControlId());
    var hojaCola = ss.getSheetByName('COLA_ANALISIS');
    if (!hojaCola || hojaCola.getLastRow() < 2) {
      return { ok: false, mensaje: 'No hay solicitudes disponibles.' };
    }

    var datos = hojaCola.getDataRange().getValues();
    // Headers: UUID, ID_LOTE, ARRENDATARIO, POLIZA, CIUDAD, DESTINO, FECHA_LOTE, FILA_REG, ESTADO, ASIGNADA_A, FECHA_ASIG

    // Contar activas del analista + buscar primera disponible
    var activas = 0;
    var filaDisponible = -1;
    var solDisponible = null;

    for (var i = 1; i < datos.length; i++) {
      var estado = String(datos[i][8] || '').trim();
      var asignada = String(datos[i][9] || '').trim().toLowerCase();

      if (asignada === emailAnalista.toLowerCase() && estado === 'EN_EVALUACION') {
        activas++;
      }
      if (filaDisponible === -1 && estado === 'DISPONIBLE') {
        filaDisponible = i + 1; // fila en Sheets
        solDisponible = {
          uuid: String(datos[i][0] || ''),
          arrendatario: String(datos[i][2] || ''),
          poliza: String(datos[i][3] || ''),
          ciudad: String(datos[i][4] || '')
        };
      }
    }

    if (activas >= cupoMax) {
      return { ok: false, mensaje: 'Cupo lleno (' + activas + '/' + cupoMax + '). Finaliza una solicitud para pedir más.' };
    }
    if (filaDisponible === -1) {
      return { ok: false, mensaje: 'No hay solicitudes disponibles en este momento.' };
    }

    // Asignar en COLA_ANALISIS
    hojaCola.getRange(filaDisponible, 9).setValue('EN_EVALUACION');
    hojaCola.getRange(filaDisponible, 10).setValue(emailAnalista);
    hojaCola.getRange(filaDisponible, 11).setValue(new Date());

    // También asignar en registro analisis (columna ASIGNADA A)
    try {
      var hojaAnalisis = SpreadsheetApp.openById(getArchivoAnalisisId()).getSheetByName('registro analisis');
      if (hojaAnalisis) {
        var headers = _headersRegistroAnalisis(hojaAnalisis);
        var colAsignada = -1;
        for (var h = 0; h < headers.length; h++) {
          var hdr = String(headers[h]).trim();
          if (hdr === 'ASIGNADA A\u2026' || hdr === 'ASIGNADA A...' || hdr === 'ASIGNADA A') { colAsignada = h + 1; break; }
        }
        if (colAsignada > 0) {
          // Buscar fila por UUID en registro analisis
          var finder = hojaAnalisis.createTextFinder(solDisponible.uuid).matchEntireCell(true);
          var celda = finder.findNext();
          if (celda) {
            var celdaAsig = hojaAnalisis.getRange(celda.getRow(), colAsignada);
            try { celdaAsig.clearDataValidations(); } catch(ev) {}
            celdaAsig.setValue(emailAnalista);
          }
        }
      }
    } catch (errSync) {
      console.warn('No se pudo asignar en registro analisis: ' + errSync.message);
    }

    return { ok: true, mensaje: 'Solicitud asignada: ' + solDisponible.arrendatario, solicitud: solDisponible };
  } finally {
    lock.releaseLock();
  }
}

/**
 * Guarda los campos de evaluación del analista en la fila correspondiente.
 * NO usa lock (fila exclusiva).
 * Solo escribe las columnas editables (no pisa fórmulas).
 * @param {number} filaNum
 * @param {Object} campos - {Ingresos:'', Acierta:'', ocupacion:'', ...}
 * @param {boolean} finalizar - Si true, escribe REGISTRO ANALISTA SAI + Fecha
 * @param {string} emailAnalista
 * @returns {{ok:boolean, mensaje:string}}
 */
function guardarEvaluacionAnalista(filaNum, campos, finalizar, emailAnalista) {
  var hoja = SpreadsheetApp.openById(getArchivoAnalisisId()).getSheetByName('registro analisis');
  if (!hoja) return { ok: false, mensaje: 'Hoja no encontrada.' };

  var headers = _headersRegistroAnalisis(hoja);

  // Campos editables permitidos (nunca pisar fórmulas)
  var permitidos = [
    'Ingresos', 'Acierta', 'ocupacion', 'Respuesta modelo inquilino', 'Regla Dura Inquilino',
    'Ingresos COA1', 'Acierta COA1', 'Ocupacion COA1', 'Respuesta modelo COA1', 'Regla Dura COA1',
    'ocupacion COA1',
    'Ingresos COA2', 'Acierta COA2', 'Ocupacion COA2', 'Respuesta modelo COA2', 'Regla Dura COA2',
    'ocupacion COA2',
    'Ingresos COA3', 'Acierta COA3', 'Ocupacion COA3', 'Respuesta modelo COA3', 'Regla Dura COA3',
    'ocupacion COA3',
    'Ingresos COA4', 'Acierta COA4', 'Ocupacion COA4', 'Respuesta modelo COA4', 'Regla Dura COA4',
    'ocupacion COA4',
    'Ingresos COA5', 'Acierta COA5', 'Ocupacion COA5', 'Respuesta modelo COA5', 'Regla Dura COA5',
    'ocupacion COA5',
    'comentarios del analista'
  ];

  // Escribir cada campo en su columna
  for (var campo in campos) {
    if (permitidos.indexOf(campo) === -1) continue; // Ignorar campos no permitidos
    var col = -1;
    for (var h = 0; h < headers.length; h++) {
      if (String(headers[h]).trim() === campo) { col = h + 1; break; }
    }
    if (col > 0) {
      hoja.getRange(filaNum, col).setValue(campos[campo]);
    }
  }

  // Si finalizar → escribir REGISTRO ANALISTA SAI + Fecha Evaluacion
  if (finalizar) {
    for (var h2 = 0; h2 < headers.length; h2++) {
      var hdr = String(headers[h2]).trim();
      if (hdr === 'REGISTRO ANALISTA SAI') {
        hoja.getRange(filaNum, h2 + 1).setValue(emailAnalista);
      }
      if (hdr === 'Fecha Evaluacion') {
        hoja.getRange(filaNum, h2 + 1).setValue(new Date());
      }
    }
  }

  return { ok: true, mensaje: finalizar ? 'Evaluación finalizada.' : 'Borrador guardado.' };
}

// ============================================================
//  ASIGNACIONES (Líder ve y reasigna)
// ============================================================

/**
 * Obtiene todas las solicitudes actualmente asignadas (no finalizadas).
 * @returns {Array}
 */
function obtenerAsignacionesActivas() {
  var hoja = SpreadsheetApp.openById(getArchivoAnalisisId()).getSheetByName('registro analisis');
  if (!hoja || hoja.getLastRow() < 2) return [];

  var headers = _headersRegistroAnalisis(hoja);
  var ultimaFila = hoja.getLastRow();

  var colAsignada = -1, colRegSAI = -1, colArrendatario = -1, colLote = -1, colSolicitud = -1;
  for (var h = 0; h < headers.length; h++) {
    var hdr = String(headers[h]).trim();
    if (hdr === 'ASIGNADA A\u2026' || hdr === 'ASIGNADA A...' || hdr === 'ASIGNADA A') colAsignada = h + 1;
    if (hdr === 'REGISTRO ANALISTA SAI') colRegSAI = h + 1;
    if (hdr === 'Arrendatario') colArrendatario = h + 1;
    if (hdr === 'codigo lote') colLote = h + 1;
    if (hdr === 'Solicitud Inquilino') colSolicitud = h + 1;
  }

  if (colAsignada === -1) return [];

  // Leer solo columnas necesarias
  var dataAsig = hoja.getRange(2, colAsignada, ultimaFila - 1, 1).getValues();
  var dataRegSAI = hoja.getRange(2, colRegSAI, ultimaFila - 1, 1).getValues();
  var dataArr = hoja.getRange(2, colArrendatario, ultimaFila - 1, 1).getValues();
  var dataLote = hoja.getRange(2, colLote, ultimaFila - 1, 1).getValues();
  var dataSol = hoja.getRange(2, colSolicitud, ultimaFila - 1, 1).getValues();

  var resultado = [];
  for (var i = 0; i < dataAsig.length; i++) {
    var asig = String(dataAsig[i][0] || '').trim();
    if (!asig) continue;
    var regSAI = String(dataRegSAI[i][0] || '').trim();
    if (regSAI) continue; // Ya finalizada

    resultado.push({
      fila: i + 2,
      arrendatario: String(dataArr[i][0] || ''),
      codigoLote: String(dataLote[i][0] || ''),
      solicitud: String(dataSol[i][0] || ''),
      asignadaA: asig
    });
  }

  return resultado;
}

/**
 * Reasigna una solicitud a otro analista o la libera (vacío).
 * @param {number} filaNum
 * @param {string} nuevoEmail - Email nuevo (vacío = liberar a cola)
 * @returns {{ok:boolean, mensaje:string}}
 */
function reasignarSolicitud(filaNum, nuevoEmail) {
  var hoja = SpreadsheetApp.openById(getArchivoAnalisisId()).getSheetByName('registro analisis');
  var headers = _headersRegistroAnalisis(hoja);

  var colAsignada = -1;
  for (var h = 0; h < headers.length; h++) {
    var hdr = String(headers[h]).trim();
    if (hdr === 'ASIGNADA A\u2026' || hdr === 'ASIGNADA A...' || hdr === 'ASIGNADA A') { colAsignada = h + 1; break; }
  }

  if (colAsignada === -1) return { ok: false, mensaje: 'Columna no encontrada.' };

  var celda = hoja.getRange(filaNum, colAsignada);
  try { celda.clearDataValidations(); } catch(e) {}
  celda.setValue(nuevoEmail || '');

  var accion = nuevoEmail ? 'Reasignada a ' + nuevoEmail : 'Liberada a cola';
  return { ok: true, mensaje: accion };
}
