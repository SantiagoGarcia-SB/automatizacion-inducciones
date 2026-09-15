/**
 * ============================================================
 * TestUtils.js — Funciones de prueba y diagnóstico manual
 *
 * Este archivo contiene funciones que solo se ejecutan manualmente
 * desde el desplegable "Ejecutar" del editor de Apps Script.
 * No forma parte del flujo de negocio ni de triggers automáticos.
 *
 * EXCLUIDO del deploy de producción (.claspignore) pero disponible
 * en el editor de Apps Script para desarrollo y diagnóstico.
 *
 * Las funciones aquí pueden invocar funciones internas del proyecto
 * (_recolectarMetricasGestion_, _construirCorreoReporteGestion_, etc.)
 * porque todos los archivos .js comparten el mismo scope global en GAS.
 * ============================================================
 */


// ══════════════════════════════════════════════════════════════════════════════
// REPORTES — Vistas previas
// ══════════════════════════════════════════════════════════════════════════════

/**
 * Vista previa: arma el mismo correo y lo manda SOLO a quien ejecuta la
 * función (nunca a CORREOS_LIDERES), con [PRUEBA] en el asunto para que no
 * se confunda con un envío real. Selecciónala en el desplegable "Ejecutar"
 * para revisar cómo queda antes de activar el trigger diario.
 */
function probarReporteGestion() {
  const m = _recolectarMetricasGestion_();
  const correo = _construirCorreoReporteGestion_(m);
  const destinatario = Session.getActiveUser().getEmail();

  MailApp.sendEmail({
    to:       destinatario,
    subject:  `[PRUEBA] ${correo.asunto}`,
    htmlBody: correo.htmlBody,
    replyTo:  "noreply@ellibertador.co",
    name:     "Inducciones · El Libertador (prueba)"
  });

  Logger.log("Vista previa enviada solo a: " + destinatario);
}

/**
 * Vista previa con una fecha distinta a hoy — útil para cotejar días donde
 * SÍ hubo gestión (ej. ayer) mientras hoy está vacío. Cambia FECHA_PRUEBA
 * abajo cada vez que quieras revisar otro día y vuelve a ejecutar.
 * Igual que probarReporteGestion: solo se manda a quien la ejecuta, nunca a
 * CORREOS_LIDERES. No la usa ningún flujo de negocio real.
 */
function probarReporteGestionConFecha() {
  // ── Cambia esta fecha para cotejar otro día (año, mes 0-indexado, día) ──
  const FECHA_PRUEBA = new Date(2026, 6, 24); // 24 de julio de 2026

  const m = _recolectarMetricasGestion_(FECHA_PRUEBA);
  const correo = _construirCorreoReporteGestion_(m, FECHA_PRUEBA);
  const destinatario = Session.getActiveUser().getEmail();

  MailApp.sendEmail({
    to:       destinatario,
    subject:  `[PRUEBA · fecha simulada] ${correo.asunto}`,
    htmlBody: correo.htmlBody,
    replyTo:  "noreply@ellibertador.co",
    name:     "Inducciones · El Libertador (prueba)"
  });

  Logger.log("Vista previa con fecha simulada (" + FECHA_PRUEBA + ") enviada solo a: " + destinatario);
}

/**
 * Prueba manual: arma el correo de cierre de mes con los datos REALES de un
 * comercial, pero lo manda SOLO a quien ejecuta la función (nunca al
 * comercial), con [PRUEBA] en el asunto. Cambia EMAIL_A_PROBAR abajo y
 * ejecuta desde el desplegable del editor antes de confiar en el botón real.
 */
