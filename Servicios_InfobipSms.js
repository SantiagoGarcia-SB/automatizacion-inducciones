/** Servicio de transporte SMS de Ley 2300. Los resultados no exponen PII. */

var INFOBIP_HOSTS_PERMITIDOS_LEY2300 = ['api.infobip.com'];

/**
 * Acepta únicamente la base HTTPS oficial de Infobip antes de construir payloads con PII.
 * @param {*} valor Base URL configurada.
 * @returns {string} Origen HTTPS normalizado o vacío si es inseguro.
 */
function _normalizarUrlInfobipLey2300(valor) {
  var texto = String(valor || '').trim();
  if (!texto || !/^https:\/\//i.test(texto)) return '';
  try {
    var url = new URL(texto);
    var host = String(url.hostname || '').toLowerCase();
    if (url.protocol !== 'https:' || url.username || url.password || (url.port && url.port !== '443') || url.search || url.hash || url.pathname !== '/') return '';
    if (_esHostPrivadoInfobipLey2300(host) || !_esHostInfobipPermitidoLey2300(host)) return '';
    return 'https://' + host;
  } catch (error) {
    return '';
  }
}

/** @param {string} host Hostname normalizado. @returns {boolean} true solo para dominios Infobip aprobados. */
function _esHostInfobipPermitidoLey2300(host) {
  if (INFOBIP_HOSTS_PERMITIDOS_LEY2300.indexOf(host) !== -1) return true;
  return /^(?:[a-z0-9-]+\.)+api\.infobip\.com$/.test(host);
}

/** @param {string} host Hostname. @returns {boolean} true si es IP o rango no enrutable/privado. */
function _esHostPrivadoInfobipLey2300(host) {
  if (/^\[.*\]$/.test(host) || host === 'localhost' || host.indexOf(':') !== -1) return true;
  var match = host.match(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/);
  if (!match) return false;
  var octetos = match.slice(1).map(Number);
  if (octetos.some(function(octeto) { return octeto > 255; })) return true;
  return octetos[0] === 0 || octetos[0] === 10 || octetos[0] === 127 ||
    (octetos[0] === 169 && octetos[1] === 254) ||
    (octetos[0] === 172 && octetos[1] >= 16 && octetos[1] <= 31) ||
    (octetos[0] === 192 && octetos[1] === 168);
}

/**
 * Clasifica una respuesta HTTP de Infobip sin conservar su cuerpo.
 * @param {number} statusCode Código HTTP devuelto por el proveedor.
 * @returns {{tipo:string,causa:string}}
 */
function _clasificarRespuestaSmsLey2300(statusCode) {
  if (statusCode >= 300 && statusCode < 400) return { tipo: 'RECHAZADO', causa: 'CONFIGURACION' };
  if (statusCode === 400 || statusCode === 404 || statusCode === 422) return { tipo: 'RECHAZADO', causa: 'DATOS_CONTACTO' };
  if (statusCode === 401 || statusCode === 403) return { tipo: 'RECHAZADO', causa: 'CONFIGURACION' };
  if (statusCode === 408 || statusCode === 429 || statusCode >= 500) return { tipo: 'TEMPORAL', causa: 'TEMPORAL' };
  return { tipo: 'RECHAZADO', causa: 'RECHAZO_DEFINITIVO' };
}

var INFOBIP_MESSAGE_ID_MAX_LENGTH_LEY2300 = 256;

/**
 * Acepta referencias opacas de proveedor y descarta valores que puedan contener PII.
 * @param {*} value Referencia externa a validar.
 * @returns {string} Referencia permitida o vacío si no cumple la política.
 */
function _sanearMessageIdInfobipLey2300(value) {
  var messageId = String(value || '').trim();
  if (!messageId || messageId.length > INFOBIP_MESSAGE_ID_MAX_LENGTH_LEY2300) return '';
  if (!/^[A-Za-z0-9][A-Za-z0-9._-]*$/.test(messageId)) return '';
  if (/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(messageId)) return '';
  var posibleTelefono = messageId.replace(/[.()-]/g, '');
  return /^\+?\d{7,15}$/.test(posibleTelefono) ? '' : messageId;
}

/**
 * Extrae la referencia de proveedor de una respuesta JSON sin registrar su cuerpo.
 * @param {string} body Cuerpo de respuesta de Infobip.
 * @returns {string} messageId validado o vacío.
 */
function _extraerMessageIdSmsLey2300(body) {
  try {
    var parsed = JSON.parse(body || '{}');
    return _sanearMessageIdInfobipLey2300(parsed.messages && parsed.messages[0] && parsed.messages[0].messageId);
  } catch (error) {
    return '';
  }
}

/**
 * Envía un SMS individual y retorna únicamente metadatos seguros para el ledger.
 * @param {{entregaId?:string,celular:string,nombre:string,inmobiliaria:string}} entrega Datos efímeros de la entrega.
 * @returns {{ok:boolean,tipo:string,causa:string,statusCode:number,messageId:string,subintentos:number}}
 */
function _enviarSmsInfobip(entrega) {
  var celular = normalizarCelularLey2300(entrega && entrega.celular);
  if (!celular) return { ok: false, tipo: 'RECHAZADO', causa: 'DATOS_CONTACTO', statusCode: 0, messageId: '', subintentos: 0 };

  var props = PropertiesService.getScriptProperties();
  var baseUrl = _normalizarUrlInfobipLey2300(props.getProperty('INFOBIP_BASE_URL'));
  var apiKey = props.getProperty('INFOBIP_API_KEY');
  var sender = props.getProperty('INFOBIP_SENDER') || 'Ley2300';
  if (!baseUrl || !apiKey) return { ok: false, tipo: 'RECHAZADO', causa: 'CONFIGURACION', statusCode: 0, messageId: '', subintentos: 0 };

  var mensaje = String(entrega.nombre || '') + ', con ocasión del Contrato de Arrendamiento celebrado con ' +
    String(entrega.inmobiliaria || '') + ', El Libertador SA le informa nuestros canales disponibles: ' +
    'Celular/Fijo, WhatsApp y SMS – unidireccional de salida. Si desea autorizar o actualizar los canales de contacto directo - ' +
    'Ley 2300 de 2023, podrá hacerlo al correo autorizacioncanalesdecontacto@ellibertador.co';
  var payload = { messages: [{ from: sender, destinations: [{ to: celular }], text: mensaje }] };

  try {
    var response = UrlFetchApp.fetch(baseUrl + '/sms/2/text/advanced', {
      method: 'post', contentType: 'application/json', headers: { Authorization: 'App ' + apiKey },
      payload: JSON.stringify(payload), muteHttpExceptions: true, followRedirects: false
    });
    var statusCode = Number(response.getResponseCode()) || 0;
    if (statusCode === 200 || statusCode === 201) {
      var messageId = _extraerMessageIdSmsLey2300(response.getContentText());
      return { ok: true, tipo: 'ACEPTADO', causa: '', statusCode: statusCode, messageId: messageId, subintentos: 0 };
    }
    var clasificacion = _clasificarRespuestaSmsLey2300(statusCode);
    return { ok: false, tipo: clasificacion.tipo, causa: clasificacion.causa, statusCode: statusCode, messageId: '', subintentos: 0 };
  } catch (error) {
    // Una excepción después de construir la solicitud no permite saber si el proveedor la aceptó.
    return { ok: false, tipo: 'AMBIGUO', causa: 'AMBIGUO', statusCode: 0, messageId: '', subintentos: 0 };
  }
}

/**
 * Procesa entregas SMS conservando compatibilidad con el arreglo tabular anterior.
 * @param {Array} entradas Entregas identificadas o filas con encabezado legado.
 * @returns {{enviados:number,fallidos:number,resultados:Array,abortado:boolean}}
 */
function procesarEnvioSmsLey2300(entradas) {
  var entregas = _normalizarEntradasSmsLey2300(entradas);
  var resultados = [];
  for (var indice = 0; indice < entregas.length; indice++) {
    var entrega = entregas[indice];
    var resultado = _enviarSmsInfobip(entrega);
    resultados.push(_resultadoSmsLey2300(entrega, resultado));
    if (indice < entregas.length - 1) Utilities.sleep(100);
  }
  var enviados = resultados.filter(function(resultado) { return resultado.ok; }).length;
  _registrarEvento_('INFO', 'Servicios_InfobipSms.js', 'Envío SMS Ley 2300 completado', 'Enviados: ' + enviados + ' | Fallidos: ' + (resultados.length - enviados));
  return { enviados: enviados, fallidos: resultados.length - enviados, resultados: resultados, errores: [], abortado: false };
}

/** @param {Array} entradas Datos de entrada. @returns {Array} Entregas efímeras normalizadas. */
function _normalizarEntradasSmsLey2300(entradas) {
  if (!Array.isArray(entradas) || !entradas.length) return [];
  if (Array.isArray(entradas[0])) {
    return entradas.slice(1).map(function(fila) { return { nombre: String(fila[0] || '').trim(), celular: String(fila[1] || '').trim(), inmobiliaria: String(fila[2] || '').trim() }; });
  }
  return entradas;
}

/** @param {Object} entrega Entrega de entrada. @param {Object} transporte Resultado de transporte. @returns {Object} Resultado sin PII. */
function _resultadoSmsLey2300(entrega, transporte) {
  return { entregaId: String(entrega.entregaId || ''), ok: transporte.ok, tipo: transporte.tipo, causa: transporte.causa, statusCode: transporte.statusCode, messageId: transporte.messageId, subintentos: transporte.subintentos };
}

/** @param {Array} destinatarios Alias legado. @returns {Object} Resumen por entrega. */
function enviarSmsMasivoLey2300(destinatarios) { return procesarEnvioSmsLey2300(destinatarios); }
