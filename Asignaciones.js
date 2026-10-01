/**
 * ============================================================
 * Asignaciones — notificación automática de casos asignados
 *
 * El admin asigna escribiendo el NOMBRE del analista en la columna
 * "ASIGNADA A…" de la hoja "registro analisis". Este módulo (trigger por
 * tiempo) detecta las asignaciones nuevas, envía UN correo por analista
 * con el listado de sus casos y deja en Control_General la hora real de
 * asignación (= hora de envío del correo):
 *
 *   - "F.H Asignacion"      → new Date() justo después de enviar el correo.
 *   - "Analista Notificado" → nombre tal como está en el sheet (detecta reasignaciones).
 *
 * También rellena "Fecha Evaluacion" (fecha) en registro analisis, que el
 * admin antes digitaba a mano (hoy esa columna significa fecha de asignación).
 *
 * Nombre → correo: pestaña "Config_Analistas" del libro de control
 * (NOMBRE_EN_SHEET | EMAIL | ACTIVO), mantenida por el admin.
 *
 * Seguridad de la primera corrida: una fila con "Fecha Evaluacion" ya digitada
 * y sin "F.H Asignacion" es una asignación histórica (ya notificada a mano) y
 * se ignora. Solo se notifican filas sin fecha de asignación.
 *
 * Configuración: ejecutar UNA VEZ configurarTriggerAsignaciones() desde el editor.
 * Prueba sin enviar nada: previsualizarAsignacionesPendientes().
 * ============================================================
 */

var ASIGNACIONES_HOJA_ANALISIS = 'registro analisis';
var ASIGNACIONES_HOJA_CONTROL = 'Control_General';
var ASIGNACIONES_HOJA_CONFIG = 'Config_Analistas';
var ASIGNACIONES_HOJA_HISTORIAL = 'Historial_Asignaciones';
var ASIGNACIONES_COL_FH = 'F.H Asignacion';
var ASIGNACIONES_COL_NOTIFICADO = 'Analista Notificado';
var ASIGNACIONES_MODULO = 'Asignaciones.js';
var ASIGNACIONES_PROP_ULTIMO_AVISO = 'ASIGNACIONES_ULTIMO_AVISO';

// ============================================================
//  UTILIDADES PURAS (testeables)
// ============================================================

/**
 * Normaliza un nombre para compararlo: sin tildes, mayúsculas, espacios simples.
 * @param {*} valor
 * @returns {string}
 */
function Asignaciones_normalizarNombre_(valor) {
  return String(valor === undefined || valor === null ? '' : valor)
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .toUpperCase();
}

/**
 * Busca una columna (1-based) por encabezado, sin sensibilidad a mayúsculas,
 * tildes ni puntos suspensivos finales ("ASIGNADA A…" / "ASIGNADA A...").
 * @param {Array} encabezados
 * @param {string} nombre
 * @returns {number} Índice 1-based o 0 si no existe.
 */
function Asignaciones_buscarColumna_(encabezados, nombre) {
  var objetivo = Asignaciones_normalizarEncabezado_(nombre);
  for (var i = 0; i < encabezados.length; i++) {
    if (Asignaciones_normalizarEncabezado_(encabezados[i]) === objetivo) return i + 1;
  }
  return 0;
}

function Asignaciones_normalizarEncabezado_(valor) {
  return Asignaciones_normalizarNombre_(valor).replace(/(…|\.{2,3})$/, '').trim();
}

/**
 * Convierte la hoja Config_Analistas (matriz con encabezados) en un mapa
 * NOMBRE_NORMALIZADO → {nombre, email}. Ignora filas inactivas o sin email válido.
 * @param {Array<Array>} valores
 * @returns {Object}
 */
function Asignaciones_construirMapaAnalistas_(valores) {
  var mapa = {};
  if (!valores || valores.length < 2) return mapa;

  var colNombre = Asignaciones_buscarColumna_(valores[0], 'NOMBRE_EN_SHEET');
  var colEmail = Asignaciones_buscarColumna_(valores[0], 'EMAIL');
  var colActivo = Asignaciones_buscarColumna_(valores[0], 'ACTIVO');
  if (!colNombre || !colEmail) return mapa;

  for (var i = 1; i < valores.length; i++) {
    var nombre = String(valores[i][colNombre - 1] || '').trim();
    var email = String(valores[i][colEmail - 1] || '').trim().toLowerCase();
    if (!nombre || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) continue;

    if (colActivo) {
      var activo = valores[i][colActivo - 1];
      var inactivo = activo === false || /^(false|no|0|inactivo)$/i.test(String(activo).trim());
      if (inactivo) continue;
    }
    mapa[Asignaciones_normalizarNombre_(nombre)] = { nombre: nombre, email: email };
  }
  return mapa;
}

