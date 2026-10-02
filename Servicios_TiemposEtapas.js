/**
 * ============================================================
 * Servicios_TiemposEtapas — tiempos entre etapas del proceso
 *
 * Fuente única: Control_General (una fila por solicitud).
 *
 *   T1  Ingreso → Radicación        F.H Radicación SAI − Fecha ingreso
 *   T2  Radicación → Asignación     F.H Asignacion − F.H Radicación SAI
 *   T3  Asignación → Análisis       Inicio Analisis − F.H Asignacion
 *   T4  Duración del análisis       Fin Analisis − Inicio Analisis
 *   T5  Análisis → Resultado        F.H Resultado SAI − Fin Analisis
 *   T6  Resultado → Envío           F.H Envio Resultado − F.H Resultado SAI
 *
 * Inicio/Fin Analisis: primera y última edición de un campo del analista
 * (Tiempos_Analisis.js). "Envío" = correo "Resultados de inducción" al
 * comercial (registrarEnvioResultadoLote).
 *
 * "F.H Asignacion" la sella Asignaciones.js (hora de envío del correo al
 * analista). "F.H Radicación SAI" y "F.H Resultado SAI" se digitan a mano,
 * por eso el parseo de fechas es tolerante y los tramos con datos faltantes
 * o negativos se descartan y se reportan.
 *
 * El rango de fechas filtra por "Fecha ingreso" (igual que las demás métricas).
 * Se devuelve el agregado total, por sucursal y por ciudad dentro de cada
 * sucursal, para que el front filtre sin otra llamada al servidor.
 * ============================================================
 */

/** Sucursales cuyo detalle por ciudad se muestra en la vista (claves normalizadas). */
var TIEMPOS_SUCURSALES_DETALLE_CIUDAD = ['EJE CAFETERO'];

var TIEMPOS_TRAMOS = ['t1', 't2', 't3', 't4', 't5', 't6'];
var TIEMPOS_COL_ENVIO_RESULTADO = 'F.H Envio Resultado';
var TIEMPOS_HORA_MS = 3600000;

// ============================================================
//  UTILIDADES PURAS (testeables)
// ============================================================

/** Clave comparable: sin tildes, mayúsculas, espacios simples. */
function TiemposEtapas_normalizarClave_(valor) {
  return String(valor === undefined || valor === null ? '' : valor)
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .toUpperCase();
}

/** Clave de encabezado: solo letras y números ("F.H Radicación SAI" → "FHRADICACIONSAI"). */
function TiemposEtapas_claveEncabezado_(valor) {
  return TiemposEtapas_normalizarClave_(valor).replace(/[^A-Z0-9]/g, '');
}

/**
 * Convierte una celda (Date, texto digitado a mano) en Date, o null si no es válida.
 * Texto soportado: dd/MM/yyyy [HH:mm[:ss]] (día primero), yyyy-MM-dd [HH:mm[:ss]],
 * con "a. m."/"p. m."/AM/PM opcional.
 * @param {*} valor
 * @returns {Date|null}
 */
