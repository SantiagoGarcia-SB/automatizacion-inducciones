/**
 * ============================================================
 * CONFIGURACIÓN GLOBAL
 * El Libertador - Ingreso de Inducciones
 * ============================================================
 */

var ID_HOJA_CONTROL      = "1Z0GLLJvinwaU6MK_iaduKBri8VqfCDEPeOfh9gThQhI";
var ID_ARCHIVO_ANALISIS  = "1ph9pgf-ADc2hE6U4KaKXAGY8ghh5Z940PuLVU_PlOQ0";
var ID_CARPETA_RAIZ      = "1PrL4T5hYGvmjpDPUVUjUkuC2iTFXFPBW";
var CORREOS_LIDERES   = [ 
  "lady.vargas@segurosbolivar.com", 
  "jonathan.enciso@segurosbolivar.com", 
  "juan.diaz.buitrago@segurosbolivar.com", 
  "jenny.ascanio@segurosbolivar.com", 
  "kharen.garcia@segurosbolivar.com", 
  "desarrollocrmlibertador@ellibertador.co",
  "daniela.giraldo@segurosbolivar.com"
];
var MIME_EXCEL_VALIDOS = [
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  "application/vnd.ms-excel"
];
var COLUMNAS_OBLIGATORIAS = [1, 2, 3, 4, 5, 6, 9, 10, 11];

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
//  VALIDADORES DE CELULAR Y CORREO
// ============================================================

function validarCelular(valor) {
  const raw = String(valor ?? "").trim().replace(/[\s-]/g, "").replace(/^(\+?57)/, "");
  if (!raw) return null; // vacío lo maneja la regla de "al menos uno"

  if (!/^3\d{9}$/.test(raw)) {
    return `El celular "${valor}" no es válido. Verifique el número e intente nuevamente.`;
  }

  return null; // ✅ Válido
}

function validarCorreo(valor) {
  const raw = String(valor ?? "").trim();
  if (!raw) return null; // vacío lo maneja la regla de "al menos uno"

  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(raw)) {
    return `El correo "${raw}" no tiene un formato válido.`;
  }

  return null; // ✅ Válido
}

// ============================================================
//  VALIDADOR DE CAMPOS MONETARIOS (Canon, Administración, IVA)
// ============================================================

function validarCampoMonetario(valor, nombreCampo) {
  const raw = String(valor ?? "").trim();

  // Si está vacío, lo maneja la validación de obligatorios — no duplicamos.
  if (!raw) return null;

  // Eliminamos símbolos monetarios y de formato permitidos: $ . , (espacio)
  const sinFormato = raw.replace(/[$.,\s]/g, "");

  // Si después de quitar los símbolos permitidos queda algo que no es dígito → hay letras u otros caracteres
  if (!/^\d+$/.test(sinFormato)) {
    return `El campo "${nombreCampo}" tiene el valor "${raw}", que contiene letras o símbolos no permitidos. ` +
       `Escribe solo el valor numérico, por ejemplo: 1500000 o $1.500.000`;
  }

  return null; // ✅ Válido
}


// ============================================================
//  MOTOR PRINCIPAL DE AUDITORÍA
// ============================================================

