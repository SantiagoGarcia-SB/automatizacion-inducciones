/**
 * ============================================================
 * SERVICIOS_METRICASLOTES.JS — Servicio de métricas operativas de lotes
 *
 * Calcula y retorna métricas mensuales de aprobación/negación de lotes
 * y solicitudes para roles de liderazgo (DIRECTOR, GERENTE, ADMIN, LIDER).
 *
 * Datos fuente: hoja "registro analisis" del spreadsheet de análisis.
 * Columnas utilizadas: Fecha Lote, Solicitud Inquilino, codigo lote,
 *   RESULTADO LOTE, RESULTADO SOLICITUD, REGISTRO ANALISTA SAI.
 * ============================================================
 */


// ============================================================
//  SAFE-DEFAULT
// ============================================================

/**
 * Retorna el objeto safe-default para métricas de lotes.
 * Se usa cuando ocurre un error, los parámetros son inválidos,
 * o no hay datos para el periodo consultado.
 *
 * @returns {{resumen: {totalLotes:number, lotesAprobados:number, lotesNegados:number, lotesEnProceso:number, totalSolicitudes:number, solicitudesAprobadas:number, solicitudesNegadas:number, solicitudesReconsideradas:number}, detallePorLote: Array}}
 */
function _metricasLotesVacias() {
  return {
    resumen: {
      totalLotes: 0,
      lotesAprobados: 0,
      lotesNegados: 0,
      lotesEnProceso: 0,
      totalSolicitudes: 0,
      solicitudesAprobadas: 0,
      solicitudesNegadas: 0,
      solicitudesReconsideradas: 0,
      solicitudesEnProceso: 0
    },
    detallePorLote: []
  };
}


// ============================================================
//  VALIDACIÓN DE PARÁMETROS
// ============================================================

/**
 * Valida que los parámetros de rango de fechas sean correctos.
 *
 * @param {*} fechaDesde - String en formato YYYY-MM-DD
 * @param {*} fechaHasta - String en formato YYYY-MM-DD
 * @returns {{desde: Date, hasta: Date}|null} Objetos Date si válidos, null si inválidos
 */
function _validarParametrosRango(fechaDesde, fechaHasta) {
  if (typeof fechaDesde !== 'string' || typeof fechaHasta !== 'string') return null;
  if (!fechaDesde || !fechaHasta) return null;

  // Validar formato YYYY-MM-DD
  var regexFecha = /^\d{4}-\d{2}-\d{2}$/;
  if (!regexFecha.test(fechaDesde) || !regexFecha.test(fechaHasta)) return null;

  var desde = new Date(fechaDesde + 'T00:00:00');
  var hasta = new Date(fechaHasta + 'T00:00:00');

  // Validar que sean fechas válidas
  if (isNaN(desde.getTime()) || isNaN(hasta.getTime())) return null;

  // Validar que desde <= hasta
  if (desde.getTime() > hasta.getTime()) return null;

  // Validar rango máximo 6 meses (183 días)
  var diffDias = Math.ceil((hasta.getTime() - desde.getTime()) / (1000 * 60 * 60 * 24));
  if (diffDias > 183) return null;

  return { desde: desde, hasta: hasta };
}


// ============================================================
//  LECTURA DE HEADERS CON CACHÉ Y MAPEO DE COLUMNAS
// ============================================================

/** @type {string[]} Columnas requeridas para el cálculo de métricas */
var _COLUMNAS_METRICAS_LOTES = [
  'Fecha Lote',
  'Solicitud Inquilino',
  'codigo lote',
  'RESULTADO LOTE',
  'RESULTADO SOLICITUD',
  'REGISTRO ANALISTA SAI'
];

/**
 * Lee y cachea los headers de la hoja "registro analisis" para métricas de lotes.
 * Usa una clave de caché separada (HDR_METRICAS_LOTES) con TTL de 300s.
 *
 * Si CacheService no está disponible, lee directamente sin cachear.
 *
 * @returns {string[]|null} Array de headers normalizados (trim), o null si la hoja no es accesible
 */
