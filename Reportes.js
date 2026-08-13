/**
 * Reporte diario de gestión de inducciones.
 *
 * Estrictamente de lectura: no escribe en Control_General ni en registro analisis,
 * por lo que no requiere LockService (no compite con sincronizarLoteAutomatico ni
 * procesarDatosMejorado, que sí escriben).
 */

/**
 * Convierte el valor de una celda de fecha a un Date con la hora en 00:00,
 * sin importar si Sheets lo entrega como objeto Date real o como texto
 * (ej. "24/07/2026" o "2026-07-24") — columnas llenadas o pegadas como
 * texto no se reconocen como Date por getValues() y quedaban ignoradas.
 * Devuelve null si no se pudo interpretar como fecha.
 */
function _normalizarFecha_(valor) {
  if (valor instanceof Date && !isNaN(valor.getTime())) {
    const f = new Date(valor);
    f.setHours(0, 0, 0, 0);
    return f;
  }

  if (typeof valor === "string" && valor.trim()) {
    const texto = valor.trim();

    let m = texto.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4})$/); // dd/mm/yyyy o dd-mm-yyyy
    if (m) return new Date(Number(m[3]), Number(m[2]) - 1, Number(m[1]));

    m = texto.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/); // yyyy-mm-dd (ISO)
    if (m) return new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));

    // "24 de julio de 2026" — formato de texto en español que usa el script
    // que llena Historico_Envios (fechaHoyTexto), no una fecha real de Sheets.
    m = texto.match(/^(\d{1,2})\s+de\s+([a-zñ]+)\s+de\s+(\d{4})$/i);
    if (m) {
      const mesIndex = MESES_ES.indexOf(m[2].toLowerCase());
      if (mesIndex !== -1) return new Date(Number(m[3]), mesIndex, Number(m[1]));
    }

    const intento = new Date(texto); // último recurso: dejar que el motor lo intente
    if (!isNaN(intento.getTime())) {
      intento.setHours(0, 0, 0, 0);
      return intento;
    }
  }

  return null;
}

/**
 * Bloque unificado de resultados enviados hoy: muestra el total y el desglose
 * por categoría en un solo bloque visual cohesivo. Si no hay resultados hoy,
 * no se muestra el bloque (devuelve "").
 */
function _bloque_resultados_enviados_(resultados) {
  if (!resultados || resultados.lotes === 0) return "";

  const claves = Object.keys(resultados.porResultado);
  const badges = claves.sort().map(k => _badge_estado_generico_(k, resultados.porResultado[k])).join("");

  return `
  <tr>
    <td style="padding:20px 28px 0;">
      <div style="height:1px;background:#f1f5f9;margin-bottom:14px;"></div>
      <div style="font-size:9px;font-weight:700;letter-spacing:1.2px;text-transform:uppercase;
                  color:#94a3b8;margin-bottom:6px;font-family:Arial,sans-serif;">
        Resultados enviados hoy
      </div>
      <div style="font-size:22px;font-weight:900;color:#3B6D11;font-family:Arial,sans-serif;
                  margin-bottom:10px;">
        ${resultados.lotes} <span style="font-size:12px;font-weight:400;color:#94a3b8;">lotes</span>
      </div>
      <div>${badges}</div>
    </td>
  </tr>`;
}

/**
 * Lee Control_General, Hoja_Control, registro analisis e Historico_Envios
 * usando SpreadsheetRegistry para garantizar una sola apertura por libro.
 *
 * Libros abiertos:
 *   - ID_HOJA_CONTROL     → Control_General + Hoja_Control
 *   - ID_ARCHIVO_ANALISIS → registro analisis + Historico_Envios
 *
 * @param {Date} [fechaRef]  Fecha a usar como "hoy" para las métricas del día
 *   (analizadasHoy, resultadosEnviadosHoy). Por defecto la fecha actual — el
 *   envío real (enviarReporteGestionInducciones) siempre usa el valor por
 *   defecto; el parámetro solo existe para pruebas manuales con otra fecha.
 * @sheets_read 2 (1 openById por libro vía SpreadsheetRegistry)
 */
function _recolectarMetricasGestion_(fechaRef) {
  const fecha = fechaRef || new Date();
  const IDX = { idLote: 0, fechaIngreso: 2, estado: 9, comercial: 10 };

  // ── 1. Libro de control: una sola apertura para Control_General + Hoja_Control ──
  const ssControl    = SpreadsheetRegistry_get(ID_HOJA_CONTROL);
  const hojaControl  = ssControl.getSheetByName("Control_General");
  const dataControl  = retry(() => hojaControl.getDataRange().getValues());

  const conteoEstados = {};
  const lotes = {}; // idLote -> { idLote, comercial, fechaIngreso, contratos, estados:{ESTADO:n} }

  for (let i = 1; i < dataControl.length; i++) {
    const fila   = dataControl[i];
    const idLote = String(fila[IDX.idLote] || "").trim();
    if (!idLote) continue;

    const estado = String(fila[IDX.estado] || "").trim().toUpperCase();
    conteoEstados[estado] = (conteoEstados[estado] || 0) + 1;

    if (!lotes[idLote]) {
      lotes[idLote] = {
        idLote:        idLote,
        comercial:     String(fila[IDX.comercial] || "").trim(),
        fechaIngreso:  fila[IDX.fechaIngreso],
        contratos:     0,
        estados:       {}
      };
    }
    lotes[idLote].contratos++;
    lotes[idLote].estados[estado] = (lotes[idLote].estados[estado] || 0) + 1;
  }

  // Lotes activos = tienen al menos un contrato en un estado distinto de TERMINADO.
  // Cruzamos con Hoja_Control (misma instancia ssControl) para obtener el email real del comercial
  const hojaHC = ssControl.getSheetByName("Hoja_Control");
  const mapaLoteEmail = {};
  if (hojaHC) {
    const dataHC = retry(() => hojaHC.getDataRange().getValues());
    for (let i = 1; i < dataHC.length; i++) {
      const idLoteHC = String(dataHC[i][5] || "").trim(); // Col F
      const emailHC  = String(dataHC[i][1] || "").trim(); // Col B
      if (idLoteHC && emailHC.includes("@")) mapaLoteEmail[idLoteHC] = emailHC;
    }
  }

  const lotesActivos = Object.values(lotes)
    .filter(l => Object.keys(l.estados).some(e => e !== "TERMINADO"))
    .map(l => ({
      idLote:         l.idLote,
      comercial:      emailANombre(mapaLoteEmail[l.idLote] || l.comercial, 'COMPLETO'),
      fechaIngresoStr: l.fechaIngreso instanceof Date
        ? Utilities.formatDate(l.fechaIngreso, "GMT-5", "d/MM/yyyy")
        : String(l.fechaIngreso || ""),
      contratos:      l.contratos,
      estados:        l.estados
    }))
    .sort((a, b) => (a.fechaIngresoStr < b.fechaIngresoStr ? 1 : -1));

  // ── 2. Libro de análisis: una sola apertura para registro analisis + Historico_Envios ──
  const ssAnalisis   = SpreadsheetRegistry_get(ID_ARCHIVO_ANALISIS);

  // ── 2a. Resultados enviados hoy (Historico_Envios) ──
  const resultadosEnviadosHoy = (function() {
    const resultado = { lotes: 0, solicitudesAprobadas: 0, solicitudesNegadas: 0, porResultado: {} };

    const hojaHistorico = ssAnalisis.getSheetByName("Historico_Envios");
    if (!hojaHistorico) {
      Logger.log("Aviso: no se encontró la hoja 'Historico_Envios'. 'Resultados enviados hoy' quedará en 0.");
      return resultado;
    }

    const datos      = retry(() => hojaHistorico.getDataRange().getValues());
    const encHist    = datos[0];

    const colFecha     = encHist.indexOf("Fecha de Emisión");
    const colAprobadas = encHist.indexOf("Cantidad Solicitudes Aprobadas");
    const colNegadas   = encHist.indexOf("Cantidad Solicitudes Negadas");
    const colResultado = encHist.indexOf("Resultado Final Lote");

    if (colFecha === -1) {
      Logger.log("Aviso: no se encontró 'Fecha de Emisión' en 'Historico_Envios'. 'Resultados enviados hoy' quedará en 0.");
      return resultado;
    }

    const hoyHist = new Date(fecha);
    hoyHist.setHours(0, 0, 0, 0);

    for (let i = 1; i < datos.length; i++) {
      const fila       = datos[i];
      const valorCrudo = fila[colFecha];
      const f          = _normalizarFecha_(valorCrudo);

      if (!f) continue;
      if (f.getTime() !== hoyHist.getTime()) continue;

      resultado.lotes++;
      if (colAprobadas !== -1) resultado.solicitudesAprobadas += Number(fila[colAprobadas]) || 0;
      if (colNegadas   !== -1) resultado.solicitudesNegadas   += Number(fila[colNegadas])   || 0;

      if (colResultado !== -1) {
        const valor = String(fila[colResultado] || "").trim() || "Sin dato";
        resultado.porResultado[valor] = (resultado.porResultado[valor] || 0) + 1;
      }
    }

    return resultado;
  })();

  // ── 2b. Analizadas hoy (registro analisis) ──
  const hojaAnalisis = ssAnalisis.getSheetByName("registro analisis");
  const dataAnalisis = retry(() => hojaAnalisis.getDataRange().getValues());
  const encabezados  = dataAnalisis[0];

  const colFechaEval = encabezados.indexOf("Fecha Evaluacion");

  const hoy = new Date(fecha);
  hoy.setHours(0, 0, 0, 0);

  let analizadasHoy = 0;
  if (colFechaEval !== -1) {
    for (let i = 1; i < dataAnalisis.length; i++) {
      const f = _normalizarFecha_(dataAnalisis[i][colFechaEval]);
      if (!f) continue;

      if (f.getTime() === hoy.getTime()) analizadasHoy++;
    }
  } else {
    Logger.log("Aviso: no se encontró 'Fecha Evaluacion' en 'registro analisis'. 'Analizadas hoy' quedará en 0.");
  }

  return {
    analizadasHoy:            analizadasHoy,
    pendientesRadicar:        conteoEstados["PENDIENTE RADICAR"] || 0,
    pendientesPazYSalvo:      conteoEstados["PENDIENTE PAZ Y SALVO"] || 0,
    pendientesAsignar:        conteoEstados["PENDIENTE ASIGNAR"] || 0,
    enAnalisis:               conteoEstados["EN ANÁLISIS"] || 0,
    pendientesErroresTerceros: conteoEstados["ERROR EN TERCEROS"] || 0,
    resultadosEnviadosHoy:    resultadosEnviadosHoy,
    lotesActivos:             lotesActivos
  };
}

