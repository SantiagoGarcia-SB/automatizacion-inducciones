import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { readFileSync } from 'fs';
import { resolve } from 'path';

const smsSource = readFileSync(resolve(__dirname, '../../Servicios_InfobipSms.js'), 'utf8');
const emailSource = readFileSync(resolve(__dirname, '../../Servicios_InfobipEmail.js'), 'utf8');

function instalarEntorno(respuestas, baseUrl) {
  let indice = 0;
  globalThis.normalizarCelularLey2300 = valor => {
    const digitos = String(valor || '').replace(/\D/g, '');
    return /^3\d{9}$/.test(digitos) ? '57' + digitos : /^573\d{9}$/.test(digitos) ? digitos : '';
  };
  globalThis.normalizarCorreoLey2300 = valor => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(valor || '').trim()) ? String(valor).trim().toLowerCase() : '';
  let fetches = 0;
  let lecturasContenido = 0;
  const opcionesFetch = [];
  globalThis.PropertiesService = { getScriptProperties: () => ({ getProperty: clave => ({ INFOBIP_BASE_URL: baseUrl || 'https://api.infobip.com', INFOBIP_API_KEY: 'token', INFOBIP_SENDER: 'LEY', INFOBIP_EMAIL_FROM: 'no-reply@example.test', INFOBIP_EMAIL_TEMPLATE_ID: 'template' })[clave] || null }) };
  globalThis.UrlFetchApp = { fetch: (url, opciones) => {
    fetches++;
    opcionesFetch.push({ url, opciones });
    const respuesta = respuestas[indice++];
    if (respuesta instanceof Error) throw respuesta;
    return { getResponseCode: () => respuesta.code, getContentText: () => { lecturasContenido++; return respuesta.body || ''; } };
  } };
  globalThis.Utilities = { sleep: () => {} };
  globalThis._registrarEvento_ = () => {};
  eval(`(function(){${smsSource}\nglobalThis._normalizarUrlInfobipLey2300=_normalizarUrlInfobipLey2300;globalThis._sanearMessageIdInfobipLey2300=_sanearMessageIdInfobipLey2300;globalThis._enviarSmsInfobip=_enviarSmsInfobip;globalThis.procesarEnvioSmsLey2300=procesarEnvioSmsLey2300;})()`);
  eval(`(function(){${emailSource}\nglobalThis._enviarEmailInfobip=_enviarEmailInfobip;globalThis.procesarEnvioEmailLey2300=procesarEnvioEmailLey2300;})()`);
  return { fetches: () => fetches, lecturasContenido: () => lecturasContenido, opcionesFetch: () => opcionesFetch };
}

function limpiarEntorno() { ['normalizarCelularLey2300', 'normalizarCorreoLey2300', 'PropertiesService', 'UrlFetchApp', 'Utilities', '_registrarEvento_', '_normalizarUrlInfobipLey2300', '_sanearMessageIdInfobipLey2300', '_enviarSmsInfobip', 'procesarEnvioSmsLey2300', '_enviarEmailInfobip', 'procesarEnvioEmailLey2300'].forEach(nombre => delete globalThis[nombre]); }

