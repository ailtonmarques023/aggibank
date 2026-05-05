(function initLegacyNavigation(window) {
    'use strict';

    const root = window.AgilBank = window.AgilBank || {};
    const CONTAINERS = {
        dashboard: 'container',
        pix: 'pixContainer',
        extrato: 'extratoContainer',
        cartoes: 'cartaoGerenciamentoContainer',
        cartao: 'cartaoGerenciamentoContainer',
        cartaoVirtual: 'cartaoVirtualContainer',
        cartaoFisico: 'cartaoFisicoContainer',
        limiteCartao: 'limiteCartaoContainer',
        opcoesLimite: 'opcoesLimiteContainer',
        credito: 'creditoContainer',
        emprestimo: 'emprestimoContainer',
        emprestimoContent: 'emprestimoContent',
        emprestimoFormulario: 'emprestimoFormulario',
        emprestimoLoading: 'emprestimoLoading',
        emprestimoLiberado: 'emprestimoLiberado',
        emprestimoConcedido: 'emprestimoConcedidoContainer',
        boleto: 'boletoContainer',
        gerarBoletoPix: 'containerGerarBoletoPix',
        pagamento: 'paymentOptionsContainer',
        resultadoVerificacao: 'resultadoVerificacaoContainer',
        statusEntrega: 'statusEntregaContainer',
        notification: 'notification',
        fullNotification: 'fullNotification',
        perfil: 'perfilContainer',
        configuracoes: 'configuracoesContainer',
        chat: 'chatContainer',
        conta: 'contaContainer',
        validarCartao: 'validarCartao',
        atencaoPagamento: 'showAtecaoPagamento'
    };
    const HIDE_ALL_NAMES = [
        'dashboard',
        'pix',
        'notification',
        'extrato',
        'cartao',
        'cartoes',
        'statusEntrega',
        'opcoesLimite',
        'cartaoFisico',
        'cartaoVirtual',
        'atencaoPagamento',
        'pagamento',
        'resultadoVerificacao',
        'gerarBoletoPix',
        'boleto',
        'configuracoes',
        'perfil',
        'chat',
        'emprestimo',
        'credito',
        'emprestimoContent',
        'conta'
    ];

    function getElement(id) {
        return window.document.getElementById(id);
    }

    function hideAll() {
        window.document.body.classList.remove('agilbank-cartao-wizard-open');

        const cartaoGerenciamento = getElement('cartaoGerenciamentoContainer');
        if (cartaoGerenciamento) {
            cartaoGerenciamento.classList.remove('cartao-gerenciamento--solicitacao-ativa');
        }

        const cartaoSolicitacao = getElement('cartaoSolicitacaoFlow');
        if (cartaoSolicitacao) {
            cartaoSolicitacao.style.display = 'none';
        }

        HIDE_ALL_NAMES.forEach(function hideContainer(name) {
            const element = getElement(CONTAINERS[name]);
            if (element) {
                element.style.display = 'none';
            }
        });
    }

    function show(name, options) {
        const id = CONTAINERS[name] || name;
        const element = getElement(id);
        const settings = Object.assign({ display: 'block', scroll: true }, options || {});

        if (!element) {
            return false;
        }

        hideAll();
        element.style.display = settings.display;

        if (settings.opacity) {
            element.style.opacity = settings.opacity;
        }

        if (settings.transform) {
            element.style.transform = settings.transform;
        }

        if (typeof settings.onShow === 'function') {
            settings.onShow(element);
        }

        if (settings.scroll) {
            window.scrollTo(0, 0);
        }

        return true;
    }

    root.nav = Object.assign({}, root.nav, {
        containers: Object.assign({}, CONTAINERS),
        hideAll,
        show
    });

    window.legacyNavigation = root.nav;
})(window);