function probarReporteCierreMes() {
  const EMAIL_A_PROBAR = 'CAMBIA_ESTE_EMAIL@segurosbolivar.com';

  if (EMAIL_A_PROBAR.indexOf('CAMBIA_ESTE_EMAIL') !== -1) {
    Logger.log('❌ Cambia EMAIL_A_PROBAR por el email real de un comercial antes de ejecutar.');
    return;
  }

  const rangos = _rangosMesCierreYComparacion_();
  const nombreComercialMayus = emailANombre(EMAIL_A_PROBAR, 'MAYUSCULAS');

  // Rango del mes -2 para las barras de 3 meses
  const ref = new Date();
  const inicioMesMenos2 = new Date(ref.getFullYear(), ref.getMonth() - 3, 1, 0, 0, 0, 0);
  const finMesMenos2    = new Date(ref.getFullYear(), ref.getMonth() - 2, 0, 23, 59, 59, 999);
  const nombreMesMenos2 = MESES_ES[inicioMesMenos2.getMonth()];

  const radicadosEsteMes  = contarLotesRadicadosEnRango(EMAIL_A_PROBAR, rangos.mesReporte.inicio, rangos.mesReporte.fin);
  const radicadosMesAnt   = contarLotesRadicadosEnRango(EMAIL_A_PROBAR, rangos.mesComparacion.inicio, rangos.mesComparacion.fin);
  const radicadosMesMenos2 = contarLotesRadicadosEnRango(EMAIL_A_PROBAR, inicioMesMenos2, finMesMenos2);

  // Calidad por mes
  const calidadMesMenos2 = contarRadicacionesPorResultadoEnRango(EMAIL_A_PROBAR, inicioMesMenos2, finMesMenos2);
  const calidadMesAnt    = contarRadicacionesPorResultadoEnRango(EMAIL_A_PROBAR, rangos.mesComparacion.inicio, rangos.mesComparacion.fin);
  const calidadEsteMes   = contarRadicacionesPorResultadoEnRango(EMAIL_A_PROBAR, rangos.mesReporte.inicio, rangos.mesReporte.fin);

  const capMesMenos2 = nombreMesMenos2.charAt(0).toUpperCase() + nombreMesMenos2.slice(1);
  const capMesAnt    = rangos.mesComparacion.nombre.charAt(0).toUpperCase() + rangos.mesComparacion.nombre.slice(1);
  const capMesActual = rangos.mesReporte.nombre.charAt(0).toUpperCase() + rangos.mesReporte.nombre.slice(1);

  const barrasRadicacion = _bloque_barras_radicacion_cierreMes_([
    { nombre: capMesMenos2, valor: radicadosMesMenos2 },
    { nombre: capMesAnt,    valor: radicadosMesAnt },
    { nombre: capMesActual, valor: radicadosEsteMes }
  ]);

  const barrasCalidad = _bloque_barras_calidad_radicacion_([
    { nombre: capMesMenos2, exitosos: calidadMesMenos2.exitosos, fallidos: calidadMesMenos2.fallidos },
    { nombre: capMesAnt,    exitosos: calidadMesAnt.exitosos,    fallidos: calidadMesAnt.fallidos },
    { nombre: capMesActual, exitosos: calidadEsteMes.exitosos,   fallidos: calidadEsteMes.fallidos }
  ]);

  const correo = _construirCorreoCierreMes_({
    nombre: emailANombre(EMAIL_A_PROBAR, 'PRIMER_NOMBRE') || 'Ejecutivo Comercial',
    nombreMes: rangos.mesReporte.nombre,
    nombreMesAnterior: rangos.mesComparacion.nombre,
    radicadosEsteMes: radicadosEsteMes,
    radicadosMesAnterior: radicadosMesAnt,
    resumen: obtenerResumenComercial(EMAIL_A_PROBAR),
    pendientesPS: obtenerLotesPendientesPazYSalvo(nombreComercialMayus),
    erroresTerceros: obtenerErroresPendientesComercial(EMAIL_A_PROBAR),
    barrasRadicacion: barrasRadicacion,
    barrasCalidad: barrasCalidad
  });

  const destinatario = Session.getActiveUser().getEmail();

  MailApp.sendEmail({
    to:       destinatario,
    subject:  `[PRUEBA · datos de ${EMAIL_A_PROBAR}] ${correo.asunto}`,
    htmlBody: correo.htmlBody,
    replyTo:  "noreply@ellibertador.co",
    name:     "Inducciones · El Libertador (prueba)"
  });

  Logger.log('Vista previa con datos de ' + EMAIL_A_PROBAR + ' enviada solo a: ' + destinatario);
}


// ══════════════════════════════════════════════════════════════════════════════
// INFOBIP — Pruebas de envío SMS/Email
// ══════════════════════════════════════════════════════════════════════════════

/**
 * Prueba envío de 1 SMS. Cambia el número antes de ejecutar.
 */
function probarEnvioSmsInfobip() {
  var NUMERO_PRUEBA = '573XXXXXXXXX'; // ← cambiar por tu número real

  if (NUMERO_PRUEBA.indexOf('XXX') !== -1) {
    Logger.log('❌ Cambia NUMERO_PRUEBA por un número real antes de ejecutar.');
    return;
  }

  var resultado = _enviarSmsInfobip({ celular: NUMERO_PRUEBA, nombre: 'Prueba', inmobiliaria: 'Inmobiliaria Test' });
  Logger.log('Resultado: ' + JSON.stringify({ ok: resultado.ok, tipo: resultado.tipo, causa: resultado.causa, statusCode: resultado.statusCode }));
}

/**
 * TEST COMBINADO — SMS + Email
 *
 * Envía UN SMS y UN correo de prueba para verificar que ambos
 * canales funcionan correctamente antes de activar el flujo
 * automático de Ley 2300.
 *
 * INSTRUCCIONES:
 *   1. Cambia CELULAR_PRUEBA por tu número real
 *   2. Cambia EMAIL_PRUEBA por tu correo real
 *   3. Selecciona esta función en el desplegable
 *   4. Ejecutar
 *   5. Revisa el Log Y tu celular/bandeja de entrada
 */
