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
 * Lee Control_General y registro analisis una sola vez cada una y agrega las
 * métricas del reporte de gestión.
 * @param {Date} [fechaRef]  Fecha a usar como "hoy" para las métricas del día
 *   (analizadasHoy, resultadosEnviadosHoy). Por defecto la fecha actual — el
 *   envío real (enviarReporteGestionInducciones) siempre usa el valor por
 *   defecto; el parámetro solo existe para pruebas manuales con otra fecha.
 */
function _recolectarMetricasGestion_(fechaRef) {
  const fecha = fechaRef || new Date();
  const IDX = { idLote: 0, fechaIngreso: 2, estado: 9, comercial: 10 };

  const ssControl    = retry(() => SpreadsheetApp.openById(ID_HOJA_CONTROL));
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
  // Cruzamos con Hoja_Control para obtener el email real del comercial (col B por ID Lote en col F)
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
      comercial:      _correoANombreCompleto(mapaLoteEmail[l.idLote] || l.comercial),
      fechaIngresoStr: l.fechaIngreso instanceof Date
        ? Utilities.formatDate(l.fechaIngreso, "GMT-5", "d/MM/yyyy")
        : String(l.fechaIngreso || ""),
      contratos:      l.contratos,
      estados:        l.estados
    }))
    .sort((a, b) => (a.fechaIngresoStr < b.fechaIngresoStr ? 1 : -1));

  // "Resultados de lotes enviados": viene de la hoja "Historico_Envios" (mismo
  // libro que registro analisis), donde cada fila es el resultado final que
  // la aseguradora emitió para un lote completo (aprobadas/negadas/resultado).
  const resultadosEnviadosHoy = _recolectarResultadosEnviadosHoy_(fecha);

  // "Analizadas hoy": registro analisis, REGISTRO ANALISTA SAI diligenciado con
  // Fecha Evaluacion = hoy.
  const ssAnalisis   = retry(() => SpreadsheetApp.openById(ID_ARCHIVO_ANALISIS));
  const hojaAnalisis = ssAnalisis.getSheetByName("registro analisis");
  const dataAnalisis = retry(() => hojaAnalisis.getDataRange().getValues());
  const encabezados  = dataAnalisis[0];

  const colRegistroSAI = encabezados.indexOf("REGISTRO ANALISTA SAI");
  const colFechaEval   = encabezados.indexOf("Fecha Evaluacion");

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
 * Lee "Historico_Envios" (misma hoja de cálculo que registro analisis) y
 * agrega los resultados cuya "Fecha de Emisión" coincide con fechaRef: lotes
 * con resultado, total de solicitudes aprobadas/negadas, y desglose por
 * "Resultado Final Lote".
 * @param {Date} [fechaRef]  Fecha a comparar contra "Fecha de Emisión". Por defecto hoy.
 */
function _recolectarResultadosEnviadosHoy_(fechaRef) {
  const resultado = { lotes: 0, solicitudesAprobadas: 0, solicitudesNegadas: 0, porResultado: {} };

  const ssAnalisis    = retry(() => SpreadsheetApp.openById(ID_ARCHIVO_ANALISIS));
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

  Logger.log("[DIAG] Encabezados reales de Historico_Envios: " + JSON.stringify(encabezados));
  Logger.log("[DIAG] colFecha=" + colFecha + " colAprobadas=" + colAprobadas + " colNegadas=" + colNegadas + " colResultado=" + colResultado);
  Logger.log("[DIAG] Filas de datos (sin encabezado): " + (datos.length - 1));

  if (colFecha === -1) {
    Logger.log("Aviso: no se encontró 'Fecha de Emisión' en 'Historico_Envios'. 'Resultados enviados hoy' quedará en 0.");
    return resultado;
  }

  const hoy = new Date(fechaRef || new Date());
  hoy.setHours(0, 0, 0, 0);
  Logger.log("[DIAG] Fecha de referencia normalizada (hoy/prueba): " + hoy);

  for (let i = 1; i < datos.length; i++) {
    const fila       = datos[i];
    const valorCrudo = fila[colFecha];
    const f          = _normalizarFecha_(valorCrudo);

    if (i <= 4) { // solo las primeras filas, para no inundar el log
      Logger.log("[DIAG] Fila " + (i + 1) + " — valor crudo: " + JSON.stringify(valorCrudo) +
                 " (tipo: " + typeof valorCrudo + ", ¿es Date?: " + (valorCrudo instanceof Date) + ")" +
                 " → normalizado: " + (f ? f.toString() : "null"));
    }

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

    MailApp.sendEmail({
      to:       CORREOS_LIDERES.join(","),
      bcc:      BCC_AUDITORIA,
      subject:  correo.asunto,
      htmlBody: correo.htmlBody,
      replyTo:  "noreply@ellibertador.co",
      name:     "Inducciones · El Libertador"
    });

    Logger.log("✅ Reporte de gestión enviado a líderes.");
    _registrarEvento_("INFO", "Reportes.js", "Reporte de gestión enviado", "Destinatarios: " + CORREOS_LIDERES.length);
  } catch (err) {
    console.error("Error en enviarReporteGestionInducciones: " + err.message);
    _registrarEvento_("ERROR", "Reportes.js", "Error al enviar reporte de gestión", err.message);
  }
}

/**
 * Vista previa: arma el mismo correo y lo manda SOLO a quien ejecuta la
 * función (nunca a CORREOS_LIDERES), con [PRUEBA] en el asunto para que no
 * se confunda con un envío real. Selecciónala en el desplegable "Ejecutar"
 * para revisar cómo queda antes de activar el trigger diario.
 */
function probarReporteGestion() {
  const m = _recolectarMetricasGestion_();
  const correo = _construirCorreoReporteGestion_(m);
  const destinatario = Session.getActiveUser().getEmail();

  MailApp.sendEmail({
    to:       destinatario,
    subject:  `[PRUEBA] ${correo.asunto}`,
    htmlBody: correo.htmlBody,
    replyTo:  "noreply@ellibertador.co",
    name:     "Inducciones · El Libertador (prueba)"
  });

  Logger.log("Vista previa enviada solo a: " + destinatario);
}

/**
 * Vista previa con una fecha distinta a hoy — útil para cotejar días donde
 * SÍ hubo gestión (ej. ayer) mientras hoy está vacío. Cambia FECHA_PRUEBA
 * abajo cada vez que quieras revisar otro día y vuelve a ejecutar.
 * Igual que probarReporteGestion: solo se manda a quien la ejecuta, nunca a
 * CORREOS_LIDERES. No la usa ningún flujo de negocio real.
 */
function probarReporteGestionConFecha() {
  // ── Cambia esta fecha para cotejar otro día (año, mes 0-indexado, día) ──
  const FECHA_PRUEBA = new Date(2026, 6, 24); // 24 de julio de 2026

  const m = _recolectarMetricasGestion_(FECHA_PRUEBA);
  const correo = _construirCorreoReporteGestion_(m, FECHA_PRUEBA);
  const destinatario = Session.getActiveUser().getEmail();

  MailApp.sendEmail({
    to:       destinatario,
    subject:  `[PRUEBA · fecha simulada] ${correo.asunto}`,
    htmlBody: correo.htmlBody,
    replyTo:  "noreply@ellibertador.co",
    name:     "Inducciones · El Libertador (prueba)"
  });

  Logger.log("Vista previa con fecha simulada (" + FECHA_PRUEBA + ") enviada solo a: " + destinatario);
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
