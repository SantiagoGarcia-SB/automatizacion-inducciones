/**
 * ============================================================
 * Servicios_NotificacionNuevo.js — Notificaciones del nuevo sistema
 *
 * Centraliza el envío de correos generados por la Web App nueva.
 * Separado de Notificaciones.js (legacy) para no mezclarse.
 * Los repos llaman a estas funciones; ellos no envían correo.
 * ============================================================
 */

/**
 * Notifica al comercial que una solicitud tiene error en terceros.
 * @param {string} uuid - UUID de la solicitud
 * @param {string} arrendatario - Nombre del arrendatario
 * @param {string} idLote - ID del lote
 * @param {string} emailComercial - Email del comercial
 */
function notificarErrorAlComercial(uuid, arrendatario, idLote, emailComercial) {
  if (!emailComercial || emailComercial.indexOf('@') === -1) return;

  var nombre = emailComercial.split('@')[0].split('.')[0];
  nombre = nombre.charAt(0).toUpperCase() + nombre.slice(1);

  // URL del aplicativo (deployment actual + ?v=2)
  var urlApp = ScriptApp.getService().getUrl() + '?v=2';

  var htmlBody = _envolver_([
    _bloque_cabecera_('Acción requerida'),
    _bloque_barra_estado_(_C_ROJO, '&#9888;', 'Necesitamos tu ayuda'),
    _bloque_cuerpo_inicio_(
      'Hola, ' + nombre,
      'Encontramos un detalle que necesita corrección para la solicitud de <strong>' + arrendatario + '</strong> del lote <strong>' + idLote + '</strong>. Ingresa al aplicativo para ver qué necesitamos y enviar la información.'
    ),
    _bloque_boton_('Ver detalle y responder', urlApp),
    _bloque_nota_('Si el botón no funciona, copia este enlace en tu navegador: ' + urlApp),
    _bloque_pie_()
  ].join(''));

  MailApp.sendEmail({
    to: emailComercial,
    cc: obtenerCorreosLideres().join(','),
    bcc: BCC_AUDITORIA,
    subject: '⚠️ Necesitamos tu ayuda · ' + arrendatario,
    htmlBody: htmlBody,
    name: 'Inducciones · El Libertador'
  });
}

/**
 * Notifica al auxiliar que el comercial envió una corrección.
 * @param {string} arrendatario - Nombre del arrendatario
 * @param {string} emailAuxiliar - Email del auxiliar que registró el error
 * @param {string} emailComercial - Email del comercial que respondió
 */
function notificarCorreccionAlAuxiliar(arrendatario, emailAuxiliar, emailComercial) {
  if (!emailAuxiliar || emailAuxiliar.indexOf('@') === -1) return;

  var nombreComercial = emailComercial.split('@')[0].split('.').map(function(p) {
    return p.charAt(0).toUpperCase() + p.slice(1);
  }).join(' ');

  // URL del aplicativo
  var urlApp = ScriptApp.getService().getUrl() + '?v=2';

  var htmlBody = _envolver_([
    _bloque_cabecera_('Corrección recibida'),
    _bloque_barra_estado_('#0fbdb7', '&#10003;', 'Respuesta del comercial'),
    _bloque_cuerpo_inicio_(
      'Corrección recibida',
      '<strong>' + nombreComercial + '</strong> envió la corrección para la solicitud de <strong>' + arrendatario + '</strong>. Revísala en el aplicativo y procede con la radicación en SAI.'
    ),
    _bloque_boton_('Revisar corrección', urlApp),
    _bloque_nota_('Si el botón no funciona, copia este enlace: ' + urlApp),
    _bloque_pie_()
  ].join(''));

  MailApp.sendEmail({
    to: emailAuxiliar,
    cc: obtenerCorreosLideres().join(','),
    bcc: BCC_AUDITORIA,
    subject: '⚡ Corrección recibida · ' + arrendatario,
    htmlBody: htmlBody,
    name: 'Inducciones · El Libertador'
  });
}
