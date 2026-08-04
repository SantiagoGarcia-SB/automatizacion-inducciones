/**
 * @OnlyCurrentDoc
 *
 * Cumplimiento Ley 2300: procesa solicitudes aprobadas en "registro analisis".
 * - PRIORIDAD: Contactos con celular → SMS enviados automáticamente vía Infobip (API).
 * - FALLBACK:  Si el SMS falla y el contacto tiene correo → se reintenta por Email vía Infobip.
 * - DIRECTO:   Contactos sin celular pero con correo → Email enviado directamente.
 * Notifica a líderes con resumen del corte. Corre cada sábado.
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

    // Verificación de periodicidad removida — ahora se ejecuta cada sábado vía trigger semanal.
    // La propiedad 'ultimaEjecucion' se mantiene como registro histórico.
    const propiedades = PropertiesService.getScriptProperties();
    const hoy = new Date();

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

    // Mapa de fallback: celular normalizado → {nombre, correo, inmobiliaria}
    // Permite reenviar por email si el SMS falla y la persona tiene correo
    const fallbackEmailPorCelular = {};

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
            const tieneCorreo = persona.correo && persona.correo.toString().includes('@');
            const tieneTel = persona.tel && String(persona.tel).trim() !== '';

            if (tieneTel) {
              // PRIORIDAD: SMS si hay celular
              datosCelulares.push([persona.nombre, persona.tel.toString(), inmobiliaria]);

              // Guardar correo como fallback en caso de que SMS falle
              if (tieneCorreo) {
                var telNorm = String(persona.tel).replace(/[\s\-\(\)]/g, '');
                if (telNorm.startsWith('3') && telNorm.length === 10) telNorm = '57' + telNorm;
                if (!telNorm.startsWith('57')) telNorm = '57' + telNorm;
                fallbackEmailPorCelular[telNorm] = {
                  nombre: persona.nombre,
                  correo: persona.correo.toString().trim(),
                  inmobiliaria: inmobiliaria
                };
              }
            } else if (tieneCorreo) {
              // FALLBACK DIRECTO: solo email si no hay celular
              datosCorreos.push([persona.nombre, persona.correo, inmobiliaria]);
            }
          }
        });

        filasParaMarcar.push(i + 1);
      }
    }

    // ── Envío automático de SMS (PRIORIDAD — reemplaza la carga manual de CSV en Infobip) ──
    var resultadoSms = { enviados: 0, fallidos: 0, errores: [] };
    if (datosCelulares.length > 1) {
      resultadoSms = procesarEnvioSmsLey2300(datosCelulares);
    }

    // ── Fallback: SMS fallidos con correo disponible → se reenvían por email ──
    var fallbacksAgregados = 0;
    if (resultadoSms.errores && resultadoSms.errores.length > 0) {
      resultadoSms.errores.forEach(function(e) {
        var celNorm = String(e.celular || '').trim();
        var fb = fallbackEmailPorCelular[celNorm];
        if (fb) {
          datosCorreos.push([fb.nombre, fb.correo, fb.inmobiliaria]);
          fallbacksAgregados++;
        }
      });
      if (fallbacksAgregados > 0) {
        _registrarEvento_("INFO", "Cumplimiento.js", "Fallback SMS→Email activado",
          fallbacksAgregados + " contacto(s) con SMS fallido serán reintentados por email.");
      }
    }

    // ── Envío automático de Email (fallback de SMS fallidos + contactos sin celular) ──
    var resultadoEmail = { enviados: 0, fallidos: 0, invalidosFormato: 0, duplicadosEliminados: 0, errores: [], abortado: false };
    if (datosCorreos.length > 1) {
      try {
        resultadoEmail = procesarEnvioEmailLey2300(datosCorreos);
      } catch (err) {
        _registrarEvento_("ERROR", "Cumplimiento.js", "Error crítico en envío email Ley 2300", err.message);
        // El flujo continúa — SMS ya enviados, marcado de filas procede
      }
    }

    // Adjuntar CSV solo de los fallidos (ambos canales fallaron) para gestión manual
    const adjuntos = [];
    // Contactos donde falló todo: SMS falló y no tenían correo, o email directo falló
    var contactosFallidosTotales = [];
    if (resultadoEmail.errores && resultadoEmail.errores.length > 0) {
      resultadoEmail.errores.forEach(function(e) {
        for (var idx = 1; idx < datosCorreos.length; idx++) {
          if (String(datosCorreos[idx][1] || '').trim().toLowerCase() === e.email.toLowerCase()) {
            contactosFallidosTotales.push([e.nombre, e.email, String(datosCorreos[idx][2] || '').trim()]);
            break;
          }
        }
      });
    }
    // SMS fallidos sin correo de fallback → requieren gestión manual
    if (resultadoSms.errores) {
      resultadoSms.errores.forEach(function(e) {
        var celNorm = String(e.celular || '').trim();
        if (!fallbackEmailPorCelular[celNorm]) {
          // No tenía correo para fallback
          contactosFallidosTotales.push([e.nombre, e.celular, 'SMS sin email de respaldo']);
        }
      });
    }
    if (contactosFallidosTotales.length > 0) {
      var csvFallidos = [['NOMBRE', 'CONTACTO', 'DETALLE']];
      csvFallidos = csvFallidos.concat(contactosFallidosTotales);
      adjuntos.push(_csvBlob_(csvFallidos, 'CONTACTOS_FALLIDOS.csv'));
    }

    // Si no hay nada que reportar (ni SMS ni Email procesados)
    if (adjuntos.length === 0 && resultadoSms.enviados === 0 && resultadoSms.fallidos === 0 && resultadoEmail.enviados === 0 && resultadoEmail.fallidos === 0) {
      Logger.log("No se encontraron datos nuevos para procesar.");
      return;
    }

    // Destinatarios del reporte Ley 2300 (configurable via Script Properties)
    // Si no está configurado, se envía a todos los líderes activos.
    var propDestinatarios = PropertiesService.getScriptProperties().getProperty('CORREOS_LEY2300');
    var destinatarios;
    if (propDestinatarios && propDestinatarios.trim()) {
      destinatarios = propDestinatarios.trim();
    } else {
      destinatarios = obtenerCorreosLideres().join(",");
    }

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
      smsFallidos: resultadoSms.fallidos,
      emailEnviados: resultadoEmail.enviados,
      emailFallidos: resultadoEmail.fallidos,
      emailInvalidos: resultadoEmail.invalidosFormato,
      emailDuplicados: resultadoEmail.duplicadosEliminados,
      emailAbortado: resultadoEmail.abortado,
      fallbacksActivados: fallbacksAgregados
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

    // Construir conjuntos de contactos fallidos para determinar marca por fila
    var smsFallidos = new Set();
    if (resultadoSms.errores) {
      resultadoSms.errores.forEach(function(e) { smsFallidos.add(String(e.celular || '').trim()); });
    }
    var emailFallidos = new Set();
    if (resultadoEmail.errores) {
      resultadoEmail.errores.forEach(function(e) { emailFallidos.add(e.email.toLowerCase().trim()); });
    }

    // Set de SMS fallidos que fueron exitosamente enviados por email (fallback exitoso)
    var fallbackExitoso = new Set();
    if (resultadoSms.errores) {
      resultadoSms.errores.forEach(function(e) {
        var celNorm = String(e.celular || '').trim();
        var fb = fallbackEmailPorCelular[celNorm];
        if (fb && !emailFallidos.has(fb.correo.toLowerCase().trim())) {
          // El SMS falló pero el email de fallback fue exitoso
          fallbackExitoso.add(celNorm);
        }
      });
    }

    // Marcar filas con resultado combinado
    const fechaMarca = Utilities.formatDate(new Date(), "GMT-5", "yyyy-MM-dd HH:mm:ss");
    const primeraFila = filasParaMarcar[0];
    const ultimaFila = filasParaMarcar[filasParaMarcar.length - 1];
    const rangoMarca = hoja.getRange(primeraFila, colIndex.estadoAutomatizacion + 1, ultimaFila - primeraFila + 1, 1);
    const valoresMarca = retry(() => rangoMarca.getValues());
    const filasSet = new Set(filasParaMarcar);

    // Para cada fila, evaluar si las personas fueron notificadas exitosamente
    for (let f = primeraFila; f <= ultimaFila; f++) {
      if (!filasSet.has(f)) continue;

      var filaData = datos[f - 1];
      var personasFila = [
        { tel: String(filaData[colIndex.telInq] || '').trim(), correo: String(filaData[colIndex.correoInq] || '').trim() },
        { tel: String(filaData[colIndex.telCoa1] || '').trim(), correo: String(filaData[colIndex.correoCoa1] || '').trim() },
        { tel: String(filaData[colIndex.telCoa2] || '').trim(), correo: String(filaData[colIndex.correoCoa2] || '').trim() },
        { tel: String(filaData[colIndex.telCoa3] || '').trim(), correo: String(filaData[colIndex.correoCoa3] || '').trim() },
        { tel: String(filaData[colIndex.telCoa4] || '').trim(), correo: String(filaData[colIndex.correoCoa4] || '').trim() },
        { tel: String(filaData[colIndex.telCoa5] || '').trim(), correo: String(filaData[colIndex.correoCoa5] || '').trim() },
      ];

      // Nueva lógica: SMS es prioritario. Si falla, email es fallback.
      // Una persona se considera "notificada" si:
      //   - SMS exitoso, O
      //   - SMS falló pero email fallback fue exitoso, O
      //   - No tenía celular pero email directo fue exitoso
      var filaNotificada = true; // optimista — se vuelve false si alguna persona falla completamente
      var filaTeníaContacto = false;
      var filaUsóSms = false;
      var filaUsóEmail = false;
      var filaFalloTotal = false;

      personasFila.forEach(function(p) {
        var tieneTel = p.tel && p.tel !== '';
        var tieneCorreo = p.correo && p.correo.includes('@');

        if (!tieneTel && !tieneCorreo) return; // persona sin datos de contacto, ignorar

        filaTeníaContacto = true;

        if (tieneTel) {
          filaUsóSms = true;
          var telNorm = p.tel.replace(/[\s\-\(\)]/g, '');
          if (telNorm.startsWith('3') && telNorm.length === 10) telNorm = '57' + telNorm;
          if (!telNorm.startsWith('57')) telNorm = '57' + telNorm;

          if (smsFallidos.has(telNorm)) {
            // SMS falló — verificar fallback por email
            if (tieneCorreo && fallbackExitoso.has(telNorm)) {
              filaUsóEmail = true; // se notificó por email (fallback exitoso)
            } else {
              filaFalloTotal = true; // ni SMS ni email funcionaron
            }
          }
          // Si no está en smsFallidos → SMS exitoso, persona notificada
        } else if (tieneCorreo) {
          filaUsóEmail = true;
          if (emailFallidos.has(p.correo.toLowerCase().trim())) {
            filaFalloTotal = true;
          }
        }
      });

      // Generar marca basada en resultado
      var marca;
      if (!filaTeníaContacto) {
        marca = 'Procesado ' + fechaMarca; // sin datos de contacto, nada que hacer
      } else if (!filaFalloTotal) {
        marca = 'Procesado ' + fechaMarca;
      } else if (filaUsóSms && filaUsóEmail) {
        marca = 'Parcial ' + fechaMarca + ' · SMS y Email fallaron';
      } else if (filaUsóSms) {
        marca = 'Parcial ' + fechaMarca + ' · SMS falló';
      } else {
        marca = 'Parcial ' + fechaMarca + ' · Email falló';
      }

      valoresMarca[f - primeraFila][0] = marca;
    }

    retry(() => rangoMarca.setValues(valoresMarca));

    propiedades.setProperty('ultimaEjecucion', hoy.toUTCString());
    Logger.log(`Proceso completado. Filas: ${filasParaMarcar.length} | SMS enviados: ${resultadoSms.enviados} | SMS fallidos: ${resultadoSms.fallidos} | Fallbacks SMS→Email: ${fallbacksAgregados} | Email enviados: ${resultadoEmail.enviados} | Email fallidos: ${resultadoEmail.fallidos} | Asunto: ${asunto}`);
    _registrarEvento_("INFO", "Cumplimiento.js", "Ley 2300 procesada exitosamente",
      "Filas: " + filasParaMarcar.length + " | SMS: " + resultadoSms.enviados + "/" + (resultadoSms.enviados + resultadoSms.fallidos) + " | Fallbacks: " + fallbacksAgregados + " | Email: " + resultadoEmail.enviados + "/" + (resultadoEmail.enviados + resultadoEmail.fallidos) + " | Asunto: " + asunto);

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
 * el trigger semanal de procesarDatosMejorado (cada sábado a las 6am).
 * Es idempotente: elimina triggers anteriores y crea uno nuevo.
 */
