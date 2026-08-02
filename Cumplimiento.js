/**
 * @OnlyCurrentDoc
 *
 * Cumplimiento Ley 2300: procesa solicitudes aprobadas en "registro analisis".
 * - Contactos con celular → SMS enviados automáticamente vía Infobip (API).
 * - Contactos con correo  → genera CORREOS.csv adjunto para envío manual.
 * Notifica a líderes con resumen del corte. Corre cada 15 días.
 */
function procesarDatosMejorado() {
  // ── 0. LOCK — evita chocar con Sincronizacion.js mientras toca 'registro analisis' ──
  const lock = LockService.getScriptLock();
  if (!lock.tryLock(30000)) {
    Logger.log("No se pudo obtener el lock (otro proceso está usando 'registro analisis'). Se reintentará en el próximo trigger.");
    return;
  }

  try {
    const hojaNombre = "registro analisis";
    const hoja = retry(() => SpreadsheetApp.openById(ID_ARCHIVO_ANALISIS).getSheetByName(hojaNombre));

    if (!hoja) {
      Logger.log(`Error: No se pudo encontrar la hoja "${hojaNombre}".`);
      return;
    }

    // Verificación de periodicidad (cada 15 días)
    const propiedades = PropertiesService.getScriptProperties();
    const ultimaEjecucion = propiedades.getProperty('ultimaEjecucion');
    const hoy = new Date();

    if (ultimaEjecucion) {
      const fechaUltima = new Date(ultimaEjecucion);
      const diasDiferencia = (hoy.getTime() - fechaUltima.getTime()) / (1000 * 3600 * 24);
      if (diasDiferencia < 15) {
        Logger.log(`Aún no han pasado 15 días. Faltan ${15 - Math.floor(diasDiferencia)} días.`);
        return;
      }
    }

    const datos = retry(() => hoja.getDataRange().getValues());
    const encabezados = datos[0];

    const colIndex = {
      registroAnalista: encabezados.indexOf("REGISTRO ANALISTA SAI"),
      inmobiliaria: encabezados.indexOf("inmobiliaria"),
      arrendatario: encabezados.indexOf("Arrendatario"),
      telInq: encabezados.indexOf("TEL_INQ"),
      correoInq: encabezados.indexOf("CORREO_INQ"),
      coa1: encabezados.indexOf("COA1"),
      telCoa1: encabezados.indexOf("TEL_COA1"),
      correoCoa1: encabezados.indexOf("CORREO_COA1"),
      coa2: encabezados.indexOf("COA2"),
      telCoa2: encabezados.indexOf("TEL_COA2"),
      correoCoa2: encabezados.indexOf("CORREO_COA2"),
      coa3: encabezados.indexOf("COA3"),
      telCoa3: encabezados.indexOf("TEL_COA3"),
      correoCoa3: encabezados.indexOf("CORREO_COA3"),
      coa4: encabezados.indexOf("COA4"),
      telCoa4: encabezados.indexOf("TEL_COA4"),
      correoCoa4: encabezados.indexOf("CORREO_COA4"),
      coa5: encabezados.indexOf("COA5"),
      telCoa5: encabezados.indexOf("TEL_COA5"),
      correoCoa5: encabezados.indexOf("CORREO_COA5"),
      estadoAutomatizacion: encabezados.indexOf("Estado Automatización"),
      fechaEvaluacion: encabezados.indexOf("Fecha Evaluacion")
    };

    // Validar que TODAS las columnas usadas existan (antes solo se validaban 2 de 21)
    const columnasFaltantes = Object.keys(colIndex).filter(clave => colIndex[clave] === -1);
    if (columnasFaltantes.length > 0) {
      Logger.log(`Error: Faltan columnas en "registro analisis": ${columnasFaltantes.join(", ")}. Verifica que los encabezados existan exactamente con esos nombres.`);
      return;
    }

    const datosCorreos = [['NOMBRE', 'CORREO', 'INMOBILIARIA']];
    const datosCelulares = [['NOMBRE', 'CELULAR', 'INMOBILIARIA']];
    const filasParaMarcar = [];
    const fechasProcesadas = []; // Array para guardar las fechas del periodo

    // Iterar sobre cada fila de datos
    for (let i = 1; i < datos.length; i++) {
      const fila = datos[i];
      const estadoAnalista = String(fila[colIndex.registroAnalista] || "").trim().toUpperCase();
      const estadoAutomatizacion = String(fila[colIndex.estadoAutomatizacion] || "").trim();

      // Coincidencia EXACTA (no substring): evita falsos positivos como "NO APROBADO"
      if (estadoAnalista === 'APROBADO' && estadoAutomatizacion === '') {
        const inmobiliaria = fila[colIndex.inmobiliaria];

        // Capturar la fecha de la evaluación
        const valorFecha = fila[colIndex.fechaEvaluacion];
        if (valorFecha instanceof Date) {
          fechasProcesadas.push(valorFecha);
        } else if (valorFecha) {
          // Si por alguna razón es texto, intenta convertirlo a fecha
          const fechaParseada = new Date(valorFecha);
          if (!isNaN(fechaParseada.getTime())) fechasProcesadas.push(fechaParseada);
        }

        const personas = [
          { nombre: fila[colIndex.arrendatario], correo: fila[colIndex.correoInq], tel: fila[colIndex.telInq] },
          { nombre: fila[colIndex.coa1], correo: fila[colIndex.correoCoa1], tel: fila[colIndex.telCoa1] },
          { nombre: fila[colIndex.coa2], correo: fila[colIndex.correoCoa2], tel: fila[colIndex.telCoa2] },
          { nombre: fila[colIndex.coa3], correo: fila[colIndex.correoCoa3], tel: fila[colIndex.telCoa3] },
          { nombre: fila[colIndex.coa4], correo: fila[colIndex.correoCoa4], tel: fila[colIndex.telCoa4] },
          { nombre: fila[colIndex.coa5], correo: fila[colIndex.correoCoa5], tel: fila[colIndex.telCoa5] },
        ];

        personas.forEach(persona => {
          if (persona.nombre) {
            if (persona.correo && persona.correo.toString().includes('@')) {
              datosCorreos.push([persona.nombre, persona.correo, inmobiliaria]);
            } else if (persona.tel) {
              datosCelulares.push([persona.nombre, persona.tel.toString(), inmobiliaria]);
            }
          }
        });

        filasParaMarcar.push(i + 1);
      }
    }

    // ── Envío automático de SMS (reemplaza la carga manual de CSV en Infobip) ──
    var resultadoSms = { enviados: 0, fallidos: 0 };
    if (datosCelulares.length > 1) {
      resultadoSms = procesarEnvioSmsLey2300(datosCelulares);
    }

    // Adjuntar solo CORREOS.csv (los SMS ya se enviaron automáticamente)
    const adjuntos = [];
    if (datosCorreos.length > 1) {
      adjuntos.push(_csvBlob_(datosCorreos, 'CORREOS.csv'));
    }

    // Si no hay correos para enviar manualmente NI SMS enviados, no hay nada que reportar
    if (adjuntos.length === 0 && resultadoSms.enviados === 0 && resultadoSms.fallidos === 0) {
      Logger.log("No se encontraron datos nuevos para procesar.");
      return;
    }

    // Destinatarios derivados de CORREOS_LIDERES (Codigo.js) para no perder sincronía
    // con la lista maestra si alguno de los dos deja de ser líder.
    const destinatarios = CORREOS_LIDERES.filter(correo =>
      correo === "jenny.ascanio@segurosbolivar.com" || correo === "kharen.garcia@segurosbolivar.com"
    ).join(",");

    // Verificar cuota antes de enviar (Fase 2.2)
    if (!_verificarCuotaEmail_(1)) {
      Logger.log("⚠️ Cuota de email insuficiente. Reporte Ley 2300 no enviado.");
      return;
    }

    // Lógica para armar el rango de fechas del corte
    let rangoFechas = "";
    if (fechasProcesadas.length > 0) {
      fechasProcesadas.sort((a, b) => a.getTime() - b.getTime());
      const fechaInicio = Utilities.formatDate(fechasProcesadas[0], "GMT-5", "dd/MM/yyyy");
      const fechaFin = Utilities.formatDate(fechasProcesadas[fechasProcesadas.length - 1], "GMT-5", "dd/MM/yyyy");
      rangoFechas = fechaInicio === fechaFin ? fechaInicio : `${fechaInicio} - ${fechaFin}`;
    }

    // Asunto dinámico, con el mismo estilo (emoji + separador) del resto de correos del sistema
    const asunto = rangoFechas
      ? `📄 Cumplimiento Ley 2300 · Corte ${rangoFechas}`
      : '📄 Cumplimiento Ley 2300';

    const cuerpoHtml = _construirCuerpoLey2300_({
      rangoFechas: rangoFechas || "Sin fecha de evaluación",
      contratos: filasParaMarcar.length,
      contactosCorreo: datosCorreos.length - 1,
      contactosCelular: datosCelulares.length - 1,
      smsEnviados: resultadoSms.enviados,
      smsFallidos: resultadoSms.fallidos
    });

    // No se envuelve en retry(): un reintento tras un fallo ambiguo podría duplicar
    // el envío del correo con los adjuntos ya entregados.
    MailApp.sendEmail({
      to: destinatarios,
      bcc: BCC_AUDITORIA,
      subject: asunto,
      htmlBody: cuerpoHtml,
      attachments: adjuntos.length > 0 ? adjuntos : undefined,
      replyTo: "noreply@ellibertador.co",
      name: "Inducciones · El Libertador"
    });

    // Marcar las filas procesadas en UNA sola escritura por lote (no una por fila)
    const fechaMarca = Utilities.formatDate(new Date(), "GMT-5", "yyyy-MM-dd HH:mm:ss");
    const primeraFila = filasParaMarcar[0];
    const ultimaFila = filasParaMarcar[filasParaMarcar.length - 1];
    const rangoMarca = hoja.getRange(primeraFila, colIndex.estadoAutomatizacion + 1, ultimaFila - primeraFila + 1, 1);
    const valoresMarca = retry(() => rangoMarca.getValues());
    const filasSet = new Set(filasParaMarcar);
    for (let f = primeraFila; f <= ultimaFila; f++) {
      if (filasSet.has(f)) {
        valoresMarca[f - primeraFila][0] = `Procesado ${fechaMarca}`;
      }
    }
    retry(() => rangoMarca.setValues(valoresMarca));

    propiedades.setProperty('ultimaEjecucion', hoy.toUTCString());
    Logger.log(`Proceso completado. Filas: ${filasParaMarcar.length} | SMS enviados: ${resultadoSms.enviados} | SMS fallidos: ${resultadoSms.fallidos} | Asunto: ${asunto}`);
    _registrarEvento_("INFO", "Cumplimiento.js", "Ley 2300 procesada exitosamente",
      "Filas: " + filasParaMarcar.length + " | SMS: " + resultadoSms.enviados + "/" + (resultadoSms.enviados + resultadoSms.fallidos) + " | Asunto: " + asunto);

  } catch (err) {
    Logger.log(`Error en procesarDatosMejorado: ${err.message}`);
    _registrarEvento_("ERROR", "Cumplimiento.js", "Error en procesarDatosMejorado", err.message);
  } finally {
    lock.releaseLock();
  }
}

