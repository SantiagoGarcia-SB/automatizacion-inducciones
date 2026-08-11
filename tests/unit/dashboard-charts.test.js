/**
 * Unit tests for DashboardCharts._calcularTendencia and _calcularAntiguedad
 * Validates: Requirements 7.2, 7.3, 8.2, 8.3
 */
import { describe, it, expect, beforeEach } from 'vitest';

/**
 * Creates a testable DashboardCharts instance with the same logic
 * as the HTML module (scripts_dashboardCharts.html).
 */
function createDashboardCharts() {
  return {
    _ESTADOS_RADICADO_O_POSTERIOR: [
      'RADICADO',
      'EN ANÁLISIS',
      'PENDIENTE PAZ Y SALVO',
      'TERMINADO',
      'PAZ Y SALVO',
      'DESISTIDO',
      'REGISTRADO'
    ],

    _parsearFecha: function(fechaStr) {
      if (!fechaStr || typeof fechaStr !== 'string') return null;

      var partes = fechaStr.trim().split(' ');
      if (partes.length < 2) return null;

      var fechaParts = partes[0].split('/');
      if (fechaParts.length !== 3) return null;

      var dia = parseInt(fechaParts[0], 10);
      var mes = parseInt(fechaParts[1], 10) - 1;
      var anio = parseInt(fechaParts[2], 10);

      var horaParts = partes[1].split(':');
      if (horaParts.length < 2) return null;

      var hora = parseInt(horaParts[0], 10);
      var minuto = parseInt(horaParts[1], 10);

      if (isNaN(dia) || isNaN(mes) || isNaN(anio) || isNaN(hora) || isNaN(minuto)) return null;
      if (mes < 0 || mes > 11 || dia < 1 || dia > 31) return null;
      if (hora < 0 || hora > 23 || minuto < 0 || minuto > 59) return null;

      var fecha = new Date(anio, mes, dia, hora, minuto, 0, 0);

      if (fecha.getFullYear() !== anio || fecha.getMonth() !== mes || fecha.getDate() !== dia) {
        return null;
      }

      return fecha;
    },

    _calcularTendencia: function(lotes) {
      var ahora = new Date();
      var semanas = this._obtenerUltimas8Semanas(ahora);
      var resultados = [];

      for (var i = 0; i < semanas.length; i++) {
        resultados.push({ label: semanas[i].label, valor: 0 });
      }

      if (!lotes || !lotes.length) return resultados;

      for (var j = 0; j < lotes.length; j++) {
        var lote = lotes[j];

        if (!this._esEstadoRadicadoOPosterior(lote.estadoPrincipal)) continue;

        var fechaLote = this._parsearFecha(lote.fecha);
        if (!fechaLote) continue;

        var tiempoLote = fechaLote.getTime();
        for (var k = 0; k < semanas.length; k++) {
          if (tiempoLote >= semanas[k].inicio.getTime() && tiempoLote <= semanas[k].fin.getTime()) {
            resultados[k].valor++;
            break;
          }
        }
      }

      return resultados;
    },

    /**
     * Version with injectable "now" for deterministic testing.
     */
    _calcularTendenciaConFecha: function(lotes, fechaReferencia) {
      var semanas = this._obtenerUltimas8Semanas(fechaReferencia);
      var resultados = [];

      for (var i = 0; i < semanas.length; i++) {
        resultados.push({ label: semanas[i].label, valor: 0 });
      }

      if (!lotes || !lotes.length) return resultados;

      for (var j = 0; j < lotes.length; j++) {
        var lote = lotes[j];

        if (!this._esEstadoRadicadoOPosterior(lote.estadoPrincipal)) continue;

        var fechaLote = this._parsearFecha(lote.fecha);
        if (!fechaLote) continue;

        var tiempoLote = fechaLote.getTime();
        for (var k = 0; k < semanas.length; k++) {
          if (tiempoLote >= semanas[k].inicio.getTime() && tiempoLote <= semanas[k].fin.getTime()) {
            resultados[k].valor++;
            break;
          }
        }
      }

      return resultados;
    },

    _obtenerUltimas8Semanas: function(referencia) {
      var hoy = new Date(referencia.getFullYear(), referencia.getMonth(), referencia.getDate());
      var diaSemana = hoy.getDay();

      var domingoReciente;
      if (diaSemana === 0) {
        domingoReciente = new Date(hoy.getTime() - 7 * 24 * 60 * 60 * 1000);
      } else {
        domingoReciente = new Date(hoy.getTime() - diaSemana * 24 * 60 * 60 * 1000);
      }

      var semanas = [];
      for (var i = 7; i >= 0; i--) {
        var offsetDias = i * 7;
        var finSemana = new Date(domingoReciente.getTime() - offsetDias * 24 * 60 * 60 * 1000);
        var inicioSemana = new Date(finSemana.getTime() - 6 * 24 * 60 * 60 * 1000);

        finSemana.setHours(23, 59, 59, 999);
        inicioSemana.setHours(0, 0, 0, 0);

        var label = this._formatearLabel(inicioSemana, finSemana);
        semanas.push({ inicio: inicioSemana, fin: finSemana, label: label });
      }

      return semanas;
    },

    _formatearLabel: function(inicio, fin) {
      var diaInicio = this._pad2(inicio.getDate());
      var mesInicio = this._pad2(inicio.getMonth() + 1);
      var diaFin = this._pad2(fin.getDate());
      var mesFin = this._pad2(fin.getMonth() + 1);
      return diaInicio + '/' + mesInicio + ' - ' + diaFin + '/' + mesFin;
    },

    _esEstadoRadicadoOPosterior: function(estado) {
      if (!estado) return false;
      var estadoUpper = estado.toUpperCase().trim();
      for (var i = 0; i < this._ESTADOS_RADICADO_O_POSTERIOR.length; i++) {
        if (this._ESTADOS_RADICADO_O_POSTERIOR[i] === estadoUpper) return true;
      }
      return false;
    },

    _pad2: function(n) {
      return n < 10 ? '0' + n : '' + n;
    },

    /**
     * Calcula datos para el Chart_Antigüedad.
     * Promedio de días por estado para lotes activos (excluir TERMINADO).
     * Requirements: 7.2, 7.3
     */
    _calcularAntiguedad: function(lotes) {
      if (!lotes || !Array.isArray(lotes)) return [];

      var msPerDay = 24 * 60 * 60 * 1000;
      var now = Date.now();

      var grupos = {};

      for (var i = 0; i < lotes.length; i++) {
        var lote = lotes[i];

        if (!lote || !lote.estadoPrincipal) continue;
        var estado = lote.estadoPrincipal.trim();
        if (!estado) continue;

        if (estado.toUpperCase() === 'TERMINADO') continue;

        var fecha = this._parsearFecha(lote.fecha);
        if (!fecha) continue;

        var antiguedadDias = Math.floor((now - fecha.getTime()) / msPerDay);

        if (!grupos[estado]) {
          grupos[estado] = [];
        }
        grupos[estado].push(antiguedadDias);
      }

      var resultado = [];
      var estados = Object.keys(grupos);

      for (var j = 0; j < estados.length; j++) {
        var estadoKey = estados[j];
        var dias = grupos[estadoKey];
        var suma = 0;

        for (var k = 0; k < dias.length; k++) {
          suma += dias[k];
        }

        var promedio = Math.round((suma / dias.length) * 10) / 10;

        resultado.push({
          label: estadoKey,
          valor: promedio
        });
      }

      return resultado;
    }
  };
}

