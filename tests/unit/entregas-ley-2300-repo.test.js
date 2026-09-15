import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { readFileSync } from 'fs';
import { resolve } from 'path';
import { createHmac, randomUUID } from 'crypto';
import { createSpreadsheetApp } from '../mocks/spreadsheet-app.mock.js';
import { createLockService } from '../mocks/lock-service.mock.js';

const source = readFileSync(resolve(__dirname, '../../Repositorios_EntregasLey2300Repo.js'), 'utf-8');
const exportedNames = [
  'EntregasLey2300_bootstrap', 'EntregasLey2300_claveEntrega', 'normalizarCorreoLey2300',
  'normalizarCelularLey2300', 'EntregasLey2300_enmascararDestino', 'EntregasLey2300_huellaDestino',
  'EntregasLey2300_esTransicionPermitida', 'EntregasLey2300_crearOReutilizar',
  'EntregasLey2300_obtenerPorId', 'EntregasLey2300_obtenerPorUuid', 'EntregasLey2300_listar',
  'EntregasLey2300_obtenerDetalle', 'EntregasLey2300_obtenerResumen', 'EntregasLey2300_actualizarEstado',
  'EntregasLey2300_crearPendienteCorreccion', 'EntregasLey2300_recuperarReclamosVencidos', 'EntregasLey2300_depurarRetencion',
  'EntregasLey2300_cerrarProcesadosPorUuid', 'EntregasLey2300_recuperarCierresPendientes',
  'EntregasLey2300_registrarEvento', 'OperacionesLey2300_registrarConciliacion',
  'ENTREGAS_LEY2300_ENCABEZADOS', 'ENTREGAS_LEY2300_EVENTOS_ENCABEZADOS',
  'OPERACIONES_LEY2300_ENCABEZADOS', 'ENTREGAS_LEY2300_RETENCION_ENCABEZADOS',
  'ENTREGAS_LEY2300_CONFIRMACION_RETENCION'
];

function cargarRepositorio() {
  const exportsCode = exportedNames.map(name => `globalThis.${name} = ${name};`).join('\n');
  eval(`(function() { ${source}\n${exportsCode} })()`);
}

function instalarGlobals(sheets, hmacSecret, analisisSheets) {
  const app = createSpreadsheetApp(sheets || {});
  const analisisApp = createSpreadsheetApp(analisisSheets || {});
  const secreto = hmacSecret === undefined ? 'test-hmac-secret' : hmacSecret;
  globalThis.SpreadsheetApp = app;
  globalThis.LockService = createLockService();
  globalThis.getHojaControlId = () => 'control-id';
  globalThis.getArchivoAnalisisId = () => 'analisis-id';
  globalThis.SpreadsheetRegistry_get = id => id === 'analisis-id' ? analisisApp._spreadsheet : app._spreadsheet;
  globalThis.PropertiesService = {
    getScriptProperties: () => ({
      getProperty: nombre => nombre === 'LEY2300_HMAC_SECRET' ? secreto : null
    })
  };
  globalThis.Utilities = {
    computeHmacSha256Signature: (valor, clave) => Array.from(createHmac('sha256', String(clave)).update(String(valor)).digest()),
    base64EncodeWebSafe: bytes => Buffer.from(bytes).toString('base64url'),
    getUuid: () => randomUUID()
  };
  cargarRepositorio();
  return app;
}

function limpiarGlobals() {
  for (const name of exportedNames) delete globalThis[name];
  delete globalThis.SpreadsheetApp;
  delete globalThis.LockService;
  delete globalThis.getHojaControlId;
  delete globalThis.getArchivoAnalisisId;
  delete globalThis.SpreadsheetRegistry_get;
  delete globalThis.PropertiesService;
  delete globalThis.Utilities;
}

