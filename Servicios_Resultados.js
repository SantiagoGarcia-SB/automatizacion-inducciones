/**
 * ============================================================
 * SERVICIOS_RESULTADOS.JS — Generación de PDFs y envío de resultados
 *
 * Orquesta la generación de PDFs de resultado (comercial e inmobiliaria)
 * desde plantillas Google Docs y el envío de correos al ejecutivo
 * comercial. Se integra con la arquitectura existente:
 *   - SpreadsheetRegistry_get (apertura única de libros)
 *   - retry() (reintentos ante fallos transitorios)
 *   - _registrarEvento_ (logging estructurado)
 *   - LockService (concurrencia)
 *   - Notificaciones.js (bloques HTML del correo)
 *   - _verificarCuotaEmail_ (cuota diaria)
 *
 * Funciones públicas:
 *   - enviarResultadosLote()       → Orquestación principal
 *   - menuEnviarResultadosLote()   → Handler del menú de Sheets
 *
 * @see Requirements 8.1, 8.2
 * ============================================================
 */


// ════════════════════════════════════════════════════════════════
//  FUNCIONES PÚBLICAS
// ════════════════════════════════════════════════════════════════

/**
 * Orquesta la generación de PDFs y envío del correo de resultados.
 * Punto de entrada principal invocado por API y menú.
 *
 * Secuencia: leerDatos → resolverContacto → resolverBackup →
 * verificarCuota → generarPDFs → construirCC → enviarCorreo →
 * registrarHistórico.
 *
 * @returns {{ok: boolean, mensaje: string}}
 * @sheets_read 3-4 (Calculo_Lote, Radicacion_Sheet, CORREOS, Historico_Envios)
 * @sheets_write 1 (Historico_Envios)
 */
function enviarResultadosLote() {
  var MODULO = "Servicios_Resultados.js";

  // 1. Adquirir lock para evitar ejecuciones concurrentes
  var lock = LockService.getScriptLock();
  if (!lock.tryLock(30000)) {
    _registrarEvento_("WARN", MODULO, "No se pudo adquirir lock", "Timeout 30s");
    return { ok: false, mensaje: "Otra ejecución en curso. Intente en unos segundos." };
  }

  try {
    // 2. Leer y validar datos del lote
    var resultado = _leerDatosLote_();
    if (!resultado.ok) return resultado;
    var datosLote = resultado.datos;

    // 3. Resolver contacto del ejecutivo comercial (busca por ID lote en Hoja_Control)
    var contacto = _resolverContactoComercial_(datosLote.idLote);
    if (!contacto.ok) return contacto;

    // 4. Resolver backup email (degradación graciosa: null si no aplica)
    var backup = _resolverBackupEmail_(contacto.ejecutivo);

    // 5. Verificar cuota de email antes de enviar
    if (!_verificarCuotaEmail_(1)) {
      _registrarEvento_("WARN", MODULO, "Cuota email insuficiente", "enviarResultadosLote");
      return { ok: false, mensaje: "Cuota de correos del día agotada." };
    }

    // 6. Generar PDFs de resultado (comercial e inmobiliaria)
    var pdfComercial = _generarPdfDesdeTemplate_(ID_PLANTILLA_COMERCIAL, datosLote, datosLote.solicitudes);
    var pdfInmobiliaria = _generarPdfDesdeTemplate_(ID_PLANTILLA_INMOBILIARIA, datosLote, datosLote.solicitudes);

    // 7. Construir CC con la misma lógica de radicación exitosa:
    //    obtenerCadenaJerarquica(ejecutivo) → Director + Admins activos
    //    + backup si aplica (deduplicado)
    var cadenaCC = obtenerCadenaJerarquica(contacto.ejecutivo);
    var listaCC = _construirListaCC_(contacto.director, backup, cadenaCC);

    // 8. Construir HTML del correo y enviar
    datosLote._nombreComercial = emailANombre(contacto.ejecutivo, "PRIMER_NOMBRE") || "Ejecutivo Comercial";
    var htmlBody = _construirHtmlResultados_(datosLote);

    MailApp.sendEmail({
      to: contacto.ejecutivo,
      cc: listaCC.join(","),
      bcc: BCC_AUDITORIA,
      subject: "\u2705 Resultados de inducci\u00F3n \u00B7 Lote " + datosLote.idLote,
      htmlBody: htmlBody,
      attachments: [pdfComercial, pdfInmobiliaria],
      replyTo: "noreply@ellibertador.co",
      name: "Inducciones \u00B7 El Libertador"
    });

    // 9. Registrar en histórico (TO + CC, sin BCC)
    var destinatarios = [contacto.ejecutivo].concat(listaCC);
    _registrarEnHistorico_(datosLote, destinatarios);

    _registrarEvento_("INFO", MODULO, "Resultados enviados exitosamente", "Lote: " + datosLote.idLote + " | Destino: " + contacto.ejecutivo);
    return { ok: true, mensaje: "Resultados enviados para lote " + datosLote.idLote };

  } catch (e) {
    _registrarEvento_("ERROR", MODULO, "Error en enviarResultadosLote", e.message);
    return { ok: false, mensaje: "No se pudo completar el envío de resultados." };
  } finally {
    lock.releaseLock();
  }
}

/**
 * Handler del menú personalizado. Valida rol via Session y ejecuta
 * enviarResultadosLote, mostrando alertas en la UI de Sheets.
 *
 * Roles autorizados: ADMIN, DIRECTOR, GERENTE, LIDER.
 */