/**
 * Helper: creates a lote with a specific date and state.
 * @param {string} fecha - "d/MM/yyyy HH:mm"
 * @param {string} estado - estadoPrincipal
 */
function crearLote(fecha, estado) {
  return {
    idLote: 'L-' + Math.random().toString(36).substring(7),
    fecha: fecha,
    comercial: 'COMERCIAL TEST',
    contratos: 1,
    estados: {},
    estadoPrincipal: estado
  };
}

describe('DashboardCharts._calcularTendencia', function() {
  let charts;

  beforeEach(function() {
    charts = createDashboardCharts();
  });

  describe('Estructura del resultado', function() {
    it('retorna exactamente 8 entradas con lotes vacíos', function() {
      var resultado = charts._calcularTendencia([]);
      expect(resultado).toHaveLength(8);
    });

    it('retorna exactamente 8 entradas con null', function() {
      var resultado = charts._calcularTendencia(null);
      expect(resultado).toHaveLength(8);
    });

    it('retorna exactamente 8 entradas con undefined', function() {
      var resultado = charts._calcularTendencia(undefined);
      expect(resultado).toHaveLength(8);
    });

    it('cada entrada tiene label (string) y valor (number)', function() {
      var resultado = charts._calcularTendencia([]);
      for (var i = 0; i < resultado.length; i++) {
        expect(typeof resultado[i].label).toBe('string');
        expect(typeof resultado[i].valor).toBe('number');
        expect(resultado[i].label.length).toBeGreaterThan(0);
      }
    });

    it('labels tienen formato "dd/MM - dd/MM"', function() {
      var resultado = charts._calcularTendencia([]);
      var regex = /^\d{2}\/\d{2} - \d{2}\/\d{2}$/;
      for (var i = 0; i < resultado.length; i++) {
        expect(resultado[i].label).toMatch(regex);
      }
    });

    it('todos los valores son 0 cuando no hay lotes', function() {
      var resultado = charts._calcularTendencia([]);
      for (var i = 0; i < resultado.length; i++) {
        expect(resultado[i].valor).toBe(0);
      }
    });
  });

  describe('Semanas calendario completas (lunes a domingo)', function() {
    it('las 8 semanas son consecutivas y no se solapan', function() {
      // Referencia: miércoles 30 de julio 2025
      var ref = new Date(2025, 6, 30); // Jul 30, 2025 (miércoles)
      var semanas = charts._obtenerUltimas8Semanas(ref);

      expect(semanas).toHaveLength(8);

      for (var i = 0; i < semanas.length - 1; i++) {
        // El fin de una semana + 1ms debe ser igual al inicio de la siguiente
        var finActual = semanas[i].fin.getTime();
        var inicioSiguiente = semanas[i + 1].inicio.getTime();
        expect(inicioSiguiente - finActual).toBe(1); // 1ms de diferencia
      }
    });

    it('cada semana inicia en lunes y termina en domingo', function() {
      var ref = new Date(2025, 6, 30); // miércoles
      var semanas = charts._obtenerUltimas8Semanas(ref);

      for (var i = 0; i < semanas.length; i++) {
        expect(semanas[i].inicio.getDay()).toBe(1); // Lunes
        expect(semanas[i].fin.getDay()).toBe(0); // Domingo
      }
    });

    it('la semana más reciente termina ANTES del día actual (semana completa)', function() {
      // Miércoles 30 de julio 2025 → última semana completa terminó domingo 27 julio
      var ref = new Date(2025, 6, 30);
      var semanas = charts._obtenerUltimas8Semanas(ref);

      var ultimaSemana = semanas[7]; // Más reciente es la última
      expect(ultimaSemana.fin.getDate()).toBe(27);
      expect(ultimaSemana.fin.getMonth()).toBe(6); // Julio
      expect(ultimaSemana.fin.getFullYear()).toBe(2025);
    });

    it('si hoy es domingo, la última semana completa terminó el domingo anterior', function() {
      // Domingo 27 de julio 2025 → la última semana completa terminó domingo 20 julio
      var ref = new Date(2025, 6, 27);
      var semanas = charts._obtenerUltimas8Semanas(ref);

      var ultimaSemana = semanas[7];
      expect(ultimaSemana.fin.getDate()).toBe(20);
      expect(ultimaSemana.fin.getMonth()).toBe(6); // Julio
    });

    it('si hoy es lunes, la última semana completa terminó ayer domingo', function() {
      // Lunes 28 de julio 2025 → última semana completa terminó domingo 27 julio
      var ref = new Date(2025, 6, 28);
      var semanas = charts._obtenerUltimas8Semanas(ref);

      var ultimaSemana = semanas[7];
      expect(ultimaSemana.fin.getDate()).toBe(27);
      expect(ultimaSemana.fin.getMonth()).toBe(6); // Julio
    });
  });

  describe('Conteo de lotes por semana', function() {
    it('cuenta un lote RADICADO que cae en la última semana completa', function() {
      // Referencia: miércoles 30/07/2025
      // Última semana completa: lunes 21/07 a domingo 27/07
      var ref = new Date(2025, 6, 30);
      var lotes = [
        crearLote('23/07/2025 10:00', 'RADICADO') // Miércoles 23 julio
      ];

      var resultado = charts._calcularTendenciaConFecha(lotes, ref);
      expect(resultado[7].valor).toBe(1); // Última semana
    });

    it('cuenta lotes con distintos estados RADICADO o posterior', function() {
      var ref = new Date(2025, 6, 30);
      var lotes = [
        crearLote('21/07/2025 09:00', 'RADICADO'),
        crearLote('22/07/2025 10:00', 'EN ANÁLISIS'),
        crearLote('23/07/2025 11:00', 'PENDIENTE PAZ Y SALVO'),
        crearLote('24/07/2025 12:00', 'TERMINADO'),
        crearLote('25/07/2025 13:00', 'PAZ Y SALVO'),
        crearLote('26/07/2025 14:00', 'DESISTIDO'),
        crearLote('27/07/2025 15:00', 'REGISTRADO')
      ];

      var resultado = charts._calcularTendenciaConFecha(lotes, ref);
      expect(resultado[7].valor).toBe(7); // Todos caen en semana 21-27 julio
    });

    it('NO cuenta lotes con estado que no es RADICADO o posterior', function() {
      var ref = new Date(2025, 6, 30);
      var lotes = [
        crearLote('22/07/2025 10:00', 'PENDIENTE'),
        crearLote('23/07/2025 11:00', 'NUEVO'),
        crearLote('24/07/2025 12:00', 'EN REVISIÓN'),
        crearLote('25/07/2025 13:00', '')
      ];

      var resultado = charts._calcularTendenciaConFecha(lotes, ref);
      expect(resultado[7].valor).toBe(0);
    });

    it('cada lote se cuenta en máximo una semana', function() {
      var ref = new Date(2025, 6, 30);
      // Crear lotes en distintas semanas
      var lotes = [
        crearLote('14/07/2025 10:00', 'RADICADO'), // Semana 14-20 julio
        crearLote('21/07/2025 10:00', 'RADICADO'), // Semana 21-27 julio
      ];

      var resultado = charts._calcularTendenciaConFecha(lotes, ref);
      var totalContados = resultado.reduce(function(sum, r) { return sum + r.valor; }, 0);
      expect(totalContados).toBe(2);
      // Verificar que están en semanas diferentes
      expect(resultado[6].valor).toBe(1); // Semana 14-20
      expect(resultado[7].valor).toBe(1); // Semana 21-27
    });

    it('lotes fuera del rango de 8 semanas no se cuentan', function() {
      var ref = new Date(2025, 6, 30);
      // Última semana completa: 21-27 julio
      // 8 semanas atrás empieza: lunes 2 junio 2025
      var lotes = [
        crearLote('1/06/2025 10:00', 'RADICADO'),  // Antes del rango
        crearLote('28/07/2025 10:00', 'RADICADO'), // Después del rango (semana actual incompleta)
      ];

      var resultado = charts._calcularTendenciaConFecha(lotes, ref);
      var totalContados = resultado.reduce(function(sum, r) { return sum + r.valor; }, 0);
      expect(totalContados).toBe(0);
    });

    it('distribuye lotes correctamente entre múltiples semanas', function() {
      var ref = new Date(2025, 6, 30);
      // Semanas: ...  7-13 julio (semana 6), 14-20 julio (semana 7), 21-27 julio (semana 8)
      var lotes = [
        crearLote('7/07/2025 10:00', 'RADICADO'),
        crearLote('8/07/2025 10:00', 'RADICADO'),
        crearLote('14/07/2025 10:00', 'RADICADO'),
        crearLote('21/07/2025 10:00', 'RADICADO'),
        crearLote('22/07/2025 10:00', 'RADICADO'),
        crearLote('23/07/2025 10:00', 'RADICADO')
      ];

      var resultado = charts._calcularTendenciaConFecha(lotes, ref);
      expect(resultado[5].valor).toBe(2); // 7-13 julio
      expect(resultado[6].valor).toBe(1); // 14-20 julio
      expect(resultado[7].valor).toBe(3); // 21-27 julio
    });
  });

  describe('Manejo de fechas inválidas', function() {
    it('ignora lotes con fecha vacía', function() {
      var ref = new Date(2025, 6, 30);
      var lotes = [crearLote('', 'RADICADO')];

      var resultado = charts._calcularTendenciaConFecha(lotes, ref);
      var total = resultado.reduce(function(sum, r) { return sum + r.valor; }, 0);
      expect(total).toBe(0);
    });

    it('ignora lotes con fecha null', function() {
      var ref = new Date(2025, 6, 30);
      var lotes = [{ idLote: 'L1', fecha: null, comercial: 'TEST', contratos: 1, estados: {}, estadoPrincipal: 'RADICADO' }];

      var resultado = charts._calcularTendenciaConFecha(lotes, ref);
      var total = resultado.reduce(function(sum, r) { return sum + r.valor; }, 0);
      expect(total).toBe(0);
    });

    it('ignora lotes con fecha en formato incorrecto', function() {
      var ref = new Date(2025, 6, 30);
      var lotes = [
        crearLote('2025-07-22 10:00', 'RADICADO'),  // Formato ISO incorrecto
        crearLote('22-07-2025 10:00', 'RADICADO'),  // Separadores incorrectos
        crearLote('abc', 'RADICADO'),
        crearLote('32/07/2025 10:00', 'RADICADO')   // Día inválido
      ];

      var resultado = charts._calcularTendenciaConFecha(lotes, ref);
      var total = resultado.reduce(function(sum, r) { return sum + r.valor; }, 0);
      expect(total).toBe(0);
    });
  });

  describe('Labels de semanas', function() {
    it('la última semana tiene label correcto para referencia 30/07/2025', function() {
      // Miércoles 30 julio → última semana completa: 21/07 - 27/07
      var ref = new Date(2025, 6, 30);
      var resultado = charts._calcularTendenciaConFecha([], ref);
      expect(resultado[7].label).toBe('21/07 - 27/07');
    });

    it('la penúltima semana tiene label correcto', function() {
      var ref = new Date(2025, 6, 30);
      var resultado = charts._calcularTendenciaConFecha([], ref);
      expect(resultado[6].label).toBe('14/07 - 20/07');
    });

    it('labels están ordenados de más antigua a más reciente', function() {
      var ref = new Date(2025, 6, 30);
      var semanas = charts._obtenerUltimas8Semanas(ref);

      for (var i = 0; i < semanas.length - 1; i++) {
        expect(semanas[i].inicio.getTime()).toBeLessThan(semanas[i + 1].inicio.getTime());
      }
    });
  });

  describe('Estado case-insensitive', function() {
    it('cuenta lotes con estado en minúsculas', function() {
      var ref = new Date(2025, 6, 30);
      var lotes = [crearLote('22/07/2025 10:00', 'radicado')];

      var resultado = charts._calcularTendenciaConFecha(lotes, ref);
      expect(resultado[7].valor).toBe(1);
    });

    it('cuenta lotes con estado mixto', function() {
      var ref = new Date(2025, 6, 30);
      var lotes = [crearLote('22/07/2025 10:00', 'En Análisis')];

      var resultado = charts._calcularTendenciaConFecha(lotes, ref);
      expect(resultado[7].valor).toBe(1);
    });
  });

  describe('_parsearFecha', function() {
    it('parsea formato "d/MM/yyyy HH:mm" correctamente', function() {
      var fecha = charts._parsearFecha('5/01/2025 14:30');
      expect(fecha).not.toBeNull();
      expect(fecha.getDate()).toBe(5);
      expect(fecha.getMonth()).toBe(0); // Enero
      expect(fecha.getFullYear()).toBe(2025);
      expect(fecha.getHours()).toBe(14);
      expect(fecha.getMinutes()).toBe(30);
    });

    it('parsea formato "dd/MM/yyyy HH:mm" correctamente', function() {
      var fecha = charts._parsearFecha('23/07/2025 09:15');
      expect(fecha).not.toBeNull();
      expect(fecha.getDate()).toBe(23);
      expect(fecha.getMonth()).toBe(6); // Julio
      expect(fecha.getFullYear()).toBe(2025);
    });

    it('retorna null para string vacío', function() {
      expect(charts._parsearFecha('')).toBeNull();
    });

    it('retorna null para null', function() {
      expect(charts._parsearFecha(null)).toBeNull();
    });

    it('retorna null para formato inválido', function() {
      expect(charts._parsearFecha('no-es-fecha')).toBeNull();
    });

    it('retorna null para fecha con día 31 en mes de 30 días', function() {
      // 31 de junio no existe
      expect(charts._parsearFecha('31/06/2025 10:00')).toBeNull();
    });
  });

  describe('_esEstadoRadicadoOPosterior', function() {
    it('retorna true para RADICADO', function() {
      expect(charts._esEstadoRadicadoOPosterior('RADICADO')).toBe(true);
    });

    it('retorna true para EN ANÁLISIS', function() {
      expect(charts._esEstadoRadicadoOPosterior('EN ANÁLISIS')).toBe(true);
    });

    it('retorna true para PENDIENTE PAZ Y SALVO', function() {
      expect(charts._esEstadoRadicadoOPosterior('PENDIENTE PAZ Y SALVO')).toBe(true);
    });

    it('retorna true para TERMINADO', function() {
      expect(charts._esEstadoRadicadoOPosterior('TERMINADO')).toBe(true);
    });

    it('retorna true para PAZ Y SALVO', function() {
      expect(charts._esEstadoRadicadoOPosterior('PAZ Y SALVO')).toBe(true);
    });

    it('retorna true para DESISTIDO', function() {
      expect(charts._esEstadoRadicadoOPosterior('DESISTIDO')).toBe(true);
    });

    it('retorna true para REGISTRADO', function() {
      expect(charts._esEstadoRadicadoOPosterior('REGISTRADO')).toBe(true);
    });

    it('retorna false para PENDIENTE', function() {
      expect(charts._esEstadoRadicadoOPosterior('PENDIENTE')).toBe(false);
    });

    it('retorna false para NUEVO', function() {
      expect(charts._esEstadoRadicadoOPosterior('NUEVO')).toBe(false);
    });

    it('retorna false para estado vacío', function() {
      expect(charts._esEstadoRadicadoOPosterior('')).toBe(false);
    });

    it('retorna false para null', function() {
      expect(charts._esEstadoRadicadoOPosterior(null)).toBe(false);
    });
  });
});