function testEnvioLey2300() {
  // ─── CAMBIAR POR TUS DATOS REALES ───
  var CELULAR_PRUEBA = '573XXXXXXXXX';       // ← tu celular
  var EMAIL_PRUEBA   = 'santiago.garcia@segurosbolivar.com'; // ← tu correo
  var NOMBRE_PRUEBA  = 'Santiago (PRUEBA)';
  var INMOBILIARIA_PRUEBA = 'Inmobiliaria Test';
  // ─── FIN ─────────────────────────────

  Logger.log('═══════════════════════════════════════════');
  Logger.log('  TEST DE ENVÍO LEY 2300 — SMS + EMAIL');
  Logger.log('═══════════════════════════════════════════');

  // ── 1. Verificar credenciales ──
  var props = PropertiesService.getScriptProperties();
  var baseUrl    = props.getProperty('INFOBIP_BASE_URL');
  var apiKey     = props.getProperty('INFOBIP_API_KEY');
  var emailFrom  = props.getProperty('INFOBIP_EMAIL_FROM');
  var templateId = props.getProperty('INFOBIP_EMAIL_TEMPLATE_ID');

  Logger.log('\n🔑 Credenciales:');
  Logger.log('   BASE_URL:    ' + (baseUrl ? '✅' : '❌ falta'));
  Logger.log('   API_KEY:     ' + (apiKey ? '✅' : '❌ falta'));
  Logger.log('   EMAIL_FROM:  ' + (emailFrom || '❌ falta'));
  Logger.log('   TEMPLATE_ID: ' + (templateId || '❌ falta'));

  if (!baseUrl || !apiKey) {
    Logger.log('\n❌ Faltan INFOBIP_BASE_URL o INFOBIP_API_KEY. No se puede continuar.');
    return;
  }

  // ── 2. Test SMS ──
  var resultadoSms = { ok: false, mensaje: 'No ejecutado' };
  if (CELULAR_PRUEBA.indexOf('XXX') !== -1) {
    Logger.log('\n📱 SMS: ⏭️ SALTADO (cambia CELULAR_PRUEBA por un número real)');
  } else {
    Logger.log('\n📱 Enviando SMS de prueba...');
    resultadoSms = _enviarSmsInfobip({ celular: CELULAR_PRUEBA, nombre: NOMBRE_PRUEBA, inmobiliaria: INMOBILIARIA_PRUEBA });
    Logger.log('   ' + (resultadoSms.ok ? '✅ Aceptado' : '❌ Rechazado'));
  }

  // ── 3. Test EMAIL ──
  var resultadoEmail = { ok: false, mensaje: 'No ejecutado' };
  if (!emailFrom || !templateId) {
    Logger.log('\n📧 Email: ⏭️ SALTADO (faltan INFOBIP_EMAIL_FROM o INFOBIP_EMAIL_TEMPLATE_ID)');
  } else {
    Logger.log('\n📧 Enviando Email de prueba...');
    resultadoEmail = _enviarEmailInfobip({ email: EMAIL_PRUEBA, nombre: NOMBRE_PRUEBA, inmobiliaria: INMOBILIARIA_PRUEBA });
    Logger.log('   ' + (resultadoEmail.ok ? '✅ Aceptado' : '❌ Rechazado'));
    if (resultadoEmail.messageId) {
      Logger.log('   MessageId: ' + resultadoEmail.messageId);
    }
  }

  // ── 4. Resumen ──
  Logger.log('\n═══════════════════════════════════════════');
  Logger.log('  RESUMEN:');
  Logger.log('  SMS:   ' + (resultadoSms.ok ? '✅ Enviado' : '❌ ' + resultadoSms.mensaje));
  Logger.log('  Email: ' + (resultadoEmail.ok ? '✅ Enviado' : '❌ ' + resultadoEmail.mensaje));
  Logger.log('═══════════════════════════════════════════');
  Logger.log('\n👉 Revisa tu celular y bandeja de entrada para confirmar.');
}


// ══════════════════════════════════════════════════════════════════════════════
// NOTIFICACIONES — Prueba maestra de todos los correos del sistema
// Ejecutar manualmente desde el editor. No toca ningún dato en las hojas.
// ══════════════════════════════════════════════════════════════════════════════

