/**
 * Unit tests for DashboardCharts._calcularRanking
 * Validates: Requirements 6.2, 6.3, 6.4, 6.6
 */
import { describe, it, expect, beforeEach } from 'vitest';

/**
 * Creates a testable DashboardCharts instance with _calcularRanking logic
 * (mirrors scripts_dashboardCharts.html).
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

    _esEstadoRadicadoOPosterior: function(estado) {
      if (!estado) return false;
      var estadoUpper = estado.toUpperCase().trim();
      for (var i = 0; i < this._ESTADOS_RADICADO_O_POSTERIOR.length; i++) {
        if (this._ESTADOS_RADICADO_O_POSTERIOR[i] === estadoUpper) return true;
      }
      return false;
    },

    _calcularRanking: function(lotes, usuarios) {
      var ahora = new Date();
      var mesActual = ahora.getMonth();
      var anioActual = ahora.getFullYear();

      var conteo = {};
      var labelsPorClave = {};

      if (usuarios && usuarios.length > 0) {
        for (var i = 0; i < usuarios.length; i++) {
          var u = usuarios[i];
          if (u && u.nombre) {
            var clave = u.nombre.toUpperCase();
            if (!(clave in conteo)) {
              conteo[clave] = 0;
              labelsPorClave[clave] = u.nombre;
            }
          }
        }
      }

      var lotesArr = lotes || [];
      for (var j = 0; j < lotesArr.length; j++) {
        var lote = lotesArr[j];
        if (!lote) continue;

        if (!this._esEstadoRadicadoOPosterior(lote.estadoPrincipal)) continue;

        var fechaLote = this._parsearFecha(lote.fecha);
        if (!fechaLote) continue;
        if (fechaLote.getMonth() !== mesActual || fechaLote.getFullYear() !== anioActual) continue;

        var comercialClave = (lote.comercial || '').toUpperCase();
        if (comercialClave in conteo) {
          conteo[comercialClave]++;
        }
      }

      var resultado = [];
      var claves = Object.keys(conteo);
      for (var m = 0; m < claves.length; m++) {
        var cl = claves[m];
        resultado.push({
          label: labelsPorClave[cl],
          valor: conteo[cl]
        });
      }

      resultado.sort(function(a, b) {
        return b.valor - a.valor;
      });

      return resultado;
    }
  };
}

/**
 * Helper: genera una fecha en formato "d/MM/yyyy HH:mm" para el mes actual.
 */
function fechaMesActual(dia, hora, minuto) {
  var ahora = new Date();
  var mes = String(ahora.getMonth() + 1).padStart(2, '0');
  var anio = ahora.getFullYear();
  return dia + '/' + mes + '/' + anio + ' ' + String(hora || 10).padStart(2, '0') + ':' + String(minuto || 0).padStart(2, '0');
}

/**
 * Helper: genera una fecha para un mes diferente al actual.
 */
function fechaOtroMes(dia) {
  var ahora = new Date();
  // Usar un mes anterior (o posterior si estamos en enero)
  var mesOtro = ahora.getMonth() === 0 ? 2 : ahora.getMonth(); // 1-indexed
  var anio = ahora.getFullYear();
  return dia + '/' + String(mesOtro).padStart(2, '0') + '/' + anio + ' 10:00';
}