function _obtenerHeadersMetricasLotes() {
  // Intentar leer desde caché
  try {
    var cached = CacheWrapper_getJSON('HDR_METRICAS_LOTES');
    if (cached) return cached;
  } catch (e) {
    // CacheService no disponible — continuar sin caché (degradación elegante)
  }

  // Cache miss o caché no disponible — leer de la hoja
  var hoja;
  try {
    var ss = SpreadsheetApp.openById(getArchivoAnalisisId());
    hoja = ss.getSheetByName('registro analisis');
  } catch (e) {
    _registrarEvento_('ERROR', 'Servicios_MetricasLotes.js', '_obtenerHeadersMetricasLotes', 'No se pudo abrir archivo de análisis: ' + e.message);
    return null;
  }

  if (!hoja) {
    _registrarEvento_('ERROR', 'Servicios_MetricasLotes.js', '_obtenerHeadersMetricasLotes', 'Hoja "registro analisis" no encontrada');
    return null;
  }

  var headers = hoja.getRange(1, 1, 1, hoja.getLastColumn()).getValues()[0].map(function(h) {
    return String(h || '').trim();
  });

  // Almacenar en caché con TTL 300s
  try {
    CacheWrapper_putJSON('HDR_METRICAS_LOTES', headers, 300);
  } catch (e) {
    // Si falla el put, continuar sin cachear (degradación elegante)
  }

  return headers;
}

/**
 * Mapea las columnas requeridas para métricas a sus índices en el array de headers.
 * Si alguna columna requerida no se encuentra, registra un ERROR y retorna null.
 *
 * @param {string[]} headers - Array de headers de la hoja
 * @returns {{fechaLote:number, solicitudInquilino:number, codigoLote:number, resultadoLote:number, resultadoSolicitud:number, registroAnalistaSai:number}|null}
 *   Objeto con los índices de cada columna, o null si falta alguna columna requerida
 */
function _mapearColumnasMetricasLotes(headers) {
  if (!headers || !Array.isArray(headers)) return null;

  // Normalizar headers a lowercase para búsqueda case-insensitive
  var headersLower = headers.map(function(h) { return String(h || '').toLowerCase(); });

  var mapa = {
    fechaLote: headersLower.indexOf('fecha lote'),
    solicitudInquilino: headersLower.indexOf('solicitud inquilino'),
    codigoLote: headersLower.indexOf('codigo lote'),
    resultadoLote: headersLower.indexOf('resultado lote'),
    resultadoSolicitud: headersLower.indexOf('resultado solicitud'),
    registroAnalistaSai: headersLower.indexOf('registro analista sai')
  };

  // Verificar que todas las columnas requeridas fueron encontradas
  var columnasNoEncontradas = [];
  var nombresColumnas = {
    fechaLote: 'Fecha Lote',
    solicitudInquilino: 'Solicitud Inquilino',
    codigoLote: 'codigo lote',
    resultadoLote: 'RESULTADO LOTE',
    resultadoSolicitud: 'RESULTADO SOLICITUD',
    registroAnalistaSai: 'REGISTRO ANALISTA SAI'
  };

  var claves = Object.keys(mapa);
  for (var i = 0; i < claves.length; i++) {
    if (mapa[claves[i]] === -1) {
      columnasNoEncontradas.push(nombresColumnas[claves[i]]);
    }
  }

  if (columnasNoEncontradas.length > 0) {
    _registrarEvento_(
      'ERROR',
      'Servicios_MetricasLotes.js',
      'Columnas requeridas no encontradas en headers',
      'Faltantes: ' + columnasNoEncontradas.join(', ')
    );
    return null;
  }

  return mapa;
}


// ============================================================
//  FILTRADO DE FILAS POR PERIODO MENSUAL
// ============================================================

