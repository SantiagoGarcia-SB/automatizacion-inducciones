/**
 * Unit tests for Infraestructura_MemoCache.js
 *
 * Tests memoización behavior of session email, usuarios cache,
 * UUID index, and lote index.
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { createSpreadsheetApp } from '../mocks/spreadsheet-app.mock.js';
import { readFileSync } from 'fs';
import { resolve } from 'path';

const ROOT = resolve(__dirname, '..', '..');
const memoCacheSrc = readFileSync(resolve(ROOT, 'Infraestructura_MemoCache.js'), 'utf8');
const registrySrc = readFileSync(resolve(ROOT, 'Infraestructura_Registry.js'), 'utf8');

// ─── Helpers ─────────────────────────────────────────────────────────────────

function loadSources() {
  // Load Registry first (MemoCache depends on SpreadsheetRegistry_get)
  const wrappedRegistry = `(function() { ${registrySrc}\n; globalThis._spreadsheetRegistry = _spreadsheetRegistry; globalThis.SpreadsheetRegistry_get = SpreadsheetRegistry_get; globalThis.SpreadsheetRegistry_has = SpreadsheetRegistry_has; })()`;
  eval(wrappedRegistry);

  // Load MemoCache
  const wrappedMemoCache = `(function() { ${memoCacheSrc}\n; globalThis._sessionEmail = _sessionEmail; globalThis._cacheUsuariosTodos = _cacheUsuariosTodos; globalThis._indiceUuidFila = _indiceUuidFila; globalThis._indiceLoteFila = _indiceLoteFila; globalThis.MemoCache_getSessionEmail = MemoCache_getSessionEmail; globalThis.MemoCache_getUsuarios = MemoCache_getUsuarios; globalThis.MemoCache_getIndiceUuid = MemoCache_getIndiceUuid; globalThis.MemoCache_getIndiceLote = MemoCache_getIndiceLote; })()`;
  eval(wrappedMemoCache);
}

function setupGlobals(sheetsConfig = {}) {
  const app = createSpreadsheetApp(sheetsConfig);
  globalThis.SpreadsheetApp = app;
  globalThis.ID_HOJA_CONTROL = 'mock-control-id';

  // Column constants from UsuariosRepo
  globalThis.COL_EMAIL = 0;
  globalThis.COL_ROL = 1;
  globalThis.COL_ACTIVO = 2;
  globalThis.COL_EMAIL_DIRECTOR = 3;
  globalThis.COL_EMAIL_GERENTE = 4;
  globalThis.COL_EMAILS_ALTERNOS = 5;
  globalThis.COL_CUPO = 6;

  // Mock getHojaControlId
  globalThis.getHojaControlId = () => 'mock-control-id';

  // Mock _registrarEvento_
  globalThis._registrarEvento_ = () => {};

  // Mock Session
  globalThis.Session = {
    getActiveUser: () => ({
      getEmail: () => 'TestUser@Example.COM'
    })
  };

  loadSources();
  return app;
}

function cleanupGlobals() {
  delete globalThis.SpreadsheetApp;
  delete globalThis.ID_HOJA_CONTROL;
  delete globalThis.COL_EMAIL;
  delete globalThis.COL_ROL;
  delete globalThis.COL_ACTIVO;
  delete globalThis.COL_EMAIL_DIRECTOR;
  delete globalThis.COL_EMAIL_GERENTE;
  delete globalThis.COL_EMAILS_ALTERNOS;
  delete globalThis.COL_CUPO;
  delete globalThis.getHojaControlId;
  delete globalThis._registrarEvento_;
  delete globalThis.Session;
  delete globalThis._sessionEmail;
  delete globalThis._cacheUsuariosTodos;
  delete globalThis._indiceUuidFila;
  delete globalThis._indiceLoteFila;
  delete globalThis._spreadsheetRegistry;
  delete globalThis.SpreadsheetRegistry_get;
  delete globalThis.SpreadsheetRegistry_has;
  delete globalThis.MemoCache_getSessionEmail;
  delete globalThis.MemoCache_getUsuarios;
  delete globalThis.MemoCache_getIndiceUuid;
  delete globalThis.MemoCache_getIndiceLote;
}

// ─── Tests ───────────────────────────────────────────────────────────────────

describe('MemoCache_getSessionEmail', () => {
  beforeEach(() => setupGlobals());
  afterEach(cleanupGlobals);

  it('returns the email normalized to lowercase', () => {
    const email = MemoCache_getSessionEmail();
    expect(email).toBe('testuser@example.com');
  });

  it('memoizes — Session.getActiveUser().getEmail() called only once', () => {
    let callCount = 0;
    globalThis.Session = {
      getActiveUser: () => ({
        getEmail: () => { callCount++; return 'User@Test.COM'; }
      })
    };
    // Reset the memo variable
    globalThis._sessionEmail = null;

    // Re-load to pick up fresh _sessionEmail
    loadSources();

    const email1 = MemoCache_getSessionEmail();
    const email2 = MemoCache_getSessionEmail();
    const email3 = MemoCache_getSessionEmail();

    expect(email1).toBe('user@test.com');
    expect(email2).toBe('user@test.com');
    expect(email3).toBe('user@test.com');
    expect(callCount).toBe(1);
  });

  it('handles empty email gracefully', () => {
    globalThis.Session = {
      getActiveUser: () => ({
        getEmail: () => ''
      })
    };
    globalThis._sessionEmail = null;
    loadSources();

    const email = MemoCache_getSessionEmail();
    expect(email).toBe('');
  });
});

describe('MemoCache_getUsuarios', () => {
  const USUARIOS_DATA = [
    ['EMAIL', 'ROL', 'ACTIVO', 'EMAIL_DIRECTOR', 'EMAIL_GERENTE', 'EMAILS_ALTERNOS', 'CUPO'],
    ['ana@test.com', 'ANALISTA', true, 'director@test.com', 'gerente@test.com', '', 5],
    ['pedro@test.com', 'DIRECTOR', true, '', 'gerente@test.com', 'pedro2@test.com,pedro3@test.com', 10],
    ['', 'CONSULTOR', true, '', '', '', 0], // fila sin email — se ignora
  ];

  beforeEach(() => {
    setupGlobals({ 'USUARIOS': USUARIOS_DATA });
  });
  afterEach(cleanupGlobals);

  it('returns parsed usuarios from the USUARIOS sheet', () => {
    const usuarios = MemoCache_getUsuarios();
    expect(usuarios).toHaveLength(2);
    expect(usuarios[0]).toEqual({
      email: 'ana@test.com',
      rol: 'ANALISTA',
      activo: true,
      cupo: 5,
      emailDirector: 'director@test.com',
      emailGerente: 'gerente@test.com',
      emailsAlternos: []
    });
    expect(usuarios[1].emailsAlternos).toEqual(['pedro2@test.com', 'pedro3@test.com']);
  });

  it('memoizes — sheet is read only once across multiple calls', () => {
    const usuarios1 = MemoCache_getUsuarios();
    const usuarios2 = MemoCache_getUsuarios();
    const usuarios3 = MemoCache_getUsuarios();

    // Same reference (memoized)
    expect(usuarios1).toBe(usuarios2);
    expect(usuarios2).toBe(usuarios3);
  });

  it('returns empty array if USUARIOS sheet does not exist', () => {
    cleanupGlobals();
    setupGlobals({});

    const usuarios = MemoCache_getUsuarios();
    expect(usuarios).toEqual([]);
  });

  it('returns empty array if USUARIOS has only headers (less than 2 rows)', () => {
    cleanupGlobals();
    setupGlobals({
      'USUARIOS': [['EMAIL', 'ROL', 'ACTIVO', 'EMAIL_DIRECTOR', 'EMAIL_GERENTE', 'EMAILS_ALTERNOS', 'CUPO']]
    });

    const usuarios = MemoCache_getUsuarios();
    expect(usuarios).toEqual([]);
  });
});

describe('MemoCache_getIndiceUuid', () => {
  beforeEach(() => setupGlobals());
  afterEach(cleanupGlobals);

  it('builds UUID → row number index from Control_General data', () => {
    // Create mock data: col 61 (BJ) has UUIDs
    const headers = new Array(62).fill('');
    headers[61] = 'UUID_SISTEMA';

    const row1 = new Array(62).fill('');
    row1[61] = 'uuid-abc-123';

    const row2 = new Array(62).fill('');
    row2[61] = 'uuid-def-456';

    const row3 = new Array(62).fill('');
    row3[61] = ''; // empty UUID — should be excluded

    const datos = [headers, row1, row2, row3];

    const indice = MemoCache_getIndiceUuid(datos);

    // Row at index 1 → filaNum = 1 + 1 = 2
    expect(indice['uuid-abc-123']).toBe(2);
    // Row at index 2 → filaNum = 2 + 1 = 3
    expect(indice['uuid-def-456']).toBe(3);
    // Empty UUID should not be in the index
    expect(indice['']).toBeUndefined();
  });

  it('memoizes — returns cached index on subsequent calls without data', () => {
    const headers = new Array(62).fill('');
    const row1 = new Array(62).fill('');
    row1[61] = 'uuid-first';
    const datos = [headers, row1];

    const indice1 = MemoCache_getIndiceUuid(datos);
    const indice2 = MemoCache_getIndiceUuid(); // no data — should return cached

    expect(indice1).toBe(indice2);
    expect(indice2['uuid-first']).toBe(2);
  });

  it('rebuilds index when new data is provided', () => {
    const headers = new Array(62).fill('');
    const row1 = new Array(62).fill('');
    row1[61] = 'uuid-old';

    MemoCache_getIndiceUuid([headers, row1]);

    // Provide new data
    const row2 = new Array(62).fill('');
    row2[61] = 'uuid-new';
    const indice = MemoCache_getIndiceUuid([headers, row2]);

    expect(indice['uuid-old']).toBeUndefined();
    expect(indice['uuid-new']).toBe(2);
  });

  it('returns empty object for empty dataset', () => {
    const indice = MemoCache_getIndiceUuid([['header']]);
    expect(indice).toEqual({});
  });
});

describe('MemoCache_getIndiceLote', () => {
  beforeEach(() => setupGlobals());
  afterEach(cleanupGlobals);

  it('builds loteId → [row numbers] index from Control_General data', () => {
    const datos = [
      ['ID_LOTE', 'col2'],
      ['LOTE-001', 'data1'],
      ['LOTE-001', 'data2'],
      ['LOTE-002', 'data3'],
      ['', 'data4'], // empty lote — excluded
      ['LOTE-001', 'data5'],
    ];

    const indice = MemoCache_getIndiceLote(datos);

    // LOTE-001 appears at indices 1, 2, 5 → rows 2, 3, 6
    expect(indice['LOTE-001']).toEqual([2, 3, 6]);
    // LOTE-002 appears at index 3 → row 4
    expect(indice['LOTE-002']).toEqual([4]);
    // Empty string should not be in the index
    expect(indice['']).toBeUndefined();
  });

  it('memoizes — returns cached index on subsequent calls without data', () => {
    const datos = [
      ['ID_LOTE'],
      ['LOTE-X'],
    ];

    const indice1 = MemoCache_getIndiceLote(datos);
    const indice2 = MemoCache_getIndiceLote(); // no data — should return cached

    expect(indice1).toBe(indice2);
    expect(indice2['LOTE-X']).toEqual([2]);
  });

  it('rebuilds index when new data is provided', () => {
    MemoCache_getIndiceLote([['ID_LOTE'], ['LOTE-OLD']]);

    const indice = MemoCache_getIndiceLote([['ID_LOTE'], ['LOTE-NEW']]);

    expect(indice['LOTE-OLD']).toBeUndefined();
    expect(indice['LOTE-NEW']).toEqual([2]);
  });

  it('handles single-element dataset (only headers)', () => {
    const indice = MemoCache_getIndiceLote([['ID_LOTE']]);
    expect(indice).toEqual({});
  });
});
