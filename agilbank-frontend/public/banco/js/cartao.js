// ==========================================
// Dados do wizard de cartão: validação na UI; persistência no POST (sem PIN em payload nem em localStorage).
// ==========================================

/** Texto interno para campos opcionais vazios (não confundir com persistência no servidor). */
function agilbankWizardNz(v) {
    if (v == null) return 'Não informado';
    var s = String(v).trim();
    return s === '' ? 'Não informado' : s;
}

function agilbankWizardDisplayNz(val) {
    if (val == null || String(val).trim() === '') return 'Não informado';
    return String(val).trim();
}

/**
 * Coleta e valida o wizard de cartão. Não persiste PIN nem outros dados sensíveis em localStorage.
 * @returns {Object|null} Subset seguro para montar dadosAnalise no POST (sem senhaCartao).
 */
function coletarDadosCartao() {
    var root = document.getElementById('cartaoWizardForm');
    function gv(id) {
        var el = (root && root.querySelector('#' + id)) || document.getElementById(id);
        return el && 'value' in el ? String(el.value) : '';
    }

    var rendaRaw = gv('rendaInput');
    var rendaNumero = parseFloat(rendaRaw.replace(/\D/g, ''));
    if (!isFinite(rendaNumero) || rendaNumero < 1) {
        if (typeof showErrorModal === 'function') {
            showErrorModal('Renda obrigatória', 'Informe sua renda mensal na etapa &quot;Dados profissionais&quot;.');
        }
        return null;
    }

    var tempoVal = gv('cartaoSelectTempo').trim();
    if (!tempoVal) {
        if (typeof showErrorModal === 'function') {
            showErrorModal('Dados profissionais', 'Selecione o tempo no emprego ou &quot;Não informado&quot;.');
        }
        return null;
    }

    var senha = gv('cartaoInputSenha').replace(/\s/g, '');
    if (!senha || senha.length < 4) {
        if (typeof showErrorModal === 'function') {
            showErrorModal('Senha do cartão', 'Informe uma senha de 4 dígitos (não é enviada ao servidor).');
        }
        return null;
    }

    var tempoEmpregoApi = tempoVal === 'ni' ? 'nao_informado' : tempoVal;

    return {
        rendaMensalDeclarada: rendaNumero,
        tempoEmprego: tempoEmpregoApi,
        empresa: agilbankWizardNz(gv('cartaoInputEmpresa')),
        empresaAtual: agilbankWizardNz(gv('cartaoInputEmpresaAtual')),
        endereco: {
            rua: agilbankWizardNz(gv('cartaoInputRua')),
            bairro: agilbankWizardNz(gv('cartaoInputBairro')),
            cidade: agilbankWizardNz(gv('cartaoInputCidade')),
            estado: agilbankWizardNz(gv('cartaoInputEstado')),
            cep: agilbankWizardNz(gv('cartaoInputCep'))
        },
        termosAceitos: document.getElementById('termosCheck') && document.getElementById('termosCheck').checked
    };
}

/**
 * Legado: removia cache local de dados do cartão. Mantido para limpar resíduos antigos (sem PIN).
 * @returns {Object|null} Sempre null — dados do wizard não são mais fonte em localStorage.
 */
function recuperarDadosCartao() {
    return null;
}

/**
 * Remove resíduo `dadosCartao` de versões antigas do fluxo (não armazena mais dados sensíveis).
 */
function limparDadosCartao() {
    try {
        localStorage.removeItem('dadosCartao');
    } catch (e) {
        /* ignore */
    }
}

// --- Wizard solicitação cartão (UI em #cartaoWizardRoot; POST inalterado) ---
var agilbankWizardStep = 1;
var WIZARD_TOTAL_STEPS = 7;

function agilbankWizardGoToStep(n) {
    agilbankWizardStep = Math.max(1, Math.min(WIZARD_TOTAL_STEPS, n));
    var form = document.getElementById('cartaoWizardForm');
    if (form) {
        form.querySelectorAll('.cartao-wizard-step').forEach(function (s) {
            var d = parseInt(s.getAttribute('data-step'), 10);
            s.classList.toggle('is-active', d === agilbankWizardStep);
        });
    }
    var fill = document.getElementById('cartaoWizardProgressFill');
    if (fill) {
        fill.style.width = (100 * agilbankWizardStep / WIZARD_TOTAL_STEPS) + '%';
    }
    var lab = document.getElementById('cartaoWizardStepLabel');
    if (lab) {
        lab.textContent = 'Passo ' + agilbankWizardStep + ' de ' + WIZARD_TOTAL_STEPS;
    }
    var nav = document.getElementById('cartaoWizardNav');
    if (nav) {
        nav.style.display = agilbankWizardStep === 7 ? 'none' : 'flex';
    }
    var next = document.getElementById('cartaoWizardNext');
    if (next) {
        next.textContent = agilbankWizardStep === 6 ? 'Enviar solicitação' : 'Continuar';
    }
}

function agilbankWizardExtrairEnderecoPerfil(norm) {
    var o = { rua: '', bairro: '', cidade: '', estado: '', cep: '' };
    if (!norm || !norm.endereco) return o;
    var e = norm.endereco;
    if (typeof e === 'string') {
        o.rua = e;
        return o;
    }
    o.rua = e.rua || e.logradouro || e.endereco || '';
    o.bairro = e.bairro || '';
    o.cidade = e.cidade || e.localidade || '';
    o.estado = e.estado || e.uf || '';
    o.cep = e.cep || e.CEP || '';
    return o;
}

