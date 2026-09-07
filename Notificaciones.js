

// ── Tokens de color de marca (Manual de Marca El Libertador) ──
const _C_ROJO = "#BD0F14";   // Color primario
const _C_NAVY = "#253150";   // Color secundario
const _C_GRIS = "#706F6F";   // Color terciario

const BCC_AUDITORIA = PropertiesService.getScriptProperties().getProperty('BCC_AUDITORIA') || "santiago.garcia@segurosbolivar.com";


// ============================================================
//  FUNCIÓN CANÓNICA DE ESCALAMIENTO PROGRESIVO
//  Determina nivel, emoji y mensaje según días transcurridos.
//  Reemplaza la lógica duplicada en enviarRecordatoriosPazYSalvoDiario
//  y enviarRecordatoriosErrorTercerosDiario.
// ============================================================

/**
 * Determina el nivel de escalamiento basado en días transcurridos.
 * Función canónica reutilizable para todas las notificaciones con
 * escalamiento progresivo (paz y salvo, error en terceros, etc.).
 *
 * @param {number} diasTranscurridos — Días desde último aviso o ingreso (entero no negativo)
 * @returns {{nivel: string, emoji: string, mensajeExtra: string}}
 *   nivel: "normal"|"recordatorio"|"elevado"|"urgente"|"critico"
 *   emoji: Emoji para el asunto del correo
 *   mensajeExtra: HTML adicional según umbral alcanzado
 */
function calcularEscalamiento(diasTranscurridos) {
  var dias = typeof diasTranscurridos === "number" ? Math.floor(diasTranscurridos) : 0;
  if (dias < 0) dias = 0;

  if (dias >= 21) {
    return {
      nivel: "critico",
      emoji: "🚨",
      mensajeExtra: '<br><br><strong style="color:#BD0F14;">⚠️ ALERTA CR&Iacute;TICA:</strong> Este lote lleva m&aacute;s de 21 d&iacute;as sin respuesta. Se requiere acci&oacute;n inmediata para evitar el cierre del tr&aacute;mite.'
    };
  }

  if (dias >= 14) {
    return {
      nivel: "urgente",
      emoji: "⚠️",
      mensajeExtra: '<br><br><strong style="color:#E65100;">Atenci&oacute;n:</strong> Este lote lleva m&aacute;s de 14 d&iacute;as en espera. Por favor priorizar el env&iacute;o del documento.'
    };
  }

  if (dias >= 7) {
    return {
      nivel: "elevado",
      emoji: "📌",
      mensajeExtra: '<br><br><strong style="color:#253150;">Nota:</strong> Este lote supera los 7 d&iacute;as sin respuesta. El equipo de inducciones est&aacute; monitoreando.'
    };
  }

  if (dias >= 3) {
    return {
      nivel: "recordatorio",
      emoji: "🔔",
      mensajeExtra: ""
    };
  }

  // dias < 3: nivel normal, sin escalamiento
  return {
    nivel: "normal",
    emoji: "",
    mensajeExtra: ""
  };
}


// ============================================================
//  RESOLUCIÓN DE EMAIL POR LOTE (mapa pre-cargado)
//  Función canónica reutilizable por todas las notificaciones.
//  Validates: Requirements 3.1, 3.5
// ============================================================

/**
 * Resuelve el email del comercial por ID de lote desde un mapa pre-cargado.
 * Omite el lote si no se encuentra el ID o el email no contiene "@".
 *
 * @param {Object<string, string>} mapaLoteEmail — Mapa idLote → email (pre-cargado de Hoja_Control col F → col B)
 * @param {string} idLote — ID del lote a resolver
 * @returns {string|null} Email del comercial, o null si no encontrado o inválido
 */
function resolverEmailPorLote(mapaLoteEmail, idLote) {
  if (!mapaLoteEmail || typeof idLote !== "string" || !idLote.trim()) {
    _registrarEvento_("WARN", "Notificaciones.js", "resolverEmailPorLote: ID de lote vacío o mapa inválido", "idLote: " + String(idLote));
    return null;
  }

  var email = mapaLoteEmail[idLote.trim()];

  if (email === undefined || email === null || String(email).trim() === "") {
    _registrarEvento_("WARN", "Notificaciones.js", "resolverEmailPorLote: ID de lote no encontrado en mapa", "idLote: " + idLote);
    return null;
  }

  email = String(email).trim();

  if (email.indexOf("@") === -1) {
    _registrarEvento_("WARN", "Notificaciones.js", "resolverEmailPorLote: email sin '@' para lote", "idLote: " + idLote + " | email: " + email);
    return null;
  }

  return email;
}


// ============================================================
//  ORQUESTADOR DIARIO DE RECORDATORIOS (Consolidación)
//  Lee Hoja_Control y Control_General UNA sola vez y procesa
//  secuencialmente paz y salvo + error en terceros.
//  Validates: Requirements 3.1, 3.2, 3.4, 3.5
// ============================================================

/**
 * Orquestador diario de recordatorios. Lee Hoja_Control y Control_General
 * una sola vez y procesa secuencialmente recordatorios de paz y salvo y
 * de error en terceros.
 *
 * @sheets_read 2 (Hoja_Control + Control_General, una vez cada una)
 * @sheets_write 1 por bloque contiguo de filas actualizadas
 */
function ejecutarRecordatoriosDiarios() {
  if (typeof NotificationConfig_estaActiva === 'function' && !NotificationConfig_estaActiva('recordatorios_diarios')) {
    if (typeof NotificationConfig_registrarSupresion === 'function') NotificationConfig_registrarSupresion('recordatorios_diarios');
    return;
  }

  // ── 1. Abrir libro de control una sola vez ──
  var ss = SpreadsheetRegistry_get(ID_HOJA_CONTROL);
  var sheetHC = ss.getSheetByName("Hoja_Control");
  var sheetCG = ss.getSheetByName("Control_General");

  if (!sheetCG || !sheetHC) {
    _registrarEvento_("ERROR", "Notificaciones.js", "ejecutarRecordatoriosDiarios: hojas no encontradas");
    return;
  }

  // ── 2. Leer Hoja_Control UNA vez → construir mapaLoteEmail ──
  var dataHC = sheetHC.getDataRange().getValues();
  var mapaLoteEmail = {};
  for (var i = 1; i < dataHC.length; i++) {
    var emailHC = String(dataHC[i][1]).trim();  // Columna B
    var idLoteHC = String(dataHC[i][5]).trim(); // Columna F
    if (idLoteHC) {
      mapaLoteEmail[idLoteHC] = emailHC;
    }
  }

  // ── 3. Leer Control_General UNA vez ──
  var ultimaFilaCG = sheetCG.getLastRow();
  if (ultimaFilaCG < 2) {
    _registrarEvento_("INFO", "Notificaciones.js", "ejecutarRecordatoriosDiarios: Control_General sin datos");
    return;
  }
  var dataCG = sheetCG.getRange(1, 1, ultimaFilaCG, 61).getValues();

  // ── 4. Clasificar lotes por estado (paz y salvo / error en terceros) ──
  var hoy = new Date();
  hoy.setHours(0, 0, 0, 0);

  var lotesPazYSalvo = {};
  var lotesErrorTerceros = {};

  for (var j = 1; j < dataCG.length; j++) {
    var idLote = String(dataCG[j][0]).trim();
    var estado = String(dataCG[j][9]).trim().toUpperCase();
    var fIngreso = dataCG[j][2];
    var fAviso = dataCG[j][60]; // Columna BI (índice 60)

    if (!idLote) continue;

    var destino = null;
    if (estado === "PENDIENTE PAZ Y SALVO") {
      destino = lotesPazYSalvo;
    } else if (estado === "ERROR EN TERCEROS") {
      destino = lotesErrorTerceros;
    }

    if (!destino) continue;

    if (!destino[idLote]) {
      var fechaRef = (fAviso instanceof Date && !isNaN(fAviso)) ? fAviso : fIngreso;
      if (!(fechaRef instanceof Date) && typeof fechaRef === "string") {
        var partes = fechaRef.split(/[/ -]/);
        if (partes.length >= 3) {
          fechaRef = new Date(partes[2], partes[1] - 1, partes[0]);
        }
      }

      destino[idLote] = {
        timestamp: (fechaRef instanceof Date && !isNaN(fechaRef)) ? new Date(fechaRef).setHours(0, 0, 0, 0) : null,
        filas: []
      };
    }
    destino[idLote].filas.push(j + 1); // fila 1-based en la hoja
  }

  // ── 5. Calcular total de emails y verificar cuota ──
  var lotesPSIds = Object.keys(lotesPazYSalvo);
  var lotesETIds = Object.keys(lotesErrorTerceros);
  var totalEmailsRequeridos = lotesPSIds.length + lotesETIds.length;

  if (totalEmailsRequeridos === 0) {
    return; // Nada que enviar
  }

  var cuotaRestante = MailApp.getRemainingDailyQuota();
  if (cuotaRestante < totalEmailsRequeridos) {
    _registrarEvento_(
      "WARN",
      "Notificaciones.js",
      "ejecutarRecordatoriosDiarios: cuota insuficiente, envío abortado",
      "Cuota restante: " + cuotaRestante + " | Requeridos: " + totalEmailsRequeridos
    );
    return;
  }

  // ── 6. Procesar recordatorios de Paz y Salvo ──
  _procesarRecordatoriosEnLote_(sheetCG, lotesPazYSalvo, mapaLoteEmail, hoy, "PENDIENTE PAZ Y SALVO");

  // ── 7. Procesar recordatorios de Error en Terceros ──
  _procesarRecordatoriosEnLote_(sheetCG, lotesErrorTerceros, mapaLoteEmail, hoy, "ERROR EN TERCEROS");
}

