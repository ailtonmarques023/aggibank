// Formulário de Abertura de Conta - JavaScript Básico
class FormularioConta {
    constructor() {
        this.currentStep = 1;
        this.totalSteps = 4;
        this.formData = {};
        this.init();
    }

    init() {
        console.log('Inicializando FormularioConta...');
        try {
            this.initializeProgress();
            this.updateProgress();
            this.bindEvents();
            console.log('FormularioConta inicializado (sem mostrar automaticamente)');
        } catch (error) {
            console.error('Erro na inicialização:', error);
            throw error;
        }
    }

    initializeProgress() {
        const progressFill = document.getElementById('contaProgressFill');
        if (progressFill) {
            progressFill.style.width = '0%';
            console.log('Barra de progresso inicializada em 0%');
        }
    }

    bindEvents() {
        console.log('Vinculando eventos...');
        try {
            const backBtn = document.getElementById('contaBackBtn');
            const nextBtn = document.getElementById('contaNextBtn');
            const prevBtn = document.getElementById('contaPrevBtn');
            const submitBtn = document.getElementById('contaSubmitBtn');
            
            if (backBtn) {
                backBtn.addEventListener('click', () => this.closeForm());
            }
            
            if (nextBtn) {
                nextBtn.addEventListener('click', () => this.nextStep());
            }
            
            if (prevBtn) {
                prevBtn.addEventListener('click', () => this.prevStep());
            }
            
            if (submitBtn) {
                submitBtn.addEventListener('click', () => this.submitForm());
            }
            
            console.log('Eventos vinculados com sucesso');
        } catch (error) {
            console.error('Erro ao vincular eventos:', error);
        }
    }

    showStep(step) {
        console.log(`Mostrando passo ${step}...`);
        this.currentStep = step;
        
        // Esconder todas as seções
        const sections = document.querySelectorAll('.conta-form-section');
        sections.forEach(section => {
            section.classList.remove('active');
        });
        
        // Mostrar a seção atual
        const currentSection = document.querySelector(`[data-section="${step}"]`);
        if (currentSection) {
            currentSection.classList.add('active');
        }
        
        this.updateProgress();
        this.updateButtons();
        
        // Se for o passo 4, atualizar a confirmação
        if (step === 4) {
            this.updateConfirmation();
        }
    }

    updateProgress() {
        const progressFill = document.getElementById('contaProgressFill');
        const steps = document.querySelectorAll('.conta-step');
        
        if (progressFill) {
            const progress = (this.currentStep / this.totalSteps) * 100;
            progressFill.style.width = `${progress}%`;
        }
        
        steps.forEach((step, index) => {
            const stepNumber = index + 1;
            step.classList.remove('active', 'completed');
            
            if (stepNumber < this.currentStep) {
                step.classList.add('completed');
            } else if (stepNumber === this.currentStep) {
                step.classList.add('active');
            }
        });
    }

    updateButtons() {
        const prevBtn = document.getElementById('contaPrevBtn');
        const nextBtn = document.getElementById('contaNextBtn');
        const submitBtn = document.getElementById('contaSubmitBtn');
        
        if (prevBtn) {
            prevBtn.style.display = this.currentStep > 1 ? 'block' : 'none';
        }
        
        if (nextBtn) {
            nextBtn.style.display = this.currentStep < this.totalSteps ? 'block' : 'none';
        }
        
        if (submitBtn) {
            submitBtn.style.display = this.currentStep === this.totalSteps ? 'block' : 'none';
            
            // Se estamos no último passo, verificar se pode habilitar o botão
            if (this.currentStep === this.totalSteps) {
                this.checkIfCanSubmit();
            }
        }
    }

