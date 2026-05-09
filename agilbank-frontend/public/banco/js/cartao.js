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
            showErrorModal('Renda obrigatória', 'Informe sua renda mensal na etapa “Dados profissionais”.');
        }
        return null;
    }

    var tempoVal = gv('cartaoSelectTempo').trim();
    if (!tempoVal) {
        if (typeof showErrorModal === 'function') {
            showErrorModal('Dados profissionais', 'Selecione o tempo no emprego ou “Não informado”.');
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

/** PIN do wizard (4 quadrados): sincroniza com #cartaoInputSenha sem interferir no login. */
function agilbankWizardPinSyncHidden() {
    var wrap = document.getElementById('cartaoWizardPinWrap');
    var hidden = document.getElementById('cartaoInputSenha');
    if (!wrap || !hidden) return;
    var inputs = wrap.querySelectorAll('input[data-cartao-pin]');
    var s = '';
    inputs.forEach(function (inp) {
        s += String(inp.value || '').replace(/\D/g, '').slice(0, 1);
        var square = inp.closest ? inp.closest('.password-square') : null;
        if (square) square.classList.toggle('filled', Boolean(inp.value));
    });
    hidden.value = s.slice(0, 4);
}

function agilbankWizardPinOnInput(input, index) {
    var wrap = document.getElementById('cartaoWizardPinWrap');
    if (!wrap || !input) return;
    var d = String(input.value || '').replace(/\D/g, '');
    input.value = d.length ? d.slice(-1) : '';
    agilbankWizardPinSyncHidden();
    if (input.value && index < 3) {
        var next = wrap.querySelector('input[data-cartao-pin="' + (index + 1) + '"]');
        if (next) next.focus();
    }
}

function agilbankWizardPinClear() {
    var wrap = document.getElementById('cartaoWizardPinWrap');
    var hidden = document.getElementById('cartaoInputSenha');
    if (wrap) {
        wrap.querySelectorAll('input[data-cartao-pin]').forEach(function (inp) {
            inp.value = '';
        });
    }
    if (hidden) hidden.value = '';
}

function agilbankWizardPinBind() {
    var wrap = document.getElementById('cartaoWizardPinWrap');
    if (!wrap || wrap._agilPinBound) return;
    wrap._agilPinBound = true;
    var inputs = wrap.querySelectorAll('input[data-cartao-pin]');
    inputs.forEach(function (input) {
        var index = parseInt(input.getAttribute('data-cartao-pin'), 10);
        input.addEventListener('input', function () {
            agilbankWizardPinOnInput(input, index);
        });
        input.addEventListener('keydown', function (e) {
            if (e.key === 'Backspace' && !input.value && index > 0) {
                var prev = wrap.querySelector('input[data-cartao-pin="' + (index - 1) + '"]');
                if (prev) {
                    prev.value = '';
                    prev.focus();
                    agilbankWizardPinSyncHidden();
                }
                e.preventDefault();
            }
        });
        input.addEventListener('paste', function (e) {
            e.preventDefault();
            var text = (e.clipboardData && e.clipboardData.getData('text')) || '';
            var digits = String(text).replace(/\D/g, '').slice(0, 4);
            if (!digits) return;
            var i;
            for (i = 0; i < digits.length && index + i < 4; i++) {
                var inp = wrap.querySelector('input[data-cartao-pin="' + (index + i) + '"]');
                if (inp) inp.value = digits.charAt(i);
            }
            var focusIdx = Math.min(index + digits.length, 3);
            var focusEl = wrap.querySelector('input[data-cartao-pin="' + focusIdx + '"]');
            if (focusEl) focusEl.focus();
            agilbankWizardPinSyncHidden();
        });
        /* Aparência dos bullets: só CSS (style.cartaoWizard.css); inline aqui sobrescrevia a folha e gerava mancha cinza. */
    });
    wrap.addEventListener('click', function () {
        var i;
        var firstEmpty = null;
        for (i = 0; i < 4; i++) {
            var inp = wrap.querySelector('input[data-cartao-pin="' + i + '"]');
            if (inp && !inp.value) {
                firstEmpty = inp;
                break;
            }
        }
        var last = wrap.querySelector('input[data-cartao-pin="3"]');
        (firstEmpty || last).focus();
    });
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
    var logr = e.rua || e.logradouro || e.endereco || '';
    var num = e.numero != null && String(e.numero).trim() ? String(e.numero).trim() : '';
    var comp = e.complemento != null && String(e.complemento).trim() ? String(e.complemento).trim() : '';
    var ruaParts = [logr];
    if (num) ruaParts.push(num);
    o.rua = ruaParts.filter(function (x) { return x && String(x).trim(); }).join(', ');
    if (comp) o.rua = o.rua ? o.rua + ' — ' + comp : comp;
    o.bairro = e.bairro || '';
    o.cidade = e.cidade || e.localidade || '';
    o.estado = e.estado || e.uf || '';
    o.cep = e.cep || e.CEP || '';
    return o;
}

/** Mesmo desembrulho que `aplicarDadosUsuarioReais` — cobre `user_data.usuario`, `data.user` e respostas planas. */
function agilbankWizardExtractUsuario(profile) {
    if (!profile || typeof profile !== 'object') return null;
    var u = profile.user_data && profile.user_data.usuario ? profile.user_data.usuario : null;
    if (!u && profile.data) {
        if (profile.data.user) u = profile.data.user;
        else if (profile.data.user_data && profile.data.user_data.usuario) u = profile.data.user_data.usuario;
    }
    if (!u && (profile.nome_completo || profile.nomeCompleto || profile.email || profile.cpf)) u = profile;
    return u;
}

function agilbankWizardFormatarCpfExibicao(cpf) {
    var cpfD = String(cpf || '').replace(/\D/g, '');
    if (cpfD.length === 11) return cpfD.replace(/(\d{3})(\d{3})(\d{3})(\d{2})/, '$1.$2.$3-$4');
    return String(cpf || '').trim();
}

/** Tenta mapear texto livre de `tempoTrabalho` (Prisma) para valores do `<select id="cartaoSelectTempo">`. */
function agilbankWizardMapTempoEmpregoSelect(tempoRaw) {
    if (tempoRaw == null || tempoRaw === '') return '';
    var t = String(tempoRaw).toLowerCase().trim();
    if (t === '6m' || t === '1a' || t === '2a' || t === '2a+' || t === 'ni') return t;
    if (t.indexOf('não inform') >= 0 || t.indexOf('nao inform') >= 0) return 'ni';
    if (t.indexOf('menos') >= 0 && t.indexOf('6') >= 0) return '6m';
    if (t.indexOf('mais de 2') >= 0 || (t.indexOf('2') >= 0 && t.indexOf('ano') >= 0 && t.indexOf('1 a') < 0)) return '2a+';
    if (t.indexOf('1 a 2') >= 0 || t.indexOf('dois ano') >= 0) return '2a';
    if (t.indexOf('6 meses') >= 0 || t.indexOf('um ano') >= 0 || t.indexOf('1 ano') >= 0) return '1a';
    return '';
}

function agilbankWizardAplicarProfissionaisDoPerfil(n) {
    if (!n || !n.dados_profissionais || typeof n.dados_profissionais !== 'object') return;
    var prof = n.dados_profissionais;
    var ge = document.getElementById('cartaoInputEmpresa');
    var ga = document.getElementById('cartaoInputEmpresaAtual');
    var ri = document.getElementById('rendaInput');
    var st = document.getElementById('cartaoSelectTempo');
    var emp =
        prof.empresa != null && String(prof.empresa).trim()
            ? String(prof.empresa).trim()
            : prof.empresaAtual != null && String(prof.empresaAtual).trim()
              ? String(prof.empresaAtual).trim()
              : '';
    var cargo =
        prof.cargo != null && String(prof.cargo).trim() ? String(prof.cargo).trim() : '';
    if (ge && !String(ge.value).trim() && emp) ge.value = emp;
    if (ga && !String(ga.value).trim() && cargo) ga.value = cargo;
    if (ri && !String(ri.value).trim()) {
        var rm = prof.rendaMensal != null ? prof.rendaMensal : prof.renda_mensal;
        if (rm != null && rm !== '') {
            var rNum = Number(rm);
            if (isFinite(rNum) && rNum >= 1) {
                ri.value = String(Math.round(rNum));
            }
        }
    }
    if (st && !String(st.value).trim()) {
        var tt = prof.tempoTrabalho != null ? prof.tempoTrabalho : prof.tempo_trabalho;
        var mapped = agilbankWizardMapTempoEmpregoSelect(tt);
        if (mapped) st.value = mapped;
    }
}

function agilbankSetSolicitacaoWizardMode(ativo) {
    var ger = document.getElementById('cartaoGerenciamentoContainer');
    if (ger) {
        ger.classList.toggle('cartao-gerenciamento--solicitacao-ativa', !!ativo);
    }
    document.body.classList.toggle('agilbank-cartao-wizard-open', !!ativo);
}

function agilbankFecharSolicitacaoCartao() {
    var flow = document.getElementById('cartaoSolicitacaoFlow');
    var listaSec = document.getElementById('cartaoListaRealSection');
    agilbankSetSolicitacaoWizardMode(false);
    if (flow) flow.style.display = 'none';
    if (listaSec) listaSec.style.display = 'block';
    if (typeof window.agilbankRefreshPainelCartoes === 'function') {
        window.agilbankRefreshPainelCartoes();
    }
}

async function agilbankWizardHydratePerfil() {
    var token = getCartaoAuthToken();
    if (!window.AgilBank || !window.AgilBank.api) return;
    if (!token) {
        console.warn('agilbankWizardHydratePerfil: sem JWT (getCartaoAuthToken vazio). Faça login para hidratar o perfil.');
        return;
    }
    var nome = '';
    var email = '';
    var cpf = '';
    var tel = '';
    var end = { rua: '', bairro: '', cidade: '', estado: '', cep: '' };
    var hydrateErro = false;
    var backendEnderecoRecebido = false;

    function aplicarNormalizado(n) {
        if (!n) return;
        nome = n.nomeCompleto || '';
        email = n.email || '';
        cpf = agilbankWizardFormatarCpfExibicao(n.cpf || '');
        tel = n.telefone != null ? String(n.telefone).trim() : '';
        end = agilbankWizardExtrairEnderecoPerfil(n);
        agilbankWizardAplicarProfissionaisDoPerfil(n);
    }

    if (window.__agilbankUltimosDadosUsuarioReais) {
        aplicarNormalizado(window.__agilbankUltimosDadosUsuarioReais);
    }

    try {
        var response = await window.AgilBank.api.request('user/user-complete-data', {
            method: 'GET',
            headers: {
                'Content-Type': 'application/json',
                Authorization: 'Bearer ' + token
            },
            credentials: 'include'
        });
        if (response.ok) {
            var profile = await response.json().catch(function () {
                return {};
            });
            var u = agilbankWizardExtractUsuario(profile);
            var n = u && typeof window.normalizarDadosUsuarioBruto === 'function' ? window.normalizarDadosUsuarioBruto(u) : null;
            if (n) {
                aplicarNormalizado(n);
                backendEnderecoRecebido = !!(n.endereco && typeof n.endereco === 'object');
            }
        } else {
            hydrateErro = true;
            var warnPayload = {
                status: response.status,
                endpoint: 'user/user-complete-data',
                hasBearer: !!token,
                tokenLen: token ? String(token).length : 0
            };
            if (response.status === 401) {
                warnPayload.hint =
                    'JWT inválido, expirado ou emitido por outro backend. Limpe storage, faça login de novo na mesma API (AGILBANK_API_BASE / Railway).';
            }
            console.warn('agilbankWizardHydratePerfil: falha no GET user/user-complete-data', warnPayload);
        }
    } catch (err) {
        hydrateErro = true;
        console.warn('agilbankWizardHydratePerfil: excecao ao hidratar perfil', {
            endpoint: 'user/user-complete-data',
            hasBearer: !!token,
            error: err && err.message ? err.message : String(err || '')
        });
    }

    function setTxt(id, v, fallbackTexto) {
        var el = document.getElementById(id);
        if (!el) return;
        if (fallbackTexto && (v == null || String(v).trim() === '')) {
            el.textContent = fallbackTexto;
            return;
        }
        el.textContent = agilbankWizardDisplayNz(v);
    }
    setTxt('wizDispNome', nome);
    setTxt('wizDispEmail', email);
    setTxt('wizDispCpf', cpf);
    setTxt('wizDispTel', tel);

    var fallbackEndereco = hydrateErro && !backendEnderecoRecebido ? 'Erro ao carregar' : '';
    setTxt('wizDispRua', end.rua, fallbackEndereco);
    setTxt('wizDispBairro', end.bairro, fallbackEndereco);
    var cidadeUf = [end.cidade, end.estado].filter(function (x) {
        return x && String(x).trim();
    }).join(' / ');
    setTxt('wizDispCidadeUf', cidadeUf, fallbackEndereco);
    setTxt('wizDispCep', end.cep, fallbackEndereco);

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
    if (agilbankWizardStep <= 1) {
        agilbankFecharSolicitacaoCartao();
        return;
    }
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
            if (bid === 'cartaoWizardNext' && b.hasAttribute('style')) {
                b.removeAttribute('style');
            }
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
    agilbankWizardPinBind();
}

function agilbankWizardAplicarResultadoPosPost(cartoes, proximosPassos) {
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
                var linhas = [
                    'Seu cartão foi aprovado. Acompanhe a emissão e os detalhes em Meus cartões.'
                ];
                if (proximosPassos && proximosPassos.envioFisico) {
                    var ef = proximosPassos.envioFisico;
                    if (ef.temRemessaAberta && ef.mensagemRemessa) {
                        linhas.push(String(ef.mensagemRemessa));
                    } else if (ef.cobrancaFreteAplicavel) {
                        linhas.push(
                            'Para receber o cartão físico, acompanhe a cobrança de frete em Cobranças.'
                        );
                    } else {
                        linhas.push(
                            'A emissão e o envio físico (quando disponíveis) poderão ser acompanhados em Meus cartões.'
                        );
                    }
                }
                txt.textContent = linhas.join(' ');
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

/** Remove espaços e prefixo "Bearer " se alguém gravou o header inteiro no storage. */
function agilbankNormalizeBearerToken(raw) {
    if (raw == null) return null;
    var s = String(raw).trim();
    if (!s) return null;
    var m = s.match(/^Bearer\s+(.+)$/i);
    if (m) return m[1].trim();
    return s;
}

function getCartaoAuthToken() {
    var raw = null;
    if (window.AgilBank && window.AgilBank.auth && typeof window.AgilBank.auth.getToken === 'function') {
        raw = window.AgilBank.auth.getToken();
    }
    if (!raw) {
        raw =
            sessionStorage.getItem('govbr_token') ||
            localStorage.getItem('govbr_token') ||
            sessionStorage.getItem('agilbank_token') ||
            localStorage.getItem('agilbank_token') ||
            sessionStorage.getItem('token') ||
            localStorage.getItem('token') ||
            null;
    }
    return agilbankNormalizeBearerToken(raw);
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
        (body.data && body.data.cards) ||
        body.cartoes ||
        body.cards ||
        null;
    return Array.isArray(list) ? list : [];
}

/**
 * Valida formato de GET /api/cards antes de tratar lista como confiável.
 * Com `success: true`, exige `data.cartoes` ou `data.cards` como array.
 */
function agilbankValidarPayloadListaCartoesResponse(result) {
    if (!result || typeof result !== 'object') return false;
    if (result.success === true) {
        var d = result.data;
        if (!d || typeof d !== 'object') return false;
        if (Object.prototype.hasOwnProperty.call(d, 'cartoes')) {
            return Array.isArray(d.cartoes);
        }
        if (Object.prototype.hasOwnProperty.call(d, 'cards')) {
            return Array.isArray(d.cards);
        }
        return false;
    }
    var d2 = result.data;
    if (d2 && typeof d2 === 'object') {
        if (Object.prototype.hasOwnProperty.call(d2, 'cartoes')) {
            return Array.isArray(d2.cartoes);
        }
        if (Object.prototype.hasOwnProperty.call(d2, 'cards')) {
            return Array.isArray(d2.cards);
        }
    }
    if (Array.isArray(result.cartoes) || Array.isArray(result.cards)) {
        return true;
    }
    return false;
}

/**
 * GET /api/cards — resultado estruturado. Em erro de rede/HTTP/formato, `ok` é false e `cartoes` é null (nunca mascarar erro como lista vazia).
 * @returns {Promise<{ ok: true, cartoes: Array, reason: 'success' } | { ok: false, cartoes: null, error: string, reason: string, status?: number }>}
 */
async function fetchCartoesFromApi() {
    var token = getCartaoAuthToken();
    if (!token || !window.AgilBank || !window.AgilBank.api || typeof window.AgilBank.api.request !== 'function') {
        return {
            ok: false,
            cartoes: null,
            error: 'Sessão ou cliente de API indisponível. Faça login novamente.',
            reason: 'no_auth'
        };
    }
    try {
        var response = await window.AgilBank.api.request('cards', {
            method: 'GET',
            headers: { 'Content-Type': 'application/json' }
        });
        var result = await response.json().catch(function () {
            return null;
        });
        if (!response.ok) {
            var errMsg =
                (result && (result.message || result.error)) ||
                'Não foi possível carregar seus cartões agora.';
            return {
                ok: false,
                cartoes: null,
                error: String(errMsg),
                reason: 'http',
                status: response.status
            };
        }
        if (result == null || typeof result !== 'object') {
            return {
                ok: false,
                cartoes: null,
                error: 'Resposta inválida do servidor ao listar cartões.',
                reason: 'invalid_body'
            };
        }
        if (Object.prototype.hasOwnProperty.call(result, 'success') && result.success === false) {
            return {
                ok: false,
                cartoes: null,
                error: String(result.message || result.error || 'Não foi possível carregar seus cartões agora.'),
                reason: 'api'
            };
        }
        if (!agilbankValidarPayloadListaCartoesResponse(result)) {
            return {
                ok: false,
                cartoes: null,
                error: 'Formato de resposta inesperado ao listar cartões.',
                reason: 'invalid_shape'
            };
        }
        var cartoes = extrairCartoesDaResposta(result);
        if (!Array.isArray(cartoes)) {
            return {
                ok: false,
                cartoes: null,
                error: 'Formato de resposta inesperado ao listar cartões.',
                reason: 'invalid_shape'
            };
        }
        return { ok: true, cartoes: cartoes, reason: 'success' };
    } catch (e) {
        console.warn('fetchCartoesFromApi:', e);
        return {
            ok: false,
            cartoes: null,
            error: 'Erro de rede ao carregar cartões.',
            reason: 'network'
        };
    }
}

function statusCartaoLabel(status) {
    var s = String(status || '').trim().toLowerCase();
    if (s === 'ativo') return 'Ativo';
    if (s === 'aprovado') return 'Aprovado';
    if (s === 'bloqueado') return 'Bloqueado';
    if (s === 'rejeitado' || s === 'rejected' || s === 'negado' || s === 'recusado') return 'Solicitação não aprovada';
    if (
        s === 'pending' ||
        s === 'pendente' ||
        s.indexOf('pendente_') === 0 ||
        s === 'em_analise' ||
        s === 'em analise' ||
        s === 'analise'
    ) {
        return 'Em análise';
    }
    if (!s) return 'Em análise';
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
            var u = agilbankWizardExtractUsuario(data);
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
            criar.disabled = false;
            criar.title = '';
            criar.style.display = '';
            criar.style.pointerEvents = '';
        }
        var bqv = document.getElementById('btnBloquearCartaoVirtual');
        if (bqv) {
            var stv = String(c.status || '').toLowerCase();
            bqv.textContent = stv === 'bloqueado' ? 'Desbloquear' : 'Bloquear';
            bqv.disabled = !agilbankStatusCartaoAtivo(c) && stv !== 'bloqueado';
            bqv.title = bqv.disabled ? 'Indisponível no momento' : '';
            bqv.onclick = function () {
                agilbankToggleBloqueioCartaoVirtual(bqv);
            };
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
            var stf = String(c.status || '').toLowerCase();
            desb.textContent = stf === 'bloqueado' ? 'Desbloquear' : 'Bloquear';
            desb.disabled = !agilbankStatusCartaoAtivo(c) && stf !== 'bloqueado';
            desb.title = desb.disabled ? 'Indisponível no momento' : '';
            desb.onclick = function () {
                agilbankToggleBloqueioCartao(desb);
            };
        }
        var bqf = document.getElementById('btnBloquearCartaoFisico');
        if (bqf) {
            var stf2 = String(c.status || '').toLowerCase();
            bqf.textContent = stf2 === 'bloqueado' ? 'Desbloquear' : 'Bloquear';
            bqf.disabled = !agilbankStatusCartaoAtivo(c) && stf2 !== 'bloqueado';
            bqf.title = bqf.disabled ? 'Indisponível no momento' : '';
            bqf.onclick = function () {
                agilbankToggleBloqueioCartao(bqf);
            };
        }
    }
}

function agilbankShipmentFormatMoney(amount) {
    var n = Number(amount);
    if (!isFinite(n)) return 'Indisponível';
    return 'R$ ' + n.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function agilbankShipmentFormatDate(iso) {
    if (!iso) return 'Indisponível';
    var d = new Date(iso);
    if (isNaN(d.getTime())) return 'Indisponível';
    return d.toLocaleString('pt-BR');
}

function agilbankShipmentAddressText(addressSnapshot) {
    var a = addressSnapshot && typeof addressSnapshot === 'object' ? addressSnapshot : null;
    if (!a) return 'Endereço não informado pela API.';
    var logradouro = [a.logradouro, a.numero].filter(function (x) { return x && String(x).trim(); }).join(', ');
    if (a.complemento && String(a.complemento).trim()) {
        logradouro = logradouro ? logradouro + ' - ' + a.complemento : String(a.complemento).trim();
    }
    var cidadeUf = [a.cidade, a.estado].filter(function (x) { return x && String(x).trim(); }).join('/');
    var parts = [logradouro, a.bairro, cidadeUf, a.cep].filter(function (x) { return x && String(x).trim(); });
    return parts.length ? parts.join(' - ') : 'Endereço não informado pela API.';
}

function agilbankShipmentStatusMeta(status) {
    var s = String(status || '').trim().toUpperCase();
    var map = {
        AGUARDANDO_COBRANCA: {
            title: 'Em análise',
            description: 'Aguardando confirmação da cobrança do frete para iniciar o fluxo logístico.'
        },
        COBRANCA_CONFIRMADA: {
            title: 'Frete cobrado',
            description: 'Taxa de frete confirmada. Preparando o cartão físico para produção.'
        },
        EM_PRODUCAO: {
            title: 'Em produção',
            description: 'Seu cartão está em produção e seguirá para postagem após a finalização.'
        },
        POSTADO: {
            title: 'Postado',
            description: 'Cartão postado pela transportadora. O rastreio foi liberado.'
        },
        EM_TRANSITO: {
            title: 'Em trânsito',
            description: 'Cartão em trânsito para o endereço cadastrado.'
        },
        SAIU_PARA_ENTREGA: {
            title: 'Saiu para entrega',
            description: 'O cartão saiu para entrega e deve chegar no endereço informado.'
        },
        ENTREGUE: {
            title: 'Entregue',
            description: 'Entrega concluída com sucesso para o titular.'
        },
        FALHA_ENTREGA: {
            title: 'Falha na entrega',
            description: 'A transportadora informou falha na tentativa de entrega. Aguarde próxima atualização.'
        },
        DEVOLVIDO: {
            title: 'Falha na entrega',
            description: 'A remessa foi devolvida. Entre em contato com o suporte para nova emissão.'
        }
    };
    return map[s] || {
        title: 'Sem dados',
        description: 'A API não retornou um status logístico reconhecido para este cartão.'
    };
}

function agilbankShipmentTimelineLabelByEvent(ev) {
    var type = String(ev && ev.eventType ? ev.eventType : '').toUpperCase();
    if (type === 'SHIPMENT_CREATED') return 'Em análise';
    if (type === 'FRETE_COBRADO') return 'Frete cobrado';
    if (type === 'FRETE_RECUSADO') return 'Falha na cobrança do frete';
    if (type === 'STATUS_ATUALIZADO') {
        var meta = agilbankShipmentStatusMeta(ev && ev.shipmentStatus);
        return meta.title;
    }
    var fallback = agilbankShipmentStatusMeta(ev && ev.shipmentStatus);
    return fallback.title;
}

function agilbankRenderStatusEntregaParaCartao(c, state) {
    var host = document.getElementById('statusEntregaTimelineHost');
    var l1 = document.getElementById('statusEntregaLinha1');
    var l2 = document.getElementById('statusEntregaLinha2');
    var end = document.getElementById('enderecoEntrega');
    if (!host) return;
    var payload = state && typeof state === 'object' ? state : {};
    var uiState = payload.uiState || 'sem_dados';
    var shipment = payload.shipment || null;
    var timeline = Array.isArray(payload.timeline) ? payload.timeline : [];
    var timelineError = payload.timelineError || '';

    if (uiState === 'loading') {
        host.innerHTML =
            '<div class="status-item active"><div class="status-dot"></div><div class="status-content">' +
            '<h4>Carregando status</h4>' +
            '<p>Consultando frete e rastreamento no backend...</p>' +
            '<small>Aguarde alguns segundos</small></div></div>';
        if (l1) l1.textContent = 'Frete: carregando...';
        if (l2) l2.textContent = 'Status logístico: carregando...';
        if (end) end.textContent = 'Endereço de entrega: carregando...';
        return;
    }

    if (uiState === 'em_analise') {
        host.innerHTML =
            '<div class="status-item active"><div class="status-dot"></div><div class="status-content">' +
            '<h4>Em análise</h4>' +
            '<p>Seu cartão ainda está em análise. A entrega só inicia após aprovação e criação da remessa no backend.</p>' +
            '<small>Status do cartão: pendente</small></div></div>';
        if (l1) l1.textContent = 'Frete: não iniciado';
        if (l2) l2.textContent = 'Status logístico: em análise';
        if (end) end.textContent = 'Endereço de entrega: disponível após criação da remessa.';
        return;
    }

    if (uiState === 'falha' || uiState === 'timeout') {
        var msg = payload.message || 'Falha ao consultar status de entrega.';
        host.innerHTML =
            '<div class="status-item active"><div class="status-dot"></div><div class="status-content">' +
            '<h4>Falha ao carregar</h4>' +
            '<p>' + msg + '</p>' +
            '<small>Tente novamente em instantes</small></div></div>';
        if (l1) l1.textContent = 'Frete: indisponível';
        if (l2) l2.textContent = 'Status logístico: falha';
        if (end) end.textContent = 'Endereço de entrega: indisponível.';
        return;
    }

    if (uiState === 'sem_dados') {
        host.innerHTML =
            '<div class="status-item active"><div class="status-dot"></div><div class="status-content">' +
            '<h4>Sem dados de entrega</h4>' +
            '<p>Não existe remessa registrada para este cartão no backend.</p>' +
            '<small>Aguardando criação de shipment</small></div></div>';
        if (l1) l1.textContent = 'Frete: sem dados';
        if (l2) l2.textContent = 'Status logístico: sem dados';
        if (end) end.textContent = 'Endereço de entrega: sem dados.';
        return;
    }

    var currentMeta = agilbankShipmentStatusMeta(shipment && shipment.status);
    var statusOrder = [
        'AGUARDANDO_COBRANCA',
        'COBRANCA_CONFIRMADA',
        'EM_PRODUCAO',
        'POSTADO',
        'EM_TRANSITO',
        'SAIU_PARA_ENTREGA',
        'ENTREGUE'
    ];
    var currentStatus = String(shipment && shipment.status ? shipment.status : '').toUpperCase();
    var currentIndex = statusOrder.indexOf(currentStatus);
    host.innerHTML = '';

    if (!timeline.length) {
        host.innerHTML =
            '<div class="status-item active"><div class="status-dot"></div><div class="status-content">' +
            '<h4>Timeline vazia</h4>' +
            '<p>A remessa existe, porém ainda não há eventos logísticos para exibir.</p>' +
            '<small>Status atual: ' + currentMeta.title + '</small></div></div>';
    } else {
        timeline.forEach(function (ev) {
            var idx = statusOrder.indexOf(String(ev && ev.shipmentStatus ? ev.shipmentStatus : '').toUpperCase());
            var klass = 'status-item';
            if (idx >= 0 && currentIndex >= 0 && idx < currentIndex) klass += ' completed';
            if ((idx >= 0 && idx === currentIndex) || idx < 0) klass += ' active';
            var label = agilbankShipmentTimelineLabelByEvent(ev);
            var description = ev && ev.description ? String(ev.description) : agilbankShipmentStatusMeta(ev && ev.shipmentStatus).description;
            var whenTxt = agilbankShipmentFormatDate(ev && ev.eventAt);
            host.innerHTML +=
                '<div class="' + klass + '"><div class="status-dot"></div><div class="status-content">' +
                '<h4>' + label + '</h4>' +
                '<p>' + description + '</p>' +
                '<small>' + whenTxt + '</small></div></div>';
        });
    }

    if (timelineError) {
        host.innerHTML +=
            '<div class="status-item active"><div class="status-dot"></div><div class="status-content">' +
            '<h4>Falha parcial</h4>' +
            '<p>' + timelineError + '</p>' +
            '<small>Exibindo dados disponíveis de shipment</small></div></div>';
    }

    var fee = agilbankShipmentFormatMoney(shipment && shipment.shippingFeeAmount);
    var feeStatus = shipment && shipment.shippingFeeStatus ? String(shipment.shippingFeeStatus) : 'indisponível';
    var tracking = shipment && shipment.trackingCode ? String(shipment.trackingCode) : 'indisponível';
    var carrier = shipment && shipment.carrierName ? String(shipment.carrierName) : 'indisponível';
    var eta = shipment && shipment.estimatedDeliveryAt ? agilbankShipmentFormatDate(shipment.estimatedDeliveryAt) : 'Indisponível';
    if (l1) l1.textContent = 'Frete: ' + fee + ' (' + feeStatus + ')';
    if (l2) l2.textContent = 'Status: ' + currentMeta.title + ' | Rastreio: ' + tracking + ' | Transportadora: ' + carrier + ' | Previsão: ' + eta;
    if (end) end.textContent = agilbankShipmentAddressText(shipment && shipment.addressSnapshot);
}

function agilbankMensagemErroVirtual(res, body, fallback) {
    var code = body && body.code ? String(body.code) : '';
    if (res && (res.status === 401 || res.status === 403)) {
        return body.message || 'Sessão inválida. Faça login novamente para acessar cartão virtual.';
    }
    if (code === 'BASE_CARD_NOT_ELIGIBLE') {
        return 'Cartão base ainda não aprovado/ativo para emitir cartão virtual.';
    }
    if (code === 'CARD_NOT_FOUND') {
        return 'Cartão base não encontrado para esta conta.';
    }
    if (code === 'VIRTUAL_CARD_NOT_FOUND') {
        return 'Cartão virtual ainda não emitido.';
    }
    return (body && body.message) || fallback || 'Não foi possível concluir a operação.';
}

function agilbankAplicarEstadoVirtualNaoEmitido(baseCard) {
    var num = document.getElementById('numeroCartaoVirtual');
    if (num) num.textContent = 'Cartão virtual ainda não emitido';
    var val = document.getElementById('validadeCartaoVirtual');
    if (val) val.textContent = '--/--';
    var criar = document.getElementById('cartaoVirtualBtnCriar');
    if (criar) {
        criar.style.display = '';
        criar.disabled = false;
        criar.style.pointerEvents = '';
        criar.title = '';
        criar.textContent = 'Emitir cartão virtual';
    }
    var bloquear = document.getElementById('btnBloquearCartaoVirtual');
    if (bloquear) {
        bloquear.textContent = 'Bloquear';
        bloquear.disabled = true;
        bloquear.title = 'Cartão virtual ainda não emitido';
    }
    window.__agilbankVirtualCardSelecionado = null;
    if (baseCard) {
        agilbankPopularDetalheCartaoNaUi(baseCard, { titulo: 'Cartão virtual', virtual: true });
    }
}

async function agilbankCarregarCartaoVirtualSelecionado(baseCard, quiet) {
    var selected = baseCard || agilbankGetCartaoSelecionado();
    if (!selected || !selected.id) {
        if (!quiet) showErrorModal('Cartão virtual', 'Nenhum cartão selecionado.');
        return null;
    }
    try {
        var result = await agilbankRequestCards('cards/' + selected.id + '/virtual', {
            method: 'GET',
            headers: { 'Content-Type': 'application/json' }
        }, 12000);
        if (result.response.ok) {
            var virtual = result.body && result.body.data ? result.body.data.cartaoVirtual : null;
            if (!virtual) {
                agilbankAplicarEstadoVirtualNaoEmitido(selected);
                return null;
            }
            window.__agilbankVirtualCardSelecionado = virtual;
            var merged = Object.assign({}, selected, {
                status: virtual.status,
                maskedNumber: virtual.maskedNumber || selected.maskedNumber,
                last4: virtual.last4 || selected.last4,
                validade: virtual.validade || selected.validade
            });
            agilbankPopularDetalheCartaoNaUi(merged, { titulo: 'Cartão virtual', virtual: true });
            var criar = document.getElementById('cartaoVirtualBtnCriar');
            if (criar) {
                criar.style.display = 'none';
                criar.disabled = true;
            }
            return virtual;
        }
        if (result.body && result.body.code === 'VIRTUAL_CARD_NOT_FOUND') {
            agilbankAplicarEstadoVirtualNaoEmitido(selected);
            return null;
        }
        if (!quiet) {
            showErrorModal('Cartão virtual', agilbankMensagemErroVirtual(result.response, result.body, 'Falha ao consultar cartão virtual.'));
        }
        return null;
    } catch (error) {
        if (!quiet) showErrorModal('Cartão virtual', (error && error.message) || 'Falha na conexão ao consultar cartão virtual.');
        return null;
    }
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
    setDis(bSt, false);
    setDis(bVer, !ok);
    setDis(bFi, !ok);
    setDis(bVi, !ok);
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

async function agilbankCartaoAcaoStatus() {
    var c = agilbankGetCartaoSelecionado();
    if (!c || !c.id) {
        if (typeof showErrorModal === 'function') {
            showErrorModal('Status de entrega', 'Nenhum cartão selecionado para consultar entrega.');
        }
        return;
    }

    if (typeof ocultarTodosContainers === 'function') {
        ocultarTodosContainers();
    }
    var hostContainer = document.getElementById('statusEntregaContainer');
    if (hostContainer) hostContainer.style.display = 'block';
    if (typeof window.scrollTo === 'function') window.scrollTo(0, 0);

    agilbankRenderStatusEntregaParaCartao(c, { uiState: 'loading' });
    var btnStatus = document.getElementById('cartaoAcaoStatus');
    agilbankSetBtnLoading(btnStatus, true, 'Consultando...');
    try {
        if (!agilbankStatusCartaoAtivo(c)) {
            agilbankRenderStatusEntregaParaCartao(c, { uiState: 'em_analise' });
            return;
        }
        var shipmentResult = await agilbankRequestCards('cards/' + c.id + '/shipment', {
            method: 'GET',
            headers: { 'Content-Type': 'application/json' }
        }, 12000);
        if (!shipmentResult.response.ok) {
            var code = shipmentResult.body && shipmentResult.body.code ? String(shipmentResult.body.code) : '';
            if (shipmentResult.response.status === 401) {
                agilbankRenderStatusEntregaParaCartao(c, { uiState: 'falha', message: 'Sessão expirada. Faça login novamente para consultar a entrega.' });
                return;
            }
            if (shipmentResult.response.status === 403) {
                agilbankRenderStatusEntregaParaCartao(c, { uiState: 'falha', message: 'Permissão negada para consultar esta entrega.' });
                return;
            }
            if (shipmentResult.response.status === 404 && code === 'SHIPMENT_NOT_FOUND') {
                agilbankRenderStatusEntregaParaCartao(c, { uiState: 'sem_dados' });
                return;
            }
            if (shipmentResult.response.status === 422 || code === 'VALIDATION_ERROR') {
                agilbankRenderStatusEntregaParaCartao(c, { uiState: 'falha', message: 'Falha de validação ao consultar a remessa.' });
                return;
            }
            agilbankRenderStatusEntregaParaCartao(c, { uiState: 'falha', message: (shipmentResult.body && shipmentResult.body.message) || 'Erro interno ao consultar status de entrega.' });
            return;
        }

        var shipment = shipmentResult.body && shipmentResult.body.data ? shipmentResult.body.data.shipment : null;
        if (!shipment) {
            agilbankRenderStatusEntregaParaCartao(c, { uiState: 'sem_dados' });
            return;
        }

        var timeline = shipmentResult.body && shipmentResult.body.data && Array.isArray(shipmentResult.body.data.timeline)
            ? shipmentResult.body.data.timeline
            : [];
        var timelineError = '';
        try {
            var timelineResult = await agilbankRequestCards('cards/' + c.id + '/shipment/timeline?page=1&limit=20', {
                method: 'GET',
                headers: { 'Content-Type': 'application/json' }
            }, 12000);
            if (timelineResult.response.ok) {
                var timelineApi = timelineResult.body && timelineResult.body.data && Array.isArray(timelineResult.body.data.timeline)
                    ? timelineResult.body.data.timeline
                    : [];
                timeline = timelineApi;
            } else {
                timelineError = 'Não foi possível carregar a timeline completa. Os dados atuais de shipment foram mantidos.';
            }
        } catch (timelineErr) {
            timelineError = (timelineErr && timelineErr.message) || 'Falha de conexão ao carregar timeline.';
        }

        agilbankRenderStatusEntregaParaCartao(c, {
            uiState: timeline.length ? 'sucesso' : 'vazio',
            shipment: shipment,
            timeline: timeline,
            timelineError: timelineError
        });
    } catch (error) {
        var isTimeout = error && String(error.message || '').toLowerCase().indexOf('tempo de resposta esgotado') >= 0;
        agilbankRenderStatusEntregaParaCartao(c, {
            uiState: isTimeout ? 'timeout' : 'falha',
            message: (error && error.message) || 'Falha de conexão ao consultar entrega.'
        });
    } finally {
        agilbankSetBtnLoading(btnStatus, false);
    }
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
        showErrorModal('Cartão virtual', 'Cartão base ainda não aprovado/ativo para cartão virtual.');
        return;
    }
    agilbankEnsureTitularNomeCache().then(async function () {
        agilbankPopularDetalheCartaoNaUi(c, { titulo: 'Cartão virtual', virtual: true });
        agilbankAbrirContainerCartao('cartaoVirtualContainer');
        await agilbankCarregarCartaoVirtualSelecionado(c, false);
    });
}

window.agilbankCartaoAcaoStatus = agilbankCartaoAcaoStatus;
window.agilbankCartaoAcaoVer = agilbankCartaoAcaoVer;
window.agilbankCartaoAcaoFisico = agilbankCartaoAcaoFisico;
window.agilbankCartaoAcaoVirtual = agilbankCartaoAcaoVirtual;

function agilbankBloquearAcaoSensivelCartao(mensagem) {
    if (typeof showErrorModal === 'function') {
        showErrorModal('Indisponível no momento', mensagem || 'Esta ação está indisponível no momento.');
    }
}

function agilbankCardParseNumero(valor) {
    var txt = String(valor == null ? '' : valor).trim();
    if (!txt) return NaN;
    txt = txt.replace(/[^\d,.-]/g, '');
    if (txt.indexOf(',') >= 0) {
        txt = txt.replace(/\./g, '').replace(',', '.');
    }
    return Number(txt);
}

function agilbankSetBtnLoading(btn, loading, labelLoading) {
    if (!btn) return;
    if (loading) {
        if (!btn.dataset.originalLabel) {
            btn.dataset.originalLabel = btn.textContent;
        }
        btn.disabled = true;
        btn.textContent = labelLoading || 'Processando...';
        return;
    }
    if (btn.dataset.originalLabel) {
        btn.textContent = btn.dataset.originalLabel;
        delete btn.dataset.originalLabel;
    }
    btn.disabled = false;
}

async function agilbankRequestCards(path, options, timeoutMs) {
    if (!window.AgilBank || !window.AgilBank.api || typeof window.AgilBank.api.request !== 'function') {
        throw new Error('Cliente de API indisponível.');
    }
    var controller = new AbortController();
    var timer = setTimeout(function () {
        controller.abort();
    }, timeoutMs || 12000);
    try {
        var reqOpts = Object.assign({}, options || {}, { signal: controller.signal });
        var response = await window.AgilBank.api.request(path, reqOpts);
        var body = await response.json().catch(function () {
            return {};
        });
        return { response: response, body: body };
    } catch (error) {
        if (error && error.name === 'AbortError') {
            throw new Error('Tempo de resposta esgotado. Tente novamente.');
        }
        throw error;
    } finally {
        clearTimeout(timer);
    }
}

async function agilbankExecutarMutacaoCartao(opts) {
    var selected = agilbankGetCartaoSelecionado();
    if (!selected || !selected.id) {
        showErrorModal('Cartão', 'Nenhum cartão selecionado.');
        return false;
    }
    if (!agilbankStatusCartaoAtivo(selected) && opts.requireActive) {
        showErrorModal('Em análise', 'Ação indisponível enquanto o cartão estiver em análise.');
        return false;
    }
    var triggerBtn = opts && opts.button ? opts.button : null;
    try {
        agilbankSetBtnLoading(triggerBtn, true, opts.loadingLabel || 'Processando...');
        var result = await agilbankRequestCards('cards/' + selected.id + opts.suffix, opts.request || {}, 12000);
        if (!result.response.ok) {
            showErrorModal('Erro', result.body.message || 'Não foi possível concluir a ação.');
            return false;
        }
        await agilbankRefreshPainelCartoes();
        showErrorModal('Sucesso', result.body.message || 'Ação concluída com sucesso.');
        return true;
    } catch (error) {
        showErrorModal('Erro', (error && error.message) || 'Falha na conexão com o servidor.');
        return false;
    } finally {
        agilbankSetBtnLoading(triggerBtn, false);
    }
}

async function agilbankToggleBloqueioCartao(button) {
    var c = agilbankGetCartaoSelecionado();
    if (!c) {
        showErrorModal('Cartão', 'Nenhum cartão selecionado.');
        return;
    }
    var st = String(c.status || '').toLowerCase();
    if (st === 'bloqueado') {
        await agilbankExecutarMutacaoCartao({
            suffix: '/unblock',
            loadingLabel: 'Desbloqueando...',
            request: { method: 'POST', headers: { 'Content-Type': 'application/json' } },
            requireActive: false,
            button: button
        });
        return;
    }
    if (!agilbankStatusCartaoAtivo(c)) {
        showErrorModal('Em análise', 'Ação de bloqueio indisponível enquanto o cartão estiver em análise.');
        return;
    }
    await agilbankExecutarMutacaoCartao({
        suffix: '/block',
        loadingLabel: 'Bloqueando...',
        request: { method: 'POST', headers: { 'Content-Type': 'application/json' } },
        requireActive: true,
        button: button
    });
}

async function agilbankToggleBloqueioCartaoVirtual(button) {
    var selected = agilbankGetCartaoSelecionado();
    if (!selected || !selected.id) {
        showErrorModal('Cartão virtual', 'Nenhum cartão base selecionado.');
        return;
    }
    var virtual = window.__agilbankVirtualCardSelecionado;
    if (!virtual) {
        showErrorModal('Cartão virtual', 'Cartão virtual ainda não emitido.');
        return;
    }
    var st = String(virtual.status || '').toLowerCase();
    var suffix = st === 'bloqueado' ? '/virtual/unblock' : '/virtual/block';
    var label = st === 'bloqueado' ? 'Desbloqueando...' : 'Bloqueando...';
    try {
        agilbankSetBtnLoading(button, true, label);
        var result = await agilbankRequestCards('cards/' + selected.id + suffix, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' }
        }, 12000);
        if (!result.response.ok) {
            showErrorModal('Cartão virtual', agilbankMensagemErroVirtual(result.response, result.body, 'Falha ao alterar status do cartão virtual.'));
            return;
        }
        await agilbankCarregarCartaoVirtualSelecionado(selected, true);
        showErrorModal('Sucesso', result.body.message || 'Status do cartão virtual atualizado.');
    } catch (error) {
        showErrorModal('Cartão virtual', (error && error.message) || 'Falha de conexão ao alterar status do cartão virtual.');
    } finally {
        agilbankSetBtnLoading(button, false);
    }
}

async function agilbankAlterarLimiteSelecionado(button) {
    var c = agilbankGetCartaoSelecionado();
    if (!c || !c.id) {
        showErrorModal('Cartão', 'Selecione um cartão para alterar limite.');
        return;
    }
    if (!agilbankStatusCartaoAtivo(c)) {
        showErrorModal('Em análise', 'Alteração de limite indisponível enquanto o cartão estiver em análise.');
        return;
    }
    var valorTxt = window.prompt('Digite o novo limite do cartão (ex.: 2500,00):');
    if (valorTxt == null) return;
    var novoLimite = agilbankCardParseNumero(valorTxt);
    if (!isFinite(novoLimite) || novoLimite < 100 || novoLimite > 50000) {
        showErrorModal('Validação', 'Informe um limite válido entre R$ 100,00 e R$ 50.000,00.');
        return;
    }
    await agilbankExecutarMutacaoCartao({
        suffix: '/limit',
        loadingLabel: 'Atualizando...',
        request: {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ novoLimite: Math.round(novoLimite * 100) / 100 })
        },
        requireActive: true,
        button: button
    });
}

