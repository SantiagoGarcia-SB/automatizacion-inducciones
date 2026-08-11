/**
 * ============================================================
 * Setup_MigracionV2.js — Migración idempotente de USUARIOS a esquema V2
 *
 * Migra la pestaña USUARIOS del esquema viejo (8 columnas) al nuevo (7 columnas).
 * Esquema viejo: EMAIL, NOMBRE, ROL, CUPO, DIRECTOR, BACKUP, BACKUP_ACTIVO, ACTIVO
 * Esquema nuevo: EMAIL, ROL, ACTIVO, CUPO, EMAIL_DIRECTOR, EMAIL_GERENTE, EMAILS_ALTERNOS
 *
 * Transformaciones:
 *   - ROL "COMERCIAL" → "CONSULTOR"
 *   - ROL "LIDER" → "DIRECTOR"
 *   - Columna DIRECTOR vieja → EMAIL_DIRECTOR nueva
 *   - Se descartan: NOMBRE, BACKUP, BACKUP_ACTIVO
 *   - Se agregan vacíos: EMAIL_GERENTE, EMAILS_ALTERNOS
 *
 * Idempotencia: usa PropertiesService._MIGRADO_V2 para detectar re-ejecución.
 *
 * Funciones:
 *   - migrarUsuariosAV2()           → Ejecutar manualmente; migra datos existentes
 *   - _crearPestanaUsuariosV2(ss)   → Crea pestaña con headers formateados
 * ============================================================
 */

/**
 * Migra la pestaña USUARIOS del esquema viejo (8 cols) al nuevo (7 cols).
 * Idempotente: detecta si ya se ejecutó mediante propiedad de script '_MIGRADO_V2'.
 *
 * Pasos:
 *   1. Verificar flag _MIGRADO_V2 → si ya migrado, salir
 *   2. Leer datos de la pestaña USUARIOS vieja (8 columnas)
 *   3. Transformar cada fila al nuevo esquema (7 columnas)
 *   4. Renombrar pestaña vieja a USUARIOS_BACKUP
 *   5. Crear nueva pestaña USUARIOS con headers formateados
 *   6. Escribir datos migrados
 *   7. Guardar propiedad _MIGRADO_V2 = 'true'
 */