/**
 * @deprecated Lógica consolidada dentro de _recolectarMetricasGestion_().
 * Se mantiene únicamente por si algún script manual la invoca directamente.
 * Usa SpreadsheetRegistry_get para no duplicar aperturas.
 * @param {Date} [fechaRef]  Fecha a comparar contra "Fecha de Emisión". Por defecto hoy.
 */
function _recolectarResultadosEnviadosHoy_(fechaRef) {
  const resultado = { lotes: 0, solicitudesAprobadas: 0, solicitudesNegadas: 0, porResultado: {} };

  const ssAnalisis    = SpreadsheetRegistry_get(ID_ARCHIVO_ANALISIS);
  const hojaHistorico = ssAnalisis.getSheetByName("Historico_Envios");

  if (!hojaHistorico) {
    Logger.log("Aviso: no se encontró la hoja 'Historico_Envios'. 'Resultados enviados hoy' quedará en 0.");
    return resultado;
  }

  const datos       = retry(() => hojaHistorico.getDataRange().getValues());
  const encabezados  = datos[0];

  const colFecha     = encabezados.indexOf("Fecha de Emisión");
  const colAprobadas = encabezados.indexOf("Cantidad Solicitudes Aprobadas");
  const colNegadas   = encabezados.indexOf("Cantidad Solicitudes Negadas");
  const colResultado = encabezados.indexOf("Resultado Final Lote");

  if (colFecha === -1) {
    Logger.log("Aviso: no se encontró 'Fecha de Emisión' en 'Historico_Envios'. 'Resultados enviados hoy' quedará en 0.");
    return resultado;
  }

  const hoy = new Date(fechaRef || new Date());
  hoy.setHours(0, 0, 0, 0);

  for (let i = 1; i < datos.length; i++) {
    const fila       = datos[i];
    const valorCrudo = fila[colFecha];
    const f          = _normalizarFecha_(valorCrudo);

    if (!f) continue;
    if (f.getTime() !== hoy.getTime()) continue;

    resultado.lotes++;
    if (colAprobadas !== -1) resultado.solicitudesAprobadas += Number(fila[colAprobadas]) || 0;
    if (colNegadas   !== -1) resultado.solicitudesNegadas   += Number(fila[colNegadas])   || 0;

    if (colResultado !== -1) {
      const valor = String(fila[colResultado] || "").trim() || "Sin dato";
      resultado.porResultado[valor] = (resultado.porResultado[valor] || 0) + 1;
    }
  }

  return resultado;
}

const MESES_ES = [
  "enero", "febrero", "marzo", "abril", "mayo", "junio",
  "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre"
];

/**
 * Formatea una fecha como "25 de julio de 2026", sin depender del idioma
 * configurado en el proyecto de Apps Script (Utilities.formatDate con
 * "MMMM" devuelve el nombre del mes en inglés si esa configuración no está
 * en español, sin importar la zona horaria que se le pase).
 */
function _formatearFechaEs_(fecha) {
  const dia  = Utilities.formatDate(fecha, "GMT-5", "d");
  const mes  = MESES_ES[Number(Utilities.formatDate(fecha, "GMT-5", "M")) - 1];
  const anio = Utilities.formatDate(fecha, "GMT-5", "yyyy");
  return `${dia} de ${mes} de ${anio}`;
}

/**
 * Función pura (sin llamadas a Sheets/GAS): calcula el rango del ÚLTIMO MES
 * CALENDARIO COMPLETO antes de `fecha` (el "mes que se está cerrando") y el
 * del mes anterior a ese (para la comparación "consigo mismo").
 *
 * OJO: no es "el mes que contiene `fecha`". Un reporte de CIERRE de mes
 * disparado el día 1 de agosto debe resumir julio (el mes que ya terminó),
 * no agosto (el que apenas empieza y casi no tiene datos todavía). Por eso
 * se resta 1 mes antes de calcular, sin importar qué día del mes sea `fecha`.
 * @param {Date} [fecha]  Por defecto, ahora. Parámetro solo para pruebas.
 * @returns {{mesReporte:{inicio:Date,fin:Date,nombre:string}, mesComparacion:{inicio:Date,fin:Date,nombre:string}}}
 */
