/**
 * ============================================================
 *  CONFIGURACIÓN GLOBAL
 *  El Libertador - Ingreso de Inducciones
 * ============================================================
 */

const ID_HOJA_CONTROL   = "1Z0GLLJvinwaU6MK_iaduKBri8VqfCDEPeOfh9gThQhI";
const ID_CARPETA_RAIZ   = "1PrL4T5hYGvmjpDPUVUjUkuC2iTFXFPBW";
const CORREOS_LIDERES = [
  "lady.vargas@segurosbolivar.com",
  "jonathan.enciso@segurosbolivar.com",
  "juan.diaz.buitrago@segurosbolivar.com",
  "jenny.ascanio@segurosbolivar.com",
  "daniela.giraldo@segurosbolivar.com",
  "desarrollocrmlibertador@ellibertador.co"
];
const MIME_EXCEL_VALIDOS = [
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  "application/vnd.ms-excel"
];
const COLUMNAS_OBLIGATORIAS = [1, 2, 3, 4, 5, 6, 9, 10, 11];

const DESTINOS_INVALIDOS = new Set([
  // Genéricos del negocio
  "COMERCIAL","LOCAL","COMERCIO","ARRIENDO","ALQUILAR","ALQUILER",
  "INMUEBLE","PROPIEDAD","BIEN INMUEBLE","USO MIXTO","MIXTO",
  // Evasivas comunes
  "N/A","NA","N.A","N.A.","NO APLICA","NO APLICA.",
  "SIN INFORMACION","SIN INFORMACIÓN","SIN INFO","S/I","S.I",
  "NINGUNO","NINGUNA","NULL","NULO","NULA","ND","NO DISPONIBLE",
  "NO TIENE","DESCONOCIDO","OTRO","OTROS","VARIOS",
  // Ruido
  "-","--","---",".","..","...","_","__","?","??","0","00"
]);


// ============================================================
//  PUNTO DE ENTRADA WEB
// ============================================================

function doGet() {
  return HtmlService.createTemplateFromFile('Index').evaluate()
    .setTitle('Ingreso de Inducciones | El Libertador')
    .setFaviconUrl("https://www.ellibertador.co/favicon.ico")
    .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL)
    .addMetaTag('viewport', 'width=device-width, initial-scale=1');
}

function retry(fn, retries = 4, delay = 300) {
  for (var i = 0; i < retries; i++) {
    try {
      return fn();
    } catch (e) {
      if (i === retries - 1) throw e;
      Utilities.sleep(delay);
    }
  }
}

function include(filename) {
  return HtmlService.createHtmlOutputFromFile(filename).getContent();
}


// ============================================================
//  VALIDADOR HEURÍSTICO DE DESTINO
// ============================================================

function validarDestino(valor) {
  const raw   = String(valor ?? "").trim();
  const upper = raw.toUpperCase().replace(/\s+/g, " ");

  if (!upper)
    return "El campo Destino es obligatorio.";

  if (DESTINOS_INVALIDOS.has(upper))
    return `"${raw}" no describe un uso real del inmueble. Especifique (ej: Peluquería, Restaurante, Vivienda familiar).`;

  if (!/[a-záéíóúüñA-ZÁÉÍÓÚÜÑ]/.test(raw))
    return `"${raw}" no contiene texto válido.`;

  const soloLetras = raw.replace(/[^a-záéíóúüñA-ZÁÉÍÓÚÜÑ]/g, "");
  if (soloLetras.length < 4)
    return `"${raw}" es demasiado corto para describir un destino.`;

  const palabras      = raw.split(/\s+/);
  const palabraMaxima = Math.max(...palabras.map(p => p.replace(/[^a-záéíóúüñA-ZÁÉÍÓÚÜÑ]/gi, "").length));
  if (palabraMaxima < 3)
    return `"${raw}" no contiene palabras reconocibles como destino.`;

  if (/^(.)\1{3,}$/.test(raw.replace(/\s/g, "")))
    return `"${raw}" parece un valor de relleno.`;

  return null; // ✅ Válido
}


// ============================================================
//  MOTOR PRINCIPAL DE AUDITORÍA
// ============================================================

