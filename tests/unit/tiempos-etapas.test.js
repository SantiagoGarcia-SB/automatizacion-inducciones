/**
 * Unit tests: Servicios_TiemposEtapas.js
 *
 * Tiempos entre etapas (T1 ingreso→radicación, T2 radicación→asignación,
 * T3 asignación→resultado) agregados por total, sucursal y ciudad.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { createSpreadsheetApp } from '../mocks/spreadsheet-app.mock.js';
import { readFileSync } from 'fs';
import { resolve } from 'path';

const sourceCode = readFileSync(resolve(__dirname, '../../Servicios_TiemposEtapas.js'), 'utf-8');

function loadSource() {
  const wrapped = `(function() { ${sourceCode}
  ; return {
    parsearFecha: TiemposEtapas_parsearFecha_,
    estadistica: TiemposEtapas_estadistica_,
    calcular: TiemposEtapas_calcular_,
    calcularTiemposEtapas: calcularTiemposEtapas,
    buscarColumna: TiemposEtapas_buscarColumna_
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
  const fila = (o) => ({ ingreso: d(1, 8), radicacion: d(1, 10), asignacion: d(1, 12), resultado: d(2, 12), sucursal: 'BOGOTA', ciudad: 'BOGOTA', ...o });

  it('calcula T1, T2 y T3 en horas', () => {
    const r = t.calcular([fila({})]);
    expect(r.total.t1.medianaHoras).toBe(2);
    expect(r.total.t2.medianaHoras).toBe(2);
    expect(r.total.t3.medianaHoras).toBe(24);
    expect(r.total.solicitudes).toBe(1);
  });

  it('descarta tramos con dato faltante o negativo y los reporta', () => {
    const r = t.calcular([
      fila({}),
      fila({ radicacion: '' }),                // T1 y T2 sin dato
      fila({ asignacion: d(1, 9) }),           // T2 negativo (asignación antes de radicar)
      fila({ resultado: 'sin fecha' })         // T3 sin dato (texto inválido)
    ]);
    expect(r.total.t1.n).toBe(3);
    expect(r.total.t1.sinDato).toBe(1);
    expect(r.total.t2.n).toBe(2);
    expect(r.total.t2.sinDato).toBe(1);
    expect(r.total.t2.invalidos).toBe(1);
    expect(r.total.t3.n).toBe(3); // T3 no depende de la radicación
    expect(r.total.t3.sinDato).toBe(1);
  });

  it('acepta fechas digitadas como texto', () => {
    const r = t.calcular([fila({ radicacion: '01/09/2026 10:00', resultado: '2026-09-02 12:00:00' })]);
    expect(r.total.t1.medianaHoras).toBe(2);
    expect(r.total.t3.medianaHoras).toBe(24);
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