async function agilbankWizardHydratePerfil() {
    var token = getCartaoAuthToken();
    if (!token || !window.AgilBank || !window.AgilBank.api) return;
    var nome = '';
    var email = '';
    var cpf = '';
    var tel = '';
    var end = { rua: '', bairro: '', cidade: '', estado: '', cep: '' };
    try {
        var response = await window.AgilBank.api.request('user/user-complete-data', {
            method: 'GET',
            headers: { 'Content-Type': 'application/json' },
            credentials: 'include'
        });
        if (response.ok) {
            var profile = await response.json().catch(function () {
                return {};
            });
            var u = profile.user_data && profile.user_data.usuario ? profile.user_data.usuario : null;
            var n = u && typeof window.normalizarDadosUsuarioBruto === 'function' ? window.normalizarDadosUsuarioBruto(u) : null;
            if (n) {
                nome = n.nomeCompleto;
                email = n.email;
                cpf = n.cpf || '';
                var cpfD = String(cpf).replace(/\D/g, '');
                if (cpfD.length === 11) {
                    cpf = cpfD.replace(/(\d{3})(\d{3})(\d{3})(\d{2})/, '$1.$2.$3-$4');
                }
                tel = n.telefone || '';
                end = agilbankWizardExtrairEnderecoPerfil(n);
                var prof = n.dados_profissionais;
                if (prof && typeof prof === 'object') {
                    var ge = document.getElementById('cartaoInputEmpresa');
                    var ga = document.getElementById('cartaoInputEmpresaAtual');
                    if (ge && !String(ge.value).trim() && prof.empresa) ge.value = String(prof.empresa);
                    if (ga && !String(ga.value).trim() && (prof.cargo || prof.empresa_atual)) {
                        ga.value = String(prof.cargo || prof.empresa_atual || '');
                    }
                }
            }
        }
    } catch (err) {
        console.warn('agilbankWizardHydratePerfil', err);
    }

    function setTxt(id, v) {
        var el = document.getElementById(id);
        if (el) el.textContent = agilbankWizardDisplayNz(v);
    }
    setTxt('wizDispNome', nome);
    setTxt('wizDispEmail', email);
    setTxt('wizDispCpf', cpf);
    setTxt('wizDispTel', tel);

    setTxt('wizDispRua', end.rua);
    setTxt('wizDispBairro', end.bairro);
    var cidadeUf = [end.cidade, end.estado].filter(function (x) {
        return x && String(x).trim();
    }).join(' / ');
    setTxt('wizDispCidadeUf', cidadeUf);
    setTxt('wizDispCep', end.cep);

    function setHid(id, v) {
        var el = document.getElementById(id);
        if (el) el.value = v != null ? String(v) : '';
    }
    setHid('cartaoInputRua', end.rua);
    setHid('cartaoInputBairro', end.bairro);
    setHid('cartaoInputCidade', end.cidade);
    setHid('cartaoInputEstado', end.estado);
    setHid('cartaoInputCep', end.cep);
}

function agilbankWizardAtualizarRevisao() {
    var dl = document.getElementById('cartaoWizardRevisaoDl');
    if (!dl) return;
    function txt(id) {
        var el = document.getElementById(id);
        return el ? el.textContent : '—';
    }
    function gv(id) {
        var el = document.getElementById(id);
        return el && 'value' in el ? String(el.value) : '';
    }
    var limEl = document.getElementById('cartaoLimiteDesejado');
    var limTxt = '—';
    if (limEl) {
        var n = parseFloat(limEl.value, 10);
        if (isFinite(n)) {
            limTxt = 'R$ ' + n.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
        }
    }
    var rows = [
        ['Nome', txt('wizDispNome')],
        ['E-mail', txt('wizDispEmail')],
        ['CPF', txt('wizDispCpf')],
        ['Telefone', txt('wizDispTel')],
        ['Logradouro', txt('wizDispRua')],
        ['Bairro', txt('wizDispBairro')],
        ['Cidade / UF', txt('wizDispCidadeUf')],
        ['CEP', txt('wizDispCep')],
        ['Renda mensal', gv('rendaInput') ? gv('rendaInput') : 'Não informado'],
        ['Empresa', agilbankWizardDisplayNz(gv('cartaoInputEmpresa'))],
        ['Empresa atual', agilbankWizardDisplayNz(gv('cartaoInputEmpresaAtual'))],
        ['Limite desejado (solicitação)', limTxt]
    ];
    dl.innerHTML = rows
        .map(function (r) {
            return (
                '<div><dt>' +
                r[0] +
                '</dt><dd>' +
                (r[1] || 'Não informado') +
                '</dd></div>'
            );
        })
        .join('');
}

function agilbankWizardValidateStep(step) {
    if (step === 3) {
        var ri = document.getElementById('rendaInput');
        var renda = ri ? parseFloat(String(ri.value).replace(/\D/g, '')) : NaN;
        if (!isFinite(renda) || renda < 1) {
            if (typeof showErrorModal === 'function') {
                showErrorModal('Renda obrigatória', 'Informe sua renda mensal para continuar.');
            }
            return false;
        }
    }
    return true;
}

function agilbankWizardNext() {
    if (agilbankWizardStep === 6) {
        enviarSolicitacao();
        return;
    }
    if (!agilbankWizardValidateStep(agilbankWizardStep)) return;
    var nextStep = agilbankWizardStep + 1;

    if (nextStep === 4) {
        agilbankWizardAtualizarRevisao();
    }
    if (nextStep === 5) {
        agilbankWizardAtualizarRevisao();
        var ri = document.getElementById('rendaInput');
        var renda = ri ? parseFloat(String(ri.value).replace(/\D/g, '')) : 0;
        var sl = document.getElementById('cartaoLimiteDesejado');
        if (sl && isFinite(renda) && renda > 0) {
            var sug = clampLimiteCartao(calcularLimite(renda));
            sl.value = String(Math.min(50000, Math.max(100, sug)));
            sl.dispatchEvent(new Event('input', { bubbles: true }));
        }
    }
    if (nextStep <= WIZARD_TOTAL_STEPS) {
        agilbankWizardGoToStep(nextStep);
    }
}

function agilbankWizardPrev() {
    if (agilbankWizardStep <= 1) return;
    agilbankWizardGoToStep(agilbankWizardStep - 1);
}

function agilbankWizardTryBack() {
    var root = document.getElementById('cartaoWizardRoot');
    var pc = document.getElementById('progressContainer');
    if (pc && pc.style.display === 'block' && root) {
        pc.style.display = 'none';
        root.style.display = 'block';
        var nav = document.getElementById('cartaoWizardNav');
        if (nav) nav.style.display = 'flex';
        return true;
    }
    if (!root || root.style.display === 'none') return false;
    if (agilbankWizardStep > 1 && agilbankWizardStep < 7) {
        agilbankWizardPrev();
        return true;
    }
    return false;
}

function agilbankWizardBindNav() {
    var r = document.getElementById('cartaoLimiteDesejado');
    if (r && !r._agilWizBound) {
        r._agilWizBound = true;
        r.addEventListener('input', function () {
            var lab = document.getElementById('cartaoLimiteDesejadoLabel');
            if (lab) {
                var n = parseFloat(r.value, 10);
                lab.textContent = isFinite(n)
                    ? 'R$ ' + n.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
                    : '—';
            }
        });
        r.dispatchEvent(new Event('input', { bubbles: true }));
    }
    ['cartaoWizardPrev', 'cartaoWizardNext'].forEach(function (bid) {
        var b = document.getElementById(bid);
        if (b && !b._agilWizBound) {
            b._agilWizBound = true;
            b.addEventListener('click', function () {
                if (bid === 'cartaoWizardPrev') agilbankWizardPrev();
                else agilbankWizardNext();
            });
        }
    });
    var ver = document.getElementById('cartaoWizardVerMeus');
    if (ver && !ver._agilWizBound) {
        ver._agilWizBound = true;
        ver.addEventListener('click', function () {
            if (typeof agilbankRefreshPainelCartoes === 'function') {
                agilbankRefreshPainelCartoes();
            }
        });
    }
}