/**
 * Filtra las filas de datos por rango de fechas y normaliza los campos de texto.
 *
 * - Parsea Fecha_Lote a objeto Date; excluye filas con fecha vacía o inválida
 * - Incluye solo filas donde Fecha_Lote >= fechaDesde y Fecha_Lote <= fechaHasta
 *   (comparación sin componente horario)
 * - Normaliza todos los campos de texto con .toString().trim().toUpperCase()
 *
 * @param {any[][]} datos - Array 2D con todas las filas (incluye header en posición 0)
 * @param {{fechaLote:number, solicitudInquilino:number, codigoLote:number, resultadoLote:number, resultadoSolicitud:number, registroAnalistaSai:number}} mapa - Índices de columnas
 * @param {Date} fechaDesde - Fecha inicio del rango (sin hora)
 * @param {Date} fechaHasta - Fecha fin del rango (sin hora)
 * @returns {Array<{fechaLote:Date, solicitudInquilino:string, codigoLote:string, resultadoLote:string, resultadoSolicitud:string, registroAnalistaSai:string}>}
 *   Array de objetos normalizados correspondientes al rango solicitado
 */
function _filtrarFilasPorPeriodo(datos, mapa, fechaDesde, fechaHasta) {
  if (!datos || !Array.isArray(datos) || datos.length < 2) return [];
  if (!mapa) return [];

  var desdeTime = fechaDesde.getTime();
  var hastaTime = fechaHasta.getTime();

  var resultado = [];

  // Iterar desde fila 1 (skip headers en fila 0)
  for (var i = 1; i < datos.length; i++) {
    var fila = datos[i];

    // ── Parsear Fecha_Lote ──
    var fechaRaw = fila[mapa.fechaLote];

    // Excluir filas con fecha vacía
    if (fechaRaw === null || fechaRaw === undefined || fechaRaw === '') continue;

    var fechaLote;
    if (fechaRaw instanceof Date) {
      fechaLote = new Date(fechaRaw.getTime());
    } else {
      // Intentar parsear string/número a Date
      fechaLote = new Date(fechaRaw);
    }

    // Excluir filas con fecha inválida (NaN)
    if (isNaN(fechaLote.getTime())) continue;

    // Eliminar componente horario para comparación
    fechaLote.setHours(0, 0, 0, 0);

    // ── Filtrar por rango de fechas ──
    if (fechaLote.getTime() < desdeTime) continue;
    if (fechaLote.getTime() > hastaTime) continue;

    // ── Normalizar campos de texto ──
    resultado.push({
      fechaLote: fechaLote,
      solicitudInquilino: String(fila[mapa.solicitudInquilino] || '').trim().toUpperCase(),
      codigoLote: String(fila[mapa.codigoLote] || '').trim().toUpperCase(),
      resultadoLote: String(fila[mapa.resultadoLote] || '').trim().toUpperCase(),
      resultadoSolicitud: String(fila[mapa.resultadoSolicitud] || '').trim().toUpperCase(),
      registroAnalistaSai: String(fila[mapa.registroAnalistaSai] || '').trim().toUpperCase()
    });
  }

  return resultado;
}


// ============================================================
//  CÁLCULO DE SOLICITUDES APROBADAS, NEGADAS Y RECONSIDERADAS
// ============================================================

/**
 * Calcula la cantidad de solicitudes aprobadas, negadas y reconsideradas
 * a partir de las filas filtradas por periodo.
 *
 * Reglas de clasificación (MUTUAMENTE EXCLUYENTES, evaluadas en orden de prioridad):
 *  1. Si `registroAnalistaSai` CONTIENE "RECONSIDERADO APROBADO" → reconsiderada
 *  2. Si `registroAnalistaSai` es EXACTAMENTE "APROBADO" → aprobada
 *  3. Si `registroAnalistaSai` es EXACTAMENTE "NEGADO" → negada
 *  4. Si `registroAnalistaSai` está vacío → se excluye (no cuenta en ninguna categoría)
 *
 * IMPORTANTE: "RECONSIDERADO APROBADO" se evalúa primero (contains) porque el texto
 * también contiene "APROBADO", garantizando exclusión mutua.
 *
 * @param {Array<{fechaLote:Date, solicitudInquilino:string, codigoLote:string, resultadoLote:string, resultadoSolicitud:string, registroAnalistaSai:string}>} filasFiltradas
 *   Array de objetos normalizados (salida de `_filtrarFilasPorPeriodo`). Los campos de texto
 *   ya vienen en UPPERCASE y con trim aplicado.
 * @returns {{solicitudesAprobadas: number, solicitudesNegadas: number, solicitudesReconsideradas: number}}
 */