function TiemposEtapas_parsearFecha_(valor) {
  if (valor === undefined || valor === null || valor === '') return null;

  if (Object.prototype.toString.call(valor) === '[object Date]') {
    return isNaN(valor.getTime()) ? null : valor;
  }

  var texto = String(valor).trim();
  if (!texto) return null;

  var m = texto.match(/^(\d{1,2})[\/\-.](\d{1,2})[\/\-.](\d{4})(?:[ T,]+(\d{1,2}):(\d{2})(?::(\d{2}))?\s*([ap])?\.?\s*m?\.?)?$/i);
  var anio, mes, dia, hora, min, seg, sufijo;
  if (m) {
    dia = +m[1]; mes = +m[2]; anio = +m[3];
    hora = m[4] ? +m[4] : 0; min = m[5] ? +m[5] : 0; seg = m[6] ? +m[6] : 0; sufijo = m[7];
  } else {
    m = texto.match(/^(\d{4})-(\d{1,2})-(\d{1,2})(?:[ T]+(\d{1,2}):(\d{2})(?::(\d{2}))?\s*([ap])?\.?\s*m?\.?)?/i);
    if (!m) return null;
    anio = +m[1]; mes = +m[2]; dia = +m[3];
    hora = m[4] ? +m[4] : 0; min = m[5] ? +m[5] : 0; seg = m[6] ? +m[6] : 0; sufijo = m[7];
  }

  if (sufijo) {
    var pm = sufijo.toLowerCase() === 'p';
    if (hora === 12) hora = pm ? 12 : 0;
    else if (pm) hora += 12;
  }
  if (mes < 1 || mes > 12 || dia < 1 || dia > 31 || hora > 23 || min > 59 || seg > 59) return null;

  var fecha = new Date(anio, mes - 1, dia, hora, min, seg);
  // Rechaza desbordes (31/02 → marzo).
  if (fecha.getMonth() !== mes - 1 || fecha.getDate() !== dia) return null;
  return fecha;
}

/** Promedio y mediana en horas de una lista de duraciones. */
function TiemposEtapas_estadistica_(horas) {
  var n = horas.length;
  if (!n) return { n: 0, promedioHoras: null, medianaHoras: null };

  var ordenadas = horas.slice().sort(function (a, b) { return a - b; });
  var suma = 0;
  for (var i = 0; i < n; i++) suma += ordenadas[i];
  var mitad = Math.floor(n / 2);
  var mediana = n % 2 ? ordenadas[mitad] : (ordenadas[mitad - 1] + ordenadas[mitad]) / 2;

  return { n: n, promedioHoras: TiemposEtapas_redondear_(suma / n), medianaHoras: TiemposEtapas_redondear_(mediana) };
}

function TiemposEtapas_redondear_(x) {
  return Math.round(x * 100) / 100;
}

function TiemposEtapas_acumuladorVacio_() {
  var acc = { solicitudes: 0 };
  TIEMPOS_TRAMOS.forEach(function (t) { acc[t] = { valores: [], sinDato: 0, invalidos: 0 }; });
  return acc;
}

function TiemposEtapas_agregarFila_(acc, fechas) {
  acc.solicitudes++;
  var pares = {
    t1: [fechas.ingreso, fechas.radicacion],
    t2: [fechas.radicacion, fechas.asignacion],
    t3: [fechas.asignacion, fechas.inicioAnalisis],
    t4: [fechas.inicioAnalisis, fechas.finAnalisis],
    t5: [fechas.finAnalisis, fechas.resultado],
    t6: [fechas.resultado, fechas.envioResultado]
  };
  TIEMPOS_TRAMOS.forEach(function (t) {
    var inicio = pares[t][0];
    var fin = pares[t][1];
    if (!inicio || !fin) { acc[t].sinDato++; return; }
    var horas = (fin.getTime() - inicio.getTime()) / TIEMPOS_HORA_MS;
    if (horas < 0) { acc[t].invalidos++; return; }
    acc[t].valores.push(horas);
  });
}

function TiemposEtapas_resumirAcumulador_(acc) {
  var resumen = { solicitudes: acc.solicitudes };
  TIEMPOS_TRAMOS.forEach(function (t) {
    var est = TiemposEtapas_estadistica_(acc[t].valores);
    est.sinDato = acc[t].sinDato;
    est.invalidos = acc[t].invalidos;
    resumen[t] = est;
  });
  return resumen;
}

/**
 * Agrega las filas por total, sucursal y ciudad (dentro de cada sucursal).
 * @param {Array<{ingreso:*,radicacion:*,asignacion:*,resultado:*,sucursal:string,ciudad:string}>} filas
 * @returns {{total:Object, sucursales:Object}}
 */