/**
 * Determina qué filas de registro analisis tienen una asignación por notificar.
 *
 * Reglas (por fila de registro analisis con ASIGNADA A… no vacío y sin
 * REGISTRO ANALISTA SAI, o sea, todavía en análisis):
 *   - Con fila en Control_General y F.H Asignacion vacía:
 *       · si "Fecha Evaluacion" ya trae fecha → asignación histórica, se ignora;
 *       · si no → asignación nueva.
 *   - Con "Analista Notificado" ≠ ASIGNADA A… → reasignación.
 *
 * @param {Object} d
 * @param {string[]} d.asignadas       ASIGNADA A… por fila de registro (índice 0 = fila 2).
 * @param {Array}    d.fechasEvaluacion
 * @param {Array}    d.registroSai
 * @param {string[]} d.uuids
 * @param {Object}   d.indiceControl   UUID → {fh, notificado}
 * @param {Object}   d.mapa            Mapa de analistas (Asignaciones_construirMapaAnalistas_).
 * @returns {{porEmail:Object, sinCorreo:Object, sinFilaControl:number}}
 */
function Asignaciones_detectarPendientes_(d) {
  var porEmail = {};
  var sinCorreo = {};
  var sinFilaControl = 0;

  for (var i = 0; i < d.asignadas.length; i++) {
    var nombre = String(d.asignadas[i] || '').trim();
    if (!nombre) continue;
    if (String(d.registroSai[i] || '').trim()) continue;

    var uuid = String(d.uuids[i] || '').trim();
    var ctl = uuid ? d.indiceControl[uuid] : null;
    if (!ctl) { sinFilaControl++; continue; }

    var nombreNorm = Asignaciones_normalizarNombre_(nombre);
    var fhVacia = !String(ctl.fh === undefined || ctl.fh === null ? '' : ctl.fh).trim();
    var notificado = Asignaciones_normalizarNombre_(ctl.notificado);

    var esNueva = fhVacia && !notificado && !String(d.fechasEvaluacion[i] || '').trim();
    var esReasignacion = !!notificado && notificado !== nombreNorm;
    if (!esNueva && !esReasignacion) continue;

    var analista = d.mapa[nombreNorm];
    if (!analista) {
      sinCorreo[nombreNorm] = (sinCorreo[nombreNorm] || 0) + 1;
      continue;
    }

    if (!porEmail[analista.email]) {
      porEmail[analista.email] = { nombre: analista.nombre, email: analista.email, casos: [] };
    }
    porEmail[analista.email].casos.push({
      filaRegistro: i + 2,
      uuid: uuid,
      nombreEnSheet: nombre,
      filaControl: ctl.fila,
      reasignado: esReasignacion
    });
  }

  return { porEmail: porEmail, sinCorreo: sinCorreo, sinFilaControl: sinFilaControl };
}

