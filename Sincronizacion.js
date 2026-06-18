/**
 * MOTOR DE SINCRONIZACIÓN AUTOMÁTICA v4
 *
 * RADICADO         → Inserta o actualiza en destino. Cambia estado a "EN ANÁLISIS" en origen.
 * ERROR EN TERCEROS → Inserta o actualiza en destino. Estado en origen no cambia (queda en espera).
 *
 * Los registros de un mismo lote siempre se escriben en filas consecutivas.
 * Cuando un ERROR EN TERCEROS se corrige y pasa a RADICADO, actualiza la info
 * en destino y cambia el estado en origen a "EN ANÁLISIS".
 */

function sincronizarLoteAutomatico() {

  // ── 1. CONEXIONES ──────────────────────────────────────────────────────────
  var ID_ARCHIVO_ANALISIS = "1ph9pgf-ADc2hE6U4KaKXAGY8ghh5Z940PuLVU_PlOQ0";

  var libroOrigen = SpreadsheetApp.getActiveSpreadsheet();
  if (!libroOrigen) {
    Logger.log("Error: Ejecuta el script desde Extensiones > Apps Script del Sheet de origen.");
    return;
  }

  var hojaRadicacion = libroOrigen.getSheetByName("Control_General");
  var libroDestino   = SpreadsheetApp.openById(ID_ARCHIVO_ANALISIS);
  var hojaAnalisis   = libroDestino.getSheetByName("registro analisis");

  if (!hojaRadicacion || !hojaAnalisis) {
    Logger.log("Error: No se encontró alguna de las pestañas requeridas.");
    return;
  }

  // ── 2. LEER DATOS ORIGEN ───────────────────────────────────────────────────
  var datosRadicacion = hojaRadicacion.getDataRange().getValues();
  var indicesRad      = obtenerMapaColumnas(datosRadicacion[0]);

  if (indicesRad["UUID_SISTEMA"] === undefined) {
    Logger.log("Error: No se encontró 'UUID_SISTEMA' en Control_General."); return;
  }
  if (indicesRad["ID Lote"] === undefined) {
    Logger.log("Error: No se encontró 'ID Lote' en Control_General."); return;
  }
  if (indicesRad["Estado"] === undefined) {
    Logger.log("Error: No se encontró 'Estado' en Control_General."); return;
  }

  // ── 3. LEER DATOS DESTINO ──────────────────────────────────────────────────
  var datosAnalisis = hojaAnalisis.getDataRange().getValues();
  var indicesAnl    = obtenerMapaColumnas(datosAnalisis[0]);

  if (indicesAnl["UUID_SISTEMA"] === undefined) {
    Logger.log("Error: No se encontró 'UUID_SISTEMA' en 'registro analisis'."); return;
  }

  // ── 4. CONSTRUIR MAPA UUID → FILA EN DESTINO ───────────────────────────────
  var mapaUUIDDestino   = {};
  var ultimaFilaOcupada = 1;
  var colUUID           = indicesAnl["UUID_SISTEMA"];

  for (var i = 1; i < datosAnalisis.length; i++) {
    var uid = datosAnalisis[i][colUUID];
    if (uid) {
      mapaUUIDDestino[uid] = i;     // índice base-0 del array
      ultimaFilaOcupada    = i + 1; // fila física en Sheets (base-1)
    }
  }

  var filaParaNuevos = ultimaFilaOcupada + 1; // próxima fila libre

  // ── 5. MAPEO DE COLUMNAS ORIGEN → DESTINO ─────────────────────────────────
  var MAPEO_COLUMNAS = {
    "UUID_SISTEMA"             : "UUID_SISTEMA",
    "Fecha ingreso"            : "Fecha Lote",
    "tipo negociacion"         : "tipo negociacion",
    "Poliza"                   : "Poliza",
    "ID Lote"                  : "codigo lote",
    "Destino"                  : "Destino",
    "Ciudad del inmueble"      : "ciudad del inmueble",
    "Direccion"                : "Direccion",
    "Fecha inicio de contrato" : "Fecha inicio de contrato",
    "Amparo integral"          : "Amparo integral",
    "Tasa Negociación"         : "Tasa Negociación",
    "Canon"                    : "Canon",
    "Administracion"           : "Administracion",
    "Iva"                      : "Iva",
    "Arrendatario"             : "Arrendatario",
    "TD_INQ"                   : "TD_INQ",
    "Id_arrendatario"          : "Id_arrendatario",
    "TEL_INQ"                  : "TEL_INQ",
    "CORREO_INQ"               : "CORREO_INQ",
    "Solicitud Inquilino"      : "Solicitud Inquilino",
    "COA1"  : "COA1",  "TD_COA1" : "TD_COA1",  "Id_COA1" : "Id_COA1",  "TEL_COA1" : "TEL_COA1",  "CORREO_COA1" : "CORREO_COA1",  "NRO COA1" : "NRO COA1",
    "COA2"  : "COA2",  "TD_COA2" : "TD_COA2",  "Id_COA2" : "Id_COA2",  "TEL_COA2" : "TEL_COA2",  "CORREO_COA2" : "CORREO_COA2",  "NRO COA2" : "NRO COA2",
    "COA3"  : "COA3",  "TD_COA3" : "TD_COA3",  "Id_COA3" : "Id_COA3",  "TEL_COA3" : "TEL_COA3",  "CORREO_COA3" : "CORREO_COA3",  "NRO COA3" : "NRO COA3",
    "COA4"  : "COA4",  "TD_COA4" : "TD_COA4",  "Id_COA4" : "Id_COA4",  "TEL_COA4" : "TEL_COA4",  "CORREO_COA4" : "CORREO_COA4",  "NRO COA4" : "NRO COA4",
    "COA5"  : "COA5",  "TD_COA5" : "TD_COA5",  "Id_COA5" : "Id_COA5",  "TEL_COA5" : "TEL_COA5",  "CORREO_COA5" : "CORREO_COA5",  "NRO COA5" : "NRO COA5"
  };

  // ── 6. AGRUPAR TODAS LAS FILAS ELEGIBLES POR ID LOTE ──────────────────────
  // Se procesan RADICADO y ERROR EN TERCEROS.
  // Se conserva el orden original para mantener los registros del lote consecutivos.
  var lotes          = {};
  var ordenDeLotes   = []; // para respetar el orden de aparición de cada lote

  for (var f = 1; f < datosRadicacion.length; f++) {
    var fila   = datosRadicacion[f];
    var estado = fila[indicesRad["Estado"]];
    var idLote = fila[indicesRad["ID Lote"]];

    if (!idLote) continue;

    if (estado === "RADICADO" || estado === "ERROR EN TERCEROS") {
      if (!lotes[idLote]) {
        lotes[idLote] = [];
        ordenDeLotes.push(idLote);
      }
      lotes[idLote].push({
        fila           : fila,
        estado         : estado,
        indiceOriginal : f
      });
    }
  }

  // ── 7. PROCESAR CADA LOTE EN ORDEN ────────────────────────────────────────
  for (var l = 0; l < ordenDeLotes.length; l++) {
    var idLote           = ordenDeLotes[l];
    var registrosDelLote = lotes[idLote];

    Logger.log("── Procesando lote: " + idLote + " (" + registrosDelLote.length + " registros)");

    for (var r = 0; r < registrosDelLote.length; r++) {
      var filaOrigen     = registrosDelLote[r].fila;
      var estadoFila     = registrosDelLote[r].estado;
      var indiceOriginal = registrosDelLote[r].indiceOriginal;
      var uuidOrigen     = filaOrigen[indicesRad["UUID_SISTEMA"]];

      if (!uuidOrigen) continue;

      var uuidYaExiste = mapaUUIDDestino[uuidOrigen] !== undefined;

      if (uuidYaExiste) {
        // ── CASO A: EL REGISTRO YA EXISTE EN DESTINO → ACTUALIZAR ───────────
        var indiceArr = mapaUUIDDestino[uuidOrigen];
        actualizarFila(hojaAnalisis, datosAnalisis, filaOrigen, indiceArr, indicesRad, indicesAnl, MAPEO_COLUMNAS);
        Logger.log("  [ACTUALIZADO] UUID: " + uuidOrigen + " | Estado: " + estadoFila);

      } else {
        // ── CASO B: REGISTRO NUEVO → INSERTAR CONSECUTIVO AL LOTE ───────────
        escribirFilaNueva(hojaAnalisis, filaOrigen, filaParaNuevos, indicesRad, indicesAnl, MAPEO_COLUMNAS);
        mapaUUIDDestino[uuidOrigen] = filaParaNuevos - 1;
        Logger.log("  [INSERTADO] UUID: " + uuidOrigen + " | Estado: " + estadoFila + " → fila " + filaParaNuevos);
        filaParaNuevos++;
      }

      // ── CAMBIO DE ESTADO EN ORIGEN: solo si el registro es RADICADO ───────
      if (estadoFila === "RADICADO") {
        hojaRadicacion
          .getRange(indiceOriginal + 1, indicesRad["Estado"] + 1)
          .setValue("PENDIENTE ASIGNAR");
        Logger.log("  [ESTADO] Fila " + (indiceOriginal + 1) + " → PENDIENTE ASIGNAR");
      }
      // ERROR EN TERCEROS: no se toca el estado en origen, queda en espera
    }
  }

  Logger.log("✅ Sincronización completada.");
}


