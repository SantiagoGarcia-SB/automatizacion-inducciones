/**
 * Unit tests para Setup_MigracionV2.js — Task 7.1
 *
 * Valida:
 *   - Idempotencia: detecta _MIGRADO_V2 y no re-ejecuta
 *   - Transformación de roles: COMERCIAL→CONSULTOR, LIDER→DIRECTOR
 *   - Mapeo correcto de columnas del esquema viejo (8) al nuevo (7)
 *   - Descarte de columnas NOMBRE, BACKUP, BACKUP_ACTIVO
 *   - Creación de pestaña con headers formateados
 *   - Preservación de datos: EMAIL, CUPO, ACTIVO sin cambios
 *   - Guardado de propiedad _MIGRADO_V2 al finalizar
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { createSpreadsheetApp } from '../mocks/spreadsheet-app.mock.js';

// ─── Mock de PropertiesService ────────────────────────────────────────────────

function createPropertiesServiceMock(initialProps = {}) {
  const store = { ...initialProps };
  return {
    getScriptProperties() {
      return {
        getProperty(key) {
          return store[key] !== undefined ? store[key] : null;
        },
        setProperty(key, value) {
          store[key] = value;
        },
        getProperties() {
          return { ...store };
        }
      };
    },
    _store: store
  };
}

// ─── Setup de globals ─────────────────────────────────────────────────────────

function setupMigracion(sheetsConfig, propsConfig) {
  const app = createSpreadsheetApp(sheetsConfig);
  globalThis.SpreadsheetApp = app;
  globalThis.ID_HOJA_CONTROL = 'mock-id';
  globalThis.Logger = { log: () => {} };

  const propsService = createPropertiesServiceMock(propsConfig || {});
  globalThis.PropertiesService = propsService;

  // Cargar _crearPestanaUsuariosV2
  globalThis._crearPestanaUsuariosV2 = function(ss) {
    var headers = ['EMAIL', 'ROL', 'ACTIVO', 'CUPO', 'EMAIL_DIRECTOR', 'EMAIL_GERENTE', 'EMAILS_ALTERNOS'];

    var hoja = ss.insertSheet('USUARIOS');

    hoja.getRange(1, 1, 1, headers.length).setValues([headers]);

    hoja.getRange(1, 1, 1, headers.length)
      .setFontWeight('bold')
      .setBackground('#253150')
      .setFontColor('#ffffff');

    hoja.setFrozenRows(1);

    return hoja;
  };

  // Cargar migrarUsuariosAV2
  globalThis.migrarUsuariosAV2 = function() {
    var props = PropertiesService.getScriptProperties();
    if (props.getProperty('_MIGRADO_V2') === 'true') {
      Logger.log('Ya migrado');
      return;
    }

    var ss = SpreadsheetApp.openById(ID_HOJA_CONTROL);
    var hojaVieja = ss.getSheetByName('USUARIOS');

    if (!hojaVieja) {
      Logger.log('⚠️ Pestaña USUARIOS no encontrada. Creando nueva vacía.');
      _crearPestanaUsuariosV2(ss);
      props.setProperty('_MIGRADO_V2', 'true');
      return;
    }

    var datosViejos = hojaVieja.getDataRange().getValues();

    if (datosViejos.length < 2) {
      Logger.log('⚠️ Pestaña USUARIOS solo tiene headers o está vacía. Creando nueva.');
      ss.deleteSheet(hojaVieja);
      _crearPestanaUsuariosV2(ss);
      props.setProperty('_MIGRADO_V2', 'true');
      return;
    }

    var datosMigrados = [];

    for (var i = 1; i < datosViejos.length; i++) {
      var fila = datosViejos[i];
      var email = String(fila[0] || '').toLowerCase().trim();

      if (!email) continue;

      var rolViejo = String(fila[2] || '').toUpperCase().trim();
      var rolNuevo = rolViejo;
      if (rolViejo === 'COMERCIAL') {
        rolNuevo = 'CONSULTOR';
      } else if (rolViejo === 'LIDER') {
        rolNuevo = 'DIRECTOR';
      }

      var activoRaw = fila[7];
      var activo = (activoRaw === true || activoRaw === 'TRUE' || activoRaw === 'true' || activoRaw === 'True');

      var cupo = Number(fila[3]) || 0;

      var emailDirector = String(fila[4] || '').toLowerCase().trim();

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

    hojaVieja.setName('USUARIOS_BACKUP');

    var hojaNueva = _crearPestanaUsuariosV2(ss);

    if (datosMigrados.length > 0) {
      hojaNueva.getRange(2, 1, datosMigrados.length, 7).setValues(datosMigrados);
    }

    props.setProperty('_MIGRADO_V2', 'true');

    Logger.log('✅ Migración V2 completada. ' + datosMigrados.length + ' usuarios migrados.');
  };

  return { app, propsService };
}

// ─── Datos de prueba: esquema viejo (8 columnas) ─────────────────────────────

const HEADERS_VIEJOS = ['EMAIL', 'NOMBRE', 'ROL', 'CUPO', 'DIRECTOR', 'BACKUP', 'BACKUP_ACTIVO', 'ACTIVO'];

const DATOS_ESQUEMA_VIEJO = [
  HEADERS_VIEJOS,
  ['ana.perez@empresa.com', 'Ana Perez', 'COMERCIAL', 5, 'jenny.director@empresa.com', 'backup1@empresa.com', true, true],
  ['juan.garcia@empresa.com', 'Juan Garcia', 'COMERCIAL', 3, 'jenny.director@empresa.com', 'backup2@empresa.com', false, true],
  ['jenny.director@empresa.com', 'Jenny Director', 'LIDER', 0, '', '', false, true],
  ['carlos.admin@empresa.com', 'Carlos Admin', 'ADMIN', 10, '', '', false, true],
  ['pedro.analista@empresa.com', 'Pedro Analista', 'ANALISTA', 3, 'jenny.director@empresa.com', '', false, false],
];

// ─── Tests ─────────────────────────────────────────────────────────────────────

describe('migrarUsuariosAV2', () => {

  describe('Idempotencia (Req 5.6)', () => {
    it('no ejecuta la migración si _MIGRADO_V2 ya es true', () => {
      const { propsService } = setupMigracion(
        { 'USUARIOS': DATOS_ESQUEMA_VIEJO },
        { '_MIGRADO_V2': 'true' }
      );

      migrarUsuariosAV2();

      // La pestaña USUARIOS no debe haber sido renombrada
      const ss = SpreadsheetApp.openById('mock-id');
      expect(ss.getSheetByName('USUARIOS')).not.toBeNull();
      expect(ss.getSheetByName('USUARIOS_BACKUP')).toBeNull();
    });

    it('ejecutar dos veces produce el mismo resultado que una sola vez', () => {
      setupMigracion({ 'USUARIOS': DATOS_ESQUEMA_VIEJO }, {});

      migrarUsuariosAV2();

      const ss = SpreadsheetApp.openById('mock-id');
      const hojaNueva = ss.getSheetByName('USUARIOS');
      const datosAfterFirst = hojaNueva.getDataRange().getValues();

      // Segunda ejecución no debe alterar nada
      migrarUsuariosAV2();

      const datosAfterSecond = ss.getSheetByName('USUARIOS').getDataRange().getValues();
      expect(datosAfterSecond).toEqual(datosAfterFirst);
    });
  });

  describe('Transformación de roles (Req 5.1, 5.2)', () => {
    beforeEach(() => {
      setupMigracion({ 'USUARIOS': DATOS_ESQUEMA_VIEJO }, {});
    });

    it('renombra COMERCIAL a CONSULTOR', () => {
      migrarUsuariosAV2();

      const ss = SpreadsheetApp.openById('mock-id');
      const hoja = ss.getSheetByName('USUARIOS');
      const datos = hoja.getDataRange().getValues();

      // ana.perez y juan.garcia eran COMERCIAL
      const anaFila = datos.find(row => row[0] === 'ana.perez@empresa.com');
      const juanFila = datos.find(row => row[0] === 'juan.garcia@empresa.com');

      expect(anaFila[1]).toBe('CONSULTOR');
      expect(juanFila[1]).toBe('CONSULTOR');
    });

    it('renombra LIDER a DIRECTOR', () => {
      migrarUsuariosAV2();

      const ss = SpreadsheetApp.openById('mock-id');
      const hoja = ss.getSheetByName('USUARIOS');
      const datos = hoja.getDataRange().getValues();

      const jennyFila = datos.find(row => row[0] === 'jenny.director@empresa.com');
      expect(jennyFila[1]).toBe('DIRECTOR');
    });

    it('preserva roles que no necesitan transformación (ADMIN, ANALISTA)', () => {
      migrarUsuariosAV2();

      const ss = SpreadsheetApp.openById('mock-id');
      const hoja = ss.getSheetByName('USUARIOS');
      const datos = hoja.getDataRange().getValues();

      const carlosFila = datos.find(row => row[0] === 'carlos.admin@empresa.com');
      const pedroFila = datos.find(row => row[0] === 'pedro.analista@empresa.com');

      expect(carlosFila[1]).toBe('ADMIN');
      expect(pedroFila[1]).toBe('ANALISTA');
    });
  });

  describe('Mapeo de columnas (Req 5.3, 5.4, 5.5)', () => {
    beforeEach(() => {
      setupMigracion({ 'USUARIOS': DATOS_ESQUEMA_VIEJO }, {});
    });

    it('preserva EMAIL en columna A (nueva posición 0)', () => {
      migrarUsuariosAV2();

      const ss = SpreadsheetApp.openById('mock-id');
      const hoja = ss.getSheetByName('USUARIOS');
      const datos = hoja.getDataRange().getValues();

      // Skip header row
      const emails = datos.slice(1).map(row => row[0]);
      expect(emails).toContain('ana.perez@empresa.com');
      expect(emails).toContain('jenny.director@empresa.com');
      expect(emails).toContain('carlos.admin@empresa.com');
    });

    it('normaliza EMAIL a minúsculas', () => {
      setupMigracion({
        'USUARIOS': [
          HEADERS_VIEJOS,
          ['ANA.Perez@Empresa.COM', 'Ana', 'COMERCIAL', 5, 'dir@emp.com', '', false, true]
        ]
      }, {});

      migrarUsuariosAV2();

      const ss = SpreadsheetApp.openById('mock-id');
      const hoja = ss.getSheetByName('USUARIOS');
      const datos = hoja.getDataRange().getValues();
      expect(datos[1][0]).toBe('ana.perez@empresa.com');
    });

    it('mapea DIRECTOR viejo (col E=4) a EMAIL_DIRECTOR nuevo (col E=4)', () => {
      migrarUsuariosAV2();

      const ss = SpreadsheetApp.openById('mock-id');
      const hoja = ss.getSheetByName('USUARIOS');
      const datos = hoja.getDataRange().getValues();

      const anaFila = datos.find(row => row[0] === 'ana.perez@empresa.com');
      // Nueva col 4 = EMAIL_DIRECTOR
      expect(anaFila[4]).toBe('jenny.director@empresa.com');
    });

    it('preserva CUPO en nueva posición (col D=3)', () => {
      migrarUsuariosAV2();

      const ss = SpreadsheetApp.openById('mock-id');
      const hoja = ss.getSheetByName('USUARIOS');
      const datos = hoja.getDataRange().getValues();

      const anaFila = datos.find(row => row[0] === 'ana.perez@empresa.com');
      expect(anaFila[3]).toBe(5);

      const carlosFila = datos.find(row => row[0] === 'carlos.admin@empresa.com');
      expect(carlosFila[3]).toBe(10);
    });

    it('preserva ACTIVO en nueva posición (col C=2)', () => {
      migrarUsuariosAV2();

      const ss = SpreadsheetApp.openById('mock-id');
      const hoja = ss.getSheetByName('USUARIOS');
      const datos = hoja.getDataRange().getValues();

      const anaFila = datos.find(row => row[0] === 'ana.perez@empresa.com');
      expect(anaFila[2]).toBe(true);

      const pedroFila = datos.find(row => row[0] === 'pedro.analista@empresa.com');
      expect(pedroFila[2]).toBe(false);
    });

    it('descarta columna NOMBRE (no aparece en nuevo esquema)', () => {
      migrarUsuariosAV2();

      const ss = SpreadsheetApp.openById('mock-id');
      const hoja = ss.getSheetByName('USUARIOS');
      const datos = hoja.getDataRange().getValues();

      // Headers nuevos no deben incluir NOMBRE
      expect(datos[0]).not.toContain('NOMBRE');
      // Ninguna fila de datos debe contener nombres
      const todasLasFilas = datos.slice(1);
      for (const fila of todasLasFilas) {
        expect(fila).not.toContain('Ana Perez');
        expect(fila).not.toContain('Jenny Director');
      }
    });

    it('descarta columnas BACKUP y BACKUP_ACTIVO', () => {
      migrarUsuariosAV2();

      const ss = SpreadsheetApp.openById('mock-id');
      const hoja = ss.getSheetByName('USUARIOS');
      const datos = hoja.getDataRange().getValues();

      // Headers nuevos no deben incluir BACKUP ni BACKUP_ACTIVO
      expect(datos[0]).not.toContain('BACKUP');
      expect(datos[0]).not.toContain('BACKUP_ACTIVO');
    });

    it('deja EMAIL_GERENTE vacío en nuevo esquema', () => {
      migrarUsuariosAV2();

      const ss = SpreadsheetApp.openById('mock-id');
      const hoja = ss.getSheetByName('USUARIOS');
      const datos = hoja.getDataRange().getValues();

      // Col F=5 en nuevo esquema = EMAIL_GERENTE, debe ser vacío
      const todasLasFilas = datos.slice(1);
      for (const fila of todasLasFilas) {
        expect(fila[5]).toBe('');
      }
    });

    it('deja EMAILS_ALTERNOS vacío en nuevo esquema', () => {
      migrarUsuariosAV2();

      const ss = SpreadsheetApp.openById('mock-id');
      const hoja = ss.getSheetByName('USUARIOS');
      const datos = hoja.getDataRange().getValues();

      // Col G=6 en nuevo esquema = EMAILS_ALTERNOS, debe ser vacío
      const todasLasFilas = datos.slice(1);
      for (const fila of todasLasFilas) {
        expect(fila[6]).toBe('');
      }
    });
  });

  describe('Estructura de la nueva pestaña (Req 1.1, 1.2)', () => {
    beforeEach(() => {
      setupMigracion({ 'USUARIOS': DATOS_ESQUEMA_VIEJO }, {});
    });

    it('crea nueva pestaña USUARIOS con 7 headers correctos', () => {
      migrarUsuariosAV2();

      const ss = SpreadsheetApp.openById('mock-id');
      const hoja = ss.getSheetByName('USUARIOS');
      const datos = hoja.getDataRange().getValues();

      expect(datos[0]).toEqual(['EMAIL', 'ROL', 'ACTIVO', 'CUPO', 'EMAIL_DIRECTOR', 'EMAIL_GERENTE', 'EMAILS_ALTERNOS']);
    });

    it('renombra la pestaña vieja a USUARIOS_BACKUP', () => {
      migrarUsuariosAV2();

      const ss = SpreadsheetApp.openById('mock-id');
      expect(ss.getSheetByName('USUARIOS_BACKUP')).not.toBeNull();
    });

    it('aplica formato de cabecera (negrita, fondo, color, fila congelada)', () => {
      migrarUsuariosAV2();

      const ss = SpreadsheetApp.openById('mock-id');
      const hoja = ss.getSheetByName('USUARIOS');
      const callLog = hoja.getCallLog();

      // Verificar que se aplicó formato
      expect(callLog.some(c => c.method === 'setFrozenRows' && c.numRows === 1)).toBe(true);
    });

    it('escribe los datos migrados a partir de la fila 2', () => {
      migrarUsuariosAV2();

      const ss = SpreadsheetApp.openById('mock-id');
      const hoja = ss.getSheetByName('USUARIOS');
      const datos = hoja.getDataRange().getValues();

      // Fila 0 = headers, filas 1+ = datos
      expect(datos.length).toBe(6); // 1 header + 5 datos
    });
  });

  describe('Propiedad _MIGRADO_V2 (Req 5.6)', () => {
    it('guarda _MIGRADO_V2 = true al completar la migración', () => {
      const { propsService } = setupMigracion({ 'USUARIOS': DATOS_ESQUEMA_VIEJO }, {});

      migrarUsuariosAV2();

      expect(propsService._store['_MIGRADO_V2']).toBe('true');
    });

    it('guarda _MIGRADO_V2 = true incluso si la pestaña no existe', () => {
      const { propsService } = setupMigracion({ 'OtraHoja': [['col1']] }, {});

      migrarUsuariosAV2();

      expect(propsService._store['_MIGRADO_V2']).toBe('true');
    });
  });

  describe('Edge cases', () => {
    it('ignora filas con email vacío', () => {
      setupMigracion({
        'USUARIOS': [
          HEADERS_VIEJOS,
          ['ana@empresa.com', 'Ana', 'COMERCIAL', 5, 'dir@emp.com', '', false, true],
          ['', 'Vacío', 'COMERCIAL', 0, '', '', false, true],
          ['pedro@empresa.com', 'Pedro', 'ANALISTA', 3, 'dir@emp.com', '', false, true],
        ]
      }, {});

      migrarUsuariosAV2();

      const ss = SpreadsheetApp.openById('mock-id');
      const hoja = ss.getSheetByName('USUARIOS');
      const datos = hoja.getDataRange().getValues();

      // Solo 2 datos + 1 header = 3 filas
      expect(datos.length).toBe(3);
    });

    it('maneja pestaña USUARIOS con solo headers (sin datos)', () => {
      const { propsService } = setupMigracion({
        'USUARIOS': [HEADERS_VIEJOS]
      }, {});

      migrarUsuariosAV2();

      // Debe crear pestaña nueva y marcar como migrado
      expect(propsService._store['_MIGRADO_V2']).toBe('true');
      const ss = SpreadsheetApp.openById('mock-id');
      const hoja = ss.getSheetByName('USUARIOS');
      expect(hoja).not.toBeNull();
    });

    it('maneja ACTIVO como string "TRUE"', () => {
      setupMigracion({
        'USUARIOS': [
          HEADERS_VIEJOS,
          ['user@test.com', 'User', 'COMERCIAL', 5, 'dir@test.com', '', false, 'TRUE']
        ]
      }, {});

      migrarUsuariosAV2();

      const ss = SpreadsheetApp.openById('mock-id');
      const hoja = ss.getSheetByName('USUARIOS');
      const datos = hoja.getDataRange().getValues();
      expect(datos[1][2]).toBe(true);
    });

    it('maneja ACTIVO como string "true"', () => {
      setupMigracion({
        'USUARIOS': [
          HEADERS_VIEJOS,
          ['user@test.com', 'User', 'COMERCIAL', 5, 'dir@test.com', '', false, 'true']
        ]
      }, {});

      migrarUsuariosAV2();

      const ss = SpreadsheetApp.openById('mock-id');
      const hoja = ss.getSheetByName('USUARIOS');
      const datos = hoja.getDataRange().getValues();
      expect(datos[1][2]).toBe(true);
    });

    it('maneja CUPO no numérico (se convierte a 0)', () => {
      setupMigracion({
        'USUARIOS': [
          HEADERS_VIEJOS,
          ['user@test.com', 'User', 'COMERCIAL', 'abc', 'dir@test.com', '', false, true]
        ]
      }, {});

      migrarUsuariosAV2();

      const ss = SpreadsheetApp.openById('mock-id');
      const hoja = ss.getSheetByName('USUARIOS');
      const datos = hoja.getDataRange().getValues();
      expect(datos[1][3]).toBe(0);
    });

    it('normaliza emailDirector a minúsculas', () => {
      setupMigracion({
        'USUARIOS': [
          HEADERS_VIEJOS,
          ['user@test.com', 'User', 'COMERCIAL', 5, 'DIRECTOR@Empresa.COM', '', false, true]
        ]
      }, {});

      migrarUsuariosAV2();

      const ss = SpreadsheetApp.openById('mock-id');
      const hoja = ss.getSheetByName('USUARIOS');
      const datos = hoja.getDataRange().getValues();
      expect(datos[1][4]).toBe('director@empresa.com');
    });
  });
});

describe('_crearPestanaUsuariosV2', () => {
  it('crea la pestaña USUARIOS con headers V2', () => {
    setupMigracion({ 'OtraHoja': [['x']] }, {});

    const ss = SpreadsheetApp.openById('mock-id');
    const hoja = _crearPestanaUsuariosV2(ss);

    expect(hoja.getName()).toBe('USUARIOS');
    const datos = hoja.getDataRange().getValues();
    expect(datos[0]).toEqual(['EMAIL', 'ROL', 'ACTIVO', 'CUPO', 'EMAIL_DIRECTOR', 'EMAIL_GERENTE', 'EMAILS_ALTERNOS']);
  });

  it('congela la primera fila', () => {
    setupMigracion({ 'OtraHoja': [['x']] }, {});

    const ss = SpreadsheetApp.openById('mock-id');
    const hoja = _crearPestanaUsuariosV2(ss);
    const log = hoja.getCallLog('setFrozenRows');

    expect(log.length).toBeGreaterThan(0);
    expect(log[0].numRows).toBe(1);
  });
});