function agilbankAplicarFatia1CartaoUi() {
    [
        '#cartaoVirtualBtnCriar'
    ].forEach(function (selector) {
        document.querySelectorAll(selector).forEach(function (el) {
            el.style.display = 'none';
        });
    });

    [
        "button[onclick*='copiarDadosCartao']",
        "button[onclick*='verTodasMovimentacoes']",
        "button[onclick*='criarCartaoVirtual']"
    ].forEach(function (selector) {
        document.querySelectorAll(selector).forEach(function (el) {
            el.disabled = true;
            el.style.pointerEvents = 'none';
            el.title = 'Indisponível no momento';
        });
    });
}

window.bloquearCartao = function () {
    var btn = document.activeElement && document.activeElement.tagName === 'BUTTON' ? document.activeElement : null;
    agilbankToggleBloqueioCartao(btn);
};
window.copiarDadosCartao = function () {
    agilbankBloquearAcaoSensivelCartao('Ação de cópia indisponível no momento.');
};
window.verTodasMovimentacoes = function () {
    agilbankBloquearAcaoSensivelCartao('Movimentações completas indisponíveis no momento.');
};
window.criarCartaoVirtual = function () {
    var btn = document.getElementById('cartaoVirtualBtnCriar');
    var selected = agilbankGetCartaoSelecionado();
    if (!selected || !selected.id) {
        showErrorModal('Cartão virtual', 'Nenhum cartão base selecionado.');
        return;
    }
    if (!agilbankStatusCartaoAtivo(selected)) {
        showErrorModal('Cartão virtual', 'Cartão base ainda não aprovado/ativo para emissão virtual.');
        return;
    }
    agilbankSetBtnLoading(btn, true, 'Emitindo...');
    agilbankRequestCards('cards/' + selected.id + '/virtual', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' }
    }, 12000).then(async function (result) {
        if (!result.response.ok) {
            showErrorModal('Cartão virtual', agilbankMensagemErroVirtual(result.response, result.body, 'Falha ao emitir cartão virtual.'));
            return;
        }
        await agilbankRefreshPainelCartoes();
        await agilbankCarregarCartaoVirtualSelecionado(selected, true);
        showErrorModal('Sucesso', result.body.message || 'Cartão virtual emitido com sucesso.');
    }).catch(function (error) {
        showErrorModal('Cartão virtual', (error && error.message) || 'Falha na conexão ao emitir cartão virtual.');
    }).finally(function () {
        agilbankSetBtnLoading(btn, false);
    });
};

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
        var preferencial = window.__agilbankCartoesLista.find(function (cartao) {
            return agilbankStatusIsAtivoOuAprovado(cartao && cartao.status);
        }) || window.__agilbankCartoesLista[0];
        window.__agilbankCartaoSelecionadoId = preferencial.id;
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
    agilbankWizardPinClear();
    limparDadosCartao();
    ['progressContainer', 'vencimentoContainer', 'aprovacaoContainer', 'cartaoInfo', 'statusContainer', 'cartaoSolicitacaoPendenteContainer'].forEach(function (id) {
        var el = document.getElementById(id);
        if (el) el.style.display = 'none';
    });
    agilbankWizardGoToStep(1);
    agilbankWizardBindNav();
    agilbankWizardHydratePerfil();
}

