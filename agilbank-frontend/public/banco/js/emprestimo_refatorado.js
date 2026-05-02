// FORMULÁRIO DE EMPRÉSTIMO REFATORADO - JAVASCRIPT

class EmprestimoForm {
    constructor() {
        this.currentSection = 1;
        this.totalSections = 4;
        this.formData = {};
        this.init();
    }

    init() {
        this.setupEventListeners();
        this.updateProgress();
        this.setupValidation();
        this.setupDateDisplay();
    }

    setupEventListeners() {
        // Navegação entre seções
        document.getElementById('btnProximo')?.addEventListener('click', () => this.nextSection());
        document.getElementById('btnAnterior')?.addEventListener('click', () => this.previousSection());
        
        // Campos dinâmicos
        document.getElementById('comprovacaoRenda')?.addEventListener('change', (e) => this.toggleComprovacaoRenda(e.target.value));
        document.getElementById('garantiasEmprestimo')?.addEventListener('change', (e) => this.toggleGarantias(e.target.value));
        
        // Validação em tempo real
        this.setupRealTimeValidation();
        
        // Envio do formulário
        document.getElementById('formEmprestimo')?.addEventListener('submit', (e) => this.handleSubmit(e));
    }

    setupValidation() {
        // Validação de CPF
        this.setupCPFValidation();
        
        // Validação de valores monetários
        this.setupMoneyValidation();
        
        // Validação de campos obrigatórios
        this.setupRequiredValidation();
    }

    setupCPFValidation() {
        const cpfField = document.getElementById('cpfUsuario');
        if (cpfField) {
            cpfField.addEventListener('input', (e) => {
                this.formatCPF(e.target);
                this.validateCPF(e.target);
            });
        }
    }

    setupMoneyValidation() {
        const moneyField = document.getElementById('rendaMensalDeclarada');
        if (moneyField) {
            moneyField.addEventListener('input', (e) => {
                this.formatMoney(e.target);
                this.validateMoney(e.target);
            });
        }
    }

    setupRequiredValidation() {
        const requiredFields = document.querySelectorAll('.form-label.required');
        requiredFields.forEach(label => {
            const field = document.getElementById(label.getAttribute('for'));
            if (field) {
                field.addEventListener('blur', () => this.validateField(field));
            }
        });
    }

    setupRealTimeValidation() {
        const inputs = document.querySelectorAll('.form-input, .form-select');
        inputs.forEach(input => {
            input.addEventListener('input', () => this.clearError(input));
            input.addEventListener('blur', () => this.validateField(input));
        });
    }

    setupDateDisplay() {
        const dataProposta = document.getElementById('dataProposta');
        if (dataProposta) {
            const now = new Date();
            const options = { 
                day: '2-digit', 
                month: '2-digit', 
                year: 'numeric',
                hour: '2-digit',
                minute: '2-digit'
            };
            dataProposta.textContent = now.toLocaleDateString('pt-BR', options);
        }
    }

    // Navegação entre seções
    nextSection() {
        if (this.validateCurrentSection()) {
            if (this.currentSection < this.totalSections) {
                this.currentSection++;
                this.updateSections();
                this.updateProgress();
                this.updateButtons();
            }
        }
    }

    previousSection() {
        if (this.currentSection > 1) {
            this.currentSection--;
            this.updateSections();
            this.updateProgress();
            this.updateButtons();
        }
    }

    updateSections() {
        const sections = document.querySelectorAll('.form-section');
        sections.forEach((section, index) => {
            if (index + 1 === this.currentSection) {
                section.classList.add('active');
            } else {
                section.classList.remove('active');
            }
        });
    }

    updateProgress() {
        const steps = document.querySelectorAll('.step');
        steps.forEach((step, index) => {
            step.classList.remove('active', 'completed');
            if (index + 1 < this.currentSection) {
                step.classList.add('completed');
            } else if (index + 1 === this.currentSection) {
                step.classList.add('active');
            }
        });
    }

