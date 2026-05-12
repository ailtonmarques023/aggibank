'use strict';

/**
 * Intervalo do dia civil em America/Sao_Paulo como instantes UTC.
 * `start` inclusivo, `end` exclusivo (próxima meia-noite em SP).
 *
 * Desde 2019 o Brasil não observa DST; America/Sao_Paulo permanece em UTC−03:00.
 * Se a legislação mudar, preferir biblioteca IANA completa ou reavaliar este util.
 */
function getSaoPauloDayRangeUtc(now = new Date()) {
  const dtf = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Sao_Paulo',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  });
  const parts = dtf.formatToParts(now);
  const y = Number(parts.find((p) => p.type === 'year').value);
  const m = Number(parts.find((p) => p.type === 'month').value);
  const d = Number(parts.find((p) => p.type === 'day').value);
  const startUtcMs = Date.UTC(y, m - 1, d, 3, 0, 0);
  const endUtcMs = Date.UTC(y, m - 1, d + 1, 3, 0, 0);
  return { start: new Date(startUtcMs), end: new Date(endUtcMs) };
}

module.exports = { getSaoPauloDayRangeUtc };
