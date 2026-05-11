

// ── Tokens de color de marca (Manual de Marca El Libertador) ──
const _C_ROJO = "#BD0F14";   // Color primario
const _C_NAVY = "#253150";   // Color secundario
const _C_GRIS = "#706F6F";   // Color terciario


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
                    &#9650; EL LIBERTADOR
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
              Investigaciones y Cobranzas El Libertador
            </div>
            <div style="font-size:10px;color:#94a3b8;margin-top:3px;font-family:Arial,sans-serif;">
              Env&iacute;o autom&aacute;tico &middot; Por favor no responda este correo &middot;
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
//  EMAIL 1 Y 2 — INGRESO EXITOSO
//  Reemplaza enviarNotificaciones() de Code.gs
// ============================================================

function enviarNotificaciones(formData, idLote, cantidad, email, urlDrive, filas) {

  const URL_CONTROL_GENERAL = `https://docs.google.com/spreadsheets/d/${ID_HOJA_CONTROL}/edit#gid=991800725`;
  const nombreComercial     = obtenerNombreComercial(email);
  const correoDirector      = obtenerCorreoDirector(email);
  const badgePS             = _badge_paz_y_salvo_(formData.tipoPazYSalvo);

  // ──────────────────────────────────────────
  // EMAIL 1: AL COMERCIAL — Confirmación de ingreso exitoso
  // ──────────────────────────────────────────
  const bodyComercial = _envolver_([

    _bloque_cabecera_("Ingreso exitoso"),

    _bloque_barra_estado_(_C_ROJO, "&#10003;", "Lote procesado correctamente"),

    _bloque_cuerpo_inicio_(
      `&iexcl;Hola, ${nombreComercial}!`,
      `Tu lote de inducciones fue recibido y procesado correctamente.
       Ser&aacute; remitido al equipo de radicaci&oacute;n para su an&aacute;lisis.
       Te notificaremos en cada etapa del proceso.`
    ),

    _bloque_chips_([
      { label: "ID de Lote",     valor: idLote,                       colorVal: _C_ROJO },
      { label: "P&oacute;liza",  valor: formData.poliza                                 },
      { label: "Contratos",      valor: String(cantidad)                                 },
      { label: "Tasa IVA incl.", valor: formData.tasaNegociacion + "%"                  },
      { label: "Paz y Salvo",    valor: badgePS,                       full: true        }
    ]),

    _bloque_contratos_(filas),

    _bloque_nota_(
      `<strong style="color:#BD0F14;">Recuerda:</strong> si elegiste certificaci&oacute;n manual
       de paz y salvo, el soporte f&iacute;sico emitido por la inmobiliaria ser&aacute; exigido
       en caso de que el lote sea aprobado.`
    ),

    _bloque_pie_()

  ].join(""));

  MailApp.sendEmail({
    to:       email,
    cc:       correoDirector,
    subject:  `✅ Lote recibido exitosamente · ID ${idLote}`,
    htmlBody: bodyComercial,
    replyTo:  "noreply@ellibertador.co",
    name:     "Inducciones · El Libertador S A"
  });

  // ──────────────────────────────────────────
  // EMAIL 2: A LOS LÍDERES — Nuevo lote para radicar
  // ──────────────────────────────────────────
  const bodyLideres = _envolver_([

    _bloque_cabecera_("Nuevo lote"),

    _bloque_barra_estado_(_C_GRIS, "&#128230;", "Pendiente radicar &nbsp;&middot;&nbsp; Requiere gesti&oacute;n"),

    _bloque_cuerpo_inicio_(
      "Nuevo lote recibido",
      `El comercial <strong>${nombreComercial}</strong> acaba de radicar un lote
       con <strong>${cantidad} contrato${cantidad !== 1 ? "s" : ""}</strong>.
       Requiere revisi&oacute;n y gesti&oacute;n del equipo de inducciones.`
    ),

    _bloque_chips_([
      { label: "ID de Lote",     valor: idLote,                       colorVal: _C_ROJO  },
      { label: "P&oacute;liza",  valor: formData.poliza                                  },
      { label: "Comercial",      valor: email       ,                 full: true         },
      { label: "Contratos",      valor: String(cantidad)                                  },
      { label: "Tasa IVA incl.", valor: formData.tasaNegociacion + "%"                   },
      { label: "Paz y Salvo",    valor: badgePS,                       full: true         }
    ]),

    _bloque_contratos_(filas),

    _bloque_boton_("Ver en Control General", URL_CONTROL_GENERAL),

    _bloque_nota_(
      formData.tipoPazYSalvo === "adjunto"
        ? "El paz y salvo en PDF fue adjuntado directamente a este correo."
        : "Paz y salvo con certificaci&oacute;n manual &mdash; el soporte ser&aacute; requerido si el lote es aprobado."
    ),

    _bloque_pie_()

  ].join(""));

  const opcionesLider = {
    to:       CORREOS_LIDERES.join(", "),
    subject:  `📦 Nuevo lote para radicar · ID ${idLote}`,
    htmlBody: bodyLideres,
    replyTo:  "noreply@ellibertador.co",
    name:     "Inducciones · El Libertador S A"
  };

  if (formData.tipoPazYSalvo === "adjunto" && formData.pazYSalvoPdf) {
    const pdfBase64 = formData.pazYSalvoPdf.bytes.split(",")[1] || formData.pazYSalvoPdf.bytes;
    opcionesLider.attachments = [
      Utilities.newBlob(
        Utilities.base64Decode(pdfBase64),
        "application/pdf",
        formData.pazYSalvoPdf.nombre
      )
    ];
  }

  MailApp.sendEmail(opcionesLider);
}