function agilbankWizardAplicarResultadoPosPost(cartoes) {
    var resBox = document.getElementById('cartaoWizardResultado');
    var icon = document.getElementById('cartaoWizardResultadoIcon');
    var tit = document.getElementById('cartaoWizardResultadoTitulo');
    var txt = document.getElementById('cartaoWizardResultadoTexto');
    var c0 = cartoes && cartoes[0];
    var st = c0 ? String(c0.status || 'pendente').toLowerCase() : 'pendente';
    if (resBox) {
        resBox.classList.remove('is-pendente', 'is-aprovado');
        if (st === 'aprovado' || st === 'ativo') {
            resBox.classList.add('is-aprovado');
            if (icon) icon.textContent = '✓';
            if (tit) tit.textContent = 'Cartão aprovado';
            if (txt) {
                txt.textContent =
                    'Seu cartão está ativo na conta. Os detalhes aparecem em &quot;Meus cartões&quot;.';
            }
        } else {
            resBox.classList.add('is-pendente');
            if (icon) icon.textContent = '⏱';
            if (tit) tit.textContent = 'Solicitação enviada';
            if (txt) {
                txt.textContent =
                    'Seu pedido está em análise. O limite final será definido após a análise de crédito — o valor escolhido foi apenas uma solicitação.';
            }
        }
    }
}

window.agilbankWizardTryBack = agilbankWizardTryBack;

function getCartaoAuthToken() {
    if (window.AgilBank && window.AgilBank.auth && typeof window.AgilBank.auth.getToken === 'function') {
        var t = window.AgilBank.auth.getToken();
        if (t) return t;
    }
    return (
        sessionStorage.getItem('govbr_token') ||
        localStorage.getItem('govbr_token') ||
        sessionStorage.getItem('agilbank_token') ||
        localStorage.getItem('agilbank_token') ||
        sessionStorage.getItem('token') ||
        localStorage.getItem('token') ||
        null
    );
}

function clampLimiteCartao(valor) {
    var n = typeof valor === 'number' ? valor : parseFloat(String(valor), 10);
    if (!isFinite(n)) return 100;
    return Math.min(50000, Math.max(100, n));
}

function extrairCartaoDaResposta(body) {
    if (!body || typeof body !== 'object') return null;
    if (body.data && body.data.cartao) return body.data.cartao;
    if (body.cartao) return body.cartao;
    return null;
}

function extrairCartoesDaResposta(body) {
    if (!body || typeof body !== 'object') return [];
    var list =
        (body.data && body.data.cartoes) ||
        body.cartoes ||
        body.cards ||
        null;
    return Array.isArray(list) ? list : [];
}

/**
 * GET /api/cards — lista normalizada (pode ser vazia em erro silencioso).
 */
async function fetchCartoesFromApi() {
    var token = getCartaoAuthToken();
    if (!token || !window.AgilBank || !window.AgilBank.api || typeof window.AgilBank.api.request !== 'function') {
        return [];
    }
    try {
        var response = await window.AgilBank.api.request('cards', {
            method: 'GET',
            headers: { 'Content-Type': 'application/json' }
        });
        if (!response.ok) return [];
        var result = await response.json().catch(function () {
            return {};
        });
        return extrairCartoesDaResposta(result);
    } catch (e) {
        console.warn('fetchCartoesFromApi:', e);
        return [];
    }
}

function statusCartaoLabel(status) {
    var s = String(status || 'pendente').toLowerCase();
    if (s === 'aprovado' || s === 'ativo') return 'Aprovado';
    if (s === 'pendente') return 'Em análise';
    if (s === 'bloqueado') return 'Bloqueado';
    return status || '—';
}

/** GET /api/cards: id, maskedNumber, last4, validade, limite, saldoUtilizado, status, tipo, bandeira, dataSolicitacao, dataAprovacao, createdAt */
window.__agilbankCartoesLista = [];
window.__agilbankCartaoSelecionadoId = null;
window.__agilbankTitularCartaoCache = '';

function agilbankListaCartoesAtual() {
    return Array.isArray(window.__agilbankCartoesLista) ? window.__agilbankCartoesLista : [];
}

function agilbankGetCartaoSelecionado() {
    var list = agilbankListaCartoesAtual();
    if (!list.length) return null;
    var id = window.__agilbankCartaoSelecionadoId;
    if (id) {
        for (var i = 0; i < list.length; i++) {
            if (list[i].id === id) return list[i];
        }
    }
    return list[0];
}

function agilbankStatusCartaoAtivo(c) {
    if (!c) return false;
    var s = String(c.status || 'pendente').toLowerCase();
    return s === 'aprovado' || s === 'ativo';
}

function agilbankFormatarNumeroCartaoApi(c) {
    if (!c) return 'Indisponível';
    if (c.maskedNumber && String(c.maskedNumber).trim()) return String(c.maskedNumber).trim();
    var l4 = c.last4 != null ? String(c.last4).replace(/\D/g, '').slice(-4).padStart(4, '0') : '';
    if (l4) return '•••• •••• •••• ' + l4;
    return 'Indisponível';
}

function agilbankFormatarValidadeApi(c) {
    if (!c || !c.validade || !String(c.validade).trim()) return 'Indisponível';
    return String(c.validade).trim();
}

function agilbankEnsureTitularNomeCache() {
    if (window.__agilbankTitularCartaoCache) return Promise.resolve(window.__agilbankTitularCartaoCache);
    var token = getCartaoAuthToken();
    if (!token || !window.AgilBank || !window.AgilBank.api) {
        window.__agilbankTitularCartaoCache = 'Indisponível';
        return Promise.resolve(window.__agilbankTitularCartaoCache);
    }
    return window.AgilBank.api
        .request('user/user-complete-data', {
            method: 'GET',
            headers: { 'Content-Type': 'application/json' },
            credentials: 'include'
        })
        .then(function (r) {
            return r.json().catch(function () {
                return {};
            });
        })
        .then(function (data) {
            var u = data.user_data && data.user_data.usuario ? data.user_data.usuario : null;
            var n = u && typeof window.normalizarDadosUsuarioBruto === 'function' ? window.normalizarDadosUsuarioBruto(u) : null;
            var nome = n && n.nomeCompleto ? String(n.nomeCompleto).trim() : '';
            window.__agilbankTitularCartaoCache = nome || 'Indisponível';
            return window.__agilbankTitularCartaoCache;
        })
        .catch(function () {
            window.__agilbankTitularCartaoCache = 'Indisponível';
            return window.__agilbankTitularCartaoCache;
        });
}