/**
 * Ejecutar UNA VEZ, manualmente, desde el editor de Apps Script
 * (seleccionar esta función en el desplegable > Ejecutar) para crear
 * el trigger de tiempo de procesarDatosMejorado. Es idempotente: si el
 * trigger ya existe, no crea uno duplicado.
 */
function configurarTriggerCumplimiento() {
  const yaExiste = ScriptApp.getProjectTriggers()
    .some(t => t.getHandlerFunction() === 'procesarDatosMejorado');

  if (yaExiste) {
    Logger.log('El trigger de procesarDatosMejorado ya existe. No se creó uno nuevo.');
    return;
  }

  ScriptApp.newTrigger('procesarDatosMejorado')
    .timeBased()
    .everyDays(15)
    .atHour(6)
    .create();

  Logger.log('Trigger creado: procesarDatosMejorado cada 15 días, alrededor de las 6am (America/Bogota).');
}

/**
 * Escapa un valor para CSV: si contiene coma, comilla o salto de línea,
 * lo envuelve en comillas dobles y duplica las comillas internas.
 */
function _csvEscape_(valor) {
  const texto = valor === null || valor === undefined ? "" : String(valor);
  if (/[",\n\r]/.test(texto)) {
    return `"${texto.replace(/"/g, '""')}"`;
  }
  return texto;
}

/**
 * Construye un Blob CSV a partir de un array de filas, escapando cada celda
 * y anteponiendo BOM UTF-8 para que Excel muestre bien tildes/ñ.
 */
function _csvBlob_(filas, nombreArchivo) {
  const BOM_UTF8 = String.fromCharCode(0xFEFF);
  const contenido = filas.map(fila => fila.map(_csvEscape_).join(",")).join("\r\n");
  return Utilities.newBlob(BOM_UTF8 + contenido, 'text/csv', nombreArchivo);
}

/**
 * Arma el cuerpo del correo de cumplimiento Ley 2300 usando los mismos
 * bloques modulares (cabecera, barra de estado, chips, nota, pie) que el
 * resto de notificaciones del sistema, definidos en Notificaciones.js.
 * @param {{rangoFechas:string, contratos:number, contactosCorreo:number, contactosCelular:number, smsEnviados:number, smsFallidos:number}} datos
 * @returns {string} HTML completo listo para MailApp.
 */
function _construirCuerpoLey2300_(datos) {
  var smsEnviados = datos.smsEnviados || 0;
  var smsFallidos = datos.smsFallidos || 0;
  var totalSms = smsEnviados + smsFallidos;

  var mensajeInicio = totalSms > 0
    ? `Se proces&oacute; el cumplimiento de la <strong>Ley 2300</strong> para las
       solicitudes <strong>aprobadas</strong> desde el &uacute;ltimo corte.
       Los SMS fueron enviados autom&aacute;ticamente v&iacute;a Infobip.`
    : `Se gener&oacute; el archivo adjunto con los datos de contacto por correo para dar
       cumplimiento a la <strong>Ley 2300</strong>. No se encontraron contactos con celular
       en este corte.`;

  var chips = [
    { label: "Corte / Periodo",         valor: datos.rangoFechas,               colorVal: _C_ROJO },
    { label: "Contratos incluidos",     valor: String(datos.contratos)                             },
    { label: "Contactos con correo",    valor: String(datos.contactosCorreo)                       }
  ];

  if (totalSms > 0) {
    chips.push({ label: "SMS enviados", valor: String(smsEnviados), colorVal: '#16a34a' });
    if (smsFallidos > 0) {
      chips.push({ label: "SMS fallidos", valor: String(smsFallidos), colorVal: _C_ROJO });
    }
  }

  var notaHtml = datos.contactosCorreo > 0
    ? `<strong style="color:#253150;">Pr&oacute;ximos pasos:</strong>
       1) Descargar <strong>CORREOS.csv</strong> adjunto &middot;
       2) Revisar la informaci&oacute;n &middot;
       3) Realizar env&iacute;o de correos masivos.<br><br>
       <strong>SMS:</strong> ya fueron enviados autom&aacute;ticamente &mdash; no se requiere acci&oacute;n manual.`
    : `<strong style="color:#253150;">Resumen:</strong>
       Todos los contactos fueron notificados autom&aacute;ticamente v&iacute;a SMS.
       No se requiere acci&oacute;n adicional para este corte.`;

  return _envolver_([

    _bloque_cabecera_("Cumplimiento Ley 2300"),

    _bloque_barra_estado_(_C_NAVY, "&#10003;", totalSms > 0 ? "SMS enviados automáticamente" : "Archivo generado"),

    _bloque_cuerpo_inicio_(
      "Hola equipo de inducciones",
      mensajeInicio
    ),

    _bloque_chips_(chips),

    _bloque_nota_(notaHtml),

    _bloque_pie_()

  ].join(""));
}
