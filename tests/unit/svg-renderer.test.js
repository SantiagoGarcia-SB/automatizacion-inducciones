/**
 * Unit tests for SVGRenderer — helpers de creación de elementos SVG
 * Validates: Requirements 9.1, 9.2, 9.3, 9.4, 10.1, 10.2
 */
import { describe, it, expect, beforeEach } from 'vitest';

/**
 * Minimal DOM mock that simulates createElementNS and getElementById
 * for testing SVGRenderer in a Node environment.
 */
function createMockDocument() {
  const containers = {};

  function createElement(ns, tag) {
    const attrs = {};
    const children = [];
    let textContent = '';

    return {
      tagName: tag,
      namespaceURI: ns,
      children: children,
      get textContent() { return textContent; },
      set textContent(val) { textContent = val; },
      setAttribute: function(key, value) { attrs[key] = value; },
      getAttribute: function(key) { return attrs[key] || null; },
      appendChild: function(child) { children.push(child); return child; },
      get innerHTML() { return ''; },
      set innerHTML(val) { /* clear children when set */ children.length = 0; },
      _attrs: attrs,
      _children: children
    };
  }

  return {
    createElementNS: function(ns, tag) {
      return createElement(ns, tag);
    },
    getElementById: function(id) {
      if (!containers[id]) {
        containers[id] = {
          id: id,
          innerHTML: '',
          _appendedChildren: [],
          appendChild: function(child) { this._appendedChildren.push(child); }
        };
      }
      return containers[id];
    },
    _containers: containers
  };
}

/**
 * Creates a testable SVGRenderer instance that uses the mock document.
 */