function agilbankAbrirContainerCartao(containerId) {
    if (typeof ocultarTodosContainers === 'function') {
        ocultarTodosContainers();
    }
    if (typeof mostrarAnimacaoLogo02 === 'function') {
        mostrarAnimacaoLogo02(function () {
            var el = document.getElementById(containerId);
            if (el) el.style.display = 'block';
            if (typeof window.scrollTo === 'function') window.scrollTo(0, 0);
        });
    } else {
        var el2 = document.getElementById(containerId);
        if (el2) el2.style.display = 'block';
        if (typeof window.scrollTo === 'function') window.scrollTo(0, 0);
    }
}

function agilbankPopularDetalheCartaoNaUi(c, opts) {
    opts = opts || {};
    var virtual = !!opts.virtual;
    var titulo = opts.titulo || 'Cartão';
    var lim = c.limite != null ? Number(c.limite) : NaN;
    var limTxt = isFinite(lim)
        ? 'R$ ' + lim.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
        : 'Indisponível';
    var usado = c.saldoUtilizado != null ? Number(c.saldoUtilizado) : 0;
    if (!isFinite(usado)) usado = 0;
    var pct = isFinite(lim) && lim > 0 ? Math.min(100, (usado / lim) * 100) : 0;
    var numTxt = agilbankFormatarNumeroCartaoApi(c);
    var valTxt = agilbankFormatarValidadeApi(c);
    var titular = window.__agilbankTitularCartaoCache || 'Indisponível';

    var containerId = virtual ? 'cartaoVirtualContainer' : 'cartaoFisicoContainer';
    var cont = document.getElementById(containerId);
    if (cont) {
        var ht = cont.querySelector('.header .title');
        if (ht) ht.textContent = titulo;
    }

    if (virtual) {
        var nv = document.getElementById('numeroCartaoVirtual');
        if (nv) nv.textContent = numTxt;
        var vv = document.getElementById('validadeCartaoVirtual');
        if (vv) vv.textContent = valTxt;
        var tv = document.getElementById('titularCartaoVirtual');
        if (tv) tv.textContent = titular;
        var lvh = document.getElementById('limiteCartaoVirtualHeader');
        if (lvh) lvh.textContent = limTxt;
        var lvr = document.getElementById('limiteCartaoVirtualRodape');
        if (lvr) lvr.textContent = limTxt;
        var fillV = document.getElementById('limiteProgressFillCartaoVirtual');
        if (fillV) fillV.style.width = pct + '%';
        var criar = document.getElementById('cartaoVirtualBtnCriar');
        if (criar) {
            criar.disabled = true;
            criar.title = 'Fluxo não disponível nesta versão.';
        }
    } else {
        var nf = document.getElementById('numeroCartaoFisico');
        if (nf) nf.textContent = numTxt;
        var vf = document.getElementById('validadeCartaoFisico');
        if (vf) vf.textContent = valTxt;
        var tf = document.getElementById('titularCartaoFisico');
        if (tf) tf.textContent = titular;
        var lfh = document.getElementById('limiteCartaoFisicoHeader');
        if (lfh) lfh.textContent = limTxt;
        var lfr = document.getElementById('limiteCartaoFisicoRodape');
        if (lfr) lfr.textContent = limTxt;
        var fillF = document.getElementById('limiteProgressFillCartaoFisico');
        if (fillF) fillF.style.width = pct + '%';
        var desb = document.getElementById('cartaoFisicoBtnDesbloquear');
        if (desb) {
            desb.disabled = true;
            desb.title = 'Fluxo não disponível nesta versão.';
        }
    }
}

function agilbankRenderStatusEntregaParaCartao(c) {
    var host = document.getElementById('statusEntregaTimelineHost');
    var l1 = document.getElementById('statusEntregaLinha1');
    var l2 = document.getElementById('statusEntregaLinha2');
    var end = document.getElementById('enderecoEntrega');
    if (!host) return;

    var pendente = c && !agilbankStatusCartaoAtivo(c);
    if (pendente) {
        host.innerHTML =
            '<div class="status-item active"><div class="status-dot"></div><div class="status-content">' +
            '<h4>Em análise</h4>' +
            '<p>Seu pedido de cartão ainda está em análise. Não há dados de entrega disponíveis neste momento.</p>' +
            '<small>Status: pendente</small></div></div>';
        if (l1) l1.textContent = 'Rastreio: indisponível';
        if (l2) l2.textContent = 'Transportadora: indisponível';
        if (end) end.textContent = 'Endereço de entrega: indisponível até aprovação do cartão.';
        return;
    }

    host.innerHTML =
        '<div class="status-item active"><div class="status-dot"></div><div class="status-content">' +
        '<h4>Status de entrega</h4>' +
        '<p>Status de entrega ainda não disponível pelo aplicativo. Quando houver dados no sistema, eles aparecerão aqui.</p>' +
        '<small>Sem previsão registrada na API</small></div></div>';
    if (l1) l1.textContent = 'Rastreio: indisponível';
    if (l2) l2.textContent = 'Transportadora: indisponível';
    if (end) end.textContent = 'Endereço de entrega: indisponível (não informado pela API).';
}

function agilbankAtualizarBotoesPainelCartoes() {
    var bVer = document.getElementById('cartaoAcaoVer');
    var bFi = document.getElementById('cartaoAcaoFisico');
    var bVi = document.getElementById('cartaoAcaoVirtual');
    var bSt = document.getElementById('cartaoAcaoStatus');
    var painel = document.getElementById('cartaoPainelAcoes');
    if (!bVer || !painel) return;

    function setDis(el, dis) {
        if (!el) return;
        el.disabled = !!dis;
        el.setAttribute('aria-disabled', dis ? 'true' : 'false');
    }

    var c = agilbankGetCartaoSelecionado();
    if (!c) {
        setDis(bVer, true);
        setDis(bFi, true);
        setDis(bVi, true);
        setDis(bSt, true);
        return;
    }

    var ok = agilbankStatusCartaoAtivo(c);
    var podeVirt = ok && (c.tipo || '') === 'debito';

    setDis(bSt, false);
    setDis(bVer, !ok);
    setDis(bFi, !ok);
    setDis(bVi, !podeVirt);
}