describe('helpers de Entregas Ley 2300', () => {
  beforeEach(() => instalarGlobals());
  afterEach(limpiarGlobals);

  it('normaliza correo y rechaza formatos no válidos', () => {
    expect(normalizarCorreoLey2300('  ANA.PEREZ@Empresa.COM ')).toBe('ana.perez@empresa.com');
    expect(normalizarCorreoLey2300('ana@@empresa.com')).toBe('');
    expect(normalizarCorreoLey2300('ana perez@empresa.com')).toBe('');
  });

  it('normaliza solamente celulares colombianos permitidos', () => {
    expect(normalizarCelularLey2300('300 123 4567')).toBe('573001234567');
    expect(normalizarCelularLey2300('+57 (300) 123-4567')).toBe('573001234567');
    expect(normalizarCelularLey2300('6011234567')).toBe('');
  });

  it('construye claves solo para participante y canal allowlisted', () => {
    expect(EntregasLey2300_claveEntrega('uuid-1', 'coa1', 'email')).toBe('uuid-1|COA1|EMAIL');
    expect(EntregasLey2300_claveEntrega('uuid-1', 'OTRO', 'EMAIL')).toBe('');
    expect(EntregasLey2300_claveEntrega('', 'INQ', 'SMS')).toBe('');
  });

  it('enmascara destinos y genera una huella HMAC-SHA-256 estable', () => {
    const correo = 'ana.perez@empresa.com';
    const huellaEsperada = createHmac('sha256', 'test-hmac-secret').update(correo).digest('base64url');

    expect(EntregasLey2300_enmascararDestino(correo, 'EMAIL')).not.toContain('ana.perez');
    expect(EntregasLey2300_enmascararDestino('3001234567', 'SMS')).toBe('******4567');
    expect(EntregasLey2300_huellaDestino(correo)).toBe(huellaEsperada);
    expect(EntregasLey2300_huellaDestino(correo)).not.toContain(correo);
  });

  it('solo permite transiciones explícitas de la máquina de estados', () => {
    expect(EntregasLey2300_esTransicionPermitida('PENDIENTE', 'EN_PROCESO')).toBe(true);
    expect(EntregasLey2300_esTransicionPermitida('EN_PROCESO', 'PENDIENTE_CORRECCION')).toBe(true);
    expect(EntregasLey2300_esTransicionPermitida('ENVIADO', 'EN_PROCESO')).toBe(false);
    expect(EntregasLey2300_esTransicionPermitida('PENDIENTE', 'ENVIADO')).toBe(false);
  });
});