describe('transportes Infobip Ley 2300', () => {
  afterEach(limpiarEntorno);

  it('normaliza SMS, conserva messageId y no retorna destino', () => {
    instalarEntorno([{ code: 201, body: '{"messages":[{"messageId":"sms-1"}]}' }]);
    const resultado = _enviarSmsInfobip({ celular: '+57 (300) 123-4567', nombre: 'Ana', inmobiliaria: 'Inmo' });
    expect(resultado).toMatchObject({ ok: true, statusCode: 201, messageId: 'sms-1' });
    expect(JSON.stringify(resultado)).not.toContain('3001234567');
  });

  it('conserva los subintentos 429 de email en un único resultado lógico', () => {
    instalarEntorno([{ code: 429 }, { code: 429 }, { code: 200, body: '{"messages":[{"messageId":"mail-1"}]}' }]);
    expect(_enviarEmailInfobip({ email: 'ana@example.test', nombre: 'Ana', inmobiliaria: 'Inmo' })).toMatchObject({ ok: true, subintentos: 2, messageId: 'mail-1' });
  });

  it('clasifica rechazo, temporal y excepción como resultados distintos', () => {
    instalarEntorno([{ code: 422 }, { code: 503 }, new Error('timeout')]);
    expect(_enviarEmailInfobip({ email: 'ana@example.test' }).causa).toBe('DATOS_CONTACTO');
    expect(_enviarEmailInfobip({ email: 'ana@example.test' }).causa).toBe('TEMPORAL');
    expect(_enviarEmailInfobip({ email: 'ana@example.test' })).toMatchObject({ tipo: 'AMBIGUO', causa: 'AMBIGUO' });
  });

  it('rechaza URL inseguras antes de enviar PII o la API key', () => {
    const invalidas = ['http://api.infobip.com', 'https://127.0.0.1', 'https://10.0.0.1', 'https://api.infobip.com:8443', 'https://usuario:clave@api.infobip.com', 'https://api.example.test'];
    invalidas.forEach(baseUrl => {
      const entorno = instalarEntorno([{ code: 201 }], baseUrl);
      expect(_enviarSmsInfobip({ celular: '3001234567', nombre: 'Ana', inmobiliaria: 'Inmo' })).toMatchObject({ ok: false, causa: 'CONFIGURACION' });
      expect(entorno.fetches()).toBe(0);
      limpiarEntorno();
    });
  });

  it('abre el circuito después de cinco fallos y no invoca entregas restantes', () => {
    instalarEntorno(Array.from({ length: 5 }, () => ({ code: 503 })));
    const entradas = Array.from({ length: 7 }, (_, indice) => ({ entregaId: `e-${indice}`, email: `u${indice}@example.test` }));
    const resultado = procesarEnvioEmailLey2300(entradas);
    expect(resultado.abortado).toBe(true);
    expect(resultado.resultados).toHaveLength(5);
  });

  it('no sigue redirecciones, no lee su contenido y las clasifica como configuración', () => {
    const entorno = instalarEntorno([
      { code: 302, body: '{"messages":[{"messageId":"redireccion-sms"}]}' },
      { code: 307, body: '{"messages":[{"messageId":"redireccion-email"}]}' }
    ]);

    expect(_enviarSmsInfobip({ celular: '3001234567' })).toMatchObject({ ok: false, causa: 'CONFIGURACION', statusCode: 302, messageId: '' });
    expect(_enviarEmailInfobip({ email: 'ana@example.test' })).toMatchObject({ ok: false, causa: 'CONFIGURACION', statusCode: 307, messageId: '' });
    expect(entorno.opcionesFetch().map(fetch => fetch.opciones.followRedirects)).toEqual([false, false]);
    expect(entorno.lecturasContenido()).toBe(0);
  });

  it('descarta messageId externos con PII, caracteres no permitidos o longitud excesiva', () => {
    instalarEntorno([
      { code: 201, body: '{"messages":[{"messageId":"ana@example.test"}]}' },
      { code: 201, body: '{"messages":[{"messageId":"300-123-4567"}]}' },
      { code: 200, body: '{"messages":[{"messageId":"id\\ninvalido"}]}' },
      { code: 200, body: JSON.stringify({ messages: [{ messageId: 'a'.repeat(257) }] }) }
    ]);

    expect(_enviarSmsInfobip({ celular: '3001234567' }).messageId).toBe('');
    expect(_enviarEmailInfobip({ email: 'ana@example.test' }).messageId).toBe('');
    expect(_enviarEmailInfobip({ email: 'ana@example.test' }).messageId).toBe('');
    expect(_enviarSmsInfobip({ celular: '3001234567' }).messageId).toBe('');
  });
});