function agilbankPainelCartoesBindAcoes() {
    if (window.__agilbankPainelAcoesBound) return;
    window.__agilbankPainelAcoesBound = true;
    var map = {
        cartaoAcaoStatus: function () {
            agilbankCartaoAcaoStatus();
        },
        cartaoAcaoVer: function () {
            agilbankCartaoAcaoVer();
        },
        cartaoAcaoFisico: function () {
            agilbankCartaoAcaoFisico();
        },
        cartaoAcaoVirtual: function () {
            agilbankCartaoAcaoVirtual();
        }
    };
    Object.keys(map).forEach(function (id) {
        var b = document.getElementById(id);
        if (b) {
            b.addEventListener('click', map[id]);
        }
    });
}

function agilbankCartaoAcaoStatus() {
    var c = agilbankGetCartaoSelecionado();
    if (!c) {
        if (typeof showErrorModal === 'function') {
            showErrorModal('Cartão', 'Nenhum cartão disponível.');
        }
        return;
    }
    agilbankRenderStatusEntregaParaCartao(c);
    agilbankAbrirContainerCartao('statusEntregaContainer');
}

function agilbankCartaoAcaoVer() {
    var c = agilbankGetCartaoSelecionado();
    if (!c) return;
    if (!agilbankStatusCartaoAtivo(c)) {
        if (typeof showErrorModal === 'function') {
            showErrorModal('Em análise', 'Este cartão ainda está em análise. Os detalhes ficam disponíveis após aprovação.');
        }
        return;
    }
    agilbankEnsureTitularNomeCache().then(function () {
        agilbankPopularDetalheCartaoNaUi(c, { titulo: 'Cartão', virtual: false });
        agilbankAbrirContainerCartao('cartaoFisicoContainer');
    });
}

function agilbankCartaoAcaoFisico() {
    var c = agilbankGetCartaoSelecionado();
    if (!c) return;
    if (!agilbankStatusCartaoAtivo(c)) {
        if (typeof showErrorModal === 'function') {
            showErrorModal('Em análise', 'Cartão físico indisponível enquanto o pedido estiver em análise.');
        }
        return;
    }
    agilbankEnsureTitularNomeCache().then(function () {
        agilbankPopularDetalheCartaoNaUi(c, { titulo: 'Cartão físico', virtual: false });
        agilbankAbrirContainerCartao('cartaoFisicoContainer');
    });
}

function agilbankCartaoAcaoVirtual() {
    var c = agilbankGetCartaoSelecionado();
    if (!c) return;
    if (!agilbankStatusCartaoAtivo(c)) {
        if (typeof showErrorModal === 'function') {
            showErrorModal('Em análise', 'Cartão virtual indisponível enquanto o pedido estiver em análise.');
        }
        return;
    }
    if ((c.tipo || '') !== 'debito') {
        if (typeof showErrorModal === 'function') {
            showErrorModal(
                'Cartão virtual',
                'Não há cartão virtual associado a este item. Só cartões do tipo débito exibem esta opção.'
            );
        }
        return;
    }
    agilbankEnsureTitularNomeCache().then(function () {
        agilbankPopularDetalheCartaoNaUi(c, { titulo: 'Cartão virtual', virtual: true });
        agilbankAbrirContainerCartao('cartaoVirtualContainer');
    });
}

window.agilbankCartaoAcaoStatus = agilbankCartaoAcaoStatus;
window.agilbankCartaoAcaoVer = agilbankCartaoAcaoVer;
window.agilbankCartaoAcaoFisico = agilbankCartaoAcaoFisico;
window.agilbankCartaoAcaoVirtual = agilbankCartaoAcaoVirtual;

function renderCartoesReaisGrid(cartoes) {
    var grid = document.getElementById('cartoesReaisGrid');
    if (!grid) return;
    grid.innerHTML = '';
    window.__agilbankCartoesLista = Array.isArray(cartoes) ? cartoes.slice() : [];

    var painel = document.getElementById('cartaoPainelAcoes');
    if (painel) {
        painel.style.display = window.__agilbankCartoesLista.length ? 'flex' : 'none';
    }

    if (!window.__agilbankCartoesLista.length) {
        window.__agilbankCartaoSelecionadoId = null;
        grid.innerHTML =
            '<p class="cartao-empty-msg" style="padding:16px;color:#666;">Nenhum cartão na conta ainda.</p>';
        agilbankAtualizarBotoesPainelCartoes();
        return;
    }

    var selOk = false;
    if (window.__agilbankCartaoSelecionadoId) {
        for (var j = 0; j < window.__agilbankCartoesLista.length; j++) {
            if (window.__agilbankCartoesLista[j].id === window.__agilbankCartaoSelecionadoId) {
                selOk = true;
                break;
            }
        }
    }
    if (!selOk) {
        window.__agilbankCartaoSelecionadoId = window.__agilbankCartoesLista[0].id;
    }

    window.__agilbankCartoesLista.forEach(function (c) {
        var last4 = c.last4 != null ? String(c.last4).replace(/\D/g, '').slice(-4).padStart(4, '0') : '----';
        var tipo = (c.tipo || 'credito') === 'debito' ? 'Débito' : 'Crédito';
        var lim = c.limite != null ? Number(c.limite) : NaN;
        var limTxt = isFinite(lim)
            ? 'R$ ' + lim.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
            : 'Indisponível';
        var wrap = document.createElement('div');
        wrap.className = 'cartao-item' + ((c.tipo || '') === 'debito' ? ' virtual' : '');
        wrap.setAttribute('data-cartao-id', c.id);
        wrap.setAttribute('role', 'button');
        wrap.setAttribute('tabindex', '0');
        wrap.innerHTML =
            '<div><div class="cartao-nome">' +
            tipo +
            '</div>' +
            '<div class="cartao-numero">•••• ' +
            last4 +
            '</div>' +
            '<div style="font-size:12px;color:#555;margin-top:6px;">Limite: ' +
            limTxt +
            '</div>' +
            '<div style="font-size:12px;color:#0066b3;margin-top:4px;">' +
            statusCartaoLabel(c.status) +
            '</div></div>';

        wrap.addEventListener('click', function () {
            window.__agilbankCartaoSelecionadoId = c.id;
            grid.querySelectorAll('.cartao-item.is-selected').forEach(function (n) {
                n.classList.remove('is-selected');
            });
            wrap.classList.add('is-selected');
            agilbankAtualizarBotoesPainelCartoes();
        });

        if (c.id === window.__agilbankCartaoSelecionadoId) {
            wrap.classList.add('is-selected');
        }

        grid.appendChild(wrap);
    });

    agilbankPainelCartoesBindAcoes();
    agilbankAtualizarBotoesPainelCartoes();
}

/**
 * Esconde banners/modal de oferta no dashboard quando já existe cartão na API.
 */
function agilbankSetDashboardCardOffersVisible(visible) {
    var disp = visible ? '' : 'none';
    var banner = document.querySelector('.banner-divulgação');
    if (banner) banner.style.display = disp;
    var mini = document.querySelector('#container .cartao-container');
    if (mini) mini.style.display = disp;
}

