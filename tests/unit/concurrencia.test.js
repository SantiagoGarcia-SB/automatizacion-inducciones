/**
 * Unit tests: Infraestructura_Concurrencia.js
 *
 * Lease (préstamo con vencimiento en lugar de retener el lock global) y
 * Columnas_asegurar_ (crear columnas al final sin que dos creadores se pisen).
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { createSpreadsheetApp } from '../mocks/spreadsheet-app.mock.js';
import { createLockService } from '../mocks/lock-service.mock.js';
import { readFileSync } from 'fs';
import { resolve } from 'path';

const source = readFileSync(resolve(__dirname, '../../Infraestructura_Concurrencia.js'), 'utf-8');
const api = eval(`(function() { ${source}
  ; return {
    adquirir: Lease_adquirir,
    liberar: Lease_liberar,
    buscar: Columnas_buscar_,
    asegurar: Columnas_asegurar_
  }; })()`);

let props;

function setupGlobals(lockOptions) {
  props = {};
  globalThis.PropertiesService = {
    getScriptProperties: () => ({
      getProperty: (k) => (k in props ? props[k] : null),
      setProperty: (k, v) => { props[k] = v; },
      deleteProperty: (k) => { delete props[k]; }
    })
  };
  let n = 0;
  globalThis.Utilities = { getUuid: () => 'token-' + (++n) };
  globalThis.LockService = createLockService(lockOptions);
}

describe('Lease', () => {
  beforeEach(() => { setupGlobals(); vi.useRealTimers(); });

  it('el primero toma el préstamo y el segundo no mientras esté vigente', () => {
    const t1 = api.adquirir('resultados', 60000);
    expect(t1).toBeTruthy();
    expect(api.adquirir('resultados', 60000)).toBeNull();
  });

  it('préstamos con nombres distintos no se bloquean entre sí', () => {
    expect(api.adquirir('a', 60000)).toBeTruthy();
    expect(api.adquirir('b', 60000)).toBeTruthy();
  });

  it('al liberar con el token correcto se puede volver a tomar', () => {
    const t1 = api.adquirir('x', 60000);
    api.liberar('x', t1);
    expect(api.adquirir('x', 60000)).toBeTruthy();
  });

  it('liberar con un token ajeno no libera el préstamo de otro', () => {
    api.adquirir('x', 60000);
    api.liberar('x', 'token-de-otro');
    expect(api.adquirir('x', 60000)).toBeNull();
  });

  it('vence solo si el dueño nunca lo libera (ttl)', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2026, 9, 2, 9, 0, 0));
    expect(api.adquirir('x', 60000)).toBeTruthy();
    vi.setSystemTime(new Date(2026, 9, 2, 9, 0, 30));
    expect(api.adquirir('x', 60000)).toBeNull();
    vi.setSystemTime(new Date(2026, 9, 2, 9, 1, 5));
    expect(api.adquirir('x', 60000)).toBeTruthy();
  });

  it('el lock global solo se retiene un instante: queda libre tras adquirir', () => {
    api.adquirir('x', 60000);
    expect(globalThis.LockService.getScriptLock().isLocked()).toBe(false);
  });

  it('si el lock global está ocupado devuelve null sin lanzar', () => {
    setupGlobals({ simulateContention: true });
    expect(api.adquirir('x', 60000)).toBeNull();
  });

  it('un valor corrupto en la propiedad se pisa en vez de bloquear para siempre', () => {
    props['LEASE_x'] = 'no-es-json';
    expect(api.adquirir('x', 60000)).toBeTruthy();
  });

  it('liberar nunca lanza aunque no haya préstamo ni token', () => {
    expect(() => api.liberar('nada', null)).not.toThrow();
    expect(() => api.liberar('nada', 'abc')).not.toThrow();
  });
});

describe('Columnas_asegurar_', () => {
  beforeEach(() => { setupGlobals(); });

  const hojaDe = (encabezados) => {
    const app = createSpreadsheetApp({ H: [encabezados, encabezados.map(() => 'v')] });
    return app._spreadsheet.getSheetByName('H');
  };

  it('busca encabezados sin importar tildes, mayúsculas ni puntos', () => {
    expect(api.buscar(['x', 'F.H Asignación'], 'F.H Asignacion')).toBe(2);
    expect(api.buscar(['x', 'fh asignacion'], 'F.H Asignacion')).toBe(2);
    expect(api.buscar(['x'], 'F.H Asignacion')).toBe(0);
  });

  it('camino rápido: si ya existen no toma el lock ni escribe', () => {
    const hoja = hojaDe(['ID', 'F.H Asignacion', 'Analista Notificado']);
    const lockSpy = vi.spyOn(globalThis.LockService.getScriptLock(), 'tryLock');
    const mapa = api.asegurar(hoja, ['F.H Asignacion', 'Analista Notificado']);

    expect(mapa).toEqual({ 'F.H Asignacion': 2, 'Analista Notificado': 3 });
    expect(lockSpy).not.toHaveBeenCalled();
    expect(hoja.getCallLog('setValues')).toHaveLength(0);
  });

  it('crea al final solo las que faltan y suelta el lock', () => {
    const hoja = hojaDe(['ID', 'F.H Asignacion']);
    const mapa = api.asegurar(hoja, ['F.H Asignacion', 'Analista Notificado', 'Inicio Analisis']);

    expect(mapa).toEqual({ 'F.H Asignacion': 2, 'Analista Notificado': 3, 'Inicio Analisis': 4 });
    expect(hoja._fullData[0]).toEqual(['ID', 'F.H Asignacion', 'Analista Notificado', 'Inicio Analisis']);
    expect(globalThis.LockService.getScriptLock().isLocked()).toBe(false);
  });

  it('es idempotente: la segunda llamada no vuelve a crear', () => {
    const hoja = hojaDe(['ID']);
    api.asegurar(hoja, ['Nueva']);
    api.asegurar(hoja, ['Nueva']);
    expect(hoja._fullData[0]).toEqual(['ID', 'Nueva']);
  });

  it('si otro creó la columna mientras esperaba el lock, no la duplica', () => {
    const hoja = hojaDe(['ID']);
    // Simula al otro creador: aparece la columna justo al tomar el lock
    const lock = globalThis.LockService.getScriptLock();
    const original = lock.tryLock.bind(lock);
    lock.tryLock = (ms) => {
      const ok = original(ms);
      hoja._fullData[0].push('Nueva');
      return ok;
    };
    const mapa = api.asegurar(hoja, ['Nueva']);
    expect(mapa).toEqual({ Nueva: 2 });
    expect(hoja._fullData[0]).toEqual(['ID', 'Nueva']);
  });

  it('si no consigue el lock para crear, lanza (no escribe a ciegas)', () => {
    setupGlobals({ simulateContention: true });
    const hoja = hojaDe(['ID']);
    expect(() => api.asegurar(hoja, ['Nueva'])).toThrow(/reservar/);
    expect(hoja._fullData[0]).toEqual(['ID']);
  });
});