function PRUEBA_todosLosCorreos() {
  var emailDestino = Session.getActiveUser().getEmail();
  var idLote = "PRUEBA-00000-0000";
  var arrendatario = "Juan Pérez (PRUEBA)";
  var nombreComercial = "Santiago (PRUEBA)";
  var enviados = 0;

  Logger.log("═══════════════════════════════════════════════");
  Logger.log("  PRUEBA DE TODOS LOS CORREOS DEL SISTEMA");
  Logger.log("  Destino: " + emailDestino);
  Logger.log("═══════════════════════════════════════════════\n");

  // ─── 1. Cambio de estado → EN ANÁLISIS ────────────────────────────────────
  try {
    var html1 = _envolver_([
      _bloque_cabecera_("Actualizaci&oacute;n de estado"),
      _bloque_barra_estado_(_C_NAVY, "&#128203;", "En análisis por el equipo"),
      _bloque_cuerpo_inicio_(
        "Hola, " + nombreComercial,
        "Tu lote fue asignado a un analista y est&aacute; siendo revisado. Te notificaremos cuando haya una actualizaci&oacute;n."
      ),
      _bloque_chips_([
        { label: "ID Lote", valor: idLote, colorVal: _C_ROJO },
        { label: "Nuevo estado", valor: "EN ANÁLISIS", colorVal: _C_NAVY }
      ]),
      _bloque_pie_()
    ].join(""));

    MailApp.sendEmail({
      to: emailDestino,
      subject: "[PRUEBA 1/8] ▶️ Tu lote " + idLote + " está en análisis",
      htmlBody: html1,
      name: "Inducciones · El Libertador"
    });
    enviados++;
    Logger.log("  ✓ 1/8 — Cambio de estado: EN ANÁLISIS");
  } catch (e) { Logger.log("  ✗ 1/8 — Error: " + e.message); }

  // ─── 2. Cambio de estado → TERMINADO ──────────────────────────────────────
  try {
    var html2 = _envolver_([
      _bloque_cabecera_("Actualizaci&oacute;n de estado"),
      _bloque_barra_estado_("#3B6D11", "&#10003;", "Análisis finalizado"),
      _bloque_cuerpo_inicio_(
        "Hola, " + nombreComercial,
        "El an&aacute;lisis de tu lote ha sido completado por el equipo de inducciones. Pronto recibir&aacute;s la comunicaci&oacute;n con los resultados."
      ),
      _bloque_chips_([
        { label: "ID Lote", valor: idLote, colorVal: _C_ROJO },
        { label: "Nuevo estado", valor: "TERMINADO", colorVal: "#3B6D11" }
      ]),
      _bloque_pie_()
    ].join(""));

    MailApp.sendEmail({
      to: emailDestino,
      subject: "[PRUEBA 2/8] ✅ Tu lote " + idLote + " fue analizado exitosamente",
      htmlBody: html2,
      name: "Inducciones · El Libertador"
    });
    enviados++;
    Logger.log("  ✓ 2/8 — Cambio de estado: TERMINADO");
  } catch (e) { Logger.log("  ✗ 2/8 — Error: " + e.message); }

  // ─── 3. Error en terceros (notificación al comercial) ─────────────────────
  try {
    var urlApp = ScriptApp.getService().getUrl() + '?v=2';
    var html3 = _envolver_([
      _bloque_cabecera_('Acción requerida'),
      _bloque_barra_estado_(_C_ROJO, '&#9888;', 'Necesitamos tu ayuda'),
      _bloque_cuerpo_inicio_(
        'Hola, ' + nombreComercial,
        'Encontramos un detalle que necesita corrección para la solicitud de <strong>' + arrendatario + '</strong> del lote <strong>' + idLote + '</strong>. Ingresa al aplicativo para ver qué necesitamos y enviar la información.'
      ),
      _bloque_boton_('Ver detalle y responder', urlApp),
      _bloque_nota_('Si el botón no funciona, copia este enlace en tu navegador: ' + urlApp),
      _bloque_pie_()
    ].join(''));

    MailApp.sendEmail({
      to: emailDestino,
      subject: '[PRUEBA 3/8] ⚠️ Necesitamos tu ayuda · ' + arrendatario,
      htmlBody: html3,
      name: 'Inducciones · El Libertador'
    });
    enviados++;
    Logger.log("  ✓ 3/8 — Error en terceros: notificación al comercial");
  } catch (e) { Logger.log("  ✗ 3/8 — Error: " + e.message); }

  // ─── 4. Corrección recibida (notificación al auxiliar) ────────────────────
  try {
    var urlApp4 = ScriptApp.getService().getUrl() + '?v=2';
    var html4 = _envolver_([
      _bloque_cabecera_('Corrección recibida'),
      _bloque_barra_estado_('#0fbdb7', '&#10003;', 'Respuesta del comercial'),
      _bloque_cuerpo_inicio_(
        'Corrección recibida',
        '<strong>' + nombreComercial + '</strong> envió la corrección para la solicitud de <strong>' + arrendatario + '</strong>. Revísala en el aplicativo y procede con la radicación en SAI.'
      ),
      _bloque_boton_('Revisar corrección', urlApp4),
      _bloque_nota_('Si el botón no funciona, copia este enlace: ' + urlApp4),
      _bloque_pie_()
    ].join(''));

    MailApp.sendEmail({
      to: emailDestino,
      subject: '[PRUEBA 4/8] ⚡ Corrección recibida · ' + arrendatario,
      htmlBody: html4,
      name: 'Inducciones · El Libertador'
    });
    enviados++;
    Logger.log("  ✓ 4/8 — Corrección recibida: notificación al auxiliar");
  } catch (e) { Logger.log("  ✗ 4/8 — Error: " + e.message); }

  // ─── 5. Paz y salvo pendiente (onEdit) ────────────────────────────────────
  try {
    var html5 = _envolver_([
      _bloque_cabecera_("Acci&oacute;n requerida"),
      _bloque_barra_estado_(_C_GRIS, "&#9888;", "Paz y salvo pendiente"),
      _bloque_cuerpo_inicio_(
        "Hola, " + nombreComercial,
        "Tu lote <strong>" + idLote + "</strong> fue aprobado, pero a&uacute;n no hemos recibido el documento de paz y salvo. Requerimos este documento para completar el proceso."
      ),
      _bloque_chips_([
        { label: "ID Lote", valor: idLote, colorVal: _C_ROJO },
        { label: "Estado", valor: "PENDIENTE PAZ Y SALVO", colorVal: _C_GRIS }
      ]),
      _bloque_pie_()
    ].join(""));

    MailApp.sendEmail({
      to: emailDestino,
      subject: "[PRUEBA 5/8] ⚠️ Paz y salvo pendiente · Lote " + idLote,
      htmlBody: html5,
      name: "Inducciones · El Libertador"
    });
    enviados++;
    Logger.log("  ✓ 5/8 — Paz y salvo pendiente");
  } catch (e) { Logger.log("  ✗ 5/8 — Error: " + e.message); }

  // ─── 6. Recordatorio paz y salvo (escalamiento) ───────────────────────────
  try {
    var html6 = _envolver_([
      _bloque_cabecera_("Recordatorio"),
      _bloque_barra_estado_(_C_GRIS, "&#128276;", "Paz y salvo pendiente hace 10 d&iacute;as"),
      _bloque_cuerpo_inicio_(
        "Hola, " + nombreComercial,
        "El lote <strong>" + idLote + "</strong> a&uacute;n no tiene paz y salvo. El equipo de inducciones est&aacute; monitoreando."
      ),
      _bloque_chips_([
        { label: "ID Lote", valor: idLote, colorVal: _C_ROJO },
        { label: "D&iacute;as pendiente", valor: "10", colorVal: _C_NAVY }
      ]),
      _bloque_pie_()
    ].join(""));

    MailApp.sendEmail({
      to: emailDestino,
      subject: "[PRUEBA 6/8] 📌 Paz y salvo aún pendiente · Lote " + idLote,
      htmlBody: html6,
      name: "Inducciones · El Libertador"
    });
    enviados++;
    Logger.log("  ✓ 6/8 — Recordatorio paz y salvo (escalamiento)");
  } catch (e) { Logger.log("  ✗ 6/8 — Error: " + e.message); }

  // ─── 7. Recordatorio error en terceros (escalamiento) ─────────────────────
  try {
    var html7 = _envolver_([
      _bloque_cabecera_("Recordatorio"),
      _bloque_barra_estado_(_C_ROJO, "&#9888;", "Error en terceros hace 15 d&iacute;as"),
      _bloque_cuerpo_inicio_(
        "Hola, " + nombreComercial,
        "El lote <strong>" + idLote + "</strong> presenta errores en los datos de terceros que impiden continuar con el proceso de inducci&oacute;n. La operaci&oacute;n ya solicit&oacute; la correcci&oacute;n correspondiente."
      ),
      _bloque_chips_([
        { label: "ID Lote", valor: idLote, colorVal: _C_ROJO },
        { label: "D&iacute;as pendiente", valor: "15", colorVal: _C_ROJO }
      ]),
      _bloque_nota_(
        '<strong style="color:#253150;">Acci&oacute;n requerida:</strong> Verifica y corrige los datos de terceros solicitados por el equipo de inducciones.'
      ),
      _bloque_pie_()
    ].join(""));

    MailApp.sendEmail({
      to: emailDestino,
      subject: "[PRUEBA 7/8] ⚠️ Error en terceros pendiente de corrección · Lote " + idLote,
      htmlBody: html7,
      name: "Inducciones · El Libertador"
    });
    enviados++;
    Logger.log("  ✓ 7/8 — Recordatorio error en terceros (escalamiento)");
  } catch (e) { Logger.log("  ✗ 7/8 — Error: " + e.message); }

  // ─── 8. Radicación exitosa ────────────────────────────────────────────────
  try {
    var html8 = _envolver_([
      _bloque_cabecera_("Radicaci&oacute;n exitosa"),
      _bloque_barra_estado_("#3B6D11", "&#10003;", "Lote radicado correctamente"),
      _bloque_cuerpo_inicio_(
        "Hola, " + nombreComercial,
        "Tu lote ha sido radicado exitosamente en el sistema de inducciones. El equipo lo revisar&aacute; pronto."
      ),
      _bloque_chips_([
        { label: "ID de Lote", valor: idLote, colorVal: _C_ROJO },
        { label: "P&oacute;liza", valor: "POL-123456" },
        { label: "Contratos radicados", valor: "3" },
        { label: "Tasa de Inducci&oacute;n", valor: "12%" }
      ]),
      _bloque_pie_()
    ].join(""));

    MailApp.sendEmail({
      to: emailDestino,
      subject: "[PRUEBA 8/8] ✅ Radicación exitosa · Lote " + idLote,
      htmlBody: html8,
      name: "Inducciones · El Libertador"
    });
    enviados++;
    Logger.log("  ✓ 8/8 — Radicación exitosa");
  } catch (e) { Logger.log("  ✗ 8/8 — Error: " + e.message); }

  // ─── Resumen ──────────────────────────────────────────────────────────────
  Logger.log("\n═══════════════════════════════════════════════");
  Logger.log("  RESULTADO: " + enviados + "/8 correos enviados a " + emailDestino);
  Logger.log("═══════════════════════════════════════════════");
}


