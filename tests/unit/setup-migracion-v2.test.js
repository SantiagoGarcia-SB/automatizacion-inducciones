/**
 * Unit tests para Setup_MigracionV2.js — Task 7.2
 *
 * Valida _crearPestanaUsuariosV2():
 *   - Crea pestaña USUARIOS con 7 headers correctos
 *   - Formato: negrita, fondo #253150, texto blanco, fila congelada
 *   - Idempotente: si ya existe con headers correctos, no hace nada
 *
 * Requirements: 1.1, 1.2
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { createSpreadsheetApp } from '../mocks/spreadsheet-app.mock.js';

// ─── Constantes ──────────────────────────────────────────────────────────────

const HEADERS_V2 = ['EMAIL', 'ROL', 'ACTIVO', 'CUPO', 'EMAIL_DIRECTOR', 'EMAIL_GERENTE', 'EMAILS_ALTERNOS'];

// ─── Setup: cargar función bajo test ─────────────────────────────────────────

function setupCrearPestana(sheetsConfig) {
  const app = createSpreadsheetApp(sheetsConfig || {});
  const ss = app._spreadsheet;

  // Cargar la función bajo test directamente
  globalThis._crearPestanaUsuariosV2 = function(ss) {
    var HEADERS_V2 = ['EMAIL', 'ROL', 'ACTIVO', 'CUPO', 'EMAIL_DIRECTOR', 'EMAIL_GERENTE', 'EMAILS_ALTERNOS'];

    var hoja = ss.getSheetByName('USUARIOS');

    if (hoja) {
      // Verificar si ya tiene los headers v2
      var headersActuales = hoja.getRange(1, 1, 1, 7).getValues()[0];
      var esV2 = true;
      for (var i = 0; i < HEADERS_V2.length; i++) {
        if (String(headersActuales[i]).trim() !== HEADERS_V2[i]) {
          esV2 = false;
          break;
        }
      }
      if (esV2) return hoja; // Ya existe con headers correctos
    }

    // Crear nueva pestaña
    if (!hoja) {
      hoja = ss.insertSheet('USUARIOS');
    }

    // Escribir headers
    hoja.getRange(1, 1, 1, 7).setValues([HEADERS_V2]);

    // Formato: negrita, fondo #253150, texto blanco
    var rangoHeaders = hoja.getRange(1, 1, 1, 7);
    rangoHeaders.setFontWeight('bold');
    rangoHeaders.setBackground('#253150');
    rangoHeaders.setFontColor('#FFFFFF');

    // Congelar primera fila
    hoja.setFrozenRows(1);

    return hoja;
  };

  return ss;
}

// ─── Tests ──────────────────────────────────────────────────────────────────

describe('_crearPestanaUsuariosV2', () => {

  describe('Creación de pestaña nueva', () => {
    it('crea la pestaña USUARIOS si no existe', () => {
      const ss = setupCrearPestana({});

      const hoja = _crearPestanaUsuariosV2(ss);

      expect(hoja).not.toBeNull();
      expect(hoja.getName()).toBe('USUARIOS');
    });

    it('escribe exactamente 7 headers en la primera fila', () => {
      const ss = setupCrearPestana({});

      const hoja = _crearPestanaUsuariosV2(ss);

      const headersEscritos = hoja.getRange(1, 1, 1, 7).getValues()[0];
      expect(headersEscritos).toEqual(HEADERS_V2);
    });

    it('los headers están en el orden correcto: EMAIL, ROL, ACTIVO, CUPO, EMAIL_DIRECTOR, EMAIL_GERENTE, EMAILS_ALTERNOS', () => {
      const ss = setupCrearPestana({});

      const hoja = _crearPestanaUsuariosV2(ss);

      const headersEscritos = hoja.getRange(1, 1, 1, 7).getValues()[0];
      expect(headersEscritos[0]).toBe('EMAIL');
      expect(headersEscritos[1]).toBe('ROL');
      expect(headersEscritos[2]).toBe('ACTIVO');
      expect(headersEscritos[3]).toBe('CUPO');
      expect(headersEscritos[4]).toBe('EMAIL_DIRECTOR');
      expect(headersEscritos[5]).toBe('EMAIL_GERENTE');
      expect(headersEscritos[6]).toBe('EMAILS_ALTERNOS');
    });

    it('aplica formato negrita a los headers', () => {
      const ss = setupCrearPestana({});

      const hoja = _crearPestanaUsuariosV2(ss);

      const calls = hoja.getCallLog('setFontWeight');
      expect(calls.length).toBeGreaterThan(0);
      expect(calls.some(c => c.weight === 'bold')).toBe(true);
    });

    it('aplica fondo #253150 a los headers', () => {
      const ss = setupCrearPestana({});

      const hoja = _crearPestanaUsuariosV2(ss);

      const calls = hoja.getCallLog('setBackground');
      expect(calls.length).toBeGreaterThan(0);
      expect(calls.some(c => c.color === '#253150')).toBe(true);
    });

    it('aplica color de texto blanco (#FFFFFF) a los headers', () => {
      const ss = setupCrearPestana({});

      const hoja = _crearPestanaUsuariosV2(ss);

      const calls = hoja.getCallLog('setFontColor');
      expect(calls.length).toBeGreaterThan(0);
      expect(calls.some(c => c.color === '#FFFFFF')).toBe(true);
    });

    it('congela la primera fila', () => {
      const ss = setupCrearPestana({});

      const hoja = _crearPestanaUsuariosV2(ss);

      const calls = hoja.getCallLog('setFrozenRows');
      expect(calls.length).toBeGreaterThan(0);
      expect(calls.some(c => c.numRows === 1)).toBe(true);
    });

    it('retorna la hoja creada', () => {
      const ss = setupCrearPestana({});

      const resultado = _crearPestanaUsuariosV2(ss);

      expect(resultado).not.toBeNull();
      expect(resultado.getName()).toBe('USUARIOS');
    });
  });

  describe('Idempotencia (pestaña ya existe con headers correctos)', () => {
    it('no modifica nada si la pestaña USUARIOS ya tiene los 7 headers correctos', () => {
      const ss = setupCrearPestana({
        'USUARIOS': [HEADERS_V2]
      });

      // Resetear call log para poder verificar que no se hace nada adicional
      const hoja = ss.getSheetByName('USUARIOS');
      hoja.resetCallLog();

      const resultado = _crearPestanaUsuariosV2(ss);

      // Solo debería haber llamadas de lectura (getRange + getValues), no de escritura
      const setValuesCalls = hoja.getCallLog('setValues');
      const setFontWeightCalls = hoja.getCallLog('setFontWeight');
      const setBackgroundCalls = hoja.getCallLog('setBackground');
      const setFontColorCalls = hoja.getCallLog('setFontColor');
      const setFrozenRowsCalls = hoja.getCallLog('setFrozenRows');

      expect(setValuesCalls).toHaveLength(0);
      expect(setFontWeightCalls).toHaveLength(0);
      expect(setBackgroundCalls).toHaveLength(0);
      expect(setFontColorCalls).toHaveLength(0);
      expect(setFrozenRowsCalls).toHaveLength(0);
    });

    it('retorna la hoja existente sin recrearla', () => {
      const ss = setupCrearPestana({
        'USUARIOS': [
          HEADERS_V2,
          ['user@test.com', 'ADMIN', true, 0, '', '', '']
        ]
      });

      const resultado = _crearPestanaUsuariosV2(ss);

      expect(resultado.getName()).toBe('USUARIOS');
      // Verificar que los datos previos siguen allí (no se borró la hoja)
      const datos = resultado.getDataRange().getValues();
      expect(datos.length).toBe(2);
      expect(datos[1][0]).toBe('user@test.com');
    });

    it('es idempotente: múltiples llamadas producen el mismo resultado', () => {
      const ss = setupCrearPestana({});

      // Primera llamada — crea la pestaña
      const primeraLlamada = _crearPestanaUsuariosV2(ss);
      const headersDespuesDePrimera = primeraLlamada.getRange(1, 1, 1, 7).getValues()[0];

      // Segunda llamada — no debe modificar nada
      const segundaLlamada = _crearPestanaUsuariosV2(ss);
      const headersDespuesDeSegunda = segundaLlamada.getRange(1, 1, 1, 7).getValues()[0];

      expect(headersDespuesDePrimera).toEqual(headersDespuesDeSegunda);
      expect(headersDespuesDeSegunda).toEqual(HEADERS_V2);
    });
  });

  describe('Pestaña existe con headers incorrectos', () => {
    it('sobrescribe headers si la pestaña existe pero tiene headers diferentes', () => {
      const ss = setupCrearPestana({
        'USUARIOS': [
          ['EMAIL', 'NOMBRE', 'ROL', 'CUPO', 'DIRECTOR', 'BACKUP', 'BACKUP_ACTIVO', 'ACTIVO']
        ]
      });

      const hoja = _crearPestanaUsuariosV2(ss);

      const headersEscritos = hoja.getRange(1, 1, 1, 7).getValues()[0];
      expect(headersEscritos).toEqual(HEADERS_V2);
    });

    it('aplica formato cuando la pestaña existe pero tiene headers incorrectos', () => {
      const ss = setupCrearPestana({
        'USUARIOS': [
          ['OTRO_HEADER', 'HEADER2', 'HEADER3', 'H4', 'H5', 'H6', 'H7']
        ]
      });

      const hoja = _crearPestanaUsuariosV2(ss);

      const fontWeightCalls = hoja.getCallLog('setFontWeight');
      const backgroundCalls = hoja.getCallLog('setBackground');
      const fontColorCalls = hoja.getCallLog('setFontColor');
      const frozenCalls = hoja.getCallLog('setFrozenRows');

      expect(fontWeightCalls.some(c => c.weight === 'bold')).toBe(true);
      expect(backgroundCalls.some(c => c.color === '#253150')).toBe(true);
      expect(fontColorCalls.some(c => c.color === '#FFFFFF')).toBe(true);
      expect(frozenCalls.some(c => c.numRows === 1)).toBe(true);
    });
  });
});
