// ==========================================
// Funções de Armazenamento Local (localStorage)
// ==========================================

/**
 * Coleta os dados do formulário do cartão e salva no localStorage
 * @returns {Object} Objeto com os dados coletados
 */
function coletarDadosCartao() {
    // Verifica campos obrigatórios
    const camposObrigatorios = {
        'Nome da empresa': document.querySelector('input[placeholder="Nome da empresa"]').value,
        'Nome da empresa atual': document.querySelector('input[placeholder="Nome da empresa atual"]').value,
        'Renda mensal': document.getElementById('rendaInput').value,
        'Tempo no emprego': document.querySelector('.form-group select').value,
        'Endereço': document.querySelector('input[placeholder="Rua, número, complemento"]').value,
        'Bairro': document.querySelector('input[placeholder="Bairro"]').value,
        'Cidade': document.querySelector('input[placeholder="Cidade"]').value,
        'Estado': document.querySelector('input[placeholder="Estado"]').value,
        'CEP': document.querySelector('input[placeholder="00000-000"]').value,
        'Senha do cartão': document.querySelector('input[type="password"]').value
    };

    // Formata o valor da renda mensal
    const rendaNumero = parseFloat(camposObrigatorios['Renda mensal'].replace(/\D/g, ''));
    camposObrigatorios['Renda mensal'] = rendaNumero ? 
        `R$ ${rendaNumero.toLocaleString('pt-BR', {minimumFractionDigits: 2, maximumFractionDigits: 2})}` : 
        '';
    
    // Verifica se há campos vazios
    const camposVazios = Object.entries(camposObrigatorios)
        .filter(([_, valor]) => !valor.trim())
        .map(([campo]) => campo);

    if (camposVazios.length > 0) {
        // Cria o modal de aviso
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
        `;

        const mensagem = document.createElement('div');
        mensagem.innerHTML = `
            <h3 style="color: #ff4444; margin-bottom: 15px;">Campos Obrigatórios</h3>
            <p>Por favor, preencha os seguintes campos:</p>
            <ul style="margin: 10px 0; padding-left: 20px;">
                ${camposVazios.map(campo => `<li style="margin: 5px 0;">${campo}</li>`).join('')}
            </ul>
        `;

        const btnFechar = document.createElement('button');
        btnFechar.textContent = 'Fechar';
        btnFechar.style.cssText = `
            background: #007bff;
            color: white;
            border: none;
            padding: 8px 16px;
            border-radius: 4px;
            cursor: pointer;
            float: right;
            margin-top: 10px;
        `;
        
        btnFechar.onclick = () => {
            document.body.removeChild(overlay);
            document.body.removeChild(modal);
        };

        // Overlay escuro
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

        modal.appendChild(mensagem);
        modal.appendChild(btnFechar);
        document.body.appendChild(overlay);
        document.body.appendChild(modal);
        return null;
    }

    const dadosCartao = {
        ultimoEmprego: camposObrigatorios['Nome da empresa'],
        empregoAtual: camposObrigatorios['Nome da empresa atual'],
        rendaMensal: camposObrigatorios['Renda mensal'],
        tempoEmprego: camposObrigatorios['Tempo no emprego'],
        endereco: {
            rua: camposObrigatorios['Endereço'],
            bairro: camposObrigatorios['Bairro'],
            cidade: camposObrigatorios['Cidade'],
            estado: camposObrigatorios['Estado'],
            cep: camposObrigatorios['CEP']
        },
        senhaCartao: camposObrigatorios['Senha do cartão'],
        termosAceitos: document.getElementById('termosCheck').checked
    };

    localStorage.setItem('dadosCartao', JSON.stringify(dadosCartao));
    return dadosCartao;
}

/**
 * Recupera os dados do cartão salvos no localStorage
 * @returns {Object|null} Dados do cartão ou null se não existirem
 */
function recuperarDadosCartao() {
    const dadosArmazenados = localStorage.getItem('dadosCartao');
    return dadosArmazenados ? JSON.parse(dadosArmazenados) : null;
}

/**
 * Remove os dados do cartão do localStorage
 */
function limparDadosCartao() {
    localStorage.removeItem('dadosCartao');
}

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

    // Esconde o formulário e mostra progresso
    document.querySelector('.formulario-cartao').style.display = 'none';
    document.getElementById('progressContainer').style.display = 'block';
    
    // Inicia a barra de progresso
    iniciarBarraProgresso();

    try {
        const rendaInput = document.getElementById('rendaInput').value;
        const renda = parseFloat(rendaInput.replace(/\D/g, ''));
        var limitePedido = clampLimiteCartao(calcularLimite(renda));
        var payloadApi = { tipo: 'credito', limite: limitePedido };

        console.log('🔄 Enviando solicitação de cartão para API...', payloadApi);

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

        if (response.ok) {
            var cartaoApi = extrairCartaoDaResposta(result);
            var normalized = normalizarCartaoParaLegado(cartaoApi, limitePedido);
            console.log('✅ Cartão criado com sucesso:', normalized);

            localStorage.setItem('cartao_solicitado', JSON.stringify(normalized));

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

            setTimeout(() => {
                document.getElementById('progressContainer').style.display = 'none';
                document.getElementById('vencimentoContainer').style.display = 'block';
            }, 2000);

        } else {
            console.error('❌ Erro ao criar cartão:', result);
            showErrorModal(
                'Erro na Solicitação',
                result.message || result.error || 'Erro ao processar solicitação do cartão'
            );

            document.getElementById('progressContainer').style.display = 'none';
            document.querySelector('.formulario-cartao').style.display = 'block';
        }

    } catch (error) {
        console.error('❌ Erro na requisição:', error);
        showErrorModal('Erro de Conexão', 'Erro ao conectar com o servidor. Verifique sua internet e tente novamente.');
        
        document.getElementById('progressContainer').style.display = 'none';
        document.querySelector('.formulario-cartao').style.display = 'block';
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
async function selecionarVencimento(dia) {
    // Remove seleção anterior e marca a nova opção
    document.querySelectorAll('.vencimento-option').forEach(option => {
        option.classList.remove('selected');
    });
    event.target.classList.add('selected');

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
                        const enderecoInput = document.querySelector('input[placeholder="Rua, número, complemento"]');
                        const endereco = enderecoInput ? enderecoInput.value : 'Endereço não informado';
                        document.getElementById('enderecoValue').textContent = endereco;
                        
                        // Atualizar informações adicionais do cartão
                        atualizarInformacoesCartao(cartaoData, dia);
                        atualizarEnderecoEntrega();

                        // Garante que não volte para a tela anterior
                        document.getElementById('vencimentoContainer').remove();
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
startCountdown();