    updateButtons() {
        const btnAnterior = document.getElementById('btnAnterior');
        const btnProximo = document.getElementById('btnProximo');
        const btnEnviar = document.getElementById('enviarPropostaEmprestimo');

        if (this.currentSection === 1) {
            btnAnterior.style.display = 'none';
        } else {
            btnAnterior.style.display = 'inline-flex';
        }

        if (this.currentSection === this.totalSections) {
            btnProximo.style.display = 'none';
            btnEnviar.style.display = 'inline-flex';
        } else {
            btnProximo.style.display = 'inline-flex';
            btnEnviar.style.display = 'none';
        }
    }

    // Campos dinâmicos
    toggleComprovacaoRenda(value) {
        const container = document.getElementById('campoComprovacaoRenda');
        const fields = container?.querySelectorAll('.form-group[id^="campo"]');
        
        // Esconder todos os campos
        fields?.forEach(field => field.style.display = 'none');
        
        // Mostrar campo específico
        if (value && container) {
            container.style.display = 'block';
            const specificField = document.getElementById(`campo${value.charAt(0).toUpperCase() + value.slice(1)}`);
            if (specificField) {
                specificField.style.display = 'block';
            }
        } else {
            container.style.display = 'none';
        }
    }

    toggleGarantias(value) {
        const container = document.getElementById('campoComprovacaoGarantias');
        const fields = container?.querySelectorAll('.form-group[id^="campo"]');
        
        // Esconder todos os campos
        fields?.forEach(field => field.style.display = 'none');
        
        // Mostrar campo específico
        if (value && container) {
            container.style.display = 'block';
            const specificField = document.getElementById(`campo${value.charAt(0).toUpperCase() + value.slice(1)}`);
            if (specificField) {
                specificField.style.display = 'block';
            }
        } else {
            container.style.display = 'none';
        }
    }

    // Validações
    validateCurrentSection() {
        const currentSectionElement = document.querySelector(`.form-section[data-section="${this.currentSection}"]`);
        const requiredFields = currentSectionElement?.querySelectorAll('.form-label.required');
        let isValid = true;

        requiredFields?.forEach(label => {
            const field = document.getElementById(label.getAttribute('for'));
            if (field && !this.validateField(field)) {
                isValid = false;
            }
        });

        return isValid;
    }

    validateField(field) {
        const value = field.value.trim();
        const fieldName = field.id;
        let isValid = true;
        let errorMessage = '';

        // Validação de campos obrigatórios
        if (field.closest('.form-label.required') && !value) {
            isValid = false;
            errorMessage = 'Este campo é obrigatório';
        }

        // Validações específicas
        switch (fieldName) {
            case 'cpfUsuario':
                if (value && !this.isValidCPF(value)) {
                    isValid = false;
                    errorMessage = 'CPF inválido';
                }
                break;
            case 'rendaMensalDeclarada':
                if (value && !this.isValidMoney(value)) {
                    isValid = false;
                    errorMessage = 'Valor inválido';
                }
                break;
            case 'aceitarTermosEmprestimo':
                if (!field.checked) {
                    isValid = false;
                    errorMessage = 'Você deve aceitar os termos e condições';
                }
                break;
        }

        this.showFieldError(field, isValid, errorMessage);
        return isValid;
    }

    showFieldError(field, isValid, message) {
        const errorElement = document.getElementById(`error-${field.id}`);
        
        if (errorElement) {
            if (isValid) {
                errorElement.classList.remove('show');
                field.classList.remove('error');
            } else {
                errorElement.textContent = message;
                errorElement.classList.add('show');
                field.classList.add('error');
            }
        }
    }

    clearError(field) {
        const errorElement = document.getElementById(`error-${field.id}`);
        if (errorElement) {
            errorElement.classList.remove('show');
            field.classList.remove('error');
        }
    }

    // Validações específicas
    isValidCPF(cpf) {
        cpf = cpf.replace(/\D/g, '');
        if (cpf.length !== 11) return false;
        
        // Validação do algoritmo do CPF
        let sum = 0;
        for (let i = 0; i < 9; i++) {
            sum += parseInt(cpf.charAt(i)) * (10 - i);
        }
        let remainder = (sum * 10) % 11;
        if (remainder === 10 || remainder === 11) remainder = 0;
        if (remainder !== parseInt(cpf.charAt(9))) return false;

        sum = 0;
        for (let i = 0; i < 10; i++) {
            sum += parseInt(cpf.charAt(i)) * (11 - i);
        }
        remainder = (sum * 10) % 11;
        if (remainder === 10 || remainder === 11) remainder = 0;
        if (remainder !== parseInt(cpf.charAt(10))) return false;

        return true;
    }

