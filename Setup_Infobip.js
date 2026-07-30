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
