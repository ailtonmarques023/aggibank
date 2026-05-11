'use strict';

/**
 * Parser do CSV do Extrato de Conciliação API Pix Efí (layout v4.0).
 * Referência: PDF "Extrato_conciliacao_API_Pix_v4.0.pdf" (Efí).
 *
 * Registros relevantes:
 * - PR  (Pix Recebido): PR;protocolo;e2e;txid;valor;...
 * - TPR (Tarifa Pix Recebido): TPR;protocolo;e2e;valorTarifa;horario
 */

function moneyCents(n) {
  const x = Number(String(n).replace(',', '.'));
  if (!Number.isFinite(x)) return null;
  return Math.round(x * 100);
}

function parseExtratoCsvLines(csvText) {
  const raw = String(csvText || '').replace(/\r\n/g, '\n').replace(/\r/g, '\n');
  const lines = raw.split('\n').map((l) => l.trim()).filter(Boolean);
  return lines.map((line) => {
    const cols = line.split(';');
    return { line, cols, type: cols[0] ? String(cols[0]).trim() : '' };
  });
}

/**
 * Encontra linhas PR e TPR correspondentes a uma PixCobranca paga.
 *
 * @param {object} cob — { txid, endToEndId, grossAmount?, amount }
 * @param {string} csvText
 * @returns {{ ok: boolean, code?: string, pr?: object, tpr?: object, prRows?: object[], tprRows?: object[] }}
 */
function matchPrAndTprForCob(cob, csvText) {
  const wantTxid = cob && cob.txid != null ? String(cob.txid).trim() : '';
  const wantE2e = cob && cob.endToEndId != null ? String(cob.endToEndId).trim() : '';
  if (!wantTxid && !wantE2e) {
    return { ok: false, code: 'MISSING_IDENTIFIERS' };
  }

  const rows = parseExtratoCsvLines(csvText);
  const prRows = rows.filter((r) => r.type === 'PR' && r.cols.length >= 5);
  const tprRows = rows.filter((r) => r.type === 'TPR' && r.cols.length >= 5);

  const prMatches = prRows.filter((r) => {
    const pTxid = r.cols[3] != null ? String(r.cols[3]).trim() : '';
    const pE2e = r.cols[2] != null ? String(r.cols[2]).trim() : '';
    if (wantTxid && pTxid && pTxid === wantTxid) return true;
    if (wantE2e && pE2e && pE2e === wantE2e) return true;
    return false;
  });

  if (prMatches.length === 0) {
    return { ok: false, code: 'NO_PR_MATCH', prRows: prMatches, tprRows: [] };
  }
  if (prMatches.length > 1) {
    return { ok: false, code: 'AMBIGUOUS_PR', prRows: prMatches, tprRows: [] };
  }

  const pr = prMatches[0];
  const prE2e = pr.cols[2] != null ? String(pr.cols[2]).trim() : '';
  const prValor = pr.cols[4] != null ? String(pr.cols[4]).trim() : '';
  const prCents = moneyCents(prValor);
  const grossRef =
    cob.grossAmount != null ? moneyCents(cob.grossAmount) : cob.amount != null ? moneyCents(cob.amount) : null;
  if (grossRef != null && prCents != null && grossRef !== prCents) {
    return { ok: false, code: 'GROSS_MISMATCH', prRows: prMatches, tprRows: [] };
  }

  const tprForE2e = tprRows.filter((r) => {
    const tE2e = r.cols[2] != null ? String(r.cols[2]).trim() : '';
    return prE2e && tE2e && tE2e === prE2e;
  });

  if (tprForE2e.length === 0) {
    return { ok: true, code: 'NO_TPR', pr, tpr: null, prRows: prMatches, tprRows: tprForE2e };
  }
  if (tprForE2e.length > 1) {
    return { ok: false, code: 'AMBIGUOUS_TPR', pr, prRows: prMatches, tprRows: tprForE2e };
  }

  const tpr = tprForE2e[0];
  return { ok: true, code: 'OK', pr, tpr, prRows: prMatches, tprRows: tprForE2e };
}

/**
 * Extrai valores numéricos de PR/TPR para persistência.
 * @returns {{ gross: number, fee: number|null, net: number|null }|null}
 */
function extractGrossFeeNetFromMatch(match) {
  if (!match || !match.ok || !match.pr) return null;
  const gross = moneyCents(match.pr.cols[4]);
  if (gross == null) return null;
  if (!match.tpr) {
    return { gross: gross / 100, fee: null, net: null };
  }
  const fee = moneyCents(match.tpr.cols[3]);
  if (fee == null || fee < 0) return null;
  if (fee >= gross) return null;
  return { gross: gross / 100, fee: fee / 100, net: (gross - fee) / 100 };
}

module.exports = {
  parseExtratoCsvLines,
  matchPrAndTprForCob,
  extractGrossFeeNetFromMatch,
  moneyCents,
};