function motorDeAuditoria(formData) {
  // Lock para evitar colisión si dos usuarios radican en el mismo instante
  const lock = LockService.getScriptLock();
  if (!lock.tryLock(60000)) {
    return {
      status: "ERROR",
      detalles: [{ fila: "SISTEMA", campo: "CONCURRENCIA", motivo: "Otro usuario está radicando en este momento. Por favor intenta de nuevo en unos segundos." }]
    };
  }

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

    // V1: Si el frontend envió los datos ya parseados, los usamos directamente
    // (elimina la conversión Drive.Files.create que tarda 3-8 seg y requiere permisos extra).
    // Si no vienen (ej. un cliente antiguo), hacemos fallback a la conversión tradicional.
    let data;
    if (formData.excelParseado && Array.isArray(formData.excelParseado) && formData.excelParseado.length >= 5) {
      data = formData.excelParseado;
    } else {
      tempSheetId  = convertirExcelAGoogleSheets(excelBlob);
      const ssTemp = retry(() => SpreadsheetApp.openById(tempSheetId));
      const hoja   = ssTemp.getSheets()[0];
      data         = hoja.getDataRange().getValues();
    }

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

    // Pre-paso: valores únicos de Destino que ya pasan la heurística barata
    // (validarDestino) se envían UNA sola vez a Vertex AI para juicio
    // semántico, en vez de una llamada de red por fila. Si Vertex AI falla,
    // validarDestinosConIA_ se degrada sola y devuelve {} — no bloquea la
    // radicación (ver IADestino.js).
    const destinosUnicosParaIA = new Set();
    for (let iPre = 4; iPre < data.length; iPre++) {
      const filaPre = data[iPre];
      if (!String(filaPre[9] || "").trim()) continue;

      const rawDestinoPre = String(filaPre[3] ?? "").trim();
      if (rawDestinoPre && !validarDestino(rawDestinoPre)) {
        destinosUnicosParaIA.add(rawDestinoPre);
      }
    }
    const resultadoIA          = validarDestinosConIA_(Array.from(destinosUnicosParaIA));
    const veredictosDestinoIA  = resultadoIA.mapa;
    const validacionIADegradada = resultadoIA.degradado;

    // Nota visible en Hoja_Control (no solo en el log técnico) cuando la IA
    // no pudo validar Destino en este envío y se siguió solo con heurística.
    const notaValidacionIA = validacionIADegradada
      ? " [Aviso: la validación de Destino con IA no estuvo disponible en este envío; se usó solo la validación heurística.]"
      : "";

    const mapaLlavesUnicas = {};

    for (let i = 4; i < data.length; i++) {
      const fila      = data[i];
      const nF        = i + 1;
      const inquilino = String(fila[9] || "").trim();

      if (!inquilino) continue;

      // ── 1. CAMPOS OBLIGATORIOS ──
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
      } else {
        const motivoCelularInq = validarCelular(celularInq);
        if (motivoCelularInq) {
          errores.push({ fila: nF, campo: "Celular (INQ)", motivo: motivoCelularInq });
        }

        const motivoCorreoInq = validarCorreo(correoInq);
        if (motivoCorreoInq) {
          errores.push({ fila: nF, campo: "Correo Electrónico (INQ)", motivo: motivoCorreoInq });
        }
      }

      // ── 3. DESTINO (heurística barata + juicio semántico con IA) ──
      const motivoDestino = validarDestino(fila[3]);
      if (motivoDestino) {
        errores.push({ fila: nF, campo: "Destino", motivo: motivoDestino });
      } else {
        const rawDestino  = String(fila[3] ?? "").trim();
        const veredictoIA = veredictosDestinoIA[rawDestino];
        if (veredictoIA && veredictoIA.valido === false) {
          errores.push({
            fila: nF,
            campo: "Destino",
            motivo: veredictoIA.motivo || `"${rawDestino}" no parece describir un uso real del inmueble (validado por IA).`
          });
        }
      }

      // ── 3b. CAMPOS MONETARIOS (Canon, Administración, IVA) ──
      const camposMonetarios = [
        { idx: 6, nombre: "Canon"          },
        { idx: 7, nombre: "Administración" },
        { idx: 8, nombre: "IVA"            },
      ];

      camposMonetarios.forEach(({ idx, nombre }) => {
        const motivoMonetario = validarCampoMonetario(fila[idx], nombre);
        if (motivoMonetario) {
          errores.push({ fila: nF, campo: nombre, motivo: motivoMonetario });
        }
      });

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
        } else {
          const motivoCelularCoa = validarCelular(celCoa);
          if (motivoCelularCoa) {
            errores.push({ fila: nF, campo: `Celular (${coa.label})`, motivo: motivoCelularCoa });
          }

          const motivoCorreoCoa = validarCorreo(corCoa);
          if (motivoCorreoCoa) {
            errores.push({ fila: nF, campo: `Correo (${coa.label})`, motivo: motivoCorreoCoa });
          }
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

    if (errores.length > 0) {
      hojaLog.appendRow([new Date(), usuarioEmail, formData.poliza, "FALLIDO", "Inconsistencias en Excel", "N/A", formData.observaciones + notaValidacionIA]);

      // Si usamos parseo directo (V1), creamos un sheet temporal para generar el archivo marcado
      let ssIdParaMarcado = tempSheetId;
      if (!ssIdParaMarcado) {
        ssIdParaMarcado = convertirExcelAGoogleSheets(excelBlob);
        tempSheetId = ssIdParaMarcado; // para que el finally lo borre
      }

      const archivoMarcado = generarArchivoMarcado(ssIdParaMarcado, errores);
      return {
        status: "ERROR",
        detalles: errores,
        archivoMarcado: archivoMarcado
      };
    }

    // =========================================================================
    // MODIFICADO: CASCADA 4 — PREPARACIÓN DE DATOS (CON SALVAVIDAS INCLUIDO)
    // =========================================================================

    const ts              = new Date();
    const fechaId         = Utilities.formatDate(ts, "GMT-5", "d/M/yyyy");
    const horaMin         = Utilities.formatDate(ts, "GMT-5", "HHmm");
    const idLote          = fechaId + "-" + formData.poliza + "-" + horaMin;
    const nombreComercial = obtenerNombreDeComercial(usuarioEmail).toUpperCase();
    const estadoCartera   = "PAZ Y SALVO";
    const filasParaInsertar = [];

    let tasaNegociacionLimpia = "";
    if (formData.tasaNegociacion) {
      tasaNegociacionLimpia = formData.tasaNegociacion.toString().replace(/\./g, ',');
    }

    let contadorRegistro = 1;

    for (let i = 4; i < data.length; i++) {
      const filaE = data[i];
      if (!String(filaE[9] || "").trim()) continue;

      const uuidUnicoFila = `${idLote}_REG_${String(contadorRegistro).padStart(3, '0')}`;
      const filaFinal = new Array(62).fill(""); 

      filaFinal[0]  = idLote;
      filaFinal[1]  = estadoCartera;
      filaFinal[2]  = ts;
      filaFinal[9]  = "PENDIENTE RADICAR";
      filaFinal[10] = nombreComercial;
      filaFinal[11] = tasaNegociacionLimpia;
      filaFinal[12] = filaE[0];
      filaFinal[13] = limpiarFecha(filaE[1]);
      filaFinal[14] = filaE[2];
      filaFinal[15] = tipoNegociacion;
      filaFinal[16] = formData.poliza;
      filaFinal[17] = filaE[3];
      filaFinal[18] = filaE[4];
      filaFinal[19] = filaE[5];
      filaFinal[20] = _limpiarMonetario_(filaE[6]);
      filaFinal[21] = _limpiarMonetario_(filaE[7]);
      filaFinal[22] = _limpiarMonetario_(filaE[8]);
      
      filaFinal[23] = filaE[9];
      filaFinal[24] = _limpiarTipoDoc_(filaE[10]);
      filaFinal[25] = _limpiarIdentificacion_(filaE[11]);
      filaFinal[26] = _limpiarCelular_(filaE[12]);
      filaFinal[27] = _limpiarCorreo_(filaE[13]);
      
      filaFinal[29] = filaE[14]; filaFinal[30] = _limpiarTipoDoc_(filaE[15]); filaFinal[31] = _limpiarIdentificacion_(filaE[16]); filaFinal[32] = _limpiarCelular_(filaE[17]); filaFinal[33] = _limpiarCorreo_(filaE[18]);
      filaFinal[35] = filaE[19]; filaFinal[36] = _limpiarTipoDoc_(filaE[20]); filaFinal[37] = _limpiarIdentificacion_(filaE[21]); filaFinal[38] = _limpiarCelular_(filaE[22]); filaFinal[39] = _limpiarCorreo_(filaE[23]);
      filaFinal[41] = filaE[24]; filaFinal[42] = _limpiarTipoDoc_(filaE[25]); filaFinal[43] = _limpiarIdentificacion_(filaE[26]); filaFinal[44] = _limpiarCelular_(filaE[27]); filaFinal[45] = _limpiarCorreo_(filaE[28]);
      filaFinal[47] = filaE[29]; filaFinal[48] = _limpiarTipoDoc_(filaE[30]); filaFinal[49] = _limpiarIdentificacion_(filaE[31]); filaFinal[50] = _limpiarCelular_(filaE[32]); filaFinal[51] = _limpiarCorreo_(filaE[33]);
      filaFinal[53] = filaE[34]; filaFinal[54] = _limpiarTipoDoc_(filaE[35]); filaFinal[55] = _limpiarIdentificacion_(filaE[36]); filaFinal[56] = _limpiarCelular_(filaE[37]); filaFinal[57] = _limpiarCorreo_(filaE[38]);

      filaFinal[61] = uuidUnicoFila; 

      // SALVAVIDAS 1: Protegemos contra nulos y errores de tipeo
      const filaProcesada = filaFinal.map(dato => {
        if (dato === undefined || dato === null) return ""; 
        if (typeof dato === 'string' && !dato.includes('@') && !dato.includes('/')) {
          return dato.toUpperCase();
        }
        return dato;
      });

      filasParaInsertar.push(filaProcesada);
      contadorRegistro++;
    }


    // ----------------------------------------------------------
    // CASCADA 5 — OPERACIONES EN DRIVE (archivos del lote)
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

    // ----------------------------------------------------------
    // CASCADA 6 — VOLCADO AL SHEET (PUNTO DE NO RETORNO)
    // Se escribe ANTES del envío de correo para que, si la
    // notificación falla, los datos ya estén registrados.
    // ----------------------------------------------------------

    if (filasParaInsertar.length > 0) {
      // SALVAVIDAS 2: Si tu hoja tiene menos de 62 columnas, añade las faltantes automáticamente
      const columnasExistentes = hojaMaestra.getMaxColumns();
      if (columnasExistentes < 62) {
        hojaMaestra.insertColumnsAfter(columnasExistentes, 62 - columnasExistentes);
      }

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

    hojaLog.appendRow([ts, usuarioEmail, formData.poliza, "EXITOSO", detallePazYSalvo, idLote, formData.observaciones + notaValidacionIA]);

    // ----------------------------------------------------------
    // CASCADA 7 — NOTIFICACIÓN POR CORREO (best-effort)
    // Si falla, la radicación ya fue exitosa. Se loguea el error
    // pero el usuario recibe su confirmación de lote creado.
    // ----------------------------------------------------------

    try {
      enviarLasNotificaciones(formData, idLote, filasParaInsertar.length, usuarioEmail, carpeta.getUrl(), filasParaInsertar);
    } catch (errMail) {
      console.error("Notificación no enviada (la radicación SÍ fue exitosa): " + errMail.message);
      _registrarEvento_("WARN", "Codigo.js", "Correo de confirmación no enviado para lote " + idLote, errMail.message);
    }

    return { status: "OK", idLote: idLote };

  } catch (e) {
    console.error("Error crítico durante la radicación: ", e);

    // SALVAVIDAS 3: Mostramos en pantalla el error técnico exacto en vez del mensaje amigable.
    const errorReal = e.toString();

    return {
      status: "ERROR",
      detalles: [{ fila: "SISTEMA", campo: "DEBUG (ERROR REAL)", motivo: errorReal }]
    };

  } finally {
    if (tempSheetId) {
      try { DriveApp.getFileById(tempSheetId).setTrashed(true); } catch (f) {
        console.warn("No se pudo eliminar hoja temporal: " + f.toString());
      }
    }
    lock.releaseLock();
  }
}


