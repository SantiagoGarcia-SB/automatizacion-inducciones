/**
 * ============================================================
 * ControlGeneralRepo — Acceso a datos de Control_General
 *
 * Solo lectura por ahora. Usa CacheService para operaciones
 * frecuentes y batch getValues() siempre.
 * ============================================================
 */

/**
 * Normaliza un valor de la columna Estado (col J de Control_General) antes de
 * clasificarlo o compararlo. En el Excel, "Envío formato LMI" / "Envío carta LMI"
 * se escriben literalmente como "ENVIO FORMATO L.M.I." / "ENVIO CARTA L.M.I."
 * (con puntos entre cada letra) — sin quitar los puntos, ningún indexOf('FORMATO LMI')
 * los detecta nunca. Mayúsculas + sin puntos es el formato canónico que usan
 * todas las comparaciones de estado en este archivo y en el frontend.
 * @param {*} valor
 * @returns {string}
 */
function _normalizarEstado(valor) {
  return String(valor || '').replace(/\./g, '').trim().toUpperCase();
}

/**
 * Obtiene el resumen de KPIs.
 * Si emailComercial es null → métricas globales (todos).
 * Si tiene valor → solo las de ese comercial.
 * @param {string|null} emailComercial
 * @returns {{radicados:number, enAnalisis:number, pendientePS:number, errorTerceros:number, terminados:number}}
 */
function obtenerResumenComercial(emailComercial) {
  var hoja = SpreadsheetRegistry_get(getHojaControlId()).getSheetByName('Control_General');
  if (!hoja || hoja.getLastRow() < 2) return _resumenVacio();

  var ultimaFila = hoja.getLastRow();
  // Leer columnas: A(1)=ID Lote, C(3)=Fecha, J(10)=Estado, K(11)=Comercial, Q(17)=Póliza
  // MEDICIÓN TEMPORAL (01/08/2026): ver Logs_Sistema para histórico de duración
  // real conforme crece Control_General.
  var _t0Resumen = Date.now();
  var datos = hoja.getRange(2, 1, ultimaFila - 1, 17).getValues();
  _registrarEvento_("INFO", "Repositorios_ControlGeneralRepo.js", "Lectura obtenerResumenComercial",
    "Filas: " + (ultimaFila - 1) + " | Duración: " + (Date.now() - _t0Resumen) + "ms");

  // Soporta: null (sin filtro), string (un email), string[] (múltiples emails)
  var nombres = _resolverNombresFiltro(emailComercial);

  var resumen = {
    inducciones: 0, pendienteRadicar: 0, radicado: 0, pendienteAsignar: 0,
    enAnalisis: 0, envioFormatoLMI: 0, envioCartaLMI: 0,
    errorTerceros: 0, pendientePS: 0, terminados: 0
  };
  var lotes = {};
  var polizas = {};
  var hace7dias = new Date(new Date().getTime() - 7 * 24 * 60 * 60 * 1000);
  var lotesRecientes = {};

  for (var i = 0; i < datos.length; i++) {
    if (nombres) {
      var comercial = String(datos[i][10] || '').trim().toUpperCase();
      if (nombres.indexOf(comercial) === -1) continue;
    }

    resumen.inducciones++;
    var estado = _normalizarEstado(datos[i][9]);
    var idLote = String(datos[i][0] || '').trim();
    var poliza = String(datos[i][16] || '').trim();

    if (estado === 'PENDIENTE RADICAR') resumen.pendienteRadicar++;
    else if (estado === 'RADICADO') resumen.radicado++;
    else if (estado === 'PENDIENTE ASIGNAR') resumen.pendienteAsignar++;
    else if (estado.indexOf('ANÁLISIS') !== -1) resumen.enAnalisis++;
    else if (estado.indexOf('FORMATO LMI') !== -1) resumen.envioFormatoLMI++;
    else if (estado.indexOf('CARTA LMI') !== -1) resumen.envioCartaLMI++;
    else if (estado.indexOf('ERROR') !== -1) resumen.errorTerceros++;
    else if (estado.indexOf('PAZ Y SALVO') !== -1) resumen.pendientePS++;
    else if (estado === 'TERMINADO') resumen.terminados++;

    if (idLote) lotes[idLote] = true;
    if (poliza) polizas[poliza] = true;

    var fecha = datos[i][2];
    if (fecha instanceof Date && fecha > hace7dias && idLote) {
      lotesRecientes[idLote] = true;
    }
  }

  resumen.totalLotes = Object.keys(lotes).length;
  resumen.totalPolizas = Object.keys(polizas).length;
  resumen.radicadosSemana = Object.keys(lotesRecientes).length;
  return resumen;
}