describe('persistencia de Entregas Ley 2300', () => {
  let app;

  beforeEach(() => { app = instalarGlobals(); });
  afterEach(limpiarGlobals);

  it('crea las tres hojas de forma idempotente y conserva sus encabezados', () => {
    expect(EntregasLey2300_bootstrap()).toEqual({ entregasCreada: true, eventosCreada: true, operacionesCreada: true, retencionCreada: true, cierresCreada: true, cierresPendientesCreada: true });
    expect(EntregasLey2300_bootstrap()).toEqual({ entregasCreada: false, eventosCreada: false, operacionesCreada: false, retencionCreada: false, cierresCreada: false, cierresPendientesCreada: false });
    expect(app._spreadsheet.getSheetByName('Entregas_Ley2300')._fullData[0]).toEqual(ENTREGAS_LEY2300_ENCABEZADOS);
    expect(app._spreadsheet.getSheetByName('Entregas_Ley2300_Eventos')._fullData[0]).toEqual(ENTREGAS_LEY2300_EVENTOS_ENCABEZADOS);
    expect(app._spreadsheet.getSheetByName('Operaciones_Ley2300')._fullData[0]).toEqual(OPERACIONES_LEY2300_ENCABEZADOS);
  });

  it('opera de forma segura sin secreto y nunca persiste el destino', () => {
    limpiarGlobals();
    app = instalarGlobals(undefined, '');
    const comando = { uuid: 'uuid-1', idLote: 'L-1', solicitud: 'S-1', participante: 'INQ', canal: 'EMAIL', destino: 'ana.perez@empresa.com' };

    const resultado = EntregasLey2300_crearOReutilizar(comando);
    expect(resultado.creada).toBe(true);
    expect(JSON.stringify(resultado.entrega)).not.toContain('ana.perez@empresa.com');
  });

  it('crea una entrega solo una vez y retorna DTO sin contacto ni huella', () => {
    const command = { uuid: 'uuid-1', idLote: 'L-1', solicitud: 'S-1', participante: 'INQ', canal: 'EMAIL', destino: 'ana.perez@empresa.com' };
    const primera = EntregasLey2300_crearOReutilizar(command);
    const segunda = EntregasLey2300_crearOReutilizar(command);

    expect(primera.creada).toBe(true);
    expect(segunda.creada).toBe(false);
    expect(primera.entrega).not.toHaveProperty('destino');
    expect(primera.entrega).not.toHaveProperty('huellaDestino');
    expect(JSON.stringify(primera.entrega)).not.toContain('ana.perez@empresa.com');
    expect(EntregasLey2300_obtenerPorUuid('uuid-1')).toHaveLength(1);
  });

  it('filtra y pagina DTOs sin exponer PII', () => {
    EntregasLey2300_crearOReutilizar({ uuid: 'uuid-1', idLote: 'L-1', solicitud: 'S-1', participante: 'INQ', canal: 'EMAIL', destino: 'ana@empresa.com' });
    EntregasLey2300_crearOReutilizar({ uuid: 'uuid-2', idLote: 'L-2', solicitud: 'S-2', participante: 'COA1', canal: 'SMS', destino: '3001234567' });
    const respuesta = EntregasLey2300_listar({ canal: 'SMS' }, 1, 10);

    expect(respuesta.total).toBe(1);
    expect(respuesta.datos[0].uuid).toBe('uuid-2');
    expect(JSON.stringify(respuesta.datos[0])).not.toContain('3001234567');
  });

  it('oculta ENVIADO por defecto y lo devuelve solo con soloPendientes=false', () => {
    const pendiente = EntregasLey2300_crearOReutilizar({ uuid: 'uuid-pendiente', idLote: 'L-1', solicitud: 'S-1', participante: 'INQ', canal: 'EMAIL', destino: 'uno@empresa.com' }).entrega;
    const enviada = EntregasLey2300_crearOReutilizar({ uuid: 'uuid-enviada', idLote: 'L-2', solicitud: 'S-2', participante: 'COA1', canal: 'SMS', destino: '3001234567' }).entrega;
    const hoja = app._spreadsheet.getSheetByName('Entregas_Ley2300');
    hoja._fullData[2][ENTREGAS_LEY2300_ENCABEZADOS.indexOf('ESTADO')] = 'ENVIADO';

    expect(EntregasLey2300_listar({}, 1, 10).datos.map(item => item.entregaId)).toEqual([pendiente.entregaId]);
    expect(EntregasLey2300_listar({ soloPendientes: false }, 1, 10).datos.map(item => item.entregaId)).toEqual([enviada.entregaId, pendiente.entregaId]);
  });

  it('registra eventos y conciliaciones append-only con actor HMAC y detalle redaccionado', () => {
    const actor = 'operador-ley-2300';
    const huellaActor = createHmac('sha256', 'test-hmac-secret').update(actor).digest('base64url');
    EntregasLey2300_bootstrap();
    EntregasLey2300_registrarEvento({ entregaId: 'e-1', uuid: 'u-1', tipoEvento: 'RESULTADO', estadoNuevo: 'PENDIENTE_CORRECCION', causaFallo: 'DATOS_CONTACTO', actor: actor, detalle: 'correo ana@empresa.com teléfono 3001234567' });
    OperacionesLey2300_registrarConciliacion({ entregaId: 'e-1', uuid: 'u-1', tipoOperacion: 'CORRECCION_CONTACTO', estado: 'PREPARADA', campo: 'CORREO', actor: actor, detalle: 'contacto ana@empresa.com' });

    const eventos = app._spreadsheet.getSheetByName('Entregas_Ley2300_Eventos')._fullData;
    const operaciones = app._spreadsheet.getSheetByName('Operaciones_Ley2300')._fullData;
    const actorEventos = ENTREGAS_LEY2300_EVENTOS_ENCABEZADOS.indexOf('ACTOR_HUELLA');
    const actorOperaciones = OPERACIONES_LEY2300_ENCABEZADOS.indexOf('ACTOR_HUELLA');
    expect(eventos).toHaveLength(2);
    expect(operaciones).toHaveLength(2);
    expect(eventos[1][actorEventos]).toBe(huellaActor);
    expect(operaciones[1][actorOperaciones]).toBe(huellaActor);
    expect(JSON.stringify(eventos[1])).not.toContain('ana@empresa.com');
    expect(JSON.stringify(eventos[1])).not.toContain('3001234567');
  });
});


