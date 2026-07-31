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

  // ── 4. Lotes estancados (>7 días en PENDIENTE RADICAR) ──
  try {
    const ss = SpreadsheetApp.openById(ID_HOJA_CONTROL);
    const hoja = ss.getSheetByName("Control_General");
    const data = hoja.getDataRange().getValues();
    const hoy = new Date();
    hoy.setHours(0, 0, 0, 0);
    const lotesEstancados = new Set();

    for (let i = 1; i < data.length; i++) {
      const idLote = String(data[i][0] || "").trim();
      const estado = String(data[i][9] || "").trim().toUpperCase();
      const fechaIngreso = data[i][2];

      if (!idLote || estado !== "PENDIENTE RADICAR") continue;
      if (!(fechaIngreso instanceof Date)) continue;

      const dias = Math.floor((hoy.getTime() - fechaIngreso.getTime()) / (1000 * 60 * 60 * 24));
      if (dias > 7) lotesEstancados.add(idLote);
    }

    if (lotesEstancados.size > 0) {
      alertas.push("⏱️ " + lotesEstancados.size + " lote(s) llevan >7 días en PENDIENTE RADICAR: " +
        Array.from(lotesEstancados).slice(0, 5).join(", ") +
        (lotesEstancados.size > 5 ? " (y más...)" : ""));
    }
  } catch (e) {
    alertas.push("⚠️ Error al verificar lotes estancados: " + e.message);
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
    name:     "Inducciones · Monitor de Salud"
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


// ============================================================
//  FUNCIÓN MAESTRA: RECREAR TODOS LOS TRIGGERS BAJO UNA CUENTA
//
//  Ejecutar UNA VEZ manualmente desde el editor de Apps Script
//  con la cuenta correcta. Al ejecutarla:
//    1. Elimina TODOS los triggers existentes del proyecto
//       (sin importar quién los creó)
//    2. Recrea cada trigger con la configuración correcta
//    3. Todos quedan bajo la cuenta que ejecutó esta función
//
//  ⚠️ IMPORTANTE: Solo puede borrar triggers de "Otro usuario"
//  quien tenga permiso de Editor en el proyecto. Si un trigger
//  fue creado por otra cuenta, solo se eliminará si ejecutas
//  esta función desde una cuenta con acceso de editor.
// ============================================================

function configurarTODOSLosTriggers() {

  // ── 1. ELIMINAR TODOS LOS TRIGGERS EXISTENTES ──────────────────────────────
  const triggersActuales = ScriptApp.getProjectTriggers();
  Logger.log('Triggers encontrados antes de limpiar: ' + triggersActuales.length);

  triggersActuales.forEach(function(trigger) {
    Logger.log('  Eliminando: ' + trigger.getHandlerFunction() + ' (' + trigger.getEventType() + ')');
    ScriptApp.deleteTrigger(trigger);
  });

  Logger.log('✅ Todos los triggers eliminados.\n');

  // ── 2. RECREAR TRIGGERS ────────────────────────────────────────────────────

  // ─── 2.1 Sincronización ───
  // sincronizarLoteAutomatico: cada 5 minutos (como está corriendo actualmente)
  ScriptApp.newTrigger('sincronizarLoteAutomatico')
    .timeBased()
    .everyMinutes(5)
    .create();
  Logger.log('  ✓ sincronizarLoteAutomatico — cada 5 min');

  // sincronizarEstadoDesdeAnalisis: cada 5 minutos (NO estaba configurado, se agrega)
  ScriptApp.newTrigger('sincronizarEstadoDesdeAnalisis')
    .timeBased()
    .everyMinutes(5)
    .create();
  Logger.log('  ✓ sincronizarEstadoDesdeAnalisis — cada 5 min [NUEVO]');

  // ─── 2.2 Notificaciones ───
  // enviarCorreoPazYSalvo: onEdit en hoja de cálculo Control_General
  ScriptApp.newTrigger('enviarCorreoPazYSalvo')
    .forSpreadsheet(ID_HOJA_CONTROL)
    .onEdit()
    .create();
  Logger.log('  ✓ enviarCorreoPazYSalvo — onEdit (Control_General)');

  // enviarRecordatoriosPazYSalvoDiario: diario 6:00am (como está corriendo)
  ScriptApp.newTrigger('enviarRecordatoriosPazYSalvoDiario')
    .timeBased()
    .everyDays(1)
    .atHour(6)
    .nearMinute(0)
    .create();
  Logger.log('  ✓ enviarRecordatoriosPazYSalvoDiario — diario 6:00am');

  // enviarRecordatoriosErrorTercerosDiario: diario 6:00am (NO estaba configurado, se agrega)
  ScriptApp.newTrigger('enviarRecordatoriosErrorTercerosDiario')
    .timeBased()
    .everyDays(1)
    .atHour(6)
    .nearMinute(0)
    .create();
  Logger.log('  ✓ enviarRecordatoriosErrorTercerosDiario — diario 6:00am [NUEVO]');

  // ─── 2.3 Reporte de gestión (L-V 5pm, Sáb 12:30pm) ───
  var diasEntreSemana = [
    ScriptApp.WeekDay.MONDAY,
    ScriptApp.WeekDay.TUESDAY,
    ScriptApp.WeekDay.WEDNESDAY,
    ScriptApp.WeekDay.THURSDAY,
    ScriptApp.WeekDay.FRIDAY
  ];

  diasEntreSemana.forEach(function(dia) {
    ScriptApp.newTrigger('enviarReporteGestionInducciones')
      .timeBased()
      .onWeekDay(dia)
      .atHour(17)
      .nearMinute(0)
      .create();
  });
  Logger.log('  ✓ enviarReporteGestionInducciones — L-V 5:00pm');

  ScriptApp.newTrigger('enviarReporteGestionInducciones')
    .timeBased()
    .onWeekDay(ScriptApp.WeekDay.SATURDAY)
    .atHour(12)
    .nearMinute(30)
    .create();
  Logger.log('  ✓ enviarReporteGestionInducciones — Sáb 12:30pm');

  // ─── 2.4 Cumplimiento Ley 2300 (diario 6am — la función se auto-protege cada 15 días) ───
  ScriptApp.newTrigger('procesarDatosMejorado')
    .timeBased()
    .everyDays(1)
    .atHour(6)
    .nearMinute(0)
    .create();
  Logger.log('  ✓ procesarDatosMejorado — diario 6:00am (se ejecuta realmente cada 15 días)');

  // ─── 2.5 Verificación de salud (diario 7am) ───
  ScriptApp.newTrigger('verificarSaludDelSistema')
    .timeBased()
    .everyDays(1)
    .atHour(7)
    .nearMinute(0)
    .create();
  Logger.log('  ✓ verificarSaludDelSistema — diario 7:00am [NUEVO]');

  // ── 3. RESUMEN ─────────────────────────────────────────────────────────────
  var total = ScriptApp.getProjectTriggers().length;
  var cuenta = Session.getActiveUser().getEmail();
  Logger.log('\n══════════════════════════════════════════════════');
  Logger.log('✅ TODOS LOS TRIGGERS RECREADOS EXITOSAMENTE');
  Logger.log('   Total: ' + total + ' triggers');
  Logger.log('   Cuenta propietaria: ' + cuenta);
  Logger.log('══════════════════════════════════════════════════');
  Logger.log('\n📋 Resumen:');
  Logger.log('   - sincronizarLoteAutomatico          → cada 5 min');
  Logger.log('   - sincronizarEstadoDesdeAnalisis     → cada 5 min [NUEVO]');
  Logger.log('   - enviarCorreoPazYSalvo              → onEdit');
  Logger.log('   - enviarRecordatoriosPazYSalvoDiario → diario 6am');
  Logger.log('   - enviarRecordatoriosErrorTercerosDiario → diario 6am [NUEVO]');
  Logger.log('   - enviarReporteGestionInducciones    → L-V 5pm + Sáb 12:30pm (6 triggers)');
  Logger.log('   - procesarDatosMejorado              → diario 6am');
  Logger.log('   - verificarSaludDelSistema           → diario 7am [NUEVO]');
}
