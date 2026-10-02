/**
 * Unit tests: enviarResultadosLote() (Servicios_Resultados.js)
 *
 * Verifica la concurrencia del botón "enviar resultados": no retiene el lock
 * global, un segundo clic no envía de nuevo, un lote recién enviado no se
 * reenvía, y un fallo del sello de hora no impide registrar el histórico.
 * Las dependencias pesadas (Sheets, PDF, correo) están simuladas.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { createLockService } from '../mocks/lock-service.mock.js';
import { readFileSync } from 'fs';
import { resolve } from 'path';

const leer = (f) => readFileSync(resolve(__dirname, '../../' + f), 'utf-8');

let props, cache, eventos;

function cargar(overrides = {}) {
  globalThis.__stubs = overrides;
  return eval(`(function() { ${leer('Infraestructura_Concurrencia.js')}\n${leer('Servicios_Resultados.js')}
    ;
    var __s = globalThis.__stubs;
    _leerDatosLote_ = __s.leerDatos;
    _resolverContactoComercial_ = __s.contacto;
    _resolverBackupEmail_ = __s.backup;
    _generarPdfDesdeTemplate_ = __s.pdf;
    _construirHtmlResultados_ = function() { return '<html/>'; };
    _registrarEnHistorico_ = __s.historico;
    var registrarEnvioResultadoLote = __s.sello;
    return {
      enviar: enviarResultadosLote,
      alerta: _alertaSegura_,
      reciente: _resultadosEnvioReciente_
    };
  })()`);
}

function entorno() {
  props = {};
  cache = {};
  eventos = [];
  globalThis.PropertiesService = {
    getScriptProperties: () => ({
      getProperty: (k) => (k in props ? props[k] : null),
      setProperty: (k, v) => { props[k] = v; },
      deleteProperty: (k) => { delete props[k]; }
    })
  };
  globalThis.CacheService = {
    getScriptCache: () => ({
      get: (k) => (k in cache ? cache[k] : null),
      put: (k, v) => { cache[k] = v; }
    })
  };
  let n = 0;
  globalThis.Utilities = { getUuid: () => 'tok-' + (++n) };
  globalThis.LockService = createLockService();
  globalThis.NotificationConfig_estaActiva = () => true;
  globalThis.NotificationConfig_registrarSupresion = () => {};
  globalThis._registrarEvento_ = (nivel, modulo, msg, det) => eventos.push({ nivel, msg, det });
  globalThis.retry = (fn) => fn();
  globalThis.BCC_AUDITORIA = 'audit@x.co';
  globalThis.ID_PLANTILLA_COMERCIAL = 'plantilla-com';
  globalThis.ID_PLANTILLA_INMOBILIARIA = 'plantilla-inmo';
  globalThis._verificarCuotaEmail_ = () => true;
  globalThis._construirListaCC_ = () => ['cc@x.co'];
  globalThis.obtenerCadenaJerarquica = () => ['admin@x.co'];
  globalThis.emailANombre = () => 'Juan';
  globalThis.Logger = { log: () => {} };
}

function stubsOk(extra = {}) {
  const enviados = [];
  const historico = vi.fn();
  globalThis.MailApp = {
    sendEmail: vi.fn((o) => {
      extra.durante && extra.durante();
      enviados.push(o);
    })
  };
  return {
    enviados,
    historico,
    stubs: {
      leerDatos: () => ({ ok: true, datos: { idLote: 'L-1', solicitudes: [] } }),
      contacto: () => ({ ok: true, ejecutivo: 'juan@x.co', director: null, datosCorrNos: [['h'], ['d', 'juan@x.co', '', false]] }),
      backup: () => null,
      pdf: () => ({ pdf: true }),
      historico,
      ...extra.stubs
    }
  };
}

describe('enviarResultadosLote() — concurrencia', () => {
  beforeEach(() => { entorno(); vi.useRealTimers(); });

  it('envía, registra histórico y libera el préstamo', () => {
    const { stubs, enviados, historico } = stubsOk({ stubs: { sello: () => ({ ok: true, filas: 3 }) } });
    const r = cargar(stubs).enviar();

    expect(r.ok).toBe(true);
    expect(enviados).toHaveLength(1);
    expect(historico).toHaveBeenCalledTimes(1);
    expect(props['LEASE_resultados_envio']).toBeUndefined();
  });

  it('NO retiene el lock global mientras genera PDF ni mientras envía el correo', () => {
    const lockEn = [];
    const { stubs } = stubsOk({
      durante: () => lockEn.push(globalThis.LockService.getScriptLock().isLocked()),
      stubs: {
        pdf: () => { lockEn.push(globalThis.LockService.getScriptLock().isLocked()); return {}; },
        sello: () => ({ ok: true, filas: 1 })
      }
    });
    cargar(stubs).enviar();
    expect(lockEn.length).toBeGreaterThanOrEqual(3); // 2 PDF + 1 correo
    expect(lockEn.every((x) => x === false)).toBe(true);
  });

  it('un segundo clic mientras el primero sigue en curso no envía nada y avisa', () => {
    const { stubs, enviados } = stubsOk({ stubs: { sello: () => ({ ok: true }) } });
    const app = cargar(stubs);
    props['LEASE_resultados_envio'] = JSON.stringify({ token: 'primero', hasta: Date.now() + 60000 });

    const r = app.enviar();
    expect(r.ok).toBe(false);
    expect(r.mensaje).toMatch(/en curso/i);
    expect(enviados).toHaveLength(0);
    expect(props['LEASE_resultados_envio']).toContain('primero'); // no pisa el del otro
  });

  it('el mismo lote recién enviado no se reenvía (primer envío ya terminó)', () => {
    const { stubs, enviados } = stubsOk({ stubs: { sello: () => ({ ok: true }) } });
    const app = cargar(stubs);

    expect(app.enviar().ok).toBe(true);
    const r2 = app.enviar();
    expect(r2.ok).toBe(false);
    expect(r2.mensaje).toMatch(/ya se envió/);
    expect(enviados).toHaveLength(1);
  });

  it('un lote distinto sí se puede enviar enseguida', () => {
    let loteActual = 'L-1';
    const { stubs, enviados } = stubsOk({
      stubs: {
        sello: () => ({ ok: true }),
        leerDatos: () => ({ ok: true, datos: { idLote: loteActual, solicitudes: [] } })
      }
    });
    const app = cargar(stubs);

    expect(app.enviar().ok).toBe(true);
    loteActual = 'L-2';
    expect(app.enviar().ok).toBe(true);
    expect(enviados).toHaveLength(2);
  });

  it('un fallo del sello (aunque la función no exista) no impide registrar el histórico', () => {
    const { stubs, historico } = stubsOk({
      stubs: { sello: () => { throw new ReferenceError('registrarEnvioResultadoLote is not defined'); } }
    });
    const r = cargar(stubs).enviar();

    expect(r.ok).toBe(true);
    expect(historico).toHaveBeenCalledTimes(1);
    expect(eventos.some((e) => e.nivel === 'WARN' && /sellar/.test(e.msg))).toBe(true);
  });

  it('si algo falla, libera el préstamo para poder reintentar', () => {
    const { stubs } = stubsOk({ stubs: { pdf: () => { throw new Error('Docs caído'); } } });
    const r = cargar(stubs).enviar();
    expect(r.ok).toBe(false);
    expect(props['LEASE_resultados_envio']).toBeUndefined();
  });

  it('si la lectura del lote falla no envía nada y libera el préstamo', () => {
    const { stubs, enviados } = stubsOk({ stubs: { leerDatos: () => ({ ok: false, error: 'A2 vacía' }) } });
    const r = cargar(stubs).enviar();
    expect(r.ok).toBe(false);
    expect(enviados).toHaveLength(0);
    expect(props['LEASE_resultados_envio']).toBeUndefined();
  });

  it('si el envío está desactivado en configuración no toma ningún préstamo', () => {
    globalThis.NotificationConfig_estaActiva = () => false;
    const { stubs } = stubsOk();
    const r = cargar(stubs).enviar();
    expect(r.ok).toBe(false);
    expect(Object.keys(props)).toHaveLength(0);
  });
});

describe('_alertaSegura_', () => {
  beforeEach(() => { entorno(); });

  it('muestra el alert de la UI en lugar de recursar sobre sí misma', () => {
    const alert = vi.fn();
    globalThis.SpreadsheetApp = { getUi: () => ({ alert }) };
    const { stubs } = stubsOk();
    cargar(stubs).alerta('hola');
    expect(alert).toHaveBeenCalledWith('hola');
  });

  it('fuera de un contexto de UI solo registra y no lanza', () => {
    globalThis.SpreadsheetApp = { getUi: () => { throw new Error('sin UI'); } };
    const { stubs } = stubsOk();
    expect(() => cargar(stubs).alerta('hola')).not.toThrow();
  });
});
