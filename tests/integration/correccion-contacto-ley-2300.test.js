import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { readFileSync } from 'fs';
import { resolve } from 'path';
import { createHmac, randomUUID } from 'crypto';
import { createSpreadsheetApp } from '../mocks/spreadsheet-app.mock.js';
import { createLockService } from '../mocks/lock-service.mock.js';

const source = readFileSync(resolve(__dirname, '../../Repositorios_EntregasLey2300Repo.js'), 'utf8');
const exportedNames = [
  'EntregasLey2300_crearOReutilizar', 'EntregasLey2300_corregirContacto',
  'EntregasLey2300_obtenerPorId', 'ENTREGAS_LEY2300_ENCABEZADOS',
  'OPERACIONES_LEY2300_ENCABEZADOS'
];

function cargarRepositorio() {
  const exportsCode = exportedNames.map(nombre => `globalThis.${nombre} = ${nombre};`).join('\n');
  eval(`(function() { ${source}\n${exportsCode} })()`);
}

function instalarEntorno() {
  const controlApp = createSpreadsheetApp({
    Control_General: [
      ['UUID_SISTEMA', 'CORREO_INQ', 'TEL_INQ'],
      ['uuid-1', 'anterior@example.com', '3001234567']
    ]
  });
  const analisisApp = createSpreadsheetApp({
    'registro analisis': [
      ['UUID_SISTEMA', 'CORREO_INQ', 'TEL_INQ'],
      ['uuid-1', 'anterior@example.com', '3001234567']
    ]
  });
  const lockService = createLockService();
  const clavesCache = [];

  globalThis.getHojaControlId = () => 'control-id';
  globalThis.getArchivoAnalisisId = () => 'analisis-id';
  globalThis.SpreadsheetRegistry_get = id => id === 'control-id' ? controlApp._spreadsheet : analisisApp._spreadsheet;
  globalThis.LockService = lockService;
  globalThis.CacheWrapper_remove = clave => clavesCache.push(clave);
  globalThis.PropertiesService = {
    getScriptProperties: () => ({ getProperty: () => 'test-hmac-secret' })
  };
  globalThis.Utilities = {
    computeHmacSha256Signature: (valor, clave) => Array.from(createHmac('sha256', String(clave)).update(String(valor)).digest()),
    base64EncodeWebSafe: bytes => Buffer.from(bytes).toString('base64url'),
    getUuid: () => randomUUID()
  };
  cargarRepositorio();

  const creada = EntregasLey2300_crearOReutilizar({
    uuid: 'uuid-1', idLote: 'L-1', solicitud: 'S-1', participante: 'INQ', canal: 'EMAIL', destino: 'anterior@example.com'
  }).entrega;
  const entregas = controlApp._spreadsheet.getSheetByName('Entregas_Ley2300');
  entregas._fullData[1][ENTREGAS_LEY2300_ENCABEZADOS.indexOf('ESTADO')] = 'PENDIENTE_CORRECCION';
  entregas._fullData[1][ENTREGAS_LEY2300_ENCABEZADOS.indexOf('VERSION')] = 2;

  return { controlApp, analisisApp, lockService, clavesCache, entrega: { ...creada, estado: 'PENDIENTE_CORRECCION', version: 2 } };
}

function limpiarEntorno() {
  for (const nombre of exportedNames) delete globalThis[nombre];
  ['getHojaControlId', 'getArchivoAnalisisId', 'SpreadsheetRegistry_get', 'LockService', 'CacheWrapper_remove', 'PropertiesService', 'Utilities'].forEach(nombre => delete globalThis[nombre]);
}

function estadoOperacion(entorno) {
  const operaciones = entorno.controlApp._spreadsheet.getSheetByName('Operaciones_Ley2300')._fullData;
  return operaciones[1][OPERACIONES_LEY2300_ENCABEZADOS.indexOf('ESTADO')];
}