function menuEnviarResultadosLote() {
  var ui = SpreadsheetApp.getUi();

  // Verificar rol del usuario actual
  try {
    verificarRol(['ADMIN', 'DIRECTOR', 'GERENTE', 'LIDER']);
  } catch (e) {
    ui.alert("⛔ Permisos insuficientes",
             "No tiene permisos para ejecutar esta acción. Contacte al administrador.",
             ui.ButtonSet.OK);
    return;
  }

  // Ejecutar el flujo completo
  try {
    var resultado = enviarResultadosLote();

    if (resultado && resultado.ok) {
      ui.alert("✅ Envío completado", resultado.mensaje, ui.ButtonSet.OK);
    } else {
      ui.alert("⚠️ No se pudo completar",
               resultado && resultado.mensaje ? resultado.mensaje : "La operación no pudo completarse.",
               ui.ButtonSet.OK);
    }
  } catch (e) {
    _registrarEvento_("ERROR", "Servicios_Resultados.js", "menuEnviarResultadosLote", e.message);
    ui.alert("❌ Error",
             "La operación no pudo completarse. Por favor intente nuevamente.",
             ui.ButtonSet.OK);
  }
}


// ════════════════════════════════════════════════════════════════
//  FUNCIONES INTERNAS
// ════════════════════════════════════════════════════════════════

/**
 * Muestra un alert al usuario SI se está ejecutando en contexto de UI (menú, sidebar).
 * Si se ejecuta desde el editor o un trigger, simplemente logea el mensaje.
 * @param {string} mensaje — Texto a mostrar
 */
function _alertaSegura_(mensaje) {
  try {
    _alertaSegura_(mensaje);
  } catch (e) {
    Logger.log("⚠️ " + mensaje);
  }
}

/**
 * Lee y valida los datos del lote desde Calculo_Lote.
 * Layout basado en el script original de generación de resultados.
 *
 * Celdas fijas:
 *   A2 → ID Lote (dropdown)
 *   B8 → Póliza | B9 → Inmobiliaria | B10 → Solicitudes Presentadas
 *   B12 → Valor Asegurado Presentado | B15 → Anterior Aseguradora
 *   B23 → Resultado Lote | E9 → Tasa Solicitada | E12 → Tasa Aprobada
 *   F23 → Margen Lote | G23 → Margen Global | G187 → Sucursal
 *   CX187:CX1085 → Estados | Q187:Q1085 → Valores aprobados
 *   W187:W1085 → Solicitudes | CY187:CY1085 → Detalle comercial
 *   A187:A1085 → Fechas | R187:R1085 → Nombres arrendatarios
 *
 * @returns {{ok: boolean, datos?: Object, error?: string}}
 */
function _leerDatosLote_() {
  var MODULO = "Servicios_Resultados.js";

  try {
    var ss = SpreadsheetRegistry_get(ID_ARCHIVO_ANALISIS);
    var hoja = ss.getSheetByName("Calculo Lote");

    if (!hoja) {
      _registrarEvento_("ERROR", MODULO, "Hoja Calculo Lote no encontrada", "");
      _alertaSegura_("No se encontró la hoja 'Calculo Lote' en el libro de análisis.");
      return { ok: false, error: "No se encontró la hoja 'Calculo Lote'." };
    }

    // 1. Leer ID del lote desde A2
    var idLote = retry(function() { return hoja.getRange("A2").getDisplayValue(); }).toString().trim();
    if (!idLote) {
      _registrarEvento_("ERROR", MODULO, "ID de Lote vacío", "Celda A2 vacía");
      _alertaSegura_("El código de lote (Celda A2) está vacío. Seleccione un lote antes de continuar.");
      return { ok: false, error: "El código de lote (Celda A2) está vacío." };
    }

    // 2. Leer datos fijos de la hoja
    var poliza = retry(function() { return hoja.getRange("B8").getDisplayValue(); }).toString().trim();
    var inmobiliaria = retry(function() { return hoja.getRange("B9").getDisplayValue(); }).toString().trim();
    var solicitudesPresentadas = retry(function() { return hoja.getRange("B10").getDisplayValue(); }).toString().trim();
    var valorPresentado = retry(function() { return hoja.getRange("B12").getDisplayValue(); }).toString().trim();
    var anteriorAseguradora = retry(function() { return hoja.getRange("B15").getDisplayValue(); }).toString().trim() || "No especificado";
    var resultadoLote = retry(function() { return hoja.getRange("B23").getDisplayValue(); }).toString().trim();
    var sucursal = retry(function() { return hoja.getRange("G187").getDisplayValue(); }).toString().trim();
    var tasaSolicitada = retry(function() { return hoja.getRange("E9").getDisplayValue(); }).toString().trim();
    var tasaAprobada = retry(function() { return hoja.getRange("E12").getDisplayValue(); }).toString().trim();
    var margenLote = retry(function() { return hoja.getRange("F23").getDisplayValue(); }).toString().trim();
    var margenGlobal = retry(function() { return hoja.getRange("G23").getDisplayValue(); }).toString().trim();

    // Validar campos obligatorios
    if (!poliza) {
      _alertaSegura_("El campo 'Póliza' (B8) está vacío.");
      return { ok: false, error: "El campo 'Póliza' (B8) está vacío." };
    }
    if (!inmobiliaria) {
      _alertaSegura_("El campo 'Inmobiliaria' (B9) está vacío.");
      return { ok: false, error: "El campo 'Inmobiliaria' (B9) está vacío." };
    }

    // 3. Contadores inteligentes desde CX187:CX1085 y Q187:Q1085
    var rangoEstados = retry(function() { return hoja.getRange("CX187:CX1085").getDisplayValues(); });
    var rangoValores = retry(function() { return hoja.getRange("Q187:Q1085").getValues(); });

    var contadorNegadas = 0;
    var contadorAprobadas = 0;
    var sumaValorAprobado = 0;

    for (var i = 0; i < rangoEstados.length; i++) {
      var estado = rangoEstados[i][0].toString().toUpperCase();
      if (estado.indexOf("NEGADO") > -1) {
        contadorNegadas++;
      }
      if (estado.indexOf("APROBADO") > -1 || estado.indexOf("ASEGURABLE") > -1) {
        contadorAprobadas++;
        var valorFila = parseFloat(rangoValores[i][0]) || 0;
        sumaValorAprobado += valorFila;
      }
    }

    // 4. Leer solicitudes para inyectar en tablas de los PDFs
    var rangoSolicitudes = retry(function() { return hoja.getRange("W187:W1085").getDisplayValues(); });
    var rangoDetallesCY = retry(function() { return hoja.getRange("CY187:CY1085").getDisplayValues(); });
    var rangoFechas = retry(function() { return hoja.getRange("A187:A1085").getDisplayValues(); });
    var rangoNombres = retry(function() { return hoja.getRange("R187:R1085").getDisplayValues(); });

    var solicitudes = [];
    for (var s = 0; s < rangoSolicitudes.length; s++) {
      var nombreSol = rangoSolicitudes[s][0].toString().trim();
      if (!nombreSol) continue;
      solicitudes.push({
        solicitud: nombreSol,
        detalleCY: rangoDetallesCY[s][0].toString().trim(),
        fecha: rangoFechas[s][0].toString().trim(),
        nombre: rangoNombres[s][0].toString().trim(),
        estado: rangoEstados[s][0].toString().trim()
      });
    }

    // 5. Formatear valor aprobado
    var valorAprobadoFormateado = "$ " + sumaValorAprobado.toLocaleString("es-CO", { minimumFractionDigits: 0 });

    // 6. Fecha de emisión
    var fechaNum = Utilities.formatDate(new Date(), "GMT-5", "dd-MM-yyyy").split("-");
    var meses = ["enero", "febrero", "marzo", "abril", "mayo", "junio", "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre"];
    var fechaHoyTexto = parseInt(fechaNum[0], 10) + " de " + meses[parseInt(fechaNum[1], 10) - 1] + " de " + fechaNum[2];

    // Construir objeto DatosLote
    var datosLote = {
      idLote: idLote,
      poliza: poliza,
      inmobiliaria: inmobiliaria,
      sucursal: sucursal,
      solicitudesPresentadas: solicitudesPresentadas,
      valorPresentado: valorPresentado,
      cantAprobadas: contadorAprobadas,
      cantNegadas: contadorNegadas,
      valorAprobado: valorAprobadoFormateado,
      tasaSolicitada: tasaSolicitada,
      tasaAprobada: tasaAprobada,
      resultadoFinal: resultadoLote,
      margenLote: margenLote,
      margenGlobal: margenGlobal,
      aseguradoraAnterior: anteriorAseguradora,
      fechaEmision: fechaHoyTexto,
      solicitudes: solicitudes
    };

    return { ok: true, datos: datosLote };

  } catch (e) {
    _registrarEvento_("ERROR", MODULO, "Error leyendo Calculo Lote", e.message);
    _alertaSegura_("Error al leer los datos del lote: " + e.message);
    return { ok: false, error: "Error al leer los datos del lote: " + e.message };
  }
}