// ============================================================
//  EMAIL 3 — PENDIENTE PAZ Y SALVO (Trigger de edición)
//  Reemplaza enviarCorreoPazYSalvo() de Triggers.gs
// ============================================================

function enviarCorreoPazYSalvo(e) {
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

  const correoDirector  = obtenerCorreoDirector(emailFinal);
  const nombreComercial = obtenerNombreComercial(emailFinal);
  const correosCC       = CORREOS_LIDERES.join(",") + (correoDirector ? "," + correoDirector : "");

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
    GmailApp.sendEmail(
      emailFinal,
      `⚠️ Lote pendiente de paz y salvo · ID ${idLoteActual}`,
      "",
      {
        htmlBody: htmlBody,
        cc:       correosCC,
        name:     "Inducciones · El Libertador S A"
      }
    );

    // Registrar fecha de aviso en columna BI (61)
    const fechaHoy = new Date();
    for (let i = 0; i < data.length; i++) {
      if (data[i][0].toString().trim() === idLoteActual) {
        sheetActual.getRange(i + 2, 61).setValue(fechaHoy);
      }
    }
  } catch (err) {
    console.error("Error envío paz y salvo: " + err.message);
  }
}


// ============================================================
//  EMAIL 4 — RECORDATORIO DIARIO DE PAZ Y SALVO
// ============================================================

function enviarRecordatoriosPazYSalvoDiario() {
  const ss    = SpreadsheetApp.getActiveSpreadsheet();
  const sheet = ss.getSheetByName("Control_General");
  if (!sheet) return;

  const ultimaFila = sheet.getLastRow();
  if (ultimaFila < 2) return;

  const data  = sheet.getRange(2, 1, ultimaFila - 1, 61).getValues();
  const hoy   = new Date();
  const lotes = {};

  // ── Agrupar filas por lote y detectar cuáles están completos ──
  for (let i = 0; i < data.length; i++) {
    const idLote       = data[i][0].toString().trim();
    const estado       = data[i][9].toString().trim().toUpperCase();
    const emailCom     = data[i][10].toString().trim();
    const fechaAviso   = data[i][60]; // Columna BI

    if (!idLote) continue;

    if (!lotes[idLote]) {
      lotes[idLote] = { pendiente: true, email: emailCom, fecha: fechaAviso, filas: [] };
    }
    lotes[idLote].filas.push(i + 2);
    if (estado !== "PENDIENTE PAZ Y SALVO") lotes[idLote].pendiente = false;
  }

  // ── Enviar recordatorio a los lotes que llevan > 2 días (3 o más) ──
  for (const idLote in lotes) {
    const l = lotes[idLote];
    
    // Si no está pendiente o no tiene fecha de aviso previo, saltamos
    if (!l.pendiente || !l.fecha) continue;

    // Validación de seguridad: Asegurarnos de que la fecha es válida
    const fechaGuardada = new Date(l.fecha);
    if (isNaN(fechaGuardada.getTime())) continue;

    // Calcular diferencia en días exactos
    const diffDias = Math.floor(Math.abs(hoy - fechaGuardada) / (1000 * 60 * 60 * 24));
    
    // NUEVA REGLA: Si la diferencia es de 2 días o menos, saltar este lote.
    // Solo continuará si diffDias es 3, 4, 5...
    if (diffDias <= 2) continue;

    const emailFinal = l.email;
    if (!emailFinal || !emailFinal.includes("@")) continue;

    const nombreComercial = obtenerNombreComercial(emailFinal);
    const correoDirector  = obtenerCorreoDirector(emailFinal);
    const correosCC       = CORREOS_LIDERES.join(",") + (correoDirector ? "," + correoDirector : "");

    const htmlBody = _envolver_([

      _bloque_cabecera_("Recordatorio"),

      _bloque_barra_estado_(
        _C_GRIS,
        "&#128260;",
        `Recordatorio &nbsp;&middot;&nbsp; ${diffDias} d&iacute;a${diffDias !== 1 ? "s" : ""} pendiente`
      ),

      _bloque_cuerpo_inicio_(
        `Hola, ${nombreComercial}`,
        `Han pasado <strong>${diffDias} d&iacute;a${diffDias !== 1 ? "s" : ""}</strong>
         desde que el lote <strong style="color:#253150;">${idLote}</strong>
         qued&oacute; en estado <strong>Pendiente de Paz y Salvo</strong>.
         El equipo de inducciones est&aacute; esperando el soporte para continuar.`
      ),

      _bloque_chips_([
        { label: "ID de Lote",          valor: idLote,                   colorVal: _C_ROJO },
        { label: "D&iacute;as pendiente", valor: diffDias + " d&iacute;as", colorVal: _C_ROJO },
        { label: "Estado",              valor: _badge_estado_pendiente_(), full: true        }
      ]),

      _bloque_nota_(
        `<strong style="color:#BD0F14;">Acci&oacute;n requerida:</strong>
         Responde a este correo usando <strong>"Responder a todos"</strong> y adjunta
         el documento de Paz y Salvo emitido por la inmobiliaria.
         Si tienes dudas, contacta directamente al equipo de inducciones.`
      ),

      _bloque_pie_()

    ].join(""));

    try {
      GmailApp.sendEmail(
        emailFinal,
        `🔁 Recordatorio · Lote pendiente de paz y salvo · ID ${idLote}`,
        "",
        {
          htmlBody: htmlBody,
          cc:       correosCC,
          name:     "Inducciones · El Libertador S A"
        }
      );

      // Actualizar fecha de último aviso en columna BI (61)
      l.filas.forEach(f => sheet.getRange(f, 61).setValue(hoy));

    } catch (err) {
      console.error("Error recordatorio lote " + idLote + ": " + err.message);
    }
  }
}