    checkIfCanSubmit() {
        const submitBtn = document.getElementById('contaSubmitBtn');
        if (!submitBtn) return;
        
        // Verificar se todos os documentos foram enviados
        const documentosObrigatorios = ['contaDocumento', 'contaComprovante', 'contaRosto'];
        const todosDocumentosEnviados = documentosObrigatorios.every(id => {
            const input = document.getElementById(id);
            return input && input.files && input.files.length > 0;
        });
        
        // Verificar se os termos foram aceitos
        const termosAceitos = document.getElementById('contaTermos');
        const politicaAceita = document.getElementById('contaPolitica');
        const termosOk = termosAceitos && termosAceitos.checked && politicaAceita && politicaAceita.checked;
        
        // Habilitar/desabilitar botão baseado na validação
        if (todosDocumentosEnviados && termosOk) {
            submitBtn.disabled = false;
            submitBtn.style.opacity = '1';
            submitBtn.style.cursor = 'pointer';
            console.log('✅ Botão "Criar Conta" habilitado - todos os requisitos atendidos');
        } else {
            submitBtn.disabled = true;
            submitBtn.style.opacity = '0.6';
            submitBtn.style.cursor = 'not-allowed';
            console.log('⚠️ Botão "Criar Conta" desabilitado - requisitos não atendidos');
        }
    }

    nextStep() {
        console.log('🚀 Tentando avançar do passo', this.currentStep);
        
        if (this.validateCurrentStep()) {
            if (this.currentStep < this.totalSteps) {
                this.currentStep++;
                this.updateProgress();
                this.updateButtons();
                this.updateStepDisplay();
                console.log('✅ Passou para o passo', this.currentStep);
            } else {
                console.log('🏁 Já está no último passo');
            }
        } else {
            console.log('❌ Validação falhou, não pode avançar');
        }
    }

    prevStep() {
        if (this.currentStep > 1) {
            this.currentStep--;
            this.updateProgress();
            this.updateButtons();
            this.updateStepDisplay();
        }
    }

