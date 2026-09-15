import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { readFileSync } from 'fs';
import { resolve } from 'path';

const source = readFileSync(resolve(__dirname, '../../Api.js'), 'utf-8');
const exported = [
  'api_obtenerEntregasLey2300', 'api_obtenerDetalleEntregaLey2300', 'api_obtenerResumenEntregasLey2300',
  'api_corregirContactoLey2300'
];

function cargarApi() {
  eval(`(function() { ${source}\n${exported.map(name => `globalThis.${name} = ${name};`).join('\n')} })()`);
}

function instalarDependencias(opciones) {
  const config = opciones || {};
  globalThis.verificarRol = vi.fn(config.verificarRol || (() => ({ email: 'admin@empresa.test' })));
  globalThis.EntregasLey2300_listar = vi.fn(config.listar || (() => ({ datos: [], total: 0, pagina: 1, totalPaginas: 0 })));
  globalThis.EntregasLey2300_obtenerDetalle = vi.fn(config.detalle || (() => ({ entrega: null, historial: [] })));
  globalThis.EntregasLey2300_obtenerResumen = vi.fn(config.resumen || (() => ({ total: 0, porEstado: {}, pendientesCorreccion: 0, pendientesConciliacion: 0 })));
  globalThis.EntregasLey2300_corregirContacto = vi.fn(config.corregir || (() => ({ ok: true, mensaje: 'La corrección fue aplicada.', entrega: { entregaId: 'entrega-1' } })));
  globalThis.ENTREGAS_LEY2300_ESTADOS = ['PENDIENTE', 'PENDIENTE_CORRECCION', 'ENVIADO'];
  globalThis.ENTREGAS_LEY2300_CAUSAS = ['DATOS_CONTACTO', 'AMBIGUO'];
  globalThis.ENTREGAS_LEY2300_PARTICIPANTES = ['INQ', 'COA1'];
  globalThis.ENTREGAS_LEY2300_CANALES = ['EMAIL', 'SMS'];
  globalThis.NotificationConfig_listar = vi.fn(() => [{ id: 'cumplimiento_ley_2300', activa: true, agendas: [{ cadaDias: 15, hora: 6, minuto: 0 }] }]);
  globalThis.PropertiesService = { getScriptProperties: () => ({ getProperty: clave => clave === 'LEY2300_ULTIMA_EJECUCION_MS' ? config.ultimaEjecucion || '' : '' }) };
  globalThis._registrarEvento_ = vi.fn();
  cargarApi();
}

function limpiarDependencias() {
  exported.concat([
    'verificarRol', 'EntregasLey2300_listar', 'EntregasLey2300_obtenerDetalle', 'EntregasLey2300_obtenerResumen',
    'EntregasLey2300_corregirContacto', 'ENTREGAS_LEY2300_ESTADOS', 'ENTREGAS_LEY2300_CAUSAS', 'ENTREGAS_LEY2300_PARTICIPANTES',
    'ENTREGAS_LEY2300_CANALES', 'NotificationConfig_listar', 'PropertiesService', '_registrarEvento_'
  ]).forEach(name => delete globalThis[name]);
}

