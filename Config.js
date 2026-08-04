/**
 * ============================================================
 * CONFIG.JS — Configuración centralizada y utilidades del sistema
 * El Libertador - Ingreso de Inducciones
 *
 * Este archivo centraliza:
 *   - Verificación de cuota de email (Fase 2.2)
 *   - Sistema de logging estructurado (Fase 3.1)
 *   - Verificación de salud del sistema (Fase 3.2)
 *
 * Las constantes globales (IDs, correos, colores) permanecen en sus
 * archivos originales (Codigo.js, Notificaciones.js) para no romper
 * el orden de carga existente en GAS. Este archivo las REFERENCIA,
 * no las redefine.
 * ============================================================
 */


// ============================================================
//  VERIFICACIÓN DE CUOTA DE EMAIL (Fase 2.2)
// ============================================================

/**
 * Verifica que haya cuota suficiente para enviar emails.
 * @param {number} cantidadRequerida  Cantidad de correos a enviar.
 * @returns {boolean} true si hay cuota suficiente.
 */
function _verificarCuotaEmail_(cantidadRequerida) {
  const restante = MailApp.getRemainingDailyQuota();
  if (restante < cantidadRequerida) {
    console.warn("⚠️ Cuota de email insuficiente: quedan " + restante + ", se necesitan " + cantidadRequerida);
    _registrarEvento_("WARN", "Config.js", "Cuota de email insuficiente", "Restante: " + restante + " / Requerido: " + cantidadRequerida);
    return false;
  }
  return true;
}


// ============================================================
//  SISTEMA DE LOGGING ESTRUCTURADO (Fase 3.1)
// ============================================================

/**
 * Registra un evento en la hoja "Logs_Sistema" del libro de control.
 * Si la hoja no existe, la crea con encabezados.
 *
 * Diseñado para ser ligero: no lanza excepciones si falla (el logging
 * nunca debe romper el flujo principal).
 *
 * @param {string} nivel    "INFO" | "WARN" | "ERROR" | "CRITICAL"
 * @param {string} modulo   Archivo o función de origen (ej: "Codigo.js")
 * @param {string} mensaje  Descripción breve del evento.
 * @param {string} [detalle]  Información adicional (stack trace, IDs, etc.)
 */
function _registrarEvento_(nivel, modulo, mensaje, detalle) {
  try {
    const ss = SpreadsheetApp.openById(ID_HOJA_CONTROL);
    let hoja = ss.getSheetByName("Logs_Sistema");

    if (!hoja) {
      hoja = ss.insertSheet("Logs_Sistema");
      hoja.appendRow(["Timestamp", "Nivel", "Módulo", "Mensaje", "Detalle"]);
      hoja.getRange(1, 1, 1, 5).setFontWeight("bold").setBackground("#253150").setFontColor("white");
      hoja.setFrozenRows(1);
    }

    hoja.appendRow([
      new Date(),
      nivel || "INFO",
      modulo || "",
      mensaje || "",
      detalle || ""
    ]);
  } catch (e) {
    // El logging NUNCA debe romper el flujo principal
    console.warn("No se pudo registrar evento en Logs_Sistema: " + e.message);
  }
}


// ============================================================
//  VERIFICACIÓN DE SALUD DEL SISTEMA (Fase 3.2)
//  Trigger diario sugerido: 7:00am (antes de la jornada)
// ============================================================

/**
 * Verifica el estado general de la plataforma y envía un correo de
 * alerta SOLO si encuentra problemas. Si todo está bien, no envía nada.
 *
 * Checks:
 *  1. Triggers esperados existen
 *  2. Cuota de email disponible (umbral mínimo: 50)
 *  3. Hojas requeridas accesibles
 *  4. Lotes estancados (>7 días sin cambio en PENDIENTE RADICAR)
 */
