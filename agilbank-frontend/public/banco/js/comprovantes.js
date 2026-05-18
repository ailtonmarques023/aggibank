/**
 * Meus comprovantes — somente leitura via GET /api/user/statement (mesmo contrato do extrato).
 */
(function () {
  'use strict';

  var LIMIT = 100;

  function getApiBase() {
    if (window.AgilBank && window.AgilBank.api && typeof window.AgilBank.api.getBaseUrl === 'function') {
      return window.AgilBank.api.getBaseUrl();
    }
    if (typeof window.getAgilbankApiBase === 'function') {
      return window.getAgilbankApiBase();
    }
    return String(window.AGILBANK_DEFAULT_REMOTE_API_BASE || 'https://aggibank-production.up.railway.app/api').replace(
      /\/+$/,
      ''
    );
  }

  function getAuthToken() {
    return (
      (window.AgilBank && window.AgilBank.auth && typeof window.AgilBank.auth.getToken === 'function'
        ? window.AgilBank.auth.getToken()
        : null) ||
      sessionStorage.getItem('govbr_token') ||
      sessionStorage.getItem('agilbank_token') ||
      sessionStorage.getItem('token') ||
      localStorage.getItem('govbr_token') ||
      localStorage.getItem('agilbank_token') ||
      localStorage.getItem('token')
    );
  }

  function formatMoney(n) {
    var x = Number(n);
    if (!isFinite(x)) x = 0;
    try {
      return x.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
    } catch (e) {
      return 'R$ ' + x.toFixed(2);
    }
  }

  function formatDateTime(iso) {
    if (!iso) return '—';
    var d = new Date(iso);
    if (isNaN(d.getTime())) return '—';
    try {
      return d.toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' });
    } catch (e2) {
      return d.toISOString();
    }
  }

  function origemLabel(o) {
    var u = String(o || '').toUpperCase();
    if (u === 'PIX') return 'Pix';
    if (u === 'BOLETO') return 'Boleto';
    if (u === 'CARTAO') return 'Cartão';
    if (u === 'EMPRESTIMO') return 'Empréstimo';
    if (u === 'FRETE') return 'Frete';
    if (u === 'AJUSTE') return 'Outros';
    return 'Outros';
  }

  function iconClassForOrigem(origem) {
    var o = String(origem || '').toUpperCase();
    if (o === 'PIX') return 'fas fa-qrcode';
    if (o === 'BOLETO') return 'fas fa-barcode';
    if (o === 'EMPRESTIMO') return 'fas fa-hand-holding-usd';
    if (o === 'CARTAO') return 'fas fa-credit-card';
    if (o === 'FRETE') return 'fas fa-truck';
    return 'fas fa-receipt';
  }

  /** Filtro de tipo: alinhado ao extrato (origem) + seguro por texto em descrição (campo real). */
  function uiBucket(item) {
    var d = String(item.descricao || '');
    if (/seguro/i.test(d)) return 'seguro';
    var o = String(item.origem || '').toUpperCase();
    if (o === 'PIX') return 'pix';
    if (o === 'BOLETO') return 'boleto';
    if (o === 'CARTAO') return 'cartao';
    if (o === 'EMPRESTIMO') return 'emprestimo';
    if (o === 'FRETE') return 'frete';
    return 'outros';
  }

  function bucketLabel(bucket) {
    var b = String(bucket || '');
    if (b === 'pix') return 'Pix';
    if (b === 'boleto') return 'Boleto';
    if (b === 'cartao') return 'Cartão';
    if (b === 'emprestimo') return 'Empréstimo';
    if (b === 'frete') return 'Frete';
    if (b === 'seguro') return 'Seguro';
    return 'Outros';
  }

  function tipoVisualLine(item) {
    var t = String(item.tipo || '').toUpperCase();
    var kind = t === 'CREDITO' ? 'Crédito' : 'Débito';
    return kind + ' · ' + bucketLabel(uiBucket(item));
  }

  function periodCutoffDays(dias) {
    var n = parseInt(dias, 10);
    if (!n || n <= 0) return null;
    var now = new Date();
    var cut = new Date(now.getTime());
    cut.setDate(cut.getDate() - n);
    cut.setHours(0, 0, 0, 0);
    return cut;
  }

  function matchesSearch(item, q) {
    if (!q) return true;
    var needle = q.trim().toLowerCase();
    if (!needle) return true;
    var parts = [
      String(item.descricao || ''),
      String(item.tipo || ''),
      String(item.origem || ''),
      item.referenciaId != null ? String(item.referenciaId) : '',
      formatMoney(item.valor),
      String(item.id != null ? item.id : ''),
    ];
    var hay = parts.join(' ').toLowerCase();
    return hay.indexOf(needle) !== -1;
  }

  function matchesPeriod(item, cutoff) {
    if (!cutoff) return true;
    var d = new Date(item.data);
    if (isNaN(d.getTime())) return true;
    return d >= cutoff;
  }

  var state = {
    items: [],
    pagination: null,
    lastUpdated: null,
    loadError: null,
    currentPageLoaded: 0,
    loading: false,
    tipoFiltro: 'todos',
    diasPeriodo: 0,
    search: '',
  };

  function $(id) {
    return document.getElementById(id);
  }

  function show(el, visible) {
    if (!el) return;
    if (visible) el.classList.remove('is-hidden');
    else el.classList.add('is-hidden');
  }

  function setLoading(isLoading) {
    state.loading = isLoading;
    show($('compStateLoading'), isLoading);
    if (isLoading) {
      show($('compStateError'), false);
    }
  }

  function messageForResponse(status, raw) {
    if (status === 401) {
      return 'Sessão expirada ou inválida. Faça login novamente.';
    }
    if (raw && raw.code === 'ACCOUNT_NOT_VERIFIED') {
      return 'Verifique seu e-mail para consultar o extrato.';
    }
    if (raw && typeof raw.message === 'string' && raw.message.trim()) {
      return raw.message.trim();
    }
    return 'Não foi possível carregar o extrato agora. Tente novamente em instantes.';
  }

  async function fetchStatementPage(page) {
    var token = getAuthToken();
    if (!token) {
      var err = new Error('NO_TOKEN');
      err.code = 'NO_TOKEN';
      throw err;
    }
    var base = getApiBase();
    var url =
      base.replace(/\/+$/, '') + '/user/statement?page=' + encodeURIComponent(String(page)) + '&limit=' + LIMIT;
    var response = await fetch(url, {
      headers: {
        Authorization: 'Bearer ' + token,
        'Content-Type': 'application/json',
      },
    });
    var raw = await response.json().catch(function () {
      return {};
    });
    if (!response.ok) {
      var e = new Error(messageForResponse(response.status, raw));
      e.status = response.status;
      e.body = raw;
      throw e;
    }
    var items = raw && Array.isArray(raw.items) ? raw.items : [];
    var pagination = raw && raw.pagination ? raw.pagination : null;
    return { items: items, pagination: pagination };
  }

  async function loadFirstPage() {
    state.items = [];
    state.pagination = null;
    state.currentPageLoaded = 0;
    state.loadError = null;
    state.lastUpdated = null;

    var token = getAuthToken();
    if (!token) {
      state.loadError = 'NO_TOKEN';
      renderFatal('Faça login para ver seus comprovantes.');
      return;
    }

    setLoading(true);
    show($('compStateEmpty'), false);
    show($('compStateNoFilter'), false);
    $('compList').innerHTML = '';

    try {
      var result = await fetchStatementPage(1);
      state.items = result.items.slice();
      state.pagination = result.pagination;
      state.currentPageLoaded = 1;
      state.lastUpdated = new Date();
      setLoading(false);
      updateSummary();
      updateLoadMore();
      renderList();
    } catch (err) {
      console.error('comprovantes:', err);
      state.loadError = err;
      setLoading(false);
      var msg;
      if (err && err.code === 'NO_TOKEN') {
        msg = 'Faça login para ver seus comprovantes.';
      } else if (err && typeof err.message === 'string' && err.message.trim()) {
        msg = err.message.trim();
      } else {
        msg = 'Não foi possível carregar agora. Verifique sua conexão e tente de novo.';
      }
      renderFatal(msg);
    }
  }

  function renderFatal(message) {
    $('compStateErrorText').textContent = message;
    show($('compStateError'), true);
    show($('compStateEmpty'), false);
    show($('compStateNoFilter'), false);
    $('compList').innerHTML = '';
    show($('compLoadMore'), false);
    updateSummary();
  }

  async function loadNextPage() {
    if (state.loading) return;
    var pag = state.pagination;
    if (!pag || !pag.totalPages || state.currentPageLoaded >= pag.totalPages) return;

    var btn = $('compLoadMore');
    if (btn) btn.disabled = true;

    state.loading = true;
    try {
      var next = state.currentPageLoaded + 1;
      var result = await fetchStatementPage(next);
      state.pagination = result.pagination || state.pagination;
      var existing = {};
      for (var i = 0; i < state.items.length; i++) {
        var it = state.items[i];
        if (it && it.id != null) existing[String(it.id)] = true;
      }
      for (var j = 0; j < result.items.length; j++) {
        var row = result.items[j];
        if (row && row.id != null && !existing[String(row.id)]) {
          state.items.push(row);
          existing[String(row.id)] = true;
        }
      }
      state.currentPageLoaded = next;
      state.lastUpdated = new Date();
      renderList();
      updateSummary();
      updateLoadMore();
    } catch (err) {
      console.error('comprovantes_more:', err);
      alert(
        err && err.message
          ? err.message
          : 'Não foi possível carregar mais. Verifique sua conexão.'
      );
    } finally {
      state.loading = false;
      if (btn) btn.disabled = false;
    }
  }

  function filteredItems() {
    var cutoff = periodCutoffDays(state.diasPeriodo);
    return state.items.filter(function (item) {
      if (!matchesPeriod(item, cutoff)) return false;
      if (state.tipoFiltro !== 'todos' && uiBucket(item) !== state.tipoFiltro) return false;
      return matchesSearch(item, state.search);
    });
  }

  function updateSummary() {
    var countEl = $('compSummaryCount');
    var updatedEl = $('compSummaryUpdated');
    if (state.loadError && state.items.length === 0) {
      if (countEl) countEl.textContent = '—';
      if (updatedEl) updatedEl.textContent = '—';
      return;
    }
    if (countEl) countEl.textContent = String(state.items.length);
    if (updatedEl) {
      updatedEl.textContent = state.lastUpdated
        ? state.lastUpdated.toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' })
        : '—';
    }
  }

  function updateLoadMore() {
    var pag = state.pagination;
    var btn = $('compLoadMore');
    if (!btn) return;
    var showBtn =
      pag &&
      pag.totalPages &&
      state.currentPageLoaded > 0 &&
      state.currentPageLoaded < pag.totalPages;
    show(btn, !!showBtn);
  }

  function renderList() {
    show($('compStateError'), false);

    if (state.items.length === 0 && !state.loading) {
      show($('compStateEmpty'), true);
      show($('compStateNoFilter'), false);
      $('compList').innerHTML = '';
      updateLoadMore();
      return;
    }

    show($('compStateEmpty'), false);

    var list = filteredItems();
    var ul = $('compList');
    ul.innerHTML = '';

    if (list.length === 0) {
      show($('compStateNoFilter'), true);
      updateLoadMore();
      return;
    }

    show($('compStateNoFilter'), false);

    for (var i = 0; i < list.length; i++) {
      ul.appendChild(renderCard(list[i]));
    }
    updateLoadMore();
  }

  function renderCard(item) {
    var li = document.createElement('li');
    li.className = 'comp-card';
    li.setAttribute('data-mov-id', item.id != null ? String(item.id) : '');

    var iconWrap = document.createElement('div');
    iconWrap.className = 'comp-card__icon';
    iconWrap.innerHTML = '<i class="' + iconClassForOrigem(item.origem) + '" aria-hidden="true"></i>';

    var main = document.createElement('div');
    main.className = 'comp-card__main';

    var title = document.createElement('p');
    title.className = 'comp-card__title';
    title.textContent = String(item.descricao || 'Movimentação');

    var meta = document.createElement('div');
    meta.className = 'comp-card__meta';
    var dateSpan = document.createElement('span');
    dateSpan.textContent = formatDateTime(item.data);
    var tipoSpan = document.createElement('span');
    tipoSpan.className = 'comp-card__badge';
    tipoSpan.textContent = bucketLabel(uiBucket(item));
    meta.appendChild(dateSpan);
    meta.appendChild(tipoSpan);

    if (item.status && String(item.status).trim()) {
      var st = document.createElement('span');
      st.className = 'comp-card__status';
      st.textContent = String(item.status);
      meta.appendChild(st);
    }

    main.appendChild(title);
    main.appendChild(meta);

    var side = document.createElement('div');
    side.className = 'comp-card__side';
    var valor = document.createElement('p');
    valor.className = 'comp-card__valor';
    var isCred = String(item.tipo || '').toUpperCase() === 'CREDITO';
    valor.classList.add(isCred ? 'is-credito' : 'is-debito');
    var vnum = Number(item.valor);
    var sign = isCred ? '+ ' : '− ';
    valor.textContent = sign + formatMoney(Math.abs(isFinite(vnum) ? vnum : 0));

    var btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'comp-card__cta';
    btn.textContent = 'Ver comprovante';
    btn.addEventListener('click', function () {
      openModal(item);
    });

    side.appendChild(valor);
    side.appendChild(btn);

    li.appendChild(iconWrap);
    li.appendChild(main);
    li.appendChild(side);

    return li;
  }

  function openModal(item) {
    var modal = $('receiptModal');
    $('receiptTipoLinha').textContent = tipoVisualLine(item);

    var isCred = String(item.tipo || '').toUpperCase() === 'CREDITO';
    var vnum = Number(item.valor);
    var sign = isCred ? '+ ' : '− ';
    $('receiptValor').textContent =
      sign + formatMoney(Math.abs(isFinite(vnum) ? vnum : 0));
    $('receiptValor').classList.toggle('is-credito', isCred);
    $('receiptValor').classList.toggle('is-debito', !isCred);

    $('receiptData').textContent = formatDateTime(item.data);
    $('receiptDesc').textContent = String(item.descricao || '—');

    var ref = item.referenciaId != null && String(item.referenciaId).trim() !== '';
    $('receiptRef').textContent = ref ? String(item.referenciaId) : 'Referência não disponível';

    var statusRow = $('receiptStatusRow');
    var hasStatus = item.status != null && String(item.status).trim() !== '';
    show(statusRow, hasStatus);
    if (hasStatus) $('receiptStatus').textContent = String(item.status);

    var canalRow = $('receiptCanalRow');
    var hasOrigem = item.origem != null && String(item.origem).trim() !== '';
    show(canalRow, hasOrigem);
    $('receiptCanal').textContent = hasOrigem ? origemLabel(item.origem) : '';

    var movRow = $('receiptMovIdRow');
    var hasId = item.id != null && String(item.id).trim() !== '';
    show(movRow, hasId);
    $('receiptMovId').textContent = hasId ? String(item.id) : '';

    modal.classList.remove('is-hidden');
    modal.setAttribute('aria-hidden', 'false');
    document.body.classList.add('comp-modal-open');

    modal.__currentItem = item;
  }

  function closeModal() {
    var modal = $('receiptModal');
    modal.classList.add('is-hidden');
    modal.setAttribute('aria-hidden', 'true');
    document.body.classList.remove('comp-modal-open');
    modal.__currentItem = null;
  }

  function copyReceiptText() {
    var modal = $('receiptModal');
    var item = modal.__currentItem;
    if (!item) return;

    var refLine =
      item.referenciaId != null && String(item.referenciaId).trim() !== ''
        ? String(item.referenciaId)
        : 'Referência não disponível';
    var statusLine =
      item.status != null && String(item.status).trim() !== '' ? String(item.status) : null;
    var canalLine = item.origem != null && String(item.origem).trim() !== '' ? origemLabel(item.origem) : '';

    var lines = [
      'AgilBank — Comprovante',
      '',
      'Tipo: ' + tipoVisualLine(item),
      'Valor: ' + $('receiptValor').textContent.trim(),
      'Data e hora: ' + formatDateTime(item.data),
      'Descrição: ' + String(item.descricao || '—'),
      'Referência: ' + refLine,
    ];
    if (statusLine) lines.push('Status: ' + statusLine);
    if (canalLine) lines.push('Classificação no extrato: ' + canalLine);
    if (item.id != null) lines.push('ID da movimentação: ' + String(item.id));
    lines.push('');
    lines.push('Este comprovante foi gerado com base nas informações registradas no AgilBank.');

    var text = lines.join('\n');
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(text).then(
        function () {
          alert('Dados copiados para a área de transferência.');
        },
        function () {
          window.prompt('Copie o texto abaixo:', text);
        }
      );
    } else {
      window.prompt('Copie o texto abaixo:', text);
    }
  }

  function init() {
    $('compBack').addEventListener('click', function () {
      if (window.history.length > 1) window.history.back();
      else window.location.href = 'index.html';
    });

    document.querySelectorAll('.comp-chip--tipo').forEach(function (btn) {
      btn.addEventListener('click', function () {
        document.querySelectorAll('.comp-chip--tipo').forEach(function (b) {
          b.classList.remove('is-active');
        });
        btn.classList.add('is-active');
        state.tipoFiltro = btn.getAttribute('data-tipo') || 'todos';
        renderList();
      });
    });

    document.querySelectorAll('.comp-chip--periodo').forEach(function (btn) {
      btn.addEventListener('click', function () {
        document.querySelectorAll('.comp-chip--periodo').forEach(function (b) {
          b.classList.remove('is-active');
        });
        btn.classList.add('is-active');
        state.diasPeriodo = parseInt(btn.getAttribute('data-dias') || '0', 10) || 0;
        renderList();
      });
    });

    var searchEl = $('compSearch');
    if (searchEl) {
      searchEl.addEventListener('input', function () {
        state.search = searchEl.value || '';
        renderList();
      });
    }

    $('compRetry').addEventListener('click', function () {
      loadFirstPage();
    });

    $('compLoadMore').addEventListener('click', function () {
      loadNextPage();
    });

    $('receiptModalBackdrop').addEventListener('click', closeModal);
    $('receiptClose').addEventListener('click', closeModal);
    $('receiptCopy').addEventListener('click', copyReceiptText);
    $('receiptPrint').addEventListener('click', function () {
      window.print();
    });

    document.addEventListener('keydown', function (ev) {
      if (ev.key === 'Escape') {
        var modal = $('receiptModal');
        if (modal && !modal.classList.contains('is-hidden')) {
          ev.preventDefault();
          closeModal();
        }
      }
    });

    loadFirstPage();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