function _rangosMesCierreYComparacion_(fecha) {
  const ref = fecha ? new Date(fecha) : new Date();

  const inicioMesReporte = new Date(ref.getFullYear(), ref.getMonth() - 1, 1, 0, 0, 0, 0);
  const finMesReporte    = new Date(ref.getFullYear(), ref.getMonth(), 0, 23, 59, 59, 999);
  const inicioComparacion = new Date(ref.getFullYear(), ref.getMonth() - 2, 1, 0, 0, 0, 0);
  const finComparacion    = new Date(ref.getFullYear(), ref.getMonth() - 1, 0, 23, 59, 59, 999);

  return {
    mesReporte:     { inicio: inicioMesReporte, fin: finMesReporte, nombre: MESES_ES[inicioMesReporte.getMonth()] },
    mesComparacion: { inicio: inicioComparacion, fin: finComparacion, nombre: MESES_ES[inicioComparacion.getMonth()] }
  };
}

/**
 * Arma el asunto y el HTML del correo de gestión a partir de las métricas.
 * Separado del envío para poder reutilizarlo tanto en el envío real a
 * líderes como en la vista previa que se manda solo a quien la ejecuta.
 * @param {Object} m         Resultado de _recolectarMetricasGestion_.
 * @param {Date}   [fechaRef] Fecha a mostrar como "Corte del..." — por defecto hoy.
 */
function _construirCorreoReporteGestion_(m, fechaRef) {
  const fechaHoy = _formatearFechaEs_(fechaRef || new Date());

  const htmlBody = _envolver_([

    _bloque_cabecera_("Reporte diario"),

    _bloque_barra_estado_(_C_NAVY, "&#128202;", "Gestión de inducciones"),

    _bloque_cuerpo_inicio_(
      "Reporte de gestión",
      `Corte del <strong style="color:#253150;">${fechaHoy}</strong>. Resumen del estado actual
       del proceso de inducciones y seguimiento por lote.`
    ),

    _bloque_chips_([
      { label: "Analizadas hoy",                      valor: String(m.analizadasHoy),              colorVal: "#3B6D11" },
      { label: "Pendientes por radicar",              valor: String(m.pendientesRadicar)                               },
      { label: "Pendiente por asignar",               valor: String(m.pendientesAsignar)                               },
      { label: "Analizadas pendiente por resultado",  valor: String(m.enAnalisis)                                      },
      { label: "Pendientes paz y salvo",              valor: String(m.pendientesPazYSalvo),        colorVal: "#E65100" },
      { label: "Pendientes error terceros",           valor: String(m.pendientesErroresTerceros),  colorVal: _C_ROJO   }
    ]),

    _bloque_resultados_enviados_(m.resultadosEnviadosHoy),

    _bloque_tabla_seguimiento_(m.lotesActivos),

    _bloque_nota_(
      `<strong style="color:#253150;">Nota:</strong> Los lotes en estado
       <strong>Pendiente Paz y Salvo</strong> dependen del env&iacute;o del documento por parte
       de la inmobiliaria al comercial. Los estados <strong>Error en Terceros</strong> requieren
       correcci&oacute;n de datos por parte del ejecutivo comercial para continuar el tr&aacute;mite.`
    ),

    _bloque_pie_()

  ].join(""));

  return {
    asunto: `📊 Reporte de gestión de inducciones · ${fechaHoy}`,
    htmlBody: htmlBody
  };
}

/**
 * Arma y envía el correo diario de gestión de inducciones a los líderes.
 * Es la que dispara el trigger diario (configurarTriggerReporteGestion).
 */
function enviarReporteGestionInducciones() {
  try {
    // Verificar cuota antes de enviar (Fase 2.2)
    if (!_verificarCuotaEmail_(1)) {
      Logger.log("⚠️ Cuota de email insuficiente para enviar reporte de gestión.");
      return;
    }

    const m = _recolectarMetricasGestion_();
    const correo = _construirCorreoReporteGestion_(m);
    const destinatarios = UsuariosRepo_getCorreosAdmin();

    MailApp.sendEmail({
      to:       destinatarios.join(","),
      bcc:      BCC_AUDITORIA,
      subject:  correo.asunto,
      htmlBody: correo.htmlBody,
      replyTo:  "noreply@ellibertador.co",
      name:     "Inducciones · El Libertador"
    });

    Logger.log("✅ Reporte de gestión enviado a admins.");
    _registrarEvento_("INFO", "Reportes.js", "Reporte de gestión enviado", "Destinatarios: " + destinatarios.length);
  } catch (err) {
    console.error("Error en enviarReporteGestionInducciones: " + err.message);
    _registrarEvento_("ERROR", "Reportes.js", "Error al enviar reporte de gestión", err.message);
  }
}



/**
 * Ejecutar UNA VEZ, manualmente, desde el editor de Apps Script para crear
 * los triggers de enviarReporteGestionInducciones: lunes a viernes 5:00pm
 * (hora de cierre) y sábado 12:30pm.
 *
 * Nota sobre precisión: Apps Script no garantiza el minuto exacto de
 * ejecución de un trigger de tiempo — atHour/nearMinute apuntan a esa hora,
 * pero puede disparar con algunos minutos de diferencia.
 *
 * Idempotente por reemplazo: borra cualquier trigger previo de este reporte
 * (sin importar el horario con el que se haya creado) antes de crear el set
 * correcto, así se puede volver a ejecutar sin duplicar ni dejar horarios
 * viejos corriendo en paralelo.
 */
function configurarTriggerReporteGestion() {
  ScriptApp.getProjectTriggers()
    .filter(t => t.getHandlerFunction() === 'enviarReporteGestionInducciones')
    .forEach(t => ScriptApp.deleteTrigger(t));

  const diasEntreSemana = [
    ScriptApp.WeekDay.MONDAY,
    ScriptApp.WeekDay.TUESDAY,
    ScriptApp.WeekDay.WEDNESDAY,
    ScriptApp.WeekDay.THURSDAY,
    ScriptApp.WeekDay.FRIDAY
  ];

  diasEntreSemana.forEach(dia => {
    ScriptApp.newTrigger('enviarReporteGestionInducciones')
      .timeBased()
      .onWeekDay(dia)
      .atHour(17)
      .nearMinute(0)
      .create();
  });

  ScriptApp.newTrigger('enviarReporteGestionInducciones')
    .timeBased()
    .onWeekDay(ScriptApp.WeekDay.SATURDAY)
    .atHour(12)
    .nearMinute(30)
    .create();

  Logger.log('Triggers creados: enviarReporteGestionInducciones — lunes a viernes 5:00pm, sábado 12:30pm (America/Bogota).');
}


// ══════════════════════════════════════════════════════════════════════════════
// REPORTE DE CIERRE DE MES — 1 correo individual por comercial
//
// A diferencia del reporte de gestión (para líderes, panorama global), este
// va solo al comercial dueño de los lotes, con su propio avance y lo que
// necesita resolver. No incluye ningún link/botón hacia la app — el canal
// de corrección hoy sigue siendo responder al correo de aviso original
// (ver decisión de negocio: el CRM aún está en fase de validación).
//
// El asunto incluye nombre + mes + año para evitar que Gmail agrupe los
// reportes mensuales en un solo hilo.
// ══════════════════════════════════════════════════════════════════════════════

/**
 * Cuenta lotes radicados agrupados por resultado (EXITOSO / FALLIDO) para un
 * comercial en un rango de fechas. Lee Hoja_Control columna D ("Resultado").
 *
 * Optimización (Req 4.5): acepta datos pre-cargados para evitar lecturas
 * repetidas cuando se invoca para múltiples comerciales en el mismo ciclo.
 *
 * @param {string} email - Email del comercial
 * @param {Date} fechaInicio
 * @param {Date} fechaFin
 * @param {Array<Array>} [datosPreCargados] - Datos de Hoja_Control ya leídos (2D array con encabezados).
 *   Si se provee, se usa directamente sin abrir ni leer la hoja.
 *   Si no se provee, lee Hoja_Control via SpreadsheetRegistry_get (una sola apertura por ejecución).
 * @returns {{exitosos:number, fallidos:number, total:number}}
 */
