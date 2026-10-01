/**
 * Unit tests: Asignaciones.js
 *
 * El admin escribe el NOMBRE del analista en ASIGNADA A…; el trigger envía un
 * correo por analista y sella en Control_General la hora de envío.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { createSpreadsheetApp } from '../mocks/spreadsheet-app.mock.js';
import { createLockService } from '../mocks/lock-service.mock.js';
import { readFileSync } from 'fs';
import { resolve } from 'path';

const sourceCode = readFileSync(resolve(__dirname, '../../Asignaciones.js'), 'utf-8');

function loadSource() {
  const wrapped = `(function() { ${sourceCode}
  ; return {
    normalizarNombre: Asignaciones_normalizarNombre_,
    buscarColumna: Asignaciones_buscarColumna_,
    construirMapa: Asignaciones_construirMapaAnalistas_,
    detectar: Asignaciones_detectarPendientes_,
    construirCorreo: Asignaciones_construirCorreo_,
    notificar: notificarAsignacionesPendientes
  }; })()`;
  return eval(wrapped);
}

// ─── Utilidades puras ──────────────────────────────────────────────────────────

describe('utilidades puras', () => {
  globalThis._envolver_ = (x) => x;
  globalThis._bloque_cabecera_ = (x) => x;
  globalThis._bloque_barra_estado_ = (a, b, c) => c;
  globalThis._bloque_cuerpo_inicio_ = (a, b) => `${a}|${b}`;
  globalThis._bloque_boton_ = (a, u) => `${a}@${u}`;
  globalThis._bloque_pie_ = () => '';
  const a = loadSource();

  it('normaliza nombres: sin tildes, mayúsculas, espacios simples', () => {
    expect(a.normalizarNombre('  María   José  Pérez ')).toBe('MARIA JOSE PEREZ');
    expect(a.normalizarNombre(null)).toBe('');
  });

  it('encuentra ASIGNADA A… con puntos suspensivos, tres puntos o sin ellos', () => {
    expect(a.buscarColumna(['x', 'ASIGNADA A…'], 'ASIGNADA A')).toBe(2);
    expect(a.buscarColumna(['x', 'ASIGNADA A...'], 'ASIGNADA A')).toBe(2);
    expect(a.buscarColumna(['x', 'asignada a'], 'ASIGNADA A')).toBe(2);
    expect(a.buscarColumna(['x'], 'ASIGNADA A')).toBe(0);
  });

  it('construye el mapa nombre→correo ignorando inactivos y correos inválidos', () => {
    const mapa = a.construirMapa([
      ['NOMBRE_EN_SHEET', 'EMAIL', 'ACTIVO'],
      ['María Pérez', 'Maria@x.co', true],
      ['Juan Soto', 'juan@x.co', 'FALSE'],
      ['Ana Ruiz', 'no-es-correo', true],
      ['Luis Mora', 'luis@x.co', '']
    ]);
    expect(Object.keys(mapa).sort()).toEqual(['LUIS MORA', 'MARIA PEREZ']);
    expect(mapa['MARIA PEREZ']).toEqual({ nombre: 'María Pérez', email: 'maria@x.co' });
  });

  it('el correo agrupa por lote, destaca Solicitud Inquilino, trae el recordatorio y escapa HTML', () => {
    const c = a.construirCorreo('Ana <b>', [
      { idLote: 'L1', solicitudInquilino: '1234567', arrendatario: 'Pedro & Co', poliza: '123', ciudad: 'PEREIRA', sucursal: 'EJE CAFETERO', reasignado: false },
      { idLote: 'L1', solicitudInquilino: '1234568', arrendatario: 'Luz', poliza: '123', ciudad: 'PEREIRA', sucursal: 'EJE CAFETERO', reasignado: true },
      { idLote: 'L2', solicitudInquilino: '', arrendatario: 'Sin Num', poliza: '9', ciudad: 'CALI', sucursal: 'OCCIDENTE', reasignado: false }
    ], 'https://sheet');
    expect(c.asunto).toContain('3 casos');
    expect(c.html).toContain('Hola, Ana &lt;b&gt;');
    expect(c.html).toContain('Pedro &amp; Co');
    expect(c.html).toContain('REASIGNADO');
    expect(c.html).toContain('@https://sheet');
    // Solicitud Inquilino como dato principal
    expect(c.html).toContain('1234567');
    expect(c.html).toContain('1234568');
    expect(c.html).toContain('Sin n&uacute;mero');
    // Agrupado por lote: un encabezado por lote con su cantidad de solicitudes
    expect(c.html.match(/Lote L1/g)).toHaveLength(1);
    expect(c.html).toContain('2 solicitudes');
    expect(c.html).toContain('1 solicitud<');
    // Recordatorio antes de la lista de casos
    expect(c.html).toContain('Importante tener en cuenta');
    expect(c.html).toContain('jur&iacute;dico');
    expect(c.html).toContain('AVS');
    expect(c.html.indexOf('Importante tener en cuenta')).toBeLessThan(c.html.indexOf('Casos asignados'));
  });

  describe('detectar pendientes', () => {
    const mapa = {
      'MARIA PEREZ': { nombre: 'María Pérez', email: 'maria@x.co' },
      'LUIS MORA': { nombre: 'Luis Mora', email: 'luis@x.co' }
    };
    const base = (o = {}) => ({
      asignadas: ['María Pérez'],
      fechasEvaluacion: [''],
      registroSai: [''],
      uuids: ['u1'],
      indiceControl: { u1: { fila: 5, fh: '', notificado: '' } },
      mapa,
      ...o
    });

    it('asignación nueva: nombre sin fecha previa', () => {
      const r = a.detectar(base());
      expect(r.porEmail['maria@x.co'].casos).toHaveLength(1);
      expect(r.porEmail['maria@x.co'].casos[0]).toMatchObject({ filaRegistro: 2, uuid: 'u1', filaControl: 5, reasignado: false });
    });

    it('agrupa varios casos del mismo analista (nombre con distinta forma)', () => {
      const r = a.detectar(base({
        asignadas: ['María Pérez', 'MARIA  PEREZ', 'Luis Mora'],
        fechasEvaluacion: ['', '', ''],
        registroSai: ['', '', ''],
        uuids: ['u1', 'u2', 'u3'],
        indiceControl: { u1: { fila: 5 }, u2: { fila: 6 }, u3: { fila: 7 } }
      }));
      expect(r.porEmail['maria@x.co'].casos.map(c => c.filaRegistro)).toEqual([2, 3]);
      expect(r.porEmail['luis@x.co'].casos).toHaveLength(1);
    });

    it('ignora asignaciones históricas: Fecha Evaluacion digitada y sin F.H Asignacion', () => {
      const r = a.detectar(base({ fechasEvaluacion: [new Date()] }));
      expect(r.porEmail).toEqual({});
    });

    it('ignora lo ya notificado al mismo analista', () => {
      const r = a.detectar(base({ indiceControl: { u1: { fila: 5, fh: new Date(), notificado: 'María Pérez' } } }));
      expect(r.porEmail).toEqual({});
    });

    it('reasignación: analista distinto al notificado', () => {
      const r = a.detectar(base({
        asignadas: ['Luis Mora'],
        fechasEvaluacion: [new Date()],
        indiceControl: { u1: { fila: 5, fh: new Date(), notificado: 'María Pérez' } }
      }));
      expect(r.porEmail['luis@x.co'].casos[0].reasignado).toBe(true);
    });

    it('ignora casos ya analizados (REGISTRO ANALISTA SAI lleno) y filas sin asignar', () => {
      const r = a.detectar(base({
        asignadas: ['María Pérez', ''],
        fechasEvaluacion: ['', ''],
        registroSai: ['maria@x.co', ''],
        uuids: ['u1', 'u2'],
        indiceControl: { u1: { fila: 5 }, u2: { fila: 6 } }
      }));
      expect(r.porEmail).toEqual({});
    });

    it('nombres sin correo se reportan y no se notifican; UUID sin fila en Control_General se cuenta', () => {
      const r = a.detectar(base({
        asignadas: ['Desconocido', 'María Pérez'],
        fechasEvaluacion: ['', ''],
        registroSai: ['', ''],
        uuids: ['u1', 'uX'],
        indiceControl: { u1: { fila: 5 } }
      }));
      expect(r.sinCorreo).toEqual({ DESCONOCIDO: 1 });
      expect(r.sinFilaControl).toBe(1);
      expect(r.porEmail).toEqual({});
    });
  });
});

// ─── Orquestación con hojas simuladas ──────────────────────────────────────────

describe('notificarAsignacionesPendientes()', () => {
  const HDR_ANALISIS = ['UUID_SISTEMA', 'codigo lote', 'Arrendatario', 'Póliza', 'ciudad', 'sucursal', 'ASIGNADA A…', 'REGISTRO ANALISTA SAI', 'Fecha Evaluacion', 'Solicitud Inquilino'];
  const HDR_CONTROL = ['ID Lote', 'UUID_SISTEMA'];

  let analisis, control, config, enviados, a;

  function setup({ filasAnalisis, filasControl, filasConfig, falla = false }) {
    analisis = createSpreadsheetApp({ 'registro analisis': [HDR_ANALISIS, ...filasAnalisis] });
    control = createSpreadsheetApp({
      Control_General: [HDR_CONTROL, ...filasControl],
      Config_Analistas: filasConfig || [
        ['NOMBRE_EN_SHEET', 'EMAIL', 'ACTIVO'],
        ['María Pérez', 'maria@x.co', true]
      ]
    });
    enviados = [];
    globalThis.getArchivoAnalisisId = () => 'analisis';
    globalThis.getHojaControlId = () => 'control';
    globalThis.SpreadsheetRegistry_get = (id) => (id === 'analisis' ? analisis._spreadsheet : control._spreadsheet);
    globalThis.LockService = createLockService();
    globalThis.MailApp = {
      getRemainingDailyQuota: () => 100,
      sendEmail: vi.fn((o) => { if (falla) throw new Error('cuota'); enviados.push(o); })
    };
    const props = {};
    globalThis.PropertiesService = {
      getScriptProperties: () => ({ getProperty: (k) => props[k] || null, setProperty: (k, v) => { props[k] = v; } })
    };
    globalThis._registrarEvento_ = vi.fn();
    globalThis.BCC_AUDITORIA = 'audit@x.co';
    globalThis.obtenerCadenaJerarquica = () => ['admin1@x.co', 'ADMIN2@x.co', 'admin1@x.co', 'maria@x.co'];
    globalThis.emailANombre = (e) => { const p = String(e).split('@')[0].split('.')[0]; return p.charAt(0).toUpperCase() + p.slice(1); };
    globalThis._envolver_ = (x) => x;
    globalThis._bloque_cabecera_ = (x) => x;
    globalThis._bloque_barra_estado_ = (x, y, z) => z;
    globalThis._bloque_cuerpo_inicio_ = (x, y) => `${x}${y}`;
    globalThis._bloque_boton_ = () => '';
    globalThis._bloque_pie_ = () => '';
    a = loadSource();
  }

  const filaAnalisis = (uuid, asignada, fechaEval = '', sai = '') =>
    [uuid, 'LOTE-1', 'Pedro', '123', 'PEREIRA', 'EJE CAFETERO', asignada, sai, fechaEval, '9000' + uuid.slice(1)];

  const hojaControl = () => control._spreadsheet.getSheetByName('Control_General');
  const hojaAnalisis = () => analisis._spreadsheet.getSheetByName('registro analisis');
  const celda = (hoja, fila, columna) => hoja._fullData[fila - 1][columna - 1];

  beforeEach(() => {
    vi.useRealTimers();
  });

  it('envía un correo por analista, sella F.H Asignacion/Analista Notificado y rellena Fecha Evaluacion', () => {
    setup({
      filasAnalisis: [filaAnalisis('u1', 'María Pérez'), filaAnalisis('u2', 'María Pérez')],
      filasControl: [['L1', 'u1'], ['L1', 'u2']]
    });

    const antes = Date.now();
    const r = a.notificar();

    expect(r.ok).toBe(true);
    expect(r.correos).toBe(1);
    expect(r.casos).toBe(2);
    expect(enviados).toHaveLength(1);
    expect(enviados[0].to).toBe('maria@x.co');
    expect(enviados[0].bcc).toBe('audit@x.co');
    // CC: cadena jerárquica sin duplicados y sin el propio analista
    expect(enviados[0].cc).toBe('admin1@x.co,ADMIN2@x.co');
    expect(enviados[0].subject).toContain('2 casos');
    // Saludo solo con el primer nombre (derivado del correo), no el nombre del sheet
    expect(enviados[0].htmlBody).toContain('Hola, Maria');
    expect(enviados[0].htmlBody).not.toContain('Hola, María Pérez');
    // Dato principal: Solicitud Inquilino de registro analisis
    expect(enviados[0].htmlBody).toContain('9000' + '1');
    expect(enviados[0].htmlBody).toContain('9000' + '2');

    // Columnas nuevas creadas al final de Control_General (cols 3 y 4) y selladas
    const hc = hojaControl();
    expect(hc._fullData[0].slice(2)).toEqual(['F.H Asignacion', 'Analista Notificado']);
    const fh2 = celda(hc, 2, 3);
    const fh3 = celda(hc, 3, 3);
    expect(fh2).toBeInstanceOf(Date);
    expect(fh2.getTime()).toBeGreaterThanOrEqual(antes);
    expect(fh2.getTime()).toBe(fh3.getTime()); // misma hora para todo el correo
    expect(celda(hc, 2, 4)).toBe('María Pérez');

    // Fecha Evaluacion rellenada
    expect(celda(hojaAnalisis(), 2, 9)).toBeInstanceOf(Date);
    // Historial
    expect(control._spreadsheet.getSheetByName('Historial_Asignaciones')._fullData).toHaveLength(3);
  });

  it('segunda corrida no vuelve a enviar lo ya notificado', () => {
    setup({ filasAnalisis: [filaAnalisis('u1', 'María Pérez')], filasControl: [['L1', 'u1']] });
    a.notificar();
    const r = a.notificar();
    expect(r.correos).toBe(0);
    expect(enviados).toHaveLength(1);
  });

  it('si falla el envío no sella (se reintenta en la próxima corrida)', () => {
    setup({ filasAnalisis: [filaAnalisis('u1', 'María Pérez')], filasControl: [['L1', 'u1']], falla: true });
    const r = a.notificar();
    expect(r.ok).toBe(false);
    expect(r.correos).toBe(0);
    expect(celda(hojaControl(), 2, 3)).toBeFalsy(); // la fila del mock es corta: sin sello
    expect(celda(hojaAnalisis(), 2, 9)).toBeFalsy();
  });

  it('asignación histórica (Fecha Evaluacion ya digitada) no genera correo', () => {
    setup({ filasAnalisis: [filaAnalisis('u1', 'María Pérez', new Date(2026, 7, 1))], filasControl: [['L1', 'u1']] });
    const r = a.notificar();
    expect(r.correos).toBe(0);
    expect(enviados).toHaveLength(0);
  });

  it('nombre sin correo: no envía, no sella y avisa al admin una sola vez', () => {
    setup({ filasAnalisis: [filaAnalisis('u1', 'Desconocido')], filasControl: [['L1', 'u1']] });
    const r1 = a.notificar();
    const r2 = a.notificar();
    expect(r1.correos).toBe(0);
    expect(r1.sinCorreo).toEqual({ DESCONOCIDO: 1 });
    const avisos = enviados.filter(e => e.to === 'audit@x.co');
    expect(avisos).toHaveLength(1);
    expect(r2.correos).toBe(0);
  });

  it('simular no envía ni escribe nada', () => {
    setup({ filasAnalisis: [filaAnalisis('u1', 'María Pérez')], filasControl: [['L1', 'u1']] });
    const r = a.notificar({ simular: true });
    expect(r.correos).toBe(1);
    expect(r.casos).toBe(1);
    expect(enviados).toHaveLength(0);
    expect(celda(hojaAnalisis(), 2, 9)).toBe('');
  });

  it('con otra corrida en curso no hace nada', () => {
    setup({ filasAnalisis: [filaAnalisis('u1', 'María Pérez')], filasControl: [['L1', 'u1']] });
    globalThis.LockService = createLockService({ simulateContention: true });
    const r = a.notificar();
    expect(r.ok).toBe(false);
    expect(enviados).toHaveLength(0);
  });
});

describe('configurarHojaConfigAnalistas()', () => {
  it('crea la pestaña con los 35 analistas iniciales y es idempotente', () => {
    const app = createSpreadsheetApp({ Control_General: [['x']] });
    globalThis.getHojaControlId = () => 'control';
    globalThis.SpreadsheetRegistry_get = () => app._spreadsheet;
    const src = readFileSync(resolve(__dirname, '../../Asignaciones.js'), 'utf-8');
    const fns = eval(`(function(){ ${src}\n; return { cfg: configurarHojaConfigAnalistas, mapa: Asignaciones_construirMapaAnalistas_ }; })()`);

    expect(fns.cfg().agregados).toBe(35);
    expect(fns.cfg().agregados).toBe(0);

    const datos = app._spreadsheet.getSheetByName('Config_Analistas')._fullData;
    expect(datos).toHaveLength(36);
    const mapa = fns.mapa(datos);
    expect(Object.keys(mapa)).toHaveLength(35);
    // Tildes y Ñ se normalizan: el sheet puede traer "B PINEDA" o "B PÍNEDA"
    expect(mapa['B PINEDA'].email).toBe('blanca.pineda@segurosbolivar.com');
    expect(mapa['S ARANGON'].email).toBe('saul.aragon@segurosbolivar.com');
    expect(mapa['J CASTANEDA'].email).toBe('jennifer.castaneda@segurosbolivar.com');
  });
});
