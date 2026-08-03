/**
 * ============================================================
 * Setup_Infobip.js — Configurar credenciales de Infobip
 *
 * INSTRUCCIONES:
 * 1. Pega tus credenciales en las variables de abajo (líneas marcadas)
 * 2. Ejecuta configurarCredencialesInfobip()
 * 3. Verifica en el log que diga "✅ Configuradas"
 * 4. BORRA las credenciales de este archivo (vuelve a poner '')
 * 5. Haz clasp push para que el repo quede limpio
 *
 * Las credenciales quedan guardadas en Script Properties
 * y NUNCA deben permanecer en este archivo.
 * ============================================================
 */

function configurarCredencialesInfobip() {
  // ─── PEGAR CREDENCIALES AQUÍ (solo temporalmente) ───
  var BASE_URL = '';  // ej: https://qgmx9r.api.infobip.com
  var API_KEY  = '';  // ej: e350a74c...
  var SENDER   = '';  // ej: Ley2300 (dejar vacío usa 'Ley2300')
  // ─── FIN ────────────────────────────────────────────

  if (!BASE_URL || !API_KEY) {
    Logger.log('❌ Pega la BASE_URL y API_KEY en las variables antes de ejecutar.');
    return;
  }

  var props = PropertiesService.getScriptProperties();
  props.setProperty('INFOBIP_BASE_URL', BASE_URL);
  props.setProperty('INFOBIP_API_KEY', API_KEY);
  props.setProperty('INFOBIP_SENDER', SENDER || 'Ley2300');

  Logger.log('✅ Credenciales de Infobip configuradas en Script Properties.');
  Logger.log('🔒 AHORA borra los valores de este archivo y haz clasp push.');
}

/**
 * Verifica que las credenciales estén configuradas (no muestra la key completa).
 */
function verificarConfigInfobip() {
  var props = PropertiesService.getScriptProperties();
  var baseUrl = props.getProperty('INFOBIP_BASE_URL');
  var apiKey = props.getProperty('INFOBIP_API_KEY');
  var sender = props.getProperty('INFOBIP_SENDER');

  Logger.log('── Configuración Infobip ──');
  Logger.log('Base URL: ' + (baseUrl || '❌ NO CONFIGURADA'));
  Logger.log('API Key:  ' + (apiKey ? '✅ (' + apiKey.substring(0, 8) + '...)' : '❌ NO CONFIGURADA'));
  Logger.log('Sender:   ' + (sender || 'Ley2300 (default)'));
}

/**
 * Prueba envío de 1 SMS. Cambia el número antes de ejecutar.
 */
function probarEnvioSmsInfobip() {
  var NUMERO_PRUEBA = '573XXXXXXXXX'; // ← cambiar por tu número real

  if (NUMERO_PRUEBA.indexOf('XXX') !== -1) {
    Logger.log('❌ Cambia NUMERO_PRUEBA por un número real antes de ejecutar.');
    return;
  }

  var resultado = _enviarSmsInfobip(NUMERO_PRUEBA, 'Prueba', 'Inmobiliaria Test');
  Logger.log('Resultado: ' + JSON.stringify(resultado));
}

/**
 * ============================================================
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
 * ============================================================
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
    Logger.log('\n📱 Enviando SMS a ' + CELULAR_PRUEBA + '...');
    resultadoSms = _enviarSmsInfobip(CELULAR_PRUEBA, NOMBRE_PRUEBA, INMOBILIARIA_PRUEBA);
    Logger.log('   ' + (resultadoSms.ok ? '✅ ' : '❌ ') + resultadoSms.mensaje);
  }

  // ── 3. Test EMAIL ──
  var resultadoEmail = { ok: false, mensaje: 'No ejecutado' };
  if (!emailFrom || !templateId) {
    Logger.log('\n📧 Email: ⏭️ SALTADO (faltan INFOBIP_EMAIL_FROM o INFOBIP_EMAIL_TEMPLATE_ID)');
  } else {
    Logger.log('\n📧 Enviando Email a ' + EMAIL_PRUEBA + '...');
    resultadoEmail = _enviarEmailInfobip(EMAIL_PRUEBA, NOMBRE_PRUEBA, INMOBILIARIA_PRUEBA);
    Logger.log('   ' + (resultadoEmail.ok ? '✅ ' : '❌ ') + resultadoEmail.mensaje);
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
