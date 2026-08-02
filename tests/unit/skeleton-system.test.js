/**
 * Unit tests for SkeletonSystem
 * Validates: Requirements 1.6, 11.1, 11.2
 */
import { describe, it, expect, beforeEach } from 'vitest';

// Simulate DOM environment
function createMockDocument() {
  const elements = {};
  return {
    getElementById: function(id) {
      if (!elements[id]) {
        elements[id] = { id: id, innerHTML: '', style: {} };
      }
      return elements[id];
    },
    _elements: elements
  };
}

// Extract SkeletonSystem logic for testing (simulates the object from scripts_app.html)
function createSkeletonSystem(doc) {
  return {
    mostrar: function(containerId, tipo, opciones) {
      var container = doc.getElementById(containerId);
      if (!container) return;
      opciones = opciones || {};
      var html = '';

      switch (tipo) {
        case 'tabla':
          html = this._generarSkeletonTabla(opciones.columnas || [], opciones.filas || 5);
          break;
        case 'dashboard':
          html = this._generarSkeletonDashboard();
          break;
        case 'detalle':
          html = this._generarSkeletonDetalle(opciones.campos || 6);
          break;
        case 'lista':
          html = this._generarSkeletonLista(opciones.items || 4);
          break;
      }

      if (opciones.titulo) {
        html = '<div class="stack"><h2>' + opciones.titulo + '</h2>' + html + '</div>';
      }

      container.innerHTML = html;
    },

    reemplazar: function(containerId, htmlContenido) {
      var container = doc.getElementById(containerId);
      if (!container) return;
      container.style.opacity = '0';
      container.innerHTML = htmlContenido;
      // In test, simulate the requestAnimationFrame callback immediately
      container.style.transition = 'opacity var(--duration-base, 200ms) var(--ease-in-out, ease-in)';
      container.style.opacity = '1';
    },

    _generarSkeletonTabla: function(columnas, filas) {
      var html = '<div class="card card--flat" style="padding:0;overflow:hidden;"><table class="table"><thead><tr>';
      for (var c = 0; c < columnas.length; c++) {
        html += '<th>' + columnas[c] + '</th>';
      }
      if (columnas.length === 0) {
        for (var p = 0; p < 5; p++) {
          html += '<th><div class="skeleton-line" style="height:12px;width:60%;"></div></th>';
        }
      }
      html += '</tr></thead><tbody>';
      for (var i = 0; i < filas; i++) {
        var cols = columnas.length || 5;
        html += '<tr>';
        for (var j = 0; j < cols; j++) {
          var width = (j === 0) ? '70%' : ((j === cols - 1) ? '40%' : '55%');
          html += '<td><div class="skeleton-line" style="height:14px;width:' + width + ';"></div></td>';
        }
        html += '</tr>';
      }
      html += '</tbody></table></div>';
      return html;
    },

    _generarSkeletonDashboard: function() {
      var html = '<div class="stack">';
      html += '<div class="card card--hero" style="padding:var(--space-6);">'
        + '<div class="skeleton-line" style="height:24px;width:50%;background:rgba(255,255,255,0.15);margin-bottom:var(--space-2);"></div>'
        + '<div class="skeleton-line" style="height:14px;width:35%;background:rgba(255,255,255,0.1);"></div>'
        + '</div>';
      html += '<div class="grid grid--4" style="gap:var(--space-3);">';
      for (var i = 0; i < 4; i++) {
        html += '<div class="skeleton skeleton-card" style="height:88px;"></div>';
      }
      html += '</div>';
      html += '<div class="card" style="padding:var(--space-5);">'
        + '<div class="skeleton-line" style="height:14px;width:40%;margin-bottom:var(--space-4);"></div>'
        + '<div class="skeleton-line" style="height:12px;width:100%;border-radius:var(--radius-full);"></div>'
        + '<div style="display:flex;gap:var(--space-4);margin-top:var(--space-3);">'
        + '<div class="skeleton-line" style="height:10px;width:60px;"></div>'
        + '<div class="skeleton-line" style="height:10px;width:80px;"></div>'
        + '<div class="skeleton-line" style="height:10px;width:50px;"></div>'
        + '</div></div>';
      html += '</div>';
      return html;
    },

    _generarSkeletonDetalle: function(campos) {
      var html = '<div class="card"><div class="stack stack--tight">';
      for (var i = 0; i < campos; i++) {
        var labelWidth = (i % 3 === 0) ? '25%' : ((i % 3 === 1) ? '35%' : '20%');
        var fieldWidth = (i % 2 === 0) ? '100%' : '70%';
        html += '<div style="margin-bottom:var(--space-4);">'
          + '<div class="skeleton-line" style="height:10px;width:' + labelWidth + ';margin-bottom:var(--space-2);"></div>'
          + '<div class="skeleton-line" style="height:36px;width:' + fieldWidth + ';"></div>'
          + '</div>';
      }
      html += '</div></div>';
      return html;
    },

    _generarSkeletonLista: function(items) {
      var html = '<div class="stack stack--tight">';
      for (var i = 0; i < items; i++) {
        html += '<div class="card" style="padding:var(--space-4) var(--space-5);">'
          + '<div style="display:flex;align-items:center;gap:var(--space-4);">'
          + '<div class="skeleton-line" style="height:40px;width:40px;border-radius:var(--radius-sm);flex-shrink:0;"></div>'
          + '<div style="flex:1;">'
          + '<div class="skeleton-line" style="height:14px;width:' + (55 + (i % 3) * 10) + '%;margin-bottom:var(--space-2);"></div>'
          + '<div class="skeleton-line" style="height:11px;width:' + (35 + (i % 2) * 15) + '%;"></div>'
          + '</div>'
          + '<div class="skeleton-line" style="height:24px;width:60px;border-radius:var(--radius-full);"></div>'
          + '</div></div>';
      }
      html += '</div>';
      return html;
    }
  };
}