function migrarUsuariosAV2() {
  // 1. Verificar si ya se migró
  var props = PropertiesService.getScriptProperties();
  if (props.getProperty('_MIGRADO_V2') === 'true') {
    Logger.log('Ya migrado');
    return;
  }

  // 2. Abrir spreadsheet y leer datos viejos
  var ss = SpreadsheetApp.openById(ID_HOJA_CONTROL);
  var hojaVieja = ss.getSheetByName('USUARIOS');

  if (!hojaVieja) {
    Logger.log('⚠️ Pestaña USUARIOS no encontrada. Creando nueva vacía.');
    _crearPestanaUsuariosV2(ss);
    props.setProperty('_MIGRADO_V2', 'true');
    return;
  }

  var datosViejos = hojaVieja.getDataRange().getValues();

  // Verificar que tenga datos (mínimo header + 1 fila)
  if (datosViejos.length < 2) {
    Logger.log('⚠️ Pestaña USUARIOS solo tiene headers o está vacía. Creando nueva.');
    ss.deleteSheet(hojaVieja);
    _crearPestanaUsuariosV2(ss);
    props.setProperty('_MIGRADO_V2', 'true');
    return;
  }

  // 3. Transformar cada fila del esquema viejo al nuevo
  // Esquema viejo (8 cols): EMAIL(0), NOMBRE(1), ROL(2), CUPO(3), DIRECTOR(4), BACKUP(5), BACKUP_ACTIVO(6), ACTIVO(7)
  // Esquema nuevo (7 cols): EMAIL(0), ROL(1), ACTIVO(2), CUPO(3), EMAIL_DIRECTOR(4), EMAIL_GERENTE(5), EMAILS_ALTERNOS(6)
  var datosMigrados = [];

  for (var i = 1; i < datosViejos.length; i++) {
    var fila = datosViejos[i];
    var email = String(fila[0] || '').toLowerCase().trim();

    // Saltar filas vacías
    if (!email) continue;

    // Transformar ROL: COMERCIAL → CONSULTOR, LIDER → DIRECTOR, ADMINISTRADOR → ADMIN
    var rolViejo = String(fila[2] || '').toUpperCase().trim();
    var rolNuevo = rolViejo;
    if (rolViejo === 'COMERCIAL') {
      rolNuevo = 'CONSULTOR';
    } else if (rolViejo === 'LIDER') {
      rolNuevo = 'DIRECTOR';
    } else if (rolViejo === 'ADMINISTRADOR') {
      rolNuevo = 'ADMIN';
    }

    // Mapear ACTIVO (columna vieja H=7)
    var activoRaw = fila[7];
    var activo = (activoRaw === true || activoRaw === 'TRUE' || activoRaw === 'true' || activoRaw === 'True');

    // Mapear CUPO (columna vieja D=3)
    var cupo = Number(fila[3]) || 0;

    // Mapear DIRECTOR viejo (columna E=4) → EMAIL_DIRECTOR nuevo
    var emailDirector = String(fila[4] || '').toLowerCase().trim();

    // EMAIL_GERENTE y EMAILS_ALTERNOS quedan vacíos
    var emailGerente = '';
    var emailsAlternos = '';

    datosMigrados.push([
      email,
      rolNuevo,
      activo,
      cupo,
      emailDirector,
      emailGerente,
      emailsAlternos
    ]);
  }

  // 4. Renombrar pestaña vieja a USUARIOS_BACKUP
  hojaVieja.setName('USUARIOS_BACKUP');

  // 5. Crear nueva pestaña con headers formateados
  var hojaNueva = _crearPestanaUsuariosV2(ss);

  // 6. Escribir datos migrados
  if (datosMigrados.length > 0) {
    hojaNueva.getRange(2, 1, datosMigrados.length, 7).setValues(datosMigrados);
  }

  // 7. Guardar propiedad de migración completada
  props.setProperty('_MIGRADO_V2', 'true');

  Logger.log('✅ Migración V2 completada. ' + datosMigrados.length + ' usuarios migrados.');
}

/**
 * Enriquece la pestaña USUARIOS con datos de jerarquía (EMAIL_GERENTE, EMAILS_ALTERNOS)
 * y corrige roles que no están en el enum (ADMINISTRADOR → ADMIN).
 *
 * Usa un mapa hardcodeado con la información real de la organización.
 * Idempotente: puede ejecutarse múltiples veces sin efectos secundarios.
 *
 * Ejecutar DESPUÉS de migrarUsuariosAV2().
 */
