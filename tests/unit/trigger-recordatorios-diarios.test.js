/**
 * Unit tests para configurarTriggerRecordatoriosDiarios() (Task 11.4)
 *
 * Verifica:
 * - Elimina triggers existentes de enviarRecordatoriosPazYSalvoDiario
 * - Elimina triggers existentes de enviarRecordatoriosErrorTercerosDiario
 * - Elimina triggers existentes de ejecutarRecordatoriosDiarios (idempotente)
 * - Crea un único trigger para ejecutarRecordatoriosDiarios diario a las 8:00am Colombia
 * - No elimina triggers de funciones no relacionadas
 *
 * Requirements: 3.2
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { readFileSync } from 'fs';
import { resolve } from 'path';

const sourceCode = readFileSync(resolve(__dirname, '../../Notificaciones.js'), 'utf-8');

// ─── Tracking variables ────────────────────────────────────────────────────────

var deletedTriggers = [];
var createdTriggers = [];
var logMessages = [];

function loadSource(options = {}) {
  deletedTriggers = [];
  createdTriggers = [];
  logMessages = [];

  // ── Mocks mínimos para que el archivo cargue sin error ──
  globalThis.PropertiesService = {
    getScriptProperties: function() {
      return {
        getProperty: function() { return 'test@test.com'; }
      };
    }
  };

  globalThis._registrarEvento_ = function() {};
  globalThis.SpreadsheetRegistry_get = function() { return {}; };
  globalThis.ID_HOJA_CONTROL = 'mock-id';
  globalThis.BatchWriter_escribir = function() {};
  globalThis.MailApp = { getRemainingDailyQuota: function() { return 100; }, sendEmail: function() {} };
  globalThis.emailANombre = function() { return 'Test'; };
  globalThis.obtenerCadenaJerarquica = function() { return []; };

  globalThis.ScriptApp = {
    getProjectTriggers: function() {
      return options.existingTriggers || [];
    },
    deleteTrigger: function(trigger) {
      deletedTriggers.push(trigger);
    },
    newTrigger: function(functionName) {
      var builder = {
        _fn: functionName,
        timeBased: function() {
          return {
            atHour: function(h) {
              builder._hour = h;
              return {
                nearMinute: function(m) {
                  builder._minute = m;
                  return {
                    everyDays: function(d) {
                      builder._days = d;
                      return {
                        inTimezone: function(tz) {
                          builder._timezone = tz;
                          return {
                            create: function() {
                              createdTriggers.push({
                                functionName: functionName,
                                hour: builder._hour,
                                minute: builder._minute,
                                days: builder._days,
                                timezone: builder._timezone
                              });
                            }
                          };
                        }
                      };
                    }
                  };
                }
              };
            }
          };
        }
      };
      return builder;
    }
  };

  globalThis.Logger = {
    log: function(msg) {
      logMessages.push(msg);
    }
  };

  // Cargar solo la función configurarTriggerRecordatoriosDiarios
  const wrapped = `(function() { ${sourceCode}\n;
    globalThis.configurarTriggerRecordatoriosDiarios = configurarTriggerRecordatoriosDiarios;
  })()`;
  eval(wrapped);
}

function cleanupGlobals() {
  delete globalThis.PropertiesService;
  delete globalThis._registrarEvento_;
  delete globalThis.SpreadsheetRegistry_get;
  delete globalThis.ID_HOJA_CONTROL;
  delete globalThis.BatchWriter_escribir;
  delete globalThis.MailApp;
  delete globalThis.emailANombre;
  delete globalThis.obtenerCadenaJerarquica;
  delete globalThis.ScriptApp;
  delete globalThis.Logger;
  delete globalThis.configurarTriggerRecordatoriosDiarios;
}

// ─── Tests ─────────────────────────────────────────────────────────────────────

describe('configurarTriggerRecordatoriosDiarios()', () => {

  afterEach(() => {
    cleanupGlobals();
  });

  it('elimina triggers existentes de enviarRecordatoriosPazYSalvoDiario', () => {
    var triggerPazYSalvo = { getHandlerFunction: function() { return 'enviarRecordatoriosPazYSalvoDiario'; } };
    var triggerOtro = { getHandlerFunction: function() { return 'otraFuncion'; } };

    loadSource({ existingTriggers: [triggerPazYSalvo, triggerOtro] });
    globalThis.configurarTriggerRecordatoriosDiarios();

    expect(deletedTriggers).toContain(triggerPazYSalvo);
    expect(deletedTriggers).not.toContain(triggerOtro);
  });

  it('elimina triggers existentes de enviarRecordatoriosErrorTercerosDiario', () => {
    var triggerError = { getHandlerFunction: function() { return 'enviarRecordatoriosErrorTercerosDiario'; } };

    loadSource({ existingTriggers: [triggerError] });
    globalThis.configurarTriggerRecordatoriosDiarios();

    expect(deletedTriggers).toContain(triggerError);
  });

  it('elimina trigger existente de ejecutarRecordatoriosDiarios (idempotente)', () => {
    var triggerExistente = { getHandlerFunction: function() { return 'ejecutarRecordatoriosDiarios'; } };

    loadSource({ existingTriggers: [triggerExistente] });
    globalThis.configurarTriggerRecordatoriosDiarios();

    expect(deletedTriggers).toContain(triggerExistente);
  });

  it('elimina los tres triggers cuando todos existen', () => {
    var t1 = { getHandlerFunction: function() { return 'enviarRecordatoriosPazYSalvoDiario'; } };
    var t2 = { getHandlerFunction: function() { return 'enviarRecordatoriosErrorTercerosDiario'; } };
    var t3 = { getHandlerFunction: function() { return 'ejecutarRecordatoriosDiarios'; } };
    var t4 = { getHandlerFunction: function() { return 'sincronizarUnificado'; } };

    loadSource({ existingTriggers: [t1, t2, t3, t4] });
    globalThis.configurarTriggerRecordatoriosDiarios();

    expect(deletedTriggers).toHaveLength(3);
    expect(deletedTriggers).toContain(t1);
    expect(deletedTriggers).toContain(t2);
    expect(deletedTriggers).toContain(t3);
    expect(deletedTriggers).not.toContain(t4);
  });

  it('crea un único trigger para ejecutarRecordatoriosDiarios', () => {
    loadSource({ existingTriggers: [] });
    globalThis.configurarTriggerRecordatoriosDiarios();

    expect(createdTriggers).toHaveLength(1);
    expect(createdTriggers[0].functionName).toBe('ejecutarRecordatoriosDiarios');
  });

  it('configura el trigger a las 8:00am hora Colombia', () => {
    loadSource({ existingTriggers: [] });
    globalThis.configurarTriggerRecordatoriosDiarios();

    expect(createdTriggers[0].hour).toBe(8);
    expect(createdTriggers[0].minute).toBe(0);
    expect(createdTriggers[0].timezone).toBe('America/Bogota');
  });

  it('configura ejecución diaria (everyDays=1)', () => {
    loadSource({ existingTriggers: [] });
    globalThis.configurarTriggerRecordatoriosDiarios();

    expect(createdTriggers[0].days).toBe(1);
  });

  it('registra mensaje de confirmación en Logger', () => {
    loadSource({ existingTriggers: [] });
    globalThis.configurarTriggerRecordatoriosDiarios();

    expect(logMessages.length).toBeGreaterThan(0);
    expect(logMessages[0]).toContain('ejecutarRecordatoriosDiarios');
  });

  it('no elimina triggers de funciones no relacionadas', () => {
    var triggerNoRelacionado = { getHandlerFunction: function() { return 'precalentarCacheResumenYLotes'; } };

    loadSource({ existingTriggers: [triggerNoRelacionado] });
    globalThis.configurarTriggerRecordatoriosDiarios();

    expect(deletedTriggers).toHaveLength(0);
  });

  it('es idempotente: ejecutar dos veces no duplica triggers', () => {
    loadSource({ existingTriggers: [] });
    globalThis.configurarTriggerRecordatoriosDiarios();

    // Simular que ahora hay un trigger de ejecutarRecordatoriosDiarios
    var triggerCreado = { getHandlerFunction: function() { return 'ejecutarRecordatoriosDiarios'; } };
    deletedTriggers = [];
    createdTriggers = [];
    globalThis.ScriptApp.getProjectTriggers = function() { return [triggerCreado]; };

    globalThis.configurarTriggerRecordatoriosDiarios();

    expect(deletedTriggers).toContain(triggerCreado);
    expect(createdTriggers).toHaveLength(1);
  });
});