    validateCurrentStep() {
        console.log('🔍 Validando passo', this.currentStep);
        
        if (this.currentStep === 1) {
            const requiredFields = [
                { id: 'contaNome', nome: 'Nome' },
                { id: 'contaCpf', nome: 'CPF' },
                { id: 'contaDataNascimento', nome: 'Data de Nascimento' },
                { id: 'contaSexo', nome: 'Sexo' },
                { id: 'contaEmail', nome: 'Email' },
                { id: 'contaTelefone', nome: 'Telefone' },
                { id: 'contaSenha', nome: 'Senha' },
                { id: 'contaConfirmarSenha', nome: 'Confirmar Senha' }
            ];
            
            const camposFaltando = [];

            for (const field of requiredFields) {
                const element = document.getElementById(field.id);
                if (element && !element.value.trim()) {
                    camposFaltando.push(field.nome);
                }
            }

            if (camposFaltando.length > 0) {
                const mensagem = `❌ Campos obrigatórios não preenchidos:\n• ${camposFaltando.join('\n• ')}`;
                alert(mensagem);
                console.log('❌ Campos obrigatórios vazios:', camposFaltando);
                return false;
            }

            console.log('✅ Todos os campos obrigatórios preenchidos');
            return true;
        }

        if (this.currentStep === 2) {
            const requiredFields = [
                { id: 'contaCep', nome: 'CEP' },
                { id: 'contaEndereco', nome: 'Endereço' },
                { id: 'contaNumero', nome: 'Número' },
                { id: 'contaBairro', nome: 'Bairro' },
                { id: 'contaCidade', nome: 'Cidade' },
                { id: 'contaEstado', nome: 'Estado' },
                { id: 'contaTempoResidencia', nome: 'Tempo de Residência' }
            ];
            
            const camposFaltando = [];

            // Verificar se tipo de endereço foi selecionado
            const tipoEndereco = document.querySelector('input[name="contaTipoEndereco"]:checked');
            if (!tipoEndereco) {
                camposFaltando.push('Tipo de Endereço');
            }

            for (const field of requiredFields) {
                const element = document.getElementById(field.id);
                if (element && !element.value.trim()) {
                    camposFaltando.push(field.nome);
                }
            }

            if (camposFaltando.length > 0) {
                const mensagem = `❌ Campos obrigatórios não preenchidos:\n• ${camposFaltando.join('\n• ')}`;
                alert(mensagem);
                console.log('❌ Campos obrigatórios vazios:', camposFaltando);
                return false;
            }

            console.log('✅ Todos os campos de endereço preenchidos');
            return true;
        }

        if (this.currentStep === 3) {
            const requiredFields = [
                { id: 'contaProfissao', nome: 'Profissão' },
                { id: 'contaRenda', nome: 'Renda' },
                { id: 'contaEmpresa', nome: 'Empresa' },
                { id: 'contaCargo', nome: 'Cargo' }
            ];
            
            const camposFaltando = [];

            for (const field of requiredFields) {
                const element = document.getElementById(field.id);
                if (element && !element.value.trim()) {
                    camposFaltando.push(field.nome);
                }
            }

            if (camposFaltando.length > 0) {
                const mensagem = `❌ Campos obrigatórios não preenchidos:\n• ${camposFaltando.join('\n• ')}`;
                alert(mensagem);
                console.log('❌ Campos obrigatórios vazios:', camposFaltando);
                return false;
            }

            console.log('✅ Todos os campos profissionais preenchidos');
            return true;
        }

        if (this.currentStep === 4) {
            // Verificar se todos os documentos obrigatórios foram enviados
            const documentosObrigatorios = [
                { id: 'contaDocumento', nome: 'Documento de Identidade' },
                { id: 'contaComprovante', nome: 'Comprovante de Residência' },
                { id: 'contaRosto', nome: 'Foto do Rosto' }
            ];
            
            const documentosFaltando = [];

            for (const doc of documentosObrigatorios) {
                const input = document.getElementById(doc.id);
                if (!input || !input.files || input.files.length === 0) {
                    documentosFaltando.push(doc.nome);
                }
            }

            // Verificar se os termos foram aceitos
            const termosAceitos = document.getElementById('contaTermos');
            const politicaAceita = document.getElementById('contaPolitica');
            
            if (!termosAceitos || !termosAceitos.checked) {
                alert('❌ Você deve aceitar os Termos e Condições de Uso para continuar.');
                return false;
            }
            
            if (!politicaAceita || !politicaAceita.checked) {
                alert('❌ Você deve aceitar a Política de Privacidade para continuar.');
                return false;
            }

            if (documentosFaltando.length > 0) {
                const mensagem = `❌ Documentos obrigatórios não enviados:\n• ${documentosFaltando.join('\n• ')}\n\nPor favor, envie todos os documentos antes de continuar.`;
                alert(mensagem);
                console.log('❌ Documentos obrigatórios não enviados:', documentosFaltando);
                return false;
            }

            console.log('✅ Todos os documentos foram enviados e termos aceitos');
            return true;
        }

        return true;
    }

    updateStepDisplay() {
        // Esconder todas as seções
        for (let i = 1; i <= this.totalSteps; i++) {
            const section = document.getElementById(`contaStep${i}`);
            if (section) {
                section.style.display = 'none';
            }
        }

        // Mostrar seção atual
        const currentSection = document.getElementById(`contaStep${this.currentStep}`);
        if (currentSection) {
            currentSection.style.display = 'block';
            console.log('✅ Mostrando seção', this.currentStep);
        }
    }

