/**
 * ============================================================
 * Servicios_InfobipSms.js — Envío de SMS vía API de Infobip
 *
 * Cumplimiento Ley 2300: envía SMS a arrendatarios/codeudores
 * de solicitudes aprobadas usando la plantilla "Ley2300".
 *
 * Credenciales en Script Properties:
 *   INFOBIP_BASE_URL, INFOBIP_API_KEY, INFOBIP_SENDER
 * ============================================================
 */

/**
 * Envía un SMS individual vía API de Infobip.
 * @param {string} celular - Número con código de país (ej: 573101234567)
 * @param {string} nombre - Nombre del destinatario ({First Name})
 * @param {string} inmobiliaria - Nombre de la inmobiliaria
 * @returns {{ok:boolean, mensaje:string, statusCode?:number}}
 */
function _enviarSmsInfobip(celular, nombre, inmobiliaria) {
  var props = PropertiesService.getScriptProperties();
  var baseUrl = props.getProperty('INFOBIP_BASE_URL');
  var apiKey = props.getProperty('INFOBIP_API_KEY');
  var sender = props.getProperty('INFOBIP_SENDER') || 'Ley2300';

  if (!baseUrl || !apiKey) {
    return { ok: false, mensaje: 'Credenciales de Infobip no configuradas.' };
  }

  // Normalizar base URL (asegurar https:// y sin trailing slash)
  baseUrl = baseUrl.replace(/\/+$/, '');
  if (baseUrl.indexOf('https://') !== 0) {
    baseUrl = 'https://' + baseUrl.replace(/^https?:\/\//, '');
  }

  // Construir el mensaje con las variables reemplazadas (debe coincidir EXACTAMENTE con la plantilla "Ley2300")
  var mensaje = nombre + ', con ocasión del Contrato de Arrendamiento celebrado con '
    + inmobiliaria + ', El Libertador SA le informa nuestros canales disponibles: '
    + 'Celular/Fijo, WhatsApp y SMS – unidireccional de salida. '
    + 'Si desea autorizar o actualizar los canales de contacto directo - '
    + 'Ley 2300 de 2023, podrá hacerlo al correo autorizacioncanalesdecontacto@ellibertador.co';

  // Formatear número (asegurar código de país 57)
  var numero = String(celular).replace(/[\s\-\(\)]/g, '');
  if (numero.startsWith('3') && numero.length === 10) numero = '57' + numero;
  if (!numero.startsWith('57')) numero = '57' + numero;

  var payload = {
    messages: [{
      from: sender,
      destinations: [{ to: numero }],
      text: mensaje
    }]
  };

  try {
    var response = UrlFetchApp.fetch(baseUrl + '/sms/2/text/advanced', {
      method: 'post',
      contentType: 'application/json',
      headers: { 'Authorization': 'App ' + apiKey },
      payload: JSON.stringify(payload),
      muteHttpExceptions: true
    });

    var code = response.getResponseCode();
    var body = response.getContentText();

    if (code === 200 || code === 201) {
      // Loguear messageId para rastreo en portal Infobip
      try {
        var respObj = JSON.parse(body);
        var msgId = respObj.messages && respObj.messages[0] ? respObj.messages[0].messageId : 'N/A';
        var status = respObj.messages && respObj.messages[0] && respObj.messages[0].status
          ? respObj.messages[0].status.name : 'N/A';
        Logger.log('Infobip messageId: ' + msgId + ' | status: ' + status);
      } catch (e) { /* no-op */ }
      return { ok: true, mensaje: 'SMS enviado a ' + numero, statusCode: code };
    } else {
      return { ok: false, mensaje: 'Infobip respondió ' + code + ': ' + body, statusCode: code };
    }
  } catch (e) {
    return { ok: false, mensaje: 'Error de red: ' + e.message };
  }
}

/**
 * Envía SMS masivo a una lista de destinatarios.
 * Controla el ritmo para no exceder cuotas de Infobip.
 * @param {Array} destinatarios - [{celular, nombre, inmobiliaria}]
 * @returns {{enviados:number, fallidos:number, errores:Array}}
 */
function enviarSmsMasivoLey2300(destinatarios) {
  var enviados = 0;
  var fallidos = 0;
  var errores = [];

  for (var i = 0; i < destinatarios.length; i++) {
    var d = destinatarios[i];
    if (!d.celular) continue;

    var resultado = _enviarSmsInfobip(d.celular, d.nombre, d.inmobiliaria);

    if (resultado.ok) {
      enviados++;
    } else {
      fallidos++;
      errores.push({ celular: d.celular, nombre: d.nombre, error: resultado.mensaje });
    }

    // Pausa de 100ms entre envíos para no saturar la API
    if (i < destinatarios.length - 1) Utilities.sleep(100);
  }

  return { enviados: enviados, fallidos: fallidos, errores: errores };
}

/**
 * Función principal: procesa solicitudes aprobadas y envía SMS automáticamente.
 * Reemplaza la carga manual de CSV de celulares en Infobip.
 * Se integra con procesarDatosMejorado() de Cumplimiento.js.
 * @param {Array} datosCelulares - Array de filas [NOMBRE, CELULAR, INMOBILIARIA]
 * @returns {{enviados:number, fallidos:number}}
 */
function procesarEnvioSmsLey2300(datosCelulares) {
  if (!datosCelulares || datosCelulares.length <= 1) {
    return { enviados: 0, fallidos: 0 };
  }

  // datosCelulares[0] = headers ['NOMBRE', 'CELULAR', 'INMOBILIARIA']
  // datosCelulares[1..n] = datos
  var destinatarios = [];
  for (var i = 1; i < datosCelulares.length; i++) {
    var fila = datosCelulares[i];
    destinatarios.push({
      nombre: String(fila[0] || '').trim(),
      celular: String(fila[1] || '').trim(),
      inmobiliaria: String(fila[2] || '').trim()
    });
  }

  if (destinatarios.length === 0) return { enviados: 0, fallidos: 0 };

  var resultado = enviarSmsMasivoLey2300(destinatarios);

  // Registrar en logs
  _registrarEvento_('INFO', 'Servicios_InfobipSms.js',
    'Envío SMS Ley 2300 completado',
    'Enviados: ' + resultado.enviados + ' | Fallidos: ' + resultado.fallidos);

  if (resultado.errores.length > 0) {
    _registrarEvento_('WARN', 'Servicios_InfobipSms.js',
      'Errores en envío SMS',
      resultado.errores.slice(0, 5).map(function(e) { return e.celular + ': ' + e.error; }).join(' | '));
  }

  return resultado;
}
