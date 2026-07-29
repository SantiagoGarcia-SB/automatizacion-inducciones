/**
 * ============================================================
 * AnalisisRepo — Acceso a datos de "registro analisis"
 *
 * Lee solo las columnas necesarias para el listado.
 * La hoja puede tener ~100 columnas — nunca leer todo si no es
 * necesario.
 * ============================================================
 */

/**
 * Retorna un resumen de solicitudes en registro analisis.
 * OPTIMIZADO: Lee columnas individualmente en vez de un rango amplio.
 * @param {number} desde - Offset desde el final (0 = las más recientes)
 * @param {number} cantidad - Cuántas filas leer
 * @returns {{datos:Array, total:number, cargadas:number}}
 */
function obtenerSolicitudesResumen(desde, cantidad) {
  var hoja = SpreadsheetApp.openById(getArchivoAnalisisId()).getSheetByName('registro analisis');
  if (!hoja || hoja.getLastRow() < 2) return { datos: [], total: 0, cargadas: 0 };

  var ultimaFila = hoja.getLastRow();
  var totalFilas = ultimaFila - 1;
  var ultimaCol = hoja.getLastColumn();

  // Calcular rango (más recientes primero)
  var filaFin = ultimaFila - desde;
  var filaInicio = Math.max(2, filaFin - cantidad + 1);
  var filasALeer = filaFin - filaInicio + 1;

  if (filasALeer <= 0) return { datos: [], total: totalFilas, cargadas: 0 };

  // 1. Leer headers
  var headers = hoja.getRange(1, 1, 1, ultimaCol).getValues()[0];

  // 2. Mapear columnas necesarias
  var colMap = {};
  var nombresDeseados = [
    'codigo lote', 'Poliza', 'Destino', 'ciudad del inmueble',
    'Arrendatario', 'Id_arrendatario', 'Canon', 'Solicitud Inquilino',
    'REGISTRO ANALISTA SAI', 'RESULTADO SOLICITUD'
  ];

  for (var h = 0; h < headers.length; h++) {
    var hdr = String(headers[h]).trim();
    if (nombresDeseados.indexOf(hdr) !== -1) colMap[hdr] = h + 1; // 1-based para getRange
    if (hdr === 'ASIGNADA A\u2026' || hdr === 'ASIGNADA A...' || hdr === 'ASIGNADA A') colMap['_ASIGNADA'] = h + 1;
  }

  // 3. Leer CADA columna individualmente (rápido: N lecturas de 1 col × 500 filas)
  var columnas = {};
  for (var key in colMap) {
    columnas[key] = hoja.getRange(filaInicio, colMap[key], filasALeer, 1).getValues();
  }

  // 4. Armar resultado (más recientes primero = invertir)
  var resultado = [];
  for (var i = filasALeer - 1; i >= 0; i--) {
    var arrendatario = columnas['Arrendatario'] ? String(columnas['Arrendatario'][i][0] || '').trim() : '';
    if (!arrendatario) continue;

    var asignadaA = columnas['_ASIGNADA'] ? String(columnas['_ASIGNADA'][i][0] || '').trim() : '';
    var registroSAI = columnas['REGISTRO ANALISTA SAI'] ? String(columnas['REGISTRO ANALISTA SAI'][i][0] || '').trim() : '';
    var resultadoSol = columnas['RESULTADO SOLICITUD'] ? String(columnas['RESULTADO SOLICITUD'][i][0] || '').trim() : '';

    var estado = 'PENDIENTE';
    if (registroSAI) estado = 'EVALUADA';
    else if (asignadaA) estado = 'EN EVALUACIÓN';

    resultado.push({
      fila: filaInicio + i,
      codigoLote: columnas['codigo lote'] ? String(columnas['codigo lote'][i][0] || '') : '',
      poliza: columnas['Poliza'] ? String(columnas['Poliza'][i][0] || '') : '',
      destino: columnas['Destino'] ? String(columnas['Destino'][i][0] || '') : '',
      ciudad: columnas['ciudad del inmueble'] ? String(columnas['ciudad del inmueble'][i][0] || '') : '',
      arrendatario: arrendatario,
      identificacion: columnas['Id_arrendatario'] ? String(columnas['Id_arrendatario'][i][0] || '') : '',
      canon: columnas['Canon'] ? String(columnas['Canon'][i][0] || '') : '',
      solicitudInquilino: columnas['Solicitud Inquilino'] ? String(columnas['Solicitud Inquilino'][i][0] || '') : '',
      asignadaA: asignadaA,
      resultadoSolicitud: resultadoSol,
      estado: estado
    });
  }

  return { datos: resultado, total: totalFilas, cargadas: resultado.length };
}