function configurarTriggerCumplimiento() {
  // Eliminar triggers anteriores de esta función (evita duplicados o triggers legacy de 15 días)
  ScriptApp.getProjectTriggers()
    .filter(t => t.getHandlerFunction() === 'procesarDatosMejorado')
    .forEach(t => ScriptApp.deleteTrigger(t));

  ScriptApp.newTrigger('procesarDatosMejorado')
    .timeBased()
    .onWeekDay(ScriptApp.WeekDay.SATURDAY)
    .atHour(9)
    .create();

  Logger.log('Trigger creado: procesarDatosMejorado cada sábado a las 9am (America/Bogota).');
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
 * Determina el texto de marca para la columna "Estado Automatización" de una fila,
 * basándose en qué canal(es) aplicaban y si cada uno tuvo éxito o falló.
 *
 * @param {{ok: boolean}|null} resultadoSms - Resultado del SMS para esta fila, o null si no aplica
 * @param {{ok: boolean}|null} resultadoEmail - Resultado del email para esta fila, o null si no aplica
 * @param {string} fecha - Fecha formateada para incluir en la marca
 * @returns {string} Texto descriptivo para "Estado Automatización"
 */
function _generarMarcaEstado(resultadoSms, resultadoEmail, fecha) {
  var smsAplica = resultadoSms !== null;
  var emailAplica = resultadoEmail !== null;
  var smsOk = smsAplica ? resultadoSms.ok : null;
  var emailOk = emailAplica ? resultadoEmail.ok : null;

  if (smsAplica && emailAplica) {
    if (smsOk && emailOk) return 'Procesado ' + fecha;
    if (smsOk && !emailOk) return 'Parcial ' + fecha + ' · Email falló';
    if (!smsOk && emailOk) return 'Parcial ' + fecha + ' · SMS falló';
    return 'Parcial ' + fecha + ' · SMS y Email fallaron';
  }

  if (smsAplica && !emailAplica) {
    return smsOk ? 'Procesado ' + fecha : 'Parcial ' + fecha + ' · SMS falló';
  }

  if (!smsAplica && emailAplica) {
    return emailOk ? 'Procesado ' + fecha : 'Parcial ' + fecha + ' · Email falló';
  }

  return 'Procesado ' + fecha;
}

/**
 * Arma el cuerpo del correo de cumplimiento Ley 2300 usando los mismos
 * bloques modulares (cabecera, barra de estado, chips, nota, pie) que el
 * resto de notificaciones del sistema, definidos en Notificaciones.js.
 * @param {{rangoFechas:string, contratos:number, contactosCorreo:number, contactosCelular:number, smsEnviados:number, smsFallidos:number, emailEnviados:number, emailFallidos:number, emailInvalidos:number, emailDuplicados:number, emailAbortado:boolean, fallbacksActivados:number}} datos
 * @returns {string} HTML completo listo para MailApp.
 */
function _construirCuerpoLey2300_(datos) {
  var smsEnviados = datos.smsEnviados || 0;
  var smsFallidos = datos.smsFallidos || 0;
  var totalSms = smsEnviados + smsFallidos;

  var emailEnviados = datos.emailEnviados || 0;
  var emailFallidos = datos.emailFallidos || 0;
  var totalEmail = emailEnviados + emailFallidos;

  var fallbacksActivados = datos.fallbacksActivados || 0;

  var mensajeInicio = `Se proces&oacute; el cumplimiento de la <strong>Ley 2300</strong> para las
     solicitudes <strong>aprobadas</strong> desde el &uacute;ltimo corte.
     <br><br><strong>Prioridad:</strong> SMS como canal principal. Email como respaldo
     (si el SMS falla o el contacto no tiene celular).`;

  if (totalSms > 0 && totalEmail > 0) {
    mensajeInicio += ` Los SMS y correos electr&oacute;nicos fueron enviados autom&aacute;ticamente v&iacute;a Infobip.`;
  } else if (totalSms > 0) {
    mensajeInicio += ` Los SMS fueron enviados autom&aacute;ticamente v&iacute;a Infobip.`;
  } else if (totalEmail > 0) {
    mensajeInicio += ` Los correos electr&oacute;nicos fueron enviados autom&aacute;ticamente v&iacute;a Infobip.`;
  }

  var chips = [
    { label: "Corte / Periodo",         valor: datos.rangoFechas,               colorVal: _C_ROJO },
    { label: "Contratos incluidos",     valor: String(datos.contratos)                             },
    { label: "Contactos con celular",   valor: String(datos.contactosCelular)                      }
  ];

  if (totalSms > 0) {
    chips.push({ label: "SMS enviados", valor: String(smsEnviados), colorVal: '#16a34a' });
    if (smsFallidos > 0) {
      chips.push({ label: "SMS fallidos", valor: String(smsFallidos), colorVal: _C_ROJO });
    }
  }

  if (fallbacksActivados > 0) {
    chips.push({ label: "Fallback SMS→Email", valor: String(fallbacksActivados), colorVal: '#d97706' });
  }

  if (totalEmail > 0) {
    chips.push({ label: "Email enviados (respaldo)", valor: String(emailEnviados), colorVal: '#16a34a' });
    if (emailFallidos > 0) {
      chips.push({ label: "Email fallidos", valor: String(emailFallidos), colorVal: _C_ROJO });
    }
  }

  if (datos.contactosCorreo > 0 && totalEmail === 0 && fallbacksActivados === 0) {
    chips.push({ label: "Contactos solo email (sin celular)", valor: String(datos.contactosCorreo) });
  }

  var notaHtml = '';
  if (emailFallidos > 0 || smsFallidos > 0) {
    notaHtml = `<strong style="color:#253150;">Atenci&oacute;n:</strong>
       Algunos env&iacute;os no se pudieron completar.`;
    if (fallbacksActivados > 0) {
      notaHtml += ` De los SMS fallidos, <strong>${fallbacksActivados}</strong> fueron reintentados por email.`;
    }
    if (emailFallidos > 0) {
      notaHtml += ` Se adjunta el archivo <strong>CONTACTOS_FALLIDOS.csv</strong> con los destinatarios
      que requieren gesti&oacute;n manual.`;
    }
    notaHtml += `<br><br><strong>Canales exitosos:</strong> no requieren acci&oacute;n adicional.`;
  } else {
    notaHtml = `<strong style="color:#253150;">Resumen:</strong>
       Todos los contactos fueron notificados exitosamente (SMS prioritario, Email como respaldo).
       No se requiere acci&oacute;n adicional para este corte.`;
  }

  if (datos.emailAbortado) {
    notaHtml += `<br><br><strong style="color:#BD0F14;">&#9888; ALERTA:</strong>
       El env&iacute;o de emails fue abortado por fallas masivas consecutivas.
       Revisar Logs_Sistema para m&aacute;s detalles.`;
  }

  var barraEstadoTexto = "Procesamiento completado";
  if (datos.emailAbortado) {
    barraEstadoTexto = "Completado con alertas";
  }

  return _envolver_([

    _bloque_cabecera_("Cumplimiento Ley 2300"),

    _bloque_barra_estado_(_C_NAVY, "&#10003;", barraEstadoTexto),

    _bloque_cuerpo_inicio_(
      "Hola equipo de inducciones",
      mensajeInicio
    ),

    _bloque_chips_(chips),

    _bloque_nota_(notaHtml),

    _bloque_pie_()

  ].join(""));
}