function TiemposEtapas_calcular_(filas) {
  var total = TiemposEtapas_acumuladorVacio_();
  var porSucursal = {};

  for (var i = 0; i < filas.length; i++) {
    var f = filas[i];
    var fechas = {
      ingreso: TiemposEtapas_parsearFecha_(f.ingreso),
      radicacion: TiemposEtapas_parsearFecha_(f.radicacion),
      asignacion: TiemposEtapas_parsearFecha_(f.asignacion),
      inicioAnalisis: TiemposEtapas_parsearFecha_(f.inicioAnalisis),
      finAnalisis: TiemposEtapas_parsearFecha_(f.finAnalisis),
      resultado: TiemposEtapas_parsearFecha_(f.resultado),
      envioResultado: TiemposEtapas_parsearFecha_(f.envioResultado)
    };

    var nombreSuc = TiemposEtapas_normalizarClave_(f.sucursal) || 'SIN SUCURSAL';
    var nombreCiu = TiemposEtapas_normalizarClave_(f.ciudad) || 'SIN CIUDAD';

    if (!porSucursal[nombreSuc]) {
      porSucursal[nombreSuc] = { acc: TiemposEtapas_acumuladorVacio_(), ciudades: {} };
    }
    var suc = porSucursal[nombreSuc];
    if (!suc.ciudades[nombreCiu]) suc.ciudades[nombreCiu] = TiemposEtapas_acumuladorVacio_();

    TiemposEtapas_agregarFila_(total, fechas);
    TiemposEtapas_agregarFila_(suc.acc, fechas);
    TiemposEtapas_agregarFila_(suc.ciudades[nombreCiu], fechas);
  }

  var sucursales = {};
  Object.keys(porSucursal).forEach(function (clave) {
    var ciudades = {};
    Object.keys(porSucursal[clave].ciudades).forEach(function (c) {
      ciudades[c] = TiemposEtapas_resumirAcumulador_(porSucursal[clave].ciudades[c]);
    });
    sucursales[clave] = {
      resumen: TiemposEtapas_resumirAcumulador_(porSucursal[clave].acc),
      ciudades: ciudades
    };
  });

  return { total: TiemposEtapas_resumirAcumulador_(total), sucursales: sucursales };
}

function TiemposEtapas_vacio_() {
  var resultado = TiemposEtapas_calcular_([]);
  resultado.sucursalesConDetalleCiudad = TIEMPOS_SUCURSALES_DETALLE_CIUDAD.slice();
  return resultado;
}

// ============================================================
//  LECTURA DE CONTROL_GENERAL
// ============================================================

/** Busca una columna (1-based) por clave de encabezado; 0 si no existe. */
function TiemposEtapas_buscarColumna_(encabezados, nombres) {
  var claves = nombres.map(TiemposEtapas_claveEncabezado_);
  for (var i = 0; i < encabezados.length; i++) {
    if (claves.indexOf(TiemposEtapas_claveEncabezado_(encabezados[i])) !== -1) return i + 1;
  }
  return 0;
}

function TiemposEtapas_leerColumna_(hoja, columna, filaInicio, nFilas) {
  if (!columna || nFilas < 1) return new Array(Math.max(nFilas, 0)).fill('');
  var valores = hoja.getRange(filaInicio, columna, nFilas, 1).getValues();
  var salida = new Array(valores.length);
  for (var i = 0; i < valores.length; i++) salida[i] = valores[i][0];
  return salida;
}

/**
 * Lee de Control_General las filas con "Fecha ingreso" dentro del rango.
 * Solo se leen columnas sueltas (no la hoja ancha completa).
 * @param {Date} desde  Inclusive.
 * @param {Date} hastaExclusivo
 * @param {string[]|null} nombresComercial  Nombres en MAYÚSCULAS permitidos, o null para todos.
 * @returns {Array<Object>}
 */
