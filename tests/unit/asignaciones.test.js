/**
 * Unit tests: Asignaciones.js
 *
 * El admin escribe (o arrastra) el NOMBRE del analista en ASIGNADA A…; el onEdit deja la hora
 * de la última edición y el trigger, pasada la calma, revisa la columna y envía un correo por
 * analista con todo lo pendiente (nombre, Fecha Evaluacion vacía) y sella la hora de envío.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { createSpreadsheetApp } from '../mocks/spreadsheet-app.mock.js';
import { createLockService } from '../mocks/lock-service.mock.js';
import { readFileSync } from 'fs';
import { resolve } from 'path';

const leerFuente = (f) => readFileSync(resolve(__dirname, '../../' + f), 'utf-8');
const sourceCode = leerFuente('Infraestructura_Concurrencia.js') + '\n' + leerFuente('Asignaciones.js');

function loadSource() {
  const wrapped = `(function() { ${sourceCode}
  ; return {
    normalizarNombre: Asignaciones_normalizarNombre_,
    buscarColumna: Asignaciones_buscarColumna_,
    construirMapa: Asignaciones_construirMapaAnalistas_,
    detectar: Asignaciones_detectarPendientes_,
    construirCorreo: Asignaciones_construirCorreo_,
    construirAsunto: Asignaciones_construirAsunto_,
    notificar: Asignaciones_ejecutar_,
    notificarManual: notificarAsignacionesPendientes,
    programado: procesarAsignacionesProgramado,
    marcar: marcarAsignacionPendiente,
    hayTrabajo: Asignaciones_hayTrabajo_
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

  it('el asunto lleva fecha, analista y cantidad para identificar la asignación', () => {
    const f = new Date(2026, 9, 2, 14, 35);
    expect(a.construirAsunto('LAURA GÓMEZ', 6, f)).toBe('📋 Asignación · 02/10/2026 · Laura Gómez · 6 solicitudes');
    expect(a.construirAsunto('laura gómez', 1, f)).toBe('📋 Asignación · 02/10/2026 · Laura Gómez · 1 solicitud');
    expect(a.construirAsunto('', 2, f)).toBe('📋 Asignación · 02/10/2026 · 2 solicitudes');
  });

  it('el correo agrupa por lote, destaca Solicitud Inquilino, trae el recordatorio y escapa HTML', () => {
    const c = a.construirCorreo('Ana <b>', [
      { idLote: 'L1', solicitudInquilino: '1234567', arrendatario: 'Pedro & Co', poliza: '123', ciudad: 'PEREIRA', sucursal: 'EJE CAFETERO', reasignado: false },
      { idLote: 'L1', solicitudInquilino: '1234568', arrendatario: 'Luz', poliza: '123', ciudad: 'PEREIRA', sucursal: 'EJE CAFETERO', reasignado: true },
      { idLote: 'L2', solicitudInquilino: '', arrendatario: 'Sin Num', poliza: '9', ciudad: 'CALI', sucursal: 'OCCIDENTE', reasignado: false }
    ], 'https://sheet');
    expect(c.asunto).toContain('3 solicitudes');
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

  describe('detectar pendientes (estado de la hoja)', () => {
    const mapa = {
      'MARIA PEREZ': { nombre: 'María Pérez', email: 'maria@x.co' },
      'LUIS MORA': { nombre: 'Luis Mora', email: 'luis@x.co' }
    };
    const base = (o = {}) => ({
      asignadas: ['María Pérez'],
      fechasEvaluacion: [''],
      registroSai: [''],
      uuids: ['u1'],
      lotes: ['L-1'],
      indiceControl: { u1: { fila: 5, fh: '', notificado: '' } },
      mapa,
      ...o
    });

    it('asignación nueva: nombre y Fecha Evaluacion vacía', () => {
      const r = a.detectar(base());
      expect(r.porEmail['maria@x.co'].casos).toHaveLength(1);
      expect(r.porEmail['maria@x.co'].casos[0]).toMatchObject({ filaRegistro: 2, uuid: 'u1', filaControl: 5, reasignado: false, idLote: 'L-1' });
    });

    it('un arrastre de muchas filas queda agrupado en un solo analista (nombre con distinta forma)', () => {
      const n = 12;
      const r = a.detectar(base({
        asignadas: Array.from({ length: n }, (_, i) => (i % 2 ? 'MARIA  PEREZ' : 'María Pérez')).concat(['Luis Mora']),
        fechasEvaluacion: Array(n + 1).fill(''),
        registroSai: Array(n + 1).fill(''),
        uuids: Array.from({ length: n + 1 }, (_, i) => 'u' + (i + 1)),
        lotes: Array(n + 1).fill('L-1'),
        indiceControl: Object.fromEntries(Array.from({ length: n + 1 }, (_, i) => ['u' + (i + 1), { fila: i + 5 }]))
      }));
      expect(r.porEmail['maria@x.co'].casos).toHaveLength(12);
      expect(r.porEmail['luis@x.co'].casos).toHaveLength(1);
    });

    it('con Fecha Evaluacion diligenciada NO se asigna (filas anteriores o digitadas a mano)', () => {
      const r = a.detectar(base({ fechasEvaluacion: [new Date(2026, 9, 1)] }));
      expect(r.porEmail).toEqual({});
      expect(r.omitidas.fechaOcupada).toBe(1);
    });

    it('un texto cualquiera en Fecha Evaluacion también la deja ocupada', () => {
      expect(a.detectar(base({ fechasEvaluacion: ['pendiente'] })).porEmail).toEqual({});
    });

    it('ignora lo ya notificado al mismo analista', () => {
      const r = a.detectar(base({ indiceControl: { u1: { fila: 5, fh: new Date(), notificado: 'María Pérez' } } }));
      expect(r.porEmail).toEqual({});
      expect(r.omitidas.yaNotificadas).toBe(1);
    });

    it('reasignación: analista distinto al notificado, aunque Fecha Evaluacion tenga la fecha del sistema', () => {
      const r = a.detectar(base({
        asignadas: ['Luis Mora'],
        fechasEvaluacion: [new Date()],
        indiceControl: { u1: { fila: 5, fh: new Date(), notificado: 'María Pérez' } }
      }));
      expect(r.porEmail['luis@x.co'].casos[0].reasignado).toBe(true);
    });

    it('ignora casos ya analizados (REGISTRO ANALISTA SAI lleno) y filas sin asignar; cuenta UUID sin fila en Control_General', () => {
      const r = a.detectar(base({
        asignadas: ['María Pérez', '', 'María Pérez'],
        fechasEvaluacion: ['', '', ''],
        registroSai: ['maria@x.co', '', ''],
        uuids: ['u1', 'u2', 'uX'],
        lotes: ['', '', ''],
        indiceControl: { u1: { fila: 5 }, u2: { fila: 6 } }
      }));
      expect(r.porEmail).toEqual({});
      expect(r.omitidas).toMatchObject({ analizadas: 1, sinFilaControl: 1 });
      expect(r.sinFilaControl).toBe(1);
    });

    it('nombres sin correo se reportan con sus filas y no se notifican', () => {
      const r = a.detectar(base({
        asignadas: ['Desconocido'],
        fechasEvaluacion: [''],
        registroSai: ['']
      }));
      expect(r.sinCorreo).toEqual({ DESCONOCIDO: 1 });
      expect(r.sinCorreoCasos).toHaveLength(1);
      expect(r.porEmail).toEqual({});
    });
  });
});

// ─── Orquestación con hojas simuladas ──────────────────────────────────────────

describe('notificarAsignacionesPendientes()', () => {
  const HDR_ANALISIS = ['UUID_SISTEMA', 'codigo lote', 'Arrendatario', 'Póliza', 'ciudad', 'sucursal', 'ASIGNADA A…', 'REGISTRO ANALISTA SAI', 'Fecha Evaluacion', 'Solicitud Inquilino'];
  const HDR_CONTROL = ['ID Lote', 'UUID_SISTEMA'];
  const ESPERA = 2 * 60 * 1000;

  let analisis, control, enviados, a, props, lockRetenidoAlEnviar;

  function setup({ filasAnalisis, filasControl, filasConfig, falla = false, props: propsExtra = {} }) {
    analisis = createSpreadsheetApp({ 'registro analisis': [HDR_ANALISIS, ...filasAnalisis] });
    control = createSpreadsheetApp({
      Control_General: [HDR_CONTROL, ...filasControl],
      Config_Analistas: filasConfig || [
        ['NOMBRE_EN_SHEET', 'EMAIL', 'ACTIVO'],
        ['María Pérez', 'maria@x.co', true],
        ['Luis Mora', 'luis@x.co', true]
      ]
    });
    enviados = [];
    lockRetenidoAlEnviar = [];
    globalThis.getArchivoAnalisisId = () => 'analisis';
    globalThis.getHojaControlId = () => 'control';
    globalThis.SpreadsheetRegistry_get = (id) => (id === 'analisis' ? analisis._spreadsheet : control._spreadsheet);
    globalThis.LockService = createLockService();
    globalThis.MailApp = {
      getRemainingDailyQuota: () => 100,
      sendEmail: vi.fn((o) => {
        if (falla) throw new Error('cuota');
        // Buena práctica: nunca enviar correos reteniendo el lock global del proyecto
        lockRetenidoAlEnviar.push(globalThis.LockService.getScriptLock().isLocked());
        enviados.push(o);
      })
    };
    props = { ...propsExtra };
    globalThis.PropertiesService = {
      getScriptProperties: () => ({
        getProperty: (k) => (k in props ? props[k] : null),
        setProperty: (k, v) => { props[k] = v; },
        deleteProperty: (k) => { delete props[k]; }
      })
    };
    let uuid = 0;
    globalThis.Utilities = { getUuid: () => 'tok-' + (++uuid) };
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

  const filaAnalisis = (uuid, asignada, fechaEval = '', sai = '', lote = 'LOTE-1') =>
    [uuid, lote, 'Pedro', '123', 'PEREIRA', 'EJE CAFETERO', asignada, sai, fechaEval, '9000' + uuid.slice(1)];

  const hojaControl = () => control._spreadsheet.getSheetByName('Control_General');
  const hojaAnalisis = () => analisis._spreadsheet.getSheetByName('registro analisis');
  const celda = (hoja, fila, columna) => hoja._fullData[fila - 1][columna - 1];

  beforeEach(() => {
    vi.useRealTimers();
  });

  it('ejecutar la función a mano (notificarAsignacionesPendientes) envía de inmediato, sin esperar la calma', () => {
    setup({ filasAnalisis: [filaAnalisis('u1', 'María Pérez')], filasControl: [['L1', 'u1']] });
    props['ASIGNACIONES_ULTIMA_EDICION'] = String(Date.now()); // edición recién hecha: el trigger esperaría
    expect(a.programado().omitida).toBe(true);
    const r = a.notificarManual();
    expect(r.correos).toBe(1);
    expect(enviados).toHaveLength(1);
  });

  it('envía UN correo por analista con TODOS sus pendientes, sella y rellena Fecha Evaluacion', () => {
    setup({
      filasAnalisis: [filaAnalisis('u1', 'María Pérez'), filaAnalisis('u2', 'María Pérez'), filaAnalisis('u3', 'María Pérez')],
      filasControl: [['L1', 'u1'], ['L1', 'u2'], ['L1', 'u3']]
    });

    const antes = Date.now();
    const r = a.notificar({ forzar: true });

    expect(r.ok).toBe(true);
    expect(r.correos).toBe(1);
    expect(r.casos).toBe(3);
    expect(enviados).toHaveLength(1);
    expect(enviados[0].to).toBe('maria@x.co');
    expect(enviados[0].bcc).toBe('audit@x.co');
    // CC: cadena jerárquica sin duplicados y sin el propio analista
    expect(enviados[0].cc).toBe('admin1@x.co,ADMIN2@x.co');
    expect(enviados[0].subject).toContain('3 solicitudes');
    // Saludo solo con el primer nombre (derivado del correo), no el nombre del sheet
    expect(enviados[0].htmlBody).toContain('Hola, Maria');
    expect(enviados[0].htmlBody).not.toContain('Hola, María Pérez');
    // Dato principal: Solicitud Inquilino de registro analisis
    expect(enviados[0].htmlBody).toContain('9000' + '1');
    expect(enviados[0].htmlBody).toContain('9000' + '3');

    // Columnas nuevas creadas al final de Control_General (cols 3 y 4) y selladas
    const hc = hojaControl();
    expect(hc._fullData[0].slice(2)).toEqual(['F.H Asignacion', 'Analista Notificado']);
    const fh2 = celda(hc, 2, 3);
    expect(fh2).toBeInstanceOf(Date);
    expect(fh2.getTime()).toBeGreaterThanOrEqual(antes);
    expect(fh2.getTime()).toBe(celda(hc, 4, 3).getTime()); // misma hora para todo el correo
    expect(celda(hc, 2, 4)).toBe('María Pérez');

    // Fecha Evaluacion rellenada
    expect(celda(hojaAnalisis(), 2, 9)).toBeInstanceOf(Date);
    // Historial: encabezado + 3 casos
    expect(control._spreadsheet.getSheetByName('Historial_Asignaciones')._fullData).toHaveLength(4);
  });

  it('segunda corrida no vuelve a enviar lo ya notificado', () => {
    setup({ filasAnalisis: [filaAnalisis('u1', 'María Pérez')], filasControl: [['L1', 'u1']] });
    a.notificar({ forzar: true });
    expect(a.notificar({ forzar: true }).correos).toBe(0);
    expect(enviados).toHaveLength(1);
  });

  it('las filas con Fecha Evaluacion ya diligenciada (anteriores) no generan correo ni se tocan', () => {
    setup({
      filasAnalisis: [filaAnalisis('u1', 'María Pérez', new Date(2026, 7, 1)), filaAnalisis('u2', 'María Pérez')],
      filasControl: [['L1', 'u1'], ['L1', 'u2']]
    });
    const r = a.notificar({ forzar: true });
    expect(r.casos).toBe(1);
    expect(celda(hojaControl(), 2, 4)).toBeFalsy();
    expect(celda(hojaControl(), 3, 4)).toBe('María Pérez');
    expect(celda(hojaAnalisis(), 2, 9)).toEqual(new Date(2026, 7, 1)); // no pisa la fecha existente
  });

  it('reasignación: nuevo correo al nuevo analista y nuevo sello', () => {
    setup({ filasAnalisis: [filaAnalisis('u1', 'María Pérez')], filasControl: [['L1', 'u1']] });
    a.notificar({ forzar: true });
    hojaAnalisis()._fullData[1][6] = 'Luis Mora';
    const r = a.notificar({ forzar: true });
    expect(r.correos).toBe(1);
    expect(enviados[1].to).toBe('luis@x.co');
    expect(enviados[1].htmlBody).toContain('REASIGNADO');
    expect(celda(hojaControl(), 2, 4)).toBe('Luis Mora');
  });

  it('si falla el envío no sella y programa el reintento para el siguiente ciclo (sin esperar la calma)', () => {
    setup({ filasAnalisis: [filaAnalisis('u1', 'María Pérez')], filasControl: [['L1', 'u1']], falla: true });
    const r = a.notificar({ forzar: true });
    expect(r.ok).toBe(false);
    expect(r.correos).toBe(0);
    expect(celda(hojaControl(), 2, 3)).toBeFalsy();
    expect(celda(hojaAnalisis(), 2, 9)).toBeFalsy();
    expect(a.hayTrabajo()).toBe(true);
  });

  it('nombre sin correo: no envía, no sella y avisa al admin una sola vez', () => {
    setup({ filasAnalisis: [filaAnalisis('u1', 'Desconocido')], filasControl: [['L1', 'u1']] });
    const r1 = a.notificar({ forzar: true });
    const r2 = a.notificar({ forzar: true });
    expect(r1.correos).toBe(0);
    expect(r1.sinCorreo).toEqual({ DESCONOCIDO: 1 });
    expect(enviados.filter(e => e.to === 'audit@x.co')).toHaveLength(1);
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

  it('no retiene el lock global mientras envía correos ni al terminar', () => {
    setup({ filasAnalisis: [filaAnalisis('u1', 'María Pérez')], filasControl: [['L1', 'u1']] });
    a.notificar({ forzar: true });
    expect(lockRetenidoAlEnviar).toEqual([false]);
    expect(globalThis.LockService.getScriptLock().isLocked()).toBe(false);
    expect(props['LEASE_asignaciones']).toBeUndefined(); // el préstamo se libera
  });

  it('si otra corrida tiene el préstamo no hace nada', () => {
    setup({ filasAnalisis: [filaAnalisis('u1', 'María Pérez')], filasControl: [['L1', 'u1']] });
    props['LEASE_asignaciones'] = JSON.stringify({ token: 'otro', hasta: Date.now() + 60000 });
    const r = a.notificar({ forzar: true });
    expect(r.ok).toBe(false);
    expect(enviados).toHaveLength(0);
  });

  it('con el lock global ocupado no envía', () => {
    setup({ filasAnalisis: [filaAnalisis('u1', 'María Pérez')], filasControl: [['L1', 'u1']] });
    globalThis.LockService = createLockService({ simulateContention: true });
    const r = a.notificar({ forzar: true });
    expect(r.ok).toBe(false);
    expect(enviados).toHaveLength(0);
  });

  describe('compuerta: espera tras la última edición y barrido de seguridad', () => {
    const t = (h, m) => vi.setSystemTime(new Date(2026, 9, 5, h, m));

    it('sin ediciones y con barrido reciente sale de inmediato sin abrir ningún libro', () => {
      setup({ filasAnalisis: [filaAnalisis('u1', 'María Pérez')], filasControl: [['L1', 'u1']] });
      vi.useFakeTimers(); t(9, 0);
      a.notificar({ forzar: true });
      t(9, 30);
      const abrir = vi.fn(globalThis.SpreadsheetRegistry_get);
      globalThis.SpreadsheetRegistry_get = abrir;
      expect(a.notificar().omitida).toBe(true);
      expect(abrir).not.toHaveBeenCalled();
    });

    it('una edición reciente espera la calma: no envía antes de 2 min y sí después (escribir y arrastrar = un correo)', () => {
      setup({ filasAnalisis: [filaAnalisis('u1', 'María Pérez')], filasControl: [['L1', 'u1']] });
      vi.useFakeTimers(); t(9, 0);
      props['ASIGNACIONES_ULTIMA_EDICION'] = String(Date.now());
      expect(a.hayTrabajo()).toBe(false);
      expect(a.notificar().omitida).toBe(true);

      t(9, 1); // pasó 1 min: llegó otra edición (el arrastre)
      props['ASIGNACIONES_ULTIMA_EDICION'] = String(Date.now());
      t(9, 2);
      expect(a.hayTrabajo()).toBe(false);

      t(9, 3);
      expect(a.hayTrabajo()).toBe(true);
      const r = a.notificar();
      expect(r.correos).toBe(1);
      expect(props['ASIGNACIONES_ULTIMA_EDICION']).toBeUndefined(); // se limpia al empezar
    });

    it('el barrido de seguridad corre cada hora aunque no haya ediciones', () => {
      setup({ filasAnalisis: [], filasControl: [] });
      vi.useFakeTimers(); t(9, 0);
      a.notificar({ forzar: true });
      t(9, 30);
      expect(a.hayTrabajo()).toBe(false);
      t(10, 1);
      expect(a.hayTrabajo()).toBe(true);
    });

  });

  describe('marcarAsignacionPendiente (onEdit): solo deja la hora de la última edición', () => {
    const edicion = (fila, col, { filas = 1, columnas = 1, nombreHoja = 'registro analisis' } = {}) => {
      const hoja = hojaAnalisis();
      const range = hoja.getRange(fila, col, filas, columnas);
      range.getSheet = () => (nombreHoja === 'registro analisis' ? hoja : { getName: () => nombreHoja });
      return { range };
    };

    it('editar ASIGNADA A… deja la marca', () => {
      setup({ filasAnalisis: [filaAnalisis('u1', '')], filasControl: [['L1', 'u1']] });
      a.marcar(edicion(2, 7)); // ASIGNADA A… es la columna 7
      expect(Number(props['ASIGNACIONES_ULTIMA_EDICION'])).toBeGreaterThan(0);
    });

    it('un arrastre (rango de varias filas) o un pegado de bloque también la dejan, sin leer celdas', () => {
      setup({ filasAnalisis: [filaAnalisis('u1', '')], filasControl: [['L1', 'u1']], props: { ASIGNACIONES_COL_ASIGNADA: '7' } });
      const hoja = hojaAnalisis();
      const e1 = edicion(2, 7, { filas: 12 });
      const e2 = edicion(2, 5, { columnas: 4 });
      hoja.resetCallLog();
      a.marcar(e1);
      expect(props['ASIGNACIONES_ULTIMA_EDICION']).toBeTruthy();
      delete props['ASIGNACIONES_ULTIMA_EDICION'];
      a.marcar(e2);
      expect(props['ASIGNACIONES_ULTIMA_EDICION']).toBeTruthy();
      expect(hoja.getCallLog('getValues')).toHaveLength(0);
    });

    it('editar otra columna, otra hoja o el encabezado no deja marca', () => {
      setup({ filasAnalisis: [filaAnalisis('u1', '')], filasControl: [['L1', 'u1']] });
      a.marcar(edicion(2, 3));
      a.marcar(edicion(2, 7, { nombreHoja: 'otra hoja' }));
      a.marcar(edicion(1, 7));
      expect(props['ASIGNACIONES_ULTIMA_EDICION']).toBeUndefined();
    });

    it('nunca lanza aunque el evento venga incompleto', () => {
      setup({ filasAnalisis: [], filasControl: [] });
      expect(() => a.marcar(undefined)).not.toThrow();
      expect(() => a.marcar({})).not.toThrow();
    });
  });

});

describe('configurarHojaConfigAnalistas()', () => {
  it('crea la pestaña con los 35 analistas iniciales y es idempotente', () => {
    const app = createSpreadsheetApp({ Control_General: [['x']] });
    globalThis.getHojaControlId = () => 'control';
    globalThis.SpreadsheetRegistry_get = () => app._spreadsheet;
    const src = sourceCode;
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
