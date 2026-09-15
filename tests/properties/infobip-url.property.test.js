import { afterEach, describe, expect, it } from 'vitest';
import fc from 'fast-check';
import { readFileSync } from 'fs';
import { resolve } from 'path';

const source = readFileSync(resolve(__dirname, '../../Servicios_InfobipSms.js'), 'utf8');

function cargar() {
  eval(`(function(){${source}\nglobalThis._normalizarUrlInfobipLey2300=_normalizarUrlInfobipLey2300;})()`);
}

afterEach(() => delete globalThis._normalizarUrlInfobipLey2300);

describe('propiedad de seguridad de URL Infobip', () => {
  it('nunca normaliza hosts que no pertenecen a la allowlist oficial', () => {
    cargar();
    fc.assert(fc.property(fc.domain(), host => {
      const resultado = _normalizarUrlInfobipLey2300(`https://${host}`);
      return !resultado || /^https:\/\/(?:[a-z0-9-]+\.)*api\.infobip\.com$/.test(resultado);
    }), { numRuns: 100 });
  });

  it('rechaza cualquier puerto diferente de HTTPS estándar', () => {
    cargar();
    fc.assert(fc.property(fc.integer({ min: 1, max: 65535 }).filter(port => port !== 443), port => {
      return _normalizarUrlInfobipLey2300(`https://api.infobip.com:${port}`) === '';
    }), { numRuns: 100 });
  });
});