function agilbankStatusNorm(status) {
    return String(status || '').trim().toLowerCase();
}

function agilbankStatusIsAtivoOuAprovado(status) {
    var s = agilbankStatusNorm(status);
    return s === 'ativo' || s === 'aprovado';
}

function agilbankStatusIsPendente(status) {
    var s = agilbankStatusNorm(status);
    if (!s) return false;
    if (s === 'pending') return true;
    if (s === 'pendente' || s.indexOf('pendente_') === 0) return true;
    if (s === 'em_analise' || s === 'em analise' || s === 'analise') return true;
    return false;
}

function agilbankStatusIsAtivo(status) {
    return agilbankStatusNorm(status) === 'ativo';
}

function agilbankStatusIsRejeitado(status) {
    var s = agilbankStatusNorm(status);
    return s === 'rejeitado' || s === 'rejected' || s === 'negado' || s === 'recusado';
}

function agilbankSortCartoesPorDataDesc(list) {
    if (!Array.isArray(list)) return [];
    return list.slice().sort(function (a, b) {
        var da = new Date((a && (a.dataSolicitacao || a.createdAt)) || 0).getTime();
        var db = new Date((b && (b.dataSolicitacao || b.createdAt)) || 0).getTime();
        return db - da;
    });
}

function agilbankEscapeHtmlPainel(str) {
    return String(str == null ? '' : str)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;');
}