describe('DashboardCharts._calcularRanking', function() {
  let charts;
  let usuarios;

  beforeEach(function() {
    charts = createDashboardCharts();
    usuarios = [
      { email: 'juan@test.com', nombre: 'JUAN PÉREZ', rol: 'CONSULTOR', emailDirector: 'dir@test.com', emailGerente: 'ger@test.com', activo: true },
      { email: 'maria@test.com', nombre: 'MARÍA LÓPEZ', rol: 'CONSULTOR', emailDirector: 'dir@test.com', emailGerente: 'ger@test.com', activo: true },
      { email: 'carlos@test.com', nombre: 'CARLOS RUIZ', rol: 'COMERCIAL', emailDirector: 'dir@test.com', emailGerente: 'ger@test.com', activo: true }
    ];
  });

  describe('Conteo básico por comercial (Req 6.3)', function() {
    it('cuenta lotes del mes actual con estado RADICADO', function() {
      var lotes = [
        { idLote: '1', fecha: fechaMesActual(5), comercial: 'JUAN PÉREZ', contratos: 3, estados: {}, estadoPrincipal: 'RADICADO' },
        { idLote: '2', fecha: fechaMesActual(10), comercial: 'JUAN PÉREZ', contratos: 2, estados: {}, estadoPrincipal: 'RADICADO' },
        { idLote: '3', fecha: fechaMesActual(15), comercial: 'MARÍA LÓPEZ', contratos: 1, estados: {}, estadoPrincipal: 'RADICADO' }
      ];

      var resultado = charts._calcularRanking(lotes, usuarios);

      expect(resultado).toHaveLength(3);
      expect(resultado[0]).toEqual({ label: 'JUAN PÉREZ', valor: 2 });
      expect(resultado[1]).toEqual({ label: 'MARÍA LÓPEZ', valor: 1 });
      expect(resultado[2]).toEqual({ label: 'CARLOS RUIZ', valor: 0 });
    });

    it('cuenta lotes con todos los estados RADICADO o posterior', function() {
      var lotes = [
        { idLote: '1', fecha: fechaMesActual(1), comercial: 'JUAN PÉREZ', contratos: 1, estados: {}, estadoPrincipal: 'RADICADO' },
        { idLote: '2', fecha: fechaMesActual(2), comercial: 'JUAN PÉREZ', contratos: 1, estados: {}, estadoPrincipal: 'EN ANÁLISIS' },
        { idLote: '3', fecha: fechaMesActual(3), comercial: 'JUAN PÉREZ', contratos: 1, estados: {}, estadoPrincipal: 'PENDIENTE PAZ Y SALVO' },
        { idLote: '4', fecha: fechaMesActual(4), comercial: 'JUAN PÉREZ', contratos: 1, estados: {}, estadoPrincipal: 'TERMINADO' },
        { idLote: '5', fecha: fechaMesActual(5), comercial: 'JUAN PÉREZ', contratos: 1, estados: {}, estadoPrincipal: 'PAZ Y SALVO' },
        { idLote: '6', fecha: fechaMesActual(6), comercial: 'JUAN PÉREZ', contratos: 1, estados: {}, estadoPrincipal: 'DESISTIDO' },
        { idLote: '7', fecha: fechaMesActual(7), comercial: 'JUAN PÉREZ', contratos: 1, estados: {}, estadoPrincipal: 'REGISTRADO' }
      ];

      var resultado = charts._calcularRanking(lotes, usuarios);
      var juan = resultado.find(function(r) { return r.label === 'JUAN PÉREZ'; });
      expect(juan.valor).toBe(7);
    });

    it('NO cuenta lotes con estados previos a RADICADO', function() {
      var lotes = [
        { idLote: '1', fecha: fechaMesActual(5), comercial: 'JUAN PÉREZ', contratos: 1, estados: {}, estadoPrincipal: 'PENDIENTE' },
        { idLote: '2', fecha: fechaMesActual(6), comercial: 'JUAN PÉREZ', contratos: 1, estados: {}, estadoPrincipal: 'EN REVISIÓN' },
        { idLote: '3', fecha: fechaMesActual(7), comercial: 'JUAN PÉREZ', contratos: 1, estados: {}, estadoPrincipal: 'BORRADOR' }
      ];

      var resultado = charts._calcularRanking(lotes, usuarios);
      var juan = resultado.find(function(r) { return r.label === 'JUAN PÉREZ'; });
      expect(juan.valor).toBe(0);
    });
  });

  describe('Filtrado por mes actual (Req 6.3)', function() {
    it('solo cuenta lotes del mes calendario actual', function() {
      var lotes = [
        { idLote: '1', fecha: fechaMesActual(5), comercial: 'JUAN PÉREZ', contratos: 1, estados: {}, estadoPrincipal: 'RADICADO' },
        { idLote: '2', fecha: fechaOtroMes(5), comercial: 'JUAN PÉREZ', contratos: 1, estados: {}, estadoPrincipal: 'RADICADO' }
      ];

      var resultado = charts._calcularRanking(lotes, usuarios);
      var juan = resultado.find(function(r) { return r.label === 'JUAN PÉREZ'; });
      expect(juan.valor).toBe(1);
    });

    it('lotes de otro año no se cuentan', function() {
      var lotes = [
        { idLote: '1', fecha: '5/01/2020 10:00', comercial: 'JUAN PÉREZ', contratos: 1, estados: {}, estadoPrincipal: 'RADICADO' }
      ];

      var resultado = charts._calcularRanking(lotes, usuarios);
      var juan = resultado.find(function(r) { return r.label === 'JUAN PÉREZ'; });
      expect(juan.valor).toBe(0);
    });
  });

  describe('Comerciales con cero lotes (Req 6.6)', function() {
    it('incluye comerciales con cero lotes en el resultado', function() {
      var lotes = [
        { idLote: '1', fecha: fechaMesActual(5), comercial: 'JUAN PÉREZ', contratos: 1, estados: {}, estadoPrincipal: 'RADICADO' }
      ];

      var resultado = charts._calcularRanking(lotes, usuarios);

      expect(resultado).toHaveLength(3);
      var carlos = resultado.find(function(r) { return r.label === 'CARLOS RUIZ'; });
      var maria = resultado.find(function(r) { return r.label === 'MARÍA LÓPEZ'; });
      expect(carlos.valor).toBe(0);
      expect(maria.valor).toBe(0);
    });

    it('sin lotes, todos los comerciales tienen valor 0', function() {
      var resultado = charts._calcularRanking([], usuarios);

      expect(resultado).toHaveLength(3);
      resultado.forEach(function(item) {
        expect(item.valor).toBe(0);
      });
    });
  });

  describe('Ordenamiento descendente (Req 6.2)', function() {
    it('resultado está ordenado de mayor a menor por valor', function() {
      var lotes = [
        { idLote: '1', fecha: fechaMesActual(1), comercial: 'CARLOS RUIZ', contratos: 1, estados: {}, estadoPrincipal: 'RADICADO' },
        { idLote: '2', fecha: fechaMesActual(2), comercial: 'CARLOS RUIZ', contratos: 1, estados: {}, estadoPrincipal: 'RADICADO' },
        { idLote: '3', fecha: fechaMesActual(3), comercial: 'CARLOS RUIZ', contratos: 1, estados: {}, estadoPrincipal: 'RADICADO' },
        { idLote: '4', fecha: fechaMesActual(4), comercial: 'MARÍA LÓPEZ', contratos: 1, estados: {}, estadoPrincipal: 'RADICADO' },
        { idLote: '5', fecha: fechaMesActual(5), comercial: 'MARÍA LÓPEZ', contratos: 1, estados: {}, estadoPrincipal: 'EN ANÁLISIS' }
      ];

      var resultado = charts._calcularRanking(lotes, usuarios);

      expect(resultado[0].label).toBe('CARLOS RUIZ');
      expect(resultado[0].valor).toBe(3);
      expect(resultado[1].label).toBe('MARÍA LÓPEZ');
      expect(resultado[1].valor).toBe(2);
      expect(resultado[2].label).toBe('JUAN PÉREZ');
      expect(resultado[2].valor).toBe(0);

      for (var i = 0; i < resultado.length - 1; i++) {
        expect(resultado[i].valor).toBeGreaterThanOrEqual(resultado[i + 1].valor);
      }
    });
  });

  describe('Comparación case-insensitive del campo comercial', function() {
    it('match del comercial es case-insensitive', function() {
      var lotes = [
        { idLote: '1', fecha: fechaMesActual(5), comercial: 'juan pérez', contratos: 1, estados: {}, estadoPrincipal: 'RADICADO' },
        { idLote: '2', fecha: fechaMesActual(6), comercial: 'Juan Pérez', contratos: 1, estados: {}, estadoPrincipal: 'RADICADO' },
        { idLote: '3', fecha: fechaMesActual(7), comercial: 'JUAN PÉREZ', contratos: 1, estados: {}, estadoPrincipal: 'RADICADO' }
      ];

      var resultado = charts._calcularRanking(lotes, usuarios);
      var juan = resultado.find(function(r) { return r.label === 'JUAN PÉREZ'; });
      expect(juan.valor).toBe(3);
    });
  });

  describe('Manejo de datos edge-case', function() {
    it('lotes null no lanza error', function() {
      expect(function() {
        charts._calcularRanking(null, usuarios);
      }).not.toThrow();

      var resultado = charts._calcularRanking(null, usuarios);
      expect(resultado).toHaveLength(3);
    });

    it('usuarios null retorna array vacío', function() {
      var resultado = charts._calcularRanking([], null);
      expect(resultado).toEqual([]);
    });

    it('usuarios vacío retorna array vacío', function() {
      var resultado = charts._calcularRanking([], []);
      expect(resultado).toEqual([]);
    });

    it('lote con fecha inválida no se cuenta', function() {
      var lotes = [
        { idLote: '1', fecha: 'no-es-fecha', comercial: 'JUAN PÉREZ', contratos: 1, estados: {}, estadoPrincipal: 'RADICADO' },
        { idLote: '2', fecha: '', comercial: 'JUAN PÉREZ', contratos: 1, estados: {}, estadoPrincipal: 'RADICADO' },
        { idLote: '3', fecha: null, comercial: 'JUAN PÉREZ', contratos: 1, estados: {}, estadoPrincipal: 'RADICADO' }
      ];

      var resultado = charts._calcularRanking(lotes, usuarios);
      var juan = resultado.find(function(r) { return r.label === 'JUAN PÉREZ'; });
      expect(juan.valor).toBe(0);
    });

    it('lote con comercial que no está en usuarios no se cuenta en ningún registro', function() {
      var lotes = [
        { idLote: '1', fecha: fechaMesActual(5), comercial: 'DESCONOCIDO', contratos: 1, estados: {}, estadoPrincipal: 'RADICADO' }
      ];

      var resultado = charts._calcularRanking(lotes, usuarios);
      resultado.forEach(function(item) {
        expect(item.valor).toBe(0);
      });
    });

    it('lote sin estadoPrincipal no se cuenta', function() {
      var lotes = [
        { idLote: '1', fecha: fechaMesActual(5), comercial: 'JUAN PÉREZ', contratos: 1, estados: {}, estadoPrincipal: '' },
        { idLote: '2', fecha: fechaMesActual(6), comercial: 'JUAN PÉREZ', contratos: 1, estados: {}, estadoPrincipal: null }
      ];

      var resultado = charts._calcularRanking(lotes, usuarios);
      var juan = resultado.find(function(r) { return r.label === 'JUAN PÉREZ'; });
      expect(juan.valor).toBe(0);
    });

    it('retorna una entrada por cada comercial único en usuarios', function() {
      var resultado = charts._calcularRanking([], usuarios);
      expect(resultado).toHaveLength(3);
      var labels = resultado.map(function(r) { return r.label; });
      expect(labels).toContain('JUAN PÉREZ');
      expect(labels).toContain('MARÍA LÓPEZ');
      expect(labels).toContain('CARLOS RUIZ');
    });

    it('usuarios duplicados (mismo nombre) no generan entradas duplicadas', function() {
      var usuariosDuplicados = [
        { email: 'juan1@test.com', nombre: 'JUAN PÉREZ', rol: 'CONSULTOR', emailDirector: 'dir@test.com', emailGerente: 'ger@test.com', activo: true },
        { email: 'juan2@test.com', nombre: 'JUAN PÉREZ', rol: 'CONSULTOR', emailDirector: 'dir@test.com', emailGerente: 'ger@test.com', activo: true }
      ];

      var resultado = charts._calcularRanking([], usuariosDuplicados);
      expect(resultado).toHaveLength(1);
      expect(resultado[0].label).toBe('JUAN PÉREZ');
    });
  });
});