function contarRadicacionesPorResultadoEnRango(email, fechaInicio, fechaFin, datosPreCargados) {
  var data;

  if (datosPreCargados && datosPreCargados.length > 0) {
    data = datosPreCargados;
  } else {
    var ss = SpreadsheetRegistry_get(ID_HOJA_CONTROL);
    var hoja = ss.getSheetByName("Hoja_Control");
    if (!hoja) return { exitosos: 0, fallidos: 0, total: 0 };
    data = hoja.getDataRange().getValues();
  }

  var emailLower = String(email || "").trim().toLowerCase();
  var lotesExitosos = new Set();
  var lotesFallidos = new Set();

  for (var i = 1; i < data.length; i++) {
    var fechaRaw = data[i][0];
    if (!(fechaRaw instanceof Date)) continue;
    if (fechaRaw < fechaInicio || fechaRaw > fechaFin) continue;

    var emailLog  = String(data[i][1] || "").trim().toLowerCase();
    if (emailLog !== emailLower) continue;

    var resultado = String(data[i][3] || "").trim().toUpperCase();
    var idLote    = String(data[i][5] || "").trim();
    if (!idLote) continue;

    if (resultado === "EXITOSO") {
      lotesExitosos.add(idLote);
    } else if (resultado === "FALLIDO") {
      lotesFallidos.add(idLote);
    }
  }

  return {
    exitosos: lotesExitosos.size,
    fallidos: lotesFallidos.size,
    total: lotesExitosos.size + lotesFallidos.size
  };
}

/**
 * Bloque HTML: gráfico de barras horizontales de lotes radicados (últimos 3 meses).
 * Cada barra es proporcional al valor máximo del período.
 * @param {Array} meses - [{nombre:string, valor:number}] (máx 3, del más antiguo al más reciente)
 */
function _bloque_barras_radicacion_cierreMes_(meses) {
  if (!meses || meses.length === 0) return '';

  var maxVal = Math.max.apply(null, meses.map(function(m) { return m.valor; }));
  if (maxVal === 0) maxVal = 1; // evitar división por 0

  var barrasHtml = meses.map(function(m) {
    var porcentaje = Math.round((m.valor / maxVal) * 100);
    var ancho = Math.max(porcentaje, 8); // mínimo visible
    return '<tr>'
      + '<td style="padding:5px 0;font-family:Arial,sans-serif;font-size:11px;color:#64748b;width:80px;white-space:nowrap;">' + m.nombre + '</td>'
      + '<td style="padding:5px 8px;">'
      + '<div style="background:#e2e8f0;border-radius:4px;height:22px;width:100%;position:relative;">'
      + '<div style="background:#253150;border-radius:4px;height:22px;width:' + ancho + '%;min-width:24px;"></div>'
      + '</div>'
      + '</td>'
      + '<td style="padding:5px 0;font-family:Arial,sans-serif;font-size:13px;font-weight:700;color:#253150;width:36px;text-align:right;">' + m.valor + '</td>'
      + '</tr>';
  }).join('');

  return '<tr><td style="padding:22px 28px 0;">'
    + '<div style="height:1px;background:#f1f5f9;margin-bottom:14px;"></div>'
    + '<div style="font-size:9px;font-weight:700;letter-spacing:1.2px;text-transform:uppercase;color:#94a3b8;margin-bottom:10px;font-family:Arial,sans-serif;">Lotes radicados por mes</div>'
    + '<table width="100%" cellpadding="0" cellspacing="0" border="0">' + barrasHtml + '</table>'
    + '</td></tr>';
}

/**
 * Bloque HTML: gráfico de barras apiladas exitoso/fallido (últimos 3 meses).
 * Muestra la proporción de radicaciones exitosas vs fallidas por mes.
 * @param {Array} meses - [{nombre:string, exitosos:number, fallidos:number}]
 * @param {boolean} mejoro - true si el % de fallidos bajó respecto al mes anterior
 */
function _bloque_barras_calidad_radicacion_(meses, mejoro) {
  if (!meses || meses.length === 0) return '';

  var maxVal = Math.max.apply(null, meses.map(function(m) { return m.exitosos + m.fallidos; }));
  if (maxVal === 0) maxVal = 1;

  var barrasHtml = meses.map(function(m) {
    var total = m.exitosos + m.fallidos;
    var pctExitoso = total > 0 ? Math.round((m.exitosos / maxVal) * 100) : 0;
    var pctFallido = total > 0 ? Math.round((m.fallidos / maxVal) * 100) : 0;
    var anchoExitoso = Math.max(pctExitoso, (m.exitosos > 0 ? 6 : 0));
    var anchoFallido = Math.max(pctFallido, (m.fallidos > 0 ? 6 : 0));

    return '<tr>'
      + '<td style="padding:5px 0;font-family:Arial,sans-serif;font-size:11px;color:#64748b;width:80px;white-space:nowrap;">' + m.nombre + '</td>'
      + '<td style="padding:5px 8px;">'
      + '<div style="display:inline-block;height:22px;width:100%;background:#e2e8f0;border-radius:4px;overflow:hidden;font-size:0;line-height:22px;">'
      + (anchoExitoso > 0 ? '<div style="display:inline-block;background:#3B6D11;height:22px;width:' + anchoExitoso + '%;"></div>' : '')
      + (anchoFallido > 0 ? '<div style="display:inline-block;background:#BD0F14;height:22px;width:' + anchoFallido + '%;"></div>' : '')
      + '</div>'
      + '</td>'
      + '<td style="padding:5px 0;font-family:Arial,sans-serif;font-size:11px;width:60px;text-align:right;white-space:nowrap;">'
      + '<span style="color:#3B6D11;font-weight:700;">' + m.exitosos + '</span>'
      + (m.fallidos > 0 ? ' / <span style="color:#BD0F14;font-weight:700;">' + m.fallidos + '</span>' : '')
      + '</td>'
      + '</tr>';
  }).join('');

  // Leyenda
  var leyenda = '<div style="margin-top:8px;font-size:10px;color:#94a3b8;font-family:Arial,sans-serif;">'
    + '<span style="display:inline-block;width:10px;height:10px;background:#3B6D11;border-radius:2px;vertical-align:middle;margin-right:4px;"></span>Exitosas'
    + '&nbsp;&nbsp;&nbsp;'
    + '<span style="display:inline-block;width:10px;height:10px;background:#BD0F14;border-radius:2px;vertical-align:middle;margin-right:4px;"></span>Fallidas'
    + '</div>';

  // Mensaje motivacional basado en si mejoró o no
  var mensajeHtml = '';
  if (meses.length >= 2) {
    var mesActual = meses[meses.length - 1];
    var mesAnterior = meses[meses.length - 2];
    var pctFallidoActual = (mesActual.exitosos + mesActual.fallidos) > 0
      ? Math.round((mesActual.fallidos / (mesActual.exitosos + mesActual.fallidos)) * 100) : 0;
    var pctFallidoAnterior = (mesAnterior.exitosos + mesAnterior.fallidos) > 0
      ? Math.round((mesAnterior.fallidos / (mesAnterior.exitosos + mesAnterior.fallidos)) * 100) : 0;

    if (mesActual.fallidos === 0 && mesActual.exitosos > 0) {
      mensajeHtml = '<div style="margin-top:12px;padding:10px 14px;background:#EAF3DE;border-radius:6px;font-size:12px;color:#3B6D11;font-family:Arial,sans-serif;">'
        + '&#127942; <strong>¡Excelente!</strong> Este mes todas tus radicaciones fueron exitosas. Sigue así.'
        + '</div>';
    } else if (pctFallidoActual < pctFallidoAnterior) {
      mensajeHtml = '<div style="margin-top:12px;padding:10px 14px;background:#EAF3DE;border-radius:6px;font-size:12px;color:#3B6D11;font-family:Arial,sans-serif;">'
        + '&#9989; <strong>Vas mejorando.</strong> El porcentaje de radicaciones con inconsistencias bajó de ' + pctFallidoAnterior + '% a ' + pctFallidoActual + '%. ¡Buen trabajo!'
        + '</div>';
    } else if (mesActual.fallidos > 0) {
      mensajeHtml = '<div style="margin-top:12px;padding:10px 14px;background:#FFF8F0;border:1px solid #FFE0B2;border-radius:6px;font-size:12px;color:#7C4D00;font-family:Arial,sans-serif;">'
        + '&#128161; <strong>Tip:</strong> Este mes tuviste <strong>' + mesActual.fallidos + '</strong> radicación(es) con inconsistencias'
        + (pctFallidoActual > pctFallidoAnterior ? ' (más que el mes pasado)' : '') + '. '
        + 'Antes de cargar el Excel, verifica que todos los campos obligatorios estén completos y que los datos de identificación y contacto sean correctos. '
        + 'Esto evita reprocesos y agiliza el trámite para ti y tus clientes.'
        + '</div>';
    }
  }

  return '<tr><td style="padding:22px 28px 0;">'
    + '<div style="height:1px;background:#f1f5f9;margin-bottom:14px;"></div>'
    + '<div style="font-size:9px;font-weight:700;letter-spacing:1.2px;text-transform:uppercase;color:#94a3b8;margin-bottom:10px;font-family:Arial,sans-serif;">Calidad de tus radicaciones</div>'
    + '<table width="100%" cellpadding="0" cellspacing="0" border="0">' + barrasHtml + '</table>'
    + leyenda
    + mensajeHtml
    + '</td></tr>';
}