function agilbankFormatarTipoCartaoUi(c) {
    if (!c) return 'Não informado';
    return (c.tipo || 'credito') === 'debito' ? 'Débito' : 'Crédito';
}

function agilbankDataSolicitacaoCartao(c) {
    if (!c) return 'Não informado';
    var raw = c.dataSolicitacao || c.createdAt;
    if (!raw) return 'Não informado';
    try {
        var d = new Date(raw);
        if (isNaN(d.getTime())) return String(raw);
        return d.toLocaleString('pt-BR');
    } catch (e) {
        return String(raw);
    }
}

function agilbankObservacaoStatusCartao(status) {
    var s = String(status || '');
    if (s.indexOf('renda_menor') >= 0) {
        return 'Sua solicitação segue em análise com base na renda informada.';
    }
    if (s.indexOf('sem_renda') >= 0) {
        return 'Complete os dados de renda quando solicitado pelo banco.';
    }
    return '';
}

function agilbankRenderPainelCartaoPendente(msgEl, c) {
    if (!msgEl || !c) return;
    msgEl.style.display = 'block';
    msgEl.className = 'cartao-painel-msg cartao-painel-msg--rich';
    var lim = c.limite != null ? Number(c.limite) : NaN;
    var limTxt = isFinite(lim)
        ? 'R$ ' + lim.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
        : 'Não informado';
    var obs = agilbankObservacaoStatusCartao(c.status);
    msgEl.innerHTML =
        '<h3 class="cartao-painel-titulo">' +
        agilbankEscapeHtmlPainel('Seu cartão está em análise') +
        '</h3>' +
        '<p class="cartao-painel-texto">' +
        agilbankEscapeHtmlPainel(
            'Recebemos sua solicitação de cartão. Você poderá acompanhar a atualização por aqui.'
        ) +
        '</p>' +
        '<ul class="cartao-painel-dl">' +
        '<li><span>Data da solicitação</span><strong>' +
        agilbankEscapeHtmlPainel(agilbankDataSolicitacaoCartao(c)) +
        '</strong></li>' +
        '<li><span>Tipo</span><strong>' +
        agilbankEscapeHtmlPainel(agilbankFormatarTipoCartaoUi(c)) +
        '</strong></li>' +
        '<li><span>Status</span><strong>' +
        agilbankEscapeHtmlPainel('Em análise') +
        '</strong></li>' +
        '<li><span>Limite solicitado</span><strong>' +
        agilbankEscapeHtmlPainel(limTxt) +
        '</strong></li>' +
        (obs
            ? '<li><span>Observação</span><strong>' + agilbankEscapeHtmlPainel(obs) + '</strong></li>'
            : '') +
        '</ul>' +
        '<button type="button" class="limite-button cartao-painel-btn-atualizar" id="cartaoPainelBtnAtualizar">Atualizar status</button>';
    var btn = document.getElementById('cartaoPainelBtnAtualizar');
    if (btn) {
        btn.onclick = function () {
            if (typeof window.agilbankRefreshPainelCartoes === 'function') {
                window.agilbankRefreshPainelCartoes();
            }
        };
    }
}