function resetCartaoSolicitacaoFlowUi() {
    var flow = document.getElementById('cartaoSolicitacaoFlow');
    if (!flow) return;
    var root = document.getElementById('cartaoWizardRoot');
    if (root) root.style.display = 'block';
    var nav = document.getElementById('cartaoWizardNav');
    if (nav) nav.style.display = 'flex';
    var tc = document.getElementById('termosCheck');
    if (tc) tc.checked = false;
    var pw = document.getElementById('cartaoInputSenha');
    if (pw) pw.value = '';
    limparDadosCartao();
    ['progressContainer', 'vencimentoContainer', 'aprovacaoContainer', 'cartaoInfo', 'statusContainer', 'cartaoSolicitacaoPendenteContainer'].forEach(function (id) {
        var el = document.getElementById(id);
        if (el) el.style.display = 'none';
    });
    agilbankWizardGoToStep(1);
    agilbankWizardBindNav();
    agilbankWizardHydratePerfil();
}

/**
 * @param {Array} cartoes — resultado de GET /api/cards
 */
function agilbankAplicarEstadoPainelCartao(cartoes) {
    var list = Array.isArray(cartoes) ? cartoes : [];
    var flow = document.getElementById('cartaoSolicitacaoFlow');
    var listaSec = document.getElementById('cartaoListaRealSection');
    var msg = document.getElementById('cartaoPainelMensagem');

    agilbankSetDashboardCardOffersVisible(list.length === 0);

    if (list.length === 0) {
        if (flow) flow.style.display = 'block';
        if (listaSec) listaSec.style.display = 'block';
        resetCartaoSolicitacaoFlowUi();
        renderCartoesReaisGrid([]);
        if (msg) {
            msg.style.display = 'none';
            msg.textContent = '';
        }
        return;
    }

    if (flow) flow.style.display = 'none';
    if (listaSec) listaSec.style.display = 'block';
    renderCartoesReaisGrid(list);
    if (msg) {
        var st0 = String((list[0] && list[0].status) || 'pendente').toLowerCase();
        if (st0 === 'pendente' || (st0 !== 'aprovado' && st0 !== 'ativo')) {
            msg.textContent = 'Solicitação enviada. Seu pedido está em análise.';
            msg.style.display = 'block';
        } else {
            msg.style.display = 'none';
            msg.textContent = '';
        }
    }
}

/**
 * Atualiza painel de cartões (GET) + ofertas no dashboard. Expõe para index.html.
 */
async function agilbankRefreshPainelCartoes() {
    var cartoes = await fetchCartoesFromApi();
    agilbankAplicarEstadoPainelCartao(cartoes);
    return cartoes;
}

window.agilbankRefreshPainelCartoes = agilbankRefreshPainelCartoes;
window.agilbankAplicarEstadoPainelCartao = agilbankAplicarEstadoPainelCartao;
window.agilbankSetDashboardCardOffersVisible = agilbankSetDashboardCardOffersVisible;
window.agilbankFetchCartoes = fetchCartoesFromApi;

function buildNumeroLegacyFromLast4(last4) {
    var l4 = String(last4 == null ? '0000' : last4)
        .replace(/\D/g, '')
        .slice(-4)
        .padStart(4, '0');
    return '4532' + '11111111' + l4;
}

function normalizarCartaoParaLegado(cartao, fallbackLimite) {
    if (!cartao || typeof cartao !== 'object') {
        return { limite: fallbackLimite };
    }
    var last4 = cartao.last4 != null ? String(cartao.last4) : '0000';
    var limiteRaw = cartao.limite != null ? cartao.limite : fallbackLimite;
    var limite = typeof limiteRaw === 'number' ? limiteRaw : parseFloat(String(limiteRaw), 10);
    var numero = buildNumeroLegacyFromLast4(last4);
    return Object.assign({}, cartao, {
        limite: isFinite(limite) ? limite : fallbackLimite,
        numero: numero,
        maskedNumber: cartao.maskedNumber || '**** **** **** ' + last4.slice(-4),
        validade: cartao.validade,
        status: cartao.status,
        tipo: cartao.tipo || 'credito'
    });
}

// ==========================================
// Funções de Interface do Usuário
// ==========================================

/**
 * Calcula o limite do cartão baseado na renda
 * @param {number} renda - Valor da renda mensal
 * @returns {number} Limite calculado
 */
function calcularLimite(renda) {
    // Calcular limite baseado na renda (sem valor fixo)
    const limiteBase = Math.min(Math.max(renda * 0.4, 1000), 10000);
    return limiteBase;
}

/**
 * Inicia o processo de solicitação do cartão
 * Valida os termos, coleta dados e envia para a API real
 */
