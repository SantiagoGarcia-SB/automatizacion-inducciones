import { describe, it, expect, beforeEach } from 'vitest';
import { createSpreadsheetApp, MockSheet, MockRange } from '../mocks/spreadsheet-app.mock.js';
import { createCacheService, CACHE_MAX_VALUE_SIZE_BYTES } from '../mocks/cache-service.mock.js';
import { createLockService } from '../mocks/lock-service.mock.js';

describe('SpreadsheetApp Mock', () => {
  let app;

  beforeEach(() => {
    app = createSpreadsheetApp({
      'Control_General': [
        ['ID', 'Nombre', 'Estado', 'UUID'],
        ['1', 'Lote A', 'PENDIENTE RADICAR', 'uuid-001'],
        ['2', 'Lote B', 'EN_EVALUACION', 'uuid-002'],
        ['3', 'Lote C', 'PENDIENTE RADICAR', 'uuid-003'],
      ],
      'registro analisis': [
        ['UUID', 'Analista', 'Fecha'],
        ['uuid-002', 'ana@test.com', '2024-01-15'],
      ]
    });
  });

  it('openById retorna el spreadsheet', () => {
    const ss = app.openById('any-id');
    expect(ss).toBeDefined();
    expect(ss.getSheetByName('Control_General')).not.toBeNull();
  });

  it('getSheetByName retorna null para hoja inexistente', () => {
    const ss = app.openById('id');
    expect(ss.getSheetByName('NoExiste')).toBeNull();
  });

  it('getLastRow retorna cantidad correcta de filas', () => {
    const sheet = app.openById('id').getSheetByName('Control_General');
    expect(sheet.getLastRow()).toBe(4); // 1 header + 3 data
  });

  it('getLastColumn retorna cantidad correcta de columnas', () => {
    const sheet = app.openById('id').getSheetByName('Control_General');
    expect(sheet.getLastColumn()).toBe(4);
  });

  it('getRange con fila, col, numRows, numCols retorna datos correctos', () => {
    const sheet = app.openById('id').getSheetByName('Control_General');
    const range = sheet.getRange(2, 1, 3, 4);
    const values = range.getValues();
    expect(values).toHaveLength(3);
    expect(values[0]).toEqual(['1', 'Lote A', 'PENDIENTE RADICAR', 'uuid-001']);
    expect(values[2]).toEqual(['3', 'Lote C', 'PENDIENTE RADICAR', 'uuid-003']);
  });

  it('getDataRange retorna toda la data', () => {
    const sheet = app.openById('id').getSheetByName('Control_General');
    const values = sheet.getDataRange().getValues();
    expect(values).toHaveLength(4);
    expect(values[0][0]).toBe('ID');
  });

  it('setValue escribe en la posición correcta', () => {
    const sheet = app.openById('id').getSheetByName('Control_General');
    const range = sheet.getRange(2, 3, 1, 1);
    range.setValue('RADICADO');
    // Verificar que se actualizó en la data interna
    const updated = sheet.getRange(2, 3, 1, 1).getValue();
    expect(updated).toBe('RADICADO');
  });

  it('setValues escribe múltiples celdas correctamente', () => {
    const sheet = app.openById('id').getSheetByName('Control_General');
    const range = sheet.getRange(2, 2, 1, 3);
    range.setValues([['Nuevo Lote', 'NUEVO_ESTADO', 'uuid-new']]);
    const values = sheet.getRange(2, 1, 1, 4).getValues();
    expect(values[0]).toEqual(['1', 'Nuevo Lote', 'NUEVO_ESTADO', 'uuid-new']);
  });

  it('createTextFinder.findNext encuentra el texto', () => {
    const sheet = app.openById('id').getSheetByName('Control_General');
    const finder = sheet.createTextFinder('uuid-002');
    const result = finder.findNext();
    expect(result).not.toBeNull();
    expect(result.getValue()).toBe('uuid-002');
  });

  it('createTextFinder.findNext retorna null si no encuentra', () => {
    const sheet = app.openById('id').getSheetByName('Control_General');
    const result = sheet.createTextFinder('no-existe').findNext();
    expect(result).toBeNull();
  });

  it('createTextFinder.findAll retorna todos los matches', () => {
    const sheet = app.openById('id').getSheetByName('Control_General');
    const results = sheet.createTextFinder('PENDIENTE RADICAR').findAll();
    expect(results).toHaveLength(2);
  });

  it('getCallLog registra las llamadas a getRange', () => {
    const sheet = app.openById('id').getSheetByName('Control_General');
    sheet.resetCallLog();
    sheet.getRange(1, 1, 1, 4).getValues();
    sheet.getRange(2, 1, 3, 4).getValues();
    const rangeCalls = sheet.getCallLog('getRange');
    expect(rangeCalls).toHaveLength(2);
  });

  it('appendRow agrega una fila al final', () => {
    const sheet = app.openById('id').getSheetByName('Control_General');
    sheet.appendRow(['4', 'Lote D', 'NUEVO', 'uuid-004']);
    expect(sheet.getLastRow()).toBe(5);
    const lastRow = sheet.getRange(5, 1, 1, 4).getValues();
    expect(lastRow[0]).toEqual(['4', 'Lote D', 'NUEVO', 'uuid-004']);
  });
});

