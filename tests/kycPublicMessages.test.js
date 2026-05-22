'use strict';

const {
  KYC_PUBLIC_MESSAGES,
  getPublicMessageForIdentityStatus,
} = require('../src/constants/kycPublicMessages');

describe('kycPublicMessages', () => {
  it('mensagens canônicas não expõem PII nem antifraude detalhado', () => {
    const all = Object.values(KYC_PUBLIC_MESSAGES).join(' ');
    expect(all).not.toMatch(/cpf|e-mail|email@|serasa|spc|score|renda|negativa|objectKey|assinad/i);
  });

  it('mapeia status públicos conforme Fatia 3', () => {
    expect(getPublicMessageForIdentityStatus('APPROVED')).toBe(KYC_PUBLIC_MESSAGES.APPROVED);
    expect(getPublicMessageForIdentityStatus('UNDER_MANUAL_REVIEW')).toBe(
      KYC_PUBLIC_MESSAGES.UNDER_MANUAL_REVIEW
    );
    expect(getPublicMessageForIdentityStatus('RESUBMISSION_REQUIRED')).toBe(
      KYC_PUBLIC_MESSAGES.RESUBMISSION_REQUIRED
    );
    expect(getPublicMessageForIdentityStatus('REJECTED')).toBe(KYC_PUBLIC_MESSAGES.REJECTED);
    expect(getPublicMessageForIdentityStatus('READY_FOR_REVIEW')).toBe(
      KYC_PUBLIC_MESSAGES.READY_FOR_REVIEW
    );
  });
});