    async submitForm() {
        console.log('🚀 Iniciando criação da conta...');
        this.showLoading();
        
        try {
            // Passo 1: Validar dados
            this.updateLoadingStep(1, 'active');
            const formData = this.collectFormData();
            
            if (!this.validateFormData(formData)) {
                throw new Error('Dados do formulário inválidos');
            }
            
            this.updateLoadingStep(1, 'completed');
            this.updateLoadingStep(2, 'active');
            console.log('📊 Dados do formulário coletados para cadastro');
            
            // Passo 2: Criar usuário no banco de dados
            const userResult = await this.createUserInDatabase(formData);
            console.log('✅ Usuário criado no banco');
            
            this.updateLoadingStep(2, 'completed');
            this.updateLoadingStep(3, 'active');
            
            // Passo 3: Enviar email de confirmação
            try {
                await this.sendConfirmationEmail(formData.email, userResult.userId);
                console.log('📧 Email de confirmação enviado');
            } catch (emailError) {
                console.warn('⚠️ Erro ao enviar email (continuando):', emailError);
                // Continua mesmo se o email falhar
            }
            
            this.updateLoadingStep(3, 'completed');
            this.updateLoadingStep(4, 'active');
            
            // Passo 4: Finalizar
            setTimeout(() => {
                this.updateLoadingStep(4, 'completed');
                setTimeout(() => {
                    console.log('🎯 Finalizando processo - escondendo loading...');
                    this.hideLoading();
                    console.log('🎯 Mostrando mensagem de sucesso...');
                    this.showEmailConfirmationMessage(formData.email);
                }, 1000);
            }, 500);
            
        } catch (error) {
            console.error('❌ Erro ao criar conta:', error);
            this.hideLoading();
            this.showErrorMessage(error.message);
        }
    }
    
    collectFormData() {
        const senhaElement = document.getElementById('contaSenha');
        const senhaValue = senhaElement?.value || '';
        
        return {
            // Dados pessoais
            nome: (document.getElementById('contaNome') || document.getElementById('contaNomeCompleto'))?.value || '',
            cpf: document.getElementById('contaCpf')?.value || '',
            email: document.getElementById('contaEmail')?.value || '',
            telefone: document.getElementById('contaTelefone')?.value || '',
            dataNascimento: (document.getElementById('contaDataNasc') || document.getElementById('contaDataNascimento'))?.value || '',
            senha: senhaValue,
            
            // Endereço
            cep: document.getElementById('contaCep')?.value || '',
            endereco: (document.getElementById('contaEndereco') || document.getElementById('contaRua'))?.value || '',
            numero: document.getElementById('contaNumero')?.value || '',
            complemento: document.getElementById('contaComplemento')?.value || '',
            bairro: document.getElementById('contaBairro')?.value || '',
            cidade: document.getElementById('contaCidade')?.value || '',
            estado: document.getElementById('contaEstado')?.value || '',
            
            // Dados profissionais
            profissao: document.getElementById('contaProfissao')?.value || '',
            renda: document.getElementById('contaRenda')?.value || '',
            empresa: document.getElementById('contaEmpresa')?.value || '',
            cargo: document.getElementById('contaCargo')?.value || '',
            
            // Documentos
            documentos: {
                identidade: this.getDocumentData('contaDocumento'),
                comprovante: this.getDocumentData('contaComprovante'),
                rosto: this.getDocumentData('contaRosto')
            },
            
            // Termos
            aceitaTermos: document.getElementById('contaTermos')?.checked || false,
            aceitaComunicacoes: document.getElementById('contaComunicacoes')?.checked || false,
            aceitaPolitica: document.getElementById('contaPolitica')?.checked || false
        };
    }
    
    getDocumentData(inputId) {
        const input = document.getElementById(inputId);
        if (input && input.files && input.files.length > 0) {
            return {
                fileName: input.files[0].name,
                fileSize: input.files[0].size,
                fileType: input.files[0].type,
                uploaded: true
            };
        }
        return { uploaded: false };
    }
    