// ============================================================
//  UTILIDADES — SANITIZACIÓN DE DATOS ANTES DE ESCRIBIR
// ============================================================

/**
 * Limpia un número de celular: quita +57, espacios, guiones, paréntesis.
 * Retorna solo los dígitos o vacío si no hay dato.
 * Ejemplos:
 *   "+57 310 555-1234" → "3105551234"
 *   "310-555-1234"     → "3105551234"
 *   "(310) 5551234"    → "3105551234"
 */
function _limpiarCelular_(valor) {
  if (!valor) return "";
  return String(valor).trim().replace(/[\s\-\(\)]/g, "").replace(/^\+?57/, "") || "";
}

/**
 * Limpia un correo electrónico: trim + lowercase.
 * Ejemplos:
 *   " Juan.Perez@Gmail.com " → "juan.perez@gmail.com"
 */
function _limpiarCorreo_(valor) {
  if (!valor) return "";
  return String(valor).trim().toLowerCase();
}

/**
 * Limpia un número de identificación: quita puntos de miles y espacios.
 * Ejemplos:
 *   "1.032.456.789" → "1032456789"
 *   "A1234567"      → "A1234567" (pasaportes se dejan sin puntos)
 */
function _limpiarIdentificacion_(valor) {
  if (!valor) return "";
  return String(valor).trim().replace(/\./g, "").replace(/\s/g, "");
}

