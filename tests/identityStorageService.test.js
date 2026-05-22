const {
  IdentityStorageDisabledError,
  buildIdentityObjectKey,
  normalizeExtension,
  extensionSegmentForMime,
  validateAllowedMimeType,
  validateMaxFileSize,
  createPresignedUploadUrl,
  headIdentityObjectMetadata,
  getAllowedUploadMaxBytes,
  getAllowedVideoUploadMaxBytes,
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
    delete process.env.KYC_VIDEO_UPLOAD_MAX_BYTES;
    delete process.env.KYC_UPLOAD_MAX_BYTES;
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
    expect(key).not.toMatch(/@|\.com|cpf/i);
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

  it('buildIdentityObjectKey aceita extensão de vídeo para FACE_VIDEO', () => {
    const key = buildIdentityObjectKey({
      userId: 'u1',
      submissionId: 'sub1',
      artifactId: 'art1',
      artifactType: 'FACE_VIDEO',
      extension: 'webm',
    });
    expect(key).toBe('identity/sub1/art1.webm');
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

  describe('validateAllowedMimeType por artifactType (Fatia 2)', () => {
    it('FACE_VIDEO aceita video/webm e video/mp4', () => {
      expect(validateAllowedMimeType('FACE_VIDEO', 'video/webm').valid).toBe(true);
      expect(validateAllowedMimeType('FACE_VIDEO', 'video/mp4').valid).toBe(true);
    });

    it('FACE_VIDEO rejeita image/jpeg', () => {
      expect(validateAllowedMimeType('FACE_VIDEO', 'image/jpeg').valid).toBe(false);
    });

    it.each(['DOCUMENT_FRONT', 'DOCUMENT_BACK', 'SELFIE_PORTRAIT'])(
      '%s rejeita video/mp4 e video/webm',
      (artifactType) => {
        expect(validateAllowedMimeType(artifactType, 'video/mp4').valid).toBe(false);
        expect(validateAllowedMimeType(artifactType, 'video/webm').valid).toBe(false);
      }
    );

    it.each(['DOCUMENT_FRONT', 'DOCUMENT_BACK', 'SELFIE_PORTRAIT'])(
      '%s aceita image/jpeg como antes',
      (artifactType) => {
        expect(validateAllowedMimeType(artifactType, 'image/jpeg').valid).toBe(true);
        expect(validateAllowedMimeType(artifactType, 'image/png').valid).toBe(true);
      }
    );

    it('modo legado (apenas MIME) aceita imagens e rejeita vídeo', () => {
      expect(validateAllowedMimeType('image/jpeg').valid).toBe(true);
      expect(validateAllowedMimeType('video/mp4').valid).toBe(false);
      expect(validateAllowedMimeType('application/pdf').valid).toBe(false);
    });
  });

  describe('validateMaxFileSize por artifactType (Fatia 2)', () => {
    it('limite de imagem usa KYC_UPLOAD_MAX_BYTES', () => {
      process.env.KYC_UPLOAD_MAX_BYTES = String(10 * 1024 * 1024);
      const max = getAllowedUploadMaxBytes();
      expect(max).toBe(10 * 1024 * 1024);
      expect(validateMaxFileSize('DOCUMENT_FRONT', max).valid).toBe(true);
      expect(validateMaxFileSize('DOCUMENT_FRONT', max + 1).valid).toBe(false);
    });

    it('limite de vídeo usa KYC_VIDEO_UPLOAD_MAX_BYTES', () => {
      process.env.KYC_VIDEO_UPLOAD_MAX_BYTES = String(30 * 1024 * 1024);
      const max = getAllowedVideoUploadMaxBytes();
      expect(max).toBe(30 * 1024 * 1024);
      expect(validateMaxFileSize('FACE_VIDEO', max).valid).toBe(true);
      expect(validateMaxFileSize('FACE_VIDEO', max + 1).valid).toBe(false);
    });

    it('modo legado (apenas byteLength) usa limite de imagem', () => {
      const max = getAllowedUploadMaxBytes();
      expect(validateMaxFileSize(max).valid).toBe(true);
      expect(validateMaxFileSize(max + 10).valid).toBe(false);
    });

    it('default de vídeo é 30 MiB quando env ausente', () => {
      expect(getAllowedVideoUploadMaxBytes()).toBe(30 * 1024 * 1024);
    });
  });

  describe('extensões (Fatia 2)', () => {
    it('extensionSegmentForMime: video/webm → webm e .webm no objectKey', () => {
      expect(extensionSegmentForMime('FACE_VIDEO', 'video/webm')).toBe('webm');
      expect(normalizeExtension('webm', 'FACE_VIDEO')).toBe('.webm');
      const key = buildIdentityObjectKey({
        userId: 'u1',
        submissionId: 'sub1',
        artifactId: 'art1',
        artifactType: 'FACE_VIDEO',
        extension: extensionSegmentForMime('FACE_VIDEO', 'video/webm'),
      });
      expect(key).toMatch(/\.webm$/);
    });

    it('extensionSegmentForMime: video/mp4 → mp4 e .mp4 no objectKey', () => {
      expect(extensionSegmentForMime('FACE_VIDEO', 'video/mp4')).toBe('mp4');
      expect(normalizeExtension('mp4', 'FACE_VIDEO')).toBe('.mp4');
    });

    it('normalizeExtension rejeita webm em DOCUMENT_FRONT', () => {
      expect(() => normalizeExtension('webm', 'DOCUMENT_FRONT')).toThrow();
    });

    it('normalizeExtension normaliza entrada de imagem', () => {
      expect(normalizeExtension('.JPEG', 'SELFIE_PORTRAIT')).toBe('.jpeg');
      expect(() => normalizeExtension('.exe', 'DOCUMENT_FRONT')).toThrow();
    });
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
