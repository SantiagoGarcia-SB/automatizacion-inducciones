import { afterEach, describe, expect, it, vi } from 'vitest';
import { readFileSync } from 'fs';
import { resolve } from 'path';

const source = readFileSync(resolve(__dirname, '../../Cumplimiento.js'), 'utf8');

function cargar() {
  eval(`(function(){${source}\nglobalThis._procesarEntregaLey2300_=_procesarEntregaLey2300_;globalThis._crearCandidatoEntregaLey2300_=_crearCandidatoEntregaLey2300_;globalThis._estadoFinalLey2300_=_estadoFinalLey2300_;globalThis._enviarReporteLey2300_=_enviarReporteLey2300_;globalThis._construirCuerpoLey2300_=_construirCuerpoLey2300_;})()`);
}

function entorno(resultadoProveedor) {
  const transiciones = [];
  const lock = { tryLock: () => true, releaseLock: () => {} };
  globalThis._enviarEmailInfobip = () => resultadoProveedor;
  globalThis._enviarSmsInfobip = () => resultadoProveedor;
  globalThis.EntregasLey2300_obtenerPorId = () => ({ entregaId: 'e-1', uuid: 'u-1', estado: 'PENDIENTE', version: 1, intentos: 0, maxIntentos: 3 });
  globalThis.EntregasLey2300_actualizarEstado = comando => { transiciones.push(comando); return { ok: true, entrega: { entregaId: 'e-1', version: comando.estadoNuevo === 'EN_PROCESO' ? 2 : 3, intentos: 1, maxIntentos: 3 } }; };
  globalThis.EntregasLey2300_forzarConciliacion = () => ({ ok: true, entrega: { entregaId: 'e-1', estado: 'PENDIENTE_CONCILIACION', version: 3 } });
  globalThis._registrarEvento_ = () => {};
  globalThis.UsuariosRepo_getCorreosAdmin = () => 'admin@example.test';
  globalThis._verificarCuotaEmail_ = () => true;
  globalThis.MailApp = { sendEmail: () => { throw new Error('reporte no disponible'); } };
  globalThis._C_ROJO = '#f00'; globalThis._C_NAVY = '#000'; globalThis._envolver_ = texto => texto; globalThis._bloque_cabecera_ = () => ''; globalThis._bloque_barra_estado_ = () => ''; globalThis._bloque_cuerpo_inicio_ = () => ''; globalThis._bloque_chips_ = () => ''; globalThis._bloque_nota_ = () => ''; globalThis._bloque_pie_ = () => '';
  cargar();
  return { lock, transiciones };
}

afterEach(() => ['_enviarEmailInfobip','_enviarSmsInfobip','EntregasLey2300_obtenerPorId','EntregasLey2300_actualizarEstado','EntregasLey2300_crearPendienteCorreccion','EntregasLey2300_crearOReutilizar','EntregasLey2300_forzarConciliacion','normalizarCorreoLey2300','normalizarCelularLey2300','_registrarEvento_','UsuariosRepo_getCorreosAdmin','_verificarCuotaEmail_','MailApp','_procesarEntregaLey2300_','_crearCandidatoEntregaLey2300_','_estadoFinalLey2300_','_enviarReporteLey2300_','_construirCuerpoLey2300_'].forEach(nombre => delete globalThis[nombre]));

