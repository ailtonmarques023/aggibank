/**
 * LEGADO DESCONTINUADO — Abertura de conta só em /register (SPA mobile-first).
 *
 * Este arquivo não chama mais POST /api/auth/register nem rende formulário HTML.
 * Preserva apenas globals esperados pelo index.html: FormularioConta (stub),
 * abrirFormularioConta, voltarParaLogin, fazerLoginAposConta, verificarStatusUpload.
 */
(function (global) {
    'use strict';

    function querySuffix() {
        try {
            return global.location.search || '';
        } catch (e) {
            return '';
        }
    }

    function registerHref() {
        return '/register' + querySuffix();
    }

    global.agilbankRegisterOfficialHref = registerHref;

    global.abrirFormularioConta = function abrirFormularioConta() {
        global.location.assign(registerHref());
    };

    function FormularioContaStub() {}

    FormularioContaStub.prototype.validateField = function validateField() {};
    FormularioContaStub.prototype.showStep = function showStep() {};
    FormularioContaStub.prototype.checkIfCanSubmit = function checkIfCanSubmit() {};

    FormularioContaStub.prototype.submitForm = function submitForm() {
        global.abrirFormularioConta();
    };

    global.FormularioConta = FormularioContaStub;
})(typeof window !== 'undefined' ? window : globalThis);

/** Compatível com botões/onclick residuais: só restaura área de login se existir DOM. */
function voltarParaLogin() {
    var contaContainer = document.getElementById('contaContainer');
    if (contaContainer) {
        contaContainer.style.display = 'none';
    }
    var loginContainer = document.getElementById('loginContainer');
    if (loginContainer) {
        loginContainer.style.display = 'flex';
    }
}

function fazerLoginAposConta() {
    voltarParaLogin();
}

function verificarStatusUpload() {
    /* no-op — fluxo antigo removido */
}