describe('CacheService Mock', () => {
  let cacheService;
  let cache;

  beforeEach(() => {
    cacheService = createCacheService();
    cache = cacheService.getScriptCache();
  });

  it('getScriptCache retorna una instancia de caché', () => {
    expect(cache).toBeDefined();
    expect(typeof cache.get).toBe('function');
    expect(typeof cache.put).toBe('function');
    expect(typeof cache.remove).toBe('function');
  });

  it('put y get almacenan y recuperan valores', () => {
    cache.put('test-key', 'test-value', 300);
    expect(cache.get('test-key')).toBe('test-value');
  });

  it('get retorna null para clave inexistente', () => {
    expect(cache.get('no-existe')).toBeNull();
  });

  it('remove elimina una clave', () => {
    cache.put('key', 'value', 300);
    cache.remove('key');
    expect(cache.get('key')).toBeNull();
  });

  it('entradas expiran cuando se avanza el tiempo', () => {
    cache.put('temporal', 'dato', 60); // 60 segundos
    expect(cache.get('temporal')).toBe('dato');
    cache.advanceTime(61000); // Avanzar 61s
    expect(cache.get('temporal')).toBeNull();
  });

  it('lanza excepción cuando el valor excede 100 KB', () => {
    const bigValue = 'x'.repeat(CACHE_MAX_VALUE_SIZE_BYTES + 1);
    expect(() => cache.put('big-key', bigValue, 300)).toThrow(/excede el límite de 100 KB/);
  });

  it('permite valores justo en el límite de 100 KB', () => {
    // ASCII chars son 1 byte cada uno
    const maxValue = 'a'.repeat(CACHE_MAX_VALUE_SIZE_BYTES);
    expect(() => cache.put('limit-key', maxValue, 300)).not.toThrow();
    expect(cache.get('limit-key')).toBe(maxValue);
  });

  it('modo simulateUnavailable lanza en todas las operaciones', () => {
    const unavailableService = createCacheService({ simulateUnavailable: true });
    const unavailableCache = unavailableService.getScriptCache();
    expect(() => unavailableCache.get('key')).toThrow(/no está disponible/);
    expect(() => unavailableCache.put('key', 'val', 300)).toThrow(/no está disponible/);
    expect(() => unavailableCache.remove('key')).toThrow(/no está disponible/);
  });

  it('setUnavailable permite activar/desactivar modo fallo dinámicamente', () => {
    cache.put('key', 'value', 300);
    cache.setUnavailable(true);
    expect(() => cache.get('key')).toThrow();
    cache.setUnavailable(false);
    expect(cache.get('key')).toBe('value');
  });

  it('getCallLog registra operaciones correctamente', () => {
    cache.put('a', '1', 60);
    cache.get('a');
    cache.remove('a');
    const log = cache.getCallLog();
    expect(log).toHaveLength(3);
    expect(log[0].method).toBe('put');
    expect(log[1].method).toBe('get');
    expect(log[2].method).toBe('remove');
  });

  it('putAll almacena múltiples valores', () => {
    cache.putAll({ key1: 'val1', key2: 'val2' }, 300);
    expect(cache.get('key1')).toBe('val1');
    expect(cache.get('key2')).toBe('val2');
  });

  it('getAll retorna múltiples valores', () => {
    cache.put('k1', 'v1', 300);
    cache.put('k2', 'v2', 300);
    const result = cache.getAll(['k1', 'k2', 'k3']);
    expect(result).toEqual({ k1: 'v1', k2: 'v2', k3: null });
  });
});