/**
 * Procesa y envía recordatorios para un conjunto de lotes del mismo tipo.
 * Función interna del orquestador — no debe invocarse directamente.
 *
 * @param {GoogleAppsScript.Spreadsheet.Sheet} sheetCG — Hoja Control_General
 * @param {Object} lotesMapa — Mapa idLote → {timestamp, filas}
 * @param {Object} mapaLoteEmail — Mapa idLote → email (pre-cargado de Hoja_Control)
 * @param {Date} hoy — Fecha actual normalizada a medianoche
 * @param {string} tipoEstado — "PENDIENTE PAZ Y SALVO" | "ERROR EN TERCEROS"
 */
function _procesarRecordatoriosEnLote_(sheetCG, lotesMapa, mapaLoteEmail, hoy, tipoEstado) {
  var esPazYSalvo = (tipoEstado === "PENDIENTE PAZ Y SALVO");
  var filasParaActualizarFecha = [];

  for (var idLote in lotesMapa) {
    if (!lotesMapa.hasOwnProperty(idLote)) continue;

    var lote = lotesMapa[idLote];
    if (!lote.timestamp) continue;

    var diffDias = Math.floor((hoy.getTime() - lote.timestamp) / (1000 * 60 * 60 * 24));
    if (diffDias < 3) continue;

    // ── Resolver email del comercial ──
    var emailReal = resolverEmailPorLote(mapaLoteEmail, idLote);
    if (!emailReal) continue;

    // ── Calcular escalamiento ──
    var escalamiento = calcularEscalamiento(diffDias);
    var nivelEscalamiento = escalamiento.nivel;
    var asuntoEmoji = escalamiento.emoji;
    var mensajeExtra = escalamiento.mensajeExtra;

    // ── Construir email ──
    var nombreComercial = emailANombre(emailReal, "PRIMER_NOMBRE") || "Ejecutivo Comercial";
    var cadenaJerarquica = obtenerCadenaJerarquica(emailReal);
    var ccs = [];
    for (var k = 0; k < cadenaJerarquica.length; k++) {
      if (cadenaJerarquica[k] && ccs.indexOf(cadenaJerarquica[k]) === -1) {
        ccs.push(cadenaJerarquica[k]);
      }
    }
    var ccsStr = ccs.filter(function(c) { return c && c.length > 0; }).join(",");

    var barraColor = diffDias >= 14 ? _C_ROJO : _C_GRIS;
    var htmlBody;

    if (esPazYSalvo) {
      htmlBody = _envolver_([
        _bloque_cabecera_(nivelEscalamiento === "critico" ? "Acci\u00f3n urgente" : "Recordatorio"),
        _bloque_barra_estado_(barraColor, "&#128260;", "Pendiente hace " + diffDias + " d\u00edas"),
        _bloque_cuerpo_inicio_(
          "Hola, " + nombreComercial,
          "El lote <strong>" + idLote + "</strong> est&aacute; a la espera del soporte de Paz y Salvo para ser aprobado." + mensajeExtra
        ),
        _bloque_chips_([
          { label: "ID Lote", valor: idLote, colorVal: _C_ROJO },
          { label: "D&iacute;as de espera", valor: String(diffDias), colorVal: diffDias >= 14 ? _C_ROJO : _C_NAVY }
        ]),
        _bloque_nota_(
          '<strong style="color:#253150;">C&oacute;mo enviar el soporte:</strong> ' +
          'Responde a este correo usando <strong>"Responder a todos"</strong> y adjunta ' +
          'el documento de Paz y Salvo. El equipo de inducciones lo gestionar&aacute; de inmediato.'
        ),
        _bloque_pie_()
      ].join(""));
    } else {
      htmlBody = _envolver_([
        _bloque_cabecera_(nivelEscalamiento === "critico" ? "Acci\u00f3n urgente" : "Recordatorio"),
        _bloque_barra_estado_(barraColor, "&#9888;", "Error en terceros hace " + diffDias + " d\u00edas"),
        _bloque_cuerpo_inicio_(
          "Hola, " + nombreComercial,
          "El lote <strong>" + idLote + "</strong> presenta errores en los datos de terceros que impiden continuar con el proceso de inducci&oacute;n. La operaci&oacute;n ya solicit&oacute; la correcci&oacute;n correspondiente." + mensajeExtra
        ),
        _bloque_chips_([
          { label: "ID Lote", valor: idLote, colorVal: _C_ROJO },
          { label: "D&iacute;as pendiente", valor: String(diffDias), colorVal: diffDias >= 14 ? _C_ROJO : _C_NAVY }
        ]),
        _bloque_nota_(
          '<strong style="color:#253150;">Acci&oacute;n requerida:</strong> ' +
          'Verifica y corrige los datos de terceros solicitados por el equipo de inducciones. ' +
          'Una vez corregidos, responde a este correo usando <strong>"Responder a todos"</strong> ' +
          'para que la operaci&oacute;n pueda continuar con el tr&aacute;mite.'
        ),
        _bloque_pie_()
      ].join(""));
    }

    // ── Enviar email ──
    var asuntoTipo = esPazYSalvo
      ? (asuntoEmoji + " Paz y salvo " + (nivelEscalamiento === "critico" ? "URGENTE" : "a\u00fan pendiente") + " \u00b7 Lote " + idLote)
      : (asuntoEmoji + " Error en terceros " + (nivelEscalamiento === "critico" ? "URGENTE" : "pendiente de correcci\u00f3n") + " \u00b7 Lote " + idLote);

    try {
      MailApp.sendEmail({
        to: emailReal,
        subject: asuntoTipo,
        htmlBody: htmlBody,
        cc: ccsStr,
        bcc: BCC_AUDITORIA,
        name: "Inducciones \u00b7 El Libertador"
      });

      // Registrar filas para actualizar fecha de aviso
      for (var f = 0; f < lote.filas.length; f++) {
        filasParaActualizarFecha.push(lote.filas[f]);
      }

      var tipoLog = esPazYSalvo ? "paz y salvo" : "error terceros";
      _registrarEvento_("INFO", "Notificaciones.js", "Recordatorio " + tipoLog + " enviado", "Lote: " + idLote + " | Destino: " + emailReal);
    } catch (err) {
      var tipoErr = esPazYSalvo ? "paz y salvo" : "error terceros";
      _registrarEvento_("ERROR", "Notificaciones.js", "Error al enviar recordatorio " + tipoErr, "Lote: " + idLote + " | Error: " + err.message);
    }
  }

  // ── Actualizar fechas de aviso en batch (columna BI = 61) ──
  if (filasParaActualizarFecha.length > 0) {
    var ahora = new Date();
    var operaciones = [];
    for (var m = 0; m < filasParaActualizarFecha.length; m++) {
      operaciones.push({ fila: filasParaActualizarFecha[m], columna: 61, valor: ahora });
    }
    BatchWriter_escribir(sheetCG, operaciones);
  }
}


