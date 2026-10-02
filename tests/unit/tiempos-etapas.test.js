/**
 * Unit tests: Servicios_TiemposEtapas.js
 *
 * Tiempos entre etapas (T1 ingreso→radicación, T2 radicación→asignación,
 * T3 asignación→resultado) agregados por total, sucursal y ciudad.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { createSpreadsheetApp } from '../mocks/spreadsheet-app.mock.js';
import { createLockService } from '../mocks/lock-service.mock.js';
import { readFileSync } from 'fs';
import { resolve } from 'path';

const sourceCode = readFileSync(resolve(__dirname, '../../Infraestructura_Concurrencia.js'), 'utf-8') + '\n' +
  readFileSync(resolve(__dirname, '../../Servicios_TiemposEtapas.js'), 'utf-8');

function loadSource() {
  const wrapped = `(function() { ${sourceCode}
  ; return {
    parsearFecha: TiemposEtapas_parsearFecha_,
    estadistica: TiemposEtapas_estadistica_,
    calcular: TiemposEtapas_calcular_,
    calcularTiemposEtapas: calcularTiemposEtapas,
    buscarColumna: TiemposEtapas_buscarColumna_,
    registrarEnvio: registrarEnvioResultadoLote
  }; })()`;
  return eval(wrapped);
}

const t = loadSource();

// Fechas en hora local para evitar depender de la zona horaria del runner.
const d = (dia, hora = 0, min = 0) => new Date(2026, 8, dia, hora, min, 0); // septiembre 2026

describe('TiemposEtapas_parsearFecha_', () => {
  it('acepta Date válida y rechaza Date inválida', () => {
    const f = d(1, 10);
    expect(t.parsearFecha(f)).toBe(f);
    expect(t.parsearFecha(new Date('x'))).toBeNull();
  });

  it('parsea dd/MM/yyyy HH:mm:ss con día primero', () => {
    const f = t.parsearFecha('03/09/2026 14:30:15');
    expect([f.getFullYear(), f.getMonth(), f.getDate(), f.getHours(), f.getMinutes(), f.getSeconds()])
      .toEqual([2026, 8, 3, 14, 30, 15]);
  });

  it('parsea yyyy-MM-dd HH:mm y solo fecha', () => {
    const f = t.parsearFecha('2026-09-03 08:05');
    expect([f.getDate(), f.getMonth(), f.getHours(), f.getMinutes()]).toEqual([3, 8, 8, 5]);
    const g = t.parsearFecha('2026-09-03');
    expect([g.getDate(), g.getHours()]).toEqual([3, 0]);
  });

  it('soporta a. m. / p. m.', () => {
    expect(t.parsearFecha('03/09/2026 02:15 p. m.').getHours()).toBe(14);
    expect(t.parsearFecha('03/09/2026 12:10 a. m.').getHours()).toBe(0);
    expect(t.parsearFecha('03/09/2026 12:10 PM').getHours()).toBe(12);
  });

  it('devuelve null para vacío, texto libre o fechas imposibles', () => {
    expect(t.parsearFecha('')).toBeNull();
    expect(t.parsearFecha(null)).toBeNull();
    expect(t.parsearFecha('pendiente')).toBeNull();
    expect(t.parsearFecha('31/02/2026 10:00')).toBeNull();
    expect(t.parsearFecha('03/13/2026')).toBeNull();
  });
});

describe('TiemposEtapas_estadistica_', () => {
  it('calcula promedio y mediana (impar y par)', () => {
    expect(t.estadistica([1, 2, 9])).toEqual({ n: 3, promedioHoras: 4, medianaHoras: 2 });
    expect(t.estadistica([1, 2, 3, 10])).toEqual({ n: 4, promedioHoras: 4, medianaHoras: 2.5 });
  });

  it('sin datos devuelve nulos', () => {
    expect(t.estadistica([])).toEqual({ n: 0, promedioHoras: null, medianaHoras: null });
  });
});

describe('TiemposEtapas_calcular_', () => {
  // Cadena completa: ingreso 8h -> radicacion 10h -> asignacion 12h -> inicio 13h -> fin 17h
  // (dia 1) -> resultado 9h -> envio 12h (dia 2)
  const fila = (o) => ({
    ingreso: d(1, 8), radicacion: d(1, 10), asignacion: d(1, 12),
    inicioAnalisis: d(1, 13), finAnalisis: d(1, 17),
    resultado: d(2, 9), envioResultado: d(2, 12),
    sucursal: 'BOGOTA', ciudad: 'BOGOTA', ...o
  });

  it('calcula los 6 tramos en horas', () => {
    const r = t.calcular([fila({})]);
    expect(r.total.t1.medianaHoras).toBe(2);   // Ingreso a Radicacion
    expect(r.total.t2.medianaHoras).toBe(2);   // Radicacion a Asignacion
    expect(r.total.t3.medianaHoras).toBe(1);   // Asignacion a Analisis (inicio)
    expect(r.total.t4.medianaHoras).toBe(4);   // Duracion del analisis
    expect(r.total.t5.medianaHoras).toBe(16);  // Analisis (fin) a Resultado
    expect(r.total.t6.medianaHoras).toBe(3);   // Resultado a Envio
    expect(r.total.solicitudes).toBe(1);
  });

  it('un tramo sin su fecha cuenta como sin dato, no como invalido', () => {
    const r = t.calcular([fila({ envioResultado: '', inicioAnalisis: '' })]);
    expect(r.total.t6.n).toBe(0);
    expect(r.total.t6.sinDato).toBe(1);
    expect(r.total.t6.invalidos).toBe(0);
    // Sin inicio: se pierden T3 y T4, pero T5 (fin a resultado) sigue
    expect(r.total.t3.sinDato).toBe(1);
    expect(r.total.t4.sinDato).toBe(1);
    expect(r.total.t5.n).toBe(1);
  });

  it('inicio de analisis anterior a la asignacion es invalido (edicion antes de asignar)', () => {
    const r = t.calcular([fila({ inicioAnalisis: d(1, 11) })]);
    expect(r.total.t3.n).toBe(0);
    expect(r.total.t3.invalidos).toBe(1);
  });

  it('descarta tramos con dato faltante o negativo y los reporta', () => {
    const r = t.calcular([
      fila({}),
      fila({ radicacion: '' }),                // T1 y T2 sin dato
      fila({ asignacion: d(1, 9) }),           // T2 negativo (asignacion antes de radicar)
      fila({ resultado: 'sin fecha' })         // T5 y T6 sin dato (texto invalido)
    ]);
    expect(r.total.t1.n).toBe(3);
    expect(r.total.t1.sinDato).toBe(1);
    expect(r.total.t2.n).toBe(2);
    expect(r.total.t2.sinDato).toBe(1);
    expect(r.total.t2.invalidos).toBe(1);
    expect(r.total.t5.n).toBe(3);
    expect(r.total.t5.sinDato).toBe(1);
  });

  it('acepta fechas digitadas como texto', () => {
    const r = t.calcular([fila({ radicacion: '01/09/2026 10:00', resultado: '2026-09-02 09:00:00' })]);
    expect(r.total.t1.medianaHoras).toBe(2);
    expect(r.total.t5.medianaHoras).toBe(16);
  });

  it('agrupa por sucursal normalizada y por ciudad dentro de la sucursal', () => {
    const r = t.calcular([
      fila({ sucursal: 'Eje Cafetero', ciudad: 'Pereira' }),
      fila({ sucursal: 'EJE CAFETERO ', ciudad: 'MANIZALES', radicacion: d(1, 14) }),
      fila({ sucursal: 'Bogotá', ciudad: 'Bogotá' })
    ]);
    expect(Object.keys(r.sucursales).sort()).toEqual(['BOGOTA', 'EJE CAFETERO']);
    const eje = r.sucursales['EJE CAFETERO'];
    expect(eje.resumen.solicitudes).toBe(2);
    expect(Object.keys(eje.ciudades).sort()).toEqual(['MANIZALES', 'PEREIRA']);
    expect(eje.ciudades.PEREIRA.t1.medianaHoras).toBe(2);
    expect(eje.ciudades.MANIZALES.t1.medianaHoras).toBe(6);
    expect(r.total.solicitudes).toBe(3);
  });

  it('usa SIN SUCURSAL / SIN CIUDAD cuando están vacías', () => {
    const r = t.calcular([fila({ sucursal: '', ciudad: '' })]);
    expect(r.sucursales['SIN SUCURSAL'].ciudades['SIN CIUDAD'].solicitudes).toBe(1);
  });
});

describe('calcularTiemposEtapas() — lectura de Control_General', () => {
  const headers = ['ID Lote', 'x', 'Fecha ingreso', 'Comercial', 'Sucursal', 'Ciudad del inmueble',
    'F.H Radicación SAI', 'F.H Asignacion', 'F.H Resultado SAI'];

  function setup(filas, nombresComercial) {
    const app = createSpreadsheetApp({ Control_General: [headers, ...filas] });
    globalThis.SpreadsheetApp = app;
    globalThis.getHojaControlId = () => 'ctrl';
    globalThis.SpreadsheetRegistry_get = () => app._spreadsheet;
    globalThis._resolverNombresFiltro = (emails) => (emails === null ? null : nombresComercial);
  }

  const row = (id, ingreso, comercial, sucursal, ciudad, rad, asig, res) =>
    [id, '', ingreso, comercial, sucursal, ciudad, rad, asig, res];

  beforeEach(() => {
    delete globalThis.SpreadsheetApp;
  });

  it('solo considera filas con Fecha ingreso dentro del rango (hasta inclusive)', () => {
    setup([
      row('A', new Date(2026, 8, 1, 8), 'JUAN', 'BOGOTA', 'BOGOTA', new Date(2026, 8, 1, 10), '', ''),
      row('B', new Date(2026, 8, 30, 23, 59), 'JUAN', 'BOGOTA', 'BOGOTA', new Date(2026, 9, 1, 1, 59), '', ''),
      row('C', new Date(2026, 9, 1, 0, 1), 'JUAN', 'BOGOTA', 'BOGOTA', '', '', ''),   // fuera: octubre
      row('D', new Date(2026, 7, 31, 12), 'JUAN', 'BOGOTA', 'BOGOTA', '', '', '')     // fuera: agosto
    ], null);

    const r = t.calcularTiemposEtapas('2026-09-01', '2026-09-30', null);
    expect(r.total.solicitudes).toBe(2);
    expect(r.total.t1.n).toBe(2);
    expect(r.sucursalesConDetalleCiudad).toContain('EJE CAFETERO');
  });

  it('filtra por comercial según el alcance', () => {
    setup([
      row('A', new Date(2026, 8, 2, 8), 'JUAN PEREZ', 'BOGOTA', 'BOGOTA', new Date(2026, 8, 2, 9), '', ''),
      row('B', new Date(2026, 8, 2, 8), 'MARIA GOMEZ', 'BOGOTA', 'BOGOTA', new Date(2026, 8, 2, 9), '', '')
    ], ['JUAN PEREZ']);

    const r = t.calcularTiemposEtapas('2026-09-01', '2026-09-30', ['juan@x.co']);
    expect(r.total.solicitudes).toBe(1);
  });

  it('alcance vacío o sin nombres resolubles devuelve resultado vacío (no muestra todo)', () => {
    setup([row('A', new Date(2026, 8, 2, 8), 'JUAN', 'BOGOTA', 'BOGOTA', new Date(2026, 8, 2, 9), '', '')], null);
    expect(t.calcularTiemposEtapas('2026-09-01', '2026-09-30', []).total.solicitudes).toBe(0);
    expect(t.calcularTiemposEtapas('2026-09-01', '2026-09-30', ['nadie@x.co']).total.solicitudes).toBe(0);
  });

  it('encuentra encabezados aunque cambien tildes, puntos y mayúsculas', () => {
    expect(t.buscarColumna(['a', 'F.H Radicacion SAI'], ['F.H Radicación SAI'])).toBe(2);
    expect(t.buscarColumna(['a', 'FH radicación sai'], ['F.H Radicación SAI'])).toBe(2);
    expect(t.buscarColumna(['a'], ['F.H Radicación SAI'])).toBe(0);
  });
});

describe('registrarEnvioResultadoLote()', () => {
  const headers = ['ID Lote', 'x', 'Fecha ingreso'];

  function setup(filas) {
    const app = createSpreadsheetApp({ Control_General: [headers, ...filas] });
    globalThis.getHojaControlId = () => 'ctrl';
    globalThis.SpreadsheetRegistry_get = () => app._spreadsheet;
    globalThis._registrarEvento_ = () => {};
    globalThis.LockService = createLockService();
    return app._spreadsheet.getSheetByName('Control_General');
  }
  const hora = new Date(2026, 9, 1, 9, 30);

  it('crea la columna y sella todas las filas del lote (sin tocar otros lotes)', () => {
    const hoja = setup([['L1', '', 'a'], ['L2', '', 'b'], ['l1 ', '', 'c'], ['L1', '', 'd']]);
    const r = t.registrarEnvio('L1', hora);

    expect(r).toEqual({ ok: true, filas: 3 });
    expect(hoja._fullData[0][3]).toBe('F.H Envio Resultado');
    expect(hoja._fullData[1][3]).toBe(hora);
    expect(hoja._fullData[2][3]).toBeFalsy(); // L2 intacto
    expect(hoja._fullData[3][3]).toBe(hora);  // coincide aunque cambien mayúsculas/espacios
    expect(hoja._fullData[4][3]).toBe(hora);
  });

  it('conserva el primer envío si el correo se reenvía', () => {
    const hoja = setup([['L1', '', 'a']]);
    const primero = new Date(2026, 9, 1, 9, 0);
    t.registrarEnvio('L1', primero);
    const r = t.registrarEnvio('L1', hora);
    expect(r.filas).toBe(0);
    expect(hoja._fullData[1][3]).toBe(primero);
  });

  it('lote inexistente o vacío no escribe y no lanza', () => {
    setup([['L1', '', 'a']]);
    expect(t.registrarEnvio('NOPE', hora)).toEqual({ ok: true, filas: 0 });
    expect(t.registrarEnvio('', hora)).toEqual({ ok: false, filas: 0 });
  });

  it('si algo falla devuelve ok:false sin lanzar (el correo ya salió)', () => {
    globalThis.getHojaControlId = () => 'ctrl';
    globalThis.SpreadsheetRegistry_get = () => { throw new Error('sin acceso'); };
    globalThis._registrarEvento_ = () => {};
    expect(t.registrarEnvio('L1', hora)).toEqual({ ok: false, filas: 0 });
  });
});