describe('LockService Mock', () => {
  let lockService;
  let lock;

  beforeEach(() => {
    lockService = createLockService();
    lock = lockService.getScriptLock();
  });

  it('getScriptLock retorna una instancia de lock', () => {
    expect(lock).toBeDefined();
    expect(typeof lock.tryLock).toBe('function');
    expect(typeof lock.releaseLock).toBe('function');
  });

  it('tryLock adquiere el lock exitosamente', () => {
    const result = lock.tryLock(5000);
    expect(result).toBe(true);
    expect(lock.hasLock()).toBe(true);
  });

  it('releaseLock libera el lock', () => {
    lock.tryLock(5000);
    lock.releaseLock();
    expect(lock.hasLock()).toBe(false);
  });

  it('tryLock retorna false si el lock ya está tomado', () => {
    lock.tryLock(5000);
    const second = lock.tryLock(5000);
    expect(second).toBe(false);
  });

  it('simulateContention hace que tryLock falle', () => {
    lock.simulateContention();
    const result = lock.tryLock(5000);
    expect(result).toBe(false);
    expect(lock.hasLock()).toBe(false);
  });

  it('releaseContention permite adquirir el lock nuevamente', () => {
    lock.simulateContention();
    expect(lock.tryLock(5000)).toBe(false);
    lock.releaseContention();
    expect(lock.tryLock(5000)).toBe(true);
  });

  it('waitLock lanza excepción en contención', () => {
    lock.simulateContention();
    expect(() => lock.waitLock(5000)).toThrow(/contención simulada/);
  });

  it('waitLock adquiere el lock si está disponible', () => {
    expect(() => lock.waitLock(5000)).not.toThrow();
    expect(lock.hasLock()).toBe(true);
  });

  it('contención con timeout se libera después de N ms', async () => {
    const timedService = createLockService({
      simulateContention: true,
      contentionReleaseAfterMs: 50
    });
    const timedLock = timedService.getScriptLock();

    expect(timedLock.tryLock(100)).toBe(false); // Aún en contención
    await new Promise(resolve => setTimeout(resolve, 60));
    expect(timedLock.tryLock(100)).toBe(true); // Contención liberada
  });

  it('getCallLog registra operaciones', () => {
    lock.tryLock(5000);
    lock.hasLock();
    lock.releaseLock();
    const log = lock.getCallLog();
    expect(log).toHaveLength(3);
    expect(log[0].method).toBe('tryLock');
    expect(log[1].method).toBe('hasLock');
    expect(log[2].method).toBe('releaseLock');
  });

  it('cada tipo de lock es independiente', () => {
    lockService.getScriptLock().tryLock(1000);
    expect(lockService.getScriptLock().hasLock()).toBe(true);
    expect(lockService.getDocumentLock().hasLock()).toBe(false);
    expect(lockService.getUserLock().hasLock()).toBe(false);
  });
});