/**
 * Arma la sección "Estado actual de tus lotes abiertos" (badges por estado).
 * @param {Object} resumen  Resultado de obtenerResumenComercial(email).
 */
function _bloque_estado_actual_cierreMes_(resumen) {
  var filas = [
    { label: 'Terminados',             valor: resumen.terminados,   color: '#3B6D11' },
    { label: 'En análisis',            valor: resumen.enAnalisis,   color: '#253150' },
    { label: 'Pendiente paz y salvo',  valor: resumen.pendientePS,  color: '#E65100' },
    { label: 'Error en terceros',      valor: resumen.errorTerceros, color: '#BD0F14' }
  ];

  var filasHtml = filas.map(function(f) {
    return '<tr>'
      + '<td style="padding:8px 0;border-bottom:1px solid #f1f5f9;font-family:Arial,sans-serif;font-size:12px;color:#253150;">' + f.label + '</td>'
      + '<td align="right" style="padding:8px 0;border-bottom:1px solid #f1f5f9;">'
      + '<span style="display:inline-block;padding:2px 10px;border-radius:4px;font-size:11px;font-weight:700;color:' + f.color + ';background:' + f.color + '18;font-family:Arial,sans-serif;">' + f.valor + '</span>'
      + '</td></tr>';
  }).join('');

  return '<tr><td style="padding:22px 28px 0;">'
    + '<div style="height:1px;background:#f1f5f9;margin-bottom:14px;"></div>'
    + '<div style="font-size:9px;font-weight:700;letter-spacing:1.2px;text-transform:uppercase;color:#94a3b8;margin-bottom:12px;font-family:Arial,sans-serif;">Estado actual de tus lotes abiertos</div>'
    + '<table width="100%" cellpadding="0" cellspacing="0" border="0">' + filasHtml + '</table>'
    + '</td></tr>';
}

/**
 * Arma la sección "Esto necesita tu acción": lotes en pendiente paz y salvo
 * (con días de espera) y lotes con error en terceros (con el motivo exacto
 * tomado de Errores_Terceros + CATALOGO_MOTIVOS). Sin link a la app a propósito.
 * @param {Array} pendientesPS      Resultado de obtenerLotesPendientesPazYSalvo().
 * @param {Array} erroresTerceros   Resultado de obtenerErroresPendientesComercial().
 */
function _bloque_accion_requerida_cierreMes_(pendientesPS, erroresTerceros) {
  var items = [];

  (pendientesPS || []).forEach(function(p) {
    items.push({
      idLote: p.idLote,
      motivo: 'Pendiente el documento de paz y salvo de la inmobiliaria.',
      diasHtml: '<div style="font-size:11px;color:#E65100;font-weight:700;font-family:Arial,sans-serif;margin-top:4px;">Lleva ' + p.dias + ' día(s) esperando</div>'
    });
  });

  (erroresTerceros || []).forEach(function(err) {
    (err.participantes || []).forEach(function(part) {
      var motivos = (part.requerimientosDetalle || []).map(function(r) { return r.label; }).join(', ') || 'Corregir datos del participante';
      items.push({
        idLote: err.idLote,
        motivo: motivos + ' de ' + (part.nombreReal || part.participante) + '.',
        diasHtml: ''
      });
    });
  });

  if (items.length === 0) {
    return _bloque_nota_('<strong style="color:#3B6D11;">&#10003; No tienes pendientes que requieran tu acción ahora mismo. ¡Vas al día!</strong>');
  }

  var filasHtml = items.map(function(it) {
    return '<div style="padding:10px 0;border-top:1px solid #fecaca;">'
      + '<div style="font-size:12px;font-weight:700;color:#253150;font-family:Arial,sans-serif;">Lote ' + it.idLote + '</div>'
      + '<div style="font-size:12px;color:#64748b;font-family:Arial,sans-serif;margin-top:2px;">' + it.motivo + '</div>'
      + it.diasHtml
      + '</div>';
  }).join('');

  return '<tr><td style="padding:22px 28px 0;">'
    + '<div style="background:#fff8f8;border:1px solid #fecaca;border-radius:10px;padding:16px 18px;">'
    + '<div style="font-size:11px;font-weight:800;letter-spacing:0.6px;text-transform:uppercase;color:#BD0F14;margin-bottom:4px;font-family:Arial,sans-serif;">&#9888; Esto necesita tu acción</div>'
    + filasHtml
    + '</div></td></tr>';
}

/**
 * Arma el asunto y el HTML del correo de cierre de mes de un comercial.
 * @param {Object} datos  { nombre, nombreMes, radicadosEsteMes, radicadosMesAnterior, resumen, pendientesPS, erroresTerceros, barrasRadicacion, barrasCalidad }
 */