// ============================================================
//  CONFIGURACIÓN DE TRIGGER — RECORDATORIOS DIARIOS
//  Ejecutar UNA vez manualmente desde el editor de Apps Script.
//  Reemplaza los triggers separados de enviarRecordatoriosPazYSalvoDiario
//  y enviarRecordatoriosErrorTercerosDiario por uno solo consolidado.
//  Validates: Requirements 3.2
// ============================================================

/**
 * Configura el trigger diario consolidado de recordatorios.
 * - Elimina triggers existentes de enviarRecordatoriosPazYSalvoDiario
 * - Elimina triggers existentes de enviarRecordatoriosErrorTercerosDiario
 * - Elimina triggers existentes de ejecutarRecordatoriosDiarios (idempotente)
 * - Crea un único trigger que ejecuta ejecutarRecordatoriosDiarios a las 8:00am Colombia
 *
 * Ejecutar manualmente una sola vez desde el editor de Apps Script.
 */
function configurarTriggerRecordatoriosDiarios() {
  if (typeof reconciliarConfiguracionNotificaciones === 'function') {
    return reconciliarConfiguracionNotificaciones();
  }

  var triggers = ScriptApp.getProjectTriggers();
  var funcionesAEliminar = [
    'enviarRecordatoriosPazYSalvoDiario',
    'enviarRecordatoriosErrorTercerosDiario',
    'ejecutarRecordatoriosDiarios'
  ];
  for (var i = 0; i < triggers.length; i++) {
    if (funcionesAEliminar.indexOf(triggers[i].getHandlerFunction()) !== -1) {
      ScriptApp.deleteTrigger(triggers[i]);
    }
  }
  ScriptApp.newTrigger('ejecutarRecordatoriosDiarios')
    .timeBased()
    .atHour(8)
    .nearMinute(0)
    .everyDays(1)
    .inTimezone('America/Bogota')
    .create();
  Logger.log('Trigger configurado: ejecutarRecordatoriosDiarios → diario 8:00am (America/Bogota)');
}


// ============================================================
//  BLOQUES HTML — Construcción modular
//  Cada función retorna un <tr> listo para insertar
//  dentro de la tabla maestra del correo.
// ============================================================

/**
 * Cabecera: logo + franja roja vertical + etiqueta de tipo.
 * @param {string} tagTexto  Texto del badge superior derecho.
 */
function _bloque_cabecera_(tagTexto) {
  return `
  <tr>
    <td style="background:#253150;padding:22px 28px;">
      <table width="100%" cellpadding="0" cellspacing="0" border="0">
        <tr>
          <td>
            <table cellpadding="0" cellspacing="0" border="0">
              <tr>
                <td style="width:4px;background:#BD0F14;">&nbsp;</td>
                <td style="padding-left:14px;">
                  <div style="color:#ffffff;font-size:16px;font-weight:900;letter-spacing:1px;
                              font-family:Arial,sans-serif;text-transform:uppercase;">
                    EL LIBERTADOR
                  </div>
                  <div style="color:rgba(255,255,255,0.45);font-size:9px;letter-spacing:2px;
                              font-family:Arial,sans-serif;text-transform:uppercase;margin-top:4px;">
                    Inducciones &amp; Radicaci&oacute;n
                  </div>
                </td>
              </tr>
            </table>
          </td>
          <td align="right" valign="middle">
            <span style="background:rgba(189,15,20,0.18);border:1px solid rgba(189,15,20,0.4);
                         border-radius:4px;padding:4px 10px;color:#ff8888;font-size:10px;
                         font-weight:700;letter-spacing:0.8px;font-family:Arial,sans-serif;
                         text-transform:uppercase;">
              ${tagTexto}
            </span>
          </td>
        </tr>
      </table>
    </td>
  </tr>`;
}

/**
 * Barra de estado de color sólido bajo el header.
 * @param {string} bgColor  Color de fondo (#hex).
 * @param {string} icono    Entidad HTML del ícono (ej: "&#10003;").
 * @param {string} texto    Texto descriptivo del estado.
 */
function _bloque_barra_estado_(bgColor, icono, texto) {
  return `
  <tr>
    <td style="background:${bgColor};padding:10px 28px;">
      <span style="color:#ffffff;font-size:11px;font-weight:700;letter-spacing:1px;
                   font-family:Arial,sans-serif;text-transform:uppercase;">
        ${icono}&nbsp; ${texto}
      </span>
    </td>
  </tr>`;
}

/**
 * Saludo y texto introductorio.
 * @param {string} saludo  Título principal (H1 del correo).
 * @param {string} intro   Párrafo de contexto (puede contener <strong>).
 */
function _bloque_cuerpo_inicio_(saludo, intro) {
  return `
  <tr>
    <td style="padding:26px 28px 8px;">
      <div style="font-size:21px;font-weight:900;color:#253150;
                  font-family:Arial,sans-serif;margin-bottom:10px;">
        ${saludo}
      </div>
      <div style="font-size:13px;color:#64748b;line-height:1.7;font-family:Arial,sans-serif;">
        ${intro}
      </div>
    </td>
  </tr>`;
}

/**
 * Celda individual de datos (chip).
 * Uso interno de _bloque_chips_.
 */
function _chip_celda_(c) {
  const color = c.colorVal || "#253150";
  return `
  <td width="50%" style="padding:4px;" valign="top">
    <div style="background:#f8fafc;border:1px solid #e2e8f0;border-radius:8px;padding:13px 16px;">
      <div style="font-size:9px;font-weight:700;letter-spacing:1px;text-transform:uppercase;
                  color:#94a3b8;margin-bottom:5px;font-family:Arial,sans-serif;">
        ${c.label}
      </div>
      <div style="font-size:15px;font-weight:900;color:${color};font-family:Arial,sans-serif;">
        ${c.valor}
      </div>
    </div>
  </td>`;
}

/**
 * Grilla de chips de datos (2 columnas).
 * @param {Array} chips  [{label, valor, colorVal?, full?}]
 *   full:true  → ocupa fila completa (ej: Comercial, Paz y salvo).
 *   colorVal   → color del valor (default: #253150).
 */
function _bloque_chips_(chips) {
  let filas   = "";
  let pendiente = null;

  for (let i = 0; i < chips.length; i++) {
    const c = chips[i];

    if (c.full) {
      // Vaciar chip pendiente antes del full
      if (pendiente) {
        filas += `<tr>${_chip_celda_(pendiente)}<td width="50%" style="padding:4px;">&nbsp;</td></tr>`;
        pendiente = null;
      }
      filas += `
      <tr>
        <td colspan="2" style="padding:4px;" valign="top">
          <div style="background:#f8fafc;border:1px solid #e2e8f0;border-radius:8px;padding:13px 16px;">
            <div style="font-size:9px;font-weight:700;letter-spacing:1px;text-transform:uppercase;
                        color:#94a3b8;margin-bottom:7px;font-family:Arial,sans-serif;">
              ${c.label}
            </div>
            <div style="font-family:Arial,sans-serif;">${c.valor}</div>
          </div>
        </td>
      </tr>`;
    } else {
      if (pendiente) {
        filas += `<tr>${_chip_celda_(pendiente)}${_chip_celda_(c)}</tr>`;
        pendiente = null;
      } else {
        pendiente = c;
      }
    }
  }

  // Chip impar sobrante
  if (pendiente) {
    filas += `<tr>${_chip_celda_(pendiente)}<td width="50%" style="padding:4px;">&nbsp;</td></tr>`;
  }

  return `
  <tr>
    <td style="padding:16px 28px 0;">
      <table width="100%" cellpadding="0" cellspacing="0" border="0">${filas}</table>
    </td>
  </tr>`;
}