describe('orquestación ledger de Ley 2300', () => {
  it('registra contactos inválidos como pendientes corregibles sin enviarlos', () => {
    entorno({ ok: true, tipo: 'ACEPTADO', causa: '', statusCode: 201, messageId: 'm-1' });
    const pendiente = globalThis.EntregasLey2300_crearPendienteCorreccion = vi.fn(() => ({ creada: true }));
    globalThis.normalizarCorreoLey2300 = () => '';
    globalThis.normalizarCelularLey2300 = () => '';
    const columnas = { idLote: 0, solicitud: 1, inmobiliaria: 2 };
    const candidato = _crearCandidatoEntregaLey2300_('uuid-1', 2, ['L-1', 'S-1', 'Inmo'], columnas, { participante: 'INQ', correo: 'correo-invalido', tel: '' });

    expect(candidato).toBeNull();
    expect(pendiente).toHaveBeenCalledWith(expect.objectContaining({ uuid: 'uuid-1', participante: 'INQ', canal: 'EMAIL' }));
    expect(globalThis.EntregasLey2300_crearOReutilizar).toBeUndefined();
  });

  it('reclama antes de enviar y persiste aceptación individualmente', () => {
    const { lock, transiciones } = entorno({ ok: true, tipo: 'ACEPTADO', causa: '', statusCode: 201, messageId: 'm-1' });
    const resultado = _procesarEntregaLey2300_({ entrega: { entregaId: 'e-1' }, canal: 'EMAIL', email: 'ana@example.test', nombre: 'Ana', inmobiliaria: 'Inmo' }, lock);
    expect(resultado).toMatchObject({ ok: true, estado: 'ENVIADO' });
    expect(transiciones.map(transicion => transicion.estadoNuevo)).toEqual(['EN_PROCESO', 'ENVIADO']);
    expect(transiciones[1]).toMatchObject({ referenciaProveedor: 'm-1', codigoResultado: '201' });
  });

  it('deja una excepción ambigua en conciliación sin reintento', () => {
    const { lock, transiciones } = entorno({ ok: false, tipo: 'AMBIGUO', causa: 'AMBIGUO', statusCode: 0, messageId: '' });
    _procesarEntregaLey2300_({ entrega: { entregaId: 'e-1' }, canal: 'SMS', celular: '573001234567', nombre: 'Ana', inmobiliaria: 'Inmo' }, lock);
    expect(transiciones[1]).toMatchObject({ estadoNuevo: 'PENDIENTE_CONCILIACION', proximoIntentoEn: '' });
  });

  it('no vuelve a reclamar ni enviar una entrega ya aceptada', () => {
    const { lock } = entorno({ ok: true, tipo: 'ACEPTADO', causa: '', statusCode: 200, messageId: 'm-1' });
    let entrega = { entregaId: 'e-1', uuid: 'u-1', estado: 'PENDIENTE', version: 1, intentos: 0, maxIntentos: 3 };
    let invocaciones = 0;
    globalThis._enviarEmailInfobip = () => { invocaciones++; return { ok: true, tipo: 'ACEPTADO', causa: '', statusCode: 200, messageId: 'm-1' }; };
    globalThis.EntregasLey2300_obtenerPorId = () => entrega;
    globalThis.EntregasLey2300_actualizarEstado = comando => {
      entrega = { ...entrega, estado: comando.estadoNuevo, version: entrega.version + 1, intentos: comando.estadoNuevo === 'EN_PROCESO' ? 1 : entrega.intentos };
      return { ok: true, entrega };
    };
    const candidato = { entrega: { entregaId: 'e-1' }, canal: 'EMAIL', email: 'ana@example.test', nombre: 'Ana', inmobiliaria: 'Inmo' };
    expect(_procesarEntregaLey2300_(candidato, lock)).toMatchObject({ estado: 'ENVIADO' });
    expect(_procesarEntregaLey2300_(candidato, lock)).toBeNull();
    expect(invocaciones).toBe(1);
  });

  it('no reenvía cuando el segundo lock falla y deja la recuperación para la siguiente preparación', () => {
    const { transiciones } = entorno({ ok: true, tipo: 'ACEPTADO', causa: '', statusCode: 201, messageId: 'm-1' });
    const lock = { llamadas: 0, tryLock() { this.llamadas++; return this.llamadas === 1; }, releaseLock() {} };

    expect(_procesarEntregaLey2300_({ entrega: { entregaId: 'e-1' }, canal: 'EMAIL', email: 'ana@example.test', nombre: 'Ana', inmobiliaria: 'Inmo' }, lock)).toBeNull();
    expect(transiciones.map(transicion => transicion.estadoNuevo)).toEqual(['EN_PROCESO']);
  });

  it('fuerza conciliación con la versión vigente cuando falla la persistencia final', () => {
    const { lock } = entorno({ ok: true, tipo: 'ACEPTADO', causa: '', statusCode: 201, messageId: 'm-1' });
    globalThis.EntregasLey2300_actualizarEstado = comando => {
      if (comando.estadoNuevo === 'EN_PROCESO') return { ok: true, entrega: { entregaId: 'e-1', version: 2, intentos: 1, maxIntentos: 3 } };
      throw new Error('fallo final');
    };
    const conciliar = globalThis.EntregasLey2300_forzarConciliacion = vi.fn(() => ({ ok: true, entrega: { estado: 'PENDIENTE_CONCILIACION' } }));

    expect(_procesarEntregaLey2300_({ entrega: { entregaId: 'e-1' }, canal: 'EMAIL', email: 'ana@example.test', nombre: 'Ana', inmobiliaria: 'Inmo' }, lock)).toBeNull();
    expect(conciliar).toHaveBeenCalledWith('e-1', 'TRIGGER_LEY2300', 'FINALIZACION_PERSISTENCIA_FALLIDA');
  });

  it('incluye fallidos definitivos en el reporte administrativo', () => {
    entorno({ ok: true, tipo: 'ACEPTADO', causa: '', statusCode: 200, messageId: 'm-1' });
    globalThis._bloque_chips_ = chips => JSON.stringify(chips);

    expect(_construirCuerpoLey2300_({ contratos: 1, enviados: 1, fallidosDefinitivos: 2 })).toContain('Fallidos definitivos');
  });

  it('mantiene resultados persistidos cuando falla el reporte', () => {
    entorno({ ok: true, tipo: 'ACEPTADO', causa: '', statusCode: 200, messageId: 'm-1' });
    expect(() => _enviarReporteLey2300_({ seleccionadas: 1, contratos: 1, enviados: 1 })).not.toThrow();
  });
});