/**
 * Resuelve el email del ejecutivo y director comercial.
 * Lógica idéntica al script antiguo:
 *   1. Busca el ID del lote en Hoja_Control (columna F) → obtiene email del comercial (columna B)
 *   2. Con ese email, busca en hoja CORREOS (columna B = ejecutivo) → obtiene director (columna A)
 *
 * @param {string} idLote — ID del lote a buscar
 * @returns {{ok: boolean, ejecutivo?: string, director?: string, datosCorrNos?: Array, error?: string}}
 */
function _resolverContactoComercial_(idLote) {
  var MODULO = "Servicios_Resultados.js";

  try {
    var ssRad = SpreadsheetRegistry_get(ID_RADICACION_SHEET);

    // 1. Buscar en Hoja_Control: columna F (idx 5) = ID lote, columna B (idx 1) = email comercial
    var hojaControl = ssRad.getSheetByName("Hoja_Control");
    if (!hojaControl) {
      _registrarEvento_("ERROR", MODULO, "Hoja_Control no encontrada", "");
      return { ok: false, error: "No se encontró la hoja 'Hoja_Control'." };
    }

    var datosControl = retry(function() { return hojaControl.getDataRange().getValues(); });
    var correoComercial = null;

    for (var i = 1; i < datosControl.length; i++) {
      var idEnHoja = (datosControl[i][5] || "").toString().trim(); // Columna F (idx 5)
      if (idEnHoja === idLote) {
        correoComercial = (datosControl[i][1] || "").toString().trim(); // Columna B (idx 1)
        break;
      }
    }

    if (!correoComercial) {
      _registrarEvento_("ERROR", MODULO, "Lote no encontrado en Hoja_Control", "ID: " + idLote);
      return { ok: false, error: "El Lote " + idLote + " no se encontró en Hoja_Control." };
    }

    if (!_esEmailValido_(correoComercial)) {
      _registrarEvento_("ERROR", MODULO, "Email comercial inválido en Hoja_Control", "ID: " + idLote + " | Email: " + correoComercial);
      return { ok: false, error: "El email del comercial no tiene formato válido: " + correoComercial };
    }

    // 2. Buscar en hoja CORREOS: columna B (idx 1) = ejecutivo → columna A (idx 0) = director
    var hojaCorreos = ssRad.getSheetByName("CORREOS");
    var correoEjecutivo = correoComercial; // Por defecto, el ejecutivo es el comercial encontrado
    var correoDirector = null;
    var datosCorrNos = [];

    if (hojaCorreos) {
      datosCorrNos = retry(function() { return hojaCorreos.getDataRange().getValues(); });

      for (var j = 1; j < datosCorrNos.length; j++) {
        var ejecutivoEnHoja = (datosCorrNos[j][1] || "").toString().trim(); // Columna B (idx 1)
        if (ejecutivoEnHoja.toLowerCase() === correoComercial.toLowerCase()) {
          correoEjecutivo = ejecutivoEnHoja;
          correoDirector = (datosCorrNos[j][0] || "").toString().trim(); // Columna A (idx 0)
          break;
        }
      }

      if (correoDirector && !_esEmailValido_(correoDirector)) {
        _registrarEvento_("WARN", MODULO, "Director email inválido", "Director: " + correoDirector + " | Ejecutivo: " + correoEjecutivo);
        correoDirector = null;
      }
    } else {
      _registrarEvento_("WARN", MODULO, "Hoja CORREOS no encontrada", "Se continúa sin director");
    }

    return { ok: true, ejecutivo: correoEjecutivo, director: correoDirector, datosCorrNos: datosCorrNos };

  } catch (e) {
    _registrarEvento_("ERROR", MODULO, "Error accediendo a Hoja_Control/CORREOS", e.message);
    return { ok: false, error: "No se pudo acceder a la hoja de radicación: " + e.message };
  }
}

