import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { readFileSync } from 'fs';
import { resolve } from 'path';

const source = readFileSync(resolve(__dirname, '../../scripts_app.html'), 'utf-8');
const inicio = source.indexOf('function _escHtml');
const fin = source.indexOf('// Abre un modal con las filas que tienen errores', inicio);
const seccionEntregas = source.slice(inicio, fin);

function cargarUtilidades() {
  globalThis.CacheManager = {
    _store: {},
    invalidar: vi.fn(function(claves) {
      const lista = typeof claves === 'string' ? [claves] : claves;
      lista.forEach(clave => delete this._store[clave]);
    })
  };
  eval(`(function() { ${seccionEntregas}\nglobalThis._escHtmlLey2300 = _escHtml; globalThis._invalidarCacheEntregasLey2300 = _invalidarCacheEntregasLey2300; })()`);
}

function limpiarUtilidades() {
  ['CacheManager', '_escHtmlLey2300', '_invalidarCacheEntregasLey2300'].forEach(name => delete globalThis[name]);
}

describe('utilidades UI de entregas Ley 2300', () => {
  beforeEach(cargarUtilidades);
  afterEach(limpiarUtilidades);

  it('escapa texto y atributos de datos antes de insertarlos en HTML', () => {
    expect(_escHtmlLey2300('<img src=x onerror=alert(1)>"\'&')).toBe('&lt;img src=x onerror=alert(1)&gt;&quot;&#39;&amp;');
    expect(seccionEntregas).toContain('data-entrega-id="\' + _escHtml(entrega.entregaId) + \'"');
    expect(seccionEntregas).toContain('data-lote-id="\' + _escHtml(entrega.idLote) + \'"');
  });

  it('invalida las páginas, detalles y lotes solo después de la confirmación del servidor', () => {
    CacheManager._store = {
      'entregas-ley-2300:1:{}': { data: {} },
      'entrega-ley-2300-detalle:entrega-1': { data: {} },
      lotes: { data: {} },
      dashboard: { data: {} },
      usuarios: { data: {} }
    };

    _invalidarCacheEntregasLey2300();

    expect(CacheManager._store['entregas-ley-2300:1:{}']).toBeUndefined();
    expect(CacheManager._store['entrega-ley-2300-detalle:entrega-1']).toBeUndefined();
    expect(CacheManager._store.lotes).toBeUndefined();
    expect(CacheManager._store.dashboard).toBeUndefined();
    expect(CacheManager._store.usuarios).toBeTruthy();
  });

  it('mantiene la corrección guiada sin retry, sin mutación optimista y con bloqueo de doble envío', () => {
    expect(seccionEntregas).toContain("boton.disabled = true;");
    expect(seccionEntregas).toContain("callServer('api_corregirContactoLey2300'");
    expect(seccionEntregas).toContain("if (!resultado || !resultado.ok) {");
    expect(seccionEntregas).not.toContain('OptimisticUpdater');
    expect(seccionEntregas).not.toContain('retry');
  });

  it('inicia y restablece la bandeja en pendientes con una opción explícita de histórico', () => {
    expect(seccionEntregas).toContain("soloPendientes: true");
    expect(seccionEntregas).toContain('id="entregasFiltroAlcance"');
    expect(seccionEntregas).toContain('Todos los registros no eliminados');
    expect(seccionEntregas).toContain("soloPendientes: String((document.getElementById('entregasFiltroAlcance') || {}).value || 'pendientes') !== 'todos'");
  });

  it('renderiza filtros allowlisted y una agenda estimada sin interpolar HTML inseguro', () => {
    expect(seccionEntregas).toContain("id=\"entregasFiltroParticipante\"");
    expect(seccionEntregas).toContain("id=\"entregasFiltroCanal\"");
    expect(seccionEntregas).toContain("id=\"entregasFiltroFechaDesde\"");
    expect(seccionEntregas).toContain("api_obtenerResumenEntregasLey2300");
    expect(seccionEntregas).toContain('Apps Script puede variar');
  });

  it('registra el menú y navegación de la bandeja exclusivamente bajo ADMIN', () => {
    const bloqueAdmin = source.slice(source.indexOf('ADMIN: ['), source.indexOf('ASESOR: ['));
    const bloqueAsesor = source.slice(source.indexOf('ASESOR: ['), source.indexOf('};', source.indexOf('ASESOR: [')));
    expect(bloqueAdmin).toContain("{ id: 'entregas-ley-2300'");
    expect(bloqueAsesor).not.toContain("entregas-ley-2300");
    expect(source).toContain("case 'entregas-ley-2300':");
  });
});
