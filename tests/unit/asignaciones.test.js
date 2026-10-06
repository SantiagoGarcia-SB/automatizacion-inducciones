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
    hayTrabajo: Asignaciones_hayTrabajo_,
    completarFechas: Asignaciones_completarFechas_,
    tramos: Asignaciones_tramos_
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

  describe('tramos de filas (leer/escribir en bloques)', () => {
    it('agrupa filas seguidas y separa las que no lo son (escritura: sin holgura)', () => {
      expect(a.tramos([5, 6, 7, 20, 21, 40], 0)).toEqual([
        { inicio: 5, cantidad: 3 }, { inicio: 20, cantidad: 2 }, { inicio: 40, cantidad: 1 }
      ]);
    });
    it('ignora el orden y las repetidas', () => {
      expect(a.tramos([7, 5, 6, 6, 5], 0)).toEqual([{ inicio: 5, cantidad: 3 }]);
    });
    it('con holgura (lectura) junta filas cercanas en un solo bloque', () => {
      expect(a.tramos([5, 8, 29], 20)).toEqual([{ inicio: 5, cantidad: 25 }]);
      expect(a.tramos([5, 8, 30], 20)).toEqual([{ inicio: 5, cantidad: 4 }, { inicio: 30, cantidad: 1 }]);
    });
    it('sin filas no hay tramos', () => {
      expect(a.tramos([], 0)).toEqual([]);
    });
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

    it('con la fecha llena, lo ya notificado al mismo analista no se reenvía', () => {
      const r = a.detectar(base({
        fechasEvaluacion: [new Date()],
        indiceControl: { u1: { fila: 5, fh: new Date(2026, 9, 1), notificado: 'María Pérez' } }
      }));
      expect(r.porEmail).toEqual({});
      expect(r.omitidas.fechaOcupada).toBe(1);
    });

    it('si la operación borra la fecha, el caso queda DISPONIBLE y vuelve a salir aunque ya se hubiera notificado', () => {
      const r = a.detectar(base({
        fechasEvaluacion: [''],
        indiceControl: { u1: { fila: 5, fh: new Date(2026, 9, 1), notificado: 'María Pérez' } },
        ahora: new Date(2026, 9, 6).getTime()
      }));
      expect(r.porEmail['maria@x.co'].casos).toHaveLength(1);
      expect(r.porEmail['maria@x.co'].casos[0].reasignado).toBe(false);
    });

    it('si quedó sellada hace menos de 30 min con la fecha vacía (falló la escritura) NO se reenvía', () => {
      const fh = new Date(2026, 9, 6, 10, 0);
      const r = a.detectar(base({
        indiceControl: { u1: { fila: 5, fh, notificado: 'María Pérez' } },
        ahora: fh.getTime() + 10 * 60 * 1000
      }));
      expect(r.porEmail).toEqual({});
      expect(r.omitidas.selloReciente).toBe(1);
      // pasada la ventana, vuelve a estar disponible
      const despues = a.detectar(base({
        indiceControl: { u1: { fila: 5, fh, notificado: 'María Pérez' } },
        ahora: fh.getTime() + 31 * 60 * 1000
      }));
      expect(despues.porEmail['maria@x.co'].casos).toHaveLength(1);
    });

    it('las filas selladas con la fecha vacía se listan para poder rellenarlas', () => {
      const fh = new Date(2026, 9, 1, 8, 0);
      const r = a.detectar(base({ indiceControl: { u1: { fila: 5, fh, notificado: 'María Pérez' } }, ahora: new Date(2026, 9, 6).getTime() }));
      expect(r.conSelloSinFecha).toEqual([{ filaRegistro: 2, uuid: 'u1', fhAsignacion: fh }]);
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

    it('con detalle explica por qué una fila con Fecha Evaluacion vacía no genera correo', () => {
      const ahora = Date.now();
      const r = a.detectar(base({
        detalle: true,
        ahora,
        asignadas: ['María Pérez', 'María Pérez', 'María Pérez'],
        fechasEvaluacion: ['', '', new Date()],
        registroSai: ['', '', ''],
        uuids: ['u1', 'uX', 'u3'],
        lotes: ['L-1', 'L-1', 'L-1'],
        indiceControl: {
          u1: { fila: 5, fh: new Date(ahora - 60 * 1000), notificado: 'María Pérez' },
          u3: { fila: 7, fh: new Date(), notificado: 'María Pérez' }
        }
      }));
      expect(r.detalle).toHaveLength(2); // la fila 4 tiene fecha llena: no es de interés
      expect(r.detalle[0]).toMatchObject({ filaRegistro: 2, uuid: 'u1' });
      expect(r.detalle[0].motivo).toMatch(/sellada hace menos de 30 min/);
      expect(r.detalle[1]).toMatchObject({ filaRegistro: 3, uuid: 'uX' });
      expect(r.detalle[1].motivo).toMatch(/UUID sin fila/);
      expect(a.detectar(base()).detalle).toBeNull();
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

  it('la operación borra la fecha para volver a asignar: el caso sale de nuevo (pasada la ventana de sello reciente)', () => {
    setup({ filasAnalisis: [filaAnalisis('u1', 'María Pérez')], filasControl: [['L1', 'u1']] });
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2026, 9, 6, 9, 0));
    a.notificar({ forzar: true });
    expect(enviados).toHaveLength(1);

    hojaAnalisis()._fullData[1][8] = ''; // la operación borra Fecha Evaluacion
    vi.setSystemTime(new Date(2026, 9, 6, 9, 10));
    expect(a.notificar({ forzar: true }).correos).toBe(0); // 10 min: se asume fallo de escritura, no se duplica

    vi.setSystemTime(new Date(2026, 9, 6, 11, 0));
    expect(a.notificar({ forzar: true }).correos).toBe(1);
    expect(enviados).toHaveLength(2);
    expect(celda(hojaAnalisis(), 2, 9)).toBeInstanceOf(Date); // la fecha quedó escrita otra vez
    expect(a.notificar({ forzar: true }).correos).toBe(0);
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

  describe('optimización: filtrar primero y escribir en bloques', () => {
    const muchas = (n, nombre = 'María Pérez') => ({
      filasAnalisis: Array.from({ length: n }, (_, i) => filaAnalisis('u' + (i + 1), nombre)),
      filasControl: Array.from({ length: n }, (_, i) => ['L1', 'u' + (i + 1)])
    });

    it('pasada de seguridad sin filas candidatas: lee solo 2 columnas y no abre Control_General', () => {
      setup({ filasAnalisis: [filaAnalisis('u1', 'María Pérez', new Date(2026, 9, 1)), filaAnalisis('u2', '')], filasControl: [['L1', 'u1'], ['L1', 'u2']] });
      const abrir = vi.fn(globalThis.SpreadsheetRegistry_get);
      globalThis.SpreadsheetRegistry_get = abrir;
      props['ASIGNACIONES_ULTIMO_BARRIDO'] = '1'; // barrido vencido, sin marca de edición
      const hoja = hojaAnalisis();
      hoja.resetCallLog();
      const r2 = a.notificar({});
      expect(r2.correos).toBe(0);
      expect(abrir).toHaveBeenCalledTimes(1); // solo registro analisis; Control_General no se abrió
      expect(hoja.getCallLog('getValues').length).toBeLessThanOrEqual(3); // encabezado + 2 columnas
    });

    it('con candidatas la pasada de seguridad sí envía', () => {
      setup(muchas(3));
      props['ASIGNACIONES_ULTIMO_BARRIDO'] = '1';
      expect(a.notificar({}).correos).toBe(1);
    });

    it('un arrastre de 60 filas seguidas se sella con pocas llamadas, no con una por caso', () => {
      setup(muchas(60));
      a.notificar({ forzar: true });
      expect(enviados).toHaveLength(1);
      expect(enviados[0].subject).toContain('60 solicitudes');

      const ctl = hojaControl().getCallLog('setValues').filter(c => c.values && c.values.length === 60);
      expect(ctl.length).toBe(2); // F.H Asignacion y Analista Notificado: un bloque cada uno
      const reg = hojaAnalisis().getCallLog('setValues');
      expect(reg).toHaveLength(1); // Fecha Evaluacion: un bloque
      expect(reg[0].values).toHaveLength(60);
      expect(hojaAnalisis().getCallLog('setValue')).toHaveLength(0);
      expect(hojaControl().getCallLog('setValue')).toHaveLength(0);
      // Historial: una sola escritura con las 60 líneas (más el encabezado), sin appendRow por caso
      const hist = control._spreadsheet.getSheetByName('Historial_Asignaciones');
      expect(hist.getCallLog('setValues')).toHaveLength(1);
      expect(hist.getCallLog('appendRow')).toHaveLength(1); // solo el encabezado
      expect(hist._fullData).toHaveLength(61);
      // y todas quedaron selladas
      for (let f = 2; f <= 61; f++) {
        expect(celda(hojaAnalisis(), f, 9)).toBeInstanceOf(Date);
        expect(celda(hojaControl(), f, 4)).toBe('María Pérez');
      }
    });

    it('filas separadas se escriben en bloques separados sin pisar las de en medio', () => {
      setup({
        filasAnalisis: [filaAnalisis('u1', 'María Pérez'), filaAnalisis('u2', 'María Pérez', new Date(2026, 8, 1)), filaAnalisis('u3', 'María Pérez')],
        filasControl: [['L1', 'u1'], ['L1', 'u2'], ['L1', 'u3']]
      });
      a.notificar({ forzar: true });
      expect(celda(hojaAnalisis(), 3, 9)).toEqual(new Date(2026, 8, 1)); // la del medio no se tocó
      expect(celda(hojaAnalisis(), 2, 9)).toBeInstanceOf(Date);
      expect(celda(hojaAnalisis(), 4, 9)).toBeInstanceOf(Date);
      expect(hojaAnalisis().getCallLog('setValues')).toHaveLength(2);
    });

    it('si el tiempo se agota deja los grupos que faltan para el siguiente ciclo, sin perderlos ni duplicarlos', () => {
      setup({
        filasAnalisis: [filaAnalisis('u1', 'María Pérez'), filaAnalisis('u2', 'Luis Mora')],
        filasControl: [['L1', 'u1'], ['L1', 'u2']]
      });
      vi.useFakeTimers();
      vi.setSystemTime(new Date(2026, 9, 6, 9, 0, 0));
      const envio = globalThis.MailApp.sendEmail;
      globalThis.MailApp.sendEmail = vi.fn((o) => { envio(o); vi.setSystemTime(new Date(2026, 9, 6, 9, 6, 0)); }); // el primer envío "tarda" 6 min

      const r = a.notificar({ forzar: true });
      expect(r.correos).toBe(1);
      expect(r.parcial).toBe(true);
      expect(enviados).toHaveLength(1);
      expect(a.hayTrabajo()).toBe(true); // reintento en el siguiente ciclo

      globalThis.MailApp.sendEmail = envio;
      const r2 = a.notificar({ forzar: true });
      expect(r2.correos).toBe(1);
      expect(enviados).toHaveLength(2);
      expect(enviados[0].to).not.toBe(enviados[1].to);
    });

    it('si la fecha no queda escrita lo registra como error con las filas', () => {
      setup(muchas(3));
      // la hoja ignora las escrituras sobre Fecha Evaluacion (simula un borrado inmediato)
      const hoja = hojaAnalisis();
      const getRange = hoja.getRange.bind(hoja);
      hoja.getRange = (f, c, n, m) => {
        const r = getRange(f, c, n, m);
        if (c === 9 && typeof n === 'number') r.setValues = () => {};
        return r;
      };
      const res = a.notificar({ forzar: true });
      expect(res.ok).toBe(false);
      expect(res.correos).toBe(1);
      expect(globalThis._registrarEvento_).toHaveBeenCalledWith('ERROR', 'Asignaciones.js', expect.stringContaining('Fecha Evaluacion no quedó escrita'), expect.stringContaining('filas 2, 3, 4'));
    });
  });

  describe('completar Fecha Evaluacion de filas ya notificadas', () => {
    it('rellena con la fecha de F.H Asignacion solo las notificadas con la fecha vacía, sin enviar correos', () => {
      setup({
        filasAnalisis: [filaAnalisis('u1', 'María Pérez'), filaAnalisis('u2', 'María Pérez'), filaAnalisis('u3', 'María Pérez')],
        filasControl: [['L1', 'u1'], ['L1', 'u2'], ['L1', 'u3']]
      });
      a.notificar({ forzar: true });
      expect(enviados).toHaveLength(1);
      const hora = celda(hojaControl(), 2, 3);
      hojaAnalisis()._fullData[1][8] = ''; // se perdió la fecha de u1
      hojaAnalisis()._fullData[2][8] = ''; // se perdió la fecha de u2

      const r = a.completarFechas();
      expect(r.ok).toBe(true);
      expect(r.escritas).toBe(2);
      expect(celda(hojaAnalisis(), 2, 9)).toEqual(hora);
      expect(celda(hojaAnalisis(), 3, 9)).toEqual(hora);
      expect(enviados).toHaveLength(1); // ningún correo nuevo
    });

    it('si no hay nada que completar no escribe', () => {
      setup({ filasAnalisis: [filaAnalisis('u1', 'María Pérez')], filasControl: [['L1', 'u1']] });
      a.notificar({ forzar: true });
      expect(a.completarFechas().escritas).toBe(0);
    });
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
