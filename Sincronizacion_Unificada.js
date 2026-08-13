/**
 * ============================================================
 * SINCRONIZACION_UNIFICADA.JS — Sincronización consolidada
 *
 * Reemplaza sincronizarLoteAutomatico y sincronizarEstadoDesdeAnalisis
 * en un solo trigger cada 10 minutos.
 *
 * Lee registro_analisis y Control_General una sola vez cada una.
 * Usa LockService con timeout de 30s para evitar conflictos con
 * procesarDatosMejorado() (Cumplimiento.js).
 *
 * Detección de conflictos concurrentes: antes de escribir un registro,
 * verifica que el estado no haya cambiado desde la lectura inicial.
 * Si cambió, omite ese registro y registra en Logs_Sistema.
 *
 * @see Requirement 11: Consolidar funciones de sincronización de estados
 * @sheets_read 2 (Control_General + registro analisis)
 * @sheets_write N (un setValues por bloque contiguo de filas modificadas)
 * ============================================================
 */

/**
 * Función unificada de sincronización.
 *
 * Parte A: Copia registros RADICADO/ERROR EN TERCEROS de Control_General
 *          a registro_analisis (lógica de sincronizarLoteAutomatico).
 * Parte B: Actualiza estados en Control_General desde registro_analisis
 *          (lógica de sincronizarEstadoDesdeAnalisis).
 *
 * Antes de cada escritura, verifica que el estado no haya sido modificado
 * concurrentemente. Si detecta conflicto, omite el registro y lo registra.
 */