function _calcularSolicitudesAprobNegReconsideradas(filasFiltradas) {
  if (!filasFiltradas || !Array.isArray(filasFiltradas) || filasFiltradas.length === 0) {
    return { solicitudesAprobadas: 0, solicitudesNegadas: 0, solicitudesReconsideradas: 0, solicitudesEnProceso: 0 };
  }

  var solicitudesAprobadas = 0;
  var solicitudesNegadas = 0;
  var solicitudesReconsideradas = 0;
  var solicitudesEnProceso = 0;

  for (var i = 0; i < filasFiltradas.length; i++) {
    var registro = filasFiltradas[i].registroAnalistaSai;

    // Campo vacío = en proceso
    if (!registro) {
      solicitudesEnProceso++;
      continue;
    }

    // Prioridad 1: CONTIENE "RECONSIDERADO APROBADO" → reconsiderada
    if (registro.indexOf('RECONSIDERADO APROBADO') !== -1) {
      solicitudesReconsideradas++;
    }
    // Prioridad 2: EXACTAMENTE "APROBADO" → aprobada
    else if (registro === 'APROBADO') {
      solicitudesAprobadas++;
    }
    // Prioridad 3: EXACTAMENTE "NEGADO" → negada
    else if (registro === 'NEGADO') {
      solicitudesNegadas++;
    }
    // Cualquier otro valor no vacío: no se cuenta en ninguna categoría
  }

  return {
    solicitudesAprobadas: solicitudesAprobadas,
    solicitudesNegadas: solicitudesNegadas,
    solicitudesReconsideradas: solicitudesReconsideradas,
    solicitudesEnProceso: solicitudesEnProceso
  };
}


// ============================================================
//  AGRUPACIÓN POR LOTE Y CÁLCULO DE MÉTRICAS COMBINADAS
// ============================================================

/**
 * Agrupa las filas filtradas por `codigoLote` y calcula las métricas detalladas
 * para cada lote (tabla de seguimiento).
 *
 * Para cada lote agrupado:
 * - `fechaLote`: primera fecha encontrada en el grupo
 * - `resultadoLote`: primer valor no vacío de resultadoLote encontrado
 * - `cantidadSolicitudes`: conteo de valores ÚNICOS de solicitudInquilino (incluye TODAS las filas)
 * - Métricas 3-8: solo cuentan filas donde resultadoLote, resultadoSolicitud Y registroAnalistaSai
 *   son TODOS no vacíos
 *
 * Condiciones exactas para cada métrica:
 * - solicitudesAprobadasEnLote: RESULTADO_SOLICITUD="APROBADO" AND RESULTADO_LOTE="APROBADO" AND REGISTRO_ANALISTA_SAI="APROBADO"
 * - solicitudesAprobadasIndividualNegadaPorLote: REGISTRO_ANALISTA_SAI="APROBADO" AND RESULTADO_LOTE="NEGADO" AND RESULTADO_SOLICITUD="APROBADO"
 * - solicitudesNegadasIndividualAprobadasPorLote: RESULTADO_SOLICITUD="NEGADO" AND RESULTADO_LOTE="APROBADO" AND REGISTRO_ANALISTA_SAI="APROBADO"
 * - solicitudesNegadas: RESULTADO_LOTE="NEGADO" AND RESULTADO_SOLICITUD="NEGADO" AND REGISTRO_ANALISTA_SAI="NEGADO"
 * - aprobadaPorLoteNegadaPorAnalista: RESULTADO_LOTE="APROBADO" AND REGISTRO_ANALISTA_SAI="NEGADO"
 * - negadaPorLoteReconsideradaPorGerencia: REGISTRO_ANALISTA_SAI contiene "RECONSIDERADO APROBADO"
 *
 * @param {Array<{fechaLote:Date, solicitudInquilino:string, codigoLote:string, resultadoLote:string, resultadoSolicitud:string, registroAnalistaSai:string}>} filasFiltradas
 *   Array de objetos normalizados (salida de `_filtrarFilasPorPeriodo`)
 * @returns {Array<{fechaLote:Date, codigoLote:string, resultadoLote:string, cantidadSolicitudes:number, solicitudesAprobadasEnLote:number, solicitudesAprobadasIndividualNegadaPorLote:number, solicitudesNegadasIndividualAprobadasPorLote:number, solicitudesNegadas:number, aprobadaPorLoteNegadaPorAnalista:number, negadaPorLoteReconsideradaPorGerencia:number}>}
 *   Array de DetalleLote ordenado por fechaLote descendente (más reciente primero)
 */
