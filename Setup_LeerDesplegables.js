/**
 * ============================================================
 * Setup_LeerDesplegables.js
 *
 * Ejecutar manualmente desde el editor de Apps Script.
 * Lee las validaciones de datos (desplegables) de las columnas
 * que el analista diligencia en "registro analisis" y las
 * imprime en el log.
 *
 * Seleccionar: leerDesplegablesAnalisis → Ejecutar
 * Ver resultado en: Ver → Registro de ejecución
 * ============================================================
 */

function leerDesplegablesAnalisis() {
  var hoja = SpreadsheetApp.openById(ID_ARCHIVO_ANALISIS).getSheetByName('registro analisis');
  var headers = hoja.getRange(1, 1, 1, hoja.getLastColumn()).getValues()[0];

  // Columnas que el analista edita
  var columnasDeInteres = [
    'Ingresos', 'Acierta', 'ocupacion',
    'Respuesta modelo inquilino', 'Regla Dura Inquilino',
    'Ingresos COA1', 'Acierta COA1', 'Ocupacion COA1', 'ocupacion COA1',
    'Respuesta modelo COA1', 'Regla Dura COA1',
    'Ingresos COA2', 'Acierta COA2', 'Ocupacion COA2', 'ocupacion COA2',
    'Respuesta modelo COA2', 'Regla Dura COA2',
    'Ingresos COA3', 'Acierta COA3', 'Ocupacion COA3', 'ocupacion COA3',
    'Respuesta modelo COA3', 'Regla Dura COA3',
    'Ingresos COA4', 'Acierta COA4', 'Ocupacion COA4', 'ocupacion COA4',
    'Respuesta modelo COA4', 'Regla Dura COA4',
    'Ingresos COA5', 'Acierta COA5', 'Ocupacion COA5', 'ocupacion COA5',
    'Respuesta modelo COA5', 'Regla Dura COA5',
    'comentarios del analista'
  ];

  Logger.log('═══════════════════════════════════════════════════');
  Logger.log('DESPLEGABLES EN "registro analisis"');
  Logger.log('═══════════════════════════════════════════════════');

  for (var c = 0; c < columnasDeInteres.length; c++) {
    var nombre = columnasDeInteres[c];
    var idx = -1;
    for (var h = 0; h < headers.length; h++) {
      if (String(headers[h]).trim() === nombre) { idx = h; break; }
    }

    if (idx === -1) {
      Logger.log('\n❌ "' + nombre + '" — NO ENCONTRADA');
      continue;
    }

    // Leer validación de la fila 2 (primera fila de datos)
    var celda = hoja.getRange(2, idx + 1);
    var validacion = celda.getDataValidation();

    if (!validacion) {
      Logger.log('\n📝 "' + nombre + '" (col ' + (idx + 1) + ') — SIN VALIDACIÓN (campo libre)');
      continue;
    }

    var tipo = validacion.getCriteriaType();
    var valores = validacion.getCriteriaValues();

    Logger.log('\n📋 "' + nombre + '" (col ' + (idx + 1) + ')');
    Logger.log('   Tipo: ' + tipo);

    if (tipo === SpreadsheetApp.DataValidationCriteria.VALUE_IN_LIST) {
      Logger.log('   Opciones: ' + JSON.stringify(valores[0]));
    } else if (tipo === SpreadsheetApp.DataValidationCriteria.VALUE_IN_RANGE) {
      var rango = valores[0];
      Logger.log('   Rango: ' + rango.getA1Notation());
      // Intentar leer los valores del rango
      try {
        var valsRango = rango.getValues().flat().filter(function(v) { return v !== ''; });
        Logger.log('   Valores (' + valsRango.length + '): ' + JSON.stringify(valsRango.slice(0, 20)));
        if (valsRango.length > 20) Logger.log('   ... y ' + (valsRango.length - 20) + ' más');
      } catch(e) {
        Logger.log('   (No se pudo leer el rango: ' + e.message + ')');
      }
    } else if (tipo === SpreadsheetApp.DataValidationCriteria.NUMBER_BETWEEN) {
      Logger.log('   Rango numérico: ' + valores[0] + ' a ' + valores[1]);
    } else if (tipo === SpreadsheetApp.DataValidationCriteria.NUMBER_GREATER_THAN) {
      Logger.log('   Mayor que: ' + valores[0]);
    } else if (tipo === SpreadsheetApp.DataValidationCriteria.NUMBER_LESS_THAN) {
      Logger.log('   Menor que: ' + valores[0]);
    } else {
      Logger.log('   Valores crudos: ' + JSON.stringify(valores));
    }
  }

  Logger.log('\n═══════════════════════════════════════════════════');
  Logger.log('FIN — Copia estos resultados y compártelos');
  Logger.log('═══════════════════════════════════════════════════');
}