function agilbankRenderPainelCartaoAprovado(msgEl, c) {
    if (!msgEl || !c) return;
    msgEl.style.display = 'block';
    msgEl.className = 'cartao-painel-msg cartao-painel-msg--rich';
    var cid = String(c.id || '').replace(/[^a-zA-Z0-9_-]/g, '');
    msgEl.innerHTML =
        '<h3 class="cartao-painel-titulo">' +
        agilbankEscapeHtmlPainel('Cartão aprovado') +
        '</h3>' +
        '<p class="cartao-painel-texto">' +
        agilbankEscapeHtmlPainel(
            'Seu cartão foi aprovado. Siga as instruções para ativar ou acessar os dados do cartão.'
        ) +
        '</p>' +
        '<div class="cartao-painel-acoes-dupla">' +
        '<button type="button" class="limite-button" data-cartao-painel-ver="' +
        agilbankEscapeHtmlPainel(cid) +
        '">Ver cartão</button>' +
        '<button type="button" class="limite-button limite-button--sec" data-cartao-painel-ativar="' +
        agilbankEscapeHtmlPainel(cid) +
        '">Ativar cartão</button>' +
        '</div>';
    msgEl.querySelectorAll('[data-cartao-painel-ver]').forEach(function (b) {
        b.onclick = function () {
            window.__agilbankCartaoSelecionadoId = c.id;
            if (typeof agilbankCartaoAcaoVer === 'function') {
                agilbankCartaoAcaoVer();
            }
        };
    });
    msgEl.querySelectorAll('[data-cartao-painel-ativar]').forEach(function (b) {
        b.onclick = function () {
            window.__agilbankCartaoSelecionadoId = c.id;
            if (typeof agilbankCartaoAcaoFisico === 'function') {
                agilbankCartaoAcaoFisico();
            } else if (typeof agilbankCartaoAcaoVer === 'function') {
                agilbankCartaoAcaoVer();
            }
        };
    });
}