function _agruparPorLoteYCalcularMetricas(filasFiltradas) {
  if (!filasFiltradas || !Array.isArray(filasFiltradas) || filasFiltradas.length === 0) {
    return [];
  }

  // Estructura temporal para agrupar por codigoLote
  var grupos = {}; // { codigoLote: { filas: [], fechaLote: Date|null, resultadoLote: string } }

  for (var i = 0; i < filasFiltradas.length; i++) {
    var fila = filasFiltradas[i];
    var codigo = fila.codigoLote;

    // Omitir filas con codigoLote vacío
    if (!codigo) continue;

    if (!grupos.hasOwnProperty(codigo)) {
      grupos[codigo] = {
        filas: [],
        fechaLote: null,
        resultadoLote: ''
      };
    }

    var grupo = grupos[codigo];
    grupo.filas.push(fila);

    // Determinar fechaLote: primera fecha encontrada
    if (grupo.fechaLote === null) {
      grupo.fechaLote = fila.fechaLote;
    }

    // Determinar resultadoLote: primer valor no vacío encontrado
    if (grupo.resultadoLote === '' && fila.resultadoLote !== '') {
      grupo.resultadoLote = fila.resultadoLote;
    }
  }

  // Calcular métricas por cada lote agrupado
  var resultado = [];
  var codigos = Object.keys(grupos);

  for (var j = 0; j < codigos.length; j++) {
    var codigoLote = codigos[j];
    var grupoLote = grupos[codigoLote];
    var filasGrupo = grupoLote.filas;

    // Calcular cantidadSolicitudes: conteo de valores ÚNICOS de solicitudInquilino
    var solicitudesUnicas = {};
    for (var k = 0; k < filasGrupo.length; k++) {
      var sol = filasGrupo[k].solicitudInquilino;
      solicitudesUnicas[sol] = true;
    }
    var cantidadSolicitudes = Object.keys(solicitudesUnicas).length;

    // Métricas combinadas: solo contar filas con los 3 campos NO vacíos
    var solicitudesAprobadasEnLote = 0;
    var solicitudesAprobadasIndividualNegadaPorLote = 0;
    var solicitudesNegadasIndividualAprobadasPorLote = 0;
    var solicitudesNegadas = 0;
    var aprobadaPorLoteNegadaPorAnalista = 0;
    var negadaPorLoteReconsideradaPorGerencia = 0;
    var solicitudesEnProcesoEnLote = 0;

    for (var m = 0; m < filasGrupo.length; m++) {
      var f = filasGrupo[m];

      // Excluir de métricas 3-8 filas donde alguno de los 3 campos esté vacío
      if (!f.resultadoLote || !f.resultadoSolicitud || !f.registroAnalistaSai) {
        // Contar solicitudes en proceso (registroAnalistaSai vacío)
        if (!f.registroAnalistaSai) {
          solicitudesEnProcesoEnLote++;
        }
        continue;
      }

      // solicitudesAprobadasEnLote: RESULTADO_SOLICITUD="APROBADO" AND RESULTADO_LOTE="APROBADO" AND REGISTRO_ANALISTA_SAI="APROBADO"
      if (f.resultadoSolicitud === 'APROBADO' && f.resultadoLote === 'APROBADO' && f.registroAnalistaSai === 'APROBADO') {
        solicitudesAprobadasEnLote++;
      }

      // solicitudesAprobadasIndividualNegadaPorLote: REGISTRO_ANALISTA_SAI="APROBADO" AND RESULTADO_LOTE="NEGADO" AND RESULTADO_SOLICITUD="APROBADO"
      if (f.registroAnalistaSai === 'APROBADO' && f.resultadoLote === 'NEGADO' && f.resultadoSolicitud === 'APROBADO') {
        solicitudesAprobadasIndividualNegadaPorLote++;
      }

      // solicitudesNegadasIndividualAprobadasPorLote: RESULTADO_SOLICITUD="NEGADO" AND RESULTADO_LOTE="APROBADO" AND REGISTRO_ANALISTA_SAI="APROBADO"
      if (f.resultadoSolicitud === 'NEGADO' && f.resultadoLote === 'APROBADO' && f.registroAnalistaSai === 'APROBADO') {
        solicitudesNegadasIndividualAprobadasPorLote++;
      }

      // solicitudesNegadas: RESULTADO_LOTE="NEGADO" AND RESULTADO_SOLICITUD="NEGADO" AND REGISTRO_ANALISTA_SAI="NEGADO"
      if (f.resultadoLote === 'NEGADO' && f.resultadoSolicitud === 'NEGADO' && f.registroAnalistaSai === 'NEGADO') {
        solicitudesNegadas++;
      }

      // aprobadaPorLoteNegadaPorAnalista: RESULTADO_LOTE="APROBADO" AND REGISTRO_ANALISTA_SAI="NEGADO"
      if (f.resultadoLote === 'APROBADO' && f.registroAnalistaSai === 'NEGADO') {
        aprobadaPorLoteNegadaPorAnalista++;
      }

      // negadaPorLoteReconsideradaPorGerencia: REGISTRO_ANALISTA_SAI contiene "RECONSIDERADO APROBADO"
      if (f.registroAnalistaSai.indexOf('RECONSIDERADO APROBADO') !== -1) {
        negadaPorLoteReconsideradaPorGerencia++;
      }
    }

    resultado.push({
      fechaLote: grupoLote.fechaLote,
      codigoLote: codigoLote,
      resultadoLote: grupoLote.resultadoLote,
      cantidadSolicitudes: cantidadSolicitudes,
      solicitudesAprobadasEnLote: solicitudesAprobadasEnLote,
      solicitudesAprobadasIndividualNegadaPorLote: solicitudesAprobadasIndividualNegadaPorLote,
      solicitudesNegadasIndividualAprobadasPorLote: solicitudesNegadasIndividualAprobadasPorLote,
      solicitudesNegadas: solicitudesNegadas,
      aprobadaPorLoteNegadaPorAnalista: aprobadaPorLoteNegadaPorAnalista,
      negadaPorLoteReconsideradaPorGerencia: negadaPorLoteReconsideradaPorGerencia,
      solicitudesEnProcesoEnLote: solicitudesEnProcesoEnLote,
      solicitudes: filasGrupo.map(function(f) {
        return { numero: f.solicitudInquilino, estadoSAI: f.registroAnalistaSai };
      })
    });
  }

  // Ordenar por fechaLote descendente (más reciente primero)
  resultado.sort(function(a, b) {
    if (!a.fechaLote && !b.fechaLote) return 0;
    if (!a.fechaLote) return 1;
    if (!b.fechaLote) return -1;
    return b.fechaLote.getTime() - a.fechaLote.getTime();
  });

  return resultado;
}


