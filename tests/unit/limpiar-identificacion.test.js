/**
 * Regresión: identificaciones que Excel guarda con ruido de punto flotante
 * (52905167 → 52905166.999999985) terminaban como "52905166999999985".
 */
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'fs';
import { resolve } from 'path';

const sourceCode = readFileSync(resolve(__dirname, '../../Codigo.js'), 'utf-8');
eval(`(function() { ${sourceCode}\n; globalThis.limpiarIdentificacion = _limpiarIdentificacion_; })()`);

describe('_limpiarIdentificacion_', () => {
  it('redondea números con ruido de punto flotante', () => {
    expect(limpiarIdentificacion(52905166.999999985)).toBe('52905167');
    expect(limpiarIdentificacion(52905167.000000015)).toBe('52905167');
    expect(limpiarIdentificacion(52905167)).toBe('52905167');
  });

  it('quita la coma final y separadores de miles en texto', () => {
    expect(limpiarIdentificacion('52905167,')).toBe('52905167');
    expect(limpiarIdentificacion('1.032.456.789')).toBe('1032456789');
    expect(limpiarIdentificacion('52,905,167')).toBe('52905167');
    expect(limpiarIdentificacion(' 52 905 167 ')).toBe('52905167');
  });

  it('deja intactos pasaportes y NIT con dígito de verificación', () => {
    expect(limpiarIdentificacion('A1234567')).toBe('A1234567');
    expect(limpiarIdentificacion('900123456-7')).toBe('900123456-7');
  });

  it('retorna vacío si no hay dato', () => {
    expect(limpiarIdentificacion('')).toBe('');
    expect(limpiarIdentificacion(null)).toBe('');
    expect(limpiarIdentificacion(undefined)).toBe('');
  });
});
