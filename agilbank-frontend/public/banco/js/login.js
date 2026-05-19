// Sistema de Login GOV.BR - Integrado com Banco de Dados
function agilbankPrepareUiForLogout() {
    try {
        if (typeof window.agilbankSetSolicitacaoWizardMode === 'function') {
            window.agilbankSetSolicitacaoWizardMode(false);
        }

        document.body.classList.remove('agilbank-cartao-wizard-open');

        [
            'cartaoGerenciamentoContainer',
            'cartaoSolicitacaoFlow',
            'cartaoListaRealSection',
            'perfilContainer',
            'configuracoesContainer',
            'notification',
            'pixContainer',
            'extratoContainer',
            'emprestimoContainer',
            'creditoContainer',
            'contaContainer'
        ].forEach(id => {
            const element = document.getElementById(id);
            if (element) {
                element.style.display = 'none';
                element.style.opacity = '';
                element.style.transform = '';
            }
        });

        [
            'wizDispNome',
            'wizDispEmail',
            'wizDispCpf',
            'wizDispTel',
            'wizDispRua',
            'wizDispBairro',
            'wizDispCidadeUf',
            'wizDispCep',
            'cartaoWizardRevisaoDl'
        ].forEach(id => {
            const element = document.getElementById(id);
            if (element) {
                element.textContent = '—';
            }
        });

        [
            'cartaoInputRua',
            'cartaoInputBairro',
            'cartaoInputCidade',
            'cartaoInputEstado',
            'cartaoInputCep',
            'rendaInput',
            'cartaoInputEmpresa',
            'cartaoInputEmpresaAtual'
        ].forEach(id => {
            const element = document.getElementById(id);
            if (element) {
                element.value = '';
            }
        });

        if (typeof agilbankWizardPinClear === 'function') {
            agilbankWizardPinClear();
        } else {
            const senhaCartao = document.getElementById('cartaoInputSenha');
            if (senhaCartao) senhaCartao.value = '';
        }

        const tempo = document.getElementById('cartaoSelectTempo');
        if (tempo) {
            tempo.value = '';
        }

        const termos = document.getElementById('termosCheck');
        if (termos) {
            termos.checked = false;
        }

        window.__agilbankHeaderTemDadosReais = false;
        window.__agilbankUltimosDadosUsuarioReais = null;
        window.__agilbankCartoesLista = [];
        window.__agilbankCartaoSelecionadoId = null;
        window.__agilbankTitularCartaoCache = null;
    } catch (error) {
        console.warn('⚠️ Falha ao preparar UI para logout:', error);
    }
}

window.agilbankPrepareUiForLogout = agilbankPrepareUiForLogout;

class LoginSystem {
    constructor() {
        this.isLoggedIn = false;
        this.userData = null;
        this.init();
    }

    extractLoginToken(data) {
        if (!data || typeof data !== 'object') {
            return null;
        }
        return (
            data.accessToken ||
            data.token ||
            (data.data && data.data.accessToken) ||
            (data.data && data.data.token) ||
            null
        );
    }

    extractLoginUser(data) {
        if (!data || typeof data !== 'object') {
            return null;
        }
        return (
            data.user ||
            data.usuario ||
            (data.data && data.data.user) ||
            (data.data && data.data.usuario) ||
            null
        );
    }

    init() {
        console.log('🚀 Inicializando LoginSystem...');
        var self = this;
        window.agilbankOnAccountNotVerified = function () {
            if (!self.userData) {
                try {
                    var raw =
                        sessionStorage.getItem('govbr_user') ||
                        sessionStorage.getItem('agilbank_user') ||
                        localStorage.getItem('govbr_user') ||
                        localStorage.getItem('agilbank_user');
                    if (raw) {
                        self.userData = JSON.parse(raw);
                    }
                } catch (e) {
                    console.warn('agilbankOnAccountNotVerified: não foi possível ler usuário da sessão', e);
                }
            }
            self.showVerificationRequiredGate(self.userData);
        };
        this.checkLoginStatus();
        this.bindEvents();
        this.setupValidation();
        console.log('✅ LoginSystem inicializado com sucesso!');
    }