/**
 * Helper: creates a date string in "d/MM/yyyy HH:mm" format for N days ago.
 * @param {number} daysAgo - Number of days in the past
 * @returns {string} Formatted date string
 */
function fechaDaysAgo(daysAgo) {
  var d = new Date(Date.now() - daysAgo * 24 * 60 * 60 * 1000);
  var dia = d.getDate();
  var mes = (d.getMonth() + 1).toString().padStart(2, '0');
  var anio = d.getFullYear();
  var hora = d.getHours().toString().padStart(2, '0');
  var min = d.getMinutes().toString().padStart(2, '0');
  return dia + '/' + mes + '/' + anio + ' ' + hora + ':' + min;
}

describe('DashboardCharts._calcularAntiguedad', function() {
  let charts;

  beforeEach(function() {
    charts = createDashboardCharts();
  });

  describe('Exclusión de lotes TERMINADO', function() {
    it('excluye lotes con estadoPrincipal "TERMINADO"', function() {
      var lotes = [
        { idLote: '1', fecha: fechaDaysAgo(3), comercial: 'JUAN', contratos: 1, estados: {}, estadoPrincipal: 'TERMINADO' },
        { idLote: '2', fecha: fechaDaysAgo(5), comercial: 'MARIA', contratos: 2, estados: {}, estadoPrincipal: 'RADICADO' }
      ];

      var resultado = charts._calcularAntiguedad(lotes);

      expect(resultado.length).toBe(1);
      expect(resultado[0].label).toBe('RADICADO');
      var labels = resultado.map(function(r) { return r.label; });
      expect(labels).not.toContain('TERMINADO');
    });

    it('excluye TERMINADO case-insensitive', function() {
      var lotes = [
        { idLote: '1', fecha: fechaDaysAgo(2), comercial: 'A', contratos: 1, estados: {}, estadoPrincipal: 'Terminado' },
        { idLote: '2', fecha: fechaDaysAgo(2), comercial: 'A', contratos: 1, estados: {}, estadoPrincipal: 'terminado' }
      ];

      var resultado = charts._calcularAntiguedad(lotes);
      expect(resultado.length).toBe(0);
    });
  });

  describe('Cálculo de antigüedad en días', function() {
    it('calcula floor((now - fecha) / msPerDay) para un solo lote', function() {
      var lotes = [
        { idLote: '1', fecha: fechaDaysAgo(10), comercial: 'A', contratos: 1, estados: {}, estadoPrincipal: 'RADICADO' }
      ];

      var resultado = charts._calcularAntiguedad(lotes);
      expect(resultado.length).toBe(1);
      expect(resultado[0].valor).toBe(10);
    });

    it('calcula promedio redondeado a 1 decimal (3.5)', function() {
      var lotes = [
        { idLote: '1', fecha: fechaDaysAgo(3), comercial: 'A', contratos: 1, estados: {}, estadoPrincipal: 'EN ANÁLISIS' },
        { idLote: '2', fecha: fechaDaysAgo(4), comercial: 'B', contratos: 1, estados: {}, estadoPrincipal: 'EN ANÁLISIS' }
      ];

      var resultado = charts._calcularAntiguedad(lotes);
      expect(resultado.length).toBe(1);
      expect(resultado[0].label).toBe('EN ANÁLISIS');
      expect(resultado[0].valor).toBe(3.5);
    });

    it('promedio con 3 lotes se redondea a 1 decimal (4.7)', function() {
      // 3 lotes: 3, 5, 6 → promedio = 14/3 = 4.666... → 4.7
      var lotes = [
        { idLote: '1', fecha: fechaDaysAgo(3), comercial: 'A', contratos: 1, estados: {}, estadoPrincipal: 'RADICADO' },
        { idLote: '2', fecha: fechaDaysAgo(5), comercial: 'B', contratos: 1, estados: {}, estadoPrincipal: 'RADICADO' },
        { idLote: '3', fecha: fechaDaysAgo(6), comercial: 'C', contratos: 1, estados: {}, estadoPrincipal: 'RADICADO' }
      ];

      var resultado = charts._calcularAntiguedad(lotes);
      expect(resultado.length).toBe(1);
      expect(resultado[0].valor).toBe(4.7);
    });
  });

  describe('Agrupación por estado', function() {
    it('retorna una entrada por cada estado con al menos 1 lote activo', function() {
      var lotes = [
        { idLote: '1', fecha: fechaDaysAgo(2), comercial: 'A', contratos: 1, estados: {}, estadoPrincipal: 'RADICADO' },
        { idLote: '2', fecha: fechaDaysAgo(5), comercial: 'B', contratos: 1, estados: {}, estadoPrincipal: 'EN ANÁLISIS' },
        { idLote: '3', fecha: fechaDaysAgo(8), comercial: 'C', contratos: 1, estados: {}, estadoPrincipal: 'PENDIENTE PAZ Y SALVO' }
      ];

      var resultado = charts._calcularAntiguedad(lotes);
      expect(resultado.length).toBe(3);

      var labels = resultado.map(function(r) { return r.label; });
      expect(labels).toContain('RADICADO');
      expect(labels).toContain('EN ANÁLISIS');
      expect(labels).toContain('PENDIENTE PAZ Y SALVO');
    });

    it('agrupa múltiples lotes del mismo estado y calcula promedio', function() {
      var lotes = [
        { idLote: '1', fecha: fechaDaysAgo(2), comercial: 'A', contratos: 1, estados: {}, estadoPrincipal: 'RADICADO' },
        { idLote: '2', fecha: fechaDaysAgo(6), comercial: 'B', contratos: 1, estados: {}, estadoPrincipal: 'RADICADO' },
        { idLote: '3', fecha: fechaDaysAgo(10), comercial: 'C', contratos: 1, estados: {}, estadoPrincipal: 'EN ANÁLISIS' }
      ];

      var resultado = charts._calcularAntiguedad(lotes);
      var radicado = resultado.find(function(r) { return r.label === 'RADICADO'; });
      var enAnalisis = resultado.find(function(r) { return r.label === 'EN ANÁLISIS'; });

      expect(radicado.valor).toBe(4); // (2 + 6) / 2 = 4.0
      expect(enAnalisis.valor).toBe(10);
    });
  });

  describe('Exclusión de lotes con fecha inválida', function() {
    it('excluye lotes con fecha null', function() {
      var lotes = [
        { idLote: '1', fecha: null, comercial: 'A', contratos: 1, estados: {}, estadoPrincipal: 'RADICADO' },
        { idLote: '2', fecha: fechaDaysAgo(5), comercial: 'B', contratos: 1, estados: {}, estadoPrincipal: 'RADICADO' }
      ];

      var resultado = charts._calcularAntiguedad(lotes);
      expect(resultado.length).toBe(1);
      expect(resultado[0].valor).toBe(5);
    });

    it('excluye lotes con fecha en formato incorrecto', function() {
      var lotes = [
        { idLote: '1', fecha: 'invalid-date', comercial: 'A', contratos: 1, estados: {}, estadoPrincipal: 'RADICADO' },
        { idLote: '2', fecha: '2025-01-15', comercial: 'B', contratos: 1, estados: {}, estadoPrincipal: 'RADICADO' },
        { idLote: '3', fecha: fechaDaysAgo(7), comercial: 'C', contratos: 1, estados: {}, estadoPrincipal: 'RADICADO' }
      ];

      var resultado = charts._calcularAntiguedad(lotes);
      expect(resultado.length).toBe(1);
      expect(resultado[0].valor).toBe(7);
    });

    it('excluye lotes con fecha vacía', function() {
      var lotes = [
        { idLote: '1', fecha: '', comercial: 'A', contratos: 1, estados: {}, estadoPrincipal: 'RADICADO' },
        { idLote: '2', fecha: fechaDaysAgo(3), comercial: 'B', contratos: 1, estados: {}, estadoPrincipal: 'RADICADO' }
      ];

      var resultado = charts._calcularAntiguedad(lotes);
      expect(resultado.length).toBe(1);
      expect(resultado[0].valor).toBe(3);
    });

    it('excluye lotes con fecha imposible (día 32)', function() {
      var lotes = [
        { idLote: '1', fecha: '32/01/2025 14:00', comercial: 'A', contratos: 1, estados: {}, estadoPrincipal: 'RADICADO' },
        { idLote: '2', fecha: fechaDaysAgo(4), comercial: 'B', contratos: 1, estados: {}, estadoPrincipal: 'RADICADO' }
      ];

      var resultado = charts._calcularAntiguedad(lotes);
      expect(resultado.length).toBe(1);
      expect(resultado[0].valor).toBe(4);
    });
  });

  describe('Casos borde', function() {
    it('retorna array vacío si lotes es null', function() {
      expect(charts._calcularAntiguedad(null)).toEqual([]);
    });

    it('retorna array vacío si lotes es undefined', function() {
      expect(charts._calcularAntiguedad(undefined)).toEqual([]);
    });

    it('retorna array vacío si lotes es un array vacío', function() {
      expect(charts._calcularAntiguedad([])).toEqual([]);
    });

    it('retorna array vacío si todos los lotes son TERMINADO', function() {
      var lotes = [
        { idLote: '1', fecha: fechaDaysAgo(2), comercial: 'A', contratos: 1, estados: {}, estadoPrincipal: 'TERMINADO' },
        { idLote: '2', fecha: fechaDaysAgo(5), comercial: 'B', contratos: 1, estados: {}, estadoPrincipal: 'TERMINADO' }
      ];
      expect(charts._calcularAntiguedad(lotes)).toEqual([]);
    });

    it('retorna array vacío si todos los lotes tienen fecha inválida', function() {
      var lotes = [
        { idLote: '1', fecha: 'bad', comercial: 'A', contratos: 1, estados: {}, estadoPrincipal: 'RADICADO' },
        { idLote: '2', fecha: null, comercial: 'B', contratos: 1, estados: {}, estadoPrincipal: 'EN ANÁLISIS' }
      ];
      expect(charts._calcularAntiguedad(lotes)).toEqual([]);
    });

    it('ignora lotes con estadoPrincipal vacío o null', function() {
      var lotes = [
        { idLote: '1', fecha: fechaDaysAgo(3), comercial: 'A', contratos: 1, estados: {}, estadoPrincipal: '' },
        { idLote: '2', fecha: fechaDaysAgo(3), comercial: 'B', contratos: 1, estados: {}, estadoPrincipal: null },
        { idLote: '3', fecha: fechaDaysAgo(5), comercial: 'C', contratos: 1, estados: {}, estadoPrincipal: 'RADICADO' }
      ];

      var resultado = charts._calcularAntiguedad(lotes);
      expect(resultado.length).toBe(1);
      expect(resultado[0].label).toBe('RADICADO');
    });

    it('un lote con antigüedad 0 días (radicado hoy) se incluye correctamente', function() {
      var lotes = [
        { idLote: '1', fecha: fechaDaysAgo(0), comercial: 'A', contratos: 1, estados: {}, estadoPrincipal: 'RADICADO' }
      ];

      var resultado = charts._calcularAntiguedad(lotes);
      expect(resultado.length).toBe(1);
      expect(resultado[0].valor).toBe(0);
    });
  });

  describe('Formato de retorno', function() {
    it('cada entrada tiene propiedades label (string) y valor (number)', function() {
      var lotes = [
        { idLote: '1', fecha: fechaDaysAgo(5), comercial: 'A', contratos: 1, estados: {}, estadoPrincipal: 'RADICADO' }
      ];

      var resultado = charts._calcularAntiguedad(lotes);
      expect(resultado.length).toBe(1);
      expect(typeof resultado[0].label).toBe('string');
      expect(typeof resultado[0].valor).toBe('number');
    });

    it('valor es promedio redondeado a 1 decimal, no entero truncado', function() {
      // 2 lotes: 1 y 2 días → promedio = 1.5
      var lotes = [
        { idLote: '1', fecha: fechaDaysAgo(1), comercial: 'A', contratos: 1, estados: {}, estadoPrincipal: 'RADICADO' },
        { idLote: '2', fecha: fechaDaysAgo(2), comercial: 'B', contratos: 1, estados: {}, estadoPrincipal: 'RADICADO' }
      ];

      var resultado = charts._calcularAntiguedad(lotes);
      expect(resultado[0].valor).toBe(1.5);
    });
  });
});