describe('consultas ADMIN de Entregas Ley 2300', () => {
  beforeEach(() => instalarGlobals());
  afterEach(limpiarGlobals);

  it('retorna detalle e historial sin contacto completo, huellas ni actor', () => {
    const creada = EntregasLey2300_crearOReutilizar({
      uuid: 'uuid-detalle', idLote: 'L-7', solicitud: 'S-7', participante: 'INQ', canal: 'EMAIL', destino: 'ana.perez@empresa.com'
    }).entrega;
    EntregasLey2300_registrarEvento({
      entregaId: creada.entregaId, uuid: creada.uuid, tipoEvento: 'RESULTADO', estadoNuevo: 'PENDIENTE_CORRECCION',
      causaFallo: 'DATOS_CONTACTO', destinoMascarado: creada.destinoMascarado, actor: 'admin@empresa.com', detalle: 'Contacto ana.perez@empresa.com'
    });
    OperacionesLey2300_registrarConciliacion({
      entregaId: creada.entregaId, uuid: creada.uuid, tipoOperacion: 'CORRECCION_CONTACTO', estado: 'PREPARADA',
      campo: 'CORREO_INQ', valorAnteriorMascarado: creada.destinoMascarado, valorNuevoMascarado: 'n***@e***', actor: 'admin@empresa.com', detalle: 'Corrección preparada'
    });

    const detalle = EntregasLey2300_obtenerDetalle(creada.entregaId);

    expect(detalle.entrega.entregaId).toBe(creada.entregaId);
    expect(detalle.historial).toHaveLength(3);
    expect(JSON.stringify(detalle)).not.toContain('ana.perez@empresa.com');
    expect(JSON.stringify(detalle)).not.toContain('ACTOR_HUELLA');
    expect(JSON.stringify(detalle)).not.toContain('admin@empresa.com');
  });

  it('resume solo conteos por estado sin exponer entregas ni PII', () => {
    EntregasLey2300_crearOReutilizar({ uuid: 'uuid-resumen-1', idLote: 'L-1', solicitud: 'S-1', participante: 'INQ', canal: 'EMAIL', destino: 'uno@empresa.com' });
    EntregasLey2300_crearOReutilizar({ uuid: 'uuid-resumen-2', idLote: 'L-2', solicitud: 'S-2', participante: 'COA1', canal: 'SMS', destino: '3001234567' });

    const resumen = EntregasLey2300_obtenerResumen();

    expect(resumen.total).toBe(2);
    expect(resumen.porEstado.PENDIENTE).toBe(2);
    expect(resumen).not.toHaveProperty('datos');
    expect(JSON.stringify(resumen)).not.toContain('uno@empresa.com');
    expect(JSON.stringify(resumen)).not.toContain('3001234567');
  });
});