// ══════════════════════════════════════════════════════════════════════════════
// RESULTADOS — Prueba del flujo completo de generación de PDFs y envío
// Ejecutar manualmente desde el editor. Envía SOLO a quien ejecuta la función.
// ══════════════════════════════════════════════════════════════════════════════

/**
 * Prueba completa del flujo de resultados:
 *   1. Lee datos REALES del lote en "Calculo Lote"
 *   2. Resuelve contactos (ejecutivo, director, backup)
 *   3. Genera los 2 PDFs (comercial + inmobiliaria)
 *   4. Construye el correo HTML
 *   5. PERO envía solo a TU email (no al comercial)
 *   6. NO registra en Historico_Envios
 *
 * Requisitos:
 *   - La hoja "Calculo Lote" del libro de análisis debe tener datos de un lote
 *   - Las plantillas deben existir (ID_PLANTILLA_COMERCIAL, ID_PLANTILLA_INMOBILIARIA)
 *
 * Ejecutar desde el desplegable "Ejecutar" del editor de Apps Script.
 */
function PRUEBA_enviarResultadosLote() {
  var emailDestino = Session.getActiveUser().getEmail();

  Logger.log("═══════════════════════════════════════════════");
  Logger.log("  PRUEBA — Envío de Resultados de Lote");
  Logger.log("  Destino: " + emailDestino + " (solo tú)");
  Logger.log("═══════════════════════════════════════════════\n");

  // 1. Leer y validar datos del lote
  Logger.log("1️⃣ Leyendo datos de Calculo Lote...");
  var resultado = _leerDatosLote_();
  if (!resultado.ok) {
    Logger.log("❌ Error al leer datos del lote: " + resultado.error);
    return;
  }
  var datosLote = resultado.datos;
  Logger.log("   ✅ Lote: " + datosLote.idLote + " | Inmobiliaria: " + datosLote.inmobiliaria);
  Logger.log("   Aprobadas: " + datosLote.cantAprobadas + " | Negadas: " + datosLote.cantNegadas);
  Logger.log("   Solicitudes encontradas: " + (datosLote.solicitudes ? datosLote.solicitudes.length : 0));

  // 2. Resolver contactos
  Logger.log("\n2️⃣ Resolviendo contactos...");
  var contacto = _resolverContactoComercial_(datosLote.idLote);
  if (!contacto.ok) {
    Logger.log("❌ Error al resolver contactos: " + contacto.error);
    return;
  }
  Logger.log("   ✅ Ejecutivo: " + contacto.ejecutivo);
  Logger.log("   Director: " + (contacto.director || "(no encontrado)"));

  // 3. Resolver backup
  Logger.log("\n3️⃣ Resolviendo backup...");
  var backup = _resolverBackupEmail_(contacto.ejecutivo);
  Logger.log("   Backup: " + (backup || "(no aplica)"));

  // 4. Generar PDFs
  Logger.log("\n4️⃣ Generando PDF Comercial...");
  var pdfComercial;
  try {
    pdfComercial = _generarPdfDesdeTemplate_(ID_PLANTILLA_COMERCIAL, datosLote, datosLote.solicitudes);
    Logger.log("   ✅ PDF Comercial generado (" + pdfComercial.getBytes().length + " bytes)");
  } catch (e) {
    Logger.log("   ❌ Error generando PDF Comercial: " + e.message);
    return;
  }

  Logger.log("   Generando PDF Inmobiliaria...");
  var pdfInmobiliaria;
  try {
    pdfInmobiliaria = _generarPdfDesdeTemplate_(ID_PLANTILLA_INMOBILIARIA, datosLote, datosLote.solicitudes);
    Logger.log("   ✅ PDF Inmobiliaria generado (" + pdfInmobiliaria.getBytes().length + " bytes)");
  } catch (e) {
    Logger.log("   ❌ Error generando PDF Inmobiliaria: " + e.message);
    return;
  }

  // 5. Construir CC (para logging, no se usa en el envío de prueba)
  var cadenaCC = obtenerCadenaJerarquica(contacto.ejecutivo);
  var listaCC = _construirListaCC_(contacto.director, backup, cadenaCC);
  Logger.log("\n5️⃣ CC que se usaría en producción: " + (listaCC.length > 0 ? listaCC.join(", ") : "(vacío)"));

  // 6. Construir HTML y enviar SOLO a ti
  Logger.log("\n6️⃣ Enviando correo de prueba a " + emailDestino + "...");
  datosLote._nombreComercial = emailANombre(contacto.ejecutivo, "PRIMER_NOMBRE") || "Ejecutivo Comercial";
  var htmlBody = _construirHtmlResultados_(datosLote);

  MailApp.sendEmail({
    to: emailDestino,
    subject: "[PRUEBA] \u2705 Resultados de inducci\u00F3n \u00B7 Lote " + datosLote.idLote,
    htmlBody: htmlBody,
    attachments: [pdfComercial, pdfInmobiliaria],
    replyTo: "noreply@ellibertador.co",
    name: "Inducciones · El Libertador (PRUEBA)"
  });

  // 7. Resumen
  Logger.log("\n═══════════════════════════════════════════════");
  Logger.log("  ✅ PRUEBA EXITOSA");
  Logger.log("  Correo enviado a: " + emailDestino);
  Logger.log("  Lote: " + datosLote.idLote);
  Logger.log("  PDFs adjuntos: 2 (comercial + inmobiliaria)");
  Logger.log("  ⚠️  NO se registró en Historico_Envios");
  Logger.log("  ⚠️  NO se envió al comercial real (" + contacto.ejecutivo + ")");
  Logger.log("═══════════════════════════════════════════════");
}
/**
 * Diagnóstico manual y estrictamente de lectura para Gestión de Entregas Ley 2300.
 * No envía comunicaciones, no crea recursos y no revela PII, secretos ni identificadores.
 * @returns {Object} Resumen sanitizado para revisión manual.
 */