/**
 * Listado de contratos incluidos en el lote.
 * @param {Array} filas  Array filasParaInsertar de motorDeAuditoria.
 *   filas[i][23] = Arrendatario
 *   filas[i][19] = Dirección
 */
function _bloque_contratos_(filas) {
  const rows = filas.map((f, idx) => `
    <tr>
      <td style="padding:11px 0;border-bottom:1px solid #f1f5f9;font-family:Arial,sans-serif;">
        <div style="font-size:13px;font-weight:700;color:#253150;">
          ${f[23] || "&mdash;"}
        </div>
        <div style="font-size:11px;color:#94a3b8;margin-top:2px;">
          ${f[19] || "&mdash;"}
        </div>
      </td>
      <td align="right" style="padding:11px 0;border-bottom:1px solid #f1f5f9;">
        <span style="font-size:10px;font-weight:700;color:#BD0F14;background:#FFF0F0;
                     border-radius:4px;padding:2px 8px;font-family:Arial,sans-serif;">
          ${String(idx + 1).padStart(2, "0")}
        </span>
      </td>
    </tr>`).join("");

  return `
  <tr>
    <td style="padding:20px 28px 0;">
      <div style="height:1px;background:#f1f5f9;margin-bottom:14px;"></div>
      <div style="font-size:9px;font-weight:700;letter-spacing:1.2px;text-transform:uppercase;
                  color:#94a3b8;margin-bottom:10px;font-family:Arial,sans-serif;">
        Contratos incluidos
      </div>
      <table width="100%" cellpadding="0" cellspacing="0" border="0">
        ${rows}
      </table>
    </td>
  </tr>`;
}

/**
 * Colores estándar por estado de contrato/lote, usados en badges y tablas
 * de reportes. Centraliza el criterio visual para no repetirlo en cada bloque.
 * @param {string} estado  Valor exacto de la columna "Estado" en Control_General.
 */
function _colorPorEstado_(estado) {
  const mapa = {
    "PENDIENTE RADICAR"     : _C_GRIS,
    "PENDIENTE PAZ Y SALVO" : "#E65100",
    "PENDIENTE ASIGNAR"     : _C_NAVY,
    "EN ANÁLISIS"           : _C_NAVY,
    "ERROR EN TERCEROS"     : _C_ROJO,
    "RADICADO"              : "#3B6D11",
    "TERMINADO"             : "#3B6D11",
  };
  return mapa[estado] || _C_GRIS;
}

/**
 * Badge de estado genérico (para tablas de reporte), coloreado según _colorPorEstado_.
 * @param {string} estado  Texto del estado a mostrar.
 * @param {number} [cantidad]  Si se pasa, se muestra "ESTADO (n)".
 */
function _badge_estado_generico_(estado, cantidad) {
  const color = _colorPorEstado_(estado);
  const texto = cantidad ? `${estado} (${cantidad})` : estado;
  return `<span style="display:inline-block;padding:2px 8px;border-radius:4px;font-size:10px;
                       font-weight:700;color:${color};background:${color}18;
                       font-family:Arial,sans-serif;margin:1px 3px 1px 0;white-space:nowrap;">
            ${texto}
          </span>`;
}

/**
 * Tabla de seguimiento de inducciones por lote — usada en el reporte de gestión.
 * No asume un único estado por lote: cada lote puede tener contratos en estados
 * distintos (RADICADO/ERROR EN TERCEROS se marcan manualmente fila por fila), así
 * que la columna Estado muestra el desglose real en vez de un valor único.
 * @param {Array} lotes  [{idLote, comercial, fechaIngresoStr, contratos, estados:{ESTADO:n}}]
 */
function _bloque_tabla_seguimiento_(lotes) {
  const filasHtml = lotes.map(l => {
    const badges = Object.keys(l.estados)
      .sort()
      .map(estado => _badge_estado_generico_(estado, l.estados[estado]))
      .join("");

    return `
    <tr>
      <td style="padding:10px 8px;border-bottom:1px solid #f1f5f9;font-family:Arial,sans-serif;
                 font-size:12px;font-weight:700;color:#253150;white-space:nowrap;">
        ${l.idLote}
      </td>
      <td style="padding:10px 8px;border-bottom:1px solid #f1f5f9;font-family:Arial,sans-serif;
                 font-size:11px;color:#64748b;">
        ${l.comercial || "&mdash;"}
      </td>
      <td style="padding:10px 8px;border-bottom:1px solid #f1f5f9;font-family:Arial,sans-serif;
                 font-size:11px;color:#64748b;white-space:nowrap;">
        ${l.fechaIngresoStr || "&mdash;"}
      </td>
      <td align="center" style="padding:10px 8px;border-bottom:1px solid #f1f5f9;
                 font-family:Arial,sans-serif;font-size:11px;font-weight:700;color:#253150;">
        ${l.contratos}
      </td>
      <td style="padding:10px 8px;border-bottom:1px solid #f1f5f9;">
        ${badges}
      </td>
    </tr>`;
  }).join("");

  const filasVacio = `
    <tr><td colspan="5" style="padding:16px 8px;text-align:center;font-family:Arial,sans-serif;
        font-size:12px;color:#94a3b8;">No hay lotes activos en este momento.</td></tr>`;

  return `
  <tr>
    <td style="padding:20px 28px 0;">
      <div style="height:1px;background:#f1f5f9;margin-bottom:14px;"></div>
      <div style="font-size:9px;font-weight:700;letter-spacing:1.2px;text-transform:uppercase;
                  color:#94a3b8;margin-bottom:10px;font-family:Arial,sans-serif;">
        Seguimiento de inducciones por lote
      </div>
      <table width="100%" cellpadding="0" cellspacing="0" border="0">
        <tr>
          <td style="padding:0 8px 8px;font-family:Arial,sans-serif;font-size:9px;font-weight:700;
                     letter-spacing:0.8px;text-transform:uppercase;color:#94a3b8;">Lote</td>
          <td style="padding:0 8px 8px;font-family:Arial,sans-serif;font-size:9px;font-weight:700;
                     letter-spacing:0.8px;text-transform:uppercase;color:#94a3b8;">Comercial</td>
          <td style="padding:0 8px 8px;font-family:Arial,sans-serif;font-size:9px;font-weight:700;
                     letter-spacing:0.8px;text-transform:uppercase;color:#94a3b8;">Fecha</td>
          <td align="center" style="padding:0 8px 8px;font-family:Arial,sans-serif;font-size:9px;
                     font-weight:700;letter-spacing:0.8px;text-transform:uppercase;color:#94a3b8;">Contratos</td>
          <td style="padding:0 8px 8px;font-family:Arial,sans-serif;font-size:9px;font-weight:700;
                     letter-spacing:0.8px;text-transform:uppercase;color:#94a3b8;">Estado</td>
        </tr>
        ${lotes.length ? filasHtml : filasVacio}
      </table>
    </td>
  </tr>`;
}

/**
 * Nota / aviso con borde izquierdo rojo.
 * @param {string} html  Contenido del aviso (puede incluir <strong>).
 */
function _bloque_nota_(html) {
  return `
  <tr>
    <td style="padding:16px 28px 0;">
      <div style="background:#f8fafc;border-left:3px solid #BD0F14;padding:12px 16px;
                  font-size:12px;color:#64748b;line-height:1.65;font-family:Arial,sans-serif;">
        ${html}
      </div>
    </td>
  </tr>`;
}

/**
 * Botón de acción centrado.
 * @param {string} texto  Texto del botón.
 * @param {string} url    URL de destino.
 */
function _bloque_boton_(texto, url) {
  return `
  <tr>
    <td style="padding:22px 28px 0;" align="center">
      <a href="${url}"
         style="background:#253150;color:#ffffff;text-decoration:none;font-size:13px;
                font-weight:700;padding:13px 28px;border-radius:6px;display:inline-block;
                letter-spacing:0.5px;font-family:Arial,sans-serif;">
        ${texto} &rarr;
      </a>
    </td>
  </tr>`;
}