function motorDeAuditoria(formData) {
  let tempSheetId    = null;
  const usuarioEmail = Session.getActiveUser().getEmail();
  const ss           = retry(() => SpreadsheetApp.openById(ID_HOJA_CONTROL));
  const hojaLog      = ss.getSheetByName("Hoja_Control");
  const hojaMaestra  = ss.getSheetByName("Control_General");
  const errores      = [];

  try {

    // ----------------------------------------------------------
    // CASCADA 1 — PROCESAMIENTO DEL ARCHIVO EXCEL
    // ----------------------------------------------------------

    if (!MIME_EXCEL_VALIDOS.includes(formData.excel.tipo)) {
      return {
        status: "ERROR",
        detalles: [{ fila: "SISTEMA", campo: "FORMATO", motivo: "El archivo adjunto no es un Excel válido (.xlsx o .xls)." }]
      };
    }

    const base64Data = formData.excel.bytes.split(',')[1] || formData.excel.bytes;
    const excelBlob  = Utilities.newBlob(
      Utilities.base64Decode(base64Data),
      formData.excel.tipo,
      formData.excel.nombre
    );

    tempSheetId  = convertirExcelAGoogleSheets(excelBlob);
    const ssTemp = retry(() => SpreadsheetApp.openById(tempSheetId));
    const hoja   = ssTemp.getSheets()[0];
    const data   = hoja.getDataRange().getValues();

    // ----------------------------------------------------------
    // CASCADA 2 — VALIDACIÓN DE ENCABEZADOS
    // ----------------------------------------------------------

    const tipoNegociacion = String(data[0][1] || "").trim();
    const titulos         = data[3];

    const metadatos = [
      { valor: data[0][1], label: "Tipo de negociación" },
      { valor: data[1][1], label: "Póliza"              },
      { valor: data[2][1], label: "Inmobiliaria"        },
    ];

    metadatos.forEach(({ valor, label }) => {
      if (!String(valor || "").trim()) {
        errores.push({ fila: "Encabezado", campo: label, motivo: `El campo "${label}" es obligatorio.` });
      }
    });

    const encabezadoTexto = String(titulos[2] || "").trim().toUpperCase();
    if (encabezadoTexto !== "AMPARO INTEGRAL") {
      errores.push({ fila: "SISTEMA", campo: "FORMATO", motivo: "Plantilla antigua detectada. Use el nuevo formato rojo." });
      return { status: "ERROR", detalles: errores };
    }

    if (errores.length > 0) return { status: "ERROR", detalles: errores };

    // ----------------------------------------------------------
    // CASCADA 3 — AUDITORÍA FILA POR FILA
    // ----------------------------------------------------------

    const mapaLlavesUnicas = {};

    for (let i = 4; i < data.length; i++) {
      const fila      = data[i];
      const nF        = i + 1;
      const inquilino = String(fila[9] || "").trim();

      if (!inquilino) continue;

      // ── 1. CAMPOS OBLIGATORIOS ──
      // ✅ FIX 2 — Se quitó el índice 3 (Destino) de este array.
      //    Antes generaba un error duplicado junto con validarDestino().
      //    Ahora el destino lo valida exclusivamente la regla 3.
      const obligatoriosInquilino = [1, 2, 4, 5, 6, 9, 10, 11];
      obligatoriosInquilino.forEach(idx => {
        if (!String(fila[idx] || "").trim()) {
          errores.push({ fila: nF, campo: titulos[idx], motivo: "Dato faltante." });
        }
      });

      // ── 2. CELULAR O CORREO DEL INQUILINO ──
      const celularInq = String(fila[12] || "").trim().replace(/[\s-]/g, "");
      const correoInq  = String(fila[13] || "").trim();

      if (!celularInq && !correoInq) {
        errores.push({
          fila: nF,
          campo: "Celular (INQ) / Correo Electrónico (INQ)",
          motivo: "Debe diligenciar al menos el Celular o el Correo del Inquilino."
        });
      } else if (celularInq && !(/^\d{10,}$/.test(celularInq))) {
        errores.push({
          fila: nF,
          campo: "Celular (INQ)",
          motivo: "El celular debe tener exactamente 10 dígitos numéricos."
        });
      }

      // ── 3. DESTINO (validación heurística completa) ──
      const motivoDestino = validarDestino(fila[3]);
      if (motivoDestino) {
        errores.push({ fila: nF, campo: "Destino", motivo: motivoDestino });
      }

      // ── 4. CODEUDORES (COA 1 al 5) ──
      const coaSlots = [
        { nombre: 14, td: 15, id: 16, cel: 17, correo: 18, label: "COA 1" },
        { nombre: 19, td: 20, id: 21, cel: 22, correo: 23, label: "COA 2" },
        { nombre: 24, td: 25, id: 26, cel: 27, correo: 28, label: "COA 3" },
        { nombre: 29, td: 30, id: 31, cel: 32, correo: 33, label: "COA 4" },
        { nombre: 34, td: 35, id: 36, cel: 37, correo: 38, label: "COA 5" },
      ];

      coaSlots.forEach(coa => {
        const nombreCoa = String(fila[coa.nombre] || "").trim();
        if (!nombreCoa) return;

        const celCoa = String(fila[coa.cel] || "").trim().replace(/[\s-]/g, "");
        const corCoa = String(fila[coa.correo] || "").trim();

        if (!celCoa && !corCoa) {
          errores.push({ fila: nF, campo: `Celular / Correo (${coa.label})`, motivo: `Debe diligenciar al menos el Celular o el Correo de ${coa.label}.` });
        } else if (celCoa && !(/^\d{10,}$/.test(celCoa))) {
          errores.push({
            fila: nF,
            campo: `Celular (${coa.label})`,
            motivo: "El celular debe tener exactamente 10 dígitos numéricos."
          });
        }
      });

      // ── 5. CONTACTOS NO REPETIDOS (REGLA NT) ──
      const contactosDeEstaFila = {};
      const participantesDeFila = [
        { td: String(fila[10] || "").trim().toUpperCase(), cel: String(fila[12] || "").trim(), correo: String(fila[13] || "").trim(), label: "INQ"   },
        { td: String(fila[15] || "").trim().toUpperCase(), cel: String(fila[17] || "").trim(), correo: String(fila[18] || "").trim(), label: "COA 1" },
        { td: String(fila[20] || "").trim().toUpperCase(), cel: String(fila[22] || "").trim(), correo: String(fila[23] || "").trim(), label: "COA 2" },
        { td: String(fila[25] || "").trim().toUpperCase(), cel: String(fila[27] || "").trim(), correo: String(fila[28] || "").trim(), label: "COA 3" },
        { td: String(fila[30] || "").trim().toUpperCase(), cel: String(fila[32] || "").trim(), correo: String(fila[33] || "").trim(), label: "COA 4" },
        { td: String(fila[35] || "").trim().toUpperCase(), cel: String(fila[37] || "").trim(), correo: String(fila[38] || "").trim(), label: "COA 5" },
      ];

      const filaTieneNT = participantesDeFila.some(p => p.td === "NT");
      if (!filaTieneNT) {
        participantesDeFila.forEach(({ cel, correo, label }) => {
          [cel, correo].forEach(contacto => {
            if (!contacto) return;
            if (!contactosDeEstaFila[contacto]) {
              contactosDeEstaFila[contacto] = label;
            } else {
              errores.push({
                fila: nF,
                campo: `Contacto (${label})`,
                motivo: `El contacto "${contacto}" está repetido en la misma fila (se encontró en ${contactosDeEstaFila[contacto]} y en ${label}).`
              });
            }
          });
        });
      }

      // ── 6. DUPLICADOS VERTICALES ──
      const llaveVertical = `${String(fila[11] || "").trim()}|${String(fila[5] || "").trim()}`.toUpperCase();
      if (mapaLlavesUnicas[llaveVertical]) {
        errores.push({ fila: nF, campo: "DUPLICADO", motivo: `Contrato repetido — misma identificación y dirección (ver fila ${mapaLlavesUnicas[llaveVertical]}).` });
      } else {
        mapaLlavesUnicas[llaveVertical] = nF;
      }
    }

    // ✅ FIX 3 — Se integró generarArchivoMarcado() en el flujo de errores.
    //    Antes existía la función pero nunca se llamaba, así que el Excel
    //    marcado jamás llegaba al frontend. Ahora se genera aquí, ANTES
    //    de que el finally borre la hoja temporal.
    if (errores.length > 0) {
      hojaLog.appendRow([new Date(), usuarioEmail, formData.poliza, "FALLIDO", "Inconsistencias en Excel", "N/A", formData.observaciones]);

      const archivoMarcado = generarArchivoMarcado(tempSheetId, errores);

      return {
        status: "ERROR",
        detalles: errores,
        archivoMarcado: archivoMarcado  // { base64, nombre } — el frontend puede ofrecerlo como descarga
      };
    }

    // ----------------------------------------------------------
    // CASCADA 4 — PREPARACIÓN DE DATOS (EN MEMORIA)
    // ----------------------------------------------------------

    const ts              = new Date();
    const fechaId         = Utilities.formatDate(ts, "GMT-5", "d/M/yyyy");
    const idLote          = fechaId + "-" + formData.poliza;
    const nombreComercial = obtenerNombreDeComercial(usuarioEmail);
    const estadoCartera   = "PAZ Y SALVO";
    const filasParaInsertar = [];

    for (let i = 4; i < data.length; i++) {
      const filaE = data[i];
      if (!String(filaE[9] || "").trim()) continue;

      const filaFinal = [
        idLote, estadoCartera, ts, "", "", "", "", "", "",
        "PENDIENTE RADICAR", nombreComercial, formData.tasaNegociacion,
        filaE[0], limpiarFecha(filaE[1]), filaE[2], tipoNegociacion,
        formData.poliza, filaE[3], filaE[4], filaE[5], filaE[6],
        filaE[7], filaE[8], filaE[9], filaE[10], filaE[11],
        filaE[12], filaE[13], "", filaE[14], filaE[15], filaE[16],
        filaE[17], filaE[18], "", filaE[19], filaE[20], filaE[21],
        filaE[22], filaE[23], "", filaE[24], filaE[25], filaE[26],
        filaE[27], filaE[28], "", filaE[29], filaE[30], filaE[31],
        filaE[32], filaE[33], "", filaE[34], filaE[35], filaE[36],
        filaE[37], filaE[38], ""
      ];

      const filaProcesada = filaFinal.map(dato => {
        if (typeof dato === 'string' && !dato.includes('@') && !dato.includes('/')) {
          return dato.toUpperCase();
        }
        return dato;
      });

      filasParaInsertar.push(filaProcesada);
    }

    // ----------------------------------------------------------
    // CASCADA 5 — OPERACIONES DE ALTO RIESGO (DRIVE Y CORREO)
    // ----------------------------------------------------------

    const carpeta = retry(() => DriveApp.getFolderById(ID_CARPETA_RAIZ).createFolder(idLote));
    retry(() => carpeta.createFile(excelBlob));

    if (formData.tipoPazYSalvo === "adjunto" && formData.pazYSalvoPdf) {
      const pdfBase64 = formData.pazYSalvoPdf.bytes.split(',')[1] || formData.pazYSalvoPdf.bytes;
      const pdfBlob   = Utilities.newBlob(
        Utilities.base64Decode(pdfBase64),
        "application/pdf",
        formData.pazYSalvoPdf.nombre
      );
      retry(() => carpeta.createFile(pdfBlob));
    }

    enviarLasNotificaciones(formData, idLote, filasParaInsertar.length, usuarioEmail, carpeta.getUrl(), filasParaInsertar);

    // ----------------------------------------------------------
    // CASCADA 6 — VOLCADO AL SHEET (PUNTO DE NO RETORNO)
    // ----------------------------------------------------------

    if (filasParaInsertar.length > 0) {
      const ultimaFila = hojaMaestra.getLastRow();
      retry(() => {
        hojaMaestra
          .getRange(ultimaFila + 1, 1, filasParaInsertar.length, filasParaInsertar[0].length)
          .setValues(filasParaInsertar);
      });
    }

    const detallePazYSalvo = formData.tipoPazYSalvo === "adjunto"
      ? "Radicado con adjunto de paz y salvo"
      : "Radicado con confirmación de paz y salvo";

    hojaLog.appendRow([ts, usuarioEmail, formData.poliza, "EXITOSO", detallePazYSalvo, idLote, formData.observaciones]);

    return { status: "OK", idLote: idLote };

  } catch (e) {
    console.error("Error crítico durante la radicación: ", e);

    const msjAmable = "Tuvimos una breve intermitencia de conexión al guardar los documentos. Para proteger tu información y evitar contratos duplicados, detuvimos el proceso de forma segura. Por favor, vuelve a dar clic en el botón de Radicar.";

    return {
      status: "ERROR",
      detalles: [{ fila: "SISTEMA", campo: "INTERRUPCIÓN TEMPORAL", motivo: msjAmable }]
    };

  } finally {
    // La hoja temporal se borra siempre al final.
    // En el caso de errores, generarArchivoMarcado() ya exportó el XLSX
    // antes de llegar aquí, así que borrarla en este punto es seguro.
    if (tempSheetId) {
      try { DriveApp.getFileById(tempSheetId).setTrashed(true); } catch (f) {
        console.warn("No se pudo eliminar hoja temporal: " + f.toString());
      }
    }
  }
}


