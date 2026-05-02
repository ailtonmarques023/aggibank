/**
 * UserDataManager - Gerenciador Centralizado de Dados do Usuário
 * Responsável por carregar, atualizar e sincronizar dados do usuário em toda a aplicação
 */

class UserDataManager {
    constructor() {
        this.userData = null;
        this.apiBase = 'http://127.0.0.1:5000/api';
        this.init();
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
            const storedUser = sessionStorage.getItem('govbr_user') || localStorage.getItem('govbr_user');
            if (storedUser) {
                this.userData = JSON.parse(storedUser);
                console.log('✅ Dados do usuário carregados da sessão:', this.userData);
                this.updateAllUserData();
            } else {
                console.log('⚠️ Nenhum usuário logado encontrado');
            }
        } catch (error) {
            console.error('❌ Erro ao carregar dados do usuário:', error);
        }
    }

    /**
     * Carrega dados atualizados do usuário da API
     */
    async loadUserDataFromAPI() {
        try {
            const token = sessionStorage.getItem('govbr_token') || localStorage.getItem('govbr_token');
            if (!token) {
                console.log('⚠️ Token não encontrado');
                return null;
            }

            console.log('🔄 Carregando dados do usuário da API...');
            const response = await fetch(`${this.apiBase}/auth/me`, {
                method: 'GET',
                headers: {
                    'Authorization': `Bearer ${token}`,
                    'Content-Type': 'application/json'
                }
            });

            if (response.ok) {
                const data = await response.json();
                this.userData = data.user;
                
                // Salvar dados atualizados na sessão atual
                const userData = JSON.stringify(this.userData);
                sessionStorage.setItem('govbr_user', userData);
                localStorage.setItem('govbr_user', userData);
                
                console.log('✅ Dados do usuário atualizados da API:', this.userData);
                this.updateAllUserData();
                return this.userData;
            } else {
                console.error('❌ Erro ao carregar dados da API:', response.status);
                return null;
            }
        } catch (error) {
            console.error('❌ Erro na requisição da API:', error);
            return null;
        }
    }

    /**
     * Atualiza todos os elementos da interface com dados do usuário
     */
    updateAllUserData() {
        // DESABILITADO - Manter dados estáticos
        console.log('🚫 Atualização automática de dados desabilitada');
        return;
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
        // DESABILITADO - Manter dados estáticos
        console.log('🚫 Atualização de informações principais desabilitada');
        return;
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
            this.userData = event.detail.userData;
            this.updateAllUserData();
        });

        // Atualizar dados quando o usuário fizer logout
        document.addEventListener('userLoggedOut', () => {
            this.userData = null;
            this.clearAllUserData();
        });

        // Atualizar dados quando houver mudanças no perfil
        document.addEventListener('profileUpdated', (event) => {
            this.userData = { ...this.userData, ...event.detail.updatedData };
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
            'perfil-nome', 'perfil-cpf', 'nomeCompletoValor'
        ];

        elements.forEach(id => {
            const element = document.getElementById(id);
            if (element) {
                element.textContent = 'Carregando...';
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
            this.userData = { ...this.userData, ...updatedData };
            const userData = JSON.stringify(this.userData);
            sessionStorage.setItem('govbr_user', userData);
            localStorage.setItem('govbr_user', userData);
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