/**
 * Pie de correo con motivo de puntos de marca.
 */
function _bloque_pie_() {
  return `
  <tr>
    <td style="background:#f8fafc;border-top:1px solid #e2e8f0;padding:16px 28px;margin-top:8px;">
      <table width="100%" cellpadding="0" cellspacing="0" border="0">
        <tr>
          <td valign="middle">
            <div style="font-size:11px;font-weight:700;color:#253150;font-family:Arial,sans-serif;">
              El Libertador SA &middot; Inducciones
            </div>
            <div style="font-size:10px;color:#94a3b8;margin-top:3px;font-family:Arial,sans-serif;">
              Notificaci&oacute;n autom&aacute;tica &middot;
              <a href="https://www.ellibertador.co"
                 style="color:#BD0F14;text-decoration:none;">ellibertador.co</a>
            </div>
          </td>
          <td align="right" valign="middle" style="padding-left:16px;">
            <div style="color:#BD0F14;opacity:0.3;font-size:13px;line-height:1.1;
                        font-family:Arial,sans-serif;text-align:center;">
              &#9679;<br>&#124;<br>&#9679;<br>&#124;<br>&#9679;
            </div>
          </td>
        </tr>
      </table>
    </td>
  </tr>`;
}

/**
 * Envuelve todos los bloques en la tabla maestra del correo.
 * @param {string} bloques  Concatenación de los <tr> generados.
 * @returns {string}        HTML completo listo para MailApp / GmailApp.
 */
function _envolver_(bloques) {
  return `<div style="font-family:Arial,sans-serif;background:#f0f2f5;padding:24px 0;">
  <table width="100%" cellpadding="0" cellspacing="0" border="0"
         style="background:#f0f2f5;">
    <tr>
      <td align="center" style="padding:0 16px;">
        <table width="580" cellpadding="0" cellspacing="0" border="0"
               style="max-width:580px;background:#ffffff;border:1px solid #dddddd;">
          ${bloques}
          <tr><td style="height:28px;">&nbsp;</td></tr>
        </table>
      </td>
    </tr>
  </table>
</div>`;
}

/**
 * Badge reutilizable de paz y salvo.
 * @param {string} tipo  "adjunto" | "checkbox"
 */
function _badge_paz_y_salvo_(tipo) {
  if (tipo === "adjunto") {
    return `<span style="display:inline-block;padding:4px 12px;border-radius:4px;font-size:11px;
                         font-weight:700;background:#E0F2FE;color:#0C447C;
                         font-family:Arial,sans-serif;">
              Con adjunto de paz y salvo
            </span>`;
  }
  return `<span style="display:inline-block;padding:4px 12px;border-radius:4px;font-size:11px;
                       font-weight:700;background:#EAF3DE;color:#3B6D11;
                       font-family:Arial,sans-serif;">
            Certificaci&oacute;n manual
          </span>`;
}

/**
 * Badge reutilizable de estado de lote.
 * @param {string} texto  Texto del estado.
 */
function _badge_estado_pendiente_() {
  return `<span style="display:inline-block;padding:4px 12px;border-radius:4px;font-size:11px;
                       font-weight:700;background:#FFF3E0;color:#E65100;
                       font-family:Arial,sans-serif;">
            &#9888; Pendiente paz y salvo
          </span>`;
}

// ============================================================
//  EMAIL 3 — PENDIENTE PAZ Y SALVO (Trigger de edición)
//  Reemplaza enviarCorreoPazYSalvo() de Triggers.gs
// ============================================================

function enviarCorreoPazYSalvo(e) {
  if (!NotificationConfig_estaActiva('paz_y_salvo')) {
    NotificationConfig_registrarSupresion('paz_y_salvo');
    return;
  }
  if (!e || !e.range) return;

  // ── Bloqueo por caché para evitar envíos duplicados ──
  const cache   = CacheService.getScriptCache();
  const lockKey = "lock_" + e.range.getRow();
  const row = e.range.getRow();
  if (cache.get(lockKey)) return;
  cache.put(lockKey, "active", 5);

  const sheetActual = e.range.getSheet();
  if (sheetActual.getName().trim() !== "Control_General") return;

  const colStart = e.range.getColumn();
const colEnd = e.range.getLastColumn();
if (10 < colStart || 10 > colEnd) return;

  const estadoEditado = e.range.getValue().toString().trim().toUpperCase();
  if (estadoEditado !== "PENDIENTE PAZ Y SALVO") return;

  const idLoteActual = sheetActual.getRange(row, 1).getDisplayValue().trim();
  if (!idLoteActual) return;

  // ── Verificar que TODO el lote esté en ese estado ──
  const ultimaFila = sheetActual.getLastRow();
  const data       = sheetActual.getRange(2, 1, ultimaFila - 1, 11).getDisplayValues();

  let loteCompleto           = true;
  let emailComercialRespaldo = "";

  for (let i = 0; i < data.length; i++) {
    const idFila = data[i][0].toString().trim();
    if (idFila !== idLoteActual) continue;
    if (data[i][9].toString().trim().toUpperCase() !== "PENDIENTE PAZ Y SALVO") {
      loteCompleto = false;
      break;
    }
    if (!emailComercialRespaldo) emailComercialRespaldo = data[i][10].toString().trim();
  }

  if (!loteCompleto) return;

  // ── Bloqueo a nivel de lote ──
  const loteLockKey = "lote_enviado_" + idLoteActual.replace(/\s+/g, "");
  if (cache.get(loteLockKey)) return;
  cache.put(loteLockKey, "enviado", 30);

  // ── Obtener email real del comercial desde Hoja_Control ──
  const ss           = sheetActual.getParent();
  const sheetControl = ss.getSheetByName("Hoja_Control");
  let emailFinal     = emailComercialRespaldo;

  if (sheetControl) {
    const logs  = sheetControl.getDataRange().getDisplayValues();
    const idNrm = idLoteActual.trim().toUpperCase().replace(/\s+/g, "");
    for (let j = 1; j < logs.length; j++) {
      if (logs[j][5].trim().toUpperCase().replace(/\s+/g, "") === idNrm) {
        emailFinal = logs[j][1].trim();
        break;
      }
    }
  }

  if (!emailFinal || !emailFinal.includes("@")) return;

  const correoDirector  = obtenerCorreoDeDirector(emailFinal);
  const nombreComercial = emailANombre(emailFinal, 'PRIMER_NOMBRE') || 'Ejecutivo Comercial';
  const cadenaJerarquica = obtenerCadenaJerarquica(emailFinal);
  const ccParts = [correoDirector, ...cadenaJerarquica].filter(function(c) { return c && c.length > 0; });
  // Eliminar duplicados (el director ya viene en la cadena jerárquica)
  const correosCC = [...new Set(ccParts)].join(',');

  const htmlBody = _envolver_([

    _bloque_cabecera_("Acci&oacute;n requerida"),

    _bloque_barra_estado_(_C_ROJO, "&#9888;", "Pendiente de paz y salvo"),

    _bloque_cuerpo_inicio_(
      `Hola, ${nombreComercial}`,
      `Los contratos del lote <strong style="color:#253150;">${idLoteActual}</strong>
       han sido analizados satisfactoriamente. Para continuar con el proceso de aprobaci&oacute;n,
       necesitamos el documento de <strong>Paz y Salvo</strong> emitido por la inmobiliaria.`
    ),

    _bloque_chips_([
      { label: "ID de Lote", valor: idLoteActual,              colorVal: _C_ROJO },
      { label: "Estado",     valor: _badge_estado_pendiente_(), full: true        }
    ]),

    _bloque_nota_(
      `<strong style="color:#253150;">C&oacute;mo enviar el soporte:</strong>
       Responde a este correo usando <strong>"Responder a todos"</strong> y adjunta
       el documento de Paz y Salvo. El equipo de inducciones lo gestionar&aacute; de inmediato.`
    ),

    _bloque_pie_()

  ].join(""));

  try {
    MailApp.sendEmail({
      to:       emailFinal,
      subject:  `⚠️ Paz y salvo pendiente · Lote ${idLoteActual}`,
      htmlBody: htmlBody,
      cc:       correosCC,
      bcc:      BCC_AUDITORIA,
      name:     "Inducciones · El Libertador",
    });

    // Registrar fecha de aviso en columna BI (61)
    const fechaHoy = new Date();
    for (let i = 0; i < data.length; i++) {
      if (data[i][0].toString().trim() === idLoteActual) {
        sheetActual.getRange(i + 2, 61).setValue(fechaHoy);
      }
    }
    _registrarEvento_("INFO", "Notificaciones.js", "Correo paz y salvo enviado (onEdit)", "Lote: " + idLoteActual + " | Destino: " + emailFinal);
  } catch (err) {
    console.error("Error envío paz y salvo: " + err.message);
    _registrarEvento_("ERROR", "Notificaciones.js", "Error al enviar correo paz y salvo", "Lote: " + idLoteActual + " | Error: " + err.message);
  }
}