async function enviarSolicitacao() {
    var token = getCartaoAuthToken();
    if (!token) {
        showErrorModal('Erro de Autenticação', 'Você precisa estar logado para solicitar um cartão. Faça login primeiro.');
        return;
    }

    if (!window.AgilBank || !window.AgilBank.api || typeof window.AgilBank.api.request !== 'function') {
        showErrorModal('Erro', 'Cliente de API indisponível. Recarregue a página.');
        return;
    }

    if (!document.getElementById('termosCheck').checked) {
        showErrorModal('Termos Obrigatórios', 'Por favor, aceite os termos para continuar.');
        return;
    }

    const dadosCartao = coletarDadosCartao();
    if (!dadosCartao) return; // Se houver campos vazios, interrompe o processo

    var wizRoot = document.getElementById('cartaoWizardRoot');
    if (wizRoot) wizRoot.style.display = 'none';
    var wNav = document.getElementById('cartaoWizardNav');
    if (wNav) wNav.style.display = 'none';
    var pcMain = document.getElementById('progressContainer');
    if (pcMain) pcMain.style.display = 'block';

    var progressFill = document.getElementById('progressFill');
    if (progressFill) progressFill.style.width = '0%';
    var barProg = 0;
    var barTimer = setInterval(function () {
        barProg = Math.min(barProg + 5, 85);
        if (progressFill) progressFill.style.width = barProg + '%';
    }, 80);

    try {
        const rendaInput = document.getElementById('rendaInput').value;
        const renda = parseFloat(String(rendaInput).replace(/\D/g, ''));
        var limEl = document.getElementById('cartaoLimiteDesejado');
        var limitePedido;
        if (limEl && limEl.value !== '' && isFinite(parseFloat(limEl.value, 10))) {
            limitePedido = clampLimiteCartao(parseFloat(limEl.value, 10));
        } else {
            limitePedido = clampLimiteCartao(calcularLimite(renda));
        }
        var payloadApi = {
            tipo: 'credito',
            limite: limitePedido,
            dadosAnalise: {
                rendaMensalDeclarada: dadosCartao.rendaMensalDeclarada,
                tempoEmprego: dadosCartao.tempoEmprego,
                empresa: dadosCartao.empresa,
                empresaAtual: dadosCartao.empresaAtual,
                endereco: dadosCartao.endereco
            },
            lgpd: { versao: 'wizard-v1', aceito: true }
        };

        console.log('🔄 Enviando solicitação de cartão para API...', {
            tipo: payloadApi.tipo,
            limite: payloadApi.limite,
            temDadosAnalise: Boolean(payloadApi.dadosAnalise),
            lgpdVersao: payloadApi.lgpd && payloadApi.lgpd.versao
        });

        const response = await window.AgilBank.api.request('cards', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(payloadApi)
        });

        const result = await response.json().catch(function () {
            return {};
        });

        clearInterval(barTimer);
        if (progressFill) progressFill.style.width = '100%';

        if (response.ok) {
            var cartaoApi = extrairCartaoDaResposta(result);
            var normalized = normalizarCartaoParaLegado(cartaoApi, limitePedido);
            console.log('✅ Cartão criado com sucesso:', normalized);

            localStorage.setItem('cartao_solicitado', JSON.stringify(normalized));
            limparDadosCartao();

            var limiteNum = normalized.limite;
            var textoLimite = typeof limiteNum === 'number'
                ? 'R$ ' + limiteNum.toFixed(2).replace('.', ',')
                : String(limiteNum);
            if (typeof window.aplicarLimiteCartaoNosSeisElementos === 'function') {
                window.aplicarLimiteCartaoNosSeisElementos(textoLimite);
            } else {
                ['limiteOpcoesValorPrincipal', 'limiteOpcoesValorDetalhe', 'limiteCartaoVirtualHeader', 'limiteCartaoVirtualRodape', 'limiteCartaoFisicoHeader', 'limiteCartaoFisicoRodape'].forEach(function (elid) {
                    var el = document.getElementById(elid);
                    if (el) el.textContent = textoLimite;
                });
            }

            // Resultado no passo 7 com base no GET; depois atualiza painel (esconde wizard se houver cartão).
            setTimeout(async function () {
                var pc = document.getElementById('progressContainer');
                var vc = document.getElementById('vencimentoContainer');
                if (pc) pc.style.display = 'none';
                if (vc) vc.style.display = 'none';

                var wr = document.getElementById('cartaoWizardRoot');
                if (wr) wr.style.display = 'block';

                var list = await fetchCartoesFromApi();
                agilbankWizardAplicarResultadoPosPost(list);
                agilbankWizardGoToStep(7);

                setTimeout(function () {
                    agilbankRefreshPainelCartoes();
                }, 2600);
            }, 600);

        } else {
            console.error('❌ Erro ao criar cartão:', result);
            showErrorModal(
                'Erro na Solicitação',
                result.message || result.error || 'Erro ao processar solicitação do cartão'
            );

            var pcErr = document.getElementById('progressContainer');
            if (pcErr) pcErr.style.display = 'none';
            var wrE = document.getElementById('cartaoWizardRoot');
            if (wrE) wrE.style.display = 'block';
            var navE = document.getElementById('cartaoWizardNav');
            if (navE) navE.style.display = 'flex';
        }

    } catch (error) {
        clearInterval(barTimer);
        console.error('❌ Erro na requisição:', error);
        showErrorModal('Erro de Conexão', 'Erro ao conectar com o servidor. Verifique sua internet e tente novamente.');

        var pcEx = document.getElementById('progressContainer');
        if (pcEx) pcEx.style.display = 'none';
        var wrX = document.getElementById('cartaoWizardRoot');
        if (wrX) wrX.style.display = 'block';
        var navX = document.getElementById('cartaoWizardNav');
        if (navX) navX.style.display = 'flex';
    }
}

/**
 * Mostra modal de erro personalizado
 */
function showErrorModal(title, message) {
    const modal = document.createElement('div');
    modal.style.cssText = `
        position: fixed;
        top: 50%;
        left: 50%;
        transform: translate(-50%, -50%);
        background: white;
        padding: 20px;
        border-radius: 8px;
        box-shadow: 0 2px 10px rgba(0,0,0,0.1);
        z-index: 1000;
        max-width: 400px;
        width: 90%;
        text-align: center;
    `;

    modal.innerHTML = `
        <h3 style="color: #ff4444; margin-bottom: 15px;">${title}</h3>
        <p>${message}</p>
        <button style="
            background: #007bff;
            color: white;
            border: none;
            padding: 8px 16px;
            border-radius: 4px;
            cursor: pointer;
            margin-top: 15px;
        ">OK</button>
    `;

    const overlay = document.createElement('div');
    overlay.style.cssText = `
        position: fixed;
        top: 0;
        left: 0;
        width: 100%;
        height: 100%;
        background: rgba(0,0,0,0.5);
        z-index: 999;
    `;

    modal.querySelector('button').onclick = () => {
        document.body.removeChild(overlay);
        document.body.removeChild(modal);
    };

    document.body.appendChild(overlay);
    document.body.appendChild(modal);
}

/**
 * Controla a animação da barra de progresso
 * Incrementa o progresso até 100% e então mostra o container de vencimento
 */
function iniciarBarraProgresso() {
    mostrarAnimacaoGovBr(() => {
    let progress = 0;
    const progressFill = document.getElementById('progressFill');
    const progressInterval = setInterval(() => {
        progress += 1;
        progressFill.style.width = progress + '%';
        
        if (progress >= 100) {
            clearInterval(progressInterval);
            document.getElementById('progressContainer').style.display = 'none';
            document.getElementById('vencimentoContainer').style.display = 'block';
        }
    }, 150); 
    });
}

/**
 * Gerencia a seleção do dia de vencimento e atualiza as informações do cartão
 * @param {number} dia - Dia do vencimento selecionado
 */