function Asignaciones_escapar_(valor) {
  return String(valor === undefined || valor === null ? '' : valor)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/**
 * Recordatorio fijo que va en todos los correos de asignación.
 * Texto entregado por operación; se resaltan las palabras clave.
 */
var ASIGNACIONES_RECORDATORIO_ = [
  'Aseg&uacute;rate de que ning&uacute;n solicitante tenga registros en <strong>jur&iacute;dico</strong>. ' +
    'De ser as&iacute;, registra el estado y el valor de la deuda en los comentarios del analista. ' +
    'Selecciona la <strong>regla dura</strong> correspondiente (si aplica) y detalla la explicaci&oacute;n ' +
    'en la casilla de comentarios del analista.',
  'Si se presentan inconsistencias, indica el <strong>n&uacute;mero de solicitud</strong> y especifica ' +
    'si el motivo es por <strong>AVS</strong> o por <strong>documentaci&oacute;n</strong>.',
  'Si ya existe una solicitud en el seguro o una simult&aacute;nea aprobada reciente con los mismos datos, ' +
    'debes relacionar el <strong>n&uacute;mero de la solicitud</strong> correspondiente.'
];

/** Recuadro "Importante tener en cuenta" con los puntos numerados. */
function Asignaciones_bloqueRecordatorio_() {
  var items = ASIGNACIONES_RECORDATORIO_.map(function (texto, i) {
    return '<tr>' +
      '<td valign="top" style="padding:6px 12px 6px 0;width:22px;">' +
        '<div style="width:20px;height:20px;line-height:20px;text-align:center;border-radius:10px;' +
          'background:#BD0F14;color:#ffffff;font-size:11px;font-weight:700;font-family:Arial,sans-serif;">' + (i + 1) + '</div>' +
      '</td>' +
      '<td valign="top" style="padding:6px 0;font-size:12px;color:#475569;line-height:1.65;font-family:Arial,sans-serif;">' +
        texto + '</td></tr>';
  }).join('');

  return '<tr><td style="padding:16px 28px 0;">' +
    '<div style="background:#f8fafc;border-left:3px solid #BD0F14;padding:14px 16px;">' +
      '<div style="font-size:11px;font-weight:700;letter-spacing:1.2px;text-transform:uppercase;color:#BD0F14;' +
        'margin-bottom:6px;font-family:Arial,sans-serif;">Importante tener en cuenta</div>' +
      '<table width="100%" cellpadding="0" cellspacing="0" border="0">' + items + '</table>' +
    '</div></td></tr>';
}

/** Agrupa los casos por lote conservando el orden de aparición. */
function Asignaciones_agruparPorLote_(casos) {
  var grupos = [];
  var indice = {};
  casos.forEach(function (c) {
    var clave = String(c.idLote || '').trim() || '(sin lote)';
    if (indice[clave] === undefined) {
      indice[clave] = grupos.length;
      grupos.push({ idLote: String(c.idLote || '').trim(), casos: [] });
    }
    grupos[indice[clave]].casos.push(c);
  });
  return grupos;
}

/**
 * Lista de casos agrupada por lote. Dato principal: Solicitud Inquilino.
 */
function Asignaciones_bloqueCasos_(casos) {
  var esc = Asignaciones_escapar_;
  var bloques = Asignaciones_agruparPorLote_(casos).map(function (g) {
    var primero = g.casos[0];
    var detalle = [primero.poliza ? 'P&oacute;liza ' + esc(primero.poliza) : '', esc(primero.ciudad), esc(primero.sucursal)]
      .filter(function (x) { return x; }).join(' &middot; ');

    var filas = g.casos.map(function (c) {
      return '<tr>' +
        '<td style="padding:9px 0;border-bottom:1px solid #f1f5f9;font-family:Arial,sans-serif;">' +
          '<div style="font-size:9px;font-weight:700;letter-spacing:1px;text-transform:uppercase;color:#94a3b8;">Solicitud inquilino</div>' +
          '<div style="font-size:17px;font-weight:900;color:#253150;margin-top:1px;">' + (esc(c.solicitudInquilino) || 'Sin n&uacute;mero') + '</div>' +
        '</td>' +
        '<td style="padding:9px 8px;border-bottom:1px solid #f1f5f9;font-size:12px;color:#64748b;font-family:Arial,sans-serif;">' +
          (esc(c.arrendatario) || '&mdash;') + '</td>' +
        '<td align="right" style="padding:9px 0;border-bottom:1px solid #f1f5f9;font-family:Arial,sans-serif;">' +
          (c.reasignado ? '<span style="font-size:10px;font-weight:700;color:#E65100;">REASIGNADO</span>' : '') +
        '</td></tr>';
    }).join('');

    return '<div style="margin-top:14px;font-family:Arial,sans-serif;">' +
      '<div style="font-size:11px;font-weight:700;color:#253150;background:#f1f5f9;padding:7px 10px;border-radius:4px;">' +
        'Lote ' + (esc(g.idLote) || '&mdash;') + (detalle ? ' &middot; ' + detalle : '') +
        ' <span style="color:#94a3b8;font-weight:400;">&middot; ' + g.casos.length +
        (g.casos.length === 1 ? ' solicitud' : ' solicitudes') + '</span></div>' +
      '<table width="100%" cellpadding="0" cellspacing="0" border="0">' + filas + '</table></div>';
  }).join('');

  return '<tr><td style="padding:20px 28px 0;">' +
    '<div style="height:1px;background:#f1f5f9;margin-bottom:14px;"></div>' +
    '<div style="font-size:9px;font-weight:700;letter-spacing:1.2px;text-transform:uppercase;color:#94a3b8;' +
      'font-family:Arial,sans-serif;">Casos asignados</div>' + bloques + '</td></tr>';
}

/**
 * Construye el correo agrupado para un analista.
 * Orden: cabecera, barra, saludo, recordatorio, casos (por lote), botón, pie.
 * @param {string} nombre Primer nombre para el saludo.
 * @param {Array<{idLote,solicitudInquilino,arrendatario,poliza,ciudad,sucursal,reasignado}>} casos
 * @param {string} urlHoja Enlace a la hoja registro analisis.
 * @returns {{asunto:string, html:string}}
 */
function Asignaciones_construirCorreo_(nombre, casos, urlHoja) {
  var n = casos.length;
  var html = _envolver_([
    _bloque_cabecera_('Nueva asignaci&oacute;n'),
    _bloque_barra_estado_('#253150', '&#9679;', n + (n === 1 ? ' caso asignado' : ' casos asignados')),
    _bloque_cuerpo_inicio_(
      'Hola, ' + Asignaciones_escapar_(nombre),
      'Se te asign&oacute;' + (n === 1 ? ' <strong>1 caso</strong>' : 'ron <strong>' + n + ' casos</strong>') +
      ' para an&aacute;lisis en la hoja <strong>registro analisis</strong>.'
    ),
    Asignaciones_bloqueRecordatorio_(),
    Asignaciones_bloqueCasos_(casos),
    urlHoja ? _bloque_boton_('Abrir registro de an&aacute;lisis', urlHoja) : '',
    _bloque_pie_()
  ].join(''));

  return {
    asunto: '📋 Nueva asignación · ' + n + (n === 1 ? ' caso' : ' casos'),
    html: html
  };
}

// ============================================================
//  LECTURA / ESCRITURA EN HOJAS
// ============================================================

function Asignaciones_leerColumna_(hoja, columna, ultimaFila) {
  if (!columna || ultimaFila < 2) return [];
  var valores = hoja.getRange(2, columna, ultimaFila - 1, 1).getValues();
  var salida = new Array(valores.length);
  for (var i = 0; i < valores.length; i++) salida[i] = valores[i][0];
  return salida;
}

/**
 * Garantiza que Control_General tenga las dos columnas de sello.
 * Se agregan al final (después de lo que ya exista) y siempre se ubican por header:
 * marcarSolicitudRadicada solo reescribe las primeras 63 columnas.
 * @returns {{fh:number, notificado:number}} Índices 1-based.
 */
function Asignaciones_asegurarColumnas_(hojaControl) {
  var ultima = hojaControl.getLastColumn();
  var encabezados = hojaControl.getRange(1, 1, 1, ultima).getValues()[0];
  var colFh = Asignaciones_buscarColumna_(encabezados, ASIGNACIONES_COL_FH);
  var colNotificado = Asignaciones_buscarColumna_(encabezados, ASIGNACIONES_COL_NOTIFICADO);

  var faltantes = [];
  if (!colFh) faltantes.push(ASIGNACIONES_COL_FH);
  if (!colNotificado) faltantes.push(ASIGNACIONES_COL_NOTIFICADO);

  if (faltantes.length) {
    var maxCols = typeof hojaControl.getMaxColumns === 'function' ? hojaControl.getMaxColumns() : Infinity;
    var necesarias = ultima + faltantes.length;
    if (necesarias > maxCols) hojaControl.insertColumnsAfter(maxCols, necesarias - maxCols);

    hojaControl.getRange(1, ultima + 1, 1, faltantes.length).setValues([faltantes]);
    if (!colFh) colFh = ultima + 1 + faltantes.indexOf(ASIGNACIONES_COL_FH);
    if (!colNotificado) colNotificado = ultima + 1 + faltantes.indexOf(ASIGNACIONES_COL_NOTIFICADO);

    _registrarEvento_('INFO', ASIGNACIONES_MODULO, 'Columnas de asignación creadas en Control_General', faltantes.join(', '));
  }
  return { fh: colFh, notificado: colNotificado };
}

/**
 * Lee todo lo necesario y detecta pendientes (sin enviar ni escribir nada).
 */
function Asignaciones_recolectar_() {
  var libroAnalisis = SpreadsheetRegistry_get(getArchivoAnalisisId());
  var libroControl = SpreadsheetRegistry_get(getHojaControlId());

  var hojaAnalisis = libroAnalisis.getSheetByName(ASIGNACIONES_HOJA_ANALISIS);
  var hojaControl = libroControl.getSheetByName(ASIGNACIONES_HOJA_CONTROL);
  if (!hojaAnalisis || !hojaControl) throw new Error('No se encontró registro analisis o Control_General.');

  var hojaConfig = libroControl.getSheetByName(ASIGNACIONES_HOJA_CONFIG);
  var mapa = hojaConfig ? Asignaciones_construirMapaAnalistas_(hojaConfig.getDataRange().getValues()) : {};

  var encAnalisis = hojaAnalisis.getRange(1, 1, 1, hojaAnalisis.getLastColumn()).getValues()[0];
  var cols = {
    asignada: Asignaciones_buscarColumna_(encAnalisis, 'ASIGNADA A'),
    fechaEval: Asignaciones_buscarColumna_(encAnalisis, 'Fecha Evaluacion'),
    registroSai: Asignaciones_buscarColumna_(encAnalisis, 'REGISTRO ANALISTA SAI'),
    uuid: Asignaciones_buscarColumna_(encAnalisis, 'UUID_SISTEMA')
  };
  if (!cols.asignada || !cols.uuid) throw new Error('registro analisis no tiene ASIGNADA A… o UUID_SISTEMA.');

  var ultimaAnalisis = hojaAnalisis.getLastRow();
  var asignadas = Asignaciones_leerColumna_(hojaAnalisis, cols.asignada, ultimaAnalisis);

  // Salida temprana barata: nadie asignado → no se abre nada más.
  var hayAsignadas = asignadas.some(function (v) { return String(v || '').trim(); });
  var vacio = { mapa: mapa, resultado: { porEmail: {}, sinCorreo: {}, sinFilaControl: 0 }, ctx: null };
  if (!hayAsignadas) return vacio;

  var columnasControl = Asignaciones_asegurarColumnas_(hojaControl);
  var encControl = hojaControl.getRange(1, 1, 1, hojaControl.getLastColumn()).getValues()[0];
  var colUuidControl = Asignaciones_buscarColumna_(encControl, 'UUID_SISTEMA');
  if (!colUuidControl) throw new Error('Control_General no tiene UUID_SISTEMA.');

  var ultimaControl = hojaControl.getLastRow();
  var uuidsControl = Asignaciones_leerColumna_(hojaControl, colUuidControl, ultimaControl);
  var fhControl = Asignaciones_leerColumna_(hojaControl, columnasControl.fh, ultimaControl);
  var notifControl = Asignaciones_leerColumna_(hojaControl, columnasControl.notificado, ultimaControl);

  var indiceControl = {};
  for (var i = 0; i < uuidsControl.length; i++) {
    var u = String(uuidsControl[i] || '').trim();
    if (u) indiceControl[u] = { fila: i + 2, fh: fhControl[i], notificado: notifControl[i] };
  }

  var resultado = Asignaciones_detectarPendientes_({
    asignadas: asignadas,
    fechasEvaluacion: Asignaciones_leerColumna_(hojaAnalisis, cols.fechaEval, ultimaAnalisis),
    registroSai: Asignaciones_leerColumna_(hojaAnalisis, cols.registroSai, ultimaAnalisis),
    uuids: Asignaciones_leerColumna_(hojaAnalisis, cols.uuid, ultimaAnalisis),
    indiceControl: indiceControl,
    mapa: mapa
  });

  return {
    mapa: mapa,
    resultado: resultado,
    ctx: {
      libroAnalisis: libroAnalisis, hojaAnalisis: hojaAnalisis, hojaControl: hojaControl, libroControl: libroControl,
      encAnalisis: encAnalisis, colFechaEval: cols.fechaEval, columnasControl: columnasControl
    }
  };
}

/**
 * Completa cada caso con datos legibles (lote, arrendatario, póliza, ciudad, sucursal).
 */
function Asignaciones_enriquecerCasos_(ctx, casos) {
  var enc = ctx.encAnalisis;
  var col = {
    lote: Asignaciones_buscarColumna_(enc, 'codigo lote'),
    arrendatario: Asignaciones_buscarColumna_(enc, 'Arrendatario'),
    solicitud: Asignaciones_buscarColumna_(enc, 'Solicitud Inquilino'),
    poliza: Asignaciones_buscarColumna_(enc, 'Póliza') || Asignaciones_buscarColumna_(enc, 'Poliza'),
    ciudad: Asignaciones_buscarColumna_(enc, 'ciudad'),
    sucursal: Asignaciones_buscarColumna_(enc, 'sucursal')
  };
  casos.forEach(function (c) {
    var fila = ctx.hojaAnalisis.getRange(c.filaRegistro, 1, 1, enc.length).getValues()[0];
    var v = function (idx) { return idx ? String(fila[idx - 1] === undefined ? '' : fila[idx - 1]).trim() : ''; };
    c.idLote = v(col.lote);
    c.arrendatario = v(col.arrendatario);
    c.solicitudInquilino = v(col.solicitud);
    c.poliza = v(col.poliza);
    c.ciudad = v(col.ciudad);
    c.sucursal = v(col.sucursal);
  });
}

/**
 * Sella un caso: hora de asignación y analista notificado en Control_General,
 * y fecha en "Fecha Evaluacion" de registro analisis.
 */
function Asignaciones_sellarCaso_(ctx, caso, nombreEnSheet, ahora) {
  var cc = ctx.columnasControl;
  ctx.hojaControl.getRange(caso.filaControl, cc.fh).setValue(ahora);
  ctx.hojaControl.getRange(caso.filaControl, cc.notificado).setValue(nombreEnSheet);
  if (ctx.colFechaEval) {
    var celda = ctx.hojaAnalisis.getRange(caso.filaRegistro, ctx.colFechaEval);
    celda.setValue(ahora);
    if (typeof celda.setNumberFormat === 'function') celda.setNumberFormat('dd/MM/yyyy');
  }
}

function Asignaciones_registrarHistorial_(libroControl, grupo, casos, ahora) {
  try {
    var hoja = libroControl.getSheetByName(ASIGNACIONES_HOJA_HISTORIAL);
    if (!hoja) {
      hoja = libroControl.insertSheet(ASIGNACIONES_HOJA_HISTORIAL);
      hoja.appendRow(['FECHA_HORA', 'UUID_SISTEMA', 'ID_LOTE', 'ANALISTA', 'EMAIL', 'ORIGEN']);
      hoja.getRange(1, 1, 1, 6).setFontWeight('bold').setBackground('#253150').setFontColor('white');
      hoja.setFrozenRows(1);
    }
    casos.forEach(function (c) {
      hoja.appendRow([ahora, c.uuid, c.idLote || '', grupo.nombre, grupo.email, c.reasignado ? 'REASIGNACION' : 'ASIGNACION']);
    });
  } catch (e) {
    console.warn('No se pudo registrar Historial_Asignaciones: ' + e.message);
  }
}

/**
 * Correos en copia: misma cadena jerárquica de las demás notificaciones
 * (obtenerCadenaJerarquica → ADMIN activos y, si aplica, director). Sin duplicados
 * y sin el propio analista. Si falla la resolución no se bloquea el envío.
 * @param {string} emailAnalista
 * @returns {string} Correos separados por coma ('' si no hay).
 */
function Asignaciones_resolverCC_(emailAnalista) {
  try {
    var propio = String(emailAnalista || '').trim().toLowerCase();
    var vistos = {};
    return (obtenerCadenaJerarquica(emailAnalista) || [])
      .map(function (c) { return String(c || '').trim(); })
      .filter(function (c) {
        var k = c.toLowerCase();
        if (!c || c.indexOf('@') === -1 || k === propio || vistos[k]) return false;
        vistos[k] = true;
        return true;
      })
      .join(',');
  } catch (e) {
    _registrarEvento_('WARN', ASIGNACIONES_MODULO, 'No se pudo resolver CC de asignación', e.message);
    return '';
  }
}

/**
 * Avisa al admin (BCC_AUDITORIA) cuando hay nombres sin correo, una sola vez por
 * conjunto distinto de nombres (evita un correo en cada corrida).
 */
function Asignaciones_avisarSinCorreo_(sinCorreo) {
  var nombres = Object.keys(sinCorreo).sort();
  if (!nombres.length) return;

  var firma = nombres.join('|');
  var props = PropertiesService.getScriptProperties();
  if (props.getProperty(ASIGNACIONES_PROP_ULTIMO_AVISO) === firma) return;

  var detalle = nombres.map(function (n) { return n + ' (' + sinCorreo[n] + ' caso/s)'; }).join(', ');
  _registrarEvento_('WARN', ASIGNACIONES_MODULO, 'Analistas sin correo en Config_Analistas', detalle);

  var destino = typeof BCC_AUDITORIA === 'string' ? BCC_AUDITORIA : '';
  if (destino) {
    MailApp.sendEmail({
      to: destino,
      subject: '⚠️ Asignaciones sin notificar · falta correo del analista',
      htmlBody: '<p>Estos nombres de <strong>ASIGNADA A…</strong> no están en la pestaña ' +
        '<strong>Config_Analistas</strong> (o están inactivos), por lo que no se envió el correo ni se registró la hora:</p><p>' +
        Asignaciones_escapar_(detalle) + '</p><p>Agrégalos o corrige el nombre en el sheet; se notificarán automáticamente.</p>',
      name: 'Inducciones · El Libertador'
    });
  }
  props.setProperty(ASIGNACIONES_PROP_ULTIMO_AVISO, firma);
}

// ============================================================
//  ENTRADAS PÚBLICAS
// ============================================================

/**
 * Trigger por tiempo: notifica las asignaciones nuevas.
 * @param {{simular?:boolean}} [opciones] simular=true no envía ni escribe nada.
 * @returns {{ok:boolean, correos:number, casos:number, sinCorreo:Object, errores:string[], mensaje?:string}}
 */
function notificarAsignacionesPendientes(opciones) {
  var simular = !!(opciones && opciones.simular);
  var resumen = { ok: true, correos: 0, casos: 0, sinCorreo: {}, errores: [] };

  var lock = LockService.getScriptLock();
  if (!lock.tryLock(30000)) {
    resumen.ok = false;
    resumen.mensaje = 'Otra corrida de asignaciones está en curso.';
    return resumen;
  }

  try {
    var datos = Asignaciones_recolectar_();
    var grupos = Object.keys(datos.resultado.porEmail).map(function (k) { return datos.resultado.porEmail[k]; });
    resumen.sinCorreo = datos.resultado.sinCorreo;

    if (simular) {
      resumen.correos = grupos.length;
      resumen.casos = grupos.reduce(function (s, g) { return s + g.casos.length; }, 0);
      resumen.detalle = grupos.map(function (g) { return g.nombre + ' <' + g.email + '>: ' + g.casos.length + ' caso/s'; });
      return resumen;
    }

    Asignaciones_avisarSinCorreo_(datos.resultado.sinCorreo);
    if (!grupos.length) return resumen;

    var cuota = MailApp.getRemainingDailyQuota();
    var urlHoja = datos.ctx.libroAnalisis.getUrl ? datos.ctx.libroAnalisis.getUrl() : '';
    var gid = datos.ctx.hojaAnalisis.getSheetId ? datos.ctx.hojaAnalisis.getSheetId() : '';
    if (urlHoja && gid !== '') urlHoja += '#gid=' + gid;

    grupos.forEach(function (grupo) {
      if (cuota < 1) { resumen.errores.push('Sin cuota de correo para ' + grupo.email); return; }

      try {
        Asignaciones_enriquecerCasos_(datos.ctx, grupo.casos);
        // Saludo con solo el primer nombre, derivado del correo (como las demás notificaciones).
        var primerNombre = emailANombre(grupo.email, 'PRIMER_NOMBRE') || 'Analista';
        var correo = Asignaciones_construirCorreo_(primerNombre, grupo.casos, urlHoja);
        MailApp.sendEmail({
          to: grupo.email,
          cc: Asignaciones_resolverCC_(grupo.email),
          bcc: typeof BCC_AUDITORIA === 'string' ? BCC_AUDITORIA : '',
          subject: correo.asunto,
          htmlBody: correo.html,
          replyTo: 'noreply@ellibertador.co',
          name: 'Inducciones · El Libertador'
        });
        cuota--;
      } catch (errEnvio) {
        // Sin sello: se reintenta en la siguiente corrida.
        resumen.errores.push(grupo.email + ': ' + errEnvio.message);
        _registrarEvento_('ERROR', ASIGNACIONES_MODULO, 'No se pudo enviar correo de asignación', grupo.email + ' | ' + errEnvio.message);
        return;
      }

      // Hora real de asignación = justo después del envío exitoso (misma para todo el correo).
      var ahora = new Date();
      grupo.casos.forEach(function (caso) {
        try {
          Asignaciones_sellarCaso_(datos.ctx, caso, caso.nombreEnSheet, ahora);
        } catch (errSello) {
          resumen.errores.push('Sello fila ' + caso.filaRegistro + ': ' + errSello.message);
          _registrarEvento_('ERROR', ASIGNACIONES_MODULO, 'Correo enviado pero no se pudo sellar', 'UUID ' + caso.uuid + ' | ' + errSello.message);
        }
      });
      Asignaciones_registrarHistorial_(datos.ctx.libroControl, grupo, grupo.casos, ahora);
      resumen.correos++;
      resumen.casos += grupo.casos.length;
    });

    if (resumen.correos) {
      _registrarEvento_('INFO', ASIGNACIONES_MODULO, 'Asignaciones notificadas', resumen.correos + ' correo(s), ' + resumen.casos + ' caso(s)');
    }
    resumen.ok = resumen.errores.length === 0;
    return resumen;
  } catch (e) {
    _registrarEvento_('ERROR', ASIGNACIONES_MODULO, 'Fallo en notificarAsignacionesPendientes', e.message);
    resumen.ok = false;
    resumen.errores.push(e.message);
    return resumen;
  } finally {
    lock.releaseLock();
  }
}

/** Equivalencias iniciales nombre en el sheet → correo (entregadas por operación). */
var ASIGNACIONES_ANALISTAS_INICIALES = [
  ['A PELAEZ', 'andres.pelaez@segurosbolivar.com'],
  ['A PUELLO', 'argemiro.puello@segurosbolivar.com'],
  ['A VARGAS', 'angela.vargas@segurosbolivar.com'],
  ['B PÍNEDA', 'blanca.pineda@segurosbolivar.com'],
  ['C CARDONA', 'claudia.cardona@segurosbolivar.com'],
  ['C SALDAÑA', 'carolina.saldana@segurosbolivar.com'],
  ['D CARDENAS', 'diego.cardenas@segurosbolivar.com'],
  ['D GIRALDO', 'daniela.giraldo@segurosbolivar.com'],
  ['D MARIN', 'diana.marin@segurosbolivar.com'],
  ['E RUGELES', 'elizabeth.rugeles@segurosbolivar.com'],
  ['I RUIZ', 'ingri.ruiz@segurosbolivar.com'],
  ['I SANCHEZ', 'ines.sanchez@segurosbolivar.com'],
  ['J ASCANIO', 'jenny.ascanio@segurosbolivar.com'],
  ['J CASTAÑEDA', 'jennifer.castaneda@segurosbolivar.com'],
  ['J ENCISO', 'jonathan.enciso@segurosbolivar.com'],
  ['J VASQUEZ', 'juanita.vasquez@segurosbolivar.com'],
  ['JP DIAZ', 'juan.diaz.buitrago@segurosbolivar.com'],
  ['L FLOREZ', 'leidy.florez@segurosbolivar.com'],
  ['L LUQUE', 'leidy.luque@segurosbolivar.com'],
  ['L TORRES', 'lisset.torres@segurosbolivar.com'],
  ['L YATE', 'leidy.yate@segurosbolivar.com'],
  ['M POVEDA', 'monica.poveda@segurosbolivar.com'],
  ['N BEJARANO', 'nancy.bejarano@segurosbolivar.com'],
  ['N POVEDA', 'laura.poveda@segurosbolivar.com'],
  ['O ROMERO', 'oscar.ivan.romero@segurosbolivar.com'],
  ['P LUCUMI', 'jeymi.lucumi@segurosbolivar.com'],
  ['S ARANGÓN', 'saul.aragon@segurosbolivar.com'],
  ['S BERDUGO', 'stefany.berdugo@segurosbolivar.com'],
  ['S GALVAN', 'sindy.galvan@segurosbolivar.com'],
  ['V LOPEZ', 'vanessa.lopez@segurosbolivar.com'],
  ['X GARCIA', 'kharen.garcia@segurosbolivar.com'],
  ['Y LEIVA', 'yennifer.leiva@segurosbolivar.com'],
  ['Y PANTOJA', 'yessica.pantoja@segurosbolivar.com'],
  ['Y PULIDO', 'yandry.pulido@segurosbolivar.com'],
  ['Z JIMENEZ', 'zulay.jimenez@segurosbolivar.com']
];

/**
 * Crea la pestaña Config_Analistas (si no existe) y agrega los analistas
 * iniciales que falten. Idempotente: no pisa filas existentes ni duplica nombres.
 * Ejecutar UNA VEZ desde el editor, antes de configurarTriggerAsignaciones().
 * @returns {{ok:boolean, agregados:number}}
 */
function configurarHojaConfigAnalistas() {
  var libro = SpreadsheetRegistry_get(getHojaControlId());
  var hoja = libro.getSheetByName(ASIGNACIONES_HOJA_CONFIG);
  if (!hoja) {
    hoja = libro.insertSheet(ASIGNACIONES_HOJA_CONFIG);
    hoja.appendRow(['NOMBRE_EN_SHEET', 'EMAIL', 'ACTIVO']);
    hoja.getRange(1, 1, 1, 3).setFontWeight('bold').setBackground('#253150').setFontColor('white');
    hoja.setFrozenRows(1);
  }

  var existentes = {};
  var valores = hoja.getDataRange().getValues();
  for (var i = 1; i < valores.length; i++) {
    existentes[Asignaciones_normalizarNombre_(valores[i][0])] = true;
  }

  var agregados = 0;
  ASIGNACIONES_ANALISTAS_INICIALES.forEach(function (par) {
    if (existentes[Asignaciones_normalizarNombre_(par[0])]) return;
    hoja.appendRow([par[0], par[1], true]);
    agregados++;
  });
  return { ok: true, agregados: agregados };
}

/**
 * Ejecutar desde el editor para ver qué se enviaría, sin enviar ni escribir nada.
 */
function previsualizarAsignacionesPendientes() {
  var r = notificarAsignacionesPendientes({ simular: true });
  console.log(JSON.stringify(r, null, 2));
  return r;
}

/**
 * Crea (idempotente) el trigger por tiempo. Ejecutar UNA VEZ desde el editor.
 * @param {number} [minutos=5] 1, 5, 10, 15 o 30.
 */
function configurarTriggerAsignaciones(minutos) {
  var handler = 'notificarAsignacionesPendientes';
  var triggers = ScriptApp.getProjectTriggers();
  for (var i = 0; i < triggers.length; i++) {
    if (triggers[i].getHandlerFunction() === handler) ScriptApp.deleteTrigger(triggers[i]);
  }
  var cada = [1, 5, 10, 15, 30].indexOf(minutos) !== -1 ? minutos : 5;
  ScriptApp.newTrigger(handler).timeBased().everyMinutes(cada).create();
  return { ok: true, mensaje: 'Trigger de asignaciones cada ' + cada + ' minutos.' };
}