function _construirCorreoCierreMes_(datos) {
  var nombreMesCap = datos.nombreMes.charAt(0).toUpperCase() + datos.nombreMes.slice(1);
  var anioActual = new Date().getFullYear();

  var deltaHtml = '';
  var comparacionTexto = '';
  if (datos.radicadosMesAnterior > 0) {
    var diff = datos.radicadosEsteMes - datos.radicadosMesAnterior;
    var pct = Math.round((Math.abs(diff) / datos.radicadosMesAnterior) * 100);
    if (diff > 0) {
      deltaHtml = '<span style="font-size:11px;font-weight:700;color:#3B6D11;">&#9650; ' + pct + '%</span>';
      comparacionTexto = 'Radicaste ' + diff + ' lote(s) más que el mes pasado (' + datos.radicadosMesAnterior + ').';
    } else if (diff < 0) {
      deltaHtml = '<span style="font-size:11px;font-weight:700;color:#BD0F14;">&#9660; ' + pct + '%</span>';
      comparacionTexto = 'Radicaste ' + Math.abs(diff) + ' lote(s) menos que el mes pasado (' + datos.radicadosMesAnterior + ').';
    } else {
      comparacionTexto = 'Radicaste la misma cantidad que el mes pasado.';
    }
  }

  var introTexto = 'Este es tu resumen de ' + datos.nombreMes + '. Radicaste <strong style="color:#253150;">'
    + datos.radicadosEsteMes + ' lote(s)</strong> este mes' + (comparacionTexto ? '.' : '.') + ' Así vas hoy:';

  var htmlBody = _envolver_([
    _bloque_cabecera_('Reporte mensual'),
    _bloque_barra_estado_(_C_NAVY, '&#128202;', 'Cierre de ' + nombreMesCap + ' ' + anioActual),
    _bloque_cuerpo_inicio_('Hola, ' + datos.nombre, introTexto),
    _bloque_chips_([
      { label: 'Lotes radicados en ' + datos.nombreMes, valor: String(datos.radicadosEsteMes) + (deltaHtml ? ' ' + deltaHtml : ''), full: true }
    ]),
    datos.barrasRadicacion || '',
    datos.barrasCalidad || '',
    _bloque_estado_actual_cierreMes_(datos.resumen),
    _bloque_accion_requerida_cierreMes_(datos.pendientesPS, datos.erroresTerceros),
    comparacionTexto ? _bloque_nota_('<strong style="color:#253150;">Cómo vas frente a ' + datos.nombreMesAnterior + ':</strong> ' + comparacionTexto) : '',
    _bloque_pie_()
  ].join(''));

  return {
    asunto: '📊 ' + datos.nombre + ', tu cierre de ' + datos.nombreMes + ' ' + anioActual + ' · Inducciones',
    htmlBody: htmlBody
  };
}

/**
 * Envía el reporte de cierre de mes a cada comercial activo, con su propio
 * avance del mes. Dispara desde el botón manual en Reportes (api_enviarReportesCierreMes)
 * o desde el trigger mensual (configurarTriggerReporteCierreMes).
 */
function enviarReportesCierreMes() {
  var comerciales = UsuariosRepo_leerTodos().filter(function(u) {
    return (u.rol === 'CONSULTOR' || u.rol === 'COMERCIAL') && u.activo;
  });

  if (comerciales.length === 0) {
    Logger.log('No hay comerciales activos para el reporte de cierre de mes.');
    return;
  }

  // Estimar cuota necesaria: consultores + directores + gerentes (aprox)
  var todosUsuarios = UsuariosRepo_leerTodos();
  var numDirectores = todosUsuarios.filter(function(u) { return u.activo && u.rol === 'DIRECTOR'; }).length;
  var numGerentes = todosUsuarios.filter(function(u) { return u.activo && u.rol === 'GERENTE'; }).length;
  var cuotaRequerida = comerciales.length + numDirectores + numGerentes;

  if (!_verificarCuotaEmail_(cuotaRequerida)) {
    Logger.log('⚠️ Cuota de email insuficiente para reportes de cierre de mes.');
    _registrarEvento_('WARN', 'Reportes.js', 'Reportes de cierre de mes no enviados: cuota insuficiente', 'Requeridos: ' + cuotaRequerida);
    return;
  }

  var rangos = _rangosMesCierreYComparacion_();

  // Calcular rango del mes -2 (hace 2 meses) para las barras de 3 meses
  var ref = new Date();
  var inicioMesMenos2 = new Date(ref.getFullYear(), ref.getMonth() - 3, 1, 0, 0, 0, 0);
  var finMesMenos2    = new Date(ref.getFullYear(), ref.getMonth() - 2, 0, 23, 59, 59, 999);
  var nombreMesMenos2 = MESES_ES[inicioMesMenos2.getMonth()];

  // Pre-cargar Hoja_Control una sola vez para contarRadicacionesPorResultadoEnRango
  // (Req 4.5: evita N lecturas para N comerciales)
  var ssControl = SpreadsheetRegistry_get(ID_HOJA_CONTROL);
  var hojaHC = ssControl.getSheetByName("Hoja_Control");
  var datosHojaControl = hojaHC ? hojaHC.getDataRange().getValues() : [];

  var enviados = 0;
  var fallidos = 0;

  comerciales.forEach(function(u) {
    try {
      var nombreComercialMayus = emailANombre(u.email, 'MAYUSCULAS');
      var resumen           = obtenerResumenComercial(u.email);
      var radicadosEsteMes  = contarLotesRadicadosEnRango(u.email, rangos.mesReporte.inicio, rangos.mesReporte.fin);
      var radicadosMesAnt   = contarLotesRadicadosEnRango(u.email, rangos.mesComparacion.inicio, rangos.mesComparacion.fin);
      var radicadosMesMenos2 = contarLotesRadicadosEnRango(u.email, inicioMesMenos2, finMesMenos2);
      var pendientesPS      = obtenerLotesPendientesPazYSalvo(nombreComercialMayus);
      var erroresTerceros   = obtenerErroresPendientesComercial(u.email);

      // Datos de calidad por mes (exitosos vs fallidos) — usa datos pre-cargados
      var calidadMesMenos2 = contarRadicacionesPorResultadoEnRango(u.email, inicioMesMenos2, finMesMenos2, datosHojaControl);
      var calidadMesAnt    = contarRadicacionesPorResultadoEnRango(u.email, rangos.mesComparacion.inicio, rangos.mesComparacion.fin, datosHojaControl);
      var calidadEsteMes   = contarRadicacionesPorResultadoEnRango(u.email, rangos.mesReporte.inicio, rangos.mesReporte.fin, datosHojaControl);

      // Capitalizar nombres de meses para las barras
      var capMesMenos2 = nombreMesMenos2.charAt(0).toUpperCase() + nombreMesMenos2.slice(1);
      var capMesAnt    = rangos.mesComparacion.nombre.charAt(0).toUpperCase() + rangos.mesComparacion.nombre.slice(1);
      var capMesActual = rangos.mesReporte.nombre.charAt(0).toUpperCase() + rangos.mesReporte.nombre.slice(1);

      // Barras de lotes radicados (últimos 3 meses)
      var barrasRadicacion = _bloque_barras_radicacion_cierreMes_([
        { nombre: capMesMenos2, valor: radicadosMesMenos2 },
        { nombre: capMesAnt,    valor: radicadosMesAnt },
        { nombre: capMesActual, valor: radicadosEsteMes }
      ]);

      // Barras de calidad de radicación (exitosas vs fallidas, últimos 3 meses)
      var barrasCalidad = _bloque_barras_calidad_radicacion_([
        { nombre: capMesMenos2, exitosos: calidadMesMenos2.exitosos, fallidos: calidadMesMenos2.fallidos },
        { nombre: capMesAnt,    exitosos: calidadMesAnt.exitosos,    fallidos: calidadMesAnt.fallidos },
        { nombre: capMesActual, exitosos: calidadEsteMes.exitosos,   fallidos: calidadEsteMes.fallidos }
      ]);

      var correo = _construirCorreoCierreMes_({
        nombre: emailANombre(u.email, 'PRIMER_NOMBRE') || 'Ejecutivo Comercial',
        nombreMes: rangos.mesReporte.nombre,
        nombreMesAnterior: rangos.mesComparacion.nombre,
        radicadosEsteMes: radicadosEsteMes,
        radicadosMesAnterior: radicadosMesAnt,
        resumen: resumen,
        pendientesPS: pendientesPS,
        erroresTerceros: erroresTerceros,
        barrasRadicacion: barrasRadicacion,
        barrasCalidad: barrasCalidad
      });

      MailApp.sendEmail({
        to:       u.email,
        bcc:      BCC_AUDITORIA,
        subject:  correo.asunto,
        htmlBody: correo.htmlBody,
        replyTo:  "noreply@ellibertador.co",
        name:     "Inducciones · El Libertador"
      });

      enviados++;
    } catch (errUno) {
      fallidos++;
      console.error('Error en reporte de cierre de mes para ' + u.email + ': ' + errUno.message);
      _registrarEvento_('ERROR', 'Reportes.js', 'Error en reporte de cierre de mes', u.email + ' | ' + errUno.message);
    }
  });

  Logger.log('✅ Reportes de cierre de mes: ' + enviados + ' enviados, ' + fallidos + ' fallidos, de ' + comerciales.length + ' comerciales.');
  _registrarEvento_('INFO', 'Reportes.js', 'Reportes de cierre de mes enviados', enviados + '/' + comerciales.length + ' comerciales (' + fallidos + ' fallidos)');

  // ── Reportes consolidados por equipo (DIRECTOR y GERENTE) ──
  _enviarReportesCierreMesEquipo_(comerciales, rangos, inicioMesMenos2, finMesMenos2);
}