// ============================================================
//  FUNCIÓN PRINCIPAL DE ORQUESTACIÓN
// ============================================================

/**
 * Calcula y retorna las métricas operativas de lotes para un rango de fechas.
 * Función principal del servicio — orquesta: validación → cache → lectura → cálculo → cache store → retorno.
 *
 * @param {string} fechaDesde - Fecha inicio en formato YYYY-MM-DD
 * @param {string} fechaHasta - Fecha fin en formato YYYY-MM-DD
 * @returns {{resumen: Object, detallePorLote: Array}}
 */
function calcularMetricasLotes(fechaDesde, fechaHasta) {
  // ── 1. Validar parámetros ──
  var rango = _validarParametrosRango(fechaDesde, fechaHasta);
  if (!rango) {
    return _metricasLotesVacias();
  }

  // ── 2. Intentar cache hit ──
  var cacheKey = 'METRICAS_LOTES_' + fechaDesde + '_' + fechaHasta;
  try {
    var cached = CacheWrapper_getJSON(cacheKey);
    if (cached) return cached;
  } catch (e) {
    // CacheService no disponible — continuar sin caché (degradación elegante)
  }

  // ── 3. Cache miss — calcular desde Sheets ──
  try {
    // 3a. Leer headers (con caché propio de 300s)
    var headers = _obtenerHeadersMetricasLotes();
    if (!headers) return _metricasLotesVacias();

    // 3b. Mapear columnas
    var mapa = _mapearColumnasMetricasLotes(headers);
    if (!mapa) return _metricasLotesVacias();

    // 3c. Leer datos completos de la hoja
    var ss = SpreadsheetApp.openById(getArchivoAnalisisId());
    var hoja = ss.getSheetByName('registro analisis');
    if (!hoja || hoja.getLastRow() < 2) return _metricasLotesVacias();

    var datos = hoja.getDataRange().getValues();

    // 3d. Filtrar filas por rango de fechas
    var filasFiltradas = _filtrarFilasPorPeriodo(datos, mapa, rango.desde, rango.hasta);

    // 3e. Calcular resumen
    var lotesCount = _calcularLotesAprobadosNegados(filasFiltradas);
    var solicitudesCount = _calcularSolicitudesAprobNegReconsideradas(filasFiltradas);

    // 3e2. Calcular total de solicitudes del periodo (todas, sin importar estado)
    var totalSolicitudes = filasFiltradas.length;

    // 3f. Calcular detalle por lote
    var detalle = _agruparPorLoteYCalcularMetricas(filasFiltradas);

    // 3g. Formatear fechas en detalle para serialización
    for (var i = 0; i < detalle.length; i++) {
      if (detalle[i].fechaLote instanceof Date) {
        detalle[i].fechaLote = Utilities.formatDate(detalle[i].fechaLote, 'GMT-5', 'd/MM/yyyy');
      } else {
        detalle[i].fechaLote = '';
      }
    }

    // 3h. Construir resultado
    var resultado = {
      resumen: {
        totalLotes: lotesCount.totalLotes,
        lotesAprobados: lotesCount.lotesAprobados,
        lotesNegados: lotesCount.lotesNegados,
        lotesEnProceso: lotesCount.lotesEnProceso,
        totalSolicitudes: totalSolicitudes,
        solicitudesAprobadas: solicitudesCount.solicitudesAprobadas,
        solicitudesNegadas: solicitudesCount.solicitudesNegadas,
        solicitudesReconsideradas: solicitudesCount.solicitudesReconsideradas,
        solicitudesEnProceso: solicitudesCount.solicitudesEnProceso
      },
      detallePorLote: detalle
    };

    // ── 4. Almacenar en caché (verificar tamaño) ──
    var payloadSize = JSON.stringify(resultado).length;

    if (payloadSize > 512000) {
      // Payload > 500KB: NO cachear, registrar WARN
      _registrarEvento_('WARN', 'Servicios_MetricasLotes.js', 'calcularMetricasLotes', 'Payload excede 500KB (' + payloadSize + ' bytes). No se cachea el resultado para rango ' + fechaDesde + ' a ' + fechaHasta);
    } else {
      // Payload <= 500KB: almacenar en caché con TTL 120s
      try {
        CacheWrapper_putJSON(cacheKey, resultado, 120);
      } catch (e) {
        // CacheService no disponible — retornar sin cachear (degradación elegante)
      }
    }

    // ── 5. Retornar resultado ──
    return resultado;

  } catch (e) {
    // Error inesperado durante lectura o cálculo — registrar y retornar safe-default
    _registrarEvento_('ERROR', 'Servicios_MetricasLotes.js', 'calcularMetricasLotes', 'Error al calcular métricas: ' + e.message);
    return _metricasLotesVacias();
  }
}