    async checkLoginStatus() {
        const token =
            sessionStorage.getItem('govbr_token') ||
            sessionStorage.getItem('agilbank_token') ||
            sessionStorage.getItem('token') ||
            localStorage.getItem('govbr_token') ||
            localStorage.getItem('agilbank_token') ||
            localStorage.getItem('token');
        if (token) {
            try {
                const storedUser =
                    sessionStorage.getItem('govbr_user') ||
                    sessionStorage.getItem('agilbank_user') ||
                    localStorage.getItem('govbr_user') ||
                    localStorage.getItem('agilbank_user');

                this.isLoggedIn = true;
                this.userData = storedUser ? JSON.parse(storedUser) : {};

                if (!sessionStorage.getItem('govbr_token')) {
                    sessionStorage.setItem('govbr_token', token);
                    localStorage.setItem('govbr_token', token);
                }
                sessionStorage.setItem('token', token);
                localStorage.setItem('token', token);

                if (storedUser && !sessionStorage.getItem('govbr_user')) {
                    sessionStorage.setItem('govbr_user', storedUser);
                    localStorage.setItem('govbr_user', storedUser);
                }

                this.updateUserHeader(this.userData);
                if (this.userData && this.userData.isVerificado === false) {
                    this.showVerificationRequiredGate(this.userData);
                } else {
                    this.showMainApp();
                }
            } catch (error) {
                console.error('Erro ao verificar status do login:', error);
                this.logout();
            }
        } else {
            this.showLoginScreen();
        }
    }

    showLoginScreen() {
        window.location.replace('/login');
    }

    hideVerificationGate() {
        var gate = document.getElementById('agilbankVerificationGate');
        if (gate) {
            gate.style.display = 'none';
            gate.innerHTML = '';
        }
        var form = document.getElementById('loginForm');
        if (form) {
            form.style.display = '';
        }
        document.querySelectorAll('.login-divider, .login-social').forEach(function (el) {
            if (el) {
                el.style.display = '';
            }
        });
        var footer = document.querySelector('.login-footer');
        if (footer) {
            footer.style.display = '';
        }
    }

