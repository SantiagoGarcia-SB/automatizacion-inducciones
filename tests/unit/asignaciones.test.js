/**
 * Unit tests: Asignaciones.js
 *
 * El admin escribe el NOMBRE del analista en ASIGNADA A…; el onEdit anota la fila,
 * el trigger envía un correo por analista y sella en Control_General la hora de envío.
 * Solo se asigna si Fecha Evaluacion está vacía.
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
    notificar: notificarAsignacionesPendientes,
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

  describe('detectar pendientes (solo lo que está en la cola)', () => {
    const mapa = {
      'MARIA PEREZ': { nombre: 'María Pérez', email: 'maria@x.co' },
      'LUIS MORA': { nombre: 'Luis Mora', email: 'luis@x.co' }
    };
    const base = (o = {}) => ({
      cola: ['u1'],
      asignadas: ['María Pérez'],
      fechasEvaluacion: [''],
      registroSai: [''],
      uuids: ['u1'],
      indiceControl: { u1: { fila: 5, fh: '', notificado: '' } },
      mapa,
      ...o
    });

    it('asignación nueva: nombre escrito y Fecha Evaluacion vacía', () => {
      const r = a.detectar(base());
      expect(r.porEmail['maria@x.co'].casos).toHaveLength(1);
      expect(r.porEmail['maria@x.co'].casos[0]).toMatchObject({ filaRegistro: 2, uuid: 'u1', filaControl: 5, reasignado: false });
      expect(r.resueltos).toEqual([]); // sale de la cola cuando el envío resulta exitoso
    });

    it('agrupa varios casos del mismo analista (nombre con distinta forma)', () => {
      const r = a.detectar(base({
        cola: ['u1', 'u2', 'u3'],
        asignadas: ['María Pérez', 'MARIA  PEREZ', 'Luis Mora'],
        fechasEvaluacion: ['', '', ''],
        registroSai: ['', '', ''],
        uuids: ['u1', 'u2', 'u3'],
        indiceControl: { u1: { fila: 5 }, u2: { fila: 6 }, u3: { fila: 7 } }
      }));
      expect(r.porEmail['maria@x.co'].casos.map(c => c.filaRegistro)).toEqual([2, 3]);
      expect(r.porEmail['luis@x.co'].casos).toHaveLength(1);
    });

    it('solo mira lo anotado en la cola: una fila asignada antes y sin anotar no genera correo', () => {
      const r = a.detectar(base({
        asignadas: ['María Pérez', 'María Pérez'],
        fechasEvaluacion: ['', ''],
        registroSai: ['', ''],
        uuids: ['u1', 'u2'],
        indiceControl: { u1: { fila: 5 }, u2: { fila: 6 } }
      }));
      expect(r.porEmail['maria@x.co'].casos.map(c => c.uuid)).toEqual(['u1']);
    });

    it('Fecha Evaluacion ya diligenciada: no se asigna, se reporta y sale de la cola', () => {
      const r = a.detectar(base({ fechasEvaluacion: [new Date(2026, 9, 1)] }));
      expect(r.porEmail).toEqual({});
      expect(r.bloqueadas).toEqual([{ filaRegistro: 2, uuid: 'u1', nombreEnSheet: 'María Pérez' }]);
      expect(r.resueltos).toEqual(['u1']);
      expect(r.omitidas.fechaOcupada).toBe(1);
    });

    it('un texto cualquiera en Fecha Evaluacion también la deja ocupada', () => {
      expect(a.detectar(base({ fechasEvaluacion: ['pendiente'] })).bloqueadas).toHaveLength(1);
    });

    it('ignora lo ya notificado al mismo analista', () => {
      const r = a.detectar(base({ indiceControl: { u1: { fila: 5, fh: new Date(), notificado: 'María Pérez' } } }));
      expect(r.porEmail).toEqual({});
      expect(r.resueltos).toEqual(['u1']);
      expect(r.omitidas.yaNotificadas).toBe(1);
    });

    it('reasignación: analista distinto al notificado; la Fecha Evaluacion llena es la que puso el sistema', () => {
      const r = a.detectar(base({
        asignadas: ['Luis Mora'],
        fechasEvaluacion: [new Date()],
        indiceControl: { u1: { fila: 5, fh: new Date(), notificado: 'María Pérez' } }
      }));
      expect(r.porEmail['luis@x.co'].casos[0].reasignado).toBe(true);
      expect(r.bloqueadas).toEqual([]);
    });

    it('sale de la cola sin enviar: ya analizada, sin nombre, fila que ya no existe', () => {
      const r = a.detectar(base({
        cola: ['u1', 'u2', 'uX'],
        asignadas: ['María Pérez', ''],
        fechasEvaluacion: ['', ''],
        registroSai: ['maria@x.co', ''],
        uuids: ['u1', 'u2'],
        indiceControl: { u1: { fila: 5 }, u2: { fila: 6 } }
      }));
      expect(r.porEmail).toEqual({});
      expect(r.resueltos.sort()).toEqual(['u1', 'u2', 'uX']);
      expect(r.omitidas).toMatchObject({ analizadas: 1, sinAsignar: 1, noEncontradas: 1 });
    });

    it('nombre sin correo: se reporta y SIGUE en la cola; UUID sin fila en Control_General se cuenta y sale', () => {
      const r = a.detectar(base({
        cola: ['u1', 'u2'],
        asignadas: ['Desconocido', 'María Pérez'],
        fechasEvaluacion: ['', ''],
        registroSai: ['', ''],
        uuids: ['u1', 'u2'],
        indiceControl: { u1: { fila: 5 } }
      }));
      expect(r.sinCorreo).toEqual({ DESCONOCIDO: 1 });
      expect(r.sinCorreoUuids).toEqual(['u1']);
      expect(r.resueltos).toEqual(['u2']);
      expect(r.sinFilaControl).toBe(1);
      expect(r.porEmail).toEqual({});
    });
  });
});

// ─── Orquestación con hojas simuladas ──────────────────────────────────────────

describe('notificarAsignacionesPendientes()', () => {
  const HDR_ANALISIS = ['UUID_SISTEMA', 'codigo lote', 'Arrendatario', 'Póliza', 'ciudad', 'sucursal', 'ASIGNADA A…', 'REGISTRO ANALISTA SAI', 'Fecha Evaluacion', 'Solicitud Inquilino'];
  const HDR_CONTROL = ['ID Lote', 'UUID_SISTEMA'];

  let analisis, control, enviados, a, props, lockRetenidoAlEnviar;

  function setup({ filasAnalisis, filasControl, filasConfig, falla = false, cola = [] }) {
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
    props = cola.length ? { ASIGNACIONES_COLA: cola.join(',') } : {};
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

  const filaAnalisis = (uuid, asignada, fechaEval = '', sai = '') =>
    [uuid, 'LOTE-1', 'Pedro', '123', 'PEREIRA', 'EJE CAFETERO', asignada, sai, fechaEval, '9000' + uuid.slice(1)];

  const hojaControl = () => control._spreadsheet.getSheetByName('Control_General');
  const hojaAnalisis = () => analisis._spreadsheet.getSheetByName('registro analisis');
  const celda = (hoja, fila, columna) => hoja._fullData[fila - 1][columna - 1];

  beforeEach(() => {
    vi.useRealTimers();
  });

  it('envía un correo por analista, sella F.H Asignacion/Analista Notificado, rellena Fecha Evaluacion y vacía la cola', () => {
    setup({
      filasAnalisis: [filaAnalisis('u1', 'María Pérez'), filaAnalisis('u2', 'María Pérez')],
      filasControl: [['L1', 'u1'], ['L1', 'u2']],
      cola: ['u1', 'u2']
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
    expect(enviados[0].subject).toContain('2 solicitudes');
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
    // La cola queda vacía
    expect(props['ASIGNACIONES_COLA']).toBeUndefined();
  });

  it('solo notifica lo anotado: una fila con nombre que no está en la cola no genera correo', () => {
    setup({
      filasAnalisis: [filaAnalisis('u1', 'María Pérez'), filaAnalisis('u2', 'María Pérez')],
      filasControl: [['L1', 'u1'], ['L1', 'u2']],
      cola: ['u2']
    });
    const r = a.notificar();
    expect(r.casos).toBe(1);
    expect(celda(hojaControl(), 3, 4)).toBe('María Pérez');
    expect(celda(hojaControl(), 2, 4)).toBeFalsy();
  });

  it('sin nada en la cola sale de inmediato sin abrir ningún libro', () => {
    setup({ filasAnalisis: [filaAnalisis('u1', 'María Pérez')], filasControl: [['L1', 'u1']] });
    const abrir = vi.fn(globalThis.SpreadsheetRegistry_get);
    globalThis.SpreadsheetRegistry_get = abrir;
    const r = a.notificar();
    expect(r.omitida).toBe(true);
    expect(abrir).not.toHaveBeenCalled();
    expect(enviados).toHaveLength(0);
  });

  it('segunda corrida no vuelve a enviar lo ya notificado', () => {
    setup({ filasAnalisis: [filaAnalisis('u1', 'María Pérez')], filasControl: [['L1', 'u1']], cola: ['u1'] });
    a.notificar();
    expect(a.notificar().omitida).toBe(true);
    // Aunque el onEdit vuelva a anotar el mismo caso con el mismo nombre
    props['ASIGNACIONES_COLA'] = 'u1';
    expect(a.notificar().correos).toBe(0);
    expect(enviados).toHaveLength(1);
    expect(props['ASIGNACIONES_COLA']).toBeUndefined();
  });

  it('Fecha Evaluacion ya diligenciada: no envía, avisa al admin y saca el caso de la cola', () => {
    setup({
      filasAnalisis: [filaAnalisis('u1', 'María Pérez', new Date(2026, 9, 1))],
      filasControl: [['L1', 'u1']],
      cola: ['u1']
    });
    const r = a.notificar();
    expect(r.correos).toBe(0);
    expect(r.bloqueadas).toHaveLength(1);
    expect(enviados.filter(e => e.to === 'maria@x.co')).toHaveLength(0);
    const avisos = enviados.filter(e => e.to === 'audit@x.co');
    expect(avisos).toHaveLength(1);
    expect(avisos[0].subject).toContain('Fecha Evaluacion');
    expect(avisos[0].htmlBody).toContain('fila 2');
    expect(props['ASIGNACIONES_COLA']).toBeUndefined();
    expect(celda(hojaControl(), 2, 4)).toBeFalsy(); // sin sello
  });

  it('el admin deja la fecha vacía y vuelve a escribir el nombre: ahora sí se asigna', () => {
    setup({
      filasAnalisis: [filaAnalisis('u1', 'María Pérez', new Date(2026, 9, 1))],
      filasControl: [['L1', 'u1']],
      cola: ['u1']
    });
    a.notificar();
    hojaAnalisis()._fullData[1][8] = ''; // limpia Fecha Evaluacion
    props['ASIGNACIONES_COLA'] = 'u1';   // el onEdit vuelve a anotar
    const r = a.notificar();
    expect(r.correos).toBe(1);
  });

  it('reasignación: aunque Fecha Evaluacion tenga la fecha del sistema, se notifica al nuevo analista', () => {
    setup({
      filasAnalisis: [filaAnalisis('u1', 'María Pérez')],
      filasControl: [['L1', 'u1']],
      cola: ['u1']
    });
    a.notificar();
    hojaAnalisis()._fullData[1][6] = 'Luis Mora';
    props['ASIGNACIONES_COLA'] = 'u1';

    const r = a.notificar();
    expect(r.correos).toBe(1);
    expect(enviados[enviados.length - 1].to).toBe('luis@x.co');
    expect(enviados[enviados.length - 1].htmlBody).toContain('REASIGNADO');
    expect(celda(hojaControl(), 2, 4)).toBe('Luis Mora');
  });

  it('si falla el envío no sella y el caso sigue en la cola para reintentar en el siguiente ciclo', () => {
    setup({ filasAnalisis: [filaAnalisis('u1', 'María Pérez')], filasControl: [['L1', 'u1']], falla: true, cola: ['u1'] });
    const r = a.notificar();
    expect(r.ok).toBe(false);
    expect(r.correos).toBe(0);
    expect(celda(hojaControl(), 2, 3)).toBeFalsy();
    expect(celda(hojaAnalisis(), 2, 9)).toBeFalsy();
    expect(props['ASIGNACIONES_COLA']).toBe('u1');
    expect(a.hayTrabajo()).toBe(true);
  });

  describe('nombre sin correo en Config_Analistas', () => {
    it('no envía, no sella, avisa una sola vez y el caso sigue en la cola', () => {
      setup({ filasAnalisis: [filaAnalisis('u1', 'Desconocido')], filasControl: [['L1', 'u1']], cola: ['u1'] });
      const r1 = a.notificar();
      const r2 = a.notificar({ forzar: true });
      expect(r1.correos).toBe(0);
      expect(r1.sinCorreo).toEqual({ DESCONOCIDO: 1 });
      expect(enviados.filter(e => e.to === 'audit@x.co')).toHaveLength(1);
      expect(r2.correos).toBe(0);
      expect(props['ASIGNACIONES_COLA']).toBe('u1');
    });

    it('no se reintenta en cada ciclo de 5 min: espera una hora o a que entre algo nuevo', () => {
      setup({ filasAnalisis: [filaAnalisis('u1', 'Desconocido')], filasControl: [['L1', 'u1']], cola: ['u1'] });
      vi.useFakeTimers();
      vi.setSystemTime(new Date(2026, 9, 2, 9, 0));
      a.notificar();

      vi.setSystemTime(new Date(2026, 9, 2, 9, 5));
      expect(a.hayTrabajo()).toBe(false);
      expect(a.notificar().omitida).toBe(true);

      props['ASIGNACIONES_COLA'] = 'u1,u2'; // entró una asignación nueva
      expect(a.hayTrabajo()).toBe(true);

      props['ASIGNACIONES_COLA'] = 'u1';
      a.notificar();
      vi.setSystemTime(new Date(2026, 9, 2, 10, 5));
      expect(a.hayTrabajo()).toBe(true);
    });

    it('cuando el admin agrega el nombre a Config_Analistas, el caso sale en el siguiente intento', () => {
      setup({ filasAnalisis: [filaAnalisis('u1', 'Luis Mora')], filasControl: [['L1', 'u1']], cola: ['u1'],
        filasConfig: [['NOMBRE_EN_SHEET', 'EMAIL', 'ACTIVO']] });
      a.notificar();
      expect(enviados.filter(e => e.to === 'luis@x.co')).toHaveLength(0);

      control._spreadsheet.getSheetByName('Config_Analistas')._fullData.push(['Luis Mora', 'luis@x.co', true]);
      const r = a.notificar({ forzar: true });
      expect(r.correos).toBe(1);
      expect(props['ASIGNACIONES_COLA']).toBeUndefined();
    });
  });

  it('simular no envía, no escribe y no toca la cola', () => {
    setup({ filasAnalisis: [filaAnalisis('u1', 'María Pérez')], filasControl: [['L1', 'u1']], cola: ['u1'] });
    const r = a.notificar({ simular: true });
    expect(r.correos).toBe(1);
    expect(r.casos).toBe(1);
    expect(enviados).toHaveLength(0);
    expect(celda(hojaAnalisis(), 2, 9)).toBe('');
    expect(props['ASIGNACIONES_COLA']).toBe('u1');
  });

  it('no retiene el lock global mientras envía correos ni al terminar', () => {
    setup({ filasAnalisis: [filaAnalisis('u1', 'María Pérez')], filasControl: [['L1', 'u1']], cola: ['u1'] });
    a.notificar();
    expect(lockRetenidoAlEnviar).toEqual([false]);
    expect(globalThis.LockService.getScriptLock().isLocked()).toBe(false);
    expect(props['LEASE_asignaciones']).toBeUndefined(); // el préstamo se libera
  });

  it('si otra corrida tiene el préstamo, no hace nada y la cola queda intacta', () => {
    setup({ filasAnalisis: [filaAnalisis('u1', 'María Pérez')], filasControl: [['L1', 'u1']], cola: ['u1'] });
    props['LEASE_asignaciones'] = JSON.stringify({ token: 'otro', hasta: Date.now() + 60000 });
    const r = a.notificar();
    expect(r.ok).toBe(false);
    expect(enviados).toHaveLength(0);
    expect(props['ASIGNACIONES_COLA']).toBe('u1');
  });

  it('con otra corrida en curso (lock global ocupado) no pierde el trabajo', () => {
    setup({ filasAnalisis: [filaAnalisis('u1', 'María Pérez')], filasControl: [['L1', 'u1']], cola: ['u1'] });
    globalThis.LockService = createLockService({ simulateContention: true });
    const r = a.notificar();
    expect(r.ok).toBe(false);
    expect(enviados).toHaveLength(0);
    expect(props['ASIGNACIONES_COLA']).toBe('u1');
  });

  it('lo que el admin anota mientras corre el envío no se pierde al limpiar la cola', () => {
    setup({ filasAnalisis: [filaAnalisis('u1', 'María Pérez'), filaAnalisis('u2', 'María Pérez')],
      filasControl: [['L1', 'u1'], ['L1', 'u2']], cola: ['u1'] });
    const envio = globalThis.MailApp.sendEmail;
    globalThis.MailApp.sendEmail = vi.fn((o) => {
      envio(o);
      props['ASIGNACIONES_COLA'] += ',u2'; // edición durante el envío
    });
    a.notificar();
    expect(props['ASIGNACIONES_COLA']).toBe('u2');
  });

  describe('marcarAsignacionPendiente (onEdit): anota las filas asignadas', () => {
    const edicion = (fila, col, { filas = 1, nombreHoja = 'registro analisis', columnas = 1 } = {}) => {
      const hoja = hojaAnalisis();
      const range = hoja.getRange(fila, col, filas, columnas);
      range.getSheet = () => (nombreHoja === 'registro analisis' ? hoja : { getName: () => nombreHoja });
      return { range };
    };

    it('escribir un nombre en ASIGNADA A… anota el UUID de esa fila', () => {
      setup({ filasAnalisis: [filaAnalisis('u1', 'María Pérez'), filaAnalisis('u2', '')], filasControl: [['L1', 'u1'], ['L1', 'u2']] });
      a.marcar(edicion(2, 7)); // ASIGNADA A… es la columna 7
      expect(props['ASIGNACIONES_COLA']).toBe('u1');
    });

    it('pegar varias filas anota todas las que traen nombre y no repite', () => {
      setup({
        filasAnalisis: [filaAnalisis('u1', 'María Pérez'), filaAnalisis('u2', 'María Pérez'), filaAnalisis('u3', ''), filaAnalisis('u4', 'Luis Mora')],
        filasControl: []
      });
      a.marcar(edicion(2, 7, { filas: 4 }));
      a.marcar(edicion(2, 7, { filas: 2 }));
      expect(props['ASIGNACIONES_COLA']).toBe('u1,u2,u4');
    });

    it('borrar el nombre (celda vacía) no anota nada', () => {
      setup({ filasAnalisis: [filaAnalisis('u1', '')], filasControl: [['L1', 'u1']] });
      a.marcar(edicion(2, 7));
      expect(props['ASIGNACIONES_COLA']).toBeUndefined();
    });

    it('editar otra columna, otra hoja o el encabezado no anota nada', () => {
      setup({ filasAnalisis: [filaAnalisis('u1', 'María Pérez')], filasControl: [['L1', 'u1']] });
      a.marcar(edicion(2, 3));
      a.marcar(edicion(2, 7, { nombreHoja: 'otra hoja' }));
      a.marcar(edicion(1, 7));
      expect(props['ASIGNACIONES_COLA']).toBeUndefined();
    });

    it('una edición de rango que incluye la columna (pegar un bloque) también cuenta', () => {
      setup({ filasAnalisis: [filaAnalisis('u1', 'María Pérez')], filasControl: [['L1', 'u1']] });
      a.marcar(edicion(2, 5, { columnas: 4 })); // columnas 5 a 8
      expect(props['ASIGNACIONES_COLA']).toBe('u1');
    });

    it('con las columnas ya recordadas no lee el encabezado', () => {
      setup({ filasAnalisis: [filaAnalisis('u1', 'María Pérez')], filasControl: [['L1', 'u1']] });
      props['ASIGNACIONES_COL_ASIGNADA'] = '7';
      props['ASIGNACIONES_COL_UUID'] = '1';
      const hoja = hojaAnalisis();
      const e = edicion(2, 7);
      hoja.resetCallLog();
      a.marcar(e);
      expect(props['ASIGNACIONES_COLA']).toBe('u1');
      const lecturas = hoja.getCallLog('getValues');
      expect(lecturas).toHaveLength(2); // solo ASIGNADA A… y UUID de la fila editada
    });

    it('nunca lanza aunque el evento venga incompleto', () => {
      setup({ filasAnalisis: [], filasControl: [] });
      expect(() => a.marcar(undefined)).not.toThrow();
      expect(() => a.marcar({})).not.toThrow();
    });

    it('la cola tiene un tope para no pasar el límite de una propiedad', () => {
      const filas = Array.from({ length: 260 }, (_, i) => filaAnalisis('u' + (i + 1), 'María Pérez'));
      setup({ filasAnalisis: filas, filasControl: [] });
      a.marcar(edicion(2, 7, { filas: 260 }));
      expect(props['ASIGNACIONES_COLA'].split(',')).toHaveLength(200);
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