describe('RPCs ADMIN de entregas Ley 2300', () => {
  beforeEach(() => instalarDependencias());
  afterEach(limpiarDependencias);

  it('delega el listado únicamente después de validar filtros y paginación estrictos', () => {
    const filtros = { idLote: 'L-100', solicitud: 'S-200', participante: 'INQ', canal: 'EMAIL', estado: 'PENDIENTE_CORRECCION', causaFallo: 'DATOS_CONTACTO', fechaDesde: '2026-01-01', fechaHasta: '2026-01-31' };

    api_obtenerEntregasLey2300(filtros, 2, 20);

    expect(verificarRol).toHaveBeenCalledWith(['ADMIN']);
    expect(EntregasLey2300_listar).toHaveBeenCalledWith(filtros, 2, 20);
  });

  it('acepta soloPendientes únicamente como booleano y delega el alcance explícito', () => {
    const filtros = { soloPendientes: false };

    api_obtenerEntregasLey2300(filtros, 1, 20);

    expect(EntregasLey2300_listar).toHaveBeenCalledWith(filtros, 1, 20);
    expect(api_obtenerEntregasLey2300({ soloPendientes: 'false' }, 1, 20)).toEqual({ datos: [], total: 0, pagina: 1, totalPaginas: 0 });
  });

  it('rechaza claves sensibles de cliente y entrega un listado vacío genérico', () => {
    const respuesta = api_obtenerEntregasLey2300({ uuid: 'no-permitido' }, 1, 20);

    expect(respuesta).toEqual({ datos: [], total: 0, pagina: 1, totalPaginas: 0 });
    expect(EntregasLey2300_listar).not.toHaveBeenCalled();
    expect(_registrarEvento_).toHaveBeenCalledWith('ERROR', 'Api.js', 'api_obtenerEntregasLey2300', expect.any(String));
  });

  it('rechaza rangos de fecha inválidos antes de consultar', () => {
    expect(api_obtenerEntregasLey2300({ fechaDesde: '2026-02-02', fechaHasta: '2026-02-01' }, 1, 20)).toEqual({ datos: [], total: 0, pagina: 1, totalPaginas: 0 });
    expect(EntregasLey2300_listar).not.toHaveBeenCalled();
  });

  it('retorna defaults seguros cuando el rol ADMIN no autoriza la lectura', () => {
    verificarRol.mockImplementation(() => { throw new Error('SIN_PERMISOS'); });

    expect(api_obtenerDetalleEntregaLey2300('entrega-1')).toEqual({ entrega: null, historial: [] });
    expect(api_obtenerResumenEntregasLey2300()).toEqual({
      total: 0,
      porEstado: { PENDIENTE: 0, PENDIENTE_CORRECCION: 0, ENVIADO: 0 },
      pendientesCorreccion: 0,
      pendientesConciliacion: 0,
      agenda: expect.objectContaining({ activa: true, frecuencia: 'Cada 15 día(s) a las 06:00' })
    });
    expect(EntregasLey2300_obtenerDetalle).not.toHaveBeenCalled();
    expect(EntregasLey2300_obtenerResumen).not.toHaveBeenCalled();
  });

  it('estima la próxima ejecución desde la última ejecución y respeta cadaDias', () => {
    instalarDependencias({ ultimaEjecucion: String(Date.now() - 60 * 60 * 1000) });

    const resumen = api_obtenerResumenEntregasLey2300();
    const estimada = new Date(resumen.agenda.proximaEjecucionEstimada).getTime();

    expect(estimada - Date.now()).toBeGreaterThan(13 * 24 * 60 * 60 * 1000);
    expect(resumen.agenda.nota).toContain('Apps Script puede variar');
  });

  it('deriva el actor de la sesión y nunca acepta actor, UUID, fila, participante o canal', () => {
    const comando = { entregaId: 'entrega-1', versionEsperada: 3, contacto: 'nuevo@empresa.test' };

    const respuesta = api_corregirContactoLey2300(comando);

    expect(respuesta.ok).toBe(true);
    expect(EntregasLey2300_corregirContacto).toHaveBeenCalledWith(comando, 'admin@empresa.test');
    expect(api_corregirContactoLey2300({ entregaId: 'entrega-1', versionEsperada: 3, contacto: 'nuevo@empresa.test', canal: 'EMAIL' }))
      .toEqual({ ok: false, mensaje: 'No fue posible procesar la corrección.', entrega: null });
    expect(EntregasLey2300_corregirContacto).toHaveBeenCalledTimes(1);
  });

  it('no registra ni devuelve el contacto cuando la corrección falla', () => {
    instalarDependencias({ corregir: () => { throw new Error('nuevo@empresa.test'); } });

    const respuesta = api_corregirContactoLey2300({ entregaId: 'entrega-1', versionEsperada: 3, contacto: 'nuevo@empresa.test' });

    expect(JSON.stringify(respuesta)).not.toContain('nuevo@empresa.test');
    expect(JSON.stringify(_registrarEvento_.mock.calls)).not.toContain('nuevo@empresa.test');
  });
});