    showVerificationRequiredGate(user) {
        this.hideLoading();
        var ud = user || this.userData || {};
        var mainApp = document.getElementById('mainApp');
        if (mainApp) {
            mainApp.style.display = 'none';
        }
        var loginContainer = document.getElementById('loginContainer');
        if (loginContainer) {
            loginContainer.style.display = 'flex';
        }

        var form = document.getElementById('loginForm');
        if (form) {
            form.style.display = 'none';
        }
        document.querySelectorAll('.login-divider, .login-social').forEach(function (el) {
            if (el) {
                el.style.display = 'none';
            }
        });
        var footer = document.querySelector('.login-footer');
        if (footer) {
            footer.style.display = 'none';
        }

        var card = document.querySelector('#loginContainer .login-card');
        if (!card) {
            return;
        }

        var gate = document.getElementById('agilbankVerificationGate');
        if (!gate) {
            gate = document.createElement('div');
            gate.id = 'agilbankVerificationGate';
            gate.setAttribute('role', 'status');
            card.appendChild(gate);
        }

        var email =
            (ud && (ud.email || ud.mail)) ||
            (document.getElementById('loginEmail') && document.getElementById('loginEmail').value) ||
            '';

        var confirmarHref = 'confirmar-email.html';
        var self = this;

        gate.style.display = 'block';
        gate.innerHTML =
            '<div class="login-header"><div class="logo-container"><img src="/brand/logo-agil-bank-escura.png" alt="AgilBank" class="agilbank-brand-logo agilbank-brand-logo--login agilbank-brand-logo--light" width="216" height="36" decoding="async" /></div>' +
            '<p class="login-subtitle">Verificação de e-mail necessária</p></div>' +
            '<div class="login-error-message" id="agilVerifyGateErr" style="display:none;margin-bottom:12px;"></div>' +
            '<p class="login-footer-text" style="text-align:left;line-height:1.5;margin:0 0 16px;">' +
            'Esta conta ainda <strong>não está verificada</strong>. Confira o link enviado para ' +
            '<strong id="agilVerifyEmailDisp"></strong> ou use o botão abaixo para reenviar o e-mail de verificação.' +
            '</p>' +
            '<p class="login-footer-text" style="text-align:left;font-size:13px;margin:0 0 16px;">' +
            'Se você já clicou no link, abra <a href="' +
            confirmarHref +
            '" class="login-footer-link">confirmar e-mail</a> ou aguarde alguns instantes e tente entrar de novo.' +
            '</p>' +
            '<button type="button" class="login-btn" id="agilVerifyResendBtn">Reenviar e-mail de verificação</button>' +
            '<button type="button" class="login-btn" id="agilVerifyLogoutBtn" ' +
            'style="margin-top:12px;background:#6c757d;">Sair</button>';

        var disp = gate.querySelector('#agilVerifyEmailDisp');
        if (disp) {
            disp.textContent = email || 'seu e-mail cadastrado';
        }

        var errEl = gate.querySelector('#agilVerifyGateErr');
        var resendBtn = gate.querySelector('#agilVerifyResendBtn');
        if (resendBtn) {
            resendBtn.onclick = function () {
                if (errEl) {
                    errEl.style.display = 'none';
                    errEl.textContent = '';
                }
                if (!window.AgilBank || !window.AgilBank.api || typeof window.AgilBank.api.request !== 'function') {
                    if (errEl) {
                        errEl.textContent = 'Cliente de API indisponível. Recarregue a página.';
                        errEl.style.display = 'block';
                    }
                    return;
                }
                resendBtn.disabled = true;
                var prev = resendBtn.textContent;
                resendBtn.textContent = 'Enviando...';
                if (typeof agilbankTryResendVerificationEmail === 'function') {
                    agilbankTryResendVerificationEmail().then(function (r) {
                        resendBtn.disabled = false;
                        resendBtn.textContent = prev;
                        if (errEl) {
                            errEl.style.display = 'block';
                            errEl.textContent = window.agilbankMessageForResendVerificationResult
                                ? window.agilbankMessageForResendVerificationResult(r)
                                : (r.data && r.data.message) || 'Não foi possível reenviar.';
                            if (r.ok && r.data && r.data.success) {
                                errEl.style.color = '#0d6efd';
                            } else {
                                errEl.style.color = '#c0392b';
                            }
                        }
                    });
                } else {
                    resendBtn.disabled = false;
                    resendBtn.textContent = prev;
                    if (errEl) {
                        errEl.textContent = 'Função de reenvio indisponível. Recarregue a página.';
                        errEl.style.display = 'block';
                    }
                }
            };
        }

        var outBtn = gate.querySelector('#agilVerifyLogoutBtn');
        if (outBtn) {
            outBtn.onclick = function () {
                self.logout();
            };
        }
    }

    showMainApp() {
        this.hideVerificationGate();
        console.log('🔄 Mostrando aplicação principal...');
        
        const loginContainer = document.getElementById('loginContainer');
        const mainApp = document.getElementById('mainApp');
        
        if (loginContainer) {
            loginContainer.style.display = 'none';
            console.log('✅ Login container escondido');
        } else {
            console.log('❌ Login container não encontrado');
        }
        
        if (mainApp) {
            mainApp.style.display = 'block';
            console.log('✅ Main app exibido');
        } else {
            console.log('❌ Main app não encontrado');
        }
        
        this.updateUserInfo();
        console.log('✅ Aplicação principal exibida com sucesso');
    }

