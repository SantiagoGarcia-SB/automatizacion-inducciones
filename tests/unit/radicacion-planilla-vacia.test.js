/**
 * Regresiones de estructura para la radicación de inducciones.
 */
import { afterEach, describe, expect, it, vi } from 'vitest';
import { readFileSync } from 'fs';
import { resolve } from 'path';

const sourceCode = readFileSync(resolve(__dirname, '../../Codigo.js'), 'utf-8');
const ENCABEZADOS_OFICIALES = [
  'Aseguradora Anterior', 'Fecha Inicio de Contrato', 'Amparo integral', 'Destino', 'Ciudad del inmueble', 'Dirección', 'Cánon', 'Administración', 'IVA', 'Nombre del Inquilino', 'Tipo de Documento (INQ)', 'Número de Identificación (INQ)', 'Celular (INQ)', 'Correo Electrónico (INQ)',
  'Nombre del Codeudor (1)', 'Tipo de Documento (COA 1)', 'Número de Identificación (COA 1)', 'Celular (COA 1)', 'Correo Electrónico (COA 1)',
  'Nombre del Codeudor (2)', 'Tipo de Documento (COA 2)', 'Número de Identificación (COA 2)', 'Celular (COA 2)', 'Correo Electrónico (COA 2)',
  'Nombre del Codeudor (3)', 'Tipo de Documento (COA 3)', 'Número de Identificación (COA 3)', 'Celular (COA 3)', 'Correo Electrónico (COA 3)',
  'Nombre del Codeudor (4)', 'Tipo de Documento (COA 4)', 'Número de Identificación (COA 4)', 'Celular (COA 4)', 'Correo Electrónico (COA 4)',
  'Nombre del Codeudor (5)', 'Tipo de Documento (COA 5)', 'Número de Identificación (COA 5)', 'Celular (COA 5)', 'Correo Electrónico (COA 5)'
];

function crearPlanilla(filas, encabezados = ENCABEZADOS_OFICIALES) {
  return [
    ['Tipo Negociacion', 'RIESGO PROPIO'],
    ['Número de Poliza', '2180'],
    ['Nombre Inmobiliaria', 'INMOBILIARIA DE PRUEBA'],
    encabezados,
    ...filas
  ];
}

function cargarMotor() {
  const hojaLog = { appendRow: vi.fn() };
  const hojaMaestra = { getLastRow: vi.fn(), getMaxColumns: vi.fn() };
  const liberarLock = vi.fn();
  const enviarNotificacion = vi.fn();

  globalThis.LockService = {
    getScriptLock: function() {
      return { tryLock: function() { return true; }, releaseLock: liberarLock };
    }
  };
  globalThis.Session = { getActiveUser: function() { return { getEmail: function() { return 'comercial@prueba.com'; } }; } };
  globalThis.SpreadsheetApp = {
    openById: function() {
      return {
        getSheetByName: function(nombre) {
          return nombre === 'Hoja_Control' ? hojaLog : hojaMaestra;
        }
      };
    }
  };
  globalThis.Utilities = {
    base64Decode: function() { return []; },
    newBlob: function() { return {}; }
  };
  globalThis.enviarLasNotificaciones = enviarNotificacion;

  const wrapped = `(function() { ${sourceCode}\n; globalThis.motorDeAuditoria = motorDeAuditoria; globalThis.validarEstructuraPlanilla = _validarEstructuraPlanilla_; })()`;
  eval(wrapped);

  return { enviarNotificacion, hojaLog, hojaMaestra, liberarLock };
}

function crearSolicitud(excelParseado) {
  return {
    poliza: '2180',
    observaciones: '',
    excel: {
      bytes: 'data:application/vnd.openxmlformats-officedocument.spreadsheetml.sheet;base64,AA==',
      nombre: 'planilla.xlsx',
      tipo: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
    },
    excelParseado: excelParseado
  };
}

function eliminarEntorno() {
  delete globalThis.LockService;
  delete globalThis.Session;
  delete globalThis.SpreadsheetApp;
  delete globalThis.Utilities;
  delete globalThis.enviarLasNotificaciones;
  delete globalThis.motorDeAuditoria;
  delete globalThis.validarEstructuraPlanilla;
}

describe('validación estricta de la plantilla de inducciones', () => {
  afterEach(eliminarEntorno);

  it('acepta el contrato canónico de tres metadatos y 39 encabezados A:AM', () => {
    cargarMotor();
    const errores = globalThis.validarEstructuraPlanilla(crearPlanilla([new Array(39).fill('')]));

    expect(errores).toEqual([]);
  });

  it('rechaza la columna adicional Actividad y señala el encabezado desplazado', () => {
    const entorno = cargarMotor();
    const encabezadosDesplazados = [...ENCABEZADOS_OFICIALES];
    encabezadosDesplazados.splice(4, 0, 'Actividad');

    const resultado = globalThis.motorDeAuditoria(crearSolicitud(crearPlanilla([["dato"]], encabezadosDesplazados)));

    expect(resultado.status).toBe('ERROR');
    expect(resultado.detalles).toEqual([expect.objectContaining({ fila: 4, col: 5, campo: 'ENCABEZADO' })]);
    expect(resultado.detalles[0].motivo).toContain('Ciudad del inmueble');
    expect(resultado.detalles[0].motivo).toContain('Actividad');
    expect(entorno.hojaLog.appendRow).not.toHaveBeenCalled();
    expect(entorno.enviarNotificacion).not.toHaveBeenCalled();
  });

  it('devuelve error y no registra ni notifica una planilla canónica sin contratos reconocibles', () => {
    const entorno = cargarMotor();
    const planillaSinInquilinos = crearPlanilla([['fila con datos sin inquilino']]);

    const resultado = globalThis.motorDeAuditoria(crearSolicitud(planillaSinInquilinos));

    expect(resultado.status).toBe('ERROR');
    expect(resultado.detalles).toEqual([expect.objectContaining({ campo: 'PLANILLA' })]);
    expect(entorno.hojaLog.appendRow).not.toHaveBeenCalled();
    expect(entorno.hojaMaestra.getLastRow).not.toHaveBeenCalled();
    expect(entorno.enviarNotificacion).not.toHaveBeenCalled();
    expect(entorno.liberarLock).toHaveBeenCalledOnce();
  });
});