/**
 * Normaliza el tipo de documento a su forma canónica.
 * Ejemplos:
 *   "C.C." → "CC"    "Cédula" → "CC"    "N.I.T" → "NIT"
 *   "CE" → "CE"      "NT" → "NT"
 */
function _limpiarTipoDoc_(valor) {
  if (!valor) return "";
  const upper = String(valor).trim().toUpperCase().replace(/[.\s]/g, "");

  const mapa = {
    "CC": "CC", "CEDULA": "CC", "CEDULADECIUDADANIA": "CC", "CEDULACIUDADANIA": "CC",
    "NIT": "NIT",
    "CE": "CE", "CEDULADEEXTRANJERIA": "CE", "EXTRANJERIA": "CE",
    "PP": "PP", "PASAPORTE": "PP",
    "TI": "TI", "TARJETADEIDENTIDAD": "TI", "TARJETAIDENTIDAD": "TI",
    "NT": "NT", "NOTIENE": "NT", "NA": "NT"
  };

  return mapa[upper] || upper;
}


// ============================================================
//  UTILIDADES — CONVERSIÓN Y FORMATO
// ============================================================

/**
 * Limpia un valor monetario quitando $, puntos de miles y espacios.
 * Trata la COMA como separador decimal (estándar colombiano).
 * Retorna un número limpio listo para escribir en la hoja.
 *
 * Ejemplos:
 *   "$1.500.000"    → 1500000
 *   "1,500,000"     → 1500000  (comas como miles si hay más de una)
 *   "1500000"       → 1500000
 *   "1.500.000,50"  → 1500000  (redondea, no hay centavos en canon)
 *   "2300000.5"     → 2300000  (redondea)
 *   ""              → ""
 */
