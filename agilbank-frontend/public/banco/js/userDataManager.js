/**
 * UserDataManager - Gerenciador Centralizado de Dados do Usuário
 * Responsável por carregar, atualizar e sincronizar dados do usuário em toda a aplicação
 */

class UserDataManager {
    constructor() {
        this.userData = null;
        this.init();
    }

    /**
     * Extrai o objeto usuário do JSON de GET /api/user/profile (e variantes tolerantes).
     */
    extractUserFromProfileResponse(body) {
        if (!body || typeof body !== 'object') {
            return null;
        }
        const fromDataUser = body.data && body.data.user;
        const fromDataProfile = body.data && body.data.profile;
        const fromDataFlat =
            body.data && typeof body.data === 'object' && !body.data.user && !body.data.profile
                ? body.data
                : null;
        const useFlat =
            fromDataFlat &&
            (Object.prototype.hasOwnProperty.call(fromDataFlat, 'email') ||
                Object.prototype.hasOwnProperty.call(fromDataFlat, 'id'));
        const raw =
            fromDataUser ||
            fromDataProfile ||
            (useFlat ? fromDataFlat : null) ||
            body.user ||
            body.profile ||
            null;
        return this.normalizeUserFields(raw);
    }

    /**
     * Garante aliases snake_case usados por updateUserMenu, formatCPF, etc. (backend 3001 usa camelCase).
     */
    normalizeUserFields(user) {
        if (!user || typeof user !== 'object') {
            return user;
        }
        return Object.assign({}, user, {
            nome_completo: user.nome_completo || user.nomeCompleto || user.name,
            numero_conta: user.numero_conta || user.numeroConta,
            digito_conta: user.digito_conta || user.digitoConta,
            endereco: user.endereco || user.address || null,
            dados_profissionais: user.dados_profissionais || user.dadosProfissionais || null
        });
    }

    mergeWithExistingRelatedData(nextUser) {
        const normalized = this.normalizeUserFields(nextUser);
        if (!normalized || typeof normalized !== 'object' || !this.userData) {
            return normalized;
        }
        return Object.assign({}, normalized, {
            endereco: normalized.endereco || this.userData.endereco || null,
            dados_profissionais: normalized.dados_profissionais || this.userData.dados_profissionais || null
        });
    }

    persistUserToStorage() {
        const userData = JSON.stringify(this.userData);
        sessionStorage.setItem('govbr_user', userData);
        sessionStorage.setItem('agilbank_user', userData);
        localStorage.setItem('govbr_user', userData);
        localStorage.setItem('agilbank_user', userData);
    }

    init() {
        console.log('🚀 Inicializando UserDataManager...');
        this.loadUserDataFromStorage();
        this.setupEventListeners();
    }

    /**
     * Carrega dados do usuário do armazenamento da sessão atual
     */
    loadUserDataFromStorage() {
        try {
            const storedUser =
                sessionStorage.getItem('govbr_user') ||
                sessionStorage.getItem('agilbank_user') ||
                localStorage.getItem('govbr_user') ||
                localStorage.getItem('agilbank_user');
            if (storedUser) {
                this.userData = this.normalizeUserFields(JSON.parse(storedUser));
                console.log('✅ Dados do usuário carregados da sessão:', this.userData);
                this.updateAllUserData();
                this.loadUserDataFromAPI();
            } else {
                console.log('⚠️ Nenhum usuário logado encontrado');
                this.loadUserDataFromAPI();
            }
        } catch (error) {
            console.error('❌ Erro ao carregar dados do usuário:', error);
            this.loadUserDataFromAPI();
        }
    }

    /**
     * Carrega dados atualizados do usuário da API
     */
    async loadUserDataFromAPI() {
        try {
            const token =
                (window.AgilBank && window.AgilBank.auth && typeof window.AgilBank.auth.getToken === 'function'
                    ? window.AgilBank.auth.getToken()
                    : null) ||
                sessionStorage.getItem('govbr_token') ||
                localStorage.getItem('govbr_token');
            if (!token) {
                console.log('⚠️ Token não encontrado');
                return null;
            }

            if (!window.AgilBank || !window.AgilBank.api || typeof window.AgilBank.api.request !== 'function') {
                console.error('❌ AgilBank.api indisponível');
                return null;
            }

            console.log('🔄 Carregando dados do usuário da API (user-complete-data)...');
            async function requestProfile(path) {
                const response = await window.AgilBank.api.request(path, {
                    method: 'GET',
                    headers: {
                        'Content-Type': 'application/json'
                    }
                });
                const body = await response.json().catch(function () {
                    return {};
                });
                return { response, body, path };
            }

            let result = await requestProfile('user/user-complete-data');
            if (!result.response.ok && result.response.status !== 401) {
                console.warn('⚠️ user/user-complete-data falhou; tentando user/profile');
                result = await requestProfile('user/profile');
            }

            if (result.response.ok) {
                var rawUser =
                    typeof window.agilbankResolverUsuarioBrutoDoPerfil === 'function'
                        ? window.agilbankResolverUsuarioBrutoDoPerfil(result.body)
                        : result.body.user_data && result.body.user_data.usuario
                          ? result.body.user_data.usuario
                          : result.body.data && result.body.data.user
                            ? result.body.data.user
                            : null;
                if (!rawUser) {
                    console.error('❌ Resposta de perfil sem usuário reconhecível:', result.body);
                    return null;
                }
                this.userData = this.mergeWithExistingRelatedData(rawUser);
                this.persistUserToStorage();

                console.log('✅ Dados do usuário atualizados da API:', this.userData);
                this.updateAllUserData();
                return this.userData;
            }
            console.error('❌ Erro ao carregar dados da API:', result.response.status);
            return null;
        } catch (error) {
            console.error('❌ Erro na requisição da API:', error);
            return null;
        }
    }

