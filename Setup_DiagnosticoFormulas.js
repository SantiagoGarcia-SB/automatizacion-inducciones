/**
 * ============================================================
 * Setup_DiagnosticoFormulas.js
 *
 * Ejecutar manualmente desde el editor de Apps Script.
 * Responde la pregunta que ninguna auditoría de código puede
 * responder sin abrir la hoja real: las columnas de resultado
 * de "registro analisis" (Resultado Final, RESULTADO SOLICITUD,
 * RESULTADO LOTE, etc.) — ¿son fórmulas vivas o valores fijos?
 * Si son fórmulas, ¿son livianas (copiadas fila a fila) o
 * pesadas (un solo ARRAYFORMULA/QUERY/IMPORTRANGE derramado
 * sobre miles de filas, que recalcula toda la columna con
 * cualquier edición en la hoja)?
 *
 * No modifica nada — solo lee con getFormulas()/getValues().
 *
 * Seleccionar: diagnosticarFormulasResultado → Ejecutar
 * Ver resultado en: Ver → Registro de ejecución
 * ============================================================
 */

function diagnosticarFormulasResultado() {
  var hoja = SpreadsheetApp.openById(getArchivoAnalisisId()).getSheetByName('registro analisis');
  var ultimaFila = hoja.getLastRow();
  var ultimaCol = hoja.getLastColumn();
  var headers = hoja.getRange(1, 1, 1, ultimaCol).getValues()[0].map(function(h) { return String(h).trim(); });

  // Columnas de resultado / lógica de negocio a inspeccionar (ver docs/05-consolidado-final.md §6)
  var columnasDeInteres = [
    'Regla Dura Inquilino', 'Resultado Final Inquilino',
    'Regla Dura COA1', 'Resultado Final COA1',
    'Regla Dura COA2', 'Resultado Final COA2',
    'Regla Dura COA3', 'Resultado Final COA3',
    'Regla Dura COA4', 'Resultado Final COA4',
    'Regla Dura COA5', 'Resultado Final COA5',
    'Num coa aprob', 'Num coa negados analisis', 'coa evaluados',
    'Política ingresos solicitud',
    'RESULTADO SOLICITUD', 'RESULTADO SOLICITUD LNeg', 'DETALLE RESULTADO SOLICITUD',
    'RESULTADO LOTE', 'contrato_de', 'DETALLE RESULTADO COMERCIAL'
  ];

  // 1 sola lectura batch de TODAS las fórmulas y TODOS los valores de la hoja completa
  // (nunca celda por celda — misma regla de oro que el resto del proyecto)
  var filasDatos = ultimaFila - 1;
  if (filasDatos <= 0) {
    Logger.log('La hoja "registro analisis" no tiene filas de datos todavía.');
    return;
  }
  var formulas = hoja.getRange(2, 1, filasDatos, ultimaCol).getFormulas();
  var valores = hoja.getRange(2, 1, filasDatos, ultimaCol).getValues();

  Logger.log('═══════════════════════════════════════════════════');
  Logger.log('DIAGNÓSTICO DE FÓRMULAS — "registro analisis"');
  Logger.log('Filas de datos analizadas: ' + filasDatos);
  Logger.log('═══════════════════════════════════════════════════');

  var funcionesPesadasConocidas = ['ARRAYFORMULA', 'IMPORTRANGE', 'QUERY(', 'VLOOKUP', 'INDEX(', 'MATCH(', 'SUMPRODUCT', 'FILTER(', 'IMPORTXML', 'IMPORTHTML'];

  columnasDeInteres.forEach(function(nombreCol) {
    var idx = headers.indexOf(nombreCol);
    if (idx === -1) {
      Logger.log('\n❌ "' + nombreCol + '" — columna no encontrada en los headers actuales');
      return;
    }

    var totalConFormula = 0;
    var totalConValorFijo = 0;
    var totalVacias = 0;
    var formulasUnicas = {};
    var primerEjemploFormula = null;
    var primerEjemploValor = null;

    for (var f = 0; f < filasDatos; f++) {
      var celdaFormula = formulas[f][idx];
      var celdaValor = valores[f][idx];

      if (celdaFormula) {
        totalConFormula++;
        if (!primerEjemploFormula) primerEjemploFormula = celdaFormula;
        formulasUnicas[celdaFormula] = (formulasUnicas[celdaFormula] || 0) + 1;
      } else if (celdaValor !== '' && celdaValor !== null) {
        totalConValorFijo++;
        if (!primerEjemploValor) primerEjemploValor = celdaValor;
      } else {
        totalVacias++;
      }
    }

    var cantidadFormulasUnicas = Object.keys(formulasUnicas).length;
    var esDerrame = totalConFormula === 1 && filasDatos > 1; // 1 sola fórmula "viva" que llena el resto (ARRAYFORMULA en fila 2)

    Logger.log('\n📋 "' + nombreCol + '" (columna ' + (idx + 1) + ')');
    Logger.log('   Con fórmula: ' + totalConFormula + ' | Con valor fijo: ' + totalConValorFijo + ' | Vacías: ' + totalVacias);

    if (totalConFormula === 0) {
      Logger.log('   → 100% VALOR ESTÁTICO. Ejemplo: ' + JSON.stringify(primerEjemploValor));
    } else {
      Logger.log('   → Fórmulas únicas distintas encontradas: ' + cantidadFormulasUnicas);
      Logger.log('   Ejemplo de fórmula: ' + primerEjemploFormula);

      if (esDerrame) {
        Logger.log('   ⚠️ SOLO 1 fórmula activa entre ' + filasDatos + ' filas → probable ARRAYFORMULA/derrame: recalcula TODA la columna con cualquier edición en su rango de referencia, no solo la fila afectada.');
      } else if (cantidadFormulasUnicas === 1 && totalConFormula > 1) {
        Logger.log('   ℹ️ La misma fórmula está copiada en cada fila (patrón normal de "arrastrar hacia abajo") — cada fila recalcula independientemente, impacto por fila.');
      }

      var pesada = funcionesPesadasConocidas.filter(function(fn) { return primerEjemploFormula.toUpperCase().indexOf(fn) !== -1; });
      if (pesada.length > 0) {
        Logger.log('   🔴 Contiene función(es) potencialmente costosa(s): ' + pesada.join(', '));
      }
      if (primerEjemploFormula.indexOf('!') !== -1) {
        Logger.log('   🔴 Referencia cruzada a otra pestaña/hoja detectada (contiene "!") — puede depender de recálculo en otro libro.');
      }
    }
  });

  Logger.log('\n═══════════════════════════════════════════════════');
  Logger.log('CÓMO LEER ESTE RESULTADO:');
  Logger.log('- "100% VALOR ESTÁTICO" → esa columna ya es un valor fijo, no una fórmula. Sacarla del spreadsheet no cambia nada en rendimiento (solo en gobernanza/auditoría).');
  Logger.log('- "Fórmulas únicas" alto (≈ nº de filas) → fórmula copiada fila a fila, costo proporcional a filas editadas, no crítico salvo volumen muy alto.');
  Logger.log('- "SOLO 1 fórmula activa" (derrame) → el más sensible: 1 sola fórmula recalcula todo el rango en cada edición. Es el caso donde extraer la lógica a código SÍ puede mejorar el rendimiento de forma medible.');
  Logger.log('- Función costosa o referencia cruzada detectada → sube la prioridad de mover esa columna a código en vez de fórmula.');
  Logger.log('Copia este log completo y compártelo para decidir si vale la pena mover estas columnas a código.');
  Logger.log('═══════════════════════════════════════════════════');
}