function enriquecerUsuariosConJerarquia() {
  var ss = SpreadsheetApp.openById(ID_HOJA_CONTROL);
  var hoja = ss.getSheetByName('USUARIOS');

  if (!hoja) {
    Logger.log('⚠️ Pestaña USUARIOS no encontrada. Ejecuta migrarUsuariosAV2() primero.');
    return;
  }

  var datos = hoja.getDataRange().getValues();
  if (datos.length < 2) {
    Logger.log('⚠️ Pestaña USUARIOS vacía.');
    return;
  }

  // ─── Mapa de jerarquía y datos adicionales (fuente: xlsx organización) ────
  var JERARQUIA = _obtenerMapaJerarquia();

  var cambios = 0;

  for (var i = 1; i < datos.length; i++) {
    var email = String(datos[i][0] || '').toLowerCase().trim();
    if (!email) continue;

    var rolActual = String(datos[i][1] || '').toUpperCase().trim();
    var huboModificacion = false;

    // Corregir rol ADMINISTRADOR → ADMIN
    if (rolActual === 'ADMINISTRADOR') {
      datos[i][1] = 'ADMIN';
      huboModificacion = true;
    }

    // Buscar en el mapa de jerarquía
    var info = JERARQUIA[email];
    if (info) {
      // Actualizar ROL si el mapa lo define y es diferente
      if (info.rol && info.rol !== String(datos[i][1] || '').toUpperCase().trim()) {
        datos[i][1] = info.rol;
        huboModificacion = true;
      }

      // Actualizar ACTIVO si viene definido
      if (info.activo !== undefined) {
        var activoActual = (datos[i][2] === true || datos[i][2] === 'TRUE' || datos[i][2] === 'true');
        if (activoActual !== info.activo) {
          datos[i][2] = info.activo;
          huboModificacion = true;
        }
      }

      // Actualizar EMAIL_DIRECTOR (col E = index 4)
      if (info.emailDirector !== undefined) {
        var dirActual = String(datos[i][4] || '').toLowerCase().trim();
        if (dirActual !== info.emailDirector) {
          datos[i][4] = info.emailDirector;
          huboModificacion = true;
        }
      }

      // Actualizar EMAIL_GERENTE (col F = index 5)
      if (info.emailGerente !== undefined) {
        var gerActual = String(datos[i][5] || '').toLowerCase().trim();
        if (gerActual !== info.emailGerente) {
          datos[i][5] = info.emailGerente;
          huboModificacion = true;
        }
      }

      // Actualizar EMAILS_ALTERNOS (col G = index 6)
      if (info.emailsAlternos !== undefined) {
        var altActual = String(datos[i][6] || '').trim();
        if (altActual !== info.emailsAlternos) {
          datos[i][6] = info.emailsAlternos;
          huboModificacion = true;
        }
      }
    }

    if (huboModificacion) cambios++;
  }

  // Agregar usuarios que están en el mapa pero NO en la pestaña actual
  var emailsExistentes = {};
  for (var j = 1; j < datos.length; j++) {
    var e = String(datos[j][0] || '').toLowerCase().trim();
    if (e) emailsExistentes[e] = true;
  }

  var nuevos = [];
  var emailsJerarquia = Object.keys(JERARQUIA);
  for (var k = 0; k < emailsJerarquia.length; k++) {
    var emailNuevo = emailsJerarquia[k];
    if (!emailsExistentes[emailNuevo]) {
      var infoNuevo = JERARQUIA[emailNuevo];
      nuevos.push([
        emailNuevo,
        infoNuevo.rol || 'CONSULTOR',
        infoNuevo.activo !== undefined ? infoNuevo.activo : true,
        infoNuevo.cupo || 0,
        infoNuevo.emailDirector || '',
        infoNuevo.emailGerente || '',
        infoNuevo.emailsAlternos || ''
      ]);
    }
  }

  // Escribir cambios
  if (cambios > 0) {
    hoja.getRange(1, 1, datos.length, 7).setValues(datos);
  }

  // Escribir nuevos usuarios al final
  if (nuevos.length > 0) {
    var ultimaFila = hoja.getLastRow();
    hoja.getRange(ultimaFila + 1, 1, nuevos.length, 7).setValues(nuevos);
  }

  Logger.log('✅ Enriquecimiento completado. ' + cambios + ' registros actualizados, ' + nuevos.length + ' usuarios nuevos agregados.');
}

/**
 * Mapa con la información completa de jerarquía organizacional.
 * Fuente: xlsx de configuración (agosto 2026).
 * @returns {Object<string, {rol:string, activo:boolean, emailDirector:string, emailGerente:string, emailsAlternos:string}>}
 */