describe('recuperación y retención Ley 2300', () => {
  let app;

  beforeEach(() => { app = instalarGlobals(); });
  afterEach(limpiarGlobals);

  it('crea un caso corregible sin conservar un contacto inválido', () => {
    const resultado = EntregasLey2300_crearPendienteCorreccion({
      uuid: 'uuid-invalida', idLote: 'L-3', solicitud: 'S-3', participante: 'INQ', canal: 'EMAIL'
    });

    expect(resultado).toMatchObject({ creada: true, entrega: { estado: 'PENDIENTE_CORRECCION', causaFallo: 'DATOS_CONTACTO', canal: 'EMAIL' } });
    expect(JSON.stringify(resultado)).not.toContain('@');
    expect(JSON.stringify(app._spreadsheet.getSheetByName('Entregas_Ley2300_Eventos')._fullData)).toContain('CONTACTO_INVALIDO_REGISTRADO');
  });

  it('recupera reclamos vencidos mediante CAS, evento sanitizado y sin volverlos elegibles', () => {
    const entrega = EntregasLey2300_crearOReutilizar({
      uuid: 'uuid-vencida', idLote: 'L-1', solicitud: 'S-1', participante: 'INQ', canal: 'EMAIL', destino: 'ana@empresa.com'
    }).entrega;
    const reclamada = EntregasLey2300_actualizarEstado({ entregaId: entrega.entregaId, versionEsperada: 1, estadoNuevo: 'EN_PROCESO', actor: 'TRIGGER_LEY2300' }).entrega;
    const hoja = app._spreadsheet.getSheetByName('Entregas_Ley2300');
    hoja._fullData[1][ENTREGAS_LEY2300_ENCABEZADOS.indexOf('EN_PROCESO_DESDE')] = new Date('2025-01-01T00:00:00.000Z');

    const resultado = EntregasLey2300_recuperarReclamosVencidos(new Date('2026-01-01T00:00:00.000Z'));
    const recuperada = EntregasLey2300_obtenerPorId(entrega.entregaId);

    expect(reclamada.estado).toBe('EN_PROCESO');
    expect(resultado).toEqual({ candidatas: 1, recuperadas: 1 });
    expect(recuperada).toMatchObject({ estado: 'PENDIENTE_CONCILIACION', version: 3 });
    expect(JSON.stringify(app._spreadsheet.getSheetByName('Entregas_Ley2300_Eventos')._fullData)).toContain('RECLAMO_VENCIDO_RECUPERADO');
  });

  it('no elimina una entrega ENVIADO de un UUID parcial durante el cierre', () => {
    const enviada = EntregasLey2300_crearOReutilizar({ uuid: 'uuid-parcial', idLote: 'L-1', solicitud: 'S-1', participante: 'INQ', canal: 'EMAIL', destino: 'uno@empresa.com' }).entrega;
    const pendiente = EntregasLey2300_crearOReutilizar({ uuid: 'uuid-parcial', idLote: 'L-1', solicitud: 'S-1', participante: 'COA1', canal: 'SMS', destino: '3001234567' }).entrega;
    const hoja = app._spreadsheet.getSheetByName('Entregas_Ley2300');
    hoja._fullData[1][ENTREGAS_LEY2300_ENCABEZADOS.indexOf('ESTADO')] = 'ENVIADO';

    const cierre = EntregasLey2300_cerrarProcesadosPorUuid(['uuid-parcial']);

    expect(cierre).toEqual({ uuidsCerrados: 0, entregasEliminadas: 0, eventosEliminados: 0, operacionesEliminadas: 0 });
    expect(EntregasLey2300_obtenerPorId(enviada.entregaId)).toMatchObject({ estado: 'ENVIADO' });
    expect(EntregasLey2300_obtenerPorId(pendiente.entregaId)).toMatchObject({ estado: 'PENDIENTE' });
  });

  it('cierra un UUID completamente ENVIADO con sus bitácoras y una sola auditoría agregada', () => {
    const primera = EntregasLey2300_crearOReutilizar({ uuid: 'uuid-completo', idLote: 'L-1', solicitud: 'S-1', participante: 'INQ', canal: 'EMAIL', destino: 'uno@empresa.com' }).entrega;
    const segunda = EntregasLey2300_crearOReutilizar({ uuid: 'uuid-completo', idLote: 'L-1', solicitud: 'S-1', participante: 'COA1', canal: 'SMS', destino: '3001234567' }).entrega;
    const hoja = app._spreadsheet.getSheetByName('Entregas_Ley2300');
    const estado = ENTREGAS_LEY2300_ENCABEZADOS.indexOf('ESTADO');
    hoja._fullData[1][estado] = 'ENVIADO';
    hoja._fullData[2][estado] = 'ENVIADO';
    OperacionesLey2300_registrarConciliacion({ entregaId: primera.entregaId, uuid: primera.uuid, tipoOperacion: 'CIERRE', estado: 'COMPLETA' });

    const cierre = EntregasLey2300_cerrarProcesadosPorUuid(['uuid-completo']);

    expect(cierre).toMatchObject({ uuidsCerrados: 1, entregasEliminadas: 2, eventosEliminados: 2, operacionesEliminadas: 1 });
    expect(EntregasLey2300_obtenerPorUuid('uuid-completo')).toEqual([]);
    expect(app._spreadsheet.getSheetByName('Entregas_Ley2300_Eventos')._fullData).toHaveLength(1);
    expect(app._spreadsheet.getSheetByName('Operaciones_Ley2300')._fullData).toHaveLength(1);
    const auditoria = app._spreadsheet.getSheetByName('Cierres_Ley2300')._fullData;
    expect(auditoria).toHaveLength(2);
    expect(JSON.stringify(auditoria)).not.toContain('uuid-completo');
  });

  it('reanuda un cierre pendiente si falla después de eliminar eventos sin perder el UUID', () => {
    const entrega = EntregasLey2300_crearOReutilizar({ uuid: 'uuid-recuperable', idLote: 'L-1', solicitud: 'S-1', participante: 'INQ', canal: 'EMAIL', destino: 'uno@empresa.com' }).entrega;
    const hojaEntregas = app._spreadsheet.getSheetByName('Entregas_Ley2300');
    hojaEntregas._fullData[1][ENTREGAS_LEY2300_ENCABEZADOS.indexOf('ESTADO')] = 'ENVIADO';
    OperacionesLey2300_registrarConciliacion({ entregaId: entrega.entregaId, uuid: entrega.uuid, tipoOperacion: 'CIERRE', estado: 'COMPLETA' });
    const operaciones = app._spreadsheet.getSheetByName('Operaciones_Ley2300');
    const eliminarOriginal = operaciones.deleteRows.bind(operaciones);
    operaciones.deleteRows = () => { throw new Error('Fallo intermedio'); };

    expect(() => EntregasLey2300_cerrarProcesadosPorUuid(['uuid-recuperable'])).toThrow('Fallo intermedio');
    expect(app._spreadsheet.getSheetByName('Cierres_Ley2300_Pendientes')._fullData).toHaveLength(2);
    expect(EntregasLey2300_obtenerPorId(entrega.entregaId)).toMatchObject({ estado: 'ENVIADO' });

    operaciones.deleteRows = eliminarOriginal;
    const recuperado = EntregasLey2300_recuperarCierresPendientes();

    expect(recuperado).toMatchObject({ uuidsCerrados: 1, entregasEliminadas: 1 });
    expect(EntregasLey2300_obtenerPorId(entrega.entregaId)).toBeNull();
    expect(app._spreadsheet.getSheetByName('Cierres_Ley2300_Pendientes')._fullData).toHaveLength(1);
    expect(app._spreadsheet.getSheetByName('Cierres_Ley2300')._fullData).toHaveLength(2);
  });

  it('retiene solo UUIDs completos ENVIADO, fuente Procesado y antigüedad ENVIADA_EN', () => {
    limpiarGlobals();
    app = instalarGlobals(undefined, undefined, {
      'registro analisis': [
        ['UUID_SISTEMA', 'Estado Automatización'],
        ['uuid-completo', 'Procesado 2026-01-01'],
        ['uuid-parcial', 'Procesado 2026-01-01'],
        ['uuid-fallido', 'Procesado 2026-01-01']
      ]
    });
    const completoA = EntregasLey2300_crearOReutilizar({ uuid: 'uuid-completo', idLote: 'L-1', solicitud: 'S-1', participante: 'INQ', canal: 'EMAIL', destino: 'uno@empresa.com' }).entrega;
    const completoB = EntregasLey2300_crearOReutilizar({ uuid: 'uuid-completo', idLote: 'L-1', solicitud: 'S-1', participante: 'COA1', canal: 'SMS', destino: '3001234567' }).entrega;
    const parcialEnviado = EntregasLey2300_crearOReutilizar({ uuid: 'uuid-parcial', idLote: 'L-2', solicitud: 'S-2', participante: 'INQ', canal: 'EMAIL', destino: 'dos@empresa.com' }).entrega;
    const parcialPendiente = EntregasLey2300_crearOReutilizar({ uuid: 'uuid-parcial', idLote: 'L-2', solicitud: 'S-2', participante: 'COA1', canal: 'SMS', destino: '3007654321' }).entrega;
    const fallido = EntregasLey2300_crearOReutilizar({ uuid: 'uuid-fallido', idLote: 'L-3', solicitud: 'S-3', participante: 'INQ', canal: 'EMAIL', destino: 'tres@empresa.com' }).entrega;
    const hoja = app._spreadsheet.getSheetByName('Entregas_Ley2300');
    const estado = ENTREGAS_LEY2300_ENCABEZADOS.indexOf('ESTADO');
    const enviadaEn = ENTREGAS_LEY2300_ENCABEZADOS.indexOf('ENVIADA_EN');
    [1, 2, 3].forEach(fila => { hoja._fullData[fila][estado] = 'ENVIADO'; hoja._fullData[fila][enviadaEn] = new Date('2025-01-01T00:00:00.000Z'); });
    hoja._fullData[5][estado] = 'FALLIDO_DEFINITIVO';

    const previa = EntregasLey2300_depurarRetencion({ confirmacion: '' }, 'admin-interno', new Date('2026-06-01T00:00:00.000Z'));
    const ejecutada = EntregasLey2300_depurarRetencion({ confirmacion: ENTREGAS_LEY2300_CONFIRMACION_RETENCION }, 'admin-interno', new Date('2026-06-01T00:00:00.000Z'));

    expect(previa).toMatchObject({ ok: false, requiereConfirmacion: true, candidatasTerminales: 2 });
    expect(ejecutada).toMatchObject({ ok: true, entregasEliminadas: 2 });
    expect(EntregasLey2300_obtenerPorId(completoA.entregaId)).toBeNull();
    expect(EntregasLey2300_obtenerPorId(completoB.entregaId)).toBeNull();
    expect(EntregasLey2300_obtenerPorId(parcialEnviado.entregaId)).toMatchObject({ estado: 'ENVIADO' });
    expect(EntregasLey2300_obtenerPorId(parcialPendiente.entregaId)).toMatchObject({ estado: 'PENDIENTE' });
    expect(EntregasLey2300_obtenerPorId(fallido.entregaId)).toMatchObject({ estado: 'FALLIDO_DEFINITIVO' });
    expect(app._spreadsheet.getSheetByName('Retencion_Ley2300')._fullData).toHaveLength(2);
  });
});