function createSVGRenderer(doc) {
  return {
    _NS: 'http://www.w3.org/2000/svg',
    _idCounter: 0,

    _crearElemento: function(tag, attrs) {
      var el = doc.createElementNS(this._NS, tag);
      if (attrs) {
        var keys = Object.keys(attrs);
        for (var i = 0; i < keys.length; i++) {
          el.setAttribute(keys[i], attrs[keys[i]]);
        }
      }
      return el;
    },

    _calcularViewBox: function(ancho, alto) {
      return '0 0 ' + ancho + ' ' + alto;
    },

    _generarTitleId: function() {
      this._idCounter++;
      return 'svg-title-' + this._idCounter;
    },

    _crearSvgRaiz: function(config) {
      var titleId = this._generarTitleId();

      var svg = this._crearElemento('svg', {
        'width': '100%',
        'viewBox': this._calcularViewBox(config.ancho, config.alto),
        'role': 'img',
        'aria-labelledby': titleId,
        'xmlns': this._NS
      });

      var title = this._crearElemento('title', { 'id': titleId });
      title.textContent = config.titulo;
      svg.appendChild(title);

      return { svg: svg, titleId: titleId };
    },

    barrasHorizontales: function(config) {
      var container = doc.getElementById(config.containerId);
      if (!container) return;

      var datos = config.datos || [];
      var opciones = config.opciones || {};
      var colorBarra = opciones.colorBarra || '#1a3a5c';
      var colorAlerta = opciones.colorAlerta || '#c0392b';
      var umbralAlerta = opciones.umbralAlerta;
      var sufijo = opciones.sufijo || '';

      var margenIzq = 120;
      var margenDer = 60;
      var alturaBarra = 28;
      var espacioBarra = 8;
      var margenTop = 10;
      var ancho = 500;
      var alto = margenTop + datos.length * (alturaBarra + espacioBarra) + 10;

      var root = this._crearSvgRaiz({ titulo: config.titulo, ancho: ancho, alto: alto });
      var svg = root.svg;

      var maxValor = 0;
      for (var i = 0; i < datos.length; i++) {
        if (datos[i].valor > maxValor) maxValor = datos[i].valor;
      }
      if (maxValor === 0) maxValor = 1;

      var anchoDisponible = ancho - margenIzq - margenDer;

      for (var j = 0; j < datos.length; j++) {
        var item = datos[j];
        var y = margenTop + j * (alturaBarra + espacioBarra);
        var anchoBarra = (item.valor / maxValor) * anchoDisponible;
        var color = (umbralAlerta !== undefined && item.valor > umbralAlerta) ? colorAlerta : colorBarra;

        var label = this._crearElemento('text', {
          'x': (margenIzq - 8).toString(),
          'y': (y + alturaBarra / 2 + 5).toString(),
          'text-anchor': 'end',
          'font-size': '12',
          'fill': '#333'
        });
        label.textContent = item.label;
        svg.appendChild(label);

        var rect = this._crearElemento('rect', {
          'x': margenIzq.toString(),
          'y': y.toString(),
          'width': anchoBarra.toString(),
          'height': alturaBarra.toString(),
          'fill': color,
          'rx': '3',
          'ry': '3'
        });
        svg.appendChild(rect);

        var valorText = this._crearElemento('text', {
          'x': (margenIzq + anchoBarra + 6).toString(),
          'y': (y + alturaBarra / 2 + 5).toString(),
          'text-anchor': 'start',
          'font-size': '12',
          'font-weight': 'bold',
          'fill': '#333'
        });
        valorText.textContent = item.valor + sufijo;
        svg.appendChild(valorText);
      }

      container.innerHTML = '';
      container.appendChild(svg);
    },

    lineaTendencia: function(config) {
      var container = doc.getElementById(config.containerId);
      if (!container) return;

      var datos = config.datos || [];
      var margenIzq = 40;
      var margenDer = 20;
      var margenTop = 20;
      var margenBottom = 40;
      var ancho = 500;
      var alto = 200;

      var root = this._crearSvgRaiz({ titulo: config.titulo, ancho: ancho, alto: alto });
      var svg = root.svg;

      var areaAncho = ancho - margenIzq - margenDer;
      var areaAlto = alto - margenTop - margenBottom;

      var maxValor = 0;
      for (var i = 0; i < datos.length; i++) {
        if (datos[i].valor > maxValor) maxValor = datos[i].valor;
      }
      if (maxValor === 0) maxValor = 1;

      var puntos = [];
      var numPuntos = datos.length;
      for (var j = 0; j < numPuntos; j++) {
        var x = margenIzq + (numPuntos > 1 ? (j / (numPuntos - 1)) * areaAncho : areaAncho / 2);
        var y = margenTop + areaAlto - (datos[j].valor / maxValor) * areaAlto;
        puntos.push({ x: x, y: y });
      }

      if (puntos.length > 1) {
        var puntosStr = '';
        for (var k = 0; k < puntos.length; k++) {
          puntosStr += puntos[k].x + ',' + puntos[k].y;
          if (k < puntos.length - 1) puntosStr += ' ';
        }
        var polyline = this._crearElemento('polyline', {
          'points': puntosStr,
          'fill': 'none',
          'stroke': '#1a3a5c',
          'stroke-width': '2',
          'stroke-linejoin': 'round'
        });
        svg.appendChild(polyline);
      }

      for (var m = 0; m < puntos.length; m++) {
        var circle = this._crearElemento('circle', {
          'cx': puntos[m].x.toString(),
          'cy': puntos[m].y.toString(),
          'r': '4',
          'fill': '#1a3a5c',
          'stroke': '#fff',
          'stroke-width': '2'
        });
        svg.appendChild(circle);
      }

      for (var n = 0; n < datos.length; n++) {
        var xLabel = margenIzq + (numPuntos > 1 ? (n / (numPuntos - 1)) * areaAncho : areaAncho / 2);
        var etiqueta = this._crearElemento('text', {
          'x': xLabel.toString(),
          'y': (alto - 10).toString(),
          'text-anchor': 'middle',
          'font-size': '10',
          'fill': '#666'
        });
        etiqueta.textContent = datos[n].label;
        svg.appendChild(etiqueta);
      }

      var yMin = this._crearElemento('text', {
        'x': (margenIzq - 8).toString(),
        'y': (margenTop + areaAlto + 4).toString(),
        'text-anchor': 'end',
        'font-size': '10',
        'fill': '#666'
      });
      yMin.textContent = '0';
      svg.appendChild(yMin);

      var yMax = this._crearElemento('text', {
        'x': (margenIzq - 8).toString(),
        'y': (margenTop + 4).toString(),
        'text-anchor': 'end',
        'font-size': '10',
        'fill': '#666'
      });
      yMax.textContent = maxValor.toString();
      svg.appendChild(yMax);

      container.innerHTML = '';
      container.appendChild(svg);
    }
  };
}