function agilbankRenderPainelCartaoRejeitado(msgEl, c) {
    if (!msgEl) return;
    msgEl.style.display = 'block';
    msgEl.className = 'cartao-painel-msg cartao-painel-msg--rich';
    var detalheApi =
        c && c.analysisMessage && String(c.analysisMessage).trim()
            ? String(c.analysisMessage).trim()
            : 'No momento, sua solicitação de cartão não foi aprovada. Continue usando sua conta e tente novamente em outro momento.';
    msgEl.innerHTML =
        '<h3 class="cartao-painel-titulo">' +
        agilbankEscapeHtmlPainel('Solicitação não aprovada') +
        '</h3>' +
        '<p class="cartao-painel-texto">' +
        agilbankEscapeHtmlPainel(detalheApi) +
        '</p>' +
        '<button type="button" class="limite-button" id="cartaoPainelBtnSolicitarNovamente">Solicitar novamente</button>';
    var btn = document.getElementById('cartaoPainelBtnSolicitarNovamente');
    if (btn) {
        btn.onclick = function () {
            var flow = document.getElementById('cartaoSolicitacaoFlow');
            var listaSec = document.getElementById('cartaoListaRealSection');
            agilbankSetSolicitacaoWizardMode(true);
            if (flow) flow.style.display = 'block';
            if (listaSec) listaSec.style.display = 'none';
            if (typeof resetCartaoSolicitacaoFlowUi === 'function') {
                resetCartaoSolicitacaoFlowUi();
            }
            if (msgEl) {
                msgEl.style.display = 'none';
                msgEl.innerHTML = '';
            }
        };
    }
}

