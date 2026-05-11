'use strict';

const { matchPrAndTprForCob, extractGrossFeeNetFromMatch } = require('../src/utils/efiExtratoConciliacaoCsv');

describe('efiExtratoConciliacaoCsv (Fase S.4)', () => {
  const sampleCsv = `CA;Gerencianet;364;1;517613;João da Silva;2021-12-17;2021-12-10;Extrato de Conciliação API Pix;1.0
PR;318548257;E0000000020211108181557703828021;00001000200300000120211104;9.00;12345678908;;;;2021-11-30T20:15:00.358Z
TPR;318548257;E0000000020211108181557703828021;1.00;2021-11-30T20:15:00.358Z
`;

  it('encontra PR+TPR por txid e extrai taxa/líquido', () => {
    const m = matchPrAndTprForCob(
      {
        txid: '00001000200300000120211104',
        endToEndId: null,
        grossAmount: 9,
        amount: 9,
      },
      sampleCsv,
    );
    expect(m.ok).toBe(true);
    expect(m.code).toBe('OK');
    const a = extractGrossFeeNetFromMatch(m);
    expect(a.fee).toBe(1);
    expect(a.net).toBe(8);
    expect(a.gross).toBe(9);
  });

  it('retorna NO_TPR quando não há linha TPR para o e2e', () => {
    const csv = `CA;Gerencianet;364;1;517613;João da Silva;2021-12-17;2021-12-10;Extrato de Conciliação API Pix;1.0
PR;318548257;E0000000020211108181557703828021;00001000200300000120211104;9.00;12345678908;;;;2021-11-30T20:15:00.358Z
`;
    const m = matchPrAndTprForCob(
      { txid: '00001000200300000120211104', grossAmount: 9, amount: 9 },
      csv,
    );
    expect(m.ok).toBe(true);
    expect(m.code).toBe('NO_TPR');
    const a = extractGrossFeeNetFromMatch(m);
    expect(a.fee).toBe(null);
  });

  it('AMBIGUOUS_TPR quando há mais de uma tarifa para o mesmo e2e', () => {
    const csv = `CA;x
PR;1;E2E1;TX1;10.00;;;;;;;
TPR;1;E2E1;0.50;;;;;
TPR;1;E2E1;0.40;;;;;
`;
    const m = matchPrAndTprForCob({ txid: 'TX1', grossAmount: 10, amount: 10 }, csv);
    expect(m.ok).toBe(false);
    expect(m.code).toBe('AMBIGUOUS_TPR');
  });
});