/**
 * Genera el nombre del comercial en el formato exacto que se guarda en Control_General.
 * Usa la función canónica emailANombre con formato MAYUSCULAS.
 * @param {string} email
 * @returns {string} Nombre en MAYÚSCULAS
 */
function _nombreComercialParaBusqueda(email) {
  return emailANombre(email, 'MAYUSCULAS');
}

/**
 * Resuelve el parámetro de filtro de emails a un array de nombres para comparación.
 * Soporta: null (sin filtro), string (un email), string[] (múltiples emails).
 * @param {string|string[]|null} emailComercial - Email(s) del comercial o null
 * @returns {string[]|null} Array de nombres en MAYÚSCULAS para filtrar, o null si sin filtro
 */
function _resolverNombresFiltro(emailComercial) {
  if (emailComercial === null || emailComercial === undefined) return null;
  if (typeof emailComercial === 'string') {
    var nombre = emailANombre(emailComercial, 'MAYUSCULAS');
    return nombre ? [nombre] : null;
  }
  if (Array.isArray(emailComercial)) {
    var nombres = [];
    for (var i = 0; i < emailComercial.length; i++) {
      var n = emailANombre(emailComercial[i], 'MAYUSCULAS');
      if (n && nombres.indexOf(n) === -1) nombres.push(n);
    }
    return nombres.length > 0 ? nombres : null;
  }
  return null;
}

/**
 * Retorna TODAS las solicitudes individuales (filas de Control_General) del
 * equipo visible, con su ID de lote — en una sola lectura de Sheets. El filtro
 * por estado (para las tarjetas del Dashboard) se aplica en el frontend sobre
 * este mismo resultado cacheado, para no releer/reescanear la hoja en cada clic.
 * @param {string|string[]|null} emailComercial - null = sin filtro (ADMIN/ASESOR)
 * @returns {Array<{idLote, fecha, comercial, arrendatario, tipoDoc, identificacion, destino, ciudad, estado}>}
 */
function obtenerTodasLasSolicitudes(emailComercial) {
  var hoja = SpreadsheetRegistry_get(getHojaControlId()).getSheetByName('Control_General');
  if (!hoja || hoja.getLastRow() < 2) return [];

  var ultimaFila = hoja.getLastRow();
  var datos = hoja.getRange(2, 1, ultimaFila - 1, 26).getValues();
  var nombres = _resolverNombresFiltro(emailComercial);

  var resultado = [];
  for (var i = 0; i < datos.length; i++) {
    if (nombres) {
      var comercial = String(datos[i][10] || '').trim().toUpperCase();
      if (nombres.indexOf(comercial) === -1) continue;
    }

    var fechaStr = '';
    if (datos[i][2] instanceof Date) {
      fechaStr = Utilities.formatDate(datos[i][2], 'GMT-5', 'd/MM/yyyy HH:mm');
    }

    resultado.push({
      idLote: String(datos[i][0] || ''),
      fecha: fechaStr,
      comercial: String(datos[i][10] || ''),
      arrendatario: String(datos[i][23] || ''),
      tipoDoc: String(datos[i][24] || ''),
      identificacion: String(datos[i][25] || ''),
      destino: String(datos[i][17] || ''),
      ciudad: String(datos[i][18] || ''),
      estado: _normalizarEstado(datos[i][9])
    });
  }
  return resultado;
}

function _resumenVacio() {
  return {
    inducciones: 0, pendienteRadicar: 0, radicado: 0, pendienteAsignar: 0,
    enAnalisis: 0, envioFormatoLMI: 0, envioCartaLMI: 0,
    errorTerceros: 0, pendientePS: 0, terminados: 0,
    totalLotes: 0, totalPolizas: 0, radicadosSemana: 0
  };
}

/**
 * Obtiene los últimos lotes de un comercial (paginado, más recientes primero).
 * Si emailComercial es null → retorna TODOS los lotes (para líderes/admins).
 * @param {string|null} emailComercial - Email del comercial (null = todos)
 * @param {number} pagina - Página actual (1-based)
 * @param {number} porPagina - Registros por página
 * @param {string} [filtroEstado] - Filtro por estado
 * @param {string} [busquedaId] - Búsqueda por ID de lote
 * @param {string|Date|null} [fechaDesde] - Fecha inicio para filtrado histórico (opcional)
 * @param {string|Date|null} [fechaHasta] - Fecha fin para filtrado histórico (opcional)
 * @returns {{datos:Array, total:number, pagina:number, totalPaginas:number}}
 */