function agilbankIsCardAlreadyPendingConflict(result) {
    if (!result || typeof result !== 'object') return false;
    var code = result.code || result.error;
    if (code === 'CARD_ALREADY_EXISTS') return true;
    if (code === 'CARD_PENDING_ALREADY_EXISTS') return true;
    if (code === 'CARD_ACTIVE_ALREADY_EXISTS') return true;
    var msg = String(result.message || result.error || '').toLowerCase();
    if (code === 'CARD_ALREADY_PENDING') return true;
    if (msg.indexOf('já possui') >= 0 && msg.indexOf('pendente') >= 0) return true;
    if (msg.indexOf('ja possui') >= 0 && msg.indexOf('pendente') >= 0) return true;
    if (msg.indexOf('cartão') >= 0 && msg.indexOf('analise') >= 0) return true;
    if (msg.indexOf('cartao') >= 0 && msg.indexOf('analise') >= 0) return true;
    if (msg.indexOf('ativo ou pendente') >= 0) return true;
    return false;
}

function agilbankTemSolicitacaoCartaoPendente() {
    var list = agilbankListaCartoesAtual();
    return list.some(function (x) {
        return agilbankStatusIsPendente(x && x.status);
    });
}

/**
 * Estado de erro ao carregar GET /api/cards — não abre wizard nem CTA de solicitação.
 */
function renderCartoesErroCarregamento() {
    var flow = document.getElementById('cartaoSolicitacaoFlow');
    var listaSec = document.getElementById('cartaoListaRealSection');
    var msg = document.getElementById('cartaoPainelMensagem');
    window.__agilbankAbrirSolicitacaoCartaoDepoisRefresh = false;

    agilbankSetSolicitacaoWizardMode(false);
    if (flow) flow.style.display = 'none';
    if (listaSec) listaSec.style.display = 'block';

    agilbankSetDashboardCardOffersVisible(false);

    var grid = document.getElementById('cartoesReaisGrid');
    if (grid) {
        grid.innerHTML =
            '<p class="cartao-painel-erro-grid-hint">O painel de cartões não pôde ser atualizado.</p>';
    }
    var painel = document.getElementById('cartaoPainelAcoes');
    if (painel) painel.style.display = 'none';

    if (msg) {
        msg.style.display = 'block';
        msg.className = 'cartao-painel-msg cartao-painel-erro-carregamento';
        msg.innerHTML =
            '<h3 class="cartao-painel-titulo">' +
            agilbankEscapeHtmlPainel('Não foi possível carregar seus cartões agora.') +
            '</h3>' +
            '<p class="cartao-painel-texto">' +
            agilbankEscapeHtmlPainel('Tente novamente em instantes.') +
            '</p>' +
            '<button type="button" class="limite-button cartao-painel-btn-tentar" id="cartaoPainelBtnTentarNovamente">Tentar novamente</button>';
        var btn = document.getElementById('cartaoPainelBtnTentarNovamente');
        if (btn) {
            btn.onclick = function () {
                if (typeof window.agilbankRefreshPainelCartoes === 'function') {
                    window.agilbankRefreshPainelCartoes();
                }
            };
        }
    }
}

function agilbankRenderCtaSolicitacaoCartao(msgEl, texto) {
    if (!msgEl) return;
    msgEl.style.display = 'block';
    msgEl.innerHTML =
        '<span>' + (texto || 'Você ainda não possui cartão aprovado/ativo.') + '</span>' +
        '<button type="button" class="limite-button" style="margin-left:10px;" id="cartaoPainelCtaSolicitar">Solicitar cartão</button>';
    var btn = document.getElementById('cartaoPainelCtaSolicitar');
    if (btn) {
        btn.onclick = function () {
            window.__agilbankAbrirSolicitacaoCartaoDepoisRefresh = true;
            if (typeof window.agilbankRefreshPainelCartoes === 'function') {
                window.agilbankRefreshPainelCartoes();
            }
        };
    }
}

/**
 * @param {Array} cartoes — resultado de GET /api/cards
 */
function agilbankAplicarEstadoPainelCartao(cartoes) {
    var list = Array.isArray(cartoes) ? cartoes : [];
    var flow = document.getElementById('cartaoSolicitacaoFlow');
    var listaSec = document.getElementById('cartaoListaRealSection');
    var msg = document.getElementById('cartaoPainelMensagem');
    var abrirSolicitacao = window.__agilbankAbrirSolicitacaoCartaoDepoisRefresh === true;
    window.__agilbankAbrirSolicitacaoCartaoDepoisRefresh = false;

    var pendentes = list.filter(function (c) {
        return agilbankStatusIsPendente(c && c.status);
    });
    var temPendente = pendentes.length > 0;
    if (temPendente) {
        abrirSolicitacao = false;
    }

    var ativos = list.filter(function (c) {
        return agilbankStatusIsAtivo(c && c.status);
    });
    var aprovadosSomente = list.filter(function (c) {
        return agilbankStatusNorm(c && c.status) === 'aprovado';
    });
    var rejeitados = list.filter(function (c) {
        return agilbankStatusIsRejeitado(c && c.status);
    });
    var temAtivo = ativos.length > 0;

    // Ocultar banner/mini-cartão do dashboard quando já existe solicitação ou cartão não rejeitado
    // (pendente não pode reabrir wizard pela propaganda; só rejeitado volta a ver oferta).
    var temPipelineNaoRejeitado = list.some(function (c) {
        return !agilbankStatusIsRejeitado(c && c.status);
    });
    agilbankSetDashboardCardOffersVisible(!temPipelineNaoRejeitado);

    if (list.length === 0) {
        agilbankSetSolicitacaoWizardMode(abrirSolicitacao);
        if (flow) flow.style.display = abrirSolicitacao ? 'block' : 'none';
        if (listaSec) listaSec.style.display = abrirSolicitacao ? 'none' : 'block';
        if (abrirSolicitacao) {
            resetCartaoSolicitacaoFlowUi();
        }
        renderCartoesReaisGrid([]);
        if (msg) {
            if (abrirSolicitacao) {
                msg.style.display = 'none';
                msg.textContent = '';
                msg.innerHTML = '';
            } else {
                agilbankRenderCtaSolicitacaoCartao(msg, 'Você ainda não possui cartão.');
            }
        }
        return;
    }

    agilbankSetSolicitacaoWizardMode(false);
    if (flow) flow.style.display = 'none';
    if (listaSec) listaSec.style.display = 'block';
    renderCartoesReaisGrid(list);
    if (msg) {
        if (temPendente) {
            var p0 = agilbankSortCartoesPorDataDesc(pendentes)[0];
            agilbankRenderPainelCartaoPendente(msg, p0);
        } else if (temAtivo) {
            msg.style.display = 'none';
            msg.textContent = '';
            msg.innerHTML = '';
        } else if (aprovadosSomente.length) {
            var a0 = agilbankSortCartoesPorDataDesc(aprovadosSomente)[0];
            agilbankRenderPainelCartaoAprovado(msg, a0);
        } else if (rejeitados.length) {
            var r0 = agilbankSortCartoesPorDataDesc(rejeitados)[0];
            agilbankRenderPainelCartaoRejeitado(msg, r0);
        } else {
            msg.style.display = 'block';
            msg.className = 'cartao-painel-msg';
            msg.innerHTML =
                '<span>' +
                agilbankEscapeHtmlPainel('Acompanhe o status do seu cartão na lista abaixo.') +
                '</span>';
        }
    }
}

/**
 * Atualiza painel de cartões (GET) + ofertas no dashboard. Expõe para index.html.
 */
async function agilbankRefreshPainelCartoes() {
    var result = await fetchCartoesFromApi();
    if (!result.ok) {
        renderCartoesErroCarregamento();
        return result;
    }
    agilbankAplicarEstadoPainelCartao(result.cartoes);
    return result;
}