function _formatearFechaRepo(valor) {
  if (!valor) return '';
  if (valor instanceof Date) {
    return Utilities.formatDate(valor, 'GMT-5', 'd/MM/yyyy');
  }
  return String(valor);
}

/**
 * Lee una fila de registro analisis para el formulario de evaluación.
 * OPTIMIZADO: Cachea headers + lee solo las columnas necesarias.
 * @param {number} filaNum - Número de fila (1-based)
 * @returns {Object} Datos organizados por sección
 */
function obtenerDetalleSolicitud(filaNum) {
  var hoja = SpreadsheetApp.openById(getArchivoAnalisisId()).getSheetByName('registro analisis');
  if (!hoja) return null;

  // Headers cacheados (5 min)
  var cache = CacheService.getScriptCache();
  var headersCached = cache.get('HDR_REG_ANALISIS');
  var headers;
  if (headersCached) {
    headers = JSON.parse(headersCached);
  } else {
    headers = hoja.getRange(1, 1, 1, hoja.getLastColumn()).getValues()[0];
    // Cachear como array de strings
    var headersStr = headers.map(function(h) { return String(h || '').trim(); });
    cache.put('HDR_REG_ANALISIS', JSON.stringify(headersStr), 300);
    headers = headersStr;
  }

  // Definir las columnas que necesitamos (no todas las 100+)
  var camposNecesarios = [
    'Fecha Lote', 'tipo negociacion', 'Poliza', 'inmobiliaria', 'sucursal',
    'Destino', 'ciudad del inmueble', 'Direccion', 'Fecha inicio de contrato',
    'Amparo integral', 'Tasa Negociación', 'Canon', 'Administracion', 'Iva', 'valor a asegurar',
    'Arrendatario', 'TD_INQ', 'Id_arrendatario', 'TEL_INQ', 'CORREO_INQ', 'Solicitud Inquilino',
    'Ingresos', 'Acierta', 'ocupacion', 'Respuesta modelo inquilino', 'Regla Dura Inquilino',
    'Resultado Final Inquilino',
    'COA1', 'TD_COA1', 'Id_COA1', 'TEL_COA1', 'CORREO_COA1',
    'Ingresos COA1', 'Acierta COA1', 'Ocupacion COA1', 'ocupacion COA1', 'Respuesta modelo COA1', 'Regla Dura COA1', 'Resultado Final COA1',
    'COA2', 'TD_COA2', 'Id_COA2', 'TEL_COA2', 'CORREO_COA2',
    'Ingresos COA2', 'Acierta COA2', 'Ocupacion COA2', 'ocupacion COA2', 'Respuesta modelo COA2', 'Regla Dura COA2', 'Resultado Final COA2',
    'COA3', 'TD_COA3', 'Id_COA3', 'TEL_COA3', 'CORREO_COA3',
    'Ingresos COA3', 'Acierta COA3', 'Ocupacion COA3', 'ocupacion COA3', 'Respuesta modelo COA3', 'Regla Dura COA3', 'Resultado Final COA3',
    'COA4', 'TD_COA4', 'Id_COA4', 'TEL_COA4', 'CORREO_COA4',
    'Ingresos COA4', 'Acierta COA4', 'Ocupacion COA4', 'ocupacion COA4', 'Respuesta modelo COA4', 'Regla Dura COA4', 'Resultado Final COA4',
    'COA5', 'TD_COA5', 'Id_COA5', 'TEL_COA5', 'CORREO_COA5',
    'Ingresos COA5', 'Acierta COA5', 'Ocupacion COA5', 'ocupacion COA5', 'Respuesta modelo COA5', 'Regla Dura COA5', 'Resultado Final COA5',
    'Num coa aprob', 'Num coa negados analisis', 'coa evaluados',
    'RESULTADO SOLICITUD', 'RESULTADO SOLICITUD LNeg', 'DETALLE RESULTADO SOLICITUD',
    'RESULTADO LOTE', 'contrato_de', 'comentarios del analista', 'DETALLE RESULTADO COMERCIAL',
    'REGISTRO ANALISTA SAI', 'Fecha Evaluacion', 'codigo lote'
  ];

  // Mapear nombres → índices de columna
  var colIndices = [];
  var colNames = [];
  for (var c = 0; c < camposNecesarios.length; c++) {
    var idx = headers.indexOf(camposNecesarios[c]);
    if (idx !== -1) {
      colIndices.push(idx + 1); // 1-based
      colNames.push(camposNecesarios[c]);
    }
  }
  // También buscar ASIGNADA A con variantes
  for (var a = 0; a < headers.length; a++) {
    if (headers[a] === 'ASIGNADA A\u2026' || headers[a] === 'ASIGNADA A...' || headers[a] === 'ASIGNADA A') {
      colIndices.push(a + 1);
      colNames.push('_ASIGNADA');
      break;
    }
  }

  // Leer la fila COMPLETA de una vez (es más rápido que 70 lecturas individuales)
  // Pero con headers ya cacheados (ahorra 1 lectura)
  var fila = hoja.getRange(filaNum, 1, 1, headers.length).getValues()[0];

  // Mapear solo los campos necesarios
  var datos = {};
  for (var r = 0; r < colNames.length; r++) {
    var idx = colIndices[r] - 1; // 0-based para el array
    var val = fila[idx];
    if (val instanceof Date) {
      datos[colNames[r]] = Utilities.formatDate(val, 'GMT-5', 'd/MM/yyyy');
    } else {
      datos[colNames[r]] = val !== null && val !== undefined ? String(val) : '';
    }
  }

  // Organizar por secciones para el frontend
  return {
    inmueble: {
      fechaLote: datos['Fecha Lote'] || '',
      tipoNegociacion: datos['tipo negociacion'] || '',
      poliza: datos['Poliza'] || '',
      inmobiliaria: datos['inmobiliaria'] || '',
      sucursal: datos['sucursal'] || '',
      destino: datos['Destino'] || '',
      ciudad: datos['ciudad del inmueble'] || '',
      direccion: datos['Direccion'] || '',
      fechaInicio: datos['Fecha inicio de contrato'] || '',
      amparo: datos['Amparo integral'] || '',
      tasa: datos['Tasa Negociación'] || '',
      canon: datos['Canon'] || '',
      administracion: datos['Administracion'] || '',
      iva: datos['Iva'] || '',
      valorAsegurar: datos['valor a asegurar'] || ''
    },
    inquilino: {
      nombre: datos['Arrendatario'] || '',
      tipoDoc: datos['TD_INQ'] || '',
      identificacion: datos['Id_arrendatario'] || '',
      telefono: datos['TEL_INQ'] || '',
      correo: datos['CORREO_INQ'] || '',
      solicitud: datos['Solicitud Inquilino'] || '',
      ingresos: datos['Ingresos'] || '',
      acierta: datos['Acierta'] || '',
      ocupacion: datos['ocupacion'] || '',
      respuestaModelo: datos['Respuesta modelo inquilino'] || '',
      reglaDura: datos['Regla Dura Inquilino'] || '',
      resultadoFinal: datos['Resultado Final Inquilino'] || ''
    },
    codeudores: _extraerCodeudores(datos),
    resultado: {
      numCoaAprob: datos['Num coa aprob'] || '',
      numCoaNeg: datos['Num coa negados analisis'] || '',
      coaEvaluados: datos['coa evaluados'] || '',
      politicaIngresos: datos['Pol\u00edtica ingresos solicitud'] || datos['Politica ingresos solicitud'] || '',
      resultadoSolicitud: datos['RESULTADO SOLICITUD'] || '',
      resultadoSolicitudLNeg: datos['RESULTADO SOLICITUD LNeg'] || '',
      detalleResultado: datos['DETALLE RESULTADO SOLICITUD'] || '',
      resultadoLote: datos['RESULTADO LOTE'] || '',
      contratoDe: datos['contrato_de'] || '',
      comentarios: datos['comentarios del analista'] || '',
      detalleComercial: datos['DETALLE RESULTADO COMERCIAL'] || '',
      registroSAI: datos['REGISTRO ANALISTA SAI'] || '',
      fechaEvaluacion: _formatearFechaRepo(datos['Fecha Evaluacion'] || '')
    },
    asignacion: {
      asignadaA: datos['ASIGNADA A\u2026'] || datos['ASIGNADA A...'] || datos['ASIGNADA A'] || ''
    }
  };
}

function _extraerCodeudores(datos) {
  var coas = [];
  for (var n = 1; n <= 5; n++) {
    var nombre = datos['COA' + n] || '';
    if (!nombre) continue;
    coas.push({
      numero: n,
      nombre: nombre,
      tipoDoc: datos['TD_COA' + n] || '',
      identificacion: datos['Id_COA' + n] || '',
      telefono: datos['TEL_COA' + n] || '',
      correo: datos['CORREO_COA' + n] || '',
      ingresos: datos['Ingresos COA' + n] || '',
      acierta: datos['Acierta COA' + n] || '',
      ocupacion: datos['Ocupacion COA' + n] || datos['ocupacion COA' + n] || '',
      respuestaModelo: datos['Respuesta modelo COA' + n] || '',
      reglaDura: datos['Regla Dura COA' + n] || '',
      resultadoFinal: datos['Resultado Final COA' + n] || ''
    });
  }
  return coas;
}
