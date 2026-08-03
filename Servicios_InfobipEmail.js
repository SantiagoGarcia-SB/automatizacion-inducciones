/**
 * ============================================================
 * Servicios_InfobipEmail.js — Envío de Email vía API de Infobip
 *
 * Cumplimiento Ley 2300: envía correos electrónicos a arrendatarios/
 * codeudores de solicitudes aprobadas usando la plantilla
 * "CORREO LEY 2300" configurada en Infobip.
 *
 * Credenciales en Script Properties:
 *   INFOBIP_BASE_URL, INFOBIP_API_KEY, INFOBIP_EMAIL_FROM,
 *   INFOBIP_EMAIL_TEMPLATE_ID
 * ============================================================
 */

/**
 * Envía un email individual vía API de Infobip usando plantilla.
 * @param {string} email - Dirección de correo del destinatario
 * @param {string} nombre - Nombre del destinatario (placeholder {$firstName})
 * @param {string} inmobiliaria - Nombre de la inmobiliaria (placeholder {$data Inmobiliaria})
 * @returns {{ok: boolean, mensaje: string, statusCode?: number, messageId?: string}}
 */
function _enviarEmailInfobip(email, nombre, inmobiliaria) {
  var props = PropertiesService.getScriptProperties();
  var baseUrl = props.getProperty('INFOBIP_BASE_URL');
  var apiKey = props.getProperty('INFOBIP_API_KEY');
  var emailFrom = props.getProperty('INFOBIP_EMAIL_FROM');
  var templateId = props.getProperty('INFOBIP_EMAIL_TEMPLATE_ID');

  if (!baseUrl || !apiKey || !emailFrom || !templateId) {
    return { ok: false, mensaje: 'Credenciales de Infobip Email no configuradas.' };
  }

  // Normalizar base URL (asegurar https:// y sin trailing slash)
  baseUrl = baseUrl.replace(/\/+$/, '');
  if (baseUrl.indexOf('https://') !== 0) {
    baseUrl = 'https://' + baseUrl.replace(/^https?:\/\//, '');
  }

  var url = baseUrl + '/email/3/send';

  // Construir payload multipart/form-data
  var toJson = JSON.stringify({
    to: email,
    placeholders: {
      firstName: nombre,
      'data Inmobiliaria': inmobiliaria
    }
  });

  var boundary = '----InfobipBoundary' + new Date().getTime();
  var payload = '';
  payload += '--' + boundary + '\r\n';
  payload += 'Content-Disposition: form-data; name="from"\r\n\r\n';
  payload += 'El Libertador · Inducciones <' + emailFrom + '>\r\n';
  payload += '--' + boundary + '\r\n';
  payload += 'Content-Disposition: form-data; name="to"\r\n\r\n';
  payload += toJson + '\r\n';
  payload += '--' + boundary + '\r\n';
  payload += 'Content-Disposition: form-data; name="templateId"\r\n\r\n';
  payload += templateId + '\r\n';
  payload += '--' + boundary + '\r\n';
  payload += 'Content-Disposition: form-data; name="subject"\r\n\r\n';
  payload += 'Información de canales de contacto · Ley 2300\r\n';
  payload += '--' + boundary + '\r\n';
  payload += 'Content-Disposition: form-data; name="replyTo"\r\n\r\n';
  payload += 'autorizacioncanalesdecontacto@ellibertador.co\r\n';
  payload += '--' + boundary + '--\r\n';

  var options = {
    method: 'post',
    contentType: 'multipart/form-data; boundary=' + boundary,
    headers: { 'Authorization': 'App ' + apiKey },
    payload: payload,
    muteHttpExceptions: true
  };

  var MAX_REINTENTOS = 2;
  var PAUSA_429 = 2000;

  try {
    var response;
    var code;
    var body;

    for (var intento = 0; intento <= MAX_REINTENTOS; intento++) {
      response = UrlFetchApp.fetch(url, options);
      code = response.getResponseCode();
      body = response.getContentText();

      if (code !== 429) break;
      if (intento < MAX_REINTENTOS) Utilities.sleep(PAUSA_429);
    }

    if (code === 200 || code === 201) {
      var msgId = 'N/A';
      try {
        var respObj = JSON.parse(body);
        msgId = respObj.messages && respObj.messages[0] ? respObj.messages[0].messageId : 'N/A';
        Logger.log('Infobip Email messageId: ' + msgId + ' | to: ' + email);
      } catch (e) { /* no-op */ }
      return { ok: true, mensaje: 'Email enviado a ' + email, statusCode: code, messageId: msgId };
    } else {
      return { ok: false, mensaje: 'Infobip respondió ' + code + ': ' + body, statusCode: code };
    }
  } catch (e) {
    return { ok: false, mensaje: 'Error de red: ' + e.message };
  }
}

/**
 * Valida el formato básico de una dirección de correo electrónico.
 * Verifica que contenga @ y un dominio con al menos un punto.
 * No pretende cumplir RFC 5322 — es validación de formato simple.
 *
 * @param {string} email - Dirección de correo a validar
 * @returns {boolean} true si el formato es válido, false en caso contrario
 */
function _validarFormatoEmail(email) {
  if (!email || typeof email !== 'string') return false;

  var trimmed = email.trim();
  if (!trimmed) return false;

  var partes = trimmed.split('@');
  if (partes.length !== 2) return false;

  var local = partes[0];
  var dominio = partes[1];

  if (!local || !dominio) return false;
  if (dominio.indexOf('.') === -1) return false;

  // El dominio no debe terminar ni empezar con punto
  if (dominio.charAt(0) === '.' || dominio.charAt(dominio.length - 1) === '.') return false;

  return true;
}

/**
 * Elimina destinatarios duplicados por dirección de email (case-insensitive).
 * Mantiene la primera ocurrencia de cada email único.
 *
 * @param {Array<{nombre: string, email: string, inmobiliaria: string}>} lista - Lista de destinatarios
 * @returns {{unicos: Array<{nombre: string, email: string, inmobiliaria: string}>, duplicadosEliminados: number}}
 */
function _deduplicarDestinatarios(lista) {
  if (!lista || !Array.isArray(lista)) {
    return { unicos: [], duplicadosEliminados: 0 };
  }

  var vistos = {};
  var unicos = [];
  var duplicadosEliminados = 0;

  for (var i = 0; i < lista.length; i++) {
    var item = lista[i];
    var emailKey = (item.email || '').toLowerCase().trim();

    if (vistos[emailKey]) {
      duplicadosEliminados++;
    } else {
      vistos[emailKey] = true;
      unicos.push(item);
    }
  }

  return { unicos: unicos, duplicadosEliminados: duplicadosEliminados };
}

/**
 * Función principal: procesa solicitudes aprobadas y envía emails automáticamente.
 * Reemplaza la carga manual de CSV de correos en Infobip.
 * Se integra con procesarDatosMejorado() de Cumplimiento.js.
 *
 * Flujo:
 *   1. Validación de entrada (null/vacío/solo headers)
 *   2. Extracción de destinatarios desde filas
 *   3. Validación de formato de email (_validarFormatoEmail)
 *   4. Deduplicación de emails válidos (_deduplicarDestinatarios)
 *   5. Envío iterativo con rate limiting (200ms entre envíos)
 *   6. Circuit breaker: si >50% consecutivos fallan, aborta
 *   7. Registro en Logs_Sistema
 *
 * @param {Array} datosCorreos - Array de filas [['NOMBRE','CORREO','INMOBILIARIA'], ...datos]
 * @returns {{
 *   enviados: number,
 *   fallidos: number,
 *   invalidosFormato: number,
 *   duplicadosEliminados: number,
 *   errores: Array<{email: string, nombre: string, error: string}>,
 *   abortado: boolean
 * }}
 */
function procesarEnvioEmailLey2300(datosCorreos) {
  // Resultado por defecto
  var resultadoVacio = {
    enviados: 0,
    fallidos: 0,
    invalidosFormato: 0,
    duplicadosEliminados: 0,
    errores: [],
    abortado: false
  };

  // 1. Validación de entrada
  if (!datosCorreos || datosCorreos.length <= 1) {
    return resultadoVacio;
  }

  // 2. Extraer destinatarios (skip header row [0])
  var todosDestinatarios = [];
  for (var i = 1; i < datosCorreos.length; i++) {
    var fila = datosCorreos[i];
    todosDestinatarios.push({
      nombre: String(fila[0] || '').trim(),
      email: String(fila[1] || '').trim(),
      inmobiliaria: String(fila[2] || '').trim()
    });
  }

  // 3. Validar formato de email — separar válidos de inválidos
  var validos = [];
  var invalidosFormato = 0;

  for (var j = 0; j < todosDestinatarios.length; j++) {
    var dest = todosDestinatarios[j];
    if (_validarFormatoEmail(dest.email)) {
      validos.push(dest);
    } else {
      invalidosFormato++;
    }
  }

  // 4. Deduplicar emails válidos
  var dedupResultado = _deduplicarDestinatarios(validos);
  var destinatariosUnicos = dedupResultado.unicos;
  var duplicadosEliminados = dedupResultado.duplicadosEliminados;

  // Si no quedan destinatarios válidos y únicos, retornar
  if (destinatariosUnicos.length === 0) {
    return {
      enviados: 0,
      fallidos: 0,
      invalidosFormato: invalidosFormato,
      duplicadosEliminados: duplicadosEliminados,
      errores: [],
      abortado: false
    };
  }

  // 5. Envío iterativo con rate limiting y circuit breaker
  var enviados = 0;
  var fallidos = 0;
  var errores = [];
  var abortado = false;
  var fallosConsecutivos = 0;
  var totalDestinatarios = destinatariosUnicos.length;
  var umbralAbort = Math.ceil(totalDestinatarios * 0.5);

  for (var k = 0; k < totalDestinatarios; k++) {
    var d = destinatariosUnicos[k];

    var resultado = _enviarEmailInfobip(d.email, d.nombre, d.inmobiliaria);

    if (resultado.ok) {
      enviados++;
      fallosConsecutivos = 0;
    } else {
      fallidos++;
      fallosConsecutivos++;
      errores.push({ email: d.email, nombre: d.nombre, error: resultado.mensaje });

      // Circuit breaker: abortar si fallos consecutivos >= umbral
      if (fallosConsecutivos >= umbralAbort) {
        abortado = true;
        break;
      }
    }

    // Rate limiting: pausa de 200ms entre envíos (no después del último)
    if (k < totalDestinatarios - 1) {
      Utilities.sleep(200);
    }
  }

  // 6. Registrar evento resumen en Logs_Sistema
  var nivel = abortado ? 'CRITICAL' : 'INFO';
  var resumen = 'Enviados: ' + enviados + ' | Fallidos: ' + fallidos +
    ' | Inválidos formato: ' + invalidosFormato +
    ' | Duplicados eliminados: ' + duplicadosEliminados;

  if (abortado) {
    resumen += ' | ABORTADO por circuit breaker (' + fallosConsecutivos + ' fallos consecutivos)';
  }

  _registrarEvento_(nivel, 'Servicios_InfobipEmail.js',
    'Envío Email Ley 2300 ' + (abortado ? 'ABORTADO' : 'completado'),
    resumen);

  if (errores.length > 0 && !abortado) {
    _registrarEvento_('WARN', 'Servicios_InfobipEmail.js',
      'Errores en envío Email',
      errores.slice(0, 5).map(function(e) { return e.email + ': ' + e.error; }).join(' | '));
  }

  return {
    enviados: enviados,
    fallidos: fallidos,
    invalidosFormato: invalidosFormato,
    duplicadosEliminados: duplicadosEliminados,
    errores: errores,
    abortado: abortado
  };
}
