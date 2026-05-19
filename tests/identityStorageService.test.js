const {
  IdentityStorageDisabledError,
  buildIdentityObjectKey,
  normalizeExtension,
  validateAllowedMimeType,
  validateMaxFileSize,
  createPresignedUploadUrl,
  headIdentityObjectMetadata,
  getAllowedUploadMaxBytes,
  getPresignTtlSeconds,
  resetLazyClientForTests,
  sanitizeOpaqueSegment,
} = require('../src/services/identityStorageService');

describe('identityStorageService (infra KYC isolada)', () => {
  const prev = { ...process.env };

  beforeEach(() => {
    jest.resetModules();
    resetLazyClientForTests();
    process.env = { ...prev };
    process.env.FEATURE_KYC_ENABLED = 'false';
    delete process.env.KYC_STORAGE_OBJECT_KEY_PREFIX;
  });

  afterAll(() => {
    process.env = { ...prev };
  });

  it('buildIdentityObjectKey monta path opaco identity/{submission}/{artifact}', () => {
    const key = buildIdentityObjectKey({
      userId: 'cluser123xxxxxxxxxxxxxxxxxxxxxxxx',
      submissionId: 'clsubxxxxxxxxxxxxxxxxxxxxxxxx',
      artifactId: 'clartifactxxxxxxxxxxxxxxxxxxxx',
      artifactType: 'DOCUMENT_FRONT',
      extension: 'jpg',
    });
    expect(key).toMatch(/^identity\/clsubxxxxxxxxxxxxxxxxxxxxxxxx\/clartifactxxxxxxxxxxxxxxxxxxxx\.jpg$/);
  });

  it('buildIdentityObjectKey inclui tenant prefix opcional quando env definido', () => {
    process.env.KYC_STORAGE_OBJECT_KEY_PREFIX = 'staging';
    const key = buildIdentityObjectKey({
      userId: 'u1',
      submissionId: 'sub1',
      artifactId: 'art1',
      artifactType: 'SELFIE_PORTRAIT',
    });
    expect(key).toBe('staging/identity/sub1/art1');
  });

  it('buildIdentityObjectKey rejeita segmentos não opacos', () => {
    expect(() =>
      buildIdentityObjectKey({
        userId: 'bad@inject',
        submissionId: 'x',
        artifactId: 'y',
        artifactType: 'DOCUMENT_BACK',
      })
    ).toThrow();
  });

  it('validateAllowedMimeType aceita apenas allowlist ADR típico', () => {
    expect(validateAllowedMimeType('image/jpeg').valid).toBe(true);
    expect(validateAllowedMimeType('application/pdf').valid).toBe(false);
  });

  it('validateMaxFileSize respeita defaults e limites absurdos futuros podem aumentar por env', () => {
    const max = getAllowedUploadMaxBytes();
    expect(max).toBeGreaterThan(1024 * 1024);
    expect(validateMaxFileSize(max + 10).valid).toBe(false);
    expect(validateMaxFileSize(max).valid).toBe(true);
  });

  it('normalizeExtension normaliza entrada', () => {
    expect(normalizeExtension('.JPEG')).toBe('.jpeg');
    expect(() => normalizeExtension('.exe')).toThrow();
  });

  it('getPresignTtlSeconds tem piso/teto sanitizados', () => {
    delete process.env.KYC_PRESIGN_TTL_SECONDS;
    expect(getPresignTtlSeconds()).toBe(900);

    process.env.KYC_PRESIGN_TTL_SECONDS = 'invalid';
    expect(getPresignTtlSeconds()).toBeGreaterThanOrEqual(30);
  });

  it('createPresignedUploadUrl recusa quando FEATURE_KYC_DISABLED', async () => {
    await expect(
      createPresignedUploadUrl({
        objectKey: 'identity/sub/art.jpeg',
        mimeType: 'image/jpeg',
      })
    ).rejects.toThrow(IdentityStorageDisabledError);
  });

  it('headIdentityObjectMetadata recusa quando FEATURE_KYC_DISABLED', async () => {
    await expect(
      headIdentityObjectMetadata({
        objectKey: 'identity/sub/art.jpeg',
      })
    ).rejects.toThrow(IdentityStorageDisabledError);
  });

  it('sanitizeOpaqueSegment documenta segurança básica de segmento', () => {
    expect(sanitizeOpaqueSegment('abc_xyz-12', 'x')).toBe('abc_xyz-12');
    expect(() => sanitizeOpaqueSegment('a/b', 'x')).toThrow();
  });
});