// ── FUNCIONES AUXILIARES ───────────────────────────────────────────────────────

/**
 * Escribe una fila nueva celda por celda en las columnas mapeadas.
 * Omite valores vacíos para no romper fórmulas VSTACK/LAMBDA del destino.
 */
function escribirFilaNueva(hoja, filaOrigen, filaFisica, indicesRad, indicesAnl, mapeo) {
  for (var colRad in mapeo) {
    var colAnl = mapeo[colRad];
    if (indicesRad[colRad] !== undefined && indicesAnl[colAnl] !== undefined) {
      var valor = filaOrigen[indicesRad[colRad]];
      if (valor !== "" && valor !== null && valor !== undefined) {
        hoja.getRange(filaFisica, indicesAnl[colAnl] + 1).setValue(valor);
      }
    }
  }
}

/**
 * Actualiza solo las celdas que cambiaron en una fila ya existente.
 */
function actualizarFila(hoja, datosDestino, filaOrigen, indiceArr, indicesRad, indicesAnl, mapeo) {
  for (var colRad in mapeo) {
    var colAnl = mapeo[colRad];
    if (indicesRad[colRad] !== undefined && indicesAnl[colAnl] !== undefined) {
      var valorNuevo  = filaOrigen[indicesRad[colRad]];
      var valorActual = datosDestino[indiceArr][indicesAnl[colAnl]];
      if (valorActual !== valorNuevo) {
        hoja.getRange(indiceArr + 1, indicesAnl[colAnl] + 1).setValue(valorNuevo);
      }
    }
  }
}