window.agilbankRefreshPainelCartoes = agilbankRefreshPainelCartoes;
window.agilbankAplicarEstadoPainelCartao = agilbankAplicarEstadoPainelCartao;
window.agilbankSetDashboardCardOffersVisible = agilbankSetDashboardCardOffersVisible;
window.agilbankSetSolicitacaoWizardMode = agilbankSetSolicitacaoWizardMode;
window.agilbankFecharSolicitacaoCartao = agilbankFecharSolicitacaoCartao;
window.agilbankFetchCartoes = fetchCartoesFromApi;
window.agilbankTemSolicitacaoCartaoPendente = agilbankTemSolicitacaoCartaoPendente;

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
    // Espelha regra de limite na aprovação (backend): renda × 1,8 em R$. A aprovação efetiva é só na API.
    const raw = Number(renda);
    if (!Number.isFinite(raw) || raw <= 0) return 1000;
    const limiteBase = Math.round(raw * 1.8 * 100) / 100;
    return Math.min(Math.max(limiteBase, 100), 500000);
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
    if (wizRoot) wizRoot.style.display = 'block';
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

            // Resultado no passo 7 com base no GET. O painel so e atualizado quando o usuario sair do wizard.
            setTimeout(async function () {
                var pc = document.getElementById('progressContainer');
                var vc = document.getElementById('vencimentoContainer');
                if (pc) pc.style.display = 'none';
                if (vc) vc.style.display = 'none';

                var wr = document.getElementById('cartaoWizardRoot');
                if (wr) wr.style.display = 'block';

                var fetchRes = await fetchCartoesFromApi();
                var list = fetchRes.ok ? fetchRes.cartoes : [];
                var pp =
                    result && result.data && result.data.proximosPassos
                        ? result.data.proximosPassos
                        : null;
                agilbankWizardAplicarResultadoPosPost(list, pp);
                agilbankWizardGoToStep(7);
            }, 600);

        } else {
            console.error('❌ Erro ao criar cartão:', result);
            if (agilbankIsCardAlreadyPendingConflict(result)) {
                var pcOk = document.getElementById('progressContainer');
                if (pcOk) pcOk.style.display = 'none';
                agilbankSetSolicitacaoWizardMode(false);
                var flowC = document.getElementById('cartaoSolicitacaoFlow');
                if (flowC) flowC.style.display = 'none';
                var listaC = document.getElementById('cartaoListaRealSection');
                if (listaC) listaC.style.display = 'block';
                var wrC = document.getElementById('cartaoWizardRoot');
                if (wrC) wrC.style.display = 'none';
                var navC = document.getElementById('cartaoWizardNav');
                if (navC) navC.style.display = 'none';
                await agilbankRefreshPainelCartoes();
                return;
            }
            var precisaVerificar = result && result.code === 'ACCOUNT_NOT_VERIFIED';
            showErrorModal(
                'Erro na Solicitação',
                result.message || result.error || 'Erro ao processar solicitação do cartão',
                precisaVerificar ? { resendVerification: true } : undefined
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
 * Reenvia e-mail de verificação (POST /api/auth/resend-verification-email). Usuário deve estar logado.
 * @returns {Promise<{ ok: boolean, status: number, data: object }>}
 */
function agilbankTryResendVerificationEmail() {
    if (!window.AgilBank || !window.AgilBank.api || typeof window.AgilBank.api.request !== 'function') {
        return Promise.resolve({
            ok: false,
            status: 0,
            data: { message: 'Cliente de API indisponível. Recarregue a página.' }
        });
    }
    return window.AgilBank.api
        .request('auth/resend-verification-email', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: '{}'
        })
        .then(function (response) {
            return response
                .json()
                .then(function (data) {
                    var payload = data && typeof data === 'object' ? data : {};
                    return { ok: response.ok, status: response.status, data: payload };
                })
                .catch(function () {
                    return {
                        ok: false,
                        status: response.status,
                        data: {
                            message:
                                'Resposta inválida do servidor (não é JSON). Verifique se a URL da API (AGILBANK_API_BASE) aponta para o backend correto.',
                            code: 'INVALID_RESPONSE'
                        }
                    };
                });
        })
        .catch(function () {
            return { ok: false, status: 0, data: { message: 'Erro de conexão. Tente novamente.', code: 'NETWORK_ERROR' } };
        });
}

/**
 * Mensagem honesta para o usuário após POST /api/auth/resend-verification-email (inclui 503 e códigos do contrato).
 * @param {{ ok: boolean, status: number, data: object }} r
 * @returns {string}
 */
function agilbankMessageForResendVerificationResult(r) {
    if (!r || typeof r !== 'object') {
        return 'Não foi possível concluir o reenvio. Tente novamente.';
    }
    if (r.ok && r.data && r.data.success) {
        return (
            (r.data.message || 'Se o servidor conseguiu enviar, confira sua caixa de entrada e o spam.') +
            ' Após verificar, você pode atualizar a página ou entrar novamente.'
        );
    }
    var code = r.data && r.data.code;
    var msg = (r.data && (r.data.message || r.data.error)) || '';
    if (r.status === 503) {
        if (code === 'EMAIL_PROVIDER_NOT_CONFIGURED') {
            return (
                'O envio automático de e-mails não está disponível no servidor no momento. ' +
                'Tente mais tarde ou entre em contato com o suporte. (EMAIL_PROVIDER_NOT_CONFIGURED)'
            );
        }
        if (code === 'EMAIL_SEND_FAILED') {
            return (
                (msg || 'Não foi possível enviar o e-mail de verificação.') +
                ' Tente novamente em alguns minutos. (EMAIL_SEND_FAILED)'
            );
        }
        return (msg || 'Serviço de e-mail temporariamente indisponível.') + ' (HTTP 503)';
    }
    if (code === 'ALREADY_VERIFIED') {
        return msg || 'Esta conta já está verificada. Atualize a página ou faça login novamente.';
    }
    if (code === 'RESEND_RATE_LIMIT') {
        return msg || 'Muitas tentativas de reenvio. Aguarde e tente novamente.';
    }
    if (msg) {
        return code ? msg + ' (' + code + ')' : msg;
    }
    return 'Não foi possível reenviar o e-mail de verificação.' + (r.status ? ' (HTTP ' + r.status + ')' : '');
}

window.agilbankMessageForResendVerificationResult = agilbankMessageForResendVerificationResult;

/**
 * Mostra modal de erro personalizado
 * Overlay acima do wizard de cartao (z-index 999998) para nao deixar o formulario visivel "por tras".
 * @param {string} title
 * @param {string} message
 * @param {{ resendVerification?: boolean }} [opts] — se resendVerification, oferece reenvio do e-mail de verificação
 */
function showErrorModal(title, message, opts) {
    var opt = opts && typeof opts === 'object' ? opts : null;
    var comReenvio = Boolean(opt && opt.resendVerification);

    var wizHost = document.getElementById('cartaoGerenciamentoContainer');
    var suppressWizardChrome =
        wizHost && wizHost.classList.contains('cartao-gerenciamento--solicitacao-ativa');
    if (suppressWizardChrome) {
        document.body.classList.add('agilbank-error-modal-wizard');
    }

    const modal = document.createElement('div');
    modal.style.cssText = [
        'position:fixed',
        'top:50%',
        'left:50%',
        'transform:translate(-50%,-50%)',
        'background:white',
        'padding:20px',
        'border-radius:8px',
        'box-shadow:0 8px 32px rgba(0,0,0,0.22)',
        'z-index:1000002',
        'max-width:400px',
        'width:90%',
        'text-align:center'
    ].join(';');

    var btnBase =
        'padding:8px 16px;border-radius:4px;cursor:pointer;font-size:14px;border:none;';
    var botoes = comReenvio
        ? (
            '<button type="button" id="agilErrResend" style="' + btnBase + 'background:#0d6efd;color:#fff;margin-right:8px;">Reenviar e-mail de verificação</button>' +
            '<button type="button" id="agilErrOk" style="' + btnBase + 'background:#6c757d;color:#fff;">OK</button>'
        )
        : (
            '<button type="button" id="agilErrOk" style="' + btnBase + 'background:#007bff;color:#fff;margin-top:15px;">OK</button>'
        );

    modal.innerHTML =
        '<h3 style="color: #ff4444; margin-bottom: 15px;">' + title + '</h3>' +
        '<p id="agilErrMsg" style="margin:0 0 8px;line-height:1.45;">' + message + '</p>' +
        '<div style="display:flex;flex-wrap:wrap;gap:10px;justify-content:center;align-items:center;margin-top:15px;">' +
        botoes +
        '</div>';

    const overlay = document.createElement('div');
    overlay.style.cssText = [
        'position:fixed',
        'top:0',
        'left:0',
        'width:100%',
        'height:100%',
        'background:rgba(0,0,0,0.78)',
        'z-index:1000000'
    ].join(';');

    function fechar() {
        if (suppressWizardChrome) {
            document.body.classList.remove('agilbank-error-modal-wizard');
        }
        if (overlay.parentNode === document.body) {
            document.body.removeChild(overlay);
        }
        if (modal.parentNode === document.body) {
            document.body.removeChild(modal);
        }
    }

    var btnOk = modal.querySelector('#agilErrOk');
    if (btnOk) btnOk.onclick = fechar;

    var btnResend = modal.querySelector('#agilErrResend');
    if (btnResend) {
        btnResend.onclick = function () {
            btnResend.disabled = true;
            var textoOriginal = btnResend.textContent;
            btnResend.textContent = 'Enviando...';
            agilbankTryResendVerificationEmail().then(function (r) {
                btnResend.disabled = false;
                btnResend.textContent = textoOriginal;
                var p = modal.querySelector('#agilErrMsg');
                if (!p) return;
                var texto = agilbankMessageForResendVerificationResult(r);
                p.textContent = texto;
                if (r.ok && r.data && r.data.success) {
                    btnResend.style.display = 'none';
                }
            });
        };
    }

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
        // Buscar dados do cartão pela fonte real (API/lista em memória)
        var cartaoData = agilbankGetCartaoSelecionado();
        if (!cartaoData) {
            var fetchLista = await fetchCartoesFromApi();
            if (fetchLista.ok && Array.isArray(fetchLista.cartoes) && fetchLista.cartoes.length) {
                cartaoData = fetchLista.cartoes[0];
            }
        }
        if (!cartaoData) {
            console.error('❌ Dados do cartão não encontrados');
            showErrorModal('Erro', 'Dados do cartão não encontrados. Tente novamente.');
            return;
        }
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
            var precisaVerificarLista = errBody.code === 'ACCOUNT_NOT_VERIFIED';
            showErrorModal(
                'Acesso ao cartão',
                errBody.message || 'Não foi possível verificar seus cartões. Faça login ou verifique seu e-mail.',
                precisaVerificarLista ? { resendVerification: true } : undefined
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
        agilbankAplicarFatia1CartaoUi();
        document.querySelectorAll("button[onclick*='showOpcoesLimiteContainer']").forEach(function (btn) {
            btn.onclick = function (e) {
                if (e) e.preventDefault();
                agilbankAlterarLimiteSelecionado(btn);
                return false;
            };
            btn.title = 'Solicitar alteração de limite';
        });
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