// ============================================================
//  CÁLCULO DE LOTES APROBADOS Y NEGADOS
// ============================================================

/**
 * Calcula la cantidad de lotes distintos aprobados, negados y en proceso a partir de las filas filtradas.
 *
 * Agrupa las filas por `codigoLote` (valores distintos). Para cada lote, toma el primer
 * `resultadoLote` no vacío encontrado como el resultado definitivo del lote.
 * Luego cuenta cuántos lotes tienen resultado "APROBADO", "NEGADO" o vacío (en proceso).
 *
 * Un lote solo se cuenta una vez aunque tenga múltiples solicitudes.
 * Lotes cuyo resultadoLote quede vacío (todas las filas con campo vacío) se consideran "en proceso".
 *
 * @param {Array<{fechaLote:Date, solicitudInquilino:string, codigoLote:string, resultadoLote:string, resultadoSolicitud:string, registroAnalistaSai:string}>} filasFiltradas
 *   Array de objetos normalizados (salida de `_filtrarFilasPorPeriodo`)
 * @returns {{totalLotes: number, lotesAprobados: number, lotesNegados: number, lotesEnProceso: number}}
 */
function _calcularLotesAprobadosNegados(filasFiltradas) {
  if (!filasFiltradas || !Array.isArray(filasFiltradas) || filasFiltradas.length === 0) {
    return { totalLotes: 0, lotesAprobados: 0, lotesNegados: 0, lotesEnProceso: 0 };
  }

  // Agrupar por codigoLote: almacenar el primer resultadoLote no vacío encontrado
  var loteResultados = {}; // { codigoLote: "APROBADO" | "NEGADO" | "" }

  for (var i = 0; i < filasFiltradas.length; i++) {
    var fila = filasFiltradas[i];
    var codigo = fila.codigoLote;

    // Ignorar filas sin código de lote
    if (!codigo) continue;

    // Si ya tenemos un resultado no vacío para este lote, no sobrescribir
    if (loteResultados.hasOwnProperty(codigo) && loteResultados[codigo] !== '') {
      continue;
    }

    // Asignar el resultadoLote (puede ser vacío en la primera aparición)
    if (!loteResultados.hasOwnProperty(codigo)) {
      loteResultados[codigo] = fila.resultadoLote;
    } else if (fila.resultadoLote !== '') {
      // Teníamos vacío, ahora encontramos uno no vacío
      loteResultados[codigo] = fila.resultadoLote;
    }
  }

  // Contar lotes aprobados, negados y en proceso
  var lotesAprobados = 0;
  var lotesNegados = 0;
  var lotesEnProceso = 0;
  var codigos = Object.keys(loteResultados);

  for (var j = 0; j < codigos.length; j++) {
    var resultado = loteResultados[codigos[j]];
    if (resultado === 'APROBADO') {
      lotesAprobados++;
    } else if (resultado === 'NEGADO') {
      lotesNegados++;
    } else {
      // Resultado vacío o diferente a APROBADO/NEGADO = en proceso
      lotesEnProceso++;
    }
  }

  return {
    totalLotes: codigos.length,
    lotesAprobados: lotesAprobados,
    lotesNegados: lotesNegados,
    lotesEnProceso: lotesEnProceso
  };
}
