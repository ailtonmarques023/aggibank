'use strict';

const { sanitizeUrlForAccessLog } = require('../src/utils/logSanitizer');

describe('sanitizeUrlForAccessLog', () => {
  it('mantém pathname quando não há query', () => {
    expect(sanitizeUrlForAccessLog('/api/internal/efi/pix/webhook/pix')).toBe(
      '/api/internal/efi/pix/webhook/pix',
    );
  });

  it('mascara efiwk e preserva ignorar vazio', () => {
    expect(
      sanitizeUrlForAccessLog('/api/internal/efi/pix/webhook/pix?ignorar=&efiwk=abc'),
    ).toBe('/api/internal/efi/pix/webhook/pix?ignorar=&efiwk=***');
  });

  it('mascara token e client_secret', () => {
    expect(sanitizeUrlForAccessLog('/x?a=1&token=abc&client_secret=shh')).toBe('/x?a=1&token=***&client_secret=***');
  });

  it('remove authorization quando aparece na query', () => {
    expect(sanitizeUrlForAccessLog('/x?authorization=Bearer%20abc&b=2')).toBe('/x?b=2');
  });

  it('mascara chaves com secret/cert/base64 por defesa em profundidade', () => {
    expect(sanitizeUrlForAccessLog('/x?my_secret=abc&cert=1&base64=AAAA&ok=1')).toBe(
      '/x?my_secret=***&cert=***&base64=***&ok=1',
    );
  });
});