function TiemposEtapas_leerFilas_(desde, hastaExclusivo, nombresComercial) {
  var hoja = SpreadsheetRegistry_get(getHojaControlId()).getSheetByName('Control_General');
  if (!hoja) return [];

  var ultimaFila = hoja.getLastRow();
  if (ultimaFila < 2) return [];

  var encabezados = hoja.getRange(1, 1, 1, hoja.getLastColumn()).getValues()[0];
  var col = {
    ingreso: TiemposEtapas_buscarColumna_(encabezados, ['Fecha ingreso']) || 3,
    radicacion: TiemposEtapas_buscarColumna_(encabezados, ['F.H Radicación SAI']),
    asignacion: TiemposEtapas_buscarColumna_(encabezados, ['F.H Asignacion']),
    resultado: TiemposEtapas_buscarColumna_(encabezados, ['F.H Resultado SAI']),
    inicioAnalisis: TiemposEtapas_buscarColumna_(encabezados, ['Inicio Analisis']),
    finAnalisis: TiemposEtapas_buscarColumna_(encabezados, ['Fin Analisis']),
    envioResultado: TiemposEtapas_buscarColumna_(encabezados, [TIEMPOS_COL_ENVIO_RESULTADO]),
    comercial: TiemposEtapas_buscarColumna_(encabezados, ['Comercial']) || 11,
    sucursal: TiemposEtapas_buscarColumna_(encabezados, ['Sucursal']) || 57,
    ciudad: TiemposEtapas_buscarColumna_(encabezados, ['Ciudad del inmueble']) || 19
  };

  var n = ultimaFila - 1;
  var ingresos = TiemposEtapas_leerColumna_(hoja, col.ingreso, 2, n);

  var primera = -1;
  var ultima = -1;
  var enRango = [];
  for (var i = 0; i < n; i++) {
    var f = TiemposEtapas_parsearFecha_(ingresos[i]);
    if (!f || f.getTime() < desde.getTime() || f.getTime() >= hastaExclusivo.getTime()) continue;
    enRango.push(i);
    if (primera === -1) primera = i;
    ultima = i;
  }
  if (!enRango.length) return [];

  var bloque = ultima - primera + 1;
  var filaBloque = primera + 2;
  var leer = function (c) { return TiemposEtapas_leerColumna_(hoja, c, filaBloque, bloque); };
  var radicaciones = leer(col.radicacion);
  var asignaciones = leer(col.asignacion);
  var resultados = leer(col.resultado);
  var enviosResultado = leer(col.envioResultado);
  var iniciosAnalisis = leer(col.inicioAnalisis);
  var finesAnalisis = leer(col.finAnalisis);
  var comerciales = nombresComercial ? leer(col.comercial) : null;
  var sucursales = leer(col.sucursal);
  var ciudades = leer(col.ciudad);

  var filas = [];
  for (var k = 0; k < enRango.length; k++) {
    var idx = enRango[k];
    var j = idx - primera;
    if (comerciales && nombresComercial.indexOf(String(comerciales[j] || '').trim().toUpperCase()) === -1) continue;
    filas.push({
      ingreso: ingresos[idx],
      radicacion: radicaciones[j],
      asignacion: asignaciones[j],
      resultado: resultados[j],
      envioResultado: enviosResultado[j],
      inicioAnalisis: iniciosAnalisis[j],
      finAnalisis: finesAnalisis[j],
      sucursal: sucursales[j],
      ciudad: ciudades[j]
    });
  }
  return filas;
}

/**
 * Calcula los tiempos por etapa del rango.
 * @param {string} fechaDesde YYYY-MM-DD
 * @param {string} fechaHasta YYYY-MM-DD (inclusive)
 * @param {string[]|null} emailsAlcance Correos visibles (null = todos).
 * @returns {{total:Object, sucursales:Object, sucursalesConDetalleCiudad:string[]}}
 */