// ============================================================
//  REPORTE CIERRE DE MES — CONSOLIDADO POR EQUIPO
//  Envía a cada DIRECTOR un resumen de su equipo de consultores
//  y a cada GERENTE un resumen de los equipos de sus directores.
// ============================================================

/**
 * Agrupa métricas de los consultores por DIRECTOR y GERENTE, y envía
 * un correo consolidado a cada uno con el resumen de su equipo.
 *
 * @param {UsuarioRecord[]} comerciales - Lista de consultores activos ya procesados
 * @param {Object} rangos - Rangos de fecha del mes (mesReporte, mesComparacion)
 * @param {Date} inicioMesMenos2 - Inicio del mes -2
 * @param {Date} finMesMenos2 - Fin del mes -2
 */
function _enviarReportesCierreMesEquipo_(comerciales, rangos, inicioMesMenos2, finMesMenos2) {
  // 1. Agrupar consultores por DIRECTOR
  var equiposPorDirector = {};

  comerciales.forEach(function(u) {
    var emailDir = u.emailDirector;
    if (!emailDir || !emailDir.includes('@')) return;

    if (!equiposPorDirector[emailDir]) {
      equiposPorDirector[emailDir] = [];
    }

    try {
      var radicadosEsteMes = contarLotesRadicadosEnRango(u.email, rangos.mesReporte.inicio, rangos.mesReporte.fin);
      var radicadosMesAnt  = contarLotesRadicadosEnRango(u.email, rangos.mesComparacion.inicio, rangos.mesComparacion.fin);
      var resumen          = obtenerResumenComercial(u.email);

      equiposPorDirector[emailDir].push({
        email: u.email,
        nombre: emailANombre(u.email, 'COMPLETO'),
        radicadosEsteMes: radicadosEsteMes,
        radicadosMesAnt: radicadosMesAnt,
        terminados: resumen.terminados || 0,
        enAnalisis: resumen.enAnalisis || 0,
        pendientePS: resumen.pendientePS || 0,
        errorTerceros: resumen.errorTerceros || 0
      });
    } catch (e) {
      console.warn('Error recolectando métricas de ' + u.email + ' para equipo: ' + e.message);
    }
  });

  // 2. Enviar a cada DIRECTOR
  var nombreMesCap = rangos.mesReporte.nombre.charAt(0).toUpperCase() + rangos.mesReporte.nombre.slice(1);
  var anioActual = new Date().getFullYear();
  var enviadosEquipo = 0;

  Object.keys(equiposPorDirector).forEach(function(emailDirector) {
    var equipo = equiposPorDirector[emailDirector];
    if (equipo.length === 0) return;

    var director = UsuariosRepo_buscarPorEmail(emailDirector);
    if (!director || !director.activo) return;

    var correo = _construirCorreoCierreMesEquipo_({
      nombreDestinatario: emailANombre(emailDirector, 'PRIMER_NOMBRE') || 'Ejecutivo Comercial',
      rolDestinatario: 'Director',
      nombreMes: rangos.mesReporte.nombre,
      equipo: equipo
    });

    try {
      MailApp.sendEmail({
        to:       emailDirector,
        bcc:      BCC_AUDITORIA,
        subject:  correo.asunto,
        htmlBody: correo.htmlBody,
        replyTo:  "noreply@ellibertador.co",
        name:     "Inducciones · El Libertador"
      });
      enviadosEquipo++;
    } catch (e) {
      console.error('Error enviando reporte equipo a director ' + emailDirector + ': ' + e.message);
      _registrarEvento_('ERROR', 'Reportes.js', 'Error reporte equipo director', emailDirector + ' | ' + e.message);
    }
  });

  // 3. Agrupar por GERENTE (equipos de sus directores)
  var equiposPorGerente = {};

  Object.keys(equiposPorDirector).forEach(function(emailDirector) {
    var director = UsuariosRepo_buscarPorEmail(emailDirector);
    if (!director || !director.emailGerente || !director.emailGerente.includes('@')) return;

    var emailGerente = director.emailGerente;
    if (!equiposPorGerente[emailGerente]) {
      equiposPorGerente[emailGerente] = [];
    }
    // Agregar todos los consultores de este director al equipo del gerente
    equiposPorDirector[emailDirector].forEach(function(consultor) {
      equiposPorGerente[emailGerente].push(consultor);
    });
  });

  // 4. Enviar a cada GERENTE
  Object.keys(equiposPorGerente).forEach(function(emailGerente) {
    var equipo = equiposPorGerente[emailGerente];
    if (equipo.length === 0) return;

    var gerente = UsuariosRepo_buscarPorEmail(emailGerente);
    if (!gerente || !gerente.activo) return;

    var correo = _construirCorreoCierreMesEquipo_({
      nombreDestinatario: emailANombre(emailGerente, 'PRIMER_NOMBRE') || 'Ejecutivo Comercial',
      rolDestinatario: 'Gerente',
      nombreMes: rangos.mesReporte.nombre,
      equipo: equipo
    });

    try {
      MailApp.sendEmail({
        to:       emailGerente,
        bcc:      BCC_AUDITORIA,
        subject:  correo.asunto,
        htmlBody: correo.htmlBody,
        replyTo:  "noreply@ellibertador.co",
        name:     "Inducciones · El Libertador"
      });
      enviadosEquipo++;
    } catch (e) {
      console.error('Error enviando reporte equipo a gerente ' + emailGerente + ': ' + e.message);
      _registrarEvento_('ERROR', 'Reportes.js', 'Error reporte equipo gerente', emailGerente + ' | ' + e.message);
    }
  });

  if (enviadosEquipo > 0) {
    Logger.log('✅ Reportes de equipo: ' + enviadosEquipo + ' enviados (directores + gerentes).');
    _registrarEvento_('INFO', 'Reportes.js', 'Reportes cierre mes equipo enviados', 'Total: ' + enviadosEquipo);
  }
}