function _obtenerMapaJerarquia() {
  return {
    // ─── ADMINISTRADORES (ADMIN) ─────────────────────────────────────────────
    'santiago.garcia@segurosbolivar.com': { rol: 'ADMIN', activo: true, emailDirector: '', emailGerente: '', emailsAlternos: '' },
    'desarrollocrmlibertador@ellibertador.co': { rol: 'ADMIN', activo: true, emailDirector: '', emailGerente: '', emailsAlternos: '' },
    'mary.luz.zapata@segurosbolivar.com': { rol: 'ADMIN', activo: false, emailDirector: '', emailGerente: '', emailsAlternos: '' },
    'paola.munoz@segurosbolivar.com': { rol: 'ADMIN', activo: true, emailDirector: '', emailGerente: '', emailsAlternos: '' },
    'diana.maldonado@segurosbolivar.com': { rol: 'ADMIN', activo: true, emailDirector: '', emailGerente: '', emailsAlternos: '' },
    'luisa.castellanos@segurosbolivar.com': { rol: 'ADMIN', activo: true, emailDirector: '', emailGerente: '', emailsAlternos: '' },

    // ─── ASESORES ────────────────────────────────────────────────────────────
    'guillermo.sarmiento@segurosbolivar.com': { rol: 'ASESOR', activo: true, emailDirector: '', emailGerente: '', emailsAlternos: '' },
    'nestor.zapata.sanchez@segurosbolivar.com': { rol: 'ASESOR', activo: true, emailDirector: '', emailGerente: '', emailsAlternos: '' },
    'jeimy.ballesteros@segurosbolivar.com': { rol: 'ASESOR', activo: true, emailDirector: '', emailGerente: '', emailsAlternos: '' },

    // ─── GERENTES ────────────────────────────────────────────────────────────
    'catalina.mora@segurosbolivar.com': { rol: 'GERENTE', activo: true, emailDirector: '', emailGerente: '', emailsAlternos: '' },
    'eliana.robayo@serviciosbolivar.com': { rol: 'GERENTE', activo: true, emailDirector: '', emailGerente: '', emailsAlternos: '' },
    'yeny.barrera@segurosbolivar.com': { rol: 'GERENTE', activo: true, emailDirector: '', emailGerente: '', emailsAlternos: '' },

    // ─── DIRECTORES ──────────────────────────────────────────────────────────
    'carolina.salazar@segurosbolivar.com': { rol: 'DIRECTOR', activo: true, emailDirector: '', emailGerente: 'catalina.mora@segurosbolivar.com', emailsAlternos: '' },
    'sara.bedoya@aselibertador.com': { rol: 'DIRECTOR', activo: true, emailDirector: '', emailGerente: 'catalina.mora@segurosbolivar.com', emailsAlternos: '' },
    'maria.victoria.castro@segurosbolivar.com': { rol: 'DIRECTOR', activo: true, emailDirector: '', emailGerente: 'catalina.mora@segurosbolivar.com', emailsAlternos: '' },
    'nasly.pinzon@segurosbolivar.com': { rol: 'DIRECTOR', activo: true, emailDirector: '', emailGerente: 'catalina.mora@segurosbolivar.com', emailsAlternos: '' },
    'magda.ramirez@segurosbolivar.com': { rol: 'DIRECTOR', activo: true, emailDirector: '', emailGerente: 'eliana.robayo@serviciosbolivar.com', emailsAlternos: '' },
    'paola.mora@segurosbolivar.com': { rol: 'DIRECTOR', activo: true, emailDirector: '', emailGerente: 'eliana.robayo@serviciosbolivar.com', emailsAlternos: '' },
    'javier.merchan@segurosbolivar.com': { rol: 'DIRECTOR', activo: true, emailDirector: '', emailGerente: 'eliana.robayo@serviciosbolivar.com', emailsAlternos: '' },
    'yuli.marin@aselibertador.com': { rol: 'DIRECTOR', activo: true, emailDirector: '', emailGerente: 'yeny.barrera@segurosbolivar.com', emailsAlternos: '' },
    'maria.echeverri@segurosbolivar.com': { rol: 'DIRECTOR', activo: true, emailDirector: '', emailGerente: 'yeny.barrera@segurosbolivar.com', emailsAlternos: '' },
    'paola.andrea.chacon@segurosbolivar.com': { rol: 'DIRECTOR', activo: true, emailDirector: '', emailGerente: 'yeny.barrera@segurosbolivar.com', emailsAlternos: '' },
    'wilber.barrera@proyectivaseguros.com': { rol: 'DIRECTOR', activo: true, emailDirector: '', emailGerente: '', emailsAlternos: '' },

    // ─── CONSULTORES (con emailDirector, emailGerente vacío, algunos con alternos) ──
    'carolina.morales@segurosbolivar.com': { rol: 'CONSULTOR', activo: true, emailDirector: 'carolina.salazar@segurosbolivar.com', emailGerente: '', emailsAlternos: '' },
    'christian.londono@segurosbolivar.com': { rol: 'CONSULTOR', activo: true, emailDirector: 'carolina.salazar@segurosbolivar.com', emailGerente: '', emailsAlternos: 'christian.londono@aselibertador.com' },
    'juan.chaverra@segurosbolivar.com': { rol: 'CONSULTOR', activo: true, emailDirector: 'carolina.salazar@segurosbolivar.com', emailGerente: '', emailsAlternos: '' },
    'sara.villada@segurosbolivar.com': { rol: 'CONSULTOR', activo: true, emailDirector: 'carolina.salazar@segurosbolivar.com', emailGerente: '', emailsAlternos: '' },
    'sergio.montoya@segurosbolivar.com': { rol: 'CONSULTOR', activo: true, emailDirector: 'carolina.salazar@segurosbolivar.com', emailGerente: '', emailsAlternos: 'sergio.montoya@aselibertador.com' },
    'karen.juliana.moreno@segurosbolivar.com': { rol: 'CONSULTOR', activo: true, emailDirector: 'javier.merchan@segurosbolivar.com', emailGerente: '', emailsAlternos: '' },
    'leidy.pineros@segurosbolivar.com': { rol: 'CONSULTOR', activo: true, emailDirector: 'javier.merchan@segurosbolivar.com', emailGerente: '', emailsAlternos: 'leidy.pineros@aselibertador.com' },
    'andres.junca@segurosbolivar.com': { rol: 'CONSULTOR', activo: true, emailDirector: 'magda.ramirez@segurosbolivar.com', emailGerente: '', emailsAlternos: 'andres.junca@aselibertador.com' },
    'geni.padilla@segurosbolivar.com': { rol: 'CONSULTOR', activo: true, emailDirector: 'maria.echeverri@segurosbolivar.com', emailGerente: '', emailsAlternos: '' },
    'jose.acosta.felizola@segurosbolivar.com': { rol: 'CONSULTOR', activo: true, emailDirector: 'maria.echeverri@segurosbolivar.com', emailGerente: '', emailsAlternos: 'jose.acosta.felizola@aselibertador.com' },
    'lesli.ortega@segurosbolivar.com': { rol: 'CONSULTOR', activo: true, emailDirector: 'maria.echeverri@segurosbolivar.com', emailGerente: '', emailsAlternos: '' },
    'libia.bonilla@segurosbolivar.com': { rol: 'CONSULTOR', activo: true, emailDirector: 'maria.echeverri@segurosbolivar.com', emailGerente: '', emailsAlternos: '' },
    'eliana.julio@segurosbolivar.com': { rol: 'CONSULTOR', activo: true, emailDirector: 'nasly.pinzon@segurosbolivar.com', emailGerente: '', emailsAlternos: '' },
    'ana.romero@segurosbolivar.com': { rol: 'CONSULTOR', activo: true, emailDirector: 'nasly.pinzon@segurosbolivar.com', emailGerente: '', emailsAlternos: '' },
    'bleydis.del.torres@segurosbolivar.com': { rol: 'CONSULTOR', activo: true, emailDirector: 'nasly.pinzon@segurosbolivar.com', emailGerente: '', emailsAlternos: '' },
    'daniela.piedrahita@segurosbolivar.com': { rol: 'CONSULTOR', activo: true, emailDirector: 'paola.andrea.chacon@segurosbolivar.com', emailGerente: '', emailsAlternos: '' },
    'julian.aguirre.delgado@segurosbolivar.com': { rol: 'CONSULTOR', activo: true, emailDirector: 'paola.andrea.chacon@segurosbolivar.com', emailGerente: '', emailsAlternos: 'julian.aguirre.delgado@aselibertador.com' },
    'luis.giron@segurosbolivar.com': { rol: 'CONSULTOR', activo: true, emailDirector: 'paola.andrea.chacon@segurosbolivar.com', emailGerente: '', emailsAlternos: '' },
    'maria.hernandez@segurosbolivar.com': { rol: 'CONSULTOR', activo: true, emailDirector: 'paola.mora@segurosbolivar.com', emailGerente: '', emailsAlternos: '' },
    'jennifer.zamudio@segurosbolivar.com': { rol: 'CONSULTOR', activo: true, emailDirector: 'paola.mora@segurosbolivar.com', emailGerente: '', emailsAlternos: '' },
    'joan.espitia@segurosbolivar.com': { rol: 'CONSULTOR', activo: true, emailDirector: 'paola.mora@segurosbolivar.com', emailGerente: '', emailsAlternos: '' },
    'johanna.pulido@segurosbolivar.com': { rol: 'CONSULTOR', activo: true, emailDirector: 'paola.mora@segurosbolivar.com', emailGerente: '', emailsAlternos: '' },
    'julian.rodriguez.rueda@segurosbolivar.com': { rol: 'CONSULTOR', activo: true, emailDirector: 'paola.mora@segurosbolivar.com', emailGerente: '', emailsAlternos: '' },
    'karen.robayo@segurosbolivar.com': { rol: 'CONSULTOR', activo: true, emailDirector: 'paola.mora@segurosbolivar.com', emailGerente: '', emailsAlternos: 'karen.robayo@aselibertador.com' },
    'marcela.ospitia@segurosbolivar.com': { rol: 'CONSULTOR', activo: true, emailDirector: 'paola.mora@segurosbolivar.com', emailGerente: '', emailsAlternos: '' },
    'nicolas.franco@segurosbolivar.com': { rol: 'CONSULTOR', activo: true, emailDirector: 'paola.mora@segurosbolivar.com', emailGerente: '', emailsAlternos: '' },
    'laura.zapata.hurtado@segurosbolivar.com': { rol: 'CONSULTOR', activo: true, emailDirector: 'sara.bedoya@aselibertador.com', emailGerente: '', emailsAlternos: 'laura.zapata.hurtado@aselibertador.com' },
    'lauren.cardona@segurosbolivar.com': { rol: 'CONSULTOR', activo: true, emailDirector: 'sara.bedoya@aselibertador.com', emailGerente: '', emailsAlternos: '' },
    'marisol.ospina@segurosbolivar.com': { rol: 'CONSULTOR', activo: true, emailDirector: 'sara.bedoya@aselibertador.com', emailGerente: '', emailsAlternos: 'marisol.ospina@aselibertador.com' },
    'yuliana.arango@segurosbolivar.com': { rol: 'CONSULTOR', activo: true, emailDirector: 'sara.bedoya@aselibertador.com', emailGerente: '', emailsAlternos: '' },
    'carolina.henao@aselibertador.com': { rol: 'CONSULTOR', activo: true, emailDirector: 'sara.bedoya@aselibertador.com', emailGerente: '', emailsAlternos: 'carolina.henao@segurosbolivar.com' },
    'angie.romero.olaya@segurosbolivar.com': { rol: 'CONSULTOR', activo: true, emailDirector: 'yuli.marin@aselibertador.com', emailGerente: '', emailsAlternos: '' },
    'claudia.vallejo@segurosbolivar.com': { rol: 'CONSULTOR', activo: true, emailDirector: 'yuli.marin@aselibertador.com', emailGerente: '', emailsAlternos: 'claudia.vallejo@aselibertador.com' },
    'claudia.restrepo@segurosbolivar.com': { rol: 'CONSULTOR', activo: true, emailDirector: 'yuli.marin@aselibertador.com', emailGerente: '', emailsAlternos: '' }
  };
}

/**
 * Crea la pestaña USUARIOS nueva con formato de cabecera V2.
 * Headers: EMAIL, ROL, ACTIVO, CUPO, EMAIL_DIRECTOR, EMAIL_GERENTE, EMAILS_ALTERNOS
 * Formato: negrita, fondo #253150, texto blanco, fila congelada.
 *
 * @param {GoogleAppsScript.Spreadsheet.Spreadsheet} ss - Spreadsheet donde crear la pestaña
 * @returns {GoogleAppsScript.Spreadsheet.Sheet} La hoja creada
 */
function _crearPestanaUsuariosV2(ss) {
  var headers = ['EMAIL', 'ROL', 'ACTIVO', 'CUPO', 'EMAIL_DIRECTOR', 'EMAIL_GERENTE', 'EMAILS_ALTERNOS'];

  var hoja = ss.insertSheet('USUARIOS');

  // Escribir headers
  hoja.getRange(1, 1, 1, headers.length).setValues([headers]);

  // Formato de cabecera
  hoja.getRange(1, 1, 1, headers.length)
    .setFontWeight('bold')
    .setBackground('#253150')
    .setFontColor('#ffffff');

  // Congelar primera fila
  hoja.setFrozenRows(1);

  return hoja;
}
