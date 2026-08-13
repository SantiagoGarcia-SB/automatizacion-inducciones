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
 * La columna 'sucursal' es opcional — si no existe, se asigna -1.
 *
 * @param {string[]} headers - Array de headers de la hoja
 * @returns {{fechaLote:number, solicitudInquilino:number, codigoLote:number, resultadoLote:number, resultadoSolicitud:number, registroAnalistaSai:number, sucursal:number}|null}
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
    registroAnalistaSai: headersLower.indexOf('registro analista sai'),
    sucursal: headersLower.indexOf('sucursal')  // Opcional — no falla si no existe
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

  var clavesRequeridas = Object.keys(nombresColumnas);
  for (var i = 0; i < clavesRequeridas.length; i++) {
    if (mapa[clavesRequeridas[i]] === -1) {
      columnasNoEncontradas.push(nombresColumnas[clavesRequeridas[i]]);
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
      registroAnalistaSai: String(fila[mapa.registroAnalistaSai] || '').trim().toUpperCase(),
      sucursal: mapa.sucursal !== -1 ? String(fila[mapa.sucursal] || '').trim().toUpperCase() : ''
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
        resultadoLote: '',
        sucursal: ''
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

    // Determinar sucursal: primer valor no vacío encontrado
    if (grupo.sucursal === '' && fila.sucursal !== '') {
      grupo.sucursal = fila.sucursal;
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
      sucursal: grupoLote.sucursal,
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
 * Calcula las métricas operativas de lotes para un rango de fechas desde Sheets.
 * Función de cálculo puro — la estrategia cache-first es responsabilidad del caller (api_obtenerMetricasLotes).
 *
 * @param {string} fechaDesde - Fecha inicio en formato YYYY-MM-DD
 * @param {string} fechaHasta - Fecha fin en formato YYYY-MM-DD
 * @returns {{resumen: Object, detallePorLote: Array}}
 * @sheets_read 1-2 (headers + datos de registro analisis)
 */
function calcularMetricasLotes(fechaDesde, fechaHasta) {
  // ── 1. Validar parámetros ──
  var rango = _validarParametrosRango(fechaDesde, fechaHasta);
  if (!rango) {
    return _metricasLotesVacias();
  }

  // ── 2. Calcular desde Sheets ──
  try {
    // 2a. Leer headers (con caché propio de 300s)
    var headers = _obtenerHeadersMetricasLotes();
    if (!headers) return _metricasLotesVacias();

    // 2b. Mapear columnas
    var mapa = _mapearColumnasMetricasLotes(headers);
    if (!mapa) return _metricasLotesVacias();

    // 2c. Leer datos completos de la hoja
    var ss = SpreadsheetApp.openById(getArchivoAnalisisId());
    var hoja = ss.getSheetByName('registro analisis');
    if (!hoja || hoja.getLastRow() < 2) return _metricasLotesVacias();

    var datos = hoja.getDataRange().getValues();

    // 2d. Filtrar filas por rango de fechas
    var filasFiltradas = _filtrarFilasPorPeriodo(datos, mapa, rango.desde, rango.hasta);

    // 2e. Calcular resumen
    var lotesCount = _calcularLotesAprobadosNegados(filasFiltradas);
    var solicitudesCount = _calcularSolicitudesAprobNegReconsideradas(filasFiltradas);

    // 2f. Calcular total de solicitudes del periodo (todas, sin importar estado)
    var totalSolicitudes = filasFiltradas.length;

    // 2g. Calcular detalle por lote
    var detalle = _agruparPorLoteYCalcularMetricas(filasFiltradas);

    // 2h. Recalcular solicitudesAprobadas y solicitudesNegadas desde detalle
    // para coherencia con la tabla (incluye aprobaciones individuales de lotes negados)
    var aprobDesdeDetalle = 0;
    var negDesdeDetalle = 0;
    var reconsDesdeDetalle = 0;
    var enProcesoDesdeDetalle = 0;
    for (var d = 0; d < detalle.length; d++) {
      aprobDesdeDetalle += (detalle[d].solicitudesAprobadasEnLote || 0)
                         + (detalle[d].solicitudesAprobadasIndividualNegadaPorLote || 0);
      negDesdeDetalle += (detalle[d].solicitudesNegadas || 0)
                       + (detalle[d].aprobadaPorLoteNegadaPorAnalista || 0);
      reconsDesdeDetalle += (detalle[d].negadaPorLoteReconsideradaPorGerencia || 0);
      enProcesoDesdeDetalle += (detalle[d].solicitudesEnProcesoEnLote || 0);
    }
    solicitudesCount.solicitudesAprobadas = aprobDesdeDetalle;
    solicitudesCount.solicitudesNegadas = negDesdeDetalle;
    solicitudesCount.solicitudesReconsideradas = reconsDesdeDetalle;
    solicitudesCount.solicitudesEnProceso = enProcesoDesdeDetalle;

    // 2i. Formatear fechas en detalle para serialización
    for (var i = 0; i < detalle.length; i++) {
      if (detalle[i].fechaLote instanceof Date) {
        detalle[i].fechaLote = Utilities.formatDate(detalle[i].fechaLote, 'GMT-5', 'd/MM/yyyy');
      } else {
        detalle[i].fechaLote = '';
      }
    }

    // 2j. Construir resultado
    // Extraer sucursales únicas del detalle para chips de filtro en frontend
    var sucursalesMap = {};
    for (var s = 0; s < detalle.length; s++) {
      var suc = detalle[s].sucursal || '';
      if (suc) sucursalesMap[suc] = true;
    }
    var sucursalesUnicas = Object.keys(sucursalesMap).sort();

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
      sucursales: sucursalesUnicas,
      detallePorLote: detalle
    };

    // ── 3. Retornar resultado (cache es responsabilidad del caller) ──
    return resultado;

  } catch (e) {
    // Error inesperado durante lectura o cálculo — registrar y retornar safe-default
    _registrarEvento_('ERROR', 'Servicios_MetricasLotes.js', 'calcularMetricasLotes', 'Error al calcular métricas: ' + e.message);
    return _metricasLotesVacias();
  }
}


// ============================================================
//  TENDENCIA HISTÓRICA (últimos N meses)
// ============================================================

/**
 * Calcula métricas históricas resumidas para los últimos N meses.
 * Lee registro_analisis UNA sola vez y filtra por cada mes en memoria.
 *
 * Optimizaciones:
 * - Usa SpreadsheetRegistry_get para evitar abrir el libro más de una vez por ejecución.
 * - Para rangos > 90 días (cantidadMeses > 3), lee solo las columnas necesarias
 *   mediante getRange limitado (máximo 17 columnas) en vez de todas las 100+ columnas.
 * - No adquiere LockService ni comparte dependencias de escritura, permitiendo
 *   ejecución en paralelo con api_obtenerMetricasLotes.
 *
 * @param {number} cantidadMeses - Cantidad de meses hacia atrás (1-12)
 * @returns {Array<{mes:number, anio:number, etiqueta:string, lotesAprobados:number, lotesNegados:number, solicitudesAprobadas:number, solicitudesNegadas:number}>}
 * @sheets_read 0 en cache-hit, 1 en cache-miss
 */
function calcularMetricasLotesHistorico(cantidadMeses) {
  var n = parseInt(cantidadMeses, 10);
  if (isNaN(n) || n < 1 || n > 12) return [];

  try {
    // ── 1. Intentar cache hit (degradación elegante si CacheService falla) ──
    var cacheKey = 'METRICAS_HIST_' + n;
    try {
      var cached = CacheWrapper_getJSON(cacheKey);
      if (cached) return cached;
    } catch (e) { /* degradación elegante — continuar sin cache */ }

    // ── 2. Leer headers y mapear columnas ──
    var headers = _obtenerHeadersMetricasLotes();
    if (!headers) return [];

    var mapa = _mapearColumnasMetricasLotes(headers);
    if (!mapa) return [];

    // ── 3. Lectura ÚNICA de registro_analisis (vía SpreadsheetRegistry) ──
    var ss = SpreadsheetRegistry_get(getArchivoAnalisisId());
    var hoja = ss.getSheetByName('registro analisis');
    if (!hoja || hoja.getLastRow() < 2) return [];

    var datos;
    var ultimaFila = hoja.getLastRow();

    // Para rangos > 90 días (cantidadMeses > 3), usar getRange limitado a columnas necesarias
    if (n > 3) {
      datos = _leerColumnasNecesariasHistorico(hoja, mapa, ultimaFila, headers);
    } else {
      // Para rangos <= 90 días, getDataRange completo (pocas columnas extra no impactan)
      datos = hoja.getDataRange().getValues();
    }

    if (!datos || datos.length < 2) return [];

    // ── 4. Calcular rangos de meses ──
    var hoy = new Date();
    var meses = [];
    var nombresMeses = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic'];

    for (var i = 1; i <= n; i++) {
      var d = new Date(hoy.getFullYear(), hoy.getMonth() - i, 1);
      var primerDia = new Date(d.getFullYear(), d.getMonth(), 1);
      var ultimoDia = new Date(d.getFullYear(), d.getMonth() + 1, 0);
      primerDia.setHours(0, 0, 0, 0);
      ultimoDia.setHours(0, 0, 0, 0);

      meses.push({
        mes: d.getMonth() + 1,
        anio: d.getFullYear(),
        etiqueta: nombresMeses[d.getMonth()] + ' ' + d.getFullYear(),
        desde: primerDia,
        hasta: ultimoDia
      });
    }

    // Invertir para orden cronológico (más antiguo primero)
    meses.reverse();

    // ── 5. Para cada mes, filtrar filas en memoria y calcular conteos ──
    var resultado = [];
    for (var m = 0; m < meses.length; m++) {
      var mesDatos = meses[m];
      var filasFiltradas = _filtrarFilasPorPeriodo(datos, mapa, mesDatos.desde, mesDatos.hasta);
      var lotesCount = _calcularLotesAprobadosNegados(filasFiltradas);
      var solCount = _calcularSolicitudesAprobNegReconsideradas(filasFiltradas);

      resultado.push({
        mes: mesDatos.mes,
        anio: mesDatos.anio,
        etiqueta: mesDatos.etiqueta,
        lotesAprobados: lotesCount.lotesAprobados,
        lotesNegados: lotesCount.lotesNegados,
        solicitudesAprobadas: solCount.solicitudesAprobadas + solCount.solicitudesReconsideradas,
        solicitudesNegadas: solCount.solicitudesNegadas
      });
    }

    // ── 6. Cachear resultado (TTL 300s — datos históricos cambian poco) ──
    try {
      CacheWrapper_putJSON(cacheKey, resultado, 300);
    } catch (e) { /* degradación elegante — continuar sin cachear */ }

    return resultado;

  } catch (e) {
    _registrarEvento_('ERROR', 'Servicios_MetricasLotes.js', 'calcularMetricasLotesHistorico', 'Error: ' + e.message);
    return [];
  }
}

/**
 * Lee solo las columnas necesarias para el cálculo de métricas históricas.
 * Construye un array 2D compatible con el formato que _filtrarFilasPorPeriodo espera
 * (mismos índices de columna que el mapa), pero leyendo solo las columnas requeridas
 * en vez de las 100+ columnas totales de registro_analisis.
 *
 * Se usa para rangos > 90 días donde leer todas las columnas sería ineficiente.
 * Máximo 17 columnas leídas (6 requeridas + sucursal + margen de seguridad).
 *
 * @param {GoogleAppsScript.Spreadsheet.Sheet} hoja - Hoja registro_analisis
 * @param {{fechaLote:number, solicitudInquilino:number, codigoLote:number, resultadoLote:number, resultadoSolicitud:number, registroAnalistaSai:number, sucursal:number}} mapa - Índices de columnas
 * @param {number} ultimaFila - Última fila con datos en la hoja
 * @param {string[]} headers - Headers completos de la hoja
 * @returns {any[][]} Array 2D con header en posición 0 y datos desde posición 1
 * @sheets_read 1
 */
function _leerColumnasNecesariasHistorico(hoja, mapa, ultimaFila, headers) {
  // Determinar las columnas que necesitamos (0-based en mapa, 1-based en Sheets)
  var columnasNecesarias = [
    mapa.fechaLote,
    mapa.solicitudInquilino,
    mapa.codigoLote,
    mapa.resultadoLote,
    mapa.resultadoSolicitud,
    mapa.registroAnalistaSai
  ];

  // Agregar sucursal si existe
  if (mapa.sucursal !== -1) {
    columnasNecesarias.push(mapa.sucursal);
  }

  // Encontrar la columna máxima para determinar el rango mínimo necesario
  var colMax = 0;
  for (var c = 0; c < columnasNecesarias.length; c++) {
    if (columnasNecesarias[c] > colMax) {
      colMax = columnasNecesarias[c];
    }
  }

  // Leer desde fila 1 (headers) hasta última fila, limitado a las columnas necesarias.
  // El rango incluye hasta colMax+1 columnas (todas las columnas desde A hasta la más lejana necesaria).
  // Si colMax+1 ya es ≤ 17, se cumple el requisito 12.5 directamente.
  var numColumnas = colMax + 1;
  var datosLimitados = hoja.getRange(1, 1, ultimaFila, numColumnas).getValues();

  return datosLimitados;
}


// ============================================================
//  DISTRIBUCIÓN EN PROCESO (pipeline)
// ============================================================

/**
 * Obtiene la distribución de estados operativos para solicitudes en proceso.
 *
 * Lógica:
 * 1. Lee Control_General y construye mapa {UUID_SISTEMA → Estado}
 * 2. Lee registro analisis, filtra por Fecha Lote en rango
 * 3. Para filas con REGISTRO ANALISTA SAI vacío (en proceso),
 *    cruza su UUID_SISTEMA con el mapa para obtener el Estado de Control_General
 * 4. Retorna distribución de estados
 *
 * @param {string} fechaDesde - YYYY-MM-DD
 * @param {string} fechaHasta - YYYY-MM-DD
 * @returns {{desglose: Object, detalle: Array}}
 */
function _obtenerEstadosOperativosEnProceso(fechaDesde, fechaHasta) {
  var resultado = {
    desglose: {
      pendienteRadicar: 0,
      radicado: 0,
      pendienteAsignar: 0,
      enAnalisis: 0,
      errorTerceros: 0,
      envioFormatoLMI: 0,
      envioCartaLMI: 0,
      pendientePS: 0,
      otros: 0,
      total: 0
    },
    detalle: []
  };

  if (!fechaDesde || !fechaHasta) return resultado;

  var desde = new Date(fechaDesde + 'T00:00:00');
  var hasta = new Date(fechaHasta + 'T00:00:00');
  if (isNaN(desde.getTime()) || isNaN(hasta.getTime())) return resultado;

  // ── Paso 1: Leer Control_General y construir mapa UUID → Estado ──
  var mapaEstados = {}; // { uuid: estado }

  try {
    var ssControl = SpreadsheetApp.openById(getHojaControlId());
    var hojaControl = ssControl.getSheetByName('Control_General');

    if (hojaControl && hojaControl.getLastRow() >= 2) {
      var ultimaFila = hojaControl.getLastRow();
      // Col J=9 (Estado), Col BJ=61 (UUID_SISTEMA)
      var datosControl = hojaControl.getRange(2, 1, ultimaFila - 1, 62).getValues();

      for (var c = 0; c < datosControl.length; c++) {
        var uuid = String(datosControl[c][61] || '').trim();
        if (!uuid) continue;
        var estado = String(datosControl[c][9] || '').trim().toUpperCase();
        mapaEstados[uuid] = estado;
      }
    }
  } catch (e) {
    _registrarEvento_('ERROR', 'Servicios_MetricasLotes.js', '_obtenerEstadosOperativosEnProceso', 'Error leyendo Control_General: ' + e.message);
    return resultado;
  }

  if (Object.keys(mapaEstados).length === 0) return resultado;

  // ── Paso 2: Leer registro analisis, filtrar por fecha, cruzar UUIDs en proceso ──
  var headers = _obtenerHeadersMetricasLotes();
  if (!headers) return resultado;

  var mapa = _mapearColumnasMetricasLotes(headers);
  if (!mapa) return resultado;

  // Buscar columna UUID_SISTEMA
  var headersLower = headers.map(function(h) { return String(h || '').toLowerCase(); });
  var colUuid = headersLower.indexOf('uuid_sistema');
  if (colUuid === -1) {
    _registrarEvento_('ERROR', 'Servicios_MetricasLotes.js', '_obtenerEstadosOperativosEnProceso', 'Columna UUID_SISTEMA no encontrada en registro analisis');
    return resultado;
  }

  var ssAnalisis = SpreadsheetApp.openById(getArchivoAnalisisId());
  var hojaAnalisis = ssAnalisis.getSheetByName('registro analisis');
  if (!hojaAnalisis || hojaAnalisis.getLastRow() < 2) return resultado;

  var datosAnalisis = hojaAnalisis.getDataRange().getValues();
  var desdeTime = desde.getTime();
  var hastaTime = hasta.getTime();

  // ── Paso 3: Filtrar por fecha + en proceso + cruzar con mapa ──
  // De-duplicar por solicitudInquilino (misma llave que usa el KPI para cantidadSolicitudes)
  var solicitudesContadas = {};

  for (var i = 1; i < datosAnalisis.length; i++) {
    var fila = datosAnalisis[i];

    // Filtrar por Fecha Lote
    var fechaRaw = fila[mapa.fechaLote];
    if (!fechaRaw) continue;
    var fechaLote = (fechaRaw instanceof Date) ? new Date(fechaRaw.getTime()) : new Date(fechaRaw);
    if (isNaN(fechaLote.getTime())) continue;
    fechaLote.setHours(0, 0, 0, 0);
    if (fechaLote.getTime() < desdeTime || fechaLote.getTime() > hastaTime) continue;

    // Solo en proceso (REGISTRO ANALISTA SAI vacío)
    var registroSai = String(fila[mapa.registroAnalistaSai] || '').trim();
    if (registroSai) continue;

    // De-duplicar por solicitudInquilino
    var solInq = String(fila[mapa.solicitudInquilino] || '').trim().toUpperCase();
    var codigoLote = String(fila[mapa.codigoLote] || '').trim().toUpperCase();
    var claveUnica = codigoLote + '|' + solInq; // Llave compuesta lote+solicitud
    if (solicitudesContadas[claveUnica]) continue;
    solicitudesContadas[claveUnica] = true;

    // Cruzar UUID con mapa de estados
    var uuidFila = String(fila[colUuid] || '').trim();
    if (!uuidFila) continue;

    var estadoControl = mapaEstados[uuidFila];
    if (estadoControl === undefined) continue;

    resultado.desglose.total++;

    if (estadoControl === 'PENDIENTE RADICAR') resultado.desglose.pendienteRadicar++;
    else if (estadoControl === 'RADICADO') resultado.desglose.radicado++;
    else if (estadoControl === 'PENDIENTE ASIGNAR') resultado.desglose.pendienteAsignar++;
    else if (estadoControl.indexOf('ANÁLISIS') !== -1 || estadoControl.indexOf('ANALISIS') !== -1) resultado.desglose.enAnalisis++;
    else if (estadoControl.indexOf('ERROR') !== -1) resultado.desglose.errorTerceros++;
    else if (estadoControl.indexOf('FORMATO LMI') !== -1) resultado.desglose.envioFormatoLMI++;
    else if (estadoControl.indexOf('CARTA LMI') !== -1) resultado.desglose.envioCartaLMI++;
    else if (estadoControl.indexOf('PAZ Y SALVO') !== -1) resultado.desglose.pendientePS++;
    else resultado.desglose.otros++;
  }

  return resultado;
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


// ============================================================
//  FUNCIONES OPTIMIZADAS — Reciben datos pre-leídos (cero lecturas adicionales a Sheets)
//  Usadas por api_obtenerDatosMetricas para evitar lecturas redundantes.
// ============================================================

/**
 * Calcula métricas de lotes usando datos ya leídos de "registro analisis".
 * Evita la lectura adicional a Sheets que haría calcularMetricasLotes().
 *
 * @param {string} fechaDesde - YYYY-MM-DD
 * @param {string} fechaHasta - YYYY-MM-DD
 * @param {any[][]} datosPreLeidos - Array 2D con header en posición 0
 * @param {Object} mapa - Mapa de columnas (salida de _mapearColumnasMetricasLotes)
 * @returns {{resumen: Object, detallePorLote: Array, sucursales: string[]}}
 * @sheets_read 0
 */
function calcularMetricasLotesConDatos(fechaDesde, fechaHasta, datosPreLeidos, mapa) {
  var rango = _validarParametrosRango(fechaDesde, fechaHasta);
  if (!rango) return _metricasLotesVacias();
  if (!datosPreLeidos || datosPreLeidos.length < 2 || !mapa) return _metricasLotesVacias();

  try {
    var filasFiltradas = _filtrarFilasPorPeriodo(datosPreLeidos, mapa, rango.desde, rango.hasta);
    var lotesCount = _calcularLotesAprobadosNegados(filasFiltradas);
    var solicitudesCount = _calcularSolicitudesAprobNegReconsideradas(filasFiltradas);
    var totalSolicitudes = filasFiltradas.length;
    var detalle = _agruparPorLoteYCalcularMetricas(filasFiltradas);

    // Recalcular desde detalle para coherencia
    var aprobDesdeDetalle = 0, negDesdeDetalle = 0, reconsDesdeDetalle = 0, enProcesoDesdeDetalle = 0;
    for (var d = 0; d < detalle.length; d++) {
      aprobDesdeDetalle += (detalle[d].solicitudesAprobadasEnLote || 0) + (detalle[d].solicitudesAprobadasIndividualNegadaPorLote || 0);
      negDesdeDetalle += (detalle[d].solicitudesNegadas || 0) + (detalle[d].aprobadaPorLoteNegadaPorAnalista || 0);
      reconsDesdeDetalle += (detalle[d].negadaPorLoteReconsideradaPorGerencia || 0);
      enProcesoDesdeDetalle += (detalle[d].solicitudesEnProcesoEnLote || 0);
    }

    // Formatear fechas
    for (var i = 0; i < detalle.length; i++) {
      if (detalle[i].fechaLote instanceof Date) {
        detalle[i].fechaLote = Utilities.formatDate(detalle[i].fechaLote, 'GMT-5', 'd/MM/yyyy');
      } else {
        detalle[i].fechaLote = '';
      }
    }

    // Sucursales únicas
    var sucursalesMap = {};
    for (var s = 0; s < detalle.length; s++) {
      var suc = detalle[s].sucursal || '';
      if (suc) sucursalesMap[suc] = true;
    }

    return {
      resumen: {
        totalLotes: lotesCount.totalLotes,
        lotesAprobados: lotesCount.lotesAprobados,
        lotesNegados: lotesCount.lotesNegados,
        lotesEnProceso: lotesCount.lotesEnProceso,
        totalSolicitudes: totalSolicitudes,
        solicitudesAprobadas: aprobDesdeDetalle,
        solicitudesNegadas: negDesdeDetalle,
        solicitudesReconsideradas: reconsDesdeDetalle,
        solicitudesEnProceso: enProcesoDesdeDetalle
      },
      sucursales: Object.keys(sucursalesMap).sort(),
      detallePorLote: detalle
    };
  } catch (e) {
    _registrarEvento_('ERROR', 'Servicios_MetricasLotes.js', 'calcularMetricasLotesConDatos', e.message);
    return _metricasLotesVacias();
  }
}

/**
 * Calcula histórico de métricas usando datos ya leídos de "registro analisis".
 * Evita la lectura adicional a Sheets que haría calcularMetricasLotesHistorico().
 *
 * @param {number} cantidadMeses - Meses hacia atrás (1-12)
 * @param {any[][]} datosPreLeidos - Array 2D con header en posición 0
 * @param {Object} mapa - Mapa de columnas
 * @returns {Array<{mes:number, anio:number, etiqueta:string, lotesAprobados:number, lotesNegados:number, solicitudesAprobadas:number, solicitudesNegadas:number}>}
 * @sheets_read 0
 */
function calcularMetricasLotesHistoricoConDatos(cantidadMeses, datosPreLeidos, mapa) {
  var n = parseInt(cantidadMeses, 10);
  if (isNaN(n) || n < 1 || n > 12) return [];
  if (!datosPreLeidos || datosPreLeidos.length < 2 || !mapa) return [];

  // Intentar cache hit
  var cacheKey = 'METRICAS_HIST_' + n;
  try {
    var cached = CacheWrapper_getJSON(cacheKey);
    if (cached) return cached;
  } catch (e) { /* degradación elegante */ }

  try {
    var hoy = new Date();
    var nombresMeses = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic'];
    var meses = [];

    for (var i = 1; i <= n; i++) {
      var d = new Date(hoy.getFullYear(), hoy.getMonth() - i, 1);
      var primerDia = new Date(d.getFullYear(), d.getMonth(), 1);
      var ultimoDia = new Date(d.getFullYear(), d.getMonth() + 1, 0);
      primerDia.setHours(0, 0, 0, 0);
      ultimoDia.setHours(0, 0, 0, 0);
      meses.push({ mes: d.getMonth() + 1, anio: d.getFullYear(), etiqueta: nombresMeses[d.getMonth()] + ' ' + d.getFullYear(), desde: primerDia, hasta: ultimoDia });
    }
    meses.reverse();

    var resultado = [];
    for (var m = 0; m < meses.length; m++) {
      var mesDatos = meses[m];
      var filasFiltradas = _filtrarFilasPorPeriodo(datosPreLeidos, mapa, mesDatos.desde, mesDatos.hasta);
      var lotesCount = _calcularLotesAprobadosNegados(filasFiltradas);
      var solCount = _calcularSolicitudesAprobNegReconsideradas(filasFiltradas);
      resultado.push({
        mes: mesDatos.mes, anio: mesDatos.anio, etiqueta: mesDatos.etiqueta,
        lotesAprobados: lotesCount.lotesAprobados, lotesNegados: lotesCount.lotesNegados,
        solicitudesAprobadas: solCount.solicitudesAprobadas + solCount.solicitudesReconsideradas,
        solicitudesNegadas: solCount.solicitudesNegadas
      });
    }

    // Cachear (TTL 300s)
    try { CacheWrapper_putJSON(cacheKey, resultado, 300); } catch (e) { /* ok */ }
    return resultado;
  } catch (e) {
    _registrarEvento_('ERROR', 'Servicios_MetricasLotes.js', 'calcularMetricasLotesHistoricoConDatos', e.message);
    return [];
  }
}

/**
 * Obtiene distribución de estados en proceso usando datos pre-leídos de "registro analisis".
 * Solo lee Control_General (optimizado a 2 columnas: Estado + UUID).
 *
 * @param {string} fechaDesde - YYYY-MM-DD
 * @param {string} fechaHasta - YYYY-MM-DD
 * @param {any[][]} datosPreLeidos - Array 2D de registro analisis
 * @param {string[]} headers - Headers de registro analisis
 * @param {Object} mapa - Mapa de columnas
 * @returns {{desglose: Object}}
 * @sheets_read 1 (solo Control_General, optimizado a 2 columnas)
 */
function _obtenerEstadosOperativosEnProcesoConDatos(fechaDesde, fechaHasta, datosPreLeidos, headers, mapa) {
  var resultado = {
    desglose: { pendienteRadicar: 0, radicado: 0, pendienteAsignar: 0, enAnalisis: 0, errorTerceros: 0, envioFormatoLMI: 0, envioCartaLMI: 0, pendientePS: 0, otros: 0, total: 0 },
    detalle: []
  };

  if (!fechaDesde || !fechaHasta || !datosPreLeidos || !mapa) return resultado;

  var desde = new Date(fechaDesde + 'T00:00:00');
  var hasta = new Date(fechaHasta + 'T00:00:00');
  if (isNaN(desde.getTime()) || isNaN(hasta.getTime())) return resultado;

  // ── Paso 1: Leer Control_General SOLO col J (Estado) y col BJ (UUID) ──
  var mapaEstados = {};
  try {
    var ssControl = SpreadsheetApp.openById(getHojaControlId());
    var hojaControl = ssControl.getSheetByName('Control_General');
    if (hojaControl && hojaControl.getLastRow() >= 2) {
      var ultimaFila = hojaControl.getLastRow();
      // Leer solo col J (10) = Estado
      var colEstados = hojaControl.getRange(2, 10, ultimaFila - 1, 1).getValues();
      // Leer solo col BJ (62) = UUID_SISTEMA
      var colUuids = hojaControl.getRange(2, 62, ultimaFila - 1, 1).getValues();
      for (var c = 0; c < colUuids.length; c++) {
        var uuid = String(colUuids[c][0] || '').trim();
        if (!uuid) continue;
        mapaEstados[uuid] = String(colEstados[c][0] || '').trim().toUpperCase();
      }
    }
  } catch (e) {
    _registrarEvento_('ERROR', 'Servicios_MetricasLotes.js', '_obtenerEstadosOperativosEnProcesoConDatos', 'Error leyendo Control_General: ' + e.message);
    return resultado;
  }

  if (Object.keys(mapaEstados).length === 0) return resultado;

  // ── Paso 2: Usar datosPreLeidos (ya disponible, 0 lecturas adicionales) ──
  var headersLower = headers.map(function(h) { return String(h || '').toLowerCase(); });
  var colUuid = headersLower.indexOf('uuid_sistema');
  if (colUuid === -1) return resultado;

  var desdeTime = desde.getTime();
  var hastaTime = hasta.getTime();
  var solicitudesContadas = {};

  for (var i = 1; i < datosPreLeidos.length; i++) {
    var fila = datosPreLeidos[i];

    // Filtrar por Fecha Lote
    var fechaRaw = fila[mapa.fechaLote];
    if (!fechaRaw) continue;
    var fechaLote = (fechaRaw instanceof Date) ? new Date(fechaRaw.getTime()) : new Date(fechaRaw);
    if (isNaN(fechaLote.getTime())) continue;
    fechaLote.setHours(0, 0, 0, 0);
    if (fechaLote.getTime() < desdeTime || fechaLote.getTime() > hastaTime) continue;

    // Solo en proceso
    var registroSai = String(fila[mapa.registroAnalistaSai] || '').trim();
    if (registroSai) continue;

    // De-duplicar
    var solInq = String(fila[mapa.solicitudInquilino] || '').trim().toUpperCase();
    var codigoLote = String(fila[mapa.codigoLote] || '').trim().toUpperCase();
    var claveUnica = codigoLote + '|' + solInq;
    if (solicitudesContadas[claveUnica]) continue;
    solicitudesContadas[claveUnica] = true;

    // Cruzar UUID
    var uuidFila = String(fila[colUuid] || '').trim();
    if (!uuidFila) continue;
    var estadoControl = mapaEstados[uuidFila];
    if (estadoControl === undefined) continue;

    resultado.desglose.total++;

    if (estadoControl === 'PENDIENTE RADICAR') resultado.desglose.pendienteRadicar++;
    else if (estadoControl === 'RADICADO') resultado.desglose.radicado++;
    else if (estadoControl === 'PENDIENTE ASIGNAR') resultado.desglose.pendienteAsignar++;
    else if (estadoControl.indexOf('ANÁLISIS') !== -1 || estadoControl.indexOf('ANALISIS') !== -1) resultado.desglose.enAnalisis++;
    else if (estadoControl.indexOf('ERROR') !== -1) resultado.desglose.errorTerceros++;
    else if (estadoControl.indexOf('FORMATO LMI') !== -1) resultado.desglose.envioFormatoLMI++;
    else if (estadoControl.indexOf('CARTA LMI') !== -1) resultado.desglose.envioCartaLMI++;
    else if (estadoControl.indexOf('PAZ Y SALVO') !== -1) resultado.desglose.pendientePS++;
    else resultado.desglose.otros++;
  }

  return resultado;
}
