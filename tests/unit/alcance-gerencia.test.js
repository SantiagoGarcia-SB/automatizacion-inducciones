import { describe, expect, it } from 'vitest';
import { readFileSync } from 'fs';
import { resolve } from 'path';

const sourceCode = readFileSync(
  resolve(__dirname, '../../Repositorios_UsuariosRepo.js'),
  'utf-8'
);

const USUARIOS = [
  { email: 'gerente@empresa.com', rol: 'GERENTE', activo: true, emailDirector: '', emailGerente: '', emailsAlternos: [] },
  { email: 'director.a@empresa.com', rol: 'DIRECTOR', activo: true, emailDirector: '', emailGerente: 'gerente@empresa.com', emailsAlternos: [] },
  { email: 'director.b@empresa.com', rol: 'DIRECTOR', activo: true, emailDirector: '', emailGerente: 'gerente@empresa.com', emailsAlternos: [] },
  { email: 'director.otro@empresa.com', rol: 'DIRECTOR', activo: true, emailDirector: '', emailGerente: 'otro-gerente@empresa.com', emailsAlternos: [] },
  { email: 'comercial.a@empresa.com', rol: 'CONSULTOR', activo: true, emailDirector: 'director.a@empresa.com', emailGerente: '', emailsAlternos: [] },
  { email: 'comercial.b@empresa.com', rol: 'CONSULTOR', activo: true, emailDirector: 'director.b@empresa.com', emailGerente: '', emailsAlternos: [] },
  { email: 'comercial.otro@empresa.com', rol: 'CONSULTOR', activo: true, emailDirector: 'director.otro@empresa.com', emailGerente: '', emailsAlternos: [] },
  { email: 'director.inactivo@empresa.com', rol: 'DIRECTOR', activo: false, emailDirector: '', emailGerente: 'gerente@empresa.com', emailsAlternos: [] }
];

function cargarRepositorio(usuarios) {
  const factory = new Function('usuarios', `
    function MemoCache_getUsuarios() { return usuarios; }
    function emailANombre(email) { return String(email || '').split('@')[0]; }
    ${sourceCode}
    return {
      resolver: UsuariosRepo_resolverAlcanceDirector,
      opciones: UsuariosRepo_getOpcionesAlcanceDirector
    };
  `);
  return factory(usuarios.map((usuario) => ({ ...usuario })));
}

describe('UsuariosRepo_resolverAlcanceDirector', () => {
  it('mantiene Mi equipo como alcance predeterminado', () => {
    const { resolver } = cargarRepositorio(USUARIOS);

    expect(resolver('director.a@empresa.com')).toEqual([
      'director.a@empresa.com',
      'comercial.a@empresa.com'
    ]);
  });

  it('permite consultar el equipo de un Director activo de la misma gerencia', () => {
    const { resolver } = cargarRepositorio(USUARIOS);

    expect(resolver('director.a@empresa.com', {
      tipo: 'EQUIPO_DIRECTOR',
      directorEmail: 'director.b@empresa.com'
    })).toEqual([
      'director.b@empresa.com',
      'comercial.b@empresa.com'
    ]);
  });

  it('permite consultar todos los equipos de la misma gerencia', () => {
    const { resolver } = cargarRepositorio(USUARIOS);

    expect(resolver('director.a@empresa.com', { tipo: 'TODA_GERENCIA' })).toEqual([
      'director.a@empresa.com',
      'comercial.a@empresa.com',
      'director.b@empresa.com',
      'comercial.b@empresa.com',
      'director.inactivo@empresa.com'
    ]);
  });

  it('rechaza directores de otra gerencia y claves inesperadas', () => {
    const { resolver } = cargarRepositorio(USUARIOS);

    expect(() => resolver('director.a@empresa.com', {
      tipo: 'EQUIPO_DIRECTOR',
      directorEmail: 'director.otro@empresa.com'
    })).toThrow('ALCANCE_INVALIDO');

    expect(() => resolver('director.a@empresa.com', {
      tipo: 'TODA_GERENCIA',
      permisoForzado: true
    })).toThrow('ALCANCE_INVALIDO');
  });

  it('expone únicamente pares activos y la opción de toda la gerencia', () => {
    const { opciones } = cargarRepositorio(USUARIOS);

    expect(opciones('director.a@empresa.com')).toEqual([
      { tipo: 'MI_EQUIPO', nombre: 'Mi equipo' },
      { tipo: 'EQUIPO_DIRECTOR', directorEmail: 'director.b@empresa.com', nombre: 'Equipo de director.b' },
      { tipo: 'TODA_GERENCIA', nombre: 'Toda mi gerencia' }
    ]);
  });
});