// ============================================================
//  EMAIL 4 — RECORDATORIO DIARIO DE PAZ Y SALVO
// ============================================================

/**
 * @deprecated Reemplazada por ejecutarRecordatoriosDiarios() que consolida
 * ambos recordatorios (paz y salvo + error en terceros) en una sola ejecución
 * con lecturas únicas a Hoja_Control y Control_General.
 * Se conserva temporalmente para seguridad de rollback.
 *
 * Revisa diariamente los lotes estancados y busca el correo real
 * haciendo el cruce entre Control_General y Hoja_Control.
 */
function enviarRecordatoriosPazYSalvoDiario() {
  if (!NotificationConfig_estaActiva('recordatorios_diarios')) {
    NotificationConfig_registrarSupresion('recordatorios_diarios');
    return;
  }

  const ss = SpreadsheetApp.openById("1Z0GLLJvinwaU6MK_iaduKBri8VqfCDEPeOfh9gThQhI");
  const sheetCG = ss.getSheetByName("Control_General");
  const sheetHC = ss.getSheetByName("Hoja_Control");
  
  if (!sheetCG || !sheetHC) {
    console.error("No se encontraron las hojas necesarias.");
    _registrarEvento_("ERROR", "Notificaciones.js", "enviarRecordatoriosPazYSalvoDiario: hojas no encontradas");
    return;
  }

  // 1. CARGAMOS HOJA_CONTROL EN UN MAPA (Para búsqueda ultra rápida)
  // Estructura: Col F (ID Lote) -> Col B (Email)
  const dataHC = sheetHC.getDataRange().getValues();
  const mapaEmailsLote = {};
  for (let i = 1; i < dataHC.length; i++) {
    const emailHC = String(dataHC[i][1]).trim(); // Columna B
    const idLoteHC = String(dataHC[i][5]).trim(); // Columna F
    if (idLoteHC) mapaEmailsLote[idLoteHC] = emailHC;
  }

  // 2. LEEMOS CONTROL_GENERAL PARA LOS PENDIENTES
  const ultimaFilaCG = sheetCG.getLastRow();
  const dataCG = sheetCG.getRange(1, 1, ultimaFilaCG, 61).getValues();
  
  const hoy = new Date();
  hoy.setHours(0, 0, 0, 0);
  const lotesParaAvisar = {};

  for (let i = 1; i < dataCG.length; i++) {
    const idLote = String(dataCG[i][0]).trim();
    const estado = String(dataCG[i][9]).trim().toUpperCase();
    const fIngreso = dataCG[i][2];  
    const fAviso = dataCG[i][60]; // Columna BI

    if (!idLote || estado !== "PENDIENTE PAZ Y SALVO") continue;

    if (!lotesParaAvisar[idLote]) {
      let fechaRef = (fAviso instanceof Date && !isNaN(fAviso)) ? fAviso : fIngreso;
      if (!(fechaRef instanceof Date) && typeof fechaRef === 'string') {
        const p = fechaRef.split(/[/ -]/);
        if (p.length >= 3) fechaRef = new Date(p[2], p[1] - 1, p[0]);
      }

      lotesParaAvisar[idLote] = { 
        timestamp: (fechaRef instanceof Date && !isNaN(fechaRef)) ? new Date(fechaRef).setHours(0,0,0,0) : null, 
        filas: [] 
      };
    }
    lotesParaAvisar[idLote].filas.push(i + 1);
  }

  // 3. PROCESAR Y ENVIAR
  const lotesIds = Object.keys(lotesParaAvisar);
  
  // Verificar cuota antes de enviar (Fase 2.2)
  if (!_verificarCuotaEmail_(lotesIds.length)) {
    _registrarEvento_("WARN", "Notificaciones.js", "Recordatorios no enviados: cuota insuficiente", "Lotes pendientes: " + lotesIds.length);
    return;
  }

  for (const idLote in lotesParaAvisar) {
    const lote = lotesParaAvisar[idLote];
    if (!lote.timestamp) continue;

    const diffDias = Math.floor((hoy.getTime() - lote.timestamp) / (1000 * 60 * 60 * 24));

    if (diffDias >= 3) {
      // ── A3: Escalamiento progresivo según días de espera ──
      let nivelEscalamiento = "recordatorio";
      let asuntoEmoji = "🔔";
      let mensajeExtra = "";

      if (diffDias >= 21) {
        nivelEscalamiento = "critico";
        asuntoEmoji = "🚨";
        mensajeExtra = `<br><br><strong style="color:#BD0F14;">⚠️ ALERTA CR&Iacute;TICA:</strong> Este lote lleva m&aacute;s de 21 d&iacute;as sin paz y salvo. Se requiere acci&oacute;n inmediata para evitar el cierre del tr&aacute;mite.`;
      } else if (diffDias >= 14) {
        nivelEscalamiento = "urgente";
        asuntoEmoji = "⚠️";
        mensajeExtra = `<br><br><strong style="color:#E65100;">Atenci&oacute;n:</strong> Este lote lleva m&aacute;s de 14 d&iacute;as en espera. Por favor priorizar el env&iacute;o del documento.`;
      } else if (diffDias >= 7) {
        nivelEscalamiento = "elevado";
        asuntoEmoji = "📌";
        mensajeExtra = `<br><br><strong style="color:#253150;">Nota:</strong> Este lote supera los 7 d&iacute;as sin respuesta. El equipo de inducciones est&aacute; monitoreando.`;
      }

      // --- EL CRUCE DE DATOS ---
      const emailReal = mapaEmailsLote[idLote];

      if (!emailReal || !emailReal.includes("@")) {
        console.warn(`⚠️ Lote ${idLote} omitido: No se encontró email real en Hoja_Control.`);
        continue;
      }

      const nombreComercial = emailANombre(emailReal, 'PRIMER_NOMBRE') || 'Ejecutivo Comercial';
      const cadenaJerarquica = obtenerCadenaJerarquica(emailReal);
      
      // CC solo a la cadena jerárquica directa del comercial (Director + Gerente)
      const ccs = [...new Set(cadenaJerarquica)].filter(function(c) { return c && c.length > 0; }).join(",");

      const barraColor = diffDias >= 14 ? _C_ROJO : _C_GRIS;

      const htmlBody = _envolver_([
        _bloque_cabecera_(nivelEscalamiento === "critico" ? "Acci&oacute;n urgente" : "Recordatorio"),
        _bloque_barra_estado_(barraColor, "&#128260;", `Pendiente hace ${diffDias} d&iacute;as`),
        _bloque_cuerpo_inicio_(
          `Hola, ${nombreComercial}`, 
          `El lote <strong>${idLote}</strong> est&aacute; a la espera del soporte de Paz y Salvo para ser aprobado.${mensajeExtra}`
        ),
        _bloque_chips_([
          { label: "ID Lote", valor: idLote, colorVal: _C_ROJO },
          { label: "D&iacute;as de espera", valor: String(diffDias), colorVal: diffDias >= 14 ? _C_ROJO : _C_NAVY }
        ]),
        _bloque_nota_(
      `<strong style="color:#253150;">C&oacute;mo enviar el soporte:</strong>
       Responde a este correo usando <strong>"Responder a todos"</strong> y adjunta
       el documento de Paz y Salvo. El equipo de inducciones lo gestionar&aacute; de inmediato.`
    ),

    _bloque_pie_()

  ].join(""));


      try {
        MailApp.sendEmail({
          to: emailReal,
          subject: `${asuntoEmoji} Paz y salvo ${nivelEscalamiento === 'critico' ? 'URGENTE' : 'aún pendiente'} · Lote ${idLote}`,
          htmlBody: htmlBody,
          cc: ccs,
          bcc: BCC_AUDITORIA,
          name: "Inducciones · El Libertador"
        });
        
        // Marcamos la fecha de aviso en BI para que el conteo reinicie
        lote.filas.forEach(f => sheetCG.getRange(f, 61).setValue(new Date()));
        
        console.log(`✅ Recordatorio enviado a ${emailReal} para lote ${idLote}`);
        _registrarEvento_("INFO", "Notificaciones.js", "Recordatorio paz y salvo enviado", "Lote: " + idLote + " | Destino: " + emailReal);
      } catch (e) {
        console.error(`❌ Error en lote ${idLote}: ${e.message}`);
        _registrarEvento_("ERROR", "Notificaciones.js", "Error al enviar recordatorio paz y salvo", "Lote: " + idLote + " | Error: " + e.message);
      }
    }
  }
}