async function selecionarVencimento(dia, ev) {
    var rootEv = ev || (typeof event !== 'undefined' ? event : null);
    document.querySelectorAll('.vencimento-option').forEach(option => {
        option.classList.remove('selected');
    });
    if (rootEv && rootEv.currentTarget) {
        rootEv.currentTarget.classList.add('selected');
    }

    try {
        // Buscar dados do cartão criado
        const cartaoSolicitado = localStorage.getItem('cartao_solicitado');
        if (!cartaoSolicitado) {
            console.error('❌ Dados do cartão não encontrados');
            showErrorModal('Erro', 'Dados do cartão não encontrados. Tente novamente.');
            return;
        }

        const cartaoData = JSON.parse(cartaoSolicitado);
        console.log('📋 Dados do cartão:', cartaoData);

        // Sequência de exibição dos containers com delays
        mostrarAnimacaoGovBr(() => {
            mostrarAnimacaoGovBr(() => {
                mostrarAnimacaoGovBr(() => {
                    document.getElementById('vencimentoContainer').style.display = 'none';
                    document.getElementById('aprovacaoContainer').style.display = 'block';
                    
                    setTimeout(() => {
                        document.getElementById('aprovacaoContainer').style.display = 'none';
                        document.getElementById('cartaoInfo').style.display = 'block';
                        document.getElementById('statusContainer').style.display = 'block';
                        
                        // Atualiza as informações do cartão com dados reais
                        document.getElementById('limiteValue').textContent = `R$ ${cartaoData.limite.toLocaleString('pt-BR', {minimumFractionDigits: 2})}`;
                        document.getElementById('vencimentoValue').textContent = `Dia ${dia}`;
                        
                        // Buscar endereço do formulário
                        var enderecoInput =
                            document.getElementById('cartaoInputRua') ||
                            document.querySelector('input[placeholder="Rua, número, complemento"]');
                        const endereco = enderecoInput && enderecoInput.value
                            ? enderecoInput.value
                            : 'Endereço não informado';
                        document.getElementById('enderecoValue').textContent = endereco;
                        
                        // Atualizar informações adicionais do cartão
                        atualizarInformacoesCartao(cartaoData, dia);
                        atualizarEnderecoEntrega();

                        // Garante que não volte para a tela anterior
                        var vencEl = document.getElementById('vencimentoContainer');
                        if (vencEl) vencEl.style.display = 'none';
                    }, 3000); // Reduzido para 3 segundos para melhor UX
                });
            });
        });

    } catch (error) {
        console.error('❌ Erro ao processar vencimento:', error);
        showErrorModal('Erro', 'Erro ao processar seleção de vencimento. Tente novamente.');
    }
}

/**
 * Atualiza informações adicionais do cartão com dados reais
 */
function atualizarInformacoesCartao(cartaoData, diaVencimento) {
    function aplicarNumero(el) {
        if (cartaoData.numero) {
            const numeroMascarado = cartaoData.numero.substring(0, 4) + '****' + cartaoData.numero.substring(12);
            el.textContent = numeroMascarado;
        }
    }
    function aplicarValidade(el) {
        if (cartaoData.validade) {
            el.textContent = cartaoData.validade;
        }
    }
    ['numeroCartaoVirtual', 'numeroCartaoFisico'].forEach(function(id) {
        var el = document.getElementById(id);
        if (el) aplicarNumero(el);
    });
    ['validadeCartaoVirtual', 'validadeCartaoFisico'].forEach(function(id) {
        var el = document.getElementById(id);
        if (el) aplicarValidade(el);
    });

    // Atualizar status
    const statusElement = document.getElementById('statusCartao');
    if (statusElement) {
        statusElement.textContent = cartaoData.status || 'Pendente';
    }

    // Atualizar tipo
    const tipoElement = document.getElementById('tipoCartao');
    if (tipoElement) {
        tipoElement.textContent = cartaoData.tipo || 'Crédito';
    }

    console.log('✅ Informações do cartão atualizadas:', {
        numero: cartaoData.numero ? cartaoData.numero.substring(0, 4) + '****' + cartaoData.numero.substring(12) : 'N/A',
        validade: cartaoData.validade,
        limite: cartaoData.limite,
        status: cartaoData.status,
        diaVencimento: diaVencimento
    });
}

/**
 * Verifica se o usuário já solicitou um cartão e redireciona adequadamente
 */
/**
 * @returns {boolean|undefined} true = tem cartão (fluxo gerenciamento); false = lista vazia (abrir solicitação); undefined = erro/auth (não assumir sem cartão)
 */
async function verificarCartaoSolicitado() {
    var token = getCartaoAuthToken();
    if (!token) {
        return false;
    }

    if (!window.AgilBank || !window.AgilBank.api || typeof window.AgilBank.api.request !== 'function') {
        console.warn('⚠️ AgilBank.api indisponível ao verificar cartões');
        return undefined;
    }

    try {
        const response = await window.AgilBank.api.request('cards', {
            method: 'GET',
            headers: {
                'Content-Type': 'application/json'
            }
        });

        if (response.status === 401 || response.status === 403) {
            var errBody = await response.json().catch(function () {
                return {};
            });
            showErrorModal(
                'Acesso ao cartão',
                errBody.message || 'Não foi possível verificar seus cartões. Faça login ou verifique seu e-mail.'
            );
            return undefined;
        }

        if (!response.ok) {
            console.log('⚠️ Erro ao buscar cartões:', response.status);
            return undefined;
        }

        const result = await response.json().catch(function () {
            return {};
        });
        const cartoes = extrairCartoesDaResposta(result);

        if (cartoes.length > 0) {
            console.log('✅ Usuário já possui cartões:', cartoes);

            ocultarTodosContainers();
            mostrarAnimacaoLogo02(() => {
                document.getElementById('cartaoGerenciamentoContainer').style.display = 'block';
                document.getElementById('cartaoGerenciamentoContainer').style.opacity = '1';
                document.getElementById('cartaoGerenciamentoContainer').style.transform = 'translateX(0)';
                window.scrollTo(0, 0);
                agilbankAplicarEstadoPainelCartao(cartoes);
            });
            return true;
        }
    } catch (error) {
        console.error('❌ Erro ao verificar cartões:', error);
        return undefined;
    }

    return false;
}

// Modifica a função showCartaoContainer para incluir a verificação
// Aguardar a função ser definida
setTimeout(() => {
    if (typeof showCartaoContainer === 'function') {
        const originalShowCartaoContainer = showCartaoContainer;
        showCartaoContainer = async function() {
            const temCartao = await verificarCartaoSolicitado();
            if (temCartao === false) {
                originalShowCartaoContainer();
            }
        };
    }
}, 1000);

function startCountdown() {
    let hours = 72;
    let minutes = 0;
    let seconds = 0;
    
    const countdownElement = document.getElementById('countdown');
    
    const timer = setInterval(() => {
        if (seconds > 0) {
            seconds--;
        } else if (minutes > 0) {
            minutes--;
            seconds = 59;
        } else if (hours > 0) {
            hours--;
            minutes = 59;
            seconds = 59;
        } else {
            clearInterval(timer);
        }
        
        countdownElement.textContent = 
            `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
    }, 1000);
}
(function agilbankWizardBoot() {
    function run() {
        agilbankWizardBindNav();
        agilbankPainelCartoesBindAcoes();
    }
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', run);
    } else {
        run();
    }
})();

startCountdown();
