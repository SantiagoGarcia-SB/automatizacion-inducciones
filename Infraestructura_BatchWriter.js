/**
 * ============================================================
 * INFRAESTRUCTURA_BATCHWRITER.JS — Utilidad de escrituras agrupadas
 *
 * Agrupa operaciones de escritura en bloques contiguos para minimizar
 * las llamadas a setValues() en Google Sheets (~200-800ms por llamada).
 *
 * Estrategia: dado un conjunto de operaciones {fila, columna, valor},
 * se agrupan las filas contiguas y se ejecuta un solo setValues() por
 * cada bloque contiguo de filas consecutivas.
 *
 * @see Requirement 5: Optimizar escrituras batch en Control_General
 * ============================================================
 */

/**
 * Agrupa un array de números de fila en bloques de filas contiguas.
 * Retorna un array de {inicio, cantidad} donde inicio es la primera fila
 * del bloque y cantidad es cuántas filas consecutivas hay.
 *
 * Propiedad garantizada:
 * - Para cualquier conjunto no vacío de números de fila, retorna exactamente K bloques
 *   donde K es el número de secuencias máximas de enteros consecutivos en el conjunto ordenado.
 * - La suma de todas las cantidades iguala la cantidad total de filas de entrada (sin duplicados).
 *
 * @param {number[]} filas — Array de números de fila (no necesariamente ordenados, pueden tener duplicados)
 * @returns {Array<{inicio: number, cantidad: number}>} Bloques contiguos ordenados por inicio
 */
function BatchWriter_agruparFilasContiguas(filas) {
  if (!filas || filas.length === 0) {
    return [];
  }

  // Eliminar duplicados y ordenar numéricamente
  var unicas = [];
  var visto = {};
  for (var i = 0; i < filas.length; i++) {
    var f = filas[i];
    if (!visto[f]) {
      visto[f] = true;
      unicas.push(f);
    }
  }
  unicas.sort(function (a, b) { return a - b; });

  var bloques = [];
  var inicio = unicas[0];
  var cantidad = 1;

  for (var j = 1; j < unicas.length; j++) {
    if (unicas[j] === unicas[j - 1] + 1) {
      cantidad++;
    } else {
      bloques.push({ inicio: inicio, cantidad: cantidad });
      inicio = unicas[j];
      cantidad = 1;
    }
  }
  // Último bloque
  bloques.push({ inicio: inicio, cantidad: cantidad });

  return bloques;
}

/**
 * Agrupa un conjunto de operaciones {fila, columna, valor} en bloques contiguos
 * y ejecuta un setValues() por bloque. Cada bloque cubre un rango rectangular
 * definido por las filas contiguas y el rango de columnas min-max de esas filas.
 *
 * Algoritmo:
 * 1. Agrupa operaciones por bloques de filas contiguas.
 * 2. Para cada bloque, determina la columna mínima y máxima.
 * 3. Construye una matriz 2D (filas × columnas del bloque).
 * 4. Lee los valores actuales del rango para preservar celdas no modificadas.
 * 5. Aplica las operaciones sobre la matriz.
 * 6. Ejecuta un solo setValues() por bloque.
 *
 * @param {GoogleAppsScript.Spreadsheet.Sheet} hoja — Hoja destino
 * @param {Array<{fila: number, columna: number, valor: any}>} operaciones — Operaciones a ejecutar (fila y columna 1-based)
 * @returns {number} Cantidad de llamadas setValues() ejecutadas
 * @sheets_read N (una getValues por bloque para preservar datos existentes)
 * @sheets_write N (un setValues por bloque contiguo de filas)
 */
function BatchWriter_escribir(hoja, operaciones) {
  if (!operaciones || operaciones.length === 0) {
    return 0;
  }

  // Paso 1: Extraer filas únicas y agrupar en bloques contiguos
  var filasUnicas = [];
  var filasVistas = {};
  for (var i = 0; i < operaciones.length; i++) {
    var fila = operaciones[i].fila;
    if (!filasVistas[fila]) {
      filasVistas[fila] = true;
      filasUnicas.push(fila);
    }
  }

  var bloques = BatchWriter_agruparFilasContiguas(filasUnicas);

  // Paso 2: Crear un mapa rápido de fila → índice de bloque
  var filaABloque = {};
  for (var b = 0; b < bloques.length; b++) {
    var bloque = bloques[b];
    for (var f = bloque.inicio; f < bloque.inicio + bloque.cantidad; f++) {
      filaABloque[f] = b;
    }
  }

  // Paso 3: Agrupar operaciones por bloque
  var operacionesPorBloque = [];
  for (var k = 0; k < bloques.length; k++) {
    operacionesPorBloque.push([]);
  }
  for (var j = 0; j < operaciones.length; j++) {
    var op = operaciones[j];
    var idxBloque = filaABloque[op.fila];
    operacionesPorBloque[idxBloque].push(op);
  }

  // Paso 4: Para cada bloque, determinar rango de columnas, leer, aplicar y escribir
  var llamadasSetValues = 0;

  for (var m = 0; m < bloques.length; m++) {
    var bloqueActual = bloques[m];
    var ops = operacionesPorBloque[m];

    if (ops.length === 0) {
      continue;
    }

    // Determinar columna min y max del bloque
    var colMin = ops[0].columna;
    var colMax = ops[0].columna;
    for (var n = 1; n < ops.length; n++) {
      if (ops[n].columna < colMin) colMin = ops[n].columna;
      if (ops[n].columna > colMax) colMax = ops[n].columna;
    }

    var numFilas = bloqueActual.cantidad;
    var numCols = colMax - colMin + 1;

    // Leer valores actuales para preservar celdas no modificadas
    var rango = hoja.getRange(bloqueActual.inicio, colMin, numFilas, numCols);
    var valores = rango.getValues();

    // Aplicar operaciones sobre la matriz
    for (var p = 0; p < ops.length; p++) {
      var operacion = ops[p];
      var filaRelativa = operacion.fila - bloqueActual.inicio;
      var colRelativa = operacion.columna - colMin;
      valores[filaRelativa][colRelativa] = operacion.valor;
    }

    // Escribir bloque completo
    rango.setValues(valores);
    llamadasSetValues++;
  }

  return llamadasSetValues;
}