// ============================================================
//  UTILIDADES
// ============================================================

function convertirExcelAGoogleSheets(blob) {
  return retry(() => Drive.Files.create(
    { name: "TEMP_AUDIT_" + new Date().getTime(), mimeType: MimeType.GOOGLE_SHEETS },
    blob
  ).id);
}

function limpiarFecha(valor) {
  if (!valor) return "";
  if (valor instanceof Date) return Utilities.formatDate(valor, "GMT-5", "yyyy/MM/dd");
  if (typeof valor === 'number') {
    const fecha = new Date((valor - 25569) * 86400 * 1000);
    return Utilities.formatDate(fecha, "GMT-5", "yyyy/MM/dd");
  }
  return String(valor);
}

function consultarLote(idLote) {
  const ss   = SpreadsheetApp.openById(ID_HOJA_CONTROL);
  const hoja = ss.getSheetByName("Control_General");
  const data = hoja.getDataRange().getValues();

  const IDX = { idLote:0, fechaIngreso:2, estado:9, comercial:10, arrendatario:23 };
  const resultados = [];

  for (let i = 1; i < data.length; i++) {
    const fila = data[i];
    const id   = String(fila[IDX.idLote] || "").trim();
    if (id.toLowerCase() !== idLote.toLowerCase()) continue;

    const fechaRaw = fila[IDX.fechaIngreso];
    let fechaStr   = "";
    if (fechaRaw instanceof Date) {
      fechaStr = Utilities.formatDate(fechaRaw, "GMT-5", "d/MM/yyyy HH:mm");
    } else {
      fechaStr = String(fechaRaw || "");
    }

    resultados.push({
      idLote:       String(fila[IDX.idLote]       || "").trim(),
      fechaIngreso: fechaStr,
      estado:       String(fila[IDX.estado]       || "").trim(),
      comercial:    String(fila[IDX.comercial]    || "").trim(),
      arrendatario: String(fila[IDX.arrendatario] || "").trim()
    });
  }

  return resultados;
}