/**
 * Resuelve el correo de backup desde la hoja CORREOS en Radicacion_Sheet.
 * Verifica checkbox de activación (columna D) y formato del email (columna C).
 *
 * Degradación graciosa: cualquier error retorna null + log WARN sin abortar flujo.
 *
 * @param {string} emailEjecutivo — Email del ejecutivo comercial resuelto
 * @returns {string|null} Email de backup válido o null si no aplica.
 */
function _resolverBackupEmail_(emailEjecutivo) {
  var MODULO = "Servicios_Resultados._resolverBackupEmail_";

  try {
    var ssRad = SpreadsheetRegistry_get(ID_RADICACION_SHEET);
    var hojaCorreos = ssRad.getSheetByName("CORREOS");

    if (!hojaCorreos) {
      _registrarEvento_("WARN", MODULO, "Hoja CORREOS no accesible", "No se encontró la hoja CORREOS en Radicacion_Sheet");
      return null;
    }

    // Leer todos los datos de la hoja CORREOS
    var ultimaFila = retry(function() { return hojaCorreos.getLastRow(); });

    if (ultimaFila < 2) {
      // Solo encabezado o vacía, no hay datos
      return null;
    }

    var datos = retry(function() {
      return hojaCorreos.getRange(2, 1, ultimaFila - 1, 4).getValues();
    });

    // Buscar la fila donde el email del ejecutivo coincida (columnas A o B)
    var emailBuscado = String(emailEjecutivo || "").trim().toLowerCase();

    for (var i = 0; i < datos.length; i++) {
      var colA = String(datos[i][0] || "").trim().toLowerCase();
      var colB = String(datos[i][1] || "").trim().toLowerCase();

      if (colA === emailBuscado || colB === emailBuscado) {
        // Fila encontrada — verificar checkbox de activación (columna D, índice 3)
        var checkboxActivo = datos[i][3];

        if (checkboxActivo !== true) {
          // Checkbox no activado — omitir backup
          return null;
        }

        // Checkbox activo — leer email de backup (columna C, índice 2)
        var backupEmail = String(datos[i][2] || "").trim();

        if (!_esEmailValido_(backupEmail)) {
          _registrarEvento_("WARN", MODULO, "Backup email formato inválido",
            "El email de backup '" + backupEmail + "' para ejecutivo '" + emailEjecutivo + "' no cumple formato válido");
          return null;
        }

        return backupEmail;
      }
    }

    // No se encontró la fila del ejecutivo en CORREOS — continuar sin backup
    return null;

  } catch (e) {
    _registrarEvento_("WARN", MODULO, "Error accediendo hoja CORREOS", e.message);
    return null;
  }
}

/**
 * Genera un PDF a partir de una plantilla Google Docs.
 * Pipeline: copiar → reemplazar placeholders → inyectar tabla → exportar → eliminar copia.
 *
 * @param {string} idPlantilla — ID del Google Doc plantilla
 * @param {Object} datosLote — Mapa placeholder → valor
 * @param {Array} solicitudes — [{arrendatario, direccion, estado, observacion}]
 * @returns {GoogleAppsScript.Base.Blob} Blob del PDF generado
 * @throws {Error} Si algún paso falla (la copia temporal se limpia antes de lanzar)
 */