    bindEvents() {
        // Botão de login
        document.getElementById('loginBtn').addEventListener('click', (e) => {
            e.preventDefault();
            this.handleLogin();
        });

        // Toggle de senha
        const passwordToggle = document.getElementById('passwordToggle');
        if (passwordToggle) {
            passwordToggle.addEventListener('click', () => {
                this.togglePassword();
            });
        }

        // Login com Enter
        document.getElementById('loginForm').addEventListener('keypress', (e) => {
            if (e.key === 'Enter') {
                e.preventDefault();
                this.handleLogin();
            }
        });

        // Botões sociais
        document.getElementById('googleLogin').addEventListener('click', () => {
            this.socialLogin('google');
        });

        document.getElementById('govbrLogin').addEventListener('click', () => {
            this.socialLogin('govbr');
        });

        // Esqueci minha senha
        document.getElementById('forgotPassword').addEventListener('click', (e) => {
            e.preventDefault();
            this.showForgotPassword();
        });

        // Menu do usuário
        const userMenuTrigger = document.getElementById('userMenuTrigger');
        const userMenuDropdown = document.getElementById('userMenuDropdown');
        
        if (userMenuTrigger && userMenuDropdown) {
            if (!userMenuTrigger.dataset.agilbankMenuClickBound) {
                userMenuTrigger.dataset.agilbankMenuClickBound = '1';
                userMenuTrigger.addEventListener('click', (e) => {
                    e.stopPropagation();
                    userMenuDropdown.classList.toggle('active');
                });
            }
            
            // Fechar menu ao clicar fora
            if (!document.documentElement.dataset.agilbankUserMenuCloseBound) {
                document.documentElement.dataset.agilbankUserMenuCloseBound = '1';
                document.addEventListener('click', (e) => {
                    if (!userMenuTrigger.contains(e.target) && !userMenuDropdown.contains(e.target)) {
                        userMenuDropdown.classList.remove('active');
                    }
                });
                document.addEventListener('keydown', (e) => {
                    if (e.key === 'Escape') {
                        userMenuDropdown.classList.remove('active');
                    }
                });
            }
        }
    }

    setupValidation() {
        const inputs = document.querySelectorAll('.login-input');
        inputs.forEach(input => {
            input.addEventListener('blur', () => this.validateField(input));
            input.addEventListener('input', () => {
                if (input.classList.contains('error')) {
                    this.validateField(input);
                }
            });
        });
        
        // Configurar sistema de quadrados para senha
        this.setupPasswordSquares();
    }

    setupPasswordSquares() {
        const passwordInput = document.getElementById('loginPassword');
        const squares = document.querySelectorAll('.password-square input');
        
        if (!passwordInput || !squares.length) {
            console.log('❌ Elementos não encontrados');
            return;
        }

        // Configurar cada input individual
        squares.forEach((input, index) => {
            // Limitar a 1 dígito
            input.addEventListener('input', (e) => {
                e.target.value = e.target.value.replace(/[^0-9]/g, '').slice(0, 1);
                
                // Ir para o próximo automaticamente
                if (e.target.value && index < squares.length - 1) {
                    squares[index + 1].focus();
                }
                
                // Atualizar input hidden
                this.updateHiddenPassword();
            });

            // Voltar com backspace
            input.addEventListener('keydown', (e) => {
                if (e.key === 'Backspace' && !e.target.value && index > 0) {
                    squares[index - 1].focus();
                }
            });
        });

        // Focar no primeiro input quando clicar no container
        const container = document.querySelector('.password-squares-container');
        if (container) {
            container.addEventListener('click', () => {
                squares[0].focus();
            });
        }

    }

    updateHiddenPassword() {
        const passwordInput = document.getElementById('loginPassword');
        const squares = document.querySelectorAll('.password-square input');
        
        let senha = '';
        squares.forEach(input => {
            senha += input.value;
        });
        
        passwordInput.value = senha;
    }


