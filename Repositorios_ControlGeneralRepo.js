/**
 * ============================================================
 * ControlGeneralRepo — Acceso a datos de Control_General
 *
 * Solo lectura por ahora. Usa CacheService para operaciones
 * frecuentes y batch getValues() siempre.
 * ============================================================
 */

/**
 * Obtiene el resumen de KPIs.
 * Si emailComercial es null → métricas globales (todos).
 * Si tiene valor → solo las de ese comercial.
 * @param {string|null} emailComercial
 * @returns {{radicados:number, enAnalisis:number, pendientePS:number, errorTerceros:number, terminados:number}}
 */
function obtenerResumenComercial(emailComercial) {
  var hoja = SpreadsheetApp.openById(getHojaControlId()).getSheetByName('Control_General');
  if (!hoja || hoja.getLastRow() < 2) return _resumenVacio();

  var ultimaFila = hoja.getLastRow();
  // Leer columnas: A(1)=ID Lote, C(3)=Fecha, J(10)=Estado, K(11)=Comercial, Q(17)=Póliza
  var datos = hoja.getRange(2, 1, ultimaFila - 1, 17).getValues();

  var nombre = emailComercial ? _nombreComercialParaBusqueda(emailComercial) : null;

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
    if (nombre) {
      var comercial = String(datos[i][10] || '').trim().toUpperCase();
      if (comercial !== nombre) continue;
    }

    resumen.inducciones++;
    var estado = String(datos[i][9] || '').trim().toUpperCase();
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
 * Replica la lógica de: obtenerNombreCompletoDeComercial(email).toUpperCase()
 * @param {string} email
 * @returns {string} Nombre en MAYÚSCULAS
 */
function _nombreComercialParaBusqueda(email) {
  if (!email || typeof email !== 'string' || email.indexOf('@') === -1) return '';
  var partes = email.split('@')[0].split('.');
  var resultado = [];
  for (var i = 0; i < partes.length; i++) {
    var p = partes[i].trim();
    if (p.length > 0) {
      resultado.push(p.charAt(0).toUpperCase() + p.slice(1).toLowerCase());
    }
  }
  return resultado.join(' ').toUpperCase();
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

  var hoja = SpreadsheetApp.openById(getHojaControlId()).getSheetByName('Control_General');
  if (!hoja || hoja.getLastRow() < 2) {
    return { datos: [], total: 0, pagina: 1, totalPaginas: 0 };
  }

  var ultimaFila = hoja.getLastRow();
  var VENTANA_LECTURA = 2000;
  var filasDisponibles = ultimaFila - 1; // filas de datos (excluye header)

  // Si se especifican filtros de fecha, leer TODAS las filas (búsqueda histórica)
  // De lo contrario, usar la ventana de 2000 filas más recientes
  var filasALeer;
  var filaInicio;
  if (fechaDesde || fechaHasta) {
    filasALeer = filasDisponibles;
    filaInicio = 2;
  } else {
    filasALeer = Math.min(filasDisponibles, VENTANA_LECTURA);
    filaInicio = ultimaFila - filasALeer + 1; // fila de inicio (1-based, después del header)
  }

  // Leer columnas relevantes: A-K (1-11) + col 24 (arrendatario)
  var datos = hoja.getRange(filaInicio, 1, filasALeer, 24).getValues();
  var nombre = emailComercial ? _nombreComercialParaBusqueda(emailComercial) : null;

  // Agrupar por lote (más recientes primero)
  var lotesMap = {};
  var ordenLotes = [];

  for (var i = datos.length - 1; i >= 0; i--) {
    // Si hay filtro por comercial, aplicar
    if (nombre) {
      var comercial = String(datos[i][10] || '').trim().toUpperCase();
      if (comercial !== nombre) continue;
    }

    var idLote = String(datos[i][0] || '').trim();
    if (!idLote) continue;

    if (!lotesMap[idLote]) {
      lotesMap[idLote] = {
        idLote: idLote,
        fecha: datos[i][2],
        comercial: String(datos[i][10] || '').trim(),
        contratos: 0,
        estados: {}
      };
      ordenLotes.push(idLote);
    }

    lotesMap[idLote].contratos++;
    var estado = String(datos[i][9] || '').trim();
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
      contratos: lote.contratos,
      estados: lote.estados,
      estadoPrincipal: _obtenerEstadoPrincipal(lote.estados)
    });
  }

  return { datos: resultado, total: total, pagina: pagina, totalPaginas: totalPaginas };
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
 * @param {string} idLote - ID del lote
 * @returns {{lote:Object, solicitudes:Array}}
 */
function obtenerDetalleLote(idLote) {
  var hoja = SpreadsheetApp.openById(getHojaControlId()).getSheetByName('Control_General');
  if (!hoja || hoja.getLastRow() < 2) return { lote: null, solicitudes: [] };

  // Usar TextFinder para encontrar filas de este lote (rápido)
  var finder = hoja.createTextFinder(idLote).matchEntireCell(true).matchCase(false);
  var celdas = finder.findAll();

  if (celdas.length === 0) return { lote: null, solicitudes: [] };

  // Filtrar solo coincidencias en columna A (ID Lote)
  var filasDelLote = [];
  for (var i = 0; i < celdas.length; i++) {
    if (celdas[i].getColumn() === 1) {
      filasDelLote.push(celdas[i].getRow());
    }
  }

  if (filasDelLote.length === 0) return { lote: null, solicitudes: [] };

  // Leer datos de las filas encontradas (cols 1-28 para tener los datos principales)
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
      estado: String(fila[9] || '')
    });
  }

  return { lote: loteInfo, solicitudes: solicitudes };
}