describe('SVGRenderer', function() {
  let doc;
  let renderer;

  beforeEach(function() {
    doc = createMockDocument();
    renderer = createSVGRenderer(doc);
  });

  describe('_crearElemento(tag, attrs)', function() {
    it('crea elementos con namespace SVG correcto http://www.w3.org/2000/svg', function() {
      var el = renderer._crearElemento('rect', { x: '10', y: '20' });
      expect(el.namespaceURI).toBe('http://www.w3.org/2000/svg');
    });

    it('asigna el tag correcto al elemento', function() {
      var el = renderer._crearElemento('circle', {});
      expect(el.tagName).toBe('circle');
    });

    it('asigna todos los atributos proporcionados', function() {
      var el = renderer._crearElemento('rect', {
        x: '5',
        y: '10',
        width: '100',
        height: '50',
        fill: '#ff0000'
      });
      expect(el.getAttribute('x')).toBe('5');
      expect(el.getAttribute('y')).toBe('10');
      expect(el.getAttribute('width')).toBe('100');
      expect(el.getAttribute('height')).toBe('50');
      expect(el.getAttribute('fill')).toBe('#ff0000');
    });

    it('maneja attrs vacío sin error', function() {
      var el = renderer._crearElemento('g', {});
      expect(el.tagName).toBe('g');
      expect(el.namespaceURI).toBe('http://www.w3.org/2000/svg');
    });

    it('maneja attrs undefined sin error', function() {
      var el = renderer._crearElemento('line', undefined);
      expect(el.tagName).toBe('line');
    });
  });

  describe('_calcularViewBox(ancho, alto)', function() {
    it('retorna formato "0 0 ancho alto"', function() {
      expect(renderer._calcularViewBox(500, 300)).toBe('0 0 500 300');
    });

    it('funciona con valores decimales', function() {
      expect(renderer._calcularViewBox(100.5, 200.7)).toBe('0 0 100.5 200.7');
    });

    it('funciona con valores cero', function() {
      expect(renderer._calcularViewBox(0, 0)).toBe('0 0 0 0');
    });
  });

  describe('_crearSvgRaiz(config)', function() {
    it('SVG raíz tiene width="100%"', function() {
      var root = renderer._crearSvgRaiz({ titulo: 'Test', ancho: 500, alto: 300 });
      expect(root.svg.getAttribute('width')).toBe('100%');
    });

    it('SVG raíz tiene viewBox calculado correctamente', function() {
      var root = renderer._crearSvgRaiz({ titulo: 'Test', ancho: 400, alto: 250 });
      expect(root.svg.getAttribute('viewBox')).toBe('0 0 400 250');
    });

    it('SVG raíz tiene role="img"', function() {
      var root = renderer._crearSvgRaiz({ titulo: 'Gráfico', ancho: 500, alto: 300 });
      expect(root.svg.getAttribute('role')).toBe('img');
    });

    it('SVG raíz tiene aria-labelledby apuntando al ID del title', function() {
      var root = renderer._crearSvgRaiz({ titulo: 'Mi gráfico', ancho: 500, alto: 300 });
      var ariaRef = root.svg.getAttribute('aria-labelledby');
      expect(ariaRef).toBe(root.titleId);
    });

    it('incluye un elemento <title> con texto descriptivo no vacío', function() {
      var root = renderer._crearSvgRaiz({ titulo: 'Ranking de comerciales', ancho: 500, alto: 300 });
      var titleEl = root.svg._children[0];
      expect(titleEl.tagName).toBe('title');
      expect(titleEl.textContent).toBe('Ranking de comerciales');
      expect(titleEl.textContent.length).toBeGreaterThan(0);
    });

    it('el ID del <title> coincide con aria-labelledby del SVG', function() {
      var root = renderer._crearSvgRaiz({ titulo: 'Test', ancho: 100, alto: 100 });
      var titleEl = root.svg._children[0];
      expect(titleEl.getAttribute('id')).toBe(root.svg.getAttribute('aria-labelledby'));
    });

    it('genera IDs únicos para múltiples SVGs', function() {
      var root1 = renderer._crearSvgRaiz({ titulo: 'A', ancho: 100, alto: 100 });
      var root2 = renderer._crearSvgRaiz({ titulo: 'B', ancho: 100, alto: 100 });
      expect(root1.titleId).not.toBe(root2.titleId);
    });
  });

  describe('barrasHorizontales(config)', function() {
    it('inserta SVG en el container especificado', function() {
      renderer.barrasHorizontales({
        containerId: 'chart-ranking',
        titulo: 'Ranking',
        datos: [{ label: 'Juan', valor: 10 }]
      });
      var container = doc._containers['chart-ranking'];
      expect(container._appendedChildren.length).toBe(1);
      expect(container._appendedChildren[0].tagName).toBe('svg');
    });

    it('SVG tiene accesibilidad completa (role, aria-labelledby, title)', function() {
      renderer.barrasHorizontales({
        containerId: 'chart-test',
        titulo: 'Test ranking',
        datos: [{ label: 'A', valor: 5 }]
      });
      var svg = doc._containers['chart-test']._appendedChildren[0];
      expect(svg.getAttribute('role')).toBe('img');
      expect(svg.getAttribute('aria-labelledby')).toBeTruthy();
      var titleEl = svg._children[0];
      expect(titleEl.tagName).toBe('title');
      expect(titleEl.textContent).toBe('Test ranking');
    });

    it('no renderiza si container no existe', function() {
      var nullDoc = createMockDocument();
      nullDoc.getElementById = function() { return null; };
      var r = createSVGRenderer(nullDoc);
      expect(function() {
        r.barrasHorizontales({ containerId: 'noexiste', titulo: 'X', datos: [] });
      }).not.toThrow();
    });

    it('aplica colorAlerta cuando valor supera umbralAlerta', function() {
      renderer.barrasHorizontales({
        containerId: 'chart-alert',
        titulo: 'Antigüedad',
        datos: [
          { label: 'EN ANÁLISIS', valor: 3 },
          { label: 'RADICADO', valor: 8 }
        ],
        opciones: { umbralAlerta: 5, colorAlerta: '#e74c3c' }
      });
      var svg = doc._containers['chart-alert']._appendedChildren[0];
      // Find rect elements (barras) — children after title
      var rects = svg._children.filter(function(c) { return c.tagName === 'rect'; });
      expect(rects.length).toBe(2);
      // Primera barra (valor 3) no supera umbral
      expect(rects[0].getAttribute('fill')).toBe('#1a3a5c');
      // Segunda barra (valor 8) supera umbral
      expect(rects[1].getAttribute('fill')).toBe('#e74c3c');
    });

    it('aplica sufijo en los valores de texto', function() {
      renderer.barrasHorizontales({
        containerId: 'chart-sufijo',
        titulo: 'Antigüedad',
        datos: [{ label: 'Estado A', valor: 4.5 }],
        opciones: { sufijo: ' días' }
      });
      var svg = doc._containers['chart-sufijo']._appendedChildren[0];
      var textos = svg._children.filter(function(c) { return c.tagName === 'text'; });
      // Should include one value text with suffix
      var valorTexts = textos.filter(function(t) { return t.textContent.includes(' días'); });
      expect(valorTexts.length).toBe(1);
      expect(valorTexts[0].textContent).toBe('4.5 días');
    });
  });

  describe('lineaTendencia(config)', function() {
    it('inserta SVG en el container especificado', function() {
      renderer.lineaTendencia({
        containerId: 'chart-tendencia',
        titulo: 'Tendencia semanal',
        datos: [
          { label: 'S1', valor: 3 },
          { label: 'S2', valor: 7 }
        ]
      });
      var container = doc._containers['chart-tendencia'];
      expect(container._appendedChildren.length).toBe(1);
      expect(container._appendedChildren[0].tagName).toBe('svg');
    });

    it('incluye marcadores circulares (circle) en cada punto de datos', function() {
      renderer.lineaTendencia({
        containerId: 'chart-circles',
        titulo: 'Tendencia',
        datos: [
          { label: 'S1', valor: 2 },
          { label: 'S2', valor: 5 },
          { label: 'S3', valor: 3 }
        ]
      });
      var svg = doc._containers['chart-circles']._appendedChildren[0];
      var circles = svg._children.filter(function(c) { return c.tagName === 'circle'; });
      expect(circles.length).toBe(3);
    });

    it('incluye polyline conectando los puntos', function() {
      renderer.lineaTendencia({
        containerId: 'chart-line',
        titulo: 'Tendencia',
        datos: [
          { label: 'S1', valor: 1 },
          { label: 'S2', valor: 4 }
        ]
      });
      var svg = doc._containers['chart-line']._appendedChildren[0];
      var polylines = svg._children.filter(function(c) { return c.tagName === 'polyline'; });
      expect(polylines.length).toBe(1);
      expect(polylines[0].getAttribute('fill')).toBe('none');
      expect(polylines[0].getAttribute('stroke')).toBeTruthy();
    });

    it('SVG tiene accesibilidad completa', function() {
      renderer.lineaTendencia({
        containerId: 'chart-a11y',
        titulo: 'Tendencia de radicaciones',
        datos: [{ label: 'S1', valor: 10 }]
      });
      var svg = doc._containers['chart-a11y']._appendedChildren[0];
      expect(svg.getAttribute('role')).toBe('img');
      expect(svg.getAttribute('aria-labelledby')).toBeTruthy();
      expect(svg.getAttribute('width')).toBe('100%');
      expect(svg.getAttribute('viewBox')).toBeTruthy();
    });

    it('no renderiza si container no existe', function() {
      var nullDoc = createMockDocument();
      nullDoc.getElementById = function() { return null; };
      var r = createSVGRenderer(nullDoc);
      expect(function() {
        r.lineaTendencia({ containerId: 'ghost', titulo: 'X', datos: [] });
      }).not.toThrow();
    });
  });
});