function _limpiarMonetario_(valor) {
  if (valor === null || valor === undefined || valor === "") return "";
  if (typeof valor === 'number') return Math.round(valor);

  let texto = String(valor).trim().replace(/[$\s]/g, "");
  if (!texto) return "";

  // Detectar separador decimal:
  // Si tiene UNA sola coma y lo que sigue son 1-2 dígitos al final → es decimal colombiano
  // Ej: "1500000,50" o "1.500.000,5"
  const matchDecimalComa = texto.match(/^(.+),(\d{1,2})$/);
  if (matchDecimalComa) {
    // Parte entera: quitar puntos (miles), parte decimal: ignorar (redondear)
    const parteEntera = matchDecimalComa[1].replace(/\./g, "");
    const numero = parseInt(parteEntera, 10);
    return isNaN(numero) ? "" : numero;
  }

  // Si tiene UN solo punto y lo que sigue son 1-2 dígitos al final → es decimal anglosajón
  // Ej: "1500000.50"
  const matchDecimalPunto = texto.match(/^(.+)\.(\d{1,2})$/);
  if (matchDecimalPunto) {
    const parteEntera = matchDecimalPunto[1].replace(/[.,]/g, "");
    const numero = parseInt(parteEntera, 10);
    return isNaN(numero) ? "" : numero;
  }

  // Caso normal: quitar puntos y comas (son separadores de miles)
  const limpio = texto.replace(/[.,]/g, "");
  const numero = parseInt(limpio, 10);
  return isNaN(numero) ? "" : numero;
}

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

  // V3: Usar TextFinder en vez de leer toda la hoja — mucho más rápido
  const finder = hoja.createTextFinder(idLote).matchEntireCell(true).matchCase(false);
  const celdas = finder.findAll();

  if (celdas.length === 0) return [];

  const IDX = { idLote:0, fechaIngreso:2, estado:9, comercial:10, arrendatario:23 };
  const resultados = [];

  celdas.forEach(celda => {
    // Solo considerar coincidencias en la columna A (ID Lote)
    if (celda.getColumn() !== 1) return;
    const row = celda.getRow();
    const fila = hoja.getRange(row, 1, 1, 24).getValues()[0];

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
  });

  return resultados;
}


