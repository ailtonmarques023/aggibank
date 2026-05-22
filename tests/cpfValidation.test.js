'use strict';

const { normalizeCpfDigits, isValidCpf } = require('../src/utils/cpfValidation');

describe('cpfValidation', () => {
  it('normalizeCpfDigits remove máscara', () => {
    expect(normalizeCpfDigits('529.982.247-25')).toBe('52998224725');
  });

  it('aceita CPF com dígitos verificadores válidos', () => {
    expect(isValidCpf('52998224725')).toBe(true);
    expect(isValidCpf('390.533.447-05')).toBe(true);
  });

  it('rejeita tamanho diferente de 11', () => {
    expect(isValidCpf('123')).toBe(false);
    expect(isValidCpf('')).toBe(false);
  });

  it('rejeita sequência repetida', () => {
    expect(isValidCpf('11111111111')).toBe(false);
  });

  it('rejeita dígitos verificadores inválidos', () => {
    expect(isValidCpf('12345678901')).toBe(false);
    expect(isValidCpf('52998224726')).toBe(false);
  });
});
