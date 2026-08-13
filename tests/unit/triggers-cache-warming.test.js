/**
 * Unit tests para Triggers_CacheWarming.js (Task 9.3)
 *
 * Verifica:
 * - precalentarCacheResumenYLotes() solo ejecuta en horario laboral L-V 7:00-18:00 GMT-5
 * - Fuera de horario retorna sin hacer trabajo
 * - Pre-calienta RESUMEN_GLOBAL y LOTES_GLOBAL para roles LIDER/ADMIN
 * - Pre-calienta RESUMEN_{email} y LOTES_{email} para roles individuales
 * - CacheWrapper_putJSON se invoca con TTL 600
 * - configurarTriggerPrecalentamiento elimina triggers previos y crea uno nuevo
 *
 * Requirements: 7.4
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { readFileSync } from 'fs';
import { resolve } from 'path';

const sourceCode = readFileSync(resolve(__dirname, '../../Triggers_CacheWarming.js'), 'utf-8');

// ─── Tracking variables ────────────────────────────────────────────────────────

var cacheStore = {};
var putCalls = [];
var registrarEventoCalls = [];
var resumenCalls = [];
var lotesCalls = [];
var deletedTriggers = [];
var createdTriggers = [];
var logMessages = [];

function loadSource() {
  const wrapped = `(function() { ${sourceCode}\n;
    globalThis.precalentarCacheResumenYLotes = precalentarCacheResumenYLotes;
    globalThis._precalentarResumenParaEmail = _precalentarResumenParaEmail;
    globalThis._precalentarLotesParaEmail = _precalentarLotesParaEmail;
    globalThis._esHorarioLaboral = _esHorarioLaboral;
    globalThis.configurarTriggerPrecalentamiento = configurarTriggerPrecalentamiento;
  })()`;
  eval(wrapped);
}

// ─── Setup globals ─────────────────────────────────────────────────────────────

function setupGlobals(options = {}) {
  cacheStore = {};
  putCalls = [];
  registrarEventoCalls = [];
  resumenCalls = [];
  lotesCalls = [];
  deletedTriggers = [];
  createdTriggers = [];
  logMessages = [];

  globalThis._registrarEvento_ = function(nivel, archivo, funcion, mensaje) {
    registrarEventoCalls.push({ nivel: nivel, archivo: archivo, funcion: funcion, mensaje: mensaje });
  };

  globalThis.CacheWrapper_putJSON = function(key, obj, ttl) {
    putCalls.push({ key: key, obj: obj, ttl: ttl });
    cacheStore[key] = { obj: obj, ttl: ttl };
  };

  globalThis.CacheWrapper_getJSON = function(key) {
    var entry = cacheStore[key];
    return entry ? entry.obj : null;
  };

  // Mock UsuariosRepo_leerTodos
  globalThis.UsuariosRepo_leerTodos = function() {
    return options.usuarios || [
      { email: 'consultor1@test.com', rol: 'CONSULTOR', activo: true, cupo: 10, emailDirector: 'director@test.com', emailGerente: 'gerente@test.com', emailsAlternos: [] },
      { email: 'consultor2@test.com', rol: 'CONSULTOR', activo: true, cupo: 10, emailDirector: 'director@test.com', emailGerente: 'gerente@test.com', emailsAlternos: [] },
      { email: 'director@test.com', rol: 'DIRECTOR', activo: true, cupo: 20, emailDirector: '', emailGerente: 'gerente@test.com', emailsAlternos: [] },
      { email: 'admin@test.com', rol: 'ADMIN', activo: true, cupo: 999, emailDirector: '', emailGerente: '', emailsAlternos: [] },
      { email: 'inactivo@test.com', rol: 'CONSULTOR', activo: false, cupo: 10, emailDirector: 'director@test.com', emailGerente: 'gerente@test.com', emailsAlternos: [] }
    ];
  };

  // Mock obtenerResumenComercial
  globalThis.obtenerResumenComercial = function(emailFilter) {
    resumenCalls.push(emailFilter);
    return { inducciones: 10, pendienteRadicar: 2, radicado: 3, enAnalisis: 1, terminados: 4 };
  };

  // Mock obtenerLotesDeComercial
  globalThis.obtenerLotesDeComercial = function(emailFilter, pagina, porPagina, filtroEstado, busquedaId) {
    lotesCalls.push({ emailFilter: emailFilter, pagina: pagina, porPagina: porPagina });
    return { datos: [{ id: 'LOTE-001', estado: 'RADICADO' }], total: 1, pagina: 1, totalPaginas: 1 };
  };

  // Mock Utilities.formatDate for timezone handling
  globalThis.Utilities = {
    formatDate: function(date, timezone, format) {
      // Use options to control the "current time" for testing
      if (options.mockHora !== undefined && format === 'H') {
        return String(options.mockHora);
      }
      if (options.mockDiaSemana !== undefined && format === 'u') {
        return String(options.mockDiaSemana);
      }
      // Fallback: simulate a Wednesday at 10am
      if (format === 'H') return '10';
      if (format === 'u') return '3'; // Wednesday
      return '';
    }
  };

  // Mock ScriptApp for trigger configuration
  globalThis.ScriptApp = {
    getProjectTriggers: function() {
      return options.existingTriggers || [];
    },
    deleteTrigger: function(trigger) {
      deletedTriggers.push(trigger);
    },
    newTrigger: function(functionName) {
      var triggerBuilder = {
        _functionName: functionName,
        timeBased: function() {
          return {
            everyMinutes: function(minutes) {
              return {
                create: function() {
                  createdTriggers.push({ functionName: functionName, minutes: minutes });
                }
              };
            }
          };
        }
      };
      return triggerBuilder;
    }
  };

  globalThis.Logger = {
    log: function(msg) {
      logMessages.push(msg);
    }
  };

  // Load the source file into globalThis
  loadSource();
}

function cleanupGlobals() {
  delete globalThis._registrarEvento_;
  delete globalThis.CacheWrapper_putJSON;
  delete globalThis.CacheWrapper_getJSON;
  delete globalThis.UsuariosRepo_leerTodos;
  delete globalThis.obtenerResumenComercial;
  delete globalThis.obtenerLotesDeComercial;
  delete globalThis.Utilities;
  delete globalThis.ScriptApp;
  delete globalThis.Logger;
  delete globalThis.precalentarCacheResumenYLotes;
  delete globalThis._precalentarResumenParaEmail;
  delete globalThis._precalentarLotesParaEmail;
  delete globalThis._esHorarioLaboral;
  delete globalThis.configurarTriggerPrecalentamiento;
}

// ─── Tests ─────────────────────────────────────────────────────────────────────

describe('Triggers_CacheWarming', () => {

  afterEach(() => {
    cleanupGlobals();
  });

  describe('_esHorarioLaboral()', () => {

    it('retorna true un miércoles a las 10:00 (horario laboral)', () => {
      setupGlobals({ mockHora: 10, mockDiaSemana: 3 });
      expect(globalThis._esHorarioLaboral()).toBe(true);
    });

    it('retorna true un lunes a las 7:00 (inicio exacto)', () => {
      setupGlobals({ mockHora: 7, mockDiaSemana: 1 });
      expect(globalThis._esHorarioLaboral()).toBe(true);
    });

    it('retorna true un viernes a las 17:00 (dentro del horario)', () => {
      setupGlobals({ mockHora: 17, mockDiaSemana: 5 });
      expect(globalThis._esHorarioLaboral()).toBe(true);
    });

    it('retorna false un viernes a las 18:00 (fuera del horario)', () => {
      setupGlobals({ mockHora: 18, mockDiaSemana: 5 });
      expect(globalThis._esHorarioLaboral()).toBe(false);
    });

    it('retorna false un miércoles a las 6:00 (antes de las 7:00)', () => {
      setupGlobals({ mockHora: 6, mockDiaSemana: 3 });
      expect(globalThis._esHorarioLaboral()).toBe(false);
    });

    it('retorna false un sábado a las 10:00', () => {
      setupGlobals({ mockHora: 10, mockDiaSemana: 6 });
      expect(globalThis._esHorarioLaboral()).toBe(false);
    });

    it('retorna false un domingo a las 12:00', () => {
      setupGlobals({ mockHora: 12, mockDiaSemana: 7 });
      expect(globalThis._esHorarioLaboral()).toBe(false);
    });
  });

  describe('precalentarCacheResumenYLotes()', () => {

    it('no ejecuta trabajo fuera de horario laboral (sábado)', () => {
      setupGlobals({ mockHora: 10, mockDiaSemana: 6 });
      globalThis.precalentarCacheResumenYLotes();

      expect(resumenCalls).toHaveLength(0);
      expect(lotesCalls).toHaveLength(0);
      expect(putCalls).toHaveLength(0);
    });

    it('no ejecuta trabajo fuera de horario laboral (antes de las 7am)', () => {
      setupGlobals({ mockHora: 5, mockDiaSemana: 2 });
      globalThis.precalentarCacheResumenYLotes();

      expect(resumenCalls).toHaveLength(0);
      expect(lotesCalls).toHaveLength(0);
      expect(putCalls).toHaveLength(0);
    });

    it('pre-calienta RESUMEN_GLOBAL y LOTES_GLOBAL', () => {
      setupGlobals({ mockHora: 9, mockDiaSemana: 2 });
      globalThis.precalentarCacheResumenYLotes();

      var resumenGlobalPut = putCalls.find(c => c.key === 'RESUMEN_GLOBAL');
      var lotesGlobalPut = putCalls.find(c => c.key === 'LOTES_GLOBAL');

      expect(resumenGlobalPut).toBeDefined();
      expect(resumenGlobalPut.ttl).toBe(600);
      expect(lotesGlobalPut).toBeDefined();
      expect(lotesGlobalPut.ttl).toBe(600);
    });

    it('pre-calienta caché individual para CONSULTOR (no verTodos)', () => {
      setupGlobals({ mockHora: 9, mockDiaSemana: 2 });
      globalThis.precalentarCacheResumenYLotes();

      var resumenConsultor1 = putCalls.find(c => c.key === 'RESUMEN_consultor1@test.com');
      var lotesConsultor1 = putCalls.find(c => c.key === 'LOTES_consultor1@test.com');

      expect(resumenConsultor1).toBeDefined();
      expect(resumenConsultor1.ttl).toBe(600);
      expect(lotesConsultor1).toBeDefined();
      expect(lotesConsultor1.ttl).toBe(600);
    });

    it('NO pre-calienta caché individual para ADMIN (usa GLOBAL)', () => {
      setupGlobals({ mockHora: 9, mockDiaSemana: 2 });
      globalThis.precalentarCacheResumenYLotes();

      var resumenAdmin = putCalls.find(c => c.key === 'RESUMEN_admin@test.com');
      expect(resumenAdmin).toBeUndefined();
    });

    it('NO pre-calienta para usuarios inactivos', () => {
      setupGlobals({ mockHora: 9, mockDiaSemana: 2 });
      globalThis.precalentarCacheResumenYLotes();

      var resumenInactivo = putCalls.find(c => c.key === 'RESUMEN_inactivo@test.com');
      expect(resumenInactivo).toBeUndefined();
    });

    it('usa TTL de 600 segundos en todas las entradas', () => {
      setupGlobals({ mockHora: 9, mockDiaSemana: 2 });
      globalThis.precalentarCacheResumenYLotes();

      for (var i = 0; i < putCalls.length; i++) {
        expect(putCalls[i].ttl).toBe(600);
      }
    });

    it('registra evento INFO al completar exitosamente', () => {
      setupGlobals({ mockHora: 9, mockDiaSemana: 2 });
      globalThis.precalentarCacheResumenYLotes();

      var infoEvent = registrarEventoCalls.find(c => c.nivel === 'INFO' && c.funcion === 'precalentarCacheResumenYLotes');
      expect(infoEvent).toBeDefined();
      expect(infoEvent.mensaje).toContain('usuarios activos');
    });

    it('continua si obtenerResumenComercial falla para un usuario individual', () => {
      var callCount = 0;
      setupGlobals({
        mockHora: 9,
        mockDiaSemana: 2,
        usuarios: [
          { email: 'user1@test.com', rol: 'CONSULTOR', activo: true, cupo: 10, emailDirector: '', emailGerente: '', emailsAlternos: [] },
          { email: 'user2@test.com', rol: 'CONSULTOR', activo: true, cupo: 10, emailDirector: '', emailGerente: '', emailsAlternos: [] }
        ]
      });

      // Override obtenerResumenComercial to fail for user1
      globalThis.obtenerResumenComercial = function(emailFilter) {
        callCount++;
        if (emailFilter === 'user1@test.com') throw new Error('Simulated failure');
        resumenCalls.push(emailFilter);
        return { inducciones: 5 };
      };

      globalThis.precalentarCacheResumenYLotes();

      // Should have WARN for user1 but still process user2
      var warnEvent = registrarEventoCalls.find(c => c.nivel === 'WARN' && c.mensaje.indexOf('user1@test.com') !== -1);
      expect(warnEvent).toBeDefined();

      // user2 should still be cached
      var resumenUser2 = putCalls.find(c => c.key === 'RESUMEN_user2@test.com');
      expect(resumenUser2).toBeDefined();
    });

    it('maneja UsuariosRepo_leerTodos retornando vacío', () => {
      setupGlobals({ mockHora: 9, mockDiaSemana: 2, usuarios: [] });
      globalThis.precalentarCacheResumenYLotes();

      expect(putCalls).toHaveLength(0);
      var warnEvent = registrarEventoCalls.find(c => c.nivel === 'WARN');
      expect(warnEvent).toBeDefined();
    });
  });

  describe('configurarTriggerPrecalentamiento()', () => {

    it('elimina triggers existentes de precalentarCacheResumenYLotes', () => {
      var mockTrigger = { getHandlerFunction: function() { return 'precalentarCacheResumenYLotes'; } };
      var otroTrigger = { getHandlerFunction: function() { return 'otraFuncion'; } };

      setupGlobals({ existingTriggers: [mockTrigger, otroTrigger] });
      globalThis.configurarTriggerPrecalentamiento();

      expect(deletedTriggers).toHaveLength(1);
      expect(deletedTriggers[0]).toBe(mockTrigger);
    });

    it('crea un nuevo trigger cada 5 minutos', () => {
      setupGlobals({ existingTriggers: [] });
      globalThis.configurarTriggerPrecalentamiento();

      expect(createdTriggers).toHaveLength(1);
      expect(createdTriggers[0].functionName).toBe('precalentarCacheResumenYLotes');
      expect(createdTriggers[0].minutes).toBe(5);
    });

    it('registra un mensaje en Logger', () => {
      setupGlobals({ existingTriggers: [] });
      globalThis.configurarTriggerPrecalentamiento();

      expect(logMessages.length).toBeGreaterThan(0);
      expect(logMessages[0]).toContain('precalentarCacheResumenYLotes');
    });

    it('es idempotente: elimina y recrea sin duplicar', () => {
      var trigger1 = { getHandlerFunction: function() { return 'precalentarCacheResumenYLotes'; } };
      var trigger2 = { getHandlerFunction: function() { return 'precalentarCacheResumenYLotes'; } };

      setupGlobals({ existingTriggers: [trigger1, trigger2] });
      globalThis.configurarTriggerPrecalentamiento();

      expect(deletedTriggers).toHaveLength(2);
      expect(createdTriggers).toHaveLength(1);
    });
  });
});
