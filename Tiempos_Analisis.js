/**
 * ============================================================
 * Tiempos_Analisis — captura de Inicio y Fin del análisis
 *
 * Los analistas trabajan directo en la hoja "registro analisis". Este
 * trigger instalable (onEdit) sella en Control_General, por solicitud:
 *
 *   - "Inicio Analisis": hora de la PRIMERA edición de un campo de
 *     entrada del analista (solo si está vacía; no se mueve después).
 *   - "Fin Analisis":    hora de la ÚLTIMA edición de un campo de entrada
 *     (se sobrescribe en cada edición). Deja de actualizarse cuando el
 *     caso ya tiene REGISTRO ANALISTA SAI, para que correcciones
 *     posteriores no alarguen el análisis.
 *
 * Solo se sellan filas ya asignadas (ASIGNADA A… con valor): una edición
 * antes de asignar no cuenta. Las filas se enlazan con Control_General
 * por UUID_SISTEMA.
 *
 * Limitación: onEdit solo dispara con ediciones humanas (también pegados),
 * no con escrituras de script ni fórmulas.
 *
 * Configuración: ejecutar UNA VEZ configurarTriggerTiemposAnalisis().
 * Reutiliza Asignaciones_buscarColumna_ / Asignaciones_normalizarNombre_ y
 * Columnas_asegurar_ (Infraestructura_Concurrencia.js).
 * No usa el lock global del proyecto (ver Infraestructura_Concurrencia.js).
 * ============================================================
 */

var TIEMPOS_ANALISIS_HOJA = 'registro analisis';
var TIEMPOS_ANALISIS_COL_INICIO = 'Inicio Analisis';
var TIEMPOS_ANALISIS_COL_FIN = 'Fin Analisis';
var TIEMPOS_ANALISIS_MAX_FILAS = 200;

/** Campos que digita el analista (por inquilino y COA1–5) + comentarios. */
function TiemposAnalisis_nombresEntrada_() {
  var nombres = ['Ingresos', 'Acierta', 'ocupacion', 'Respuesta modelo inquilino',
    'Regla Dura Inquilino', 'comentarios del analista'];
  for (var n = 1; n <= 5; n++) {
    nombres.push('Ingresos COA' + n, 'Acierta COA' + n, 'Ocupacion COA' + n,
      'Respuesta modelo COA' + n, 'Regla Dura COA' + n);
  }
  return nombres;
}

/**
 * Columnas (1-based) de registro analisis que son campos de entrada del analista.
 * Compara sin mayúsculas/tildes, así 'Ocupacion COA1' y 'ocupacion COA1' cuentan ambas.
 * @param {Array} encabezados
 * @returns {number[]}
 */
function TiemposAnalisis_columnasEntrada_(encabezados) {
  var set = {};
  TiemposAnalisis_nombresEntrada_().forEach(function (n) {
    set[Asignaciones_normalizarNombre_(n)] = true;
  });
  var cols = [];
  for (var i = 0; i < encabezados.length; i++) {
    if (set[Asignaciones_normalizarNombre_(encabezados[i])]) cols.push(i + 1);
  }
  return cols;
}

/**
 * Garantiza las columnas de sello en Control_General (al final, siempre por header).
 * Usa Columnas_asegurar_: camino rápido sin lock cuando ya existen.
 * @returns {{inicio:number, fin:number}} Índices 1-based.
 */
function TiemposAnalisis_asegurarColumnas_(hojaControl) {
  var mapa = Columnas_asegurar_(hojaControl, [TIEMPOS_ANALISIS_COL_INICIO, TIEMPOS_ANALISIS_COL_FIN]);
  return { inicio: mapa[TIEMPOS_ANALISIS_COL_INICIO], fin: mapa[TIEMPOS_ANALISIS_COL_FIN] };
}

/**
 * Handler del trigger onEdit instalable sobre el libro de análisis.
 * @param {GoogleAppsScript.Events.SheetsOnEdit} e
 * @returns {{filas:number}|undefined} Cantidad de solicitudes selladas (útil en tests).
 */