function calcularTiemposEtapas(fechaDesde, fechaHasta, emailsAlcance) {
  if (Array.isArray(emailsAlcance) && emailsAlcance.length === 0) return TiemposEtapas_vacio_();

  var desde = new Date(fechaDesde + 'T00:00:00');
  var hastaExclusivo = new Date(fechaHasta + 'T00:00:00');
  hastaExclusivo.setDate(hastaExclusivo.getDate() + 1);

  var nombres = _resolverNombresFiltro(emailsAlcance);
  // Con alcance restringido pero sin nombres resolubles no se debe mostrar todo.
  if (emailsAlcance !== null && emailsAlcance !== undefined && !nombres) return TiemposEtapas_vacio_();
  var filas = TiemposEtapas_leerFilas_(desde, hastaExclusivo, nombres);

  var resultado = TiemposEtapas_calcular_(filas);
  resultado.sucursalesConDetalleCiudad = TIEMPOS_SUCURSALES_DETALLE_CIUDAD.slice();
  return resultado;
}

/**
 * Sella la hora de envío del correo "Resultados de inducción" en todas las filas
 * de Control_General del lote (columna "F.H Envio Resultado", se crea si no existe).
 * Solo escribe donde está vacía: si el correo se reenvía se conserva el primer envío.
 * Nunca lanza: el envío del correo ya ocurrió y no debe abortarse por esto.
 *
 * @param {string} idLote Código de lote (se compara sin espacios ni mayúsculas).
 * @param {Date} [fechaEnvio] Por defecto, ahora.
 * @returns {{ok:boolean, filas:number}}
 */
function registrarEnvioResultadoLote(idLote, fechaEnvio) {
  try {
    var objetivo = TiemposEtapas_normalizarIdLote_(idLote);
    if (!objetivo) return { ok: false, filas: 0 };

    var hoja = SpreadsheetRegistry_get(getHojaControlId()).getSheetByName('Control_General');
    if (!hoja) return { ok: false, filas: 0 };

    // Columnas con el creador seguro (no se pisa con Tiempos_Analisis / Asignaciones).
    var colEnvio = Columnas_asegurar_(hoja, [TIEMPOS_COL_ENVIO_RESULTADO])[TIEMPOS_COL_ENVIO_RESULTADO];
    // "ID Lote" solo se busca (nunca se crea): si no está por nombre, es la columna A.
    var encabezados = hoja.getRange(1, 1, 1, hoja.getLastColumn()).getValues()[0];
    var colId = TiemposEtapas_buscarColumna_(encabezados, ['ID Lote']) || 1;

    var n = hoja.getLastRow() - 1;
    if (n < 1) return { ok: true, filas: 0 };

    var ids = TiemposEtapas_leerColumna_(hoja, colId, 2, n);
    var actuales = TiemposEtapas_leerColumna_(hoja, colEnvio, 2, n);

    var primera = -1;
    var ultimaFila = -1;
    var coinciden = [];
    for (var i = 0; i < n; i++) {
      if (TiemposEtapas_normalizarIdLote_(ids[i]) !== objetivo) continue;
      coinciden.push(i);
      if (primera === -1) primera = i;
      ultimaFila = i;
    }
    if (!coinciden.length) return { ok: true, filas: 0 };

    var ahora = fechaEnvio || new Date();
    var bloque = [];
    for (var j = primera; j <= ultimaFila; j++) bloque.push([actuales[j]]);
    var escritas = 0;
    coinciden.forEach(function (idx) {
      if (String(actuales[idx] === undefined || actuales[idx] === null ? '' : actuales[idx]).trim()) return;
      bloque[idx - primera][0] = ahora;
      escritas++;
    });

    if (escritas) {
      hoja.getRange(primera + 2, colEnvio, bloque.length, 1).setValues(bloque);
    }
    return { ok: true, filas: escritas };
  } catch (e) {
    _registrarEvento_('WARN', 'Servicios_TiemposEtapas.js', 'No se pudo sellar F.H Envio Resultado', 'Lote: ' + idLote + ' | ' + e.message);
    return { ok: false, filas: 0 };
  }
}

/** ID de lote comparable: mayúsculas y sin espacios. */
function TiemposEtapas_normalizarIdLote_(valor) {
  return String(valor === undefined || valor === null ? '' : valor).trim().toUpperCase().replace(/\s+/g, '');
}