function verificarSaludDelSistema() {
  const alertas = [];

  // ── 1. Verificar triggers esperados ──
  const triggersEsperados = [
    'enviarCorreoPazYSalvo',
    'enviarRecordatoriosPazYSalvoDiario',
    'sincronizarLoteAutomatico',
    'sincronizarEstadoDesdeAnalisis',
    'enviarReporteGestionInducciones',
    'procesarDatosMejorado'
  ];

  const triggersActuales = ScriptApp.getProjectTriggers().map(t => t.getHandlerFunction());

  triggersEsperados.forEach(nombre => {
    if (!triggersActuales.includes(nombre)) {
      alertas.push("⚠️ Trigger faltante: " + nombre);
    }
  });

  // ── 2. Cuota de email ──
  const cuotaRestante = MailApp.getRemainingDailyQuota();
  if (cuotaRestante < 50) {
    alertas.push("⚠️ Cuota de email baja: solo quedan " + cuotaRestante + " envíos hoy.");
  }

  // ── 3. Hojas requeridas accesibles ──
  try {
    const ss = SpreadsheetApp.openById(ID_HOJA_CONTROL);
    const hojasRequeridas = ["Control_General", "Hoja_Control", "CORREOS"];
    hojasRequeridas.forEach(nombre => {
      if (!ss.getSheetByName(nombre)) {
        alertas.push("❌ Hoja no encontrada en Control: " + nombre);
      }
    });
  } catch (e) {
    alertas.push("❌ No se pudo abrir el libro de Control: " + e.message);
  }

  try {
    const ssAnalisis = SpreadsheetApp.openById(ID_ARCHIVO_ANALISIS);
    if (!ssAnalisis.getSheetByName("registro analisis")) {
      alertas.push("❌ Hoja no encontrada en Análisis: registro analisis");
    }
  } catch (e) {
    alertas.push("❌ No se pudo abrir el libro de Análisis: " + e.message);
  }

  // ── 4. Lotes estancados (>7 días en estados críticos) ──
  const estadosEstancamiento = ["PENDIENTE RADICAR", "PENDIENTE ASIGNAR", "ERROR EN TERCEROS", "EN ANÁLISIS"];
  var lotesEstancadosPorEstado = {};
  try {
    const ss = SpreadsheetApp.openById(ID_HOJA_CONTROL);
    const hoja = ss.getSheetByName("Control_General");
    const data = hoja.getDataRange().getValues();
    const hoy = new Date();
    hoy.setHours(0, 0, 0, 0);

    estadosEstancamiento.forEach(function(est) { lotesEstancadosPorEstado[est] = []; });

    for (let i = 1; i < data.length; i++) {
      const idLote = String(data[i][0] || "").trim();
      const estado = String(data[i][9] || "").trim().toUpperCase();
      const fechaIngreso = data[i][2];

      if (!idLote || !estadosEstancamiento.includes(estado)) continue;
      if (!(fechaIngreso instanceof Date)) continue;

      const dias = Math.floor((hoy.getTime() - fechaIngreso.getTime()) / (1000 * 60 * 60 * 24));
      if (dias > 7) {
        lotesEstancadosPorEstado[estado].push({ id: idLote, dias: dias });
      }
    }

    const totalEstancados = Object.values(lotesEstancadosPorEstado).reduce(function(sum, arr) { return sum + arr.length; }, 0);

    if (totalEstancados > 0) {
      alertas.push("⏱️ " + totalEstancados + " lote(s) llevan >7 días estancados en estados críticos.");
    }
  } catch (e) {
    alertas.push("⚠️ Error al verificar lotes estancados: " + e.message);
  }

  // ── 4b. Enviar alerta de lotes estancados a líderes ──
  try {
    const totalEstancados = Object.values(lotesEstancadosPorEstado).reduce(function(sum, arr) { return sum + arr.length; }, 0);
    if (totalEstancados > 0) {
      var detalleHtml = "";
      estadosEstancamiento.forEach(function(est) {
        var lotes = lotesEstancadosPorEstado[est];
        if (lotes.length === 0) return;
        detalleHtml += "<b>" + est + " (" + lotes.length + ")</b><br>";
        lotes.sort(function(a, b) { return b.dias - a.dias; });
        lotes.slice(0, 10).forEach(function(l) {
          detalleHtml += "• " + l.id + " — " + l.dias + " días<br>";
        });
        if (lotes.length > 10) {
          detalleHtml += "<i>... y " + (lotes.length - 10) + " más</i><br>";
        }
        detalleHtml += "<br>";
      });

      var cuerpoLideres = _envolver_([
        _bloque_cabecera_("Lotes estancados"),
        _bloque_barra_estado_("#E65100", "&#9200;", totalEstancados + " lote(s) con más de 7 días sin avance"),
        _bloque_cuerpo_inicio_(
          "Detalle por estado",
          "Los siguientes lotes llevan más de 7 días sin cambio de estado y requieren atención:"
        ),
        _bloque_nota_(detalleHtml),
        _bloque_pie_()
      ].join(""));

      MailApp.sendEmail({
        to:       CORREOS_LIDERES.join(","),
        bcc:      BCC_AUDITORIA,
        subject:  "⏱️ Lotes estancados · Inducciones El Libertador",
        htmlBody: cuerpoLideres,
        name:     "Inducciones · El Libertador"
      });

      _registrarEvento_("WARN", "Config.js", "Alerta lotes estancados enviada a líderes", "Total: " + totalEstancados);
    }
  } catch (e) {
    alertas.push("⚠️ Error al enviar alerta de lotes estancados a líderes: " + e.message);
  }

  // ── Resultado ──
  if (alertas.length === 0) {
    Logger.log("✅ Sistema saludable. Sin alertas.");
    return;
  }

  // Enviar correo de alerta al administrador
  const cuerpoHtml = _envolver_([
    _bloque_cabecera_("Alerta de sistema"),
    _bloque_barra_estado_("#E65100", "&#9888;", alertas.length + " problema(s) detectado(s)"),
    _bloque_cuerpo_inicio_(
      "Verificación de salud",
      "Se detectaron los siguientes problemas durante la verificación automática del sistema:"
    ),
    _bloque_nota_(alertas.map(a => "• " + a).join("<br>")),
    _bloque_pie_()
  ].join(""));

  MailApp.sendEmail({
    to:       BCC_AUDITORIA,
    subject:  "🚨 Alerta de sistema · Inducciones El Libertador",
    htmlBody: cuerpoHtml,
    name:     "Inducciones · El Libertador"
  });

  _registrarEvento_("WARN", "Config.js", "Alertas de salud detectadas (" + alertas.length + ")", alertas.join(" | "));
  Logger.log("🚨 Se enviaron " + alertas.length + " alertas al administrador.");
}

