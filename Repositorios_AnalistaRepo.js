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
 * Usa CacheWrapper para serialización/deserialización unificada.
 * @param {Sheet} hoja
 * @returns {string[]}
 */
function _headersRegistroAnalisis(hoja) {
  var cached = CacheWrapper_getJSON('HDR_REG_ANALISIS');
  if (cached) return cached;
  var headers = hoja.getRange(1, 1, 1, hoja.getLastColumn()).getValues()[0].map(function(h) { return String(h || '').trim(); });
  CacheWrapper_putJSON('HDR_REG_ANALISIS', headers, 300);
  return headers;
}

/**
 * Obtiene las solicitudes asignadas a un analista + info de cupo.
 * OPTIMIZADO: Lee COLA_ANALISIS (pequeña) y accede directamente a filas específicas
 * de "registro analisis" usando FILA_REG_ANALISIS — sin TextFinder.
 *
 * Llamadas a Sheets: máximo N+2 (1 COLA_ANALISIS + 1 headers + N filas individuales),
 * donde N = solicitudes activas del analista (limitado por cupoMax ≤ 10).
 *
 * @param {string} emailAnalista
 * @param {number} cupoMax
 * @returns {{solicitudes:Array, cupo:number, activas:number}}
 */
function obtenerSolicitudesAnalista(emailAnalista, cupoMax) {
  // ── 1. Leer COLA_ANALISIS (1 llamada a Sheets) ──────────────────────────────
  var ssCola = SpreadsheetApp.openById(getHojaControlId());
  var hojaCola = ssCola.getSheetByName('COLA_ANALISIS');
  if (!hojaCola || hojaCola.getLastRow() < 2) {
    return { solicitudes: [], cupo: cupoMax || 0, activas: 0 };
  }

  var datosCola = hojaCola.getDataRange().getValues(); // 1 llamada

  // ── 2. Filtrar filas: ESTADO=EN_EVALUACION y ASIGNADA_A=email ────────────────
  // COLA_ANALISIS: UUID(0), ID_LOTE(1), ARRENDATARIO(2), POLIZA(3), CIUDAD(4),
  //               DESTINO(5), FECHA_LOTE(6), FILA_REG_ANALISIS(7), ESTADO(8),
  //               ASIGNADA_A(9), FECHA_ASIG(10)
  var emailLower = String(emailAnalista || '').trim().toLowerCase();
  var solicitudesActivas = [];

  for (var i = 1; i < datosCola.length; i++) {
    var estado = String(datosCola[i][8] || '').trim();
    var asignada = String(datosCola[i][9] || '').trim().toLowerCase();

    if (estado === 'EN_EVALUACION' && asignada === emailLower) {
      solicitudesActivas.push({
        uuid: String(datosCola[i][0] || '').trim(),
        filaReg: datosCola[i][7],
        arrendatario: String(datosCola[i][2] || ''),
        poliza: String(datosCola[i][3] || ''),
        ciudad: String(datosCola[i][4] || ''),
        destino: String(datosCola[i][5] || ''),
        codigoLote: String(datosCola[i][1] || '')
      });
    }
  }

  if (solicitudesActivas.length === 0) {
    return { solicitudes: [], cupo: cupoMax || 0, activas: 0 };
  }

  // ── 3. Abrir "registro analisis" y obtener headers (1 llamada o caché) ───────
  var hojaAnalisis = SpreadsheetApp.openById(getArchivoAnalisisId()).getSheetByName('registro analisis');
  if (!hojaAnalisis || hojaAnalisis.getLastRow() < 2) {
    return { solicitudes: [], cupo: cupoMax || 0, activas: solicitudesActivas.length };
  }

  var headers = _headersRegistroAnalisis(hojaAnalisis); // usa caché HDR_REG_ANALISIS

  // Mapear columnas necesarias de "registro analisis"
  var colArrendatario = -1, colId = -1, colCanon = -1, colCiudad = -1;
  var colDestino = -1, colLote = -1, colPoliza = -1, colSolicitud = -1;
  var colUuid = -1;

  for (var h = 0; h < headers.length; h++) {
    var hdr = String(headers[h]).trim();
    if (hdr === 'Arrendatario') colArrendatario = h;
    if (hdr === 'Id_arrendatario') colId = h;
    if (hdr === 'Canon') colCanon = h;
    if (hdr === 'ciudad del inmueble') colCiudad = h;
    if (hdr === 'Destino') colDestino = h;
    if (hdr === 'codigo lote') colLote = h;
    if (hdr === 'Poliza') colPoliza = h;
    if (hdr === 'Solicitud Inquilino') colSolicitud = h;
    if (hdr === 'UUID_SISTEMA' || hdr === 'uuid_sistema') colUuid = h;
  }

  var totalCols = headers.length;
  var ultimaFilaAnalisis = hojaAnalisis.getLastRow();

  // ── 4. Leer filas directas de "registro analisis" (N llamadas, máx cupoMax ≤ 10) ─
  var solicitudes = [];
  var limite = Math.min(solicitudesActivas.length, cupoMax || 10);

  for (var s = 0; s < limite; s++) {
    var sol = solicitudesActivas[s];
    var filaNum = parseInt(sol.filaReg, 10);

    // Validar FILA_REG_ANALISIS: vacío, 0, o no numérico → excluir
    if (!filaNum || filaNum <= 0 || isNaN(filaNum)) {
      console.warn(
        'obtenerSolicitudesAnalista: FILA_REG_ANALISIS inválido para UUID "' +
        sol.uuid + '" (valor: ' + sol.filaReg + '). Solicitud excluida.'
      );
      continue;
    }

    // Validar que la fila no excede el rango de la hoja
    if (filaNum > ultimaFilaAnalisis) {
      console.warn(
        'obtenerSolicitudesAnalista: FILA_REG_ANALISIS=' + filaNum +
        ' excede última fila (' + ultimaFilaAnalisis + ') para UUID "' + sol.uuid + '". Excluida.'
      );
      continue;
    }

    // Leer la fila directa (1 llamada por solicitud)
    var filaData = hojaAnalisis.getRange(filaNum, 1, 1, totalCols).getValues()[0];

    // Validar UUID: la fila debe contener el UUID esperado
    if (colUuid >= 0) {
      var uuidEnFila = String(filaData[colUuid] || '').trim();
      if (uuidEnFila !== sol.uuid) {
        console.warn(
          'obtenerSolicitudesAnalista: UUID no coincide en fila ' + filaNum +
          '. Esperado: "' + sol.uuid + '", encontrado: "' + uuidEnFila + '". Excluida.'
        );
        continue;
      }
    }

    solicitudes.push({
      fila: filaNum,
      arrendatario: colArrendatario >= 0 ? String(filaData[colArrendatario] || '') : '',
      identificacion: colId >= 0 ? String(filaData[colId] || '') : '',
      canon: colCanon >= 0 ? String(filaData[colCanon] || '') : '',
      ciudad: colCiudad >= 0 ? String(filaData[colCiudad] || '') : '',
      destino: colDestino >= 0 ? String(filaData[colDestino] || '') : '',
      codigoLote: colLote >= 0 ? String(filaData[colLote] || '') : '',
      poliza: colPoliza >= 0 ? String(filaData[colPoliza] || '') : '',
      solicitudInquilino: colSolicitud >= 0 ? String(filaData[colSolicitud] || '') : ''
    });
  }

  return { solicitudes: solicitudes, cupo: cupoMax || 0, activas: solicitudesActivas.length };
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

    // Asignar en COLA_ANALISIS (ESTADO, ASIGNADA_A, FECHA_ASIGNACION = cols 9-11)
    // Batch write: 1 fila × 3 columnas en una sola llamada setValues()
    try {
      hojaCola.getRange(filaDisponible, 9, 1, 3).setValues([['EN_EVALUACION', emailAnalista, new Date()]]);
    } catch (errWrite) {
      // Si falla la escritura en COLA_ANALISIS: liberar lock, no modificar registro analisis, retornar error
      return { ok: false, mensaje: 'No se pudo completar la asignación. Intenta de nuevo.' };
    }

    // Solo proceder a registro analisis si COLA_ANALISIS fue exitoso
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

  // Leer 1 bloque que cubra todas las columnas necesarias
  var maxCol = Math.max(colAsignada, colRegSAI, colArrendatario, colLote, colSolicitud);
  var bloque = hoja.getRange(2, 1, ultimaFila - 1, maxCol).getValues();

  var resultado = [];
  for (var i = 0; i < bloque.length; i++) {
    var asig = String(bloque[i][colAsignada - 1] || '').trim();
    if (!asig) continue;
    var regSAI = String(bloque[i][colRegSAI - 1] || '').trim();
    if (regSAI) continue; // Ya finalizada

    resultado.push({
      fila: i + 2,
      arrendatario: String(bloque[i][colArrendatario - 1] || ''),
      codigoLote: String(bloque[i][colLote - 1] || ''),
      solicitud: String(bloque[i][colSolicitud - 1] || ''),
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
