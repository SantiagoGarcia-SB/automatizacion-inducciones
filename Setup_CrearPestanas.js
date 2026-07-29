/**
 * ============================================================
 * Setup_CrearPestanas.js — Script de configuración inicial
 *
 * Ejecutar UNA VEZ manualmente desde el editor de Apps Script
 * (seleccionar función → Ejecutar). Crea las pestañas nuevas
 * sin afectar las existentes.
 *
 * Funciones:
 *   - crearPestanaUsuarios()      → Crea USUARIOS y migra datos de CORREOS
 *   - crearPestanaColaAnalisis()  → Crea COLA_ANALISIS vacía con headers
 *   - crearPestanaErroresTerceros() → Crea Errores_Terceros vacía
 *   - ejecutarSetupCompleto()     → Ejecuta las 3 anteriores de una vez
 * ============================================================
 */

/**
 * Ejecuta todo el setup de una vez. Selecciona esta función y dale Ejecutar.
 * Es idempotente: si las pestañas ya existen, no las duplica.
 */
function ejecutarSetupCompleto() {
  crearPestanaUsuarios();
  crearPestanaColaAnalisis();
  crearPestanaErroresTerceros();
  Logger.log('✅ Setup completo. Pestañas creadas correctamente.');
}

/**
 * Crea la pestaña USUARIOS con headers + migra datos desde CORREOS.
 * Si ya existe, no hace nada.
 */
function crearPestanaUsuarios() {
  var ss = SpreadsheetApp.openById(ID_HOJA_CONTROL);

  // Verificar si ya existe
  if (ss.getSheetByName('USUARIOS')) {
    Logger.log('⚠️ Pestaña USUARIOS ya existe. No se creó de nuevo.');
    return;
  }

  var hoja = ss.insertSheet('USUARIOS');

  // Headers
  var headers = [
    'EMAIL', 'NOMBRE', 'ROL', 'CUPO',
    'DIRECTOR', 'BACKUP', 'BACKUP_ACTIVO', 'ACTIVO'
  ];
  hoja.getRange(1, 1, 1, headers.length).setValues([headers]);

  // Formato de headers
  hoja.getRange(1, 1, 1, headers.length)
    .setFontWeight('bold')
    .setBackground('#253150')
    .setFontColor('#ffffff');
  hoja.setFrozenRows(1);

  // Migrar datos desde pestaña CORREOS (si existe)
  var hojaCorreos = ss.getSheetByName('CORREOS');
  if (hojaCorreos && hojaCorreos.getLastRow() > 1) {
    var datosCorreos = hojaCorreos.getDataRange().getValues();
    var filasNuevas = [];

    for (var i = 1; i < datosCorreos.length; i++) {
      var director = String(datosCorreos[i][0] || '').trim();
      var emailEjecutivo = String(datosCorreos[i][1] || '').trim();
      var backup = String(datosCorreos[i][2] || '').trim();
      var backupActivo = datosCorreos[i][3] === true;

      if (!emailEjecutivo) continue;

      // Derivar nombre del email (nombre.apellido@dominio → Nombre Apellido)
      var nombre = _derivarNombreDeEmail(emailEjecutivo);

      filasNuevas.push([
        emailEjecutivo.toLowerCase(),
        nombre,
        'COMERCIAL',
        0,
        director,
        backup,
        backupActivo,
        true
      ]);
    }

    // Escribir en batch
    if (filasNuevas.length > 0) {
      hoja.getRange(2, 1, filasNuevas.length, headers.length)
        .setValues(filasNuevas);
    }

    Logger.log('✅ USUARIOS creada con ' + filasNuevas.length + ' comerciales migrados desde CORREOS.');
  } else {
    Logger.log('✅ USUARIOS creada vacía (no se encontró CORREOS o está vacía).');
  }

  // Agregar los líderes conocidos (de CORREOS_LIDERES en Codigo.js)
  _agregarLideres(hoja, headers.length);

  // Agregar al admin del sistema
  _agregarAdmin(hoja, headers.length);

  // Ajustar anchos de columna
  hoja.autoResizeColumns(1, headers.length);
}

/**
 * Agrega los correos de CORREOS_LIDERES como rol LIDER (si no están ya).
 */
function _agregarLideres(hoja, numCols) {
  var datosExistentes = hoja.getDataRange().getValues();
  var emailsExistentes = {};
  for (var i = 1; i < datosExistentes.length; i++) {
    emailsExistentes[String(datosExistentes[i][0]).toLowerCase()] = true;
  }

  var lideres = CORREOS_LIDERES || [];
  var filasNuevas = [];

  for (var j = 0; j < lideres.length; j++) {
    var email = lideres[j].toLowerCase().trim();
    if (!email || emailsExistentes[email]) continue;

    filasNuevas.push([
      email,
      _derivarNombreDeEmail(email),
      'LIDER',
      0, '', '', false, true
    ]);
    emailsExistentes[email] = true;
  }

  if (filasNuevas.length > 0) {
    var ultimaFila = hoja.getLastRow();
    hoja.getRange(ultimaFila + 1, 1, filasNuevas.length, numCols)
      .setValues(filasNuevas);
    Logger.log('  + ' + filasNuevas.length + ' líderes agregados.');
  }
}