function sincronizarUnificado() {

  // ── 0. LOCK — evita colisión con procesarDatosMejorado() ──────────────────
  var lock = LockService.getScriptLock();
  if (!lock.tryLock(30000)) {
    _registrarEvento_("WARN", "Sincronizacion_Unificada.js",
      "Lock no adquirido en 30s — sincronización abortada",
      "Otro proceso (probablemente procesarDatosMejorado) tiene el lock. Se reintentará en el próximo trigger (10 min).");
    Logger.log("WARN: No se pudo obtener el lock en 30s. Sincronización abortada.");
    return;
  }

  try {

  // ── 1. ABRIR LIBROS (una sola vez via SpreadsheetRegistry) ─────────────────
  var libroControl  = SpreadsheetRegistry_get(ID_HOJA_CONTROL);
  var libroAnalisis = SpreadsheetRegistry_get(ID_ARCHIVO_ANALISIS);

  var hojaControl  = libroControl.getSheetByName("Control_General");
  var hojaAnalisis = libroAnalisis.getSheetByName("registro analisis");

  if (!hojaControl || !hojaAnalisis) {
    _registrarEvento_("ERROR", "Sincronizacion_Unificada.js",
      "Hojas requeridas no encontradas",
      "Control_General: " + !!hojaControl + " | registro analisis: " + !!hojaAnalisis);
    return;
  }

  // ── 2. LECTURA ÚNICA DE AMBAS HOJAS ────────────────────────────────────────
  var _t0CG = Date.now();
  var datosControl = hojaControl.getDataRange().getValues();
  _registrarEvento_("INFO", "Sincronizacion_Unificada.js",
    "Lectura completa Control_General",
    "Filas: " + datosControl.length + " | Duración: " + (Date.now() - _t0CG) + "ms");

  var _t0RA = Date.now();
  var datosAnalisis = hojaAnalisis.getDataRange().getValues();
  _registrarEvento_("INFO", "Sincronizacion_Unificada.js",
    "Lectura completa registro analisis",
    "Filas: " + datosAnalisis.length + " | Duración: " + (Date.now() - _t0RA) + "ms");

  var indicesControl  = obtenerMapaColumnas(datosControl[0]);
  var indicesAnalisis = obtenerMapaColumnas(datosAnalisis[0]);

  // ── 3. VALIDAR COLUMNAS REQUERIDAS ─────────────────────────────────────────
  if (indicesControl["UUID_SISTEMA"] === undefined ||
      indicesControl["ID Lote"] === undefined ||
      indicesControl["Estado"] === undefined) {
    _registrarEvento_("ERROR", "Sincronizacion_Unificada.js",
      "Columnas requeridas ausentes en Control_General",
      "UUID_SISTEMA: " + (indicesControl["UUID_SISTEMA"] !== undefined) +
      " | ID Lote: " + (indicesControl["ID Lote"] !== undefined) +
      " | Estado: " + (indicesControl["Estado"] !== undefined));
    return;
  }

  if (indicesAnalisis["UUID_SISTEMA"] === undefined) {
    _registrarEvento_("ERROR", "Sincronizacion_Unificada.js",
      "Columna UUID_SISTEMA ausente en registro analisis", "");
    return;
  }

  // Columnas para Part B
  var colSolicitudAnalisis = indicesAnalisis["Solicitud Inquilino"];
  var colAsignadaA         = indicesAnalisis["ASIGNADA A\u2026"]; // "ASIGNADA A…"
  var colRegistroSAI       = indicesAnalisis["REGISTRO ANALISTA SAI"];

  // Fallback para variantes del encabezado
  if (colAsignadaA === undefined) colAsignadaA = indicesAnalisis["ASIGNADA A..."];
  if (colAsignadaA === undefined) colAsignadaA = indicesAnalisis["ASIGNADA A"];

  var colSolicitudControl = indicesControl["Solicitud Inquilino"];
  var colEstadoControl    = indicesControl["Estado"];

  var partBDisponible = (colSolicitudAnalisis !== undefined &&
                         colAsignadaA !== undefined &&
                         colRegistroSAI !== undefined &&
                         colSolicitudControl !== undefined);

  // ══════════════════════════════════════════════════════════════════════════
  // PARTE A: Copiar RADICADO/ERROR EN TERCEROS de CG → RA
  //          (lógica de sincronizarLoteAutomatico)
  // ══════════════════════════════════════════════════════════════════════════

  // Construir mapa UUID → fila en destino (registro analisis)
  var colUUIDAnalisis    = indicesAnalisis["UUID_SISTEMA"];
  var mapaUUIDDestino    = {};
  var ultimaFilaOcupada  = 1;

  for (var i = 1; i < datosAnalisis.length; i++) {
    var uid = datosAnalisis[i][colUUIDAnalisis];
    if (uid) {
      mapaUUIDDestino[uid] = i;      // índice base-0 del array
      ultimaFilaOcupada    = i + 1;  // fila física en Sheets (base-1)
    }
  }

  var filaParaNuevos = ultimaFilaOcupada + 1;

  // Mapeo de columnas Control_General → registro analisis
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

  // Agrupar filas elegibles por ID Lote (RADICADO o ERROR EN TERCEROS)
  var lotes        = {};
  var ordenDeLotes = [];

  for (var f = 1; f < datosControl.length; f++) {
    var filaCtrl = datosControl[f];
    var estado   = filaCtrl[indicesControl["Estado"]];
    var idLote   = filaCtrl[indicesControl["ID Lote"]];

    if (!idLote) continue;

    if (estado === "RADICADO" || estado === "ERROR EN TERCEROS") {
      if (!lotes[idLote]) {
        lotes[idLote] = [];
        ordenDeLotes.push(idLote);
      }
      lotes[idLote].push({
        fila           : filaCtrl,
        estado         : estado,
        indiceOriginal : f
      });
    }
  }

  // Procesar cada lote: preparar inserciones y actualizaciones
  var filasNuevasBuffer      = [];  // { filaFisica, datos[] }
  var actualizacionesPorFila = {};  // { filaFisica: { col1Based: valor } }
  var cambiosEstadoOrigen    = [];  // { fila, valor, uuid }
  var conflictosParteA       = 0;

  for (var l = 0; l < ordenDeLotes.length; l++) {
    var lotId            = ordenDeLotes[l];
    var registrosDelLote = lotes[lotId];

    for (var r = 0; r < registrosDelLote.length; r++) {
      var filaOrigen     = registrosDelLote[r].fila;
      var estadoFila     = registrosDelLote[r].estado;
      var indiceOriginal = registrosDelLote[r].indiceOriginal;
      var uuidOrigen     = filaOrigen[indicesControl["UUID_SISTEMA"]];

      if (!uuidOrigen) continue;

      // ── Detección de conflicto concurrente (Parte A) ──
      // Re-leer el estado actual de la fila justo antes de procesar
      var estadoActualCelda = String(hojaControl.getRange(indiceOriginal + 1, colEstadoControl + 1).getValue() || "").trim();
      if (estadoActualCelda !== estadoFila) {
        // Estado cambió desde la lectura batch → conflicto
        conflictosParteA++;
        _registrarEvento_("WARN", "Sincronizacion_Unificada.js",
          "Conflicto concurrente detectado (Parte A) — registro omitido",
          "UUID: " + uuidOrigen + " | Estado esperado: " + estadoFila +
          " | Estado encontrado: " + estadoActualCelda);
        continue;
      }

      var uuidYaExiste = mapaUUIDDestino[uuidOrigen] !== undefined;

      if (uuidYaExiste) {
        // CASO A: Actualizar registro existente en destino
        var indiceArr = mapaUUIDDestino[uuidOrigen];
        for (var colRad in MAPEO_COLUMNAS) {
          var colAnl = MAPEO_COLUMNAS[colRad];
          if (indicesControl[colRad] !== undefined && indicesAnalisis[colAnl] !== undefined) {
            var valorNuevo  = filaOrigen[indicesControl[colRad]];
            var valorActual = datosAnalisis[indiceArr][indicesAnalisis[colAnl]];
            if (valorActual !== valorNuevo) {
              var filaFisicaUpd = indiceArr + 1;
              if (!actualizacionesPorFila[filaFisicaUpd]) actualizacionesPorFila[filaFisicaUpd] = {};
              actualizacionesPorFila[filaFisicaUpd][indicesAnalisis[colAnl] + 1] = valorNuevo;
            }
          }
        }
      } else {
        // CASO B: Registro nuevo → insertar consecutivo al lote
        var maxCol = Object.keys(indicesAnalisis).reduce(function(max, k) {
          return Math.max(max, indicesAnalisis[k]);
        }, 0) + 1;
        var nuevaFila = [];
        for (var c = 0; c < maxCol; c++) nuevaFila.push("");

        for (var colRad2 in MAPEO_COLUMNAS) {
          var colAnl2 = MAPEO_COLUMNAS[colRad2];
          if (indicesControl[colRad2] !== undefined && indicesAnalisis[colAnl2] !== undefined) {
            var valor = filaOrigen[indicesControl[colRad2]];
            if (valor !== "" && valor !== null && valor !== undefined) {
              nuevaFila[indicesAnalisis[colAnl2]] = valor;
            }
          }
        }

        filasNuevasBuffer.push({ filaFisica: filaParaNuevos, datos: nuevaFila });
        mapaUUIDDestino[uuidOrigen] = filaParaNuevos - 1;
        filaParaNuevos++;
      }

      // Cambio de estado en origen: solo si RADICADO → PENDIENTE ASIGNAR
      if (estadoFila === "RADICADO") {
        cambiosEstadoOrigen.push({
          fila  : indiceOriginal + 1,
          valor : "PENDIENTE ASIGNAR",
          uuid  : uuidOrigen
        });
      }
    }
  }

  // ── ESCRITURA PARTE A: Inserciones en registro analisis ────────────────────
  if (filasNuevasBuffer.length > 0) {
    var primeraFilaNueva = filasNuevasBuffer[0].filaFisica;
    var matrizNuevas = filasNuevasBuffer.map(function(fb) { return fb.datos; });
    var numCols = matrizNuevas[0].length;
    hojaAnalisis.getRange(primeraFilaNueva, 1, matrizNuevas.length, numCols).setValues(matrizNuevas);
  }

  // ── ESCRITURA PARTE A: Actualizaciones en registro analisis ────────────────
  // Agrupa columnas contiguas por fila (mismo patrón que sincronizarLoteAutomatico)
  Object.keys(actualizacionesPorFila).forEach(function(filaKey) {
    var cambiosFila = actualizacionesPorFila[filaKey];
    var cols = Object.keys(cambiosFila).map(Number).sort(function(a, b) { return a - b; });
    var idx = 0;
    while (idx < cols.length) {
      var inicioCol = cols[idx];
      var valoresBloque = [cambiosFila[inicioCol]];
      var next = idx + 1;
      while (next < cols.length && cols[next] === cols[next - 1] + 1) {
        valoresBloque.push(cambiosFila[cols[next]]);
        next++;
      }
      hojaAnalisis.getRange(Number(filaKey), inicioCol, 1, valoresBloque.length).setValues([valoresBloque]);
      idx = next;
    }
  });

  // ── ESCRITURA PARTE A: FILA_REG_ANALISIS en COLA_ANALISIS ──────────────────
  if (filasNuevasBuffer.length > 0) {
    var hojaCola = libroControl.getSheetByName('COLA_ANALISIS');
    if (hojaCola && hojaCola.getLastRow() >= 2) {
      var datosCola = hojaCola.getDataRange().getValues();
      var mapaColaUUID = {};
      for (var ci = 1; ci < datosCola.length; ci++) {
        var uuidCola = String(datosCola[ci][0] || '').trim();
        if (uuidCola) mapaColaUUID[uuidCola] = ci + 1;
      }
      for (var ni = 0; ni < filasNuevasBuffer.length; ni++) {
        var filaInsertada = filasNuevasBuffer[ni].filaFisica;
        var datosNueva    = filasNuevasBuffer[ni].datos;
        var uuidNuevo     = String(datosNueva[colUUIDAnalisis] || '').trim();
        if (uuidNuevo && mapaColaUUID[uuidNuevo]) {
          hojaCola.getRange(mapaColaUUID[uuidNuevo], 8).setValue(filaInsertada);
        }
      }
    }
  }

  // ── ESCRITURA PARTE A: Cambios de estado en Control_General ────────────────
  if (cambiosEstadoOrigen.length > 0) {
    var operacionesEstado = [];
    for (var ei = 0; ei < cambiosEstadoOrigen.length; ei++) {
      operacionesEstado.push({
        fila    : cambiosEstadoOrigen[ei].fila,
        columna : colEstadoControl + 1,
        valor   : cambiosEstadoOrigen[ei].valor
      });
    }
    BatchWriter_escribir(hojaControl, operacionesEstado);
  }

  // ══════════════════════════════════════════════════════════════════════════
  // PARTE B: Actualizar estados en CG desde RA
  //          (lógica de sincronizarEstadoDesdeAnalisis)
  // ══════════════════════════════════════════════════════════════════════════

  var actualizacionesB = 0;
  var conflictosParteB = 0;
  var cambiosPorLote   = {};

  if (partBDisponible) {

    // Construir mapa de estados desde registro analisis
    // Llave: Solicitud Inquilino → Estado a asignar
    var mapaEstados = {};

    for (var ia = 1; ia < datosAnalisis.length; ia++) {
      var solicitud   = String(datosAnalisis[ia][colSolicitudAnalisis] || "").trim();
      var registroSAI = String(datosAnalisis[ia][colRegistroSAI] || "").trim();
      var asignadaA   = String(datosAnalisis[ia][colAsignadaA] || "").trim();

      if (!solicitud) continue;

      // Prioridad: REGISTRO ANALISTA SAI > ASIGNADA A…
      if (registroSAI) {
        mapaEstados[solicitud] = "TERMINADO";
      } else if (asignadaA) {
        if (mapaEstados[solicitud] !== "TERMINADO") {
          mapaEstados[solicitud] = "EN ANÁLISIS";
        }
      }
    }

    // Procesar actualizaciones de estado en Control_General
    var operacionesEstadoB = [];

    for (var j = 1; j < datosControl.length; j++) {
      var solicitudCtrl = String(datosControl[j][colSolicitudControl] || "").trim();
      var estadoActual2 = String(datosControl[j][colEstadoControl] || "").trim();

      if (!solicitudCtrl) continue;

      var nuevoEstado = mapaEstados[solicitudCtrl];

      if (nuevoEstado && nuevoEstado !== estadoActual2 &&
          !(nuevoEstado === "EN ANÁLISIS" && estadoActual2 === "PENDIENTE PAZ Y SALVO")) {

        // ── Detección de conflicto concurrente (Parte B) ──
        var estadoRealB = String(hojaControl.getRange(j + 1, colEstadoControl + 1).getValue() || "").trim();
        if (estadoRealB !== estadoActual2) {
          // El estado fue modificado por otro proceso entre la lectura y la escritura
          var uuidConflicto = String(datosControl[j][indicesControl["UUID_SISTEMA"]] || "").trim();
          conflictosParteB++;
          _registrarEvento_("WARN", "Sincronizacion_Unificada.js",
            "Conflicto concurrente detectado (Parte B) — registro omitido",
            "UUID: " + uuidConflicto + " | Estado esperado: " + estadoActual2 +
            " | Estado encontrado: " + estadoRealB);
          continue;
        }

        operacionesEstadoB.push({
          fila    : j + 1,
          columna : colEstadoControl + 1,
          valor   : nuevoEstado
        });
        actualizacionesB++;

        // Recopilar cambios para notificar al comercial
        var idLoteCtrl = String(datosControl[j][0] || "").trim();
        if (idLoteCtrl && (nuevoEstado === "EN ANÁLISIS" || nuevoEstado === "TERMINADO")) {
          if (!cambiosPorLote[idLoteCtrl]) {
            cambiosPorLote[idLoteCtrl] = { nuevoEstado: nuevoEstado, estadoAnterior: estadoActual2 };
          }
          if (nuevoEstado === "TERMINADO") {
            cambiosPorLote[idLoteCtrl].nuevoEstado = "TERMINADO";
          }
        }
      }
    }

    // Escribir cambios de estado de Parte B en batch
    if (operacionesEstadoB.length > 0) {
      BatchWriter_escribir(hojaControl, operacionesEstadoB);
    }

    // Notificar al comercial de cambios de estado
    if (actualizacionesB > 0) {
      _notificarCambiosEstadoComerciales_(cambiosPorLote);
    }
  }

  // ── RESUMEN FINAL ──────────────────────────────────────────────────────────
  var resumen = "Parte A — Nuevos: " + filasNuevasBuffer.length +
                " | Actualizados: " + Object.keys(actualizacionesPorFila).length +
                " | Estados cambiados: " + cambiosEstadoOrigen.length +
                " | Conflictos: " + conflictosParteA +
                " || Parte B — Actualizaciones: " + actualizacionesB +
                " | Conflictos: " + conflictosParteB;

  Logger.log("✅ sincronizarUnificado() completado. " + resumen);
  _registrarEvento_("INFO", "Sincronizacion_Unificada.js",
    "Sincronización unificada completada", resumen);

  } finally {
    lock.releaseLock();
  }
}


// ══════════════════════════════════════════════════════════════════════════════
// CONFIGURACIÓN DE TRIGGER UNIFICADO
// ══════════════════════════════════════════════════════════════════════════════

/**
 * Configura el trigger unificado de sincronización.
 *
 * Ejecutar una sola vez manualmente desde el editor de Apps Script.
 * 
 * Acciones:
 *  1. Elimina triggers existentes de `sincronizarLoteAutomatico` y `sincronizarEstadoDesdeAnalisis`
 *  2. Elimina cualquier trigger existente de `sincronizarUnificado` (idempotente)
 *  3. Crea un nuevo trigger time-driven que ejecuta `sincronizarUnificado` cada 10 minutos
 *
 * @see Requirement 11.6: Reemplazar dos triggers separados por un único trigger time-driven.
 */
function configurarTriggerSincronizacionUnificada() {
  var triggersEliminados = 0;
  var funcionesAEliminar = [
    "sincronizarLoteAutomatico",
    "sincronizarEstadoDesdeAnalisis",
    "sincronizarUnificado"
  ];

  // ── 1. Eliminar triggers existentes de las funciones objetivo ──────────────
  var todosLosTriggers = ScriptApp.getProjectTriggers();

  for (var i = 0; i < todosLosTriggers.length; i++) {
    var nombreHandler = todosLosTriggers[i].getHandlerFunction();
    if (funcionesAEliminar.indexOf(nombreHandler) !== -1) {
      ScriptApp.deleteTrigger(todosLosTriggers[i]);
      triggersEliminados++;
      Logger.log("🗑️ Trigger eliminado: " + nombreHandler);
    }
  }

  // ── 2. Crear nuevo trigger unificado (cada 10 minutos) ─────────────────────
  ScriptApp.newTrigger("sincronizarUnificado")
    .timeBased()
    .everyMinutes(10)
    .create();

  Logger.log("✅ Trigger configurado: sincronizarUnificado cada 10 minutos.");
  Logger.log("   Triggers eliminados: " + triggersEliminados);
  Logger.log("   Funciones deprecadas: sincronizarLoteAutomatico, sincronizarEstadoDesdeAnalisis");
}