    validateField(field) {
        const value = field.value.trim();
        const errorElement = field.parentNode.querySelector('.login-error');
        
        // Limpar validação anterior
        field.classList.remove('error', 'valid');
        if (errorElement) errorElement.style.display = 'none';

        let isValid = true;
        let errorMessage = '';

        switch (field.type) {
            case 'email':
                const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
                if (!emailRegex.test(value)) {
                    isValid = false;
                    errorMessage = 'Email inválido';
                }
                break;

            case 'password':
                if (value.length !== 6) {
                    isValid = false;
                    errorMessage = 'Senha deve ter exatamente 6 dígitos';
                    this.showPasswordError();
                } else if (!/^\d{6}$/.test(value)) {
                    isValid = false;
                    errorMessage = 'Senha deve conter apenas números';
                    this.showPasswordError();
                } else {
                    this.showPasswordSuccess();
                }
                break;

            default:
                if (field.hasAttribute('required') && !value) {
                    isValid = false;
                    errorMessage = 'Campo obrigatório';
                }
        }

        // Aplicar validação visual
        if (isValid) {
            field.classList.add('valid');
        } else {
            field.classList.add('error');
            if (errorElement) {
                errorElement.textContent = errorMessage;
                errorElement.style.display = 'block';
            }
        }

        return isValid;
    }

    async handleLogin() {
        const email = document.getElementById('loginEmail').value.trim();
        const password = document.getElementById('loginPassword').value.trim();
        const rememberMe = document.getElementById('rememberMe').checked;

        // Validar campos
        const emailValid = this.validateField(document.getElementById('loginEmail'));
        const passwordValid = this.validateField(document.getElementById('loginPassword'));

        if (!emailValid || !passwordValid) {
            this.showError('Por favor, preencha todos os campos corretamente.');
            return;
        }

        // Mostrar loading
        this.showLoading();

        try {
            if (!window.AgilBank || !window.AgilBank.api || typeof window.AgilBank.api.request !== 'function') {
                this.hideLoading();
                this.showError('Cliente de API indisponível. Recarregue a página.');
                return;
            }

            const response = await window.AgilBank.api.request('auth/login', {
                auth: false,
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    email: email,
                    senha: password
                })
            });

            const data = await response.json().catch(function () {
                return {};
            });