// ============================================================
//  EMAIL 5 — RECORDATORIO DIARIO DE ERROR EN TERCEROS
// ============================================================

/**
 * @deprecated Reemplazada por ejecutarRecordatoriosDiarios() que consolida
 * ambos recordatorios (paz y salvo + error en terceros) en una sola ejecución
 * con lecturas únicas a Hoja_Control y Control_General.
 * Se conserva temporalmente para seguridad de rollback.
 *
 * Revisa diariamente los lotes en estado "ERROR EN TERCEROS" y envía
 * recordatorio al comercial (CC líderes + director) para que corrija
 * los datos de terceros. Mismo escalamiento que paz y salvo (3/7/14/21 días).
 * Usa columna BI (61) como fecha de último aviso.
 */
function enviarRecordatoriosErrorTercerosDiario() {
  if (!NotificationConfig_estaActiva('recordatorios_diarios')) {
    NotificationConfig_registrarSupresion('recordatorios_diarios');
    return;
  }

  const ss = SpreadsheetApp.openById("1Z0GLLJvinwaU6MK_iaduKBri8VqfCDEPeOfh9gThQhI");
  const sheetCG = ss.getSheetByName("Control_General");
  const sheetHC = ss.getSheetByName("Hoja_Control");

  if (!sheetCG || !sheetHC) {
    console.error("No se encontraron las hojas necesarias.");
    _registrarEvento_("ERROR", "Notificaciones.js", "enviarRecordatoriosErrorTercerosDiario: hojas no encontradas");
    return;
  }

  // 1. Mapa ID Lote → Email del comercial (Hoja_Control col F → col B)
  const dataHC = sheetHC.getDataRange().getValues();
  const mapaEmailsLote = {};
  for (let i = 1; i < dataHC.length; i++) {
    const emailHC = String(dataHC[i][1]).trim();
    const idLoteHC = String(dataHC[i][5]).trim();
    if (idLoteHC) mapaEmailsLote[idLoteHC] = emailHC;
  }

  // 2. Leer Control_General — filtrar ERROR EN TERCEROS
  const ultimaFilaCG = sheetCG.getLastRow();
  const dataCG = sheetCG.getRange(1, 1, ultimaFilaCG, 61).getValues();

  const hoy = new Date();
  hoy.setHours(0, 0, 0, 0);
  const lotesParaAvisar = {};

  for (let i = 1; i < dataCG.length; i++) {
    const idLote = String(dataCG[i][0]).trim();
    const estado = String(dataCG[i][9]).trim().toUpperCase();
    const fIngreso = dataCG[i][2];
    const fAviso = dataCG[i][60]; // Columna BI

    if (!idLote || estado !== "ERROR EN TERCEROS") continue;

    if (!lotesParaAvisar[idLote]) {
      let fechaRef = (fAviso instanceof Date && !isNaN(fAviso)) ? fAviso : fIngreso;
      if (!(fechaRef instanceof Date) && typeof fechaRef === 'string') {
        const p = fechaRef.split(/[/ -]/);
        if (p.length >= 3) fechaRef = new Date(p[2], p[1] - 1, p[0]);
      }

      lotesParaAvisar[idLote] = {
        timestamp: (fechaRef instanceof Date && !isNaN(fechaRef)) ? new Date(fechaRef).setHours(0,0,0,0) : null,
        filas: []
      };
    }
    lotesParaAvisar[idLote].filas.push(i + 1);
  }

  // 3. Procesar y enviar
  const lotesIds = Object.keys(lotesParaAvisar);

  if (!_verificarCuotaEmail_(lotesIds.length)) {
    _registrarEvento_("WARN", "Notificaciones.js", "Recordatorios error terceros no enviados: cuota insuficiente", "Lotes pendientes: " + lotesIds.length);
    return;
  }

  for (const idLote in lotesParaAvisar) {
    const lote = lotesParaAvisar[idLote];
    if (!lote.timestamp) continue;

    const diffDias = Math.floor((hoy.getTime() - lote.timestamp) / (1000 * 60 * 60 * 24));

    if (diffDias >= 3) {
      let nivelEscalamiento = "recordatorio";
      let asuntoEmoji = "🔔";
      let mensajeExtra = "";

      if (diffDias >= 21) {
        nivelEscalamiento = "critico";
        asuntoEmoji = "🚨";
        mensajeExtra = `<br><br><strong style="color:#BD0F14;">⚠️ ALERTA CR&Iacute;TICA:</strong> Este lote lleva m&aacute;s de 21 d&iacute;as con error en terceros sin corregir. Se requiere acci&oacute;n inmediata para evitar el cierre del tr&aacute;mite.`;
      } else if (diffDias >= 14) {
        nivelEscalamiento = "urgente";
        asuntoEmoji = "⚠️";
        mensajeExtra = `<br><br><strong style="color:#E65100;">Atenci&oacute;n:</strong> Este lote lleva m&aacute;s de 14 d&iacute;as sin correcci&oacute;n. Por favor priorizar la actualizaci&oacute;n de los datos.`;
      } else if (diffDias >= 7) {
        nivelEscalamiento = "elevado";
        asuntoEmoji = "📌";
        mensajeExtra = `<br><br><strong style="color:#253150;">Nota:</strong> Este lote supera los 7 d&iacute;as sin correcci&oacute;n. El equipo de inducciones est&aacute; monitoreando.`;
      }

      const emailReal = mapaEmailsLote[idLote];

      if (!emailReal || !emailReal.includes("@")) {
        console.warn(`⚠️ Lote ${idLote} omitido (error terceros): No se encontró email real en Hoja_Control.`);
        continue;
      }

      const nombreComercial = emailANombre(emailReal, 'PRIMER_NOMBRE') || 'Ejecutivo Comercial';
      var cadenaJerarquica = obtenerCadenaJerarquica(emailReal);
      // CC solo a la cadena jerárquica directa del comercial (Director + Gerente)
      var ccs = [...new Set(cadenaJerarquica)].filter(function(c) { return c && c.length > 0; }).join(',');

      const barraColor = diffDias >= 14 ? _C_ROJO : _C_GRIS;

      const htmlBody = _envolver_([
        _bloque_cabecera_(nivelEscalamiento === "critico" ? "Acci&oacute;n urgente" : "Recordatorio"),
        _bloque_barra_estado_(barraColor, "&#9888;", `Error en terceros hace ${diffDias} d&iacute;as`),
        _bloque_cuerpo_inicio_(
          `Hola, ${nombreComercial}`,
          `El lote <strong>${idLote}</strong> presenta errores en los datos de terceros que impiden continuar con el proceso de inducci&oacute;n. La operaci&oacute;n ya solicit&oacute; la correcci&oacute;n correspondiente.${mensajeExtra}`
        ),
        _bloque_chips_([
          { label: "ID Lote", valor: idLote, colorVal: _C_ROJO },
          { label: "D&iacute;as pendiente", valor: String(diffDias), colorVal: diffDias >= 14 ? _C_ROJO : _C_NAVY }
        ]),
        _bloque_nota_(
          `<strong style="color:#253150;">Acci&oacute;n requerida:</strong>
           Verifica y corrige los datos de terceros solicitados por el equipo de inducciones.
           Una vez corregidos, responde a este correo usando <strong>"Responder a todos"</strong>
           para que la operaci&oacute;n pueda continuar con el tr&aacute;mite.`
        ),
        _bloque_pie_()
      ].join(""));

      try {
        MailApp.sendEmail({
          to: emailReal,
          subject: `${asuntoEmoji} Error en terceros ${nivelEscalamiento === 'critico' ? 'URGENTE' : 'pendiente de corrección'} · Lote ${idLote}`,
          htmlBody: htmlBody,
          cc: ccs,
          bcc: BCC_AUDITORIA,
          name: "Inducciones · El Libertador"
        });

        // Marcamos fecha de aviso en BI para que el conteo reinicie
        lote.filas.forEach(f => sheetCG.getRange(f, 61).setValue(new Date()));

        console.log(`✅ Recordatorio error terceros enviado a ${emailReal} para lote ${idLote}`);
        _registrarEvento_("INFO", "Notificaciones.js", "Recordatorio error terceros enviado", "Lote: " + idLote + " | Destino: " + emailReal);
      } catch (e) {
        console.error(`❌ Error en lote ${idLote} (error terceros): ${e.message}`);
        _registrarEvento_("ERROR", "Notificaciones.js", "Error al enviar recordatorio error terceros", "Lote: " + idLote + " | Error: " + e.message);
      }
    }
  }
}