function obtenerLotesDeComercial(emailComercial, pagina, porPagina, filtroEstado, busquedaId, fechaDesde, fechaHasta) {
  pagina = pagina || 1;
  porPagina = porPagina || 10;
  filtroEstado = (filtroEstado || '').toUpperCase().trim();
  busquedaId = (busquedaId || '').trim().toUpperCase();

  var hoja = SpreadsheetRegistry_get(getHojaControlId()).getSheetByName('Control_General');
  if (!hoja || hoja.getLastRow() < 2) {
    return { datos: [], total: 0, pagina: 1, totalPaginas: 0 };
  }

  var ultimaFila = hoja.getLastRow();
  var VENTANA_LECTURA = 2000;
  var filasDisponibles = ultimaFila - 1; // filas de datos (excluye header)

  // Si se especifican filtros de fecha, leer TODAS las filas (búsqueda histórica)
  // De lo contrario, usar la ventana de 2000 filas más recientes.
  //
  // LIMITACIÓN CONOCIDA (sin resolver a propósito, ver auditoría de latencia
  // 01/08/2026): esta lectura crece sin límite junto con Control_General. No
  // se le puso un tope arbitrario (ej. "máximo N filas") porque eso cortaría
  // resultados históricos reales de forma silenciosa — peor que ser lento.
  // Una solución real requiere decidir arquitectura (ej. índice por fecha, o
  // archivar filas viejas a otra hoja), no un ajuste de una función. Repetir
  // este mismo aviso si esta hoja empieza a acercarse a filas de 5 dígitos.
  var filasALeer;
  var filaInicio;
  if (fechaDesde || fechaHasta) {
    filasALeer = filasDisponibles;
    filaInicio = 2;
  } else {
    filasALeer = Math.min(filasDisponibles, VENTANA_LECTURA);
    filaInicio = ultimaFila - filasALeer + 1; // fila de inicio (1-based, después del header)
  }

  // Leer columnas relevantes: A-X (1-24)
  var datos = hoja.getRange(filaInicio, 1, filasALeer, 24).getValues();

  // Col 57 (BA) = SUCURSAL — leer aparte porque está fuera de las primeras 24 cols
  var colSucursal = 56; // 0-indexed
  var datosSucursal = null;
  try {
    datosSucursal = hoja.getRange(filaInicio, 57, filasALeer, 1).getValues();
  } catch (e) { /* si falla, continuar sin sucursal */ }

  // Soporta: null (sin filtro), string (un email), string[] (múltiples emails)
  var nombres = _resolverNombresFiltro(emailComercial);

  // Agrupar por lote (más recientes primero)
  var lotesMap = {};
  var ordenLotes = [];

  for (var i = datos.length - 1; i >= 0; i--) {
    // Si hay filtro por comercial, aplicar
    if (nombres) {
      var comercial = String(datos[i][10] || '').trim().toUpperCase();
      if (nombres.indexOf(comercial) === -1) continue;
    }

    var idLote = String(datos[i][0] || '').trim();
    if (!idLote) continue;

    if (!lotesMap[idLote]) {
      // Obtener sucursal de la columna leída aparte
      var sucursalVal = '';
      if (datosSucursal) {
        sucursalVal = String(datosSucursal[i][0] || '').trim();
      }

      lotesMap[idLote] = {
        idLote: idLote,
        fecha: datos[i][2],
        comercial: String(datos[i][10] || '').trim(),
        sucursal: sucursalVal,
        contratos: 0,
        estados: {}
      };
      ordenLotes.push(idLote);
    }

    lotesMap[idLote].contratos++;
    var estado = _normalizarEstado(datos[i][9]);
    if (estado) {
      lotesMap[idLote].estados[estado] = (lotesMap[idLote].estados[estado] || 0) + 1;
    }
  }

  // Filtrar por estado si hay filtro activo
  if (filtroEstado) {
    var lotesFiltrados = [];
    for (var k = 0; k < ordenLotes.length; k++) {
      var loteCheck = lotesMap[ordenLotes[k]];
      if (loteCheck.estados[filtroEstado]) {
        lotesFiltrados.push(ordenLotes[k]);
      }
    }
    ordenLotes = lotesFiltrados;
  }

  // Filtrar por búsqueda de ID
  if (busquedaId) {
    var lotesBusqueda = [];
    for (var b = 0; b < ordenLotes.length; b++) {
      if (ordenLotes[b].toUpperCase().indexOf(busquedaId) !== -1) {
        lotesBusqueda.push(ordenLotes[b]);
      }
    }
    ordenLotes = lotesBusqueda;
  }

  // Filtrar por rango de fechas (para búsqueda de datos históricos)
  if (fechaDesde || fechaHasta) {
    var desde = fechaDesde ? new Date(fechaDesde) : null;
    var hasta = fechaHasta ? new Date(fechaHasta) : null;
    // Normalizar "hasta" al final del día si solo se proporcionó una fecha sin hora
    if (hasta && hasta.getHours() === 0 && hasta.getMinutes() === 0 && hasta.getSeconds() === 0) {
      hasta = new Date(hasta.getTime() + 24 * 60 * 60 * 1000 - 1);
    }

    var lotesFecha = [];
    for (var f = 0; f < ordenLotes.length; f++) {
      var loteParaFecha = lotesMap[ordenLotes[f]];
      var fechaLote = loteParaFecha.fecha;
      if (!(fechaLote instanceof Date)) {
        fechaLote = new Date(fechaLote);
      }
      if (isNaN(fechaLote.getTime())) continue; // Omitir fechas inválidas
      if (desde && fechaLote < desde) continue;
      if (hasta && fechaLote > hasta) continue;
      lotesFecha.push(ordenLotes[f]);
    }
    ordenLotes = lotesFecha;
  }

  // Paginar
  var total = ordenLotes.length;
  var totalPaginas = Math.ceil(total / porPagina);
  var inicio = (pagina - 1) * porPagina;
  var lotesPagina = ordenLotes.slice(inicio, inicio + porPagina);

  var resultado = [];
  for (var j = 0; j < lotesPagina.length; j++) {
    var lote = lotesMap[lotesPagina[j]];
    var fechaStr = '';
    if (lote.fecha instanceof Date) {
      fechaStr = Utilities.formatDate(lote.fecha, 'GMT-5', 'd/MM/yyyy HH:mm');
    }
    resultado.push({
      idLote: lote.idLote,
      fecha: fechaStr,
      comercial: lote.comercial,
      sucursal: lote.sucursal || '',
      contratos: lote.contratos,
      estados: lote.estados,
      estadoPrincipal: _obtenerEstadoPrincipal(lote.estados)
    });
  }

  return { datos: resultado, total: total, pagina: pagina, totalPaginas: totalPaginas };
}

