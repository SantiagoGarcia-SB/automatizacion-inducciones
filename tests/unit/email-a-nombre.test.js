/**
 * Unit tests for emailANombre — canonical email-to-name function.
 * Validates: Requirements 6.1, 6.4, 6.5
 */
import { describe, it, expect, beforeAll } from 'vitest';
import { readFileSync } from 'fs';
import { resolve } from 'path';

// Load the Google Apps Script source into a test-friendly environment
let emailANombre;
let FORMATO_NOMBRE;

beforeAll(() => {
  const sourceCode = readFileSync(
    resolve(__dirname, '../../Utilidades_Nombres.js'),
    'utf-8'
  );
  // Execute in global scope to simulate GAS environment
  const fn = new Function(sourceCode + '\n; return { emailANombre, FORMATO_NOMBRE };');
  const exported = fn();
  emailANombre = exported.emailANombre;
  FORMATO_NOMBRE = exported.FORMATO_NOMBRE;
});

describe('emailANombre', () => {
  describe('formato COMPLETO', () => {
    it('capitalizes each dot-separated segment', () => {
      expect(emailANombre('maria.garcia@empresa.com', 'COMPLETO')).toBe('Maria Garcia');
    });

    it('handles single segment (no dots in local part)', () => {
      expect(emailANombre('maria@empresa.com', 'COMPLETO')).toBe('Maria');
    });

    it('handles three segments', () => {
      expect(emailANombre('juan.carlos.perez@empresa.com', 'COMPLETO')).toBe('Juan Carlos Perez');
    });

    it('normalizes mixed case to proper capitalization', () => {
      expect(emailANombre('MARIA.GARCIA@empresa.com', 'COMPLETO')).toBe('Maria Garcia');
    });

    it('handles all lowercase input', () => {
      expect(emailANombre('santiago.garcia@segurosbolivar.com', 'COMPLETO')).toBe('Santiago Garcia');
    });
  });

  describe('formato MAYUSCULAS', () => {
    it('returns full name in uppercase', () => {
      expect(emailANombre('maria.garcia@empresa.com', 'MAYUSCULAS')).toBe('MARIA GARCIA');
    });

    it('handles single segment', () => {
      expect(emailANombre('pedro@empresa.com', 'MAYUSCULAS')).toBe('PEDRO');
    });

    it('handles already uppercase input', () => {
      expect(emailANombre('JUAN.PEREZ@empresa.com', 'MAYUSCULAS')).toBe('JUAN PEREZ');
    });
  });

  describe('formato PRIMER_NOMBRE', () => {
    it('returns only first segment capitalized', () => {
      expect(emailANombre('maria.garcia@empresa.com', 'PRIMER_NOMBRE')).toBe('Maria');
    });

    it('handles single segment email', () => {
      expect(emailANombre('pedro@empresa.com', 'PRIMER_NOMBRE')).toBe('Pedro');
    });

    it('ignores subsequent segments', () => {
      expect(emailANombre('juan.carlos.perez@empresa.com', 'PRIMER_NOMBRE')).toBe('Juan');
    });
  });

  describe('inputs inválidos — retorna cadena vacía', () => {
    it('returns empty string for null', () => {
      expect(emailANombre(null, 'COMPLETO')).toBe('');
    });

    it('returns empty string for undefined', () => {
      expect(emailANombre(undefined, 'COMPLETO')).toBe('');
    });

    it('returns empty string for empty string', () => {
      expect(emailANombre('', 'COMPLETO')).toBe('');
    });

    it('returns empty string for non-string (number)', () => {
      expect(emailANombre(123, 'COMPLETO')).toBe('');
    });

    it('returns empty string for non-string (boolean)', () => {
      expect(emailANombre(true, 'COMPLETO')).toBe('');
    });

    it('returns empty string for string without @', () => {
      expect(emailANombre('maria.garcia', 'COMPLETO')).toBe('');
    });

    it('returns empty string for string with multiple @', () => {
      expect(emailANombre('maria@garcia@empresa.com', 'COMPLETO')).toBe('');
    });

    it('returns empty string for only-dots local part', () => {
      expect(emailANombre('...@empresa.com', 'COMPLETO')).toBe('');
    });

    it('returns empty string for whitespace-only input', () => {
      expect(emailANombre('   ', 'COMPLETO')).toBe('');
    });
  });

  describe('edge cases', () => {
    it('discards empty segments from consecutive dots', () => {
      expect(emailANombre('maria..garcia@empresa.com', 'COMPLETO')).toBe('Maria Garcia');
    });

    it('handles leading dot in local part', () => {
      expect(emailANombre('.maria@empresa.com', 'COMPLETO')).toBe('Maria');
    });

    it('handles trailing dot in local part', () => {
      expect(emailANombre('maria.@empresa.com', 'COMPLETO')).toBe('Maria');
    });

    it('trims segments with spaces', () => {
      expect(emailANombre('maria .garcia@empresa.com', 'COMPLETO')).toBe('Maria Garcia');
    });

    it('defaults to COMPLETO for unknown format', () => {
      expect(emailANombre('maria.garcia@empresa.com', 'UNKNOWN')).toBe('Maria Garcia');
    });
  });
});