    isValidMoney(value) {
        const moneyRegex = /^R?\$?\s?[\d.,]+$/;
        return moneyRegex.test(value);
    }

    // Formatação
    formatCPF(field) {
        let value = field.value.replace(/\D/g, '');
        value = value.replace(/(\d{3})(\d)/, '$1.$2');
        value = value.replace(/(\d{3})(\d)/, '$1.$2');
        value = value.replace(/(\d{3})(\d{1,2})$/, '$1-$2');
        field.value = value;
    }

    formatMoney(field) {
        let value = field.value.replace(/\D/g, '');
        value = (parseInt(value) / 100).toLocaleString('pt-BR', {
            minimumFractionDigits: 2,
            maximumFractionDigits: 2
        });
        field.value = value;
    }

    // Envio do formulário
    async handleSubmit(e) {
        e.preventDefault();
        
        if (!this.validateCurrentSection()) {
            return;
        }

        // Coletar dados do formulário
        const formData = this.collectFormData();
        
        // Mostrar loading
        this.showLoading();
        
        try {
            // Simular envio para API
            await this.submitToAPI(formData);
            
            // Sucesso
            this.showSuccess();
            
        } catch (error) {
            // Erro
            this.showError(error.message);
        } finally {
            this.hideLoading();
        }
    }

    collectFormData() {
        const form = document.getElementById('formEmprestimo');
        const formData = new FormData(form);
        const data = {};
        
        for (let [key, value] of formData.entries()) {
            data[key] = value;
        }
        
        return data;
    }

    async submitToAPI(data) {
        // Simular delay da API
        await new Promise(resolve => setTimeout(resolve, 3000));
        
        // Aqui você faria a requisição real para a API
        console.log('Dados enviados:', data);
        
        // Simular resposta de sucesso
        return { success: true, message: 'Proposta enviada com sucesso!' };
    }

    showLoading() {
        const loading = document.getElementById('emprestimoLoading');
        if (loading) {
            loading.style.display = 'flex';
            this.animateLoadingMessages();
        }
    }

    hideLoading() {
        const loading = document.getElementById('emprestimoLoading');
        if (loading) {
            loading.style.display = 'none';
        }
    }

    animateLoadingMessages() {
        const messages = document.querySelectorAll('.loading-message');
        let currentIndex = 0;
        
        const interval = setInterval(() => {
            messages.forEach(msg => msg.classList.remove('active'));
            messages[currentIndex].classList.add('active');
            currentIndex = (currentIndex + 1) % messages.length;
        }, 1000);
        
        // Parar animação após 10 segundos
        setTimeout(() => clearInterval(interval), 10000);
    }

    showSuccess() {
        alert('Proposta de empréstimo enviada com sucesso!');
        // Aqui você poderia redirecionar ou mostrar uma tela de sucesso
    }

    showError(message) {
        alert(`Erro ao enviar proposta: ${message}`);
    }
}