/**
 * Configura el trigger de verificación de salud.
 * Ejecutar UNA VEZ manualmente.
 */
function configurarTriggerSalud() {
  ScriptApp.getProjectTriggers()
    .filter(t => t.getHandlerFunction() === 'verificarSaludDelSistema')
    .forEach(t => ScriptApp.deleteTrigger(t));

  ScriptApp.newTrigger('verificarSaludDelSistema')
    .timeBased()
    .everyDays(1)
    .atHour(7)
    .nearMinute(0)
    .create();

  Logger.log('Trigger creado: verificarSaludDelSistema — diario a las 7:00am.');
}


// ============================================================
//  FORZAR RE-AUTORIZACIÓN DE SCOPES
//  Ejecutar manualmente desde el editor de Apps Script.
//  Al correrla, Google mostrará la pantalla de consentimiento
//  con TODOS los permisos que necesita la app.
//  Después de autorizar, hacer un nuevo deploy (nueva versión).
// ============================================================

/**
 * Toca todos los servicios/scopes que usa la app para que GAS
 * solicite la pantalla de autorización completa.
 *
 * INSTRUCCIONES:
 *   1. Selecciona esta función en el desplegable del editor
 *   2. Click en "Ejecutar"
 *   3. Acepta TODOS los permisos en la ventana emergente
 *   4. Ve a Implementar → Administrar implementaciones
 *   5. Edita → Nueva versión → Implementar
 *   6. Listo, las usuarias ya no verán el error de permisos
 */
function forzarReautorizacion() {
  // Scope: https://www.googleapis.com/auth/drive
  const folder = DriveApp.getRootFolder();
  Logger.log("✅ Drive OK — Carpeta raíz: " + folder.getName());

  // Scope: https://www.googleapis.com/auth/drive (Advanced Service)
  const about = Drive.About.get({ fields: "user" });
  Logger.log("✅ Drive Advanced Service OK — Usuario: " + about.user.displayName);

  // Scope: https://www.googleapis.com/auth/spreadsheets
  const ss = SpreadsheetApp.openById(ID_HOJA_CONTROL);
  Logger.log("✅ Spreadsheets OK — Libro: " + ss.getName());

  // Scope: https://www.googleapis.com/auth/userinfo.email
  const email = Session.getActiveUser().getEmail();
  Logger.log("✅ UserInfo OK — Email: " + email);

  // Scope: https://www.googleapis.com/auth/script.send_mail + https://mail.google.com/
  const cuota = MailApp.getRemainingDailyQuota();
  Logger.log("✅ Mail OK — Cuota restante: " + cuota);

  // Scope: https://www.googleapis.com/auth/script.scriptapp
  const triggers = ScriptApp.getProjectTriggers();
  Logger.log("✅ ScriptApp OK — Triggers activos: " + triggers.length);

  // Scope: https://www.googleapis.com/auth/script.external_request
  const response = UrlFetchApp.fetch("https://www.google.com", { muteHttpExceptions: true });
  Logger.log("✅ UrlFetch OK — Status: " + response.getResponseCode());

  Logger.log("\n🎉 TODOS LOS PERMISOS AUTORIZADOS CORRECTAMENTE.");
  Logger.log("👉 Ahora ve a Implementar → Nueva versión → Implementar para que los cambios apliquen a las usuarias.");
}