function diagnosticarGestionEntregasLey2300() {
  var propiedades = PropertiesService.getScriptProperties();
  var control = _diagnosticoLey2300_abrirLibro_(getHojaControlId());
  var analisis = _diagnosticoLey2300_abrirLibro_(getArchivoAnalisisId());
  var resultado = _diagnosticoLey2300_construirResultado_(
    control, analisis, _diagnosticoLey2300_propiedades_(propiedades), _diagnosticoLey2300_trigger_()
  );
  Logger.log('DIAGNOSTICO_LEY2300 ' + JSON.stringify(resultado));
  return resultado;
}

/** @param {string} libroId Identificador interno del libro. @returns {{disponible:boolean,libro:Object|null}} */
function _diagnosticoLey2300_abrirLibro_(libroId) {
  try {
    return { disponible: true, libro: SpreadsheetApp.openById(libroId) };
  } catch (error) {
    return { disponible: false, libro: null };
  }
}

/** @param {GoogleAppsScript.Properties.Properties} propiedades Servicio de propiedades. @returns {Object} Presencia sin valores. */
function _diagnosticoLey2300_propiedades_(propiedades) {
  return {
    infobipBaseUrl: _diagnosticoLey2300_propiedadConfigurada_(propiedades, 'INFOBIP_BASE_URL'),
    infobipApiKey: _diagnosticoLey2300_propiedadConfigurada_(propiedades, 'INFOBIP_API_KEY'),
    infobipEmailFrom: _diagnosticoLey2300_propiedadConfigurada_(propiedades, 'INFOBIP_EMAIL_FROM'),
    infobipEmailTemplateId: _diagnosticoLey2300_propiedadConfigurada_(propiedades, 'INFOBIP_EMAIL_TEMPLATE_ID'),
    infobipSender: _diagnosticoLey2300_propiedadConfigurada_(propiedades, 'INFOBIP_SENDER'),
    ley2300HmacSecret: { configurada: _diagnosticoLey2300_propiedadConfigurada_(propiedades, 'LEY2300_HMAC_SECRET'), recomendada: true }
  };
}