            if (response.ok) {
                const token = this.extractLoginToken(data);
                const user = this.extractLoginUser(data);

                if (!token) {
                    this.hideLoading();
                    this.showError('Erro no login: resposta inválida do servidor.');
                    return;
                }

                if (window.AgilBank.auth && typeof window.AgilBank.auth.setSession === 'function') {
                    window.AgilBank.auth.setSession(token, user);
                } else {
                    const userData = JSON.stringify(user || {});
                    sessionStorage.setItem('govbr_token', token);
                    sessionStorage.setItem('agilbank_token', token);
                    sessionStorage.setItem('token', token);
                    sessionStorage.setItem('govbr_user', userData);
                    sessionStorage.setItem('agilbank_user', userData);
                    localStorage.setItem('govbr_token', token);
                    localStorage.setItem('agilbank_token', token);
                    localStorage.setItem('token', token);
                    localStorage.setItem('govbr_user', userData);
                    localStorage.setItem('agilbank_user', userData);
                }

                this.userData = user || {};
                this.isLoggedIn = true;

                const loginEvent = new CustomEvent('userLoggedIn', {
                    detail: { userData: this.userData }
                });
                document.dispatchEvent(loginEvent);

                this.hideLoading();
                this.updateUserHeader(this.userData);
                if (user && user.isVerificado === false) {
                    this.showVerificationRequiredGate(user);
                } else {
                    this.showMainApp();
                    this.showSuccessMessage();
                }
            } else {
                this.hideLoading();
                this.showError(
                    data.message ||
                        data.error ||
                        'Erro ao fazer login. Tente novamente.'
                );
            }
        } catch (error) {
            console.error('Erro no login:', error);
            this.hideLoading();
            this.showError('Erro de conexão. Verifique sua internet e tente novamente.');
        }
    }


    loginSuccess(email, rememberMe) {
        // Salvar dados de login
        const expiresAt = rememberMe ? Date.now() + (30 * 24 * 60 * 60 * 1000) : Date.now() + (24 * 60 * 60 * 1000);
        
        const loginData = {
            isLoggedIn: true,
            userData: this.userData,
            expiresAt: expiresAt
        };

        sessionStorage.setItem('govbr_login', JSON.stringify(loginData));
        localStorage.setItem('govbr_login', JSON.stringify(loginData));
        
        this.isLoggedIn = true;
        this.showMainApp();
        this.showSuccessMessage();
    }

    showSuccessMessage() {
        const successDiv = document.createElement('div');
        successDiv.className = 'login-success';
        successDiv.innerHTML = `
            <div class="login-success-icon">
                <i class="fas fa-check-circle"></i>
            </div>
            <div class="login-success-title">Login realizado com sucesso!</div>
            <div class="login-success-message">Bem-vindo(a), ${this.userData.nomeCompleto || this.userData.name || 'Usuário'}!</div>
        `;

        document.body.appendChild(successDiv);
        successDiv.style.display = 'block';

        setTimeout(() => {
            successDiv.remove();
        }, 3000);
    }

    togglePassword() {
        const passwordInput = document.getElementById('loginPassword');
        const toggleBtn = document.getElementById('passwordToggle');
        const icon = toggleBtn.querySelector('i');

        if (passwordInput.type === 'password') {
            passwordInput.type = 'text';
            icon.className = 'fas fa-eye-slash';
        } else {
            passwordInput.type = 'password';
            icon.className = 'fas fa-eye';
        }
    }

    showLoading() {
        console.log('🔄 Mostrando loading...');
        const loginBtn = document.getElementById('loginBtn');
        const loadingDiv = document.querySelector('.login-loading');
        
        if (loginBtn) {
            loginBtn.disabled = true;
            loginBtn.textContent = 'Entrando...';
        }
        
        if (loadingDiv) {
            loadingDiv.style.display = 'block';
        } else {
            console.log('❌ Elemento de loading não encontrado');
        }
    }

    hideLoading() {
        console.log('✅ Escondendo loading...');
        const loginBtn = document.getElementById('loginBtn');
        const loadingDiv = document.querySelector('.login-loading');
        
        if (loginBtn) {
            loginBtn.disabled = false;
            loginBtn.textContent = 'Entrar';
        }
        
        if (loadingDiv) {
            loadingDiv.style.display = 'none';
        } else {
            console.log('❌ Elemento de loading não encontrado');
        }
    }

    showError(message) {
        console.log('❌ Mostrando erro:', message);
        const errorDiv = document.querySelector('.login-error-message');
        if (errorDiv) {
            errorDiv.textContent = message;
            errorDiv.style.display = 'block';

            setTimeout(() => {
                errorDiv.style.display = 'none';
            }, 5000);
        } else {
            console.log('❌ Elemento de erro não encontrado');
        }
    }

    socialLogin(provider) {
        this.showError('Login social não implementado. Use email e senha para fazer login.');
    }

    showForgotPassword() {
        // ✅ AGORA: Usar funcionalidade real de recuperação de senha
        const modal = document.getElementById('esqueciSenhaModal');
        if (modal) {
            modal.classList.add('show');
        }
    }

    updateUserHeader(userData) {
        if (!userData) return;
        if (typeof window.aplicarDadosUsuarioReais === 'function') {
            window.aplicarDadosUsuarioReais(userData, { modo: 'autenticado', fonte: 'login' });
            return;
        }
        if (window.userDataManager) {
            window.userDataManager.userData = userData;
            window.userDataManager.updateAllUserData();
        } else {
            this.updateUserHeaderFallback(userData);
        }
    }

    updateUserHeaderFallback(userData) {
        // DESABILITADO - Manter dados estáticos
        console.log('🚫 Atualização automática de header desabilitada');
        return;
        
        // Atualizar informações no menu do usuário
        const menuFullname = document.getElementById('user-menu-fullname');
        const menuEmail = document.getElementById('user-menu-email');
        const menuAccount = document.getElementById('user-menu-account');
        
        if (menuFullname) {
            menuFullname.textContent = userData.nome_completo || userData.name || 'Nome não disponível';
        }
        if (menuEmail) {
            menuEmail.textContent = userData.email || 'Email não disponível';
        }
        if (menuAccount) {
            const accountNumber = userData.numero_conta ? 
                `${userData.numero_conta}-${userData.digito_conta || '0'}` : 
                'Conta não disponível';
            menuAccount.textContent = `Conta: ${accountNumber}`;
        }
    }

    updateUserInfo() {
        if (this.userData) {
            this.updateUserHeader(this.userData);
        }
    }

    async logout() {
        console.log('🚪 Iniciando logout...');
        
        const token = sessionStorage.getItem('govbr_token') || localStorage.getItem('govbr_token');
        
        // Tentar chamar API de logout (opcional)
        if (token && window.AgilBank && window.AgilBank.api && typeof window.AgilBank.api.request === 'function') {
            try {
                await window.AgilBank.api.request('auth/logout', {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json'
                    }
                });
                console.log('✅ Logout na API realizado');
            } catch (error) {
                console.log('⚠️ Erro na API de logout, continuando logout local:', error);
            }
        }

        if (window.AgilBank && window.AgilBank.auth && typeof window.AgilBank.auth.clearSession === 'function') {
            window.AgilBank.auth.clearSession();
        } else {
            sessionStorage.removeItem('govbr_token');
            sessionStorage.removeItem('govbr_user');
            sessionStorage.removeItem('agilbank_token');
            sessionStorage.removeItem('agilbank_user');
            sessionStorage.removeItem('govbr_login');
            sessionStorage.removeItem('token');
            localStorage.removeItem('govbr_token');
            localStorage.removeItem('govbr_user');
            localStorage.removeItem('agilbank_token');
            localStorage.removeItem('agilbank_user');
            localStorage.removeItem('govbr_login');
            localStorage.removeItem('token');
        }
        
        this.isLoggedIn = false;
        this.userData = null;

        if (typeof window.agilbankPrepareUiForLogout === 'function') {
            window.agilbankPrepareUiForLogout();
        }
        
        // ✅ Disparar evento de logout para UserDataManager
        const logoutEvent = new CustomEvent('userLoggedOut');
        document.dispatchEvent(logoutEvent);
        
        console.log('🧹 Dados locais limpos');
        
        // Voltar para tela de login
        this.showLoginScreen();
        
        // Limpar formulário
        const loginForm = document.getElementById('loginForm');
        if (loginForm) {
            loginForm.reset();
        }
        
        document.querySelectorAll('.login-input').forEach(input => {
            input.classList.remove('error', 'valid');
        });
        
        // Limpar quadrados de senha
        this.clearPasswordSquares();
        
        console.log('✅ Logout concluído com sucesso!');
    }

    showPasswordError() {
        const squares = document.querySelectorAll('.password-square');
        squares.forEach(square => {
            square.classList.add('error');
        });
    }

    showPasswordSuccess() {
        const squares = document.querySelectorAll('.password-square');
        squares.forEach(square => {
            square.classList.remove('error');
        });
    }

    clearPasswordSquares() {
        const squares = document.querySelectorAll('.password-square');
        squares.forEach(square => {
            square.classList.remove('filled', 'active', 'error');
            square.textContent = '';
        });
    }
}

// Inicializar sistema de login quando a página carregar
document.addEventListener('DOMContentLoaded', () => {
    console.log('📄 DOM carregado, criando LoginSystem...');
    window.loginSystem = new LoginSystem();
});

// Função global para logout
async function logout() {
    if (window.loginSystem) {
        await window.loginSystem.logout();
    }
}