/**
 * Obtiene los lotes de un comercial en estado PENDIENTE PAZ Y SALVO, con los
 * días de espera calculados igual que enviarRecordatoriosPazYSalvoDiario
 * (columna BI = fecha de último aviso, o fecha de ingreso si nunca se avisó).
 * Usada por el reporte de cierre de mes ("esto necesita tu acción").
 * @param {string} nombreComercial - Nombre tal como aparece en Control_General (mayúsculas)
 * @returns {Array<{idLote:string, dias:number}>}
 */
function obtenerLotesPendientesPazYSalvo(nombreComercial) {
  var hoja = SpreadsheetRegistry_get(getHojaControlId()).getSheetByName('Control_General');
  if (!hoja || hoja.getLastRow() < 2) return [];

  var ultimaFila = hoja.getLastRow();
  var datos = hoja.getRange(2, 1, ultimaFila - 1, 61).getValues(); // hasta col BI (61) = índice 60

  var hoy = new Date();
  hoy.setHours(0, 0, 0, 0);
  var lotesMap = {};

  for (var i = 0; i < datos.length; i++) {
    var comercial = String(datos[i][10] || '').trim().toUpperCase();
    if (comercial !== nombreComercial) continue;

    var estado = _normalizarEstado(datos[i][9]);
    if (estado !== 'PENDIENTE PAZ Y SALVO') continue;

    var idLote = String(datos[i][0] || '').trim();
    if (!idLote || lotesMap[idLote]) continue;

    var fIngreso = datos[i][2];
    var fAviso = datos[i][60];
    var fechaRef = (fAviso instanceof Date && !isNaN(fAviso)) ? fAviso : fIngreso;
    if (!(fechaRef instanceof Date) || isNaN(fechaRef.getTime())) continue;

    var refNormalizada = new Date(fechaRef);
    refNormalizada.setHours(0, 0, 0, 0);
    var dias = Math.floor((hoy.getTime() - refNormalizada.getTime()) / (1000 * 60 * 60 * 24));

    lotesMap[idLote] = { idLote: idLote, dias: dias };
  }

  return Object.values(lotesMap);
}