/** @param {Object} propiedades Servicio de propiedades. @param {string} nombre Nombre conocido. @returns {boolean} */
function _diagnosticoLey2300_propiedadConfigurada_(propiedades, nombre) {
  return !!String(propiedades.getProperty(nombre) || '').trim();
}

/** @returns {{consultable:boolean,procesarDatosMejoradoConfigurado:boolean}} Estado del trigger sin agenda. */
function _diagnosticoLey2300_trigger_() {
  try {
    var triggers = ScriptApp.getProjectTriggers();
    return {
      consultable: true,
      procesarDatosMejoradoConfigurado: triggers.some(function(trigger) {
        return trigger.getHandlerFunction() === 'procesarDatosMejorado';
      })
    };
  } catch (error) {
    return { consultable: false, procesarDatosMejoradoConfigurado: false };
  }
}

/** @param {Object} control Libro de control disponible. @param {Object} analisis Libro de análisis disponible. @param {Object} propiedades Presencia sanitizada. @param {Object} trigger Estado sanitizado. @returns {Object} */
function _diagnosticoLey2300_construirResultado_(control, analisis, propiedades, trigger) {
  var entregas = _diagnosticoLey2300_leerHoja_(control.libro, 'Entregas_Ley2300', ENTREGAS_LEY2300_ENCABEZADOS, true);
  return {
    modo: 'SOLO_LECTURA', propiedades: propiedades, trigger: trigger,
    control: {
      disponible: control.disponible,
      controlGeneral: _diagnosticoLey2300_leerHoja_(control.libro, 'Control_General', [], false),
      configuracionNotificaciones: _diagnosticoLey2300_leerPolitica_(control.libro),
      entregas: entregas,
      eventos: _diagnosticoLey2300_leerHoja_(control.libro, 'Entregas_Ley2300_Eventos', ENTREGAS_LEY2300_EVENTOS_ENCABEZADOS, false),
      operaciones: _diagnosticoLey2300_leerHoja_(control.libro, 'Operaciones_Ley2300', OPERACIONES_LEY2300_ENCABEZADOS, false)
    },
    analisis: { disponible: analisis.disponible, registroAnalisis: _diagnosticoLey2300_leerHoja_(analisis.libro, 'registro analisis', [], false) }
  };
}