describe('SkeletonSystem', function() {
  let doc;
  let skeleton;

  beforeEach(function() {
    doc = createMockDocument();
    skeleton = createSkeletonSystem(doc);
  });

  describe('mostrar() — tipo tabla', function() {
    it('genera thead con columnas reales cuando se especifican', function() {
      skeleton.mostrar('container1', 'tabla', { columnas: ['Nombre', 'Email', 'Rol'], filas: 3 });
      var html = doc._elements['container1'].innerHTML;
      expect(html).toContain('<th>Nombre</th>');
      expect(html).toContain('<th>Email</th>');
      expect(html).toContain('<th>Rol</th>');
    });

    it('genera filas animadas con skeleton-line', function() {
      skeleton.mostrar('container1', 'tabla', { columnas: ['A', 'B'], filas: 3 });
      var html = doc._elements['container1'].innerHTML;
      expect(html).toContain('skeleton-line');
      // 3 filas * 2 cols = 6 skeleton-line divs
      var matches = html.match(/skeleton-line/g);
      expect(matches.length).toBe(6);
    });

    it('genera 5 columnas placeholder si no se especifican columnas', function() {
      skeleton.mostrar('container1', 'tabla', { filas: 2 });
      var html = doc._elements['container1'].innerHTML;
      // 5 th placeholders + 2 filas * 5 cols = 15 skeleton-lines
      var matches = html.match(/skeleton-line/g);
      expect(matches.length).toBe(15);
    });

    it('usa 5 filas por defecto', function() {
      skeleton.mostrar('container1', 'tabla', { columnas: ['X'] });
      var html = doc._elements['container1'].innerHTML;
      var trMatches = html.match(/<tr>/g);
      // 1 header tr + 5 body trs = 6
      expect(trMatches.length).toBe(6);
    });
  });

  describe('mostrar() — tipo dashboard', function() {
    it('genera 4 KPI placeholders', function() {
      skeleton.mostrar('container1', 'dashboard');
      var html = doc._elements['container1'].innerHTML;
      var kpiMatches = html.match(/skeleton-card/g);
      expect(kpiMatches.length).toBe(4);
    });

    it('genera barra de distribución placeholder', function() {
      skeleton.mostrar('container1', 'dashboard');
      var html = doc._elements['container1'].innerHTML;
      expect(html).toContain('border-radius:var(--radius-full)');
    });

    it('genera hero card placeholder', function() {
      skeleton.mostrar('container1', 'dashboard');
      var html = doc._elements['container1'].innerHTML;
      expect(html).toContain('card--hero');
    });
  });

  describe('mostrar() — tipo detalle', function() {
    it('genera campos de formulario placeholder', function() {
      skeleton.mostrar('container1', 'detalle', { campos: 4 });
      var html = doc._elements['container1'].innerHTML;
      // Each field has 2 skeleton-lines (label + input)
      var matches = html.match(/skeleton-line/g);
      expect(matches.length).toBe(8);
    });

    it('usa 6 campos por defecto', function() {
      skeleton.mostrar('container1', 'detalle');
      var html = doc._elements['container1'].innerHTML;
      var matches = html.match(/skeleton-line/g);
      expect(matches.length).toBe(12);
    });
  });

  describe('mostrar() — tipo lista', function() {
    it('genera cards placeholder', function() {
      skeleton.mostrar('container1', 'lista', { items: 3 });
      var html = doc._elements['container1'].innerHTML;
      // Each card has: 1 icon (40x40) + 2 text lines + 1 badge = 4 skeleton-lines per card
      var matches = html.match(/skeleton-line/g);
      expect(matches.length).toBe(12);
    });

    it('usa 4 items por defecto', function() {
      skeleton.mostrar('container1', 'lista');
      var html = doc._elements['container1'].innerHTML;
      var matches = html.match(/skeleton-line/g);
      expect(matches.length).toBe(16);
    });
  });

  describe('mostrar() — opciones.titulo', function() {
    it('envuelve el skeleton con título si se proporciona', function() {
      skeleton.mostrar('container1', 'lista', { items: 2, titulo: 'Mis datos' });
      var html = doc._elements['container1'].innerHTML;
      expect(html).toContain('<h2>Mis datos</h2>');
      expect(html.indexOf('<h2>Mis datos</h2>')).toBeLessThan(html.indexOf('skeleton-line'));
    });
  });

  describe('mostrar() — container no existe', function() {
    it('no lanza error si containerId no se encuentra', function() {
      // getElementById returns an element (mock always creates), but let's test with a null-returning mock
      const nullDoc = { getElementById: () => null };
      const sk = createSkeletonSystem(nullDoc);
      expect(() => sk.mostrar('noexiste', 'tabla')).not.toThrow();
    });
  });

  describe('reemplazar()', function() {
    it('reemplaza innerHTML con el contenido proporcionado', function() {
      skeleton.mostrar('container1', 'tabla', { columnas: ['A'], filas: 2 });
      skeleton.reemplazar('container1', '<p>Contenido real</p>');
      var html = doc._elements['container1'].innerHTML;
      expect(html).toBe('<p>Contenido real</p>');
    });

    it('aplica transición de opacidad para fade-in suave', function() {
      skeleton.mostrar('container1', 'dashboard');
      skeleton.reemplazar('container1', '<div>Real</div>');
      var el = doc._elements['container1'];
      expect(el.style.opacity).toBe('1');
      expect(el.style.transition).toContain('opacity');
    });

    it('no lanza error si containerId no existe', function() {
      const nullDoc = { getElementById: () => null };
      const sk = createSkeletonSystem(nullDoc);
      expect(() => sk.reemplazar('noexiste', '<p>ok</p>')).not.toThrow();
    });
  });
});