/**
 * Convierte la fila de encabezados en un mapa { nombreColumna: índice }.
 */
function obtenerMapaColumnas(filaEncabezados) {
  var mapa = {};
  for (var i = 0; i < filaEncabezados.length; i++) {
    var nombre = filaEncabezados[i].toString().trim();
    if (nombre) mapa[nombre] = i;
  }
  return mapa;
}


// ══════════════════════════════════════════════════════════════════════════════
// SINCRONIZACIÓN DE ESTADO: registro analisis → Control_General
//
// Regla 1: Si "REGISTRO ANALISTA SAI" (col CX) está diligenciado → TERMINADO
// Regla 2: Si "ASIGNADA A…" (col C) está diligenciado → EN ANÁLISIS
// Llave:   "Solicitud Inquilino" (col W en análisis ↔ col AC en Control_General)
// Prioridad: Regla 1 > Regla 2
// ══════════════════════════════════════════════════════════════════════════════

function sincronizarEstadoDesdeAnalisis() {

  // ── 1. CONEXIONES ──────────────────────────────────────────────────────────
  var ID_ARCHIVO_ANALISIS  = "1ph9pgf-ADc2hE6U4KaKXAGY8ghh5Z940PuLVU_PlOQ0";
  var ID_ARCHIVO_CONTROL   = "1Z0GLLJvinwaU6MK_iaduKBri8VqfCDEPeOfh9gThQhI";

  var libroAnalisis  = SpreadsheetApp.openById(ID_ARCHIVO_ANALISIS);
  var hojaAnalisis   = libroAnalisis.getSheetByName("registro analisis");

  var libroControl   = SpreadsheetApp.openById(ID_ARCHIVO_CONTROL);
  var hojaControl    = libroControl.getSheetByName("Control_General");

  if (!hojaAnalisis || !hojaControl) {
    Logger.log("Error: No se encontró alguna de las hojas requeridas.");
    return;
  }

  // ── 2. LEER DATOS DE "registro analisis" ───────────────────────────────────
  var datosAnalisis   = hojaAnalisis.getDataRange().getValues();
  var indicesAnalisis = obtenerMapaColumnas(datosAnalisis[0]);

  // Validar columnas requeridas en análisis
  var colSolicitudAnalisis = indicesAnalisis["Solicitud Inquilino"];   // col W
  var colAsignadaA         = indicesAnalisis["ASIGNADA A…"];           // col C
  var colRegistroSAI       = indicesAnalisis["REGISTRO ANALISTA SAI"]; // col CX

  // Fallback: si el encabezado no tiene los puntos suspensivos exactos
  if (colAsignadaA === undefined) {
    colAsignadaA = indicesAnalisis["ASIGNADA A..."];
  }
  if (colAsignadaA === undefined) {
    colAsignadaA = indicesAnalisis["ASIGNADA A"];
  }

  if (colSolicitudAnalisis === undefined) {
    Logger.log("Error: No se encontró 'Solicitud Inquilino' en 'registro analisis'."); return;
  }
  if (colAsignadaA === undefined) {
    Logger.log("Error: No se encontró 'ASIGNADA A…' en 'registro analisis'."); return;
  }
  if (colRegistroSAI === undefined) {
    Logger.log("Error: No se encontró 'REGISTRO ANALISTA SAI' en 'registro analisis'."); return;
  }

  // ── 3. CONSTRUIR MAPA DE ESTADOS DESDE ANÁLISIS ───────────────────────────
  // Llave: Solicitud Inquilino → Estado a asignar
  var mapaEstados = {};

  for (var i = 1; i < datosAnalisis.length; i++) {
    var solicitud       = String(datosAnalisis[i][colSolicitudAnalisis] || "").trim();
    var registroSAI     = String(datosAnalisis[i][colRegistroSAI] || "").trim();
    var asignadaA       = String(datosAnalisis[i][colAsignadaA] || "").trim();

    if (!solicitud) continue;

    // Prioridad: REGISTRO ANALISTA SAI > ASIGNADA A…
    if (registroSAI) {
      mapaEstados[solicitud] = "TERMINADO";
    } else if (asignadaA) {
      // Solo asignar EN ANÁLISIS si no se ha determinado TERMINADO previamente
      if (mapaEstados[solicitud] !== "TERMINADO") {
        mapaEstados[solicitud] = "EN ANÁLISIS";
      }
    }
  }

  // ── 4. LEER DATOS DE "Control_General" ─────────────────────────────────────
  var datosControl   = hojaControl.getDataRange().getValues();
  var indicesControl = obtenerMapaColumnas(datosControl[0]);

  var colSolicitudControl = indicesControl["Solicitud Inquilino"]; // col AC
  var colEstadoControl    = indicesControl["Estado"];               // col J

  if (colSolicitudControl === undefined) {
    Logger.log("Error: No se encontró 'Solicitud Inquilino' en 'Control_General'."); return;
  }
  if (colEstadoControl === undefined) {
    Logger.log("Error: No se encontró 'Estado' en 'Control_General'."); return;
  }

  // ── 5. ACTUALIZAR ESTADOS EN Control_General ───────────────────────────────
  var actualizaciones = 0;

  for (var j = 1; j < datosControl.length; j++) {
    var solicitudControl = String(datosControl[j][colSolicitudControl] || "").trim();
    var estadoActual     = String(datosControl[j][colEstadoControl] || "").trim();

    if (!solicitudControl) continue;

    var nuevoEstado = mapaEstados[solicitudControl];

    if (nuevoEstado && nuevoEstado !== estadoActual &&
        !(nuevoEstado === "EN ANÁLISIS" && estadoActual === "PENDIENTE PAZ Y SALVO")) {
      hojaControl.getRange(j + 1, colEstadoControl + 1).setValue(nuevoEstado);
      actualizaciones++;
      Logger.log("  [ESTADO] Fila " + (j + 1) + " | Solicitud: " + solicitudControl +
                 " | " + estadoActual + " → " + nuevoEstado);
    }
  }

  Logger.log("✅ Sincronización de estados completada. Actualizaciones: " + actualizaciones);
}