/**
 * Determina el estado "principal" de un lote (para mostrar un badge resumen).
 */
function _obtenerEstadoPrincipal(estados) {
  if (estados['ERROR EN TERCEROS']) return 'ERROR EN TERCEROS';
  if (estados['PENDIENTE PAZ Y SALVO']) return 'PENDIENTE PAZ Y SALVO';
  if (estados['EN ANÁLISIS']) return 'EN ANÁLISIS';
  if (estados['PENDIENTE ASIGNAR']) return 'PENDIENTE ASIGNAR';
  if (estados['PENDIENTE RADICAR']) return 'PENDIENTE RADICAR';
  if (estados['RADICADO']) return 'RADICADO';
  if (estados['TERMINADO']) return 'TERMINADO';
  return 'SIN ESTADO';
}

/**
 * Obtiene el detalle completo de un lote: datos generales + solicitudes.
 * Usa MemoCache_getIndiceLote() para búsqueda en memoria en vez de TextFinder.
 * Reutiliza datos ya cargados si obtenerLotesDeComercial() los leyó previamente.
 *
 * @param {string} idLote - ID del lote
 * @returns {{lote:Object, solicitudes:Array}}
 * @sheets_read 0-1 (0 si índice ya existe en memoria, 1 si necesita leer Control_General)
 */
function obtenerDetalleLote(idLote) {
  if (!idLote || typeof idLote !== 'string') return { lote: null, solicitudes: [] };
  idLote = idLote.trim();
  if (!idLote) return { lote: null, solicitudes: [] };

  var ss = SpreadsheetRegistry_get(getHojaControlId());
  var hoja = ss.getSheetByName('Control_General');
  if (!hoja || hoja.getLastRow() < 2) return { lote: null, solicitudes: [] };

  // Intentar obtener el índice loteId ya construido en esta ejecución
  var indiceLote = MemoCache_getIndiceLote(null);

  // Si el índice no existe (primera llamada sin datos previos), leer Control_General y construirlo
  if (!indiceLote || Object.keys(indiceLote).length === 0) {
    var ultimaFila = hoja.getLastRow();
    var datosControlGeneral = hoja.getRange(1, 1, ultimaFila, 62).getValues();
    indiceLote = MemoCache_getIndiceLote(datosControlGeneral);
  }

  // Buscar filas del lote en el índice
  var filasDelLote = indiceLote[idLote];
  if (!filasDelLote || filasDelLote.length === 0) return { lote: null, solicitudes: [] };

  // Leer datos de las filas encontradas directamente por número de fila
  var solicitudes = [];
  var loteInfo = null;

  for (var j = 0; j < filasDelLote.length; j++) {
    var fila = hoja.getRange(filasDelLote[j], 1, 1, 62).getValues()[0];

    // Datos del lote (se toman de la primera fila)
    if (!loteInfo) {
      var fechaStr = '';
      if (fila[2] instanceof Date) {
        fechaStr = Utilities.formatDate(fila[2], 'GMT-5', 'd/MM/yyyy HH:mm');
      }
      loteInfo = {
        idLote: String(fila[0] || ''),
        fecha: fechaStr,
        comercial: String(fila[10] || ''),
        poliza: String(fila[16] || ''),
        tipoNegociacion: String(fila[15] || ''),
        tasaNegociacion: String(fila[11] || '')
      };
    }

    // Datos de la solicitud
    solicitudes.push({
      uuid: String(fila[61] || filasDelLote[j]),
      arrendatario: String(fila[23] || ''),
      tipoDoc: String(fila[24] || ''),
      identificacion: String(fila[25] || ''),
      celular: String(fila[26] || ''),
      correo: String(fila[27] || ''),
      destino: String(fila[17] || ''),
      ciudad: String(fila[18] || ''),
      direccion: String(fila[19] || ''),
      canon: String(fila[20] || ''),
      estado: _normalizarEstado(fila[9])
    });
  }

  return { lote: loteInfo, solicitudes: solicitudes };
}