/**
 * Agrega al email de BCC_AUDITORIA como ADMIN (si no está ya).
 */
function _agregarAdmin(hoja, numCols) {
  if (!BCC_AUDITORIA) return;

  var datosExistentes = hoja.getDataRange().getValues();
  for (var i = 1; i < datosExistentes.length; i++) {
    if (String(datosExistentes[i][0]).toLowerCase() === BCC_AUDITORIA.toLowerCase()) {
      // Ya existe, cambiar rol a ADMIN si no lo es
      if (String(datosExistentes[i][2]).toUpperCase() !== 'ADMIN') {
        hoja.getRange(i + 1, 3).setValue('ADMIN');
      }
      return;
    }
  }

  var ultimaFila = hoja.getLastRow();
  hoja.getRange(ultimaFila + 1, 1, 1, numCols).setValues([[
    BCC_AUDITORIA.toLowerCase(),
    _derivarNombreDeEmail(BCC_AUDITORIA),
    'ADMIN',
    0, '', '', false, true
  ]]);
  Logger.log('  + Admin agregado: ' + BCC_AUDITORIA);
}

/**
 * Crea la pestaña COLA_ANALISIS con headers. Si ya existe, no hace nada.
 */
function crearPestanaColaAnalisis() {
  var ss = SpreadsheetApp.openById(ID_HOJA_CONTROL);

  if (ss.getSheetByName('COLA_ANALISIS')) {
    Logger.log('⚠️ Pestaña COLA_ANALISIS ya existe.');
    return;
  }

  var hoja = ss.insertSheet('COLA_ANALISIS');
  var headers = [
    'UUID_SISTEMA',
    'ID_LOTE',
    'ARRENDATARIO',
    'POLIZA',
    'CIUDAD',
    'DESTINO',
    'FECHA_LOTE',
    'FILA_REG_ANALISIS',
    'ESTADO',
    'ASIGNADA_A',
    'FECHA_ASIGNACION'
  ];

  hoja.getRange(1, 1, 1, headers.length).setValues([headers]);
  hoja.getRange(1, 1, 1, headers.length)
    .setFontWeight('bold')
    .setBackground('#253150')
    .setFontColor('#ffffff');
  hoja.setFrozenRows(1);
  hoja.autoResizeColumns(1, headers.length);

  Logger.log('✅ COLA_ANALISIS creada con headers.');
}

/**
 * Crea la pestaña Errores_Terceros con headers. Si ya existe, no hace nada.
 */
function crearPestanaErroresTerceros() {
  var ss = SpreadsheetApp.openById(ID_HOJA_CONTROL);

  if (ss.getSheetByName('Errores_Terceros')) {
    Logger.log('⚠️ Pestaña Errores_Terceros ya existe.');
    return;
  }

  var hoja = ss.insertSheet('Errores_Terceros');
  var headers = [
    'UUID_SISTEMA',
    'CICLO',
    'PARTICIPANTE',
    'REQUERIMIENTOS',
    'NOTA_INTERNA',
    'AUXILIAR_EMAIL',
    'FECHA_ERROR',
    'RESPUESTA_COMERCIAL',
    'ARCHIVOS_DRIVE_PATH',
    'FECHA_RESPUESTA',
    'ESTADO_ERROR'
  ];

  hoja.getRange(1, 1, 1, headers.length).setValues([headers]);
  hoja.getRange(1, 1, 1, headers.length)
    .setFontWeight('bold')
    .setBackground('#253150')
    .setFontColor('#ffffff');
  hoja.setFrozenRows(1);
  hoja.autoResizeColumns(1, headers.length);

  Logger.log('✅ Errores_Terceros creada con headers.');
}

// ============================================================
//  UTILIDADES
// ============================================================

/**
 * Deriva un nombre legible a partir de un email corporativo.
 * Ejemplo: "santiago.garcia@segurosbolivar.com" → "Santiago Garcia"
 * @param {string} email
 * @returns {string}
 */
function _derivarNombreDeEmail(email) {
  if (!email || typeof email !== 'string') return '';
  var local = email.split('@')[0] || '';
  var partes = local.split('.');
  var resultado = [];
  for (var i = 0; i < partes.length; i++) {
    var p = partes[i].trim();
    if (p.length > 0) {
      resultado.push(p.charAt(0).toUpperCase() + p.slice(1).toLowerCase());
    }
  }
  return resultado.join(' ');
}