function registrarTiemposAnalisis(e) {
  if (!e || !e.range) return;

  var rango = e.range;
  var hoja = rango.getSheet();
  if (hoja.getName() !== TIEMPOS_ANALISIS_HOJA || rango.getRow() < 2) return;

  // Borrar el contenido de una sola celda no es "diligenciar".
  var unaCelda = rango.getNumRows() === 1 && rango.getNumColumns() === 1;
  if (unaCelda && (e.value === undefined || e.value === '')) return;

  var encabezados = hoja.getRange(1, 1, 1, hoja.getLastColumn()).getValues()[0];
  var c1 = rango.getColumn();
  var c2 = c1 + rango.getNumColumns() - 1;
  var tocaEntrada = TiemposAnalisis_columnasEntrada_(encabezados).some(function (c) { return c >= c1 && c <= c2; });
  if (!tocaEntrada) return;

  var colAsignada = Asignaciones_buscarColumna_(encabezados, 'ASIGNADA A');
  var colSai = Asignaciones_buscarColumna_(encabezados, 'REGISTRO ANALISTA SAI');
  var colUuid = Asignaciones_buscarColumna_(encabezados, 'UUID_SISTEMA');
  if (!colAsignada || !colUuid) return;

  var fila1 = rango.getRow();
  var nFilas = Math.min(rango.getNumRows(), TIEMPOS_ANALISIS_MAX_FILAS);
  var leer = function (col) {
    if (!col) return new Array(nFilas).fill('');
    return hoja.getRange(fila1, col, nFilas, 1).getValues().map(function (f) { return f[0]; });
  };
  var asignadas = leer(colAsignada);
  var sai = leer(colSai);
  var uuids = leer(colUuid);

  var candidatas = [];
  for (var i = 0; i < nFilas; i++) {
    if (!String(asignadas[i] || '').trim()) continue;          // aún no asignada
    if (String(sai[i] || '').trim()) continue;                 // ya terminó: no mover el Fin
    var uuid = String(uuids[i] || '').trim();
    if (uuid) candidatas.push(uuid);
  }
  if (!candidatas.length) return { filas: 0 };

  // Sin lock global: cada edición escribe solo las celdas de su fila (Inicio solo si
  // está vacía, Fin se sobrescribe). Un cruce entre dos ediciones simultáneas de la
  // misma fila solo cambia la hora por milisegundos. La única sección crítica
  // (crear columnas) la protege Columnas_asegurar_.
  try {
    var hojaControl = SpreadsheetRegistry_get(getHojaControlId()).getSheetByName('Control_General');
    if (!hojaControl) return;

    var cols = TiemposAnalisis_asegurarColumnas_(hojaControl);
    var encControl = hojaControl.getRange(1, 1, 1, hojaControl.getLastColumn()).getValues()[0];
    var colUuidControl = Asignaciones_buscarColumna_(encControl, 'UUID_SISTEMA');
    var ultima = hojaControl.getLastRow();
    if (!colUuidControl || ultima < 2) return;

    var uuidsControl = hojaControl.getRange(2, colUuidControl, ultima - 1, 1).getValues();
    var inicios = hojaControl.getRange(2, cols.inicio, ultima - 1, 1).getValues();
    var fila = {};
    for (var k = 0; k < uuidsControl.length; k++) {
      var u = String(uuidsControl[k][0] || '').trim();
      if (u) fila[u] = k;
    }

    var ahora = new Date();
    var selladas = 0;
    candidatas.forEach(function (uuidFila) {
      var idx = fila[uuidFila];
      if (idx === undefined) return;
      if (!String(inicios[idx][0] || '').trim()) {
        hojaControl.getRange(idx + 2, cols.inicio).setValue(ahora);
      }
      hojaControl.getRange(idx + 2, cols.fin).setValue(ahora);
      selladas++;
    });
    return { filas: selladas };
  } catch (error) {
    console.error('Tiempos_Analisis: ' + error.message);
  }
}

/**
 * Crea (idempotente) el trigger onEdit sobre el libro de análisis.
 * Ejecutar UNA VEZ desde el editor por un administrador autorizado.
 */
function configurarTriggerTiemposAnalisis() {
  var handler = 'registrarTiemposAnalisis';
  var triggers = ScriptApp.getProjectTriggers();
  for (var i = 0; i < triggers.length; i++) {
    if (triggers[i].getHandlerFunction() === handler) ScriptApp.deleteTrigger(triggers[i]);
  }
  ScriptApp.newTrigger(handler)
    .forSpreadsheet(getArchivoAnalisisId())
    .onEdit()
    .create();
  return { ok: true, mensaje: 'Trigger de tiempos de análisis configurado.' };
}