    /**
     * Atualiza todos os elementos da interface com dados do usuário
     */
    updateAllUserData() {
        if (!this.userData) return;
        if (typeof window.aplicarDadosUsuarioReais === 'function') {
            window.aplicarDadosUsuarioReais(this.userData, {
                modo: 'autenticado',
                fonte: 'UserDataManager.updateAllUserData'
            });
        }
        if (
            typeof window.normalizarDadosUsuarioBruto === 'function' &&
            typeof window.atualizarInterfacePerfilDoNormalizado === 'function'
        ) {
            var nn = window.normalizarDadosUsuarioBruto(this.userData);
            if (nn) window.atualizarInterfacePerfilDoNormalizado(nn);
        }
    }

    /**
     * Atualiza o menu dropdown do usuário
     */
    updateUserMenu() {
        const elements = {
            'user-menu-fullname': this.userData.nome_completo || 'Nome não disponível',
            'user-menu-email': this.userData.email || 'Email não disponível',
            'user-menu-account': this.formatAccountNumber()
        };

        Object.entries(elements).forEach(([id, value]) => {
            const element = document.getElementById(id);
            if (element) {
                element.textContent = value;
            }
        });
    }

    /**
     * Atualiza as informações principais do usuário
     */
    updateMainUserInfo() {
        this.updateAllUserData();
    }

    /**
     * Atualiza dados do perfil
     */
    updateProfileData() {
        const elements = {
            'perfil-nome': this.userData.nome_completo || 'Nome não disponível',
            'perfil-cpf': this.formatCPF(),
            'nomeCompletoValor': this.userData.nome_completo || 'Nome não disponível'
        };

        Object.entries(elements).forEach(([id, value]) => {
            const element = document.getElementById(id);
            if (element) {
                element.textContent = value;
            }
        });
    }

    /**
     * Atualiza outros componentes que usam dados do usuário
     */
    updateOtherComponents() {
        // Atualizar formulários de empréstimo, cartão, etc.
        this.updateLoanForm();
        this.updateCardForm();
    }

    /**
     * Atualiza formulário de empréstimo
     */
    updateLoanForm() {
        const nomeCompleto = document.getElementById('nomeCompleto');
        if (nomeCompleto) {
            nomeCompleto.value = this.userData.nome_completo || 'Nome não disponível';
        }

        const cpfUsuario = document.getElementById('cpfUsuario');
        if (cpfUsuario) {
            cpfUsuario.value = this.formatCPF();
        }
    }

    /**
     * Atualiza formulário de cartão
     */
    updateCardForm() {
        // Implementar quando necessário
    }

    /**
     * Formata número da conta
     */
    formatAccountNumber() {
        if (this.userData.numero_conta && this.userData.digito_conta) {
            return `Conta: ${this.userData.numero_conta}-${this.userData.digito_conta}`;
        }
        return 'Conta: Não disponível';
    }

    /**
     * Formata CPF para exibição
     */
    formatCPF() {
        if (this.userData.cpf) {
            const cpf = this.userData.cpf.replace(/\D/g, '');
            if (cpf.length === 11) {
                return `CPF: ${cpf.replace(/(\d{3})(\d{3})(\d{3})(\d{2})/, '$1.$2.$3-$4')}`;
            }
        }
        return 'CPF: Não disponível';
    }

    /**
     * Configura event listeners para atualizações automáticas
     */
    setupEventListeners() {
        // Atualizar dados quando o usuário fizer login
        document.addEventListener('userLoggedIn', (event) => {
            this.userData = this.mergeWithExistingRelatedData(event.detail.userData);
            this.updateAllUserData();
            this.loadUserDataFromAPI();
        });

        // Atualizar dados quando o usuário fizer logout
        document.addEventListener('userLoggedOut', () => {
            this.userData = null;
            this.clearAllUserData();
        });

        // Atualizar dados quando houver mudanças no perfil
        document.addEventListener('profileUpdated', (event) => {
            this.userData = this.mergeWithExistingRelatedData({
                ...this.userData,
                ...event.detail.updatedData
            });
            this.updateAllUserData();
        });
    }

    /**
     * Limpa todos os dados do usuário da interface
     */
    clearAllUserData() {
        const elements = [
            'user-menu-fullname', 'user-menu-email', 'user-menu-account',
            'user-name', 'user-email', 'user-account',
            'perfil-nome', 'perfil-cpf', 'nomeCompletoValor',
            'wizDispNome', 'wizDispEmail', 'wizDispCpf', 'wizDispTel',
            'wizDispRua', 'wizDispBairro', 'wizDispCidadeUf', 'wizDispCep',
            'cartaoWizardRevisaoDl'
        ];

        elements.forEach(id => {
            const element = document.getElementById(id);
            if (element) {
                element.textContent = '—';
            }
        });
    }

    /**
     * Força atualização dos dados da API
     */
    async refreshUserData() {
        console.log('🔄 Forçando atualização dos dados do usuário...');
        return await this.loadUserDataFromAPI();
    }

    /**
     * Retorna dados atuais do usuário
     */
    getUserData() {
        return this.userData;
    }

    /**
     * Atualiza dados específicos do usuário
     */
    updateUserData(updatedData) {
        if (this.userData) {
            this.userData = this.mergeWithExistingRelatedData({ ...this.userData, ...updatedData });
            this.persistUserToStorage();
            this.updateAllUserData();
        }
    }
}

// Inicializar o gerenciador quando o DOM estiver carregado
document.addEventListener('DOMContentLoaded', () => {
    window.userDataManager = new UserDataManager();
});

// Exportar para uso em outros módulos
if (typeof module !== 'undefined' && module.exports) {
    module.exports = UserDataManager;
}