    validateFormData(data) {
        console.log('🔍 Validando dados do formulário');
        
        const required = ['nome', 'cpf', 'email', 'telefone', 'dataNascimento', 'senha', 'cep', 'endereco', 'numero', 'bairro', 'cidade', 'estado', 'profissao', 'renda'];
        
        for (const field of required) {
            const value = data[field];
            if (!value || (typeof value === 'string' && value.trim() === '')) {
                console.error(`❌ Campo obrigatório vazio: ${field}`);
                return false;
            }
        }
        
        if (!data.aceitaTermos || !data.aceitaPolitica) {
            console.error('❌ Termos não aceitos');
            return false;
        }
        
        if (!data.documentos.identidade.uploaded || !data.documentos.comprovante.uploaded || !data.documentos.rosto.uploaded) {
            console.error('❌ Documentos não enviados');
            return false;
        }
        
        console.log('✅ Todos os dados válidos');
        return true;
    }
    
    async createUserInDatabase(formData) {
        try {
            console.log('💾 Enviando dados para o banco de dados...');
            
            const onlyDigits = (value) => String(value || '').replace(/\D/g, '');
            const rendaMensal = String(formData.renda || '').replace(/\./g, '').replace(',', '.').replace(/[^\d.]/g, '');

            // Preparar dados para o contrato de /api/auth/register
            const userData = {
                nomeCompleto: formData.nome,
                email: formData.email,
                cpf: onlyDigits(formData.cpf),
                telefone: onlyDigits(formData.telefone),
                dataNascimento: formData.dataNascimento,
                senha: formData.senha,
                endereco: {
                    cep: formData.cep,
                    logradouro: formData.endereco,
                    numero: formData.numero,
                    complemento: formData.complemento,
                    bairro: formData.bairro,
                    cidade: formData.cidade,
                    estado: formData.estado
                },
                dadosProfissionais: {
                    profissao: formData.profissao,
                    empresa: formData.empresa,
                    cargo: formData.cargo,
                    rendaMensal
                }
            };

            // Fazer chamada real para a API
            const response = await fetch('https://aggibank-production.up.railway.app/api/auth/register', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify(userData)
            });

            if (!response.ok) {
                const errorData = await response.json();
                throw new Error(errorData.message || 'Erro ao criar usuário no banco de dados');
            }

            const result = await response.json();
            console.log('✅ Usuário criado no banco');
            
            return {
                userId: result.userId || result.data?.user?.id,
                status: 'created',
                message: 'Usuário criado com sucesso no banco de dados',
                data: result
            };

        } catch (error) {
            console.error('❌ Erro ao criar usuário:', error);
            throw new Error(`Falha ao criar usuário: ${error.message}`);
        }
    }
    
    async sendConfirmationEmail(email, userId) {
        try {
            console.log('📧 Enviando email de confirmação...');
            
            // Fazer chamada real para o serviço de email
            const response = await fetch('https://aggibank-production.up.railway.app/api/email/confirmacao', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${this.getAuthToken()}`
                },
                body: JSON.stringify({
                    email: email,
                    userId: userId,
                    tipo: 'confirmacao_conta'
                })
            });

            if (!response.ok) {
                const errorData = await response.json();
                throw new Error(errorData.message || 'Erro ao enviar email de confirmação');
            }

            const result = await response.json();
            console.log('✅ Email enviado');
            
            return {
                status: 'sent',
                message: `Email de confirmação enviado para ${email}`,
                emailId: result.emailId,
                data: result
            };

        } catch (error) {
            console.error('❌ Erro ao enviar email:', error);
            throw new Error(`Falha ao enviar email: ${error.message}`);
        }
    }
    
    getAuthToken() {
        // Obter token de autenticação (se necessário)
        return localStorage.getItem('authToken') || 'anonymous';
    }
    
    showEmailConfirmationMessage(email) {
        console.log('📧 showEmailConfirmationMessage chamada');
        
        // Mostrar mensagem de sucesso com instruções sobre o email
        const successMessage = `
            <div class="conta-content">
                <div class="conta-header">
                    <div class="conta-logo">
                        <i class="fas fa-university"></i>
                        <span>AgilBank</span>
                    </div>
                </div>
                
                <div class="conta-form-container">
                    <div class="conta-success-message">
                        <div class="conta-success-icon">
                            <i class="fas fa-check-circle"></i>
                        </div>
                        <h2>Conta Criada com Sucesso!</h2>
                        <p class="conta-success-text">Enviamos um email de confirmação para:</p>
                        <div class="conta-email-highlight">${email}</div>
                        <p class="conta-success-instructions">Verifique sua caixa de entrada e clique no link de confirmação para ativar sua conta.</p>
                        <p class="conta-spam-warning">
                            <i class="fas fa-exclamation-triangle"></i>
                            <strong>Importante:</strong> Se não encontrar o email, verifique também sua caixa de spam/lixo eletrônico.
                        </p>
                        
                        <div class="conta-success-actions">
                            <button class="conta-login-btn" onclick="window.location.href='../index.agilbank.html'">
                                Entrar
                            </button>
                        </div>
                        
                        <div class="conta-redirect-countdown">
                            <i class="fas fa-clock"></i>
                            Redirecionando automaticamente em <span id="redirectTimer">10</span> segundos...
                        </div>
                    </div>
                </div>
            </div>
        `;
        
        // Substituir o conteúdo do formulário
        const formContainer = document.querySelector('#contaContainer');
        console.log('🔍 formContainer encontrado:', formContainer);
        
        if (formContainer) {
            console.log('✅ Substituindo conteúdo do formulário...');
            formContainer.innerHTML = successMessage;
            
            // Iniciar contador regressivo para redirecionamento
            console.log('⏰ Iniciando contador de redirecionamento...');
            this.startRedirectCountdown();
        } else {
            console.error('❌ formContainer não encontrado!');
        }
    }
    
    startRedirectCountdown() {
        console.log('⏰ startRedirectCountdown iniciado');
        let countdown = 10;
        const timerElement = document.getElementById('redirectTimer');
        console.log('🔍 timerElement encontrado:', timerElement);
        
        const countdownInterval = setInterval(() => {
            countdown--;
            console.log('⏰ Contador:', countdown);
            
            if (timerElement) {
                timerElement.textContent = countdown;
            }
            
            if (countdown <= 0) {
                clearInterval(countdownInterval);
                console.log('🚀 Redirecionando para login...');
               // Redirecionar para a tela de login
               window.location.href = '../index.agilbank.html';
            }
        }, 1000);
    }
    
    showErrorMessage(message) {
        alert(`❌ Erro ao criar conta: ${message}\n\nPor favor, tente novamente ou entre em contato com o suporte.`);
    }

    showLoading() {
        // Criar tela de carregamento
        const loadingScreen = document.createElement('div');
        loadingScreen.className = 'conta-loading-screen';
        loadingScreen.id = 'contaLoadingScreen';
        
        loadingScreen.innerHTML = `
            <div class="conta-loading-container">
                <div class="conta-loading-spinner"></div>
                <h2 class="conta-loading-title">Criando sua conta...</h2>
                <p class="conta-loading-message">
                    Estamos processando seus dados e criando sua conta no AgilBank.<br>
                    Isso pode levar alguns segundos.
                </p>
                <div class="conta-loading-steps">
                    <div class="conta-loading-step active" id="step1">
                        <i class="fas fa-check-circle"></i>
                        Validando dados do formulário
                    </div>
                    <div class="conta-loading-step" id="step2">
                        <i class="fas fa-spinner fa-spin"></i>
                        Criando usuário no banco de dados
                    </div>
                    <div class="conta-loading-step" id="step3">
                        <i class="fas fa-envelope"></i>
                        Enviando email de confirmação
                    </div>
                    <div class="conta-loading-step" id="step4">
                        <i class="fas fa-check"></i>
                        Finalizando processo
                    </div>
                </div>
            </div>
        `;
        
        document.body.appendChild(loadingScreen);
        
        // Animar os passos
        setTimeout(() => this.updateLoadingStep(1, 'completed'), 500);
        setTimeout(() => this.updateLoadingStep(2, 'active'), 1000);
    }
    
    updateLoadingStep(stepNumber, status) {
        const step = document.getElementById(`step${stepNumber}`);
        if (step) {
            step.className = `conta-loading-step ${status}`;
            
            if (status === 'active') {
                step.innerHTML = `<i class="fas fa-spinner fa-spin"></i> ${step.textContent.replace(/^[^a-zA-Z]*/, '')}`;
            } else if (status === 'completed') {
                step.innerHTML = `<i class="fas fa-check-circle"></i> ${step.textContent.replace(/^[^a-zA-Z]*/, '')}`;
            }
        }
    }

    hideLoading() {
        const loadingScreen = document.getElementById('contaLoadingScreen');
        if (loadingScreen) {
            loadingScreen.remove();
        }
    }

    showSuccess() {
        const success = document.querySelector('.conta-success');
        if (success) {
            success.style.display = 'block';
        }
    }

    updateConfirmation() {
        // Atualizar dados pessoais
        const nome = document.getElementById('contaNomeCompleto')?.value || '';
        const cpf = document.getElementById('contaCpf')?.value || '';
        const email = document.getElementById('contaEmail')?.value || '';
        const telefone = document.getElementById('contaTelefone')?.value || '';
        
        // Atualizar endereço
        const cep = document.getElementById('contaCep')?.value || '';
        const rua = document.getElementById('contaRua')?.value || '';
        const numero = document.getElementById('contaNumero')?.value || '';
        const complemento = document.getElementById('contaComplemento')?.value || '';
        const bairro = document.getElementById('contaBairro')?.value || '';
        const cidade = document.getElementById('contaCidade')?.value || '';
        const estado = document.getElementById('contaEstado')?.value || '';
        
        // Atualizar profissional
        const profissao = document.getElementById('contaProfissao')?.value || '';
        const renda = document.getElementById('contaRenda')?.value || '';
        
        // Atualizar elementos de confirmação
        document.getElementById('confirmNome').textContent = nome;
        document.getElementById('confirmCpf').textContent = cpf;
        document.getElementById('confirmEmail').textContent = email;
        document.getElementById('confirmTelefone').textContent = telefone;
        document.getElementById('confirmCep').textContent = cep;
        document.getElementById('confirmEndereco').textContent = `${rua}, ${numero}${complemento ? ', ' + complemento : ''} - ${bairro}, ${cidade}/${estado}`;
        document.getElementById('confirmProfissao').textContent = profissao;
        document.getElementById('confirmRenda').textContent = `R$ ${parseFloat(renda).toLocaleString('pt-BR', {minimumFractionDigits: 2})}`;
    }

    closeForm() {
        const contaContainer = document.getElementById('contaContainer');
        if (contaContainer) {
            contaContainer.style.display = 'none';
        }
        
        const loginContainer = document.getElementById('loginContainer');
        if (loginContainer) {
            loginContainer.style.display = 'flex';
        }
    }
}

// Função para abrir o formulário
function abrirFormularioConta() {
    console.log('🔵 Abrindo formulário de conta...');
    
    const loginContainer = document.getElementById('loginContainer');
    if (loginContainer) {
        loginContainer.style.display = 'none';
        console.log('✅ Login container escondido');
    } else {
        console.log('❌ Login container não encontrado');
    }
    
    const contaContainer = document.getElementById('contaContainer');
    if (contaContainer) {
        console.log('✅ Conta container encontrado');
        
        // FORÇAR exibição com !important via style
        contaContainer.setAttribute('style', `
            display: flex !important;
            visibility: visible !important;
            opacity: 1 !important;
            z-index: 999999 !important;
            position: fixed !important;
            top: 0 !important;
            left: 0 !important;
            width: 100% !important;
            height: 100vh !important;
            background: linear-gradient(135deg, #0066b3 0%, #004d8c 100%) !important;
            align-items: flex-start !important;
            justify-content: center !important;
            padding: 20px !important;
            box-sizing: border-box !important;
        `);
        
        contaContainer.classList.add('active');
        
        console.log('✅ Conta container FORÇADO a exibir');
        console.log('🔍 Style aplicado:', contaContainer.getAttribute('style'));
        
        // Mostrar o passo 1 quando o formulário for aberto
        if (window.formularioConta) {
            console.log('✅ FormularioConta encontrado, mostrando passo 1');
            window.formularioConta.showStep(1);
        } else {
            console.log('❌ FormularioConta não encontrado');
        }
        
        // FORÇAR exibição da primeira seção também
        setTimeout(() => {
            const firstSection = document.querySelector('.conta-form-section[data-section="1"]');
            if (firstSection) {
                firstSection.setAttribute('style', 'display: block !important; visibility: visible !important; opacity: 1 !important;');
                firstSection.classList.add('active');
                console.log('✅ Primeira seção FORÇADA a exibir');
            } else {
                console.log('❌ Primeira seção não encontrada');
            }
        }, 200);
        
        // FORÇAR exibição do conteúdo também
        setTimeout(() => {
            const content = document.querySelector('.conta-content');
            if (content) {
                console.log('🔍 Conteúdo encontrado:', content);
                
                // FORÇAR exibição do conteúdo
                content.setAttribute('style', `
                    display: block !important;
                    visibility: visible !important;
                    opacity: 1 !important;
                    background: white !important;
                    border-radius: 20px !important;
                    padding: 30px !important;
                    margin-top: 100px !important;
                    width: 100% !important;
                    max-width: 500px !important;
                    box-shadow: 0 20px 40px rgba(0, 0, 0, 0.1) !important;
                    position: relative !important;
                `);
                
                console.log('✅ Conteúdo FORÇADO a exibir');
                console.log('🔍 Conteúdo style:', content.getAttribute('style'));
            } else {
                console.log('❌ Conteúdo não encontrado');
            }
        }, 100);
    } else {
        console.log('❌ Conta container não encontrado');
    }
}

// Função para voltar ao login
function voltarParaLogin() {
    const contaContainer = document.getElementById('contaContainer');
    if (contaContainer) {
        contaContainer.style.display = 'none';
    }
    
    const loginContainer = document.getElementById('loginContainer');
    if (loginContainer) {
        loginContainer.style.display = 'flex';
    }
}

// Função para fazer login após criar conta
function fazerLoginAposConta() {
    const contaContainer = document.getElementById('contaContainer');
    if (contaContainer) {
        contaContainer.style.display = 'none';
    }
    
    const loginContainer = document.getElementById('loginContainer');
    if (loginContainer) {
        loginContainer.style.display = 'flex';
    }
    
    // Mostrar mensagem de sucesso
    const successMessage = document.createElement('div');
    successMessage.style.cssText = `
        position: fixed;
        top: 20px;
        right: 20px;
        background: #28a745;
        color: white;
        padding: 15px 20px;
        border-radius: 10px;
        z-index: 1000000;
        font-weight: 500;
        box-shadow: 0 4px 12px rgba(40, 167, 69, 0.3);
    `;
    successMessage.textContent = 'Conta criada com sucesso! Faça login para continuar.';
    
    document.body.appendChild(successMessage);
    
    setTimeout(() => {
        successMessage.remove();
    }, 5000);
}

// Função global para verificar se pode habilitar o botão de submit
function verificarStatusUpload() {
    console.log('🔍 Verificando status dos uploads...');
    
    if (window.formularioConta && window.formularioConta.currentStep === 4) {
        window.formularioConta.checkIfCanSubmit();
    }
}