describe('corrección coordinada de contactos Ley 2300', () => {
  beforeEach(limpiarEntorno);
  afterEach(limpiarEntorno);

  it('actualiza ambos libros por UUID, completa la saga y habilita solo la entrega corregida', () => {
    const entorno = instalarEntorno();

    const resultado = EntregasLey2300_corregirContacto({
      entregaId: entorno.entrega.entregaId, versionEsperada: 2, contacto: ' NUEVO@EXAMPLE.COM '
    }, 'admin-interno');

    expect(resultado).toMatchObject({ ok: true, entrega: { estado: 'LISTO_PARA_REINTENTO', version: 3 } });
    expect(entorno.controlApp._spreadsheet.getSheetByName('Control_General')._fullData[1][1]).toBe('nuevo@example.com');
    expect(entorno.analisisApp._spreadsheet.getSheetByName('registro analisis')._fullData[1][1]).toBe('nuevo@example.com');
    expect(estadoOperacion(entorno)).toBe('COMPLETA');
    expect(entorno.lockService._scriptLock.getCallLog('tryLock')).toHaveLength(1);
    expect(entorno.lockService._scriptLock.isLocked()).toBe(false);
    expect(entorno.clavesCache).toContain('ENTREGAS_LEY2300');
    expect(JSON.stringify(resultado)).not.toContain('nuevo@example.com');
  });

  it('rechaza tipos, formatos y claves inesperadas sin escribir datos', () => {
    const entorno = instalarEntorno();
    const comandoValido = { entregaId: entorno.entrega.entregaId, versionEsperada: 2, contacto: 'nuevo@example.com' };

    expect(() => EntregasLey2300_corregirContacto({ ...comandoValido, uuid: 'cliente-no-confiable' }, 'admin-interno')).toThrow('solicitud');
    expect(() => EntregasLey2300_corregirContacto({ ...comandoValido, versionEsperada: '2' }, 'admin-interno')).toThrow('solicitud');
    expect(entorno.lockService._scriptLock.getCallLog('tryLock')).toHaveLength(0);
    expect(() => EntregasLey2300_corregirContacto({ ...comandoValido, contacto: 'formato-invalido' }, 'admin-interno')).toThrow('solicitud');
    expect(entorno.lockService._scriptLock.getCallLog('tryLock')).toHaveLength(1);
  });

  it('no escribe cuando la entrega no está pendiente de corrección o la versión es obsoleta', () => {
    const entorno = instalarEntorno();
    const control = entorno.controlApp._spreadsheet.getSheetByName('Control_General');
    const comando = { entregaId: entorno.entrega.entregaId, versionEsperada: 2, contacto: 'nuevo@example.com' };
    const entregas = entorno.controlApp._spreadsheet.getSheetByName('Entregas_Ley2300');
    entregas._fullData[1][ENTREGAS_LEY2300_ENCABEZADOS.indexOf('ESTADO')] = 'PENDIENTE';

    const estadoInvalido = EntregasLey2300_corregirContacto(comando, 'admin-interno');
    expect(estadoInvalido).toMatchObject({ ok: false, entrega: null });
    expect(control._fullData[1][1]).toBe('anterior@example.com');

    entregas._fullData[1][ENTREGAS_LEY2300_ENCABEZADOS.indexOf('ESTADO')] = 'PENDIENTE_CORRECCION';
    const versionObsoleta = EntregasLey2300_corregirContacto({ ...comando, versionEsperada: 1 }, 'admin-interno');
    expect(versionObsoleta).toMatchObject({ ok: false, entrega: null });
    expect(control._fullData[1][1]).toBe('anterior@example.com');
  });

  it('fuerza conciliación con la versión vigente si la escritura atómica final falla después de aplicar la fila', () => {
    const entorno = instalarEntorno();
    const entregas = entorno.controlApp._spreadsheet.getSheetByName('Entregas_Ley2300');
    entregas.resetCallLog();
    const getRangeOriginal = entregas.getRange.bind(entregas);
    let fallarUnaVez = true;
    entregas.getRange = function(fila, columna, filas, columnas) {
      const rango = getRangeOriginal(fila, columna, filas, columnas);
      if (fila === 2 && columna === 1 && filas === 1 && columnas === ENTREGAS_LEY2300_ENCABEZADOS.length && fallarUnaVez) {
        const setValuesOriginal = rango.setValues.bind(rango);
        rango.setValues = valores => { setValuesOriginal(valores); fallarUnaVez = false; throw new Error('Fallo después de metadata'); };
      }
      return rango;
    };

    const resultado = EntregasLey2300_corregirContacto({
      entregaId: entorno.entrega.entregaId, versionEsperada: 2, contacto: 'nuevo@example.com'
    }, 'admin-interno');

    expect(resultado).toMatchObject({ ok: false, entrega: { estado: 'PENDIENTE_CONCILIACION', version: 4 } });
    expect(estadoOperacion(entorno)).toBe('PENDIENTE_CONCILIACION');
    expect(entregas.getCallLog('setValue')).toHaveLength(0);
  });

  it('marca conciliación y no habilita reintento si falla la escritura en análisis', () => {
    const entorno = instalarEntorno();
    const analisis = entorno.analisisApp._spreadsheet.getSheetByName('registro analisis');
    const getRangeOriginal = analisis.getRange.bind(analisis);
    analisis.getRange = function(fila, columna, filas, columnas) {
      const rango = getRangeOriginal(fila, columna, filas, columnas);
      if (fila === 2 && columna === 2 && filas === undefined && columnas === undefined) {
        rango.setValue = () => { throw new Error('Fallo parcial: nuevo@example.com'); };
      }
      return rango;
    };

    const resultado = EntregasLey2300_corregirContacto({
      entregaId: entorno.entrega.entregaId, versionEsperada: 2, contacto: 'nuevo@example.com'
    }, 'admin-interno');

    expect(resultado.ok).toBe(false);
    expect(resultado.entrega).toMatchObject({ estado: 'PENDIENTE_CONCILIACION', version: 3 });
    expect(entorno.controlApp._spreadsheet.getSheetByName('Control_General')._fullData[1][1]).toBe('nuevo@example.com');
    expect(analisis._fullData[1][1]).toBe('anterior@example.com');
    expect(estadoOperacion(entorno)).toBe('PENDIENTE_CONCILIACION');
    expect(JSON.stringify(entorno.controlApp._spreadsheet.getSheetByName('Operaciones_Ley2300')._fullData)).not.toContain('nuevo@example.com');
  });
});
