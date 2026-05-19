/**
 * Execução separada dos testes HTTP/unitários (tests/setup.js moca @prisma/client).
 *
 * RUN_IDENTITY_KYC_DB_TEST=1 npx jest --config jest.identity-kyc.config.js
 */
module.exports = {
  testEnvironment: 'node',
  testMatch: ['**/tests/identityKycPersistence.integration.test.js'],
  verbose: true,
  testTimeout: 30000,
  forceExit: true,
  detectOpenHandles: false,
};
