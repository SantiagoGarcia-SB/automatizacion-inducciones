/** Servicio de transporte Email de Ley 2300. Nunca registra destinos ni cuerpos de proveedor. */
var INFOBIP_EMAIL_MAX_REINTENTOS_429 = 2;
var INFOBIP_EMAIL_UMBRAL_CIRCUITO = 5;

/** @param {number} statusCode Código HTTP. @returns {{tipo:string,causa:string}} Clasificación allowlisted. */
function _clasificarRespuestaEmailLey2300(statusCode) {
  if (statusCode >= 300 && statusCode < 400) return { tipo: 'RECHAZADO', causa: 'CONFIGURACION' };
  if (statusCode === 400 || statusCode === 404 || statusCode === 422) return { tipo: 'RECHAZADO', causa: 'DATOS_CONTACTO' };
  if (statusCode === 401 || statusCode === 403) return { tipo: 'RECHAZADO', causa: 'CONFIGURACION' };
  if (statusCode === 408 || statusCode === 429 || statusCode >= 500) return { tipo: 'TEMPORAL', causa: 'TEMPORAL' };
  return { tipo: 'RECHAZADO', causa: 'RECHAZO_DEFINITIVO' };
}

/** @param {string} body Cuerpo de proveedor. @returns {string} Referencia segura o vacío. */
function _extraerMessageIdEmailLey2300(body) {
  try {
    var parsed = JSON.parse(body || '{}');
    return _sanearMessageIdInfobipLey2300(parsed.messages && parsed.messages[0] && parsed.messages[0].messageId);
  } catch (error) { return ''; }
}

/** @param {string} email Dirección a validar. @returns {boolean} true si es formato permitido. */
function _validarFormatoEmail(email) { return !!normalizarCorreoLey2300(email); }

/**
 * Envía una entrega de email. Los reintentos 429 son subintentos del mismo intento lógico.
 * @param {{entregaId?:string,email:string,nombre:string,inmobiliaria:string}} entrega Datos efímeros.
 * @returns {{ok:boolean,tipo:string,causa:string,statusCode:number,messageId:string,subintentos:number}}
 */
function _enviarEmailInfobip(entrega) {
  var email = normalizarCorreoLey2300(entrega && entrega.email);
  if (!email) return { ok: false, tipo: 'RECHAZADO', causa: 'DATOS_CONTACTO', statusCode: 0, messageId: '', subintentos: 0 };
  var props = PropertiesService.getScriptProperties();
  var baseUrl = _normalizarUrlInfobipLey2300(props.getProperty('INFOBIP_BASE_URL'));
  var apiKey = props.getProperty('INFOBIP_API_KEY');
  var emailFrom = props.getProperty('INFOBIP_EMAIL_FROM');
  var templateId = props.getProperty('INFOBIP_EMAIL_TEMPLATE_ID');
  if (!baseUrl || !apiKey || !emailFrom || !templateId) return { ok: false, tipo: 'RECHAZADO', causa: 'CONFIGURACION', statusCode: 0, messageId: '', subintentos: 0 };

  var boundary = '----InfobipBoundary' + new Date().getTime();
  var toJson = JSON.stringify({ to: email, placeholders: { firstName: String(entrega.nombre || ''), 'data Inmobiliaria': String(entrega.inmobiliaria || '') } });
  var payload = '--' + boundary + '\r\nContent-Disposition: form-data; name="from"\r\n\r\nEl Libertador · Inducciones <' + emailFrom + '>\r\n' +
    '--' + boundary + '\r\nContent-Disposition: form-data; name="to"\r\n\r\n' + toJson + '\r\n' +
    '--' + boundary + '\r\nContent-Disposition: form-data; name="templateId"\r\n\r\n' + templateId + '\r\n' +
    '--' + boundary + '\r\nContent-Disposition: form-data; name="subject"\r\n\r\nInformación de canales de contacto · Ley 2300\r\n' +
    '--' + boundary + '\r\nContent-Disposition: form-data; name="replyTo"\r\n\r\nautorizacioncanalesdecontacto@ellibertador.co\r\n--' + boundary + '--\r\n';
  var options = { method: 'post', contentType: 'multipart/form-data; boundary=' + boundary, headers: { Authorization: 'App ' + apiKey }, payload: payload, muteHttpExceptions: true, followRedirects: false };
  try {
    var response; var statusCode = 0; var subintentos = 0;
    for (var intento = 0; intento <= INFOBIP_EMAIL_MAX_REINTENTOS_429; intento++) {
      response = UrlFetchApp.fetch(baseUrl + '/email/3/send', options);
      statusCode = Number(response.getResponseCode()) || 0;
      if (statusCode !== 429) break;
      if (intento < INFOBIP_EMAIL_MAX_REINTENTOS_429) { subintentos++; Utilities.sleep(2000); }
    }
    if (statusCode === 200 || statusCode === 201) {
      var messageId = _extraerMessageIdEmailLey2300(response.getContentText());
      return { ok: true, tipo: 'ACEPTADO', causa: '', statusCode: statusCode, messageId: messageId, subintentos: subintentos };
    }
    var clasificacion = _clasificarRespuestaEmailLey2300(statusCode);
    return { ok: false, tipo: clasificacion.tipo, causa: clasificacion.causa, statusCode: statusCode, messageId: '', subintentos: subintentos };
  } catch (error) {
    return { ok: false, tipo: 'AMBIGUO', causa: 'AMBIGUO', statusCode: 0, messageId: '', subintentos: 0 };
  }
}

