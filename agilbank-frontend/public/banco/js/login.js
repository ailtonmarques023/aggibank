// Sistema de Login GOV.BR - Integrado com Banco de Dados
class LoginSystem {
    constructor() {
        this.isLoggedIn = false;
        this.userData = null;
        this.apiBase = 'http://127.0.0.1:5000/api';
        this.init();
    }

    init() {
        console.log('🚀 Inicializando LoginSystem...');
        this.checkLoginStatus();
        this.bindEvents();
        this.setupValidation();
        console.log('✅ LoginSystem inicializado com sucesso!');
    }

    async checkLoginStatus() {
        const token = sessionStorage.getItem('govbr_token') || localStorage.getItem('govbr_token');
        if (token) {
            try {
                const response = await fetch(`${this.apiBase}/auth/me`, {
                    method: 'GET',
                    headers: {
                        'Authorization': `Bearer ${token}`,
                        'Content-Type': 'application/json'
                    }
                });

                if (response.ok) {
                    const data = await response.json();
                    this.isLoggedIn = true;
                    this.userData = data.user;
                    this.updateUserHeader(data.user);
                    this.showMainApp();
                } else {
                    // Token inválido, limpar dados
                    this.logout();
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
        document.getElementById('loginContainer').style.display = 'flex';
        document.getElementById('mainApp').style.display = 'none';
        
        // Focar no input de senha após um pequeno delay
        setTimeout(() => {
            const passwordInput = document.getElementById('loginPassword');
            if (passwordInput) {
                passwordInput.focus();
            }
        }, 100);
    }

    showMainApp() {
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
            userMenuTrigger.addEventListener('click', (e) => {
                e.stopPropagation();
                userMenuDropdown.classList.toggle('active');
            });
            
            // Fechar menu ao clicar fora
            document.addEventListener('click', (e) => {
                if (!userMenuTrigger.contains(e.target) && !userMenuDropdown.contains(e.target)) {
                    userMenuDropdown.classList.remove('active');
                }
            });
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

        console.log('🔧 Configurando quadrados de senha...');

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

        console.log('✅ Quadrados de senha configurados!');
    }

    updateHiddenPassword() {
        const passwordInput = document.getElementById('loginPassword');
        const squares = document.querySelectorAll('.password-square input');
        
        let senha = '';
        squares.forEach(input => {
            senha += input.value;
        });
        
        passwordInput.value = senha;
        console.log('🔑 Senha atualizada:', senha);
        console.log('🔑 Tamanho da senha:', senha.length);
        console.log('🔑 Valores dos quadrados:', Array.from(squares).map(s => s.value));
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

        // 🔍 DEBUG: Verificar se a senha está sendo coletada corretamente
        console.log('🔍 DEBUG LOGIN:');
        console.log('  Email:', email);
        console.log('  Senha:', password);
        console.log('  Tamanho da senha:', password.length);
        console.log('  Senha é string:', typeof password);

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
            const response = await fetch(`${this.apiBase}/auth/login`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    email: email,
                    senha: password
                })
            });

            const data = await response.json();

            if (response.ok) {
                // Salvar token
                const userData = JSON.stringify(data.user);
                sessionStorage.setItem('govbr_token', data.accessToken);
                sessionStorage.setItem('govbr_user', userData);
                localStorage.setItem('govbr_token', data.accessToken);
                localStorage.setItem('govbr_user', userData);
                
                this.userData = data.user;
                this.isLoggedIn = true;
                
                // ✅ Disparar evento de login para UserDataManager
                const loginEvent = new CustomEvent('userLoggedIn', {
                    detail: { userData: data.user }
                });
                document.dispatchEvent(loginEvent);
                
                this.hideLoading();
                this.updateUserHeader(data.user);
                this.showMainApp();
                this.showSuccessMessage();
            } else {
                this.hideLoading();
                this.showError(data.error || 'Erro ao fazer login. Tente novamente.');
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
            <div class="login-success-message">Bem-vindo(a), ${this.userData.name}!</div>
        `;

        document.body.appendChild(successDiv);
        successDiv.style.display = 'block';

        setTimeout(() => {
            successDiv.remove();
        }, 3000);
    }

    logout() {
        sessionStorage.removeItem('govbr_login');
        localStorage.removeItem('govbr_login');
        this.isLoggedIn = false;
        this.userData = null;
        this.showLoginScreen();
        
        // Limpar formulário
        document.getElementById('loginForm').reset();
        document.querySelectorAll('.login-input').forEach(input => {
            input.classList.remove('error', 'valid');
        });
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
        if (userData) {
            // ✅ AGORA: Usar UserDataManager para atualizar dados
            if (window.userDataManager) {
                window.userDataManager.userData = userData;
                window.userDataManager.updateAllUserData();
            } else {
                // Fallback para atualização manual se UserDataManager não estiver disponível
                this.updateUserHeaderFallback(userData);
            }
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
        if (token) {
            try {
                await fetch(`${this.apiBase}/auth/logout`, {
                    method: 'POST',
                    headers: {
                        'Authorization': `Bearer ${token}`,
                        'Content-Type': 'application/json'
                    }
                });
                console.log('✅ Logout na API realizado');
            } catch (error) {
                console.log('⚠️ Erro na API de logout, continuando logout local:', error);
            }
        }
        
        // Limpar dados locais (sempre fazer isso)
        sessionStorage.removeItem('govbr_token');
        sessionStorage.removeItem('govbr_user');
        sessionStorage.removeItem('govbr_login');
        localStorage.removeItem('govbr_token');
        localStorage.removeItem('govbr_user');
        localStorage.removeItem('govbr_login');
        
        this.isLoggedIn = false;
        this.userData = null;
        
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