// ============================================================
//  U1: HISTORIAL DE LOTES DEL USUARIO
// ============================================================

/**
 * Retorna los últimos lotes radicados por el usuario logueado.
 * Se agrupa por lote y muestra resumen con estado actual.
 * @returns {Array} [{idLote, fecha, contratos, estados}]
 */
function obtenerLotesDelUsuario() {
  const email = Session.getActiveUser().getEmail();

  const ss   = SpreadsheetApp.openById(ID_HOJA_CONTROL);
  const hoja = ss.getSheetByName("Hoja_Control");
  if (!hoja) return [];

  const data = hoja.getDataRange().getValues();
  const lotesMap = {};

  // Recorrer de abajo hacia arriba para obtener los más recientes primero
  for (let i = data.length - 1; i >= 1; i--) {
    const fila       = data[i];
    const emailLog   = String(fila[1] || "").trim().toLowerCase();
    const resultado  = String(fila[3] || "").trim();
    const idLote     = String(fila[5] || "").trim();

    if (emailLog !== email.toLowerCase()) continue;
    if (resultado !== "EXITOSO" || !idLote) continue;
    if (lotesMap[idLote]) continue;

    const fechaRaw = fila[0];
    let fechaStr = "";
    if (fechaRaw instanceof Date) {
      fechaStr = Utilities.formatDate(fechaRaw, "GMT-5", "d/MM/yyyy HH:mm");
    } else {
      fechaStr = String(fechaRaw || "");
    }

    lotesMap[idLote] = { idLote: idLote, fecha: fechaStr, contratos: 0, estadosSet: new Set() };
    if (Object.keys(lotesMap).length >= 10) break;
  }

  if (Object.keys(lotesMap).length === 0) return [];

  // Obtener estado actual desde Control_General
  const hojaCtrl = ss.getSheetByName("Control_General");
  if (hojaCtrl) {
    const dataCtrl = hojaCtrl.getDataRange().getValues();
    for (let i = 1; i < dataCtrl.length; i++) {
      const id = String(dataCtrl[i][0] || "").trim();
      if (!lotesMap[id]) continue;
      lotesMap[id].contratos++;
      lotesMap[id].estadosSet.add(String(dataCtrl[i][9] || "").trim());
    }
  }

  return Object.values(lotesMap).map(l => ({
    idLote:    l.idLote,
    fecha:     l.fecha,
    contratos: l.contratos,
    estados:   Array.from(l.estadosSet).join(", ") || "Sin datos"
  }));
}