function _generarPdfDesdeTemplate_(idPlantilla, datosLote, solicitudes) {
  var MODULO = "Servicios_Resultados.js";
  var copiaId = null;

  try {
    // 1. Copiar plantilla envuelto en retry() dentro de la carpeta destino
    var carpeta = DriveApp.getFolderById(ID_CARPETA_DESTINO);
    var archivo = retry(function() {
      return DriveApp.getFileById(idPlantilla).makeCopy("Resultado_" + datosLote.idLote + "_temp", carpeta);
    });
    copiaId = archivo.getId();

    // 2. Abrir copia como Google Doc
    var doc = DocumentApp.openById(copiaId);
    var body = doc.getBody();

    // 3. Reemplazar placeholders (nombres idénticos a los de las plantillas reales)
    var mapa = {
      // Comunes a ambas plantillas
      "{{FechaEmision}}":           datosLote.fechaEmision || "",
      "{{Fecha Emision}}":          datosLote.fechaEmision || "",
      "{{Poliza}}":                 datosLote.poliza || "",
      "{{Inmobiliaria}}":           datosLote.inmobiliaria || "",
      "{{Sucursal}}":               datosLote.sucursal || "",
      "{{CodigoLote}}":             datosLote.idLote || "",
      "{{SolicitudesPresentadas}}": datosLote.solicitudesPresentadas || "",
      "{{SolicitudesAprobadas}}":   String(datosLote.cantAprobadas || 0),
      "{{SolicitudesNegadas}}":     String(datosLote.cantNegadas || 0),
      "{{TasaSolicitada}}":         datosLote.tasaSolicitada || "",
      "{{TasaAprobada}}":           datosLote.tasaAprobada || "",
      "{{ResultadoLote}}":          datosLote.resultadoFinal || "",
      "{{AseguradoraAnterior}}":    datosLote.aseguradoraAnterior || "",
      // Solo inmobiliaria
      "{{ValorPresentado}}":        datosLote.valorPresentado || "",
      "{{Valor Presentado}}":       datosLote.valorPresentado || "",
      "{{ValorAprobado}}":          datosLote.valorAprobado || "",
      // Solo comercial
      "{{MargenLote}}":             datosLote.margenLote || "",
      "{{MargenGlobal}}":           datosLote.margenGlobal || ""
    };
    _reemplazarPlaceholders_(body, mapa);

    // 4. Inyectar datos en la tabla existente de la plantilla
    //    Busca la tabla cuyo primer encabezado contenga "SOLICITUD" (comercial) o "FECHA" (inmobiliaria)
    _inyectarDatosEnTablaExistente_(body, datosLote, solicitudes, idPlantilla);

    // 4b. Aplicar colores a palabras clave (NEGADO=rojo, APROBADO/ASEGURABLE=verde)
    _aplicarColorGlobal_(body, "NEGADO", "#FF0000");
    _aplicarColorGlobal_(body, "APROBADO", "#008000");
    _aplicarColorGlobal_(body, "ASEGURABLE", "#008000");

    // 5. Guardar y cerrar el documento
    doc.saveAndClose();

    // 6. Exportar como PDF via URL fetch con token OAuth
    var url = "https://docs.google.com/document/d/" + copiaId + "/export?format=pdf";
    var token = ScriptApp.getOAuthToken();
    var response = retry(function() {
      return UrlFetchApp.fetch(url, {
        headers: { Authorization: "Bearer " + token },
        muteHttpExceptions: true
      });
    });

    if (response.getResponseCode() !== 200) {
      throw new Error("Error al exportar PDF: HTTP " + response.getResponseCode());
    }

    var blob = response.getBlob();

    // Nombrar el PDF según la plantilla (igual que el script antiguo)
    var inmobLimpia = (datosLote.inmobiliaria || "").replace(/[^a-zA-Z0-9 ]/g, "").trim().replace(/ /g, "_");
    var loteLimpio = (datosLote.idLote || "").replace(/\//g, "-");
    var esComercial = (idPlantilla === ID_PLANTILLA_COMERCIAL);
    var prefijo = esComercial ? "Resultado_Comercial_" : "Resultado_Inmobiliaria_";
    var nombrePdf = prefijo + inmobLimpia + "_Lote-" + loteLimpio + ".pdf";
    blob.setName(nombrePdf);

    return blob;

  } catch (e) {
    _registrarEvento_("ERROR", MODULO, "_generarPdfDesdeTemplate_", "Error: " + e.message + " | Plantilla: " + idPlantilla);
    throw e;
  } finally {
    // 7. Cleanup: eliminar copia temporal (enviar a papelera)
    if (copiaId) {
      try {
        retry(function() {
          DriveApp.getFileById(copiaId).setTrashed(true);
        });
      } catch (cleanupErr) {
        _registrarEvento_("WARN", MODULO, "No se pudo eliminar copia temporal", "ID: " + copiaId + " | Error: " + cleanupErr.message);
      }
    }
  }
}

/**
 * Reemplaza todos los placeholders {{Variable}} en un Google Doc.
 * Si un placeholder no tiene valor en el mapa, se reemplaza con cadena vacía.
 *
 * Las claves del mapa incluyen los delimitadores {{}} (ej: "{{IdLote}}").
 * Se escapan los caracteres { y } para usarlos como patrón regex en replaceText.
 *
 * @param {GoogleAppsScript.Document.Body} body — Body del documento Google Docs
 * @param {Object} mapa — {"{{Variable}}": valor} donde las claves incluyen las llaves
 */
function _reemplazarPlaceholders_(body, mapa) {
  if (!body || !mapa) return;

  var claves = Object.keys(mapa);

  for (var i = 0; i < claves.length; i++) {
    var clave = claves[i];
    var valor = mapa[clave];

    // Si el valor es null, undefined o vacío, reemplazar con cadena vacía
    var valorStr = (valor === null || valor === undefined || valor === "") ? "" : String(valor);

    // Escapar caracteres especiales de regex: { → \\{ y } → \\}
    var patron = clave.replace(/\{/g, "\\{").replace(/\}/g, "\\}");

    body.replaceText(patron, valorStr);
  }
}

/**
 * Inyecta una tabla con las solicitudes al final del body del documento.
 * Aplica colores: NEGADO → rojo (#BD0F14), APROBADO/ASEGURABLE → verde (#3B6D11).
 * Otros estados no llevan color de fondo.
 *
 * @param {GoogleAppsScript.Document.Body} body — Body del documento Google Docs
 * @param {Array} solicitudes — [{arrendatario, direccion, estado, observacion}]
 */
function _inyectarTablaResultados_(body, solicitudes) {
  if (!solicitudes || solicitudes.length === 0) return;

  var NUM_COLS = 4;
  var COLOR_NEGADO = "#BD0F14";
  var COLOR_APROBADO = "#3B6D11";
  var COLOR_TEXTO_BLANCO = "#FFFFFF";

  // Crear tabla al final del body
  var table = body.appendTable();

  // Fila de encabezados
  var headerRow = table.appendTableRow();
  var encabezados = ["Arrendatario", "Dirección", "Estado", "Observación"];
  for (var h = 0; h < encabezados.length; h++) {
    var headerCell = headerRow.appendTableCell(encabezados[h]);
    headerCell.setBackgroundColor("#253150");
    headerCell.editAsText().setForegroundColor(COLOR_TEXTO_BLANCO);
    headerCell.editAsText().setBold(true);
  }

  // Filas de datos con colores según estado
  for (var i = 0; i < solicitudes.length; i++) {
    var sol = solicitudes[i];
    var row = table.appendTableRow();
    row.appendTableCell(sol.arrendatario || "");
    row.appendTableCell(sol.direccion || "");
    row.appendTableCell(sol.estado || "");
    row.appendTableCell(sol.observacion || "");

    // Determinar color según estado (case-insensitive)
    var estado = (sol.estado || "").toUpperCase().trim();
    var colorFondo = null;

    if (estado === "NEGADO") {
      colorFondo = COLOR_NEGADO;
    } else if (estado === "APROBADO" || estado === "ASEGURABLE") {
      colorFondo = COLOR_APROBADO;
    }

    // Aplicar color de fondo y texto blanco a la fila si corresponde
    if (colorFondo) {
      for (var c = 0; c < NUM_COLS; c++) {
        var cell = row.getCell(c);
        cell.setBackgroundColor(colorFondo);
        cell.editAsText().setForegroundColor(COLOR_TEXTO_BLANCO);
      }
    }
  }
}

/**
 * Inyecta datos de solicitudes en la tabla existente de la plantilla.
 * Lógica idéntica al script antiguo:
 *   - Plantilla COMERCIAL: busca tabla con primera celda "SOLICITUD" → inyecta [solicitud, detalleCY]
 *   - Plantilla INMOBILIARIA: busca tabla con primera celda "FECHA" → inyecta [fecha, poliza, nombre, solicitud, estado]
 *
 * @param {GoogleAppsScript.Document.Body} body
 * @param {Object} datosLote
 * @param {Array} solicitudes — [{solicitud, detalleCY, fecha, nombre, estado}]
 * @param {string} idPlantilla — Para distinguir comercial vs inmobiliaria
 */
function _inyectarDatosEnTablaExistente_(body, datosLote, solicitudes, idPlantilla) {
  if (!solicitudes || solicitudes.length === 0) return;

  var tablas = body.getTables();
  var esComercial = (idPlantilla === ID_PLANTILLA_COMERCIAL);

  // Buscar la tabla correcta por el texto de su primera celda
  var tablaDestino = null;
  for (var i = 0; i < tablas.length; i++) {
    var primeraCelda = tablas[i].getCell(0, 0).getText().trim().toUpperCase();
    if (esComercial && primeraCelda.indexOf("SOLICITUD") > -1) {
      tablaDestino = tablas[i];
      break;
    }
    if (!esComercial && primeraCelda.indexOf("FECHA") > -1) {
      tablaDestino = tablas[i];
      break;
    }
  }

  if (!tablaDestino) return;

  // Construir filas de datos según el tipo de plantilla
  var datosParaTabla = [];
  for (var j = 0; j < solicitudes.length; j++) {
    var sol = solicitudes[j];
    if (esComercial) {
      datosParaTabla.push([sol.solicitud || "", sol.detalleCY || ""]);
    } else {
      datosParaTabla.push([
        sol.fecha || "",
        datosLote.poliza || "",
        sol.nombre || "",
        sol.solicitud || "",
        sol.estado || ""
      ]);
    }
  }

  // Inyectar filas en la tabla (misma lógica que inyectarDatosEnTabla del script antiguo)
  for (var k = 0; k < datosParaTabla.length; k++) {
    var fila = datosParaTabla[k];
    var nuevaFila = tablaDestino.appendTableRow();
    for (var m = 0; m < fila.length; m++) {
      var texto = fila[m] ? fila[m].toString().trim() : "";
      var cell = nuevaFila.appendTableCell(texto);
      var par = cell.getChild(0).asParagraph();
      par.setAlignment(DocumentApp.HorizontalAlignment.CENTER);
      cell.setVerticalAlignment(DocumentApp.VerticalAlignment.CENTER);
      par.setFontSize(9);
    }
  }

  // Eliminar la fila placeholder (fila 1, justo después del encabezado)
  if (tablaDestino.getNumRows() > 1) {
    tablaDestino.removeRow(1);
  }
}

/**
 * Aplica color y negrita a todas las ocurrencias de una palabra en el documento.
 * Idéntica a aplicarColorGlobal del script antiguo.
 *
 * @param {GoogleAppsScript.Document.Body} body
 * @param {string} palabra — Texto a buscar
 * @param {string} color — Color hex a aplicar
 */
function _aplicarColorGlobal_(body, palabra, color) {
  var found = body.findText(palabra);
  while (found !== null) {
    var element = found.getElement().asText();
    var start = found.getStartOffset();
    var end = found.getEndOffsetInclusive();
    element.setBold(start, end, true);
    element.setForegroundColor(start, end, color);
    found = body.findText(palabra, found);
  }
}

/**
 * Inyecta datos en la tabla existente de la plantilla Google Docs.
 * Lógica idéntica al script antiguo:
 *   - PDF Comercial: busca tabla con encabezado "SOLICITUD" → inyecta [solicitud, detalleCY]
 *   - PDF Inmobiliaria: busca tabla con encabezado "FECHA" → inyecta [fecha, poliza, nombre, solicitud, estado]
 * Luego aplica colores a texto (NEGADO=rojo, APROBADO/ASEGURABLE=verde) con findText.
 *
 * @param {GoogleAppsScript.Document.Body} body
 * @param {Object} datosLote
 * @param {Array} solicitudes — [{solicitud, detalleCY, fecha, nombre, estado}]
 * @param {string} idPlantilla — Para distinguir comercial vs inmobiliaria
 */
function _inyectarDatosEnTablaExistente_(body, datosLote, solicitudes, idPlantilla) {
  if (!solicitudes || solicitudes.length === 0) return;

  var tablas = body.getTables();
  var esComercial = (idPlantilla === ID_PLANTILLA_COMERCIAL);

  // Buscar la tabla correcta por encabezado
  var tablaDetalle = null;
  var encabezadoBuscado = esComercial ? "SOLICITUD" : "FECHA";

  for (var i = 0; i < tablas.length; i++) {
    try {
      var textoEncabezado = tablas[i].getCell(0, 0).getText().trim().toUpperCase();
      if (textoEncabezado === encabezadoBuscado) {
        tablaDetalle = tablas[i];
        break;
      }
    } catch (e) { /* tabla sin celdas, ignorar */ }
  }

  // Fallback: si no la encuentra por nombre, usar la última tabla para inmobiliaria (índice 2+)
  if (!tablaDetalle && !esComercial && tablas.length >= 3) {
    tablaDetalle = tablas[2];
  }

  if (tablaDetalle) {
    // Inyectar filas según tipo de plantilla
    for (var s = 0; s < solicitudes.length; s++) {
      var sol = solicitudes[s];
      var nuevaFila = tablaDetalle.appendTableRow();
      var datosColumnas;

      if (esComercial) {
        datosColumnas = [sol.solicitud || "", sol.detalleCY || ""];
      } else {
        datosColumnas = [sol.fecha || "", datosLote.poliza || "", sol.nombre || "", sol.solicitud || "", sol.estado || ""];
      }

      for (var c = 0; c < datosColumnas.length; c++) {
        var celda = nuevaFila.appendTableCell(datosColumnas[c]);
        var par = celda.getChild(0).asParagraph();
        par.setAlignment(DocumentApp.HorizontalAlignment.CENTER);
        celda.setVerticalAlignment(DocumentApp.VerticalAlignment.CENTER);
        par.editAsText().setFontSize(9);
      }
    }

    // Eliminar la fila de ejemplo (fila 1, después del encabezado) si la plantilla tiene una fila vacía
    if (tablaDetalle.getNumRows() > 1) {
      tablaDetalle.removeRow(1);
    }
  }

  // Aplicar colores globales al texto (igual que el script antiguo)
  _aplicarColorGlobal_(body, "NEGADO", "#FF0000");
  _aplicarColorGlobal_(body, "APROBADO", "#008000");
  _aplicarColorGlobal_(body, "ASEGURABLE", "#008000");
}

/**
 * Aplica formato bold + color a todas las ocurrencias de una palabra en el body.
 * Réplica exacta de la función del script antiguo.
 *
 * @param {GoogleAppsScript.Document.Body} body
 * @param {string} palabra — Texto a buscar
 * @param {string} color — Color hex a aplicar
 */
function _aplicarColorGlobal_(body, palabra, color) {
  var found = body.findText(palabra);
  while (found !== null) {
    var element = found.getElement().asText();
    var start = found.getStartOffset();
    var end = found.getEndOffsetInclusive();
    element.setBold(start, end, true);
    element.setForegroundColor(start, end, color);
    found = body.findText(palabra, found);
  }
}

/**
 * Construye la lista de CC deduplicada y filtrada.
 * Concatena director, backup y CC_Fijo; elimina vacíos, duplicados
 * y emails inválidos según _esEmailValido_.
 *
 * @param {string|null} director — Email del director comercial (puede ser null)
 * @param {string|null} backup — Email de backup (puede ser null)
 * @param {string[]} ccFijo — Lista fija de correos CC (CC_FIJO_RESULTADOS)
 * @returns {string[]} Lista de emails únicos válidos para CC.
 */
function _construirListaCC_(director, backup, ccFijo) {
  var todos = [];

  // Agregar director si existe
  if (director) todos.push(director);

  // Agregar backup si existe
  if (backup) todos.push(backup);

  // Agregar todos los correos del CC fijo
  if (ccFijo && ccFijo.length) {
    for (var i = 0; i < ccFijo.length; i++) {
      if (ccFijo[i]) todos.push(ccFijo[i]);
    }
  }

  // Deduplicar (case-insensitive) y filtrar emails inválidos
  var vistos = {};
  var resultado = [];

  for (var j = 0; j < todos.length; j++) {
    var email = String(todos[j] || "").trim();
    var emailLower = email.toLowerCase();

    if (!email || vistos[emailLower] || !_esEmailValido_(email)) continue;

    vistos[emailLower] = true;
    resultado.push(email);
  }

  return resultado;
}

/**
 * Construye el HTML del correo de resultados usando bloques de Notificaciones.js.
 * Utiliza: _envolver_, _bloque_cabecera_, _bloque_barra_estado_,
 * _bloque_cuerpo_inicio_, _bloque_chips_, _bloque_nota_, _bloque_pie_.
 *
 * Validates: Requirements 6.4, 8.7
 *
 * @param {Object} datosLote — Datos del lote para interpolar en el correo
 * @returns {string} HTML completo del correo.
 */
function _construirHtmlResultados_(datosLote) {
  var nombreComercial = datosLote._nombreComercial || "Ejecutivo Comercial";

  var bloques = [
    _bloque_cabecera_("Resultados de Inducci&oacute;n"),

    _bloque_barra_estado_("#3B6D11", "&#10003;", "An&aacute;lisis finalizado &middot; Resultados disponibles"),

    _bloque_cuerpo_inicio_(
      "Hola, " + nombreComercial,
      "El an&aacute;lisis de tu lote de inducciones ha sido completado. " +
      "Adjunto a este correo encontrar&aacute;s los documentos con el detalle de los resultados. " +
      "Recuerda revisar cu&aacute;l documento puedes compartir con la inmobiliaria."
    ),

    _bloque_chips_([
      { label: "ID de Lote",               valor: datosLote.idLote || "",                         colorVal: _C_ROJO  },
      { label: "P&oacute;liza",            valor: datosLote.poliza || ""                                             },
      { label: "Inmobiliaria",             valor: datosLote.inmobiliaria || ""                                       },
      { label: "Resultado del lote",       valor: datosLote.resultadoFinal || "",                 colorVal: _C_ROJO  },
      { label: "Solicitudes aprobadas",    valor: String(datosLote.cantAprobadas || 0),           colorVal: "#3B6D11" },
      { label: "Solicitudes negadas",      valor: String(datosLote.cantNegadas || 0),             colorVal: _C_ROJO  }
    ]),

    _bloque_nota_(
      '<strong style="color:#253150;">Importante:</strong> ' +
      'El documento de <em>Resultado Comercial</em> es de uso exclusivo interno y ' +
      '<strong style="color:#253150;">no debe ser compartido con la inmobiliaria</strong>. ' +
      'El documento de <em>Resultado Inmobiliaria</em> s&iacute; puede ser remitido ' +
      'directamente para su gesti&oacute;n. Para cualquier consulta, responde a este correo ' +
      'usando <strong style="color:#253150;">&ldquo;Responder a todos&rdquo;</strong>.'
    ),

    _bloque_pie_()
  ].join("");

  return _envolver_(bloques);
}

/**
 * Registra el envío en Historico_Envios.
 * Formato de fila: fecha (dd/MM/yyyy HH:mm:ss, America/Bogota), idLote,
 * inmobiliaria, poliza, sucursal, cantAprobadas, cantNegadas,
 * resultadoFinal, destinatarios (comma-joined TO+CC).
 *
 * CRÍTICO: Esta función NUNCA debe abortar el flujo principal.
 * Cualquier error se registra en Logs_Sistema y se retorna silenciosamente.
 *
 * @param {Object} datosLote — Datos completos del lote procesado
 * @param {string[]} destinatarios — TO + CC (sin BCC)
 */
function _registrarEnHistorico_(datosLote, destinatarios) {
  var MODULO = "Servicios_Resultados._registrarEnHistorico_";

  try {
    var ss = SpreadsheetRegistry_get(ID_ARCHIVO_ANALISIS);
    var hoja = ss.getSheetByName("Historico_Envios");

    if (!hoja) {
      _registrarEvento_("ERROR", MODULO, "Hoja Historico_Envios no encontrada",
        "No existe la hoja 'Historico_Envios' en el libro de análisis. El correo ya fue enviado.");
      return;
    }

    // Formatear fecha en zona horaria de Colombia
    var fechaEmision = datosLote.fechaEmision || Utilities.formatDate(new Date(), "America/Bogota", "dd/MM/yyyy HH:mm:ss");

    // Construir lista de destinatarios como cadena separada por coma
    var listaDestinatarios = "";
    if (destinatarios && destinatarios.length > 0) {
      listaDestinatarios = destinatarios.join(", ");
    }

    // Construir fila con 16 columnas (mismo orden que el script antiguo)
    var fila = [
      fechaEmision,                            // Fecha de Emisión
      datosLote.poliza || "",                  // Póliza
      datosLote.inmobiliaria || "",            // Nombre de Inmobiliaria
      datosLote.sucursal || "",                // Sucursal
      datosLote.solicitudesPresentadas || "",  // Cantidad Solicitudes Presentadas
      datosLote.tasaSolicitada || "",          // Tasa Inducción Solicitada (IVA Incluido)
      datosLote.valorPresentado || "",         // Valor Asegurado Presentado
      String(datosLote.cantAprobadas || 0),    // Cantidad Solicitudes Aprobadas
      String(datosLote.cantNegadas || 0),      // Cantidad Solicitudes Negadas
      datosLote.valorAprobado || "",           // Valor Asegurado Aprobado
      datosLote.tasaAprobada || "",            // Tasa Inducción Aprobada (IVA Incluido)
      datosLote.idLote || "",                  // Código Lote
      datosLote.resultadoFinal || "",          // Resultado Final Lote
      datosLote.margenLote || "",              // Margen Lote
      datosLote.margenGlobal || "",            // Margen Global
      datosLote.aseguradoraAnterior || ""      // Aseguradora Anterior
    ];

    // Append envuelto en retry para manejar fallos transitorios
    retry(function() {
      hoja.appendRow(fila);
    });

  } catch (e) {
    // Error al registrar en histórico: loguear pero NO lanzar excepción.
    // El correo ya fue enviado exitosamente — no abortar el flujo.
    _registrarEvento_("ERROR", MODULO, "No se pudo registrar en Historico_Envios",
      "Lote: " + (datosLote ? datosLote.idLote : "N/A") + " | Error: " + e.message);
  }
}

/**
 * Valida que un string tenga formato mínimo de email.
 * Verifica que contenga exactamente un "@" y al menos un "." en el dominio.
 *
 * @param {string} email — Cadena a validar
 * @returns {boolean} true si cumple el formato mínimo de email.
 */
function _esEmailValido_(email) {
  if (typeof email !== "string" || email.length === 0) {
    return false;
  }

  var partes = email.split("@");

  // Debe haber exactamente un "@" → split produce exactamente 2 partes
  if (partes.length !== 2) {
    return false;
  }

  var local = partes[0];
  var dominio = partes[1];

  // La parte local y el dominio no deben estar vacíos
  if (local.length === 0 || dominio.length === 0) {
    return false;
  }

  // El dominio debe contener al menos un "."
  if (dominio.indexOf(".") === -1) {
    return false;
  }

  return true;
}