// ============================================================
//  FUNCIONES AUXILIARES
// ============================================================

/**
 * Cache en memoria de la hoja CORREOS para evitar lecturas repetidas
 * dentro de la misma ejecución. Se invalida automáticamente al terminar
 * cada invocación del script (GAS no mantiene estado entre ejecuciones).
 */
var _cacheHojaCorreos_ = null;

function _obtenerDatosCorreos_() {
  if (_cacheHojaCorreos_) return _cacheHojaCorreos_;
  const ss = SpreadsheetApp.openById("1Z0GLLJvinwaU6MK_iaduKBri8VqfCDEPeOfh9gThQhI");
  const hoja = ss.getSheetByName("CORREOS");
  if (!hoja) { _cacheHojaCorreos_ = []; return []; }
  _cacheHojaCorreos_ = hoja.getDataRange().getValues();
  return _cacheHojaCorreos_;
}

// Funciones de nombre eliminadas — ahora se usa emailANombre(email, formato) de Utilidades_Nombres.js

// obtenerCorreoDeDirector — migrado a Servicios_AuthService.js (lee de USUARIOS, no de CORREOS)
// obtenerCorreoDeBackup — ELIMINADA (reemplazada por CC al Director automático via obtenerCorreoDeDirector)


// ============================================================
//  EMAIL INGRESO EXITOSO
//  Reemplaza enviarNotificaciones() de Codigo.js
// ============================================================

/**
 * Envía el correo de confirmación al comercial (+ CC director)
 * y el aviso de nuevo lote a los líderes.
 *
 * @param {Object} formData           Datos del formulario.
 * @param {string} idLote             ID generado para el lote.
 * @param {number} cantidad           Número de contratos ingresados.
 * @param {string} emailComercial     Email del usuario que ingresó el lote.
 * @param {string} urlDrive           URL de la carpeta en Drive.
 * @param {Array}  filasParaInsertar  Filas ya procesadas del lote.
 */
function enviarLasNotificaciones(formData, idLote, cantidad, emailComercial, urlDrive, filasParaInsertar) {
  if (!NotificationConfig_estaActiva('ingreso_exitoso')) {
    NotificationConfig_registrarSupresion('ingreso_exitoso');
    return;
  }

  const nombreComercial = emailANombre(emailComercial, 'PRIMER_NOMBRE') || 'Ejecutivo Comercial';
  const badgePazYSalvo  = _badge_paz_y_salvo_(formData.tipoPazYSalvo);

  // ── CC solo a la cadena jerárquica directa del comercial (Director + Gerente) ──
  const correosCC = [...new Set(obtenerCadenaJerarquica(emailComercial))]
    .filter(e => e && e.includes("@"))
    .join(",");

  // ── Plantilla HTML única (Ingreso Exitoso) ──
  const htmlBody = _envolver_([

    _bloque_cabecera_("Ingreso Exitoso"),

    _bloque_barra_estado_(_C_NAVY, "&#10003;", "Lote recibido y procesado"),

    _bloque_cuerpo_inicio_(
      `Hola, ${nombreComercial}`,
      `Tu lote de inducciones fue recibido y procesado correctamente por El Libertador.
       A partir de este momento ser&aacute; asignado a un analista para su revisi&oacute;n.
       Te notificaremos por correo cuando haya una actualizaci&oacute;n de estado.`
    ),

    _bloque_chips_([
      { label: "ID de Lote",          valor: idLote,                        colorVal: _C_ROJO },
      { label: "P&oacute;liza",        valor: formData.poliza                                  },
      { label: "Contratos ingresados", valor: String(cantidad)                                 },
      { label: "Tasa de Inducci&oacute;n", valor: formData.tasaNegociacion + "%" },
      { label: "Paz y Salvo",         valor: badgePazYSalvo,                full: true         }
    ]),

    _bloque_contratos_(filasParaInsertar),

    formData.tipoPazYSalvo === "checkbox"
      ? _bloque_nota_(
          `<strong style="color:#253150;">Importante:</strong> Este lote fue ingresado con
           certificaci&oacute;n manual de paz y salvo. En caso de aprobaci&oacute;n,
           el equipo de inducciones solicitar&aacute; el soporte emitido por la inmobiliaria.`
        )
      : _bloque_nota_(
          `<strong style="color:#253150;">Soporte recibido:</strong> El documento de paz y salvo
           fue adjuntado correctamente con este ingreso.`
        ),

    _bloque_pie_()

  ].join(""));

  // ── Configurar envío único ──
  const opciones = {
    to:       emailComercial,
    cc:       correosCC,
    bcc:      BCC_AUDITORIA,
    subject:  `✅ Ingreso exitoso · Lote ${idLote}`,
    htmlBody: htmlBody,
    replyTo:  "noreply@ellibertador.co",
    name:     "Inducciones · El Libertador"
  };

  // ── Adjuntar PDF de paz y salvo si aplica ──
  if (formData.tipoPazYSalvo === "adjunto" && formData.pazYSalvoPdf) {
    const pdfBase64 = formData.pazYSalvoPdf.bytes.split(',')[1] || formData.pazYSalvoPdf.bytes;
    opciones.attachments = [
      Utilities.newBlob(
        Utilities.base64Decode(pdfBase64),
        "application/pdf",
        formData.pazYSalvoPdf.nombre
      )
    ];
  }

  MailApp.sendEmail(opciones);
}


// ============================================================
//  CONFIGURACIÓN DE TRIGGERS — Ejecutar UNA VEZ desde el editor
// ============================================================

/**
 * Crea los triggers de notificaciones (si no existen).
 * - enviarCorreoPazYSalvo: onEdit instalable en el spreadsheet de Control
 * - enviarRecordatoriosPazYSalvoDiario: diario a las 8:00am
 *
 * Idempotente: borra triggers previos de estas funciones antes de crearlos.
 */
function configurarTriggersNotificaciones() {
  return reconciliarConfiguracionNotificaciones();
}