/** @param {Object|null} libro Libro abierto. @param {string} nombre Nombre de hoja conocido. @param {string[]} esperados Encabezados canónicos. @param {boolean} contarEstados Indica si se deben contar estados. @returns {Object} */
function _diagnosticoLey2300_leerHoja_(libro, nombre, esperados, contarEstados) {
  var base = { existe: false, legible: false, esquemaValido: null, encabezadosFaltantes: [] };
  if (contarEstados) base.conteoPorEstado = _diagnosticoLey2300_contarEstados_([]);
  if (!libro) return base;
  try {
    var hoja = libro.getSheetByName(nombre);
    if (!hoja) return base;
    base.existe = true;
    var filas = hoja.getLastRow();
    if (!filas) { base.esquemaValido = !esperados.length; return base; }
    var encabezados = hoja.getRange(1, 1, 1, Math.max(1, hoja.getLastColumn())).getValues()[0];
    base.legible = true;
    base.encabezadosFaltantes = esperados.filter(function(esperado) { return encabezados.indexOf(esperado) === -1; });
    base.esquemaValido = base.encabezadosFaltantes.length === 0;
    if (contarEstados) base.conteoPorEstado = _diagnosticoLey2300_leerConteoEstados_(hoja, encabezados, filas);
    return base;
  } catch (error) {
    return base;
  }
}

/** @param {Object} hoja Hoja de entregas. @param {Array} encabezados Encabezados leídos. @param {number} filas Total de filas. @returns {Object} */
function _diagnosticoLey2300_leerConteoEstados_(hoja, encabezados, filas) {
  var columna = encabezados.indexOf('ESTADO');
  if (columna === -1 || filas < 2) return _diagnosticoLey2300_contarEstados_([]);
  var valores = hoja.getRange(2, columna + 1, filas - 1, 1).getValues();
  return _diagnosticoLey2300_contarEstados_(valores.map(function(fila) { return fila[0]; }));
}

/** @param {Array} estados Estados persistidos. @returns {Object} Conteos sin filas ni destinos. */
function _diagnosticoLey2300_contarEstados_(estados) {
  var permitidos = ENTREGAS_LEY2300_ESTADOS || [];
  var conteos = { NO_RECONOCIDO: 0 };
  permitidos.forEach(function(estado) { conteos[estado] = 0; });
  estados.forEach(function(valor) {
    var estado = String(valor || '').trim().toUpperCase();
    conteos[permitidos.indexOf(estado) === -1 ? 'NO_RECONOCIDO' : estado]++;
  });
  return conteos;
}

/** @param {Object|null} libro Libro de control. @returns {Object} Estado de política sin horario. */
function _diagnosticoLey2300_leerPolitica_(libro) {
  var base = { hojaExiste: false, politicaEncontrada: false, esquemaValido: null, activa: null, agendaConfigurada: false };
  if (!libro) return base;
  try {
    var hoja = libro.getSheetByName('CONFIG_NOTIFICACIONES');
    if (!hoja || hoja.getLastRow() < 1) return base;
    base.hojaExiste = true;
    var columnas = hoja.getLastColumn();
    var encabezados = hoja.getRange(1, 1, 1, columnas).getValues()[0];
    var id = encabezados.indexOf('ID'); var activa = encabezados.indexOf('ACTIVA'); var agenda = encabezados.indexOf('AGENDA_JSON');
    base.esquemaValido = id !== -1 && activa !== -1 && agenda !== -1;
    if (!base.esquemaValido || hoja.getLastRow() < 2) return base;
    var filas = hoja.getRange(2, 1, hoja.getLastRow() - 1, columnas).getValues();
    var politica = filas.filter(function(fila) { return String(fila[id] || '').trim() === 'cumplimiento_ley_2300'; })[0];
    if (!politica) return base;
    base.politicaEncontrada = true;
    base.activa = politica[activa] === true || String(politica[activa] || '').trim().toUpperCase() === 'TRUE';
    base.agendaConfigurada = !!String(politica[agenda] || '').trim();
    return base;
  } catch (error) {
    return base;
  }
}
/**
 * Depuración manual y explícita de retención Ley 2300. No está conectada a triggers.
 * Para ejecutar, establezca CONFIRMACION_EXPLICITA con el texto indicado en la guía,
 * revíselo en código y ejecute manualmente esta función desde Apps Script.
 */
function depurarRetencionEntregasLey2300Manual() {
  var CONFIRMACION_EXPLICITA = '';
  if (CONFIRMACION_EXPLICITA !== ENTREGAS_LEY2300_CONFIRMACION_RETENCION) {
    Logger.log('No se ejecutó la depuración: se requiere confirmación explícita.');
    return;
  }
  var actor = Session.getActiveUser().getEmail();
  var resultado = EntregasLey2300_depurarRetencion({ confirmacion: CONFIRMACION_EXPLICITA }, actor);
  Logger.log(JSON.stringify(resultado));
}