/**
 * Procesa entregas de email con circuito de cinco fallos consecutivos. Las no invocadas no aparecen en resultados.
 * @param {Array} entradas Entregas identificadas o arreglo tabular legado.
 * @returns {{enviados:number,fallidos:number,invalidosFormato:number,duplicadosEliminados:number,errores:Array,resultados:Array,abortado:boolean}}
 */
function procesarEnvioEmailLey2300(entradas) {
  var entregas = _normalizarEntradasEmailLey2300(entradas);
  var resultados = []; var fallosConsecutivos = 0; var abortado = false;
  for (var indice = 0; indice < entregas.length; indice++) {
    var resultado = _enviarEmailInfobip(entregas[indice]);
    resultados.push(_resultadoEmailLey2300(entregas[indice], resultado));
    fallosConsecutivos = resultado.ok ? 0 : fallosConsecutivos + 1;
    if (fallosConsecutivos >= INFOBIP_EMAIL_UMBRAL_CIRCUITO) { abortado = true; break; }
    if (indice < entregas.length - 1) Utilities.sleep(200);
  }
  var enviados = resultados.filter(function(resultado) { return resultado.ok; }).length;
  _registrarEvento_(abortado ? 'WARN' : 'INFO', 'Servicios_InfobipEmail.js', 'Envío Email Ley 2300 ' + (abortado ? 'interrumpido' : 'completado'), 'Enviados: ' + enviados + ' | Fallidos: ' + (resultados.length - enviados) + ' | Circuito: ' + (abortado ? 'abierto' : 'cerrado'));
  return { enviados: enviados, fallidos: resultados.length - enviados, invalidosFormato: 0, duplicadosEliminados: 0, errores: [], resultados: resultados, abortado: abortado };
}

/** @param {Array} entradas Datos de entrada. @returns {Array} Entregas efímeras. */
function _normalizarEntradasEmailLey2300(entradas) {
  if (!Array.isArray(entradas) || !entradas.length) return [];
  if (Array.isArray(entradas[0])) return entradas.slice(1).map(function(fila) { return { nombre: String(fila[0] || '').trim(), email: String(fila[1] || '').trim(), inmobiliaria: String(fila[2] || '').trim() }; });
  return entradas;
}

/** @param {Object} entrega Entrega. @param {Object} transporte Resultado. @returns {Object} Resultado sin PII. */
function _resultadoEmailLey2300(entrega, transporte) {
  return { entregaId: String(entrega.entregaId || ''), ok: transporte.ok, tipo: transporte.tipo, causa: transporte.causa, statusCode: transporte.statusCode, messageId: transporte.messageId, subintentos: transporte.subintentos };
}

/** @param {Array} lista Lista heredada. @returns {{unicos:Array,duplicadosEliminados:number}} Compatibilidad sin deduplicar entregas. */
function _deduplicarDestinatarios(lista) { return { unicos: Array.isArray(lista) ? lista.slice() : [], duplicadosEliminados: 0 }; }