// ============================================================
//  GENERADOR DE EXCEL MARCADO
// ============================================================

/**
 * Pinta los errores en la hoja temporal y devuelve el XLSX como base64.
 * @param {string} ssId    ID de la hoja de cálculo temporal.
 * @param {Array}  errores Array de objetos { fila, campo, motivo }.
 * @returns {{ base64: string, nombre: string }}
 */
function generarArchivoMarcado(ssId, errores) {
  const ss = SpreadsheetApp.openById(ssId);
  const hoja = ss.getSheets()[0];
  const ultimaCol = hoja.getLastColumn();
  
  // 1. Añadimos columna de diagnóstico al final de la hoja para dar contexto
  hoja.getRange(4, ultimaCol + 1).setValue("DIAGNÓSTICO DE AUDITORÍA")
      .setFontWeight("bold").setBackground("#BD0F14").setFontColor("white");

  // 2. Pintamos los errores iterando sobre el array
  errores.forEach(err => {
    // Solo marcamos los errores que correspondan a una fila específica en los datos
    if (typeof err.fila === 'number') {
      // Pintamos toda la fila con un fondo rojo claro para que el usuario la identifique
      hoja.getRange(err.fila, 1, 1, ultimaCol).setBackground("#fff2f2");
      
      // Construimos el mensaje de error para esa fila. 
      // Si ya hay un error previo en esa fila, lo concatenamos.
      const celdaDiagnostico = hoja.getRange(err.fila, ultimaCol + 1);
      const valorActual = celdaDiagnostico.getValue();
      const nuevoMensaje = `[${err.campo}] ${err.motivo}`;
      
      const valorFinal = valorActual ? valorActual + " | " + nuevoMensaje : nuevoMensaje;
      celdaDiagnostico.setValue(valorFinal).setFontColor("#BD0F14");
    }
  });

  // IMPORTANTE: Aseguramos que los cambios visuales se guarden ANTES de exportar
  SpreadsheetApp.flush();

  // 3. Descargamos el archivo modificado y lo convertimos a base64
  const url = "https://docs.google.com/spreadsheets/d/" + ssId + "/export?format=xlsx";
  const params = {
    method: "get",
    headers: { "Authorization": "Bearer " + ScriptApp.getOAuthToken() },
    muteHttpExceptions: true
  };
  
  const blob = UrlFetchApp.fetch(url, params).getBlob();
  const base64 = Utilities.base64Encode(blob.getBytes());
  
  return {
    base64: base64,
    nombre: "Ajustes_Requeridos_" + new Date().getTime() + ".xlsx"
  };
}