// Função para limpar completamente o formulário original
function limparFormularioOriginal() {
    console.log('🧹 Limpando formulário original...');
    
    // Remover todos os event listeners do JavaScript original
    const comprovacaoRenda = document.getElementById('comprovacaoRenda');
    const garantiasEmprestimo = document.getElementById('garantiasEmprestimo');
    
    // Verificar se os elementos existem antes de tentar remover listeners
    if (comprovacaoRenda) {
        // Clonar o elemento para remover todos os event listeners
        const newComprovacaoRenda = comprovacaoRenda.cloneNode(true);
        comprovacaoRenda.parentNode.replaceChild(newComprovacaoRenda, comprovacaoRenda);
    }
    if (garantiasEmprestimo) {
        // Clonar o elemento para remover todos os event listeners
        const newGarantiasEmprestimo = garantiasEmprestimo.cloneNode(true);
        garantiasEmprestimo.parentNode.replaceChild(newGarantiasEmprestimo, garantiasEmprestimo);
    }
    
    // Esconder todos os elementos do formulário original
    const elementosOriginais = [
        '.data-proposta-container',
        '.data-proposta-label', 
        '.data-proposta-display',
        '.formGroup-Dados',
        '.formGroup-Dadosemprestimo',
        '.formGroup-Dados-garantias',
        '.campo-comprovacao-emprestimo',
        '.campo-comprovacao-garantia',
        '.termos-containeremprestimo',
        '.checkbox-containeremprestimo',
        '.btn-enviar-proposta'
    ];
    
    elementosOriginais.forEach(seletor => {
        const elementos = document.querySelectorAll(seletor);
        elementos.forEach(el => {
            if (el && !el.closest('.emprestimo-header') && !el.closest('.form-section')) {
                el.style.display = 'none';
                el.style.visibility = 'hidden';
            }
        });
    });
}

// Função para inicializar o formulário refatorado
function inicializarFormularioRefatorado() {
    console.log('🚀 Inicializando formulário refatorado...');
    
    // Primeiro, limpar o formulário original
    limparFormularioOriginal();
    
    // Verificar se o formulário existe e tem a estrutura refatorada
    const formulario = document.getElementById('emprestimoFormulario');
    const progressIndicator = document.querySelector('.progress-indicator');
    
    if (formulario && progressIndicator) {
        console.log('✅ Formulário refatorado encontrado, inicializando...');
        
        // Garantir que o header refatorado seja exibido
        const headerRefatorado = document.querySelector('.emprestimo-header');
        if (headerRefatorado) {
            headerRefatorado.style.display = 'block';
        }
        
        // Garantir que as seções refatoradas sejam exibidas
        const secoesRefatoradas = document.querySelectorAll('.form-section');
        secoesRefatoradas.forEach(secao => {
            secao.style.display = 'none'; // Será controlado pelo JavaScript
        });
        
        // Mostrar apenas a primeira seção
        const primeiraSecao = document.querySelector('.form-section[data-section="1"]');
        if (primeiraSecao) {
            primeiraSecao.style.display = 'block';
            primeiraSecao.classList.add('active');
        }
        
        // Inicializar o formulário refatorado
        new EmprestimoForm();
        window.emprestimoFormInitialized = true;
        
        console.log('✅ Formulário refatorado inicializado com sucesso!');
    } else {
        console.log('❌ Formulário refatorado não encontrado ou estrutura incorreta');
        console.log('Formulário:', formulario);
        console.log('Progress Indicator:', progressIndicator);
    }
}

// Inicializar quando o DOM estiver carregado
document.addEventListener('DOMContentLoaded', function() {
    // Aguardar um pouco para garantir que outros scripts tenham carregado
    setTimeout(inicializarFormularioRefatorado, 100);
});

// Também tentar inicializar quando a página estiver completamente carregada
window.addEventListener('load', function() {
    if (!window.emprestimoFormInitialized) {
        setTimeout(inicializarFormularioRefatorado, 200);
    }
});

// Função para mostrar formulário de empréstimo (substituindo a original)
function mostrarFormularioEmprestimo() {
    console.log('🚀 Mostrando formulário de empréstimo refatorado...');
    
    // Esconder outros containers
    const containers = ['emprestimoContent', 'infoBoxs-Dados'];
    containers.forEach(id => {
        const element = document.getElementById(id);
        if (element) {
            element.style.display = 'none';
        }
    });
    
    // Mostrar o formulário refatorado
    const formulario = document.getElementById('emprestimoFormulario');
    if (formulario) {
        formulario.style.display = 'block';
        console.log('✅ Formulário refatorado exibido');
        
        // Inicializar o formulário refatorado
        setTimeout(() => {
            inicializarFormularioRefatorado();
        }, 100);
    } else {
        console.log('❌ Formulário não encontrado');
    }
}

// Substituir a função global
window.mostrarFormularioEmprestimo = mostrarFormularioEmprestimo;