/**
 * Retorna el nombre del usuario actual derivado de su email.
 * Ultraligero: no lee ninguna hoja. Respuesta instantánea.
 */
function obtenerNombreUsuarioActual() {
  const email = Session.getActiveUser().getEmail();
  return obtenerNombreDeComercial(email);
}

/**
 * Retorna el resumen semanal del comercial logueado.
 * Separado del nombre para no bloquear el saludo.
 * @returns {{radicados: number, enAnalisis: number, pendientePS: number, terminados: number}}
 */
function obtenerResumenSemanal() {
  const email = Session.getActiveUser().getEmail();
  const nombre = obtenerNombreDeComercial(email);
  const resumen = { radicados: 0, enAnalisis: 0, pendientePS: 0, terminados: 0 };

  const ss = SpreadsheetApp.openById(ID_HOJA_CONTROL);

  // Contar lotes radicados esta semana desde Hoja_Control (liviana)
  const hojaLog = ss.getSheetByName("Hoja_Control");
  if (hojaLog) {
    const dataLog = hojaLog.getDataRange().getValues();
    const hace7dias = new Date(new Date().getTime() - 7 * 24 * 60 * 60 * 1000);
    const lotesContados = new Set();

    for (let i = dataLog.length - 1; i >= 1; i--) {
      const fechaRaw = dataLog[i][0];
      if (fechaRaw instanceof Date && fechaRaw < hace7dias) break;
      const emailLog  = String(dataLog[i][1] || "").trim().toLowerCase();
      const resultado = String(dataLog[i][3] || "").trim();
      const idLote    = String(dataLog[i][5] || "").trim();
      if (emailLog === email.toLowerCase() && resultado === "EXITOSO" && idLote && !lotesContados.has(idLote)) {
        lotesContados.add(idLote);
        resumen.radicados++;
      }
    }
  }

  // Contar estados actuales del comercial con TextFinder
  const hojaCtrl = ss.getSheetByName("Control_General");
  if (hojaCtrl && hojaCtrl.getLastRow() > 1) {
    const nombreUpper = nombre.toUpperCase();
    const finder = hojaCtrl.createTextFinder(nombreUpper).matchCase(false);
    const celdas = finder.findAll();

    celdas.forEach(celda => {
      if (celda.getColumn() !== 11) return;
      const row = celda.getRow();
      const estado = String(hojaCtrl.getRange(row, 10).getValue() || "").trim().toUpperCase();
      if (estado === "EN ANÁLISIS") resumen.enAnalisis++;
      else if (estado.includes("PENDIENTE PAZ")) resumen.pendientePS++;
      else if (estado === "TERMINADO") resumen.terminados++;
    });
  }

  return resumen;
}


// ============================================================
//  GENERADOR DE EXCEL MARCADO
// ============================================================

function generarArchivoMarcado(ssId, errores) {
  const ss = SpreadsheetApp.openById(ssId);
  const hoja = ss.getSheets()[0];
  const ultimaCol = hoja.getLastColumn();
  
  hoja.getRange(4, ultimaCol + 1).setValue("DIAGNÓSTICO DE AUDITORÍA")
      .setFontWeight("bold").setBackground("#BD0F14").setFontColor("white");

  errores.forEach(err => {
    if (typeof err.fila === 'number') {
      hoja.getRange(err.fila, 1, 1, ultimaCol).setBackground("#fff2f2");
      
      const celdaDiagnostico = hoja.getRange(err.fila, ultimaCol + 1);
      const valorActual = celdaDiagnostico.getValue();
      const nuevoMensaje = `[${err.campo}] ${err.motivo}`;
      
      const valorFinal = valorActual ? valorActual + " | " + nuevoMensaje : nuevoMensaje;
      celdaDiagnostico.setValue(valorFinal).setFontColor("#BD0F14");
    }
  });

  SpreadsheetApp.flush();

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