/**
 * Construye el HTML del correo consolidado de cierre de mes para un
 * DIRECTOR o GERENTE, con la tabla de rendimiento de su equipo.
 *
 * @param {Object} datos
 * @param {string} datos.nombreDestinatario - Nombre del director/gerente
 * @param {string} datos.rolDestinatario - "Director" o "Gerente"
 * @param {string} datos.nombreMes - Nombre del mes en español
 * @param {Array} datos.equipo - [{nombre, radicadosEsteMes, radicadosMesAnt, terminados, enAnalisis, pendientePS, errorTerceros}]
 * @returns {{asunto: string, htmlBody: string}}
 */
function _construirCorreoCierreMesEquipo_(datos) {
  var nombreMesCap = datos.nombreMes.charAt(0).toUpperCase() + datos.nombreMes.slice(1);
  var anioActual = new Date().getFullYear();

  // Totales del equipo
  var totalRadicados = 0;
  var totalMesAnt = 0;
  var totalTerminados = 0;
  var totalEnAnalisis = 0;
  var totalPendientePS = 0;
  var totalErrorTerceros = 0;

  datos.equipo.forEach(function(c) {
    totalRadicados += c.radicadosEsteMes;
    totalMesAnt += c.radicadosMesAnt;
    totalTerminados += c.terminados;
    totalEnAnalisis += c.enAnalisis;
    totalPendientePS += c.pendientePS;
    totalErrorTerceros += c.errorTerceros;
  });

  // Delta vs mes anterior
  var deltaHtml = '';
  if (totalMesAnt > 0) {
    var diff = totalRadicados - totalMesAnt;
    var pct = Math.round((Math.abs(diff) / totalMesAnt) * 100);
    if (diff > 0) {
      deltaHtml = ' <span style="font-size:11px;font-weight:700;color:#3B6D11;">&#9650; ' + pct + '%</span>';
    } else if (diff < 0) {
      deltaHtml = ' <span style="font-size:11px;font-weight:700;color:#BD0F14;">&#9660; ' + pct + '%</span>';
    }
  }

  // Tabla de consultores
  var filasTabla = datos.equipo
    .sort(function(a, b) { return b.radicadosEsteMes - a.radicadosEsteMes; })
    .map(function(c) {
      var pendientes = c.pendientePS + c.errorTerceros;
      var pendienteColor = pendientes > 0 ? '#BD0F14' : '#3B6D11';
      return '<tr>'
        + '<td style="padding:10px 8px;border-bottom:1px solid #f1f5f9;font-family:Arial,sans-serif;font-size:12px;color:#253150;">' + c.nombre + '</td>'
        + '<td align="center" style="padding:10px 8px;border-bottom:1px solid #f1f5f9;font-family:Arial,sans-serif;font-size:12px;font-weight:700;color:#253150;">' + c.radicadosEsteMes + '</td>'
        + '<td align="center" style="padding:10px 8px;border-bottom:1px solid #f1f5f9;font-family:Arial,sans-serif;font-size:12px;color:#64748b;">' + c.terminados + '</td>'
        + '<td align="center" style="padding:10px 8px;border-bottom:1px solid #f1f5f9;font-family:Arial,sans-serif;font-size:12px;color:#64748b;">' + c.enAnalisis + '</td>'
        + '<td align="center" style="padding:10px 8px;border-bottom:1px solid #f1f5f9;font-family:Arial,sans-serif;font-size:12px;font-weight:700;color:' + pendienteColor + ';">' + pendientes + '</td>'
        + '</tr>';
    }).join('');

  var tablaEquipo = '<tr><td style="padding:20px 28px 0;">'
    + '<div style="height:1px;background:#f1f5f9;margin-bottom:14px;"></div>'
    + '<div style="font-size:9px;font-weight:700;letter-spacing:1.2px;text-transform:uppercase;color:#94a3b8;margin-bottom:10px;font-family:Arial,sans-serif;">Detalle por consultor</div>'
    + '<table width="100%" cellpadding="0" cellspacing="0" border="0">'
    + '<tr>'
    + '<td style="padding:0 8px 8px;font-family:Arial,sans-serif;font-size:9px;font-weight:700;letter-spacing:0.8px;text-transform:uppercase;color:#94a3b8;">Consultor</td>'
    + '<td align="center" style="padding:0 8px 8px;font-family:Arial,sans-serif;font-size:9px;font-weight:700;letter-spacing:0.8px;text-transform:uppercase;color:#94a3b8;">Radicados</td>'
    + '<td align="center" style="padding:0 8px 8px;font-family:Arial,sans-serif;font-size:9px;font-weight:700;letter-spacing:0.8px;text-transform:uppercase;color:#94a3b8;">Terminados</td>'
    + '<td align="center" style="padding:0 8px 8px;font-family:Arial,sans-serif;font-size:9px;font-weight:700;letter-spacing:0.8px;text-transform:uppercase;color:#94a3b8;">En análisis</td>'
    + '<td align="center" style="padding:0 8px 8px;font-family:Arial,sans-serif;font-size:9px;font-weight:700;letter-spacing:0.8px;text-transform:uppercase;color:#94a3b8;">Pendientes</td>'
    + '</tr>'
    + filasTabla
    + '</table></td></tr>';

  var htmlBody = _envolver_([
    _bloque_cabecera_('Reporte de equipo'),
    _bloque_barra_estado_(_C_NAVY, '&#128202;', 'Cierre de ' + nombreMesCap + ' ' + anioActual),
    _bloque_cuerpo_inicio_(
      'Hola, ' + datos.nombreDestinatario,
      'Este es el resumen de cierre de <strong>' + datos.nombreMes + '</strong> de tu equipo (' + datos.equipo.length + ' consultor' + (datos.equipo.length !== 1 ? 'es' : '') + ').'
    ),
    _bloque_chips_([
      { label: 'Lotes radicados (equipo)', valor: String(totalRadicados) + deltaHtml, full: true },
      { label: 'Terminados', valor: String(totalTerminados), colorVal: '#3B6D11' },
      { label: 'En análisis', valor: String(totalEnAnalisis), colorVal: '#253150' },
      { label: 'Pendiente P&S', valor: String(totalPendientePS), colorVal: '#E65100' },
      { label: 'Error terceros', valor: String(totalErrorTerceros), colorVal: '#BD0F14' }
    ]),
    tablaEquipo,
    totalPendientePS + totalErrorTerceros > 0
      ? _bloque_nota_('<strong style="color:#BD0F14;">Atención:</strong> Tu equipo tiene ' + (totalPendientePS + totalErrorTerceros) + ' lote(s) que requieren acción (paz y salvo o corrección de terceros).')
      : _bloque_nota_('<strong style="color:#3B6D11;">&#10003; Tu equipo está al día. No hay pendientes que requieran acción.</strong>'),
    _bloque_pie_()
  ].join(''));

  return {
    asunto: '📊 Cierre de ' + datos.nombreMes + ' · Equipo ' + datos.rolDestinatario + ' · ' + anioActual,
    htmlBody: htmlBody
  };
}

/**
 * Ejecutar UNA VEZ, manualmente, desde el editor de Apps Script para crear
 * el trigger mensual de enviarReportesCierreMes (día 1 de cada mes, 7:00am).
 * Idempotente por reemplazo: borra cualquier trigger previo de esta función
 * antes de crear el nuevo.
 */
function configurarTriggerReporteCierreMes() {
  ScriptApp.getProjectTriggers()
    .filter(function(t) { return t.getHandlerFunction() === 'enviarReportesCierreMes'; })
    .forEach(function(t) { ScriptApp.deleteTrigger(t); });

  ScriptApp.newTrigger('enviarReportesCierreMes')
    .timeBased()
    .onMonthDay(1)
    .atHour(7)
    .nearMinute(0)
    .create();

  Logger.log('Trigger creado: enviarReportesCierreMes — día 1 de cada mes, 7:00am (America/Bogota).');
}


