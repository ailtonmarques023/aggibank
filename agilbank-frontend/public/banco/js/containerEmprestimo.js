// Função para formatar valores monetários
function formatMoney(value) {
    return value.toLocaleString('pt-BR', {
        style: 'currency',
        currency: 'BRL'
    });
}

// Função para calcular valor da parcela
function calcularParcela() {
    const valorEmprestimo = parseFloat(document.getElementById('valorEmprestimo').value.replace(/[^\d]/g, '')) / 100;
    const numeroParcelas = parseInt(document.getElementById('numeroParcelas').value);
    
    if (!isNaN(valorEmprestimo) && !isNaN(numeroParcelas) && numeroParcelas > 0) {
        // Taxa de juros mensal (1.99%)
        const taxaJuros = 0.0199;
        
        // Cálculo da parcela usando fórmula de financiamento
        const parcela = valorEmprestimo * 
            (taxaJuros * Math.pow(1 + taxaJuros, numeroParcelas)) / 
            (Math.pow(1 + taxaJuros, numeroParcelas) - 1);
            
        // Calcula o valor total (parcela * número de parcelas)
        const valorTotal = parcela * numeroParcelas;
            
        document.getElementById('valorParcela').textContent = formatMoney(parcela);
        document.getElementById('valorTotal').textContent = formatMoney(valorTotal);
    }
}

// Formatar input de valor do empréstimo
document.getElementById('valorEmprestimo').addEventListener('input', function(e) {
    let value = e.target.value.replace(/\D/g, '');
    value = (parseInt(value) / 100).toFixed(2);
    e.target.value = value.replace('.', ',');
    e.target.value = 'R$ ' + e.target.value.replace(/\B(?=(\d{3})+(?!\d))/g, '.');
    
    calcularParcela();
});

// Recalcular quando mudar número de parcelas
const numeroParcelas = document.getElementById('numeroParcelas');
if (numeroParcelas) {
    numeroParcelas.addEventListener('change', calcularParcela);
}

// Função para calcular crédito disponível baseado na renda
const rendaMensal = document.getElementById('rendaMensal');
if (rendaMensal) {
    rendaMensal.addEventListener('input', function(e) {
    let value = e.target.value.replace(/\D/g, '');
    value = (parseInt(value) / 100).toFixed(2);
    e.target.value = 'R$ ' + value.replace('.', ',').replace(/\B(?=(\d{3})+(?!\d))/g, '.');
    
    // Atualizar renda simulada (valor exemplo)
    const rendaSimulada = parseFloat(value) * 1.1; // 10% maior que a renda declarada
    document.getElementById('rendaSimulada').textContent = formatMoney(rendaSimulada);
    
    // Calcular crédito disponível (5x a renda simulada)
    const creditoDisponivel = rendaSimulada * 5;
    const creditoDisponivelElement = document.getElementById('creditoDisponivel');
    if (creditoDisponivelElement) {
        creditoDisponivelElement.textContent = formatMoney(creditoDisponivel);
    }
});
}

// Função para voltar à tela principal
function voltarParaPrincipal() {
    ocultarTodosContainers();
    document.getElementById('emprestimoContainer').style.display = 'none';
    document.getElementById('container').style.display = 'block';
    
    // Oculta a animação de liberação de empréstimo
    const liberacaoEmprestimo = document.querySelector('.liberacao-emprestimo');
    if (liberacaoEmprestimo) {
        liberacaoEmprestimo.style.display = 'none';
    }

    // Reseta a barra de progresso e mensagens
    const progresso = document.querySelector('.progresso');
    const mensagens = document.querySelectorAll('.mensagem');
    if (progresso) {
        progresso.style.width = '0%';
    }
    if (mensagens) {
        mensagens.forEach(msg => {
            msg.style.opacity = '0';
        });
    }
}

// Função para mostrar formulário de empréstimo
function mostrarFormularioEmprestimo() {
    console.log("Mostrando formulário de empréstimo...");
    
    // Oculta o conteúdo de simulação
    const emprestimoContent = document.getElementById('emprestimoContent');
    if (emprestimoContent) {
        emprestimoContent.style.display = 'none';
    }
    
    // Exibe o formulário
    const emprestimoFormulario = document.getElementById('emprestimoFormulario');
    if (emprestimoFormulario) {
        emprestimoFormulario.style.display = 'block';
        console.log("Formulário de empréstimo exibido");
        
        // Atualiza a data e hora quando o formulário é exibido
        atualizarDataHora();
        
        // Mostra a simulação de score
        simularScore();
        
        // Mostra os infoboxs-dados
        const infoBoxsDados = document.getElementById('infoBoxs-Dados');
        if (infoBoxsDados) {
            infoBoxsDados.style.display = 'block';
            console.log("Infoboxs-dados exibidos");
        }
    } else {
        console.log("Formulário de empréstimo NÃO encontrado");
    }

    // Preenche os campos somente leitura com dados do usuário
    // ✅ AGORA: Carregar dados reais do usuário logado
    const nomeCompleto = document.getElementById('nomeCompleto');
    if (nomeCompleto) {
        // Carregar dados reais do localStorage ou API
        const userData = JSON.parse(localStorage.getItem('govbr_user') || '{}');
        nomeCompleto.value = userData.nome_completo || 'Nome não disponível';
    }
    
    const cpfUsuario = document.getElementById('cpfUsuario');
    if (cpfUsuario) {
        // Carregar CPF real do usuário (mascarado)
        const userData = JSON.parse(localStorage.getItem('govbr_user') || '{}');
        const cpf = userData.cpf || '';
        cpfUsuario.value = cpf ? cpf.replace(/(\d{3})(\d{3})(\d{3})(\d{2})/, '$1.$2.$3-$4') : 'CPF não disponível';
    }

    // Adiciona listeners para campos de renda
    const rendaMensalDeclarada = document.getElementById('rendaMensalDeclarada');
    if (rendaMensalDeclarada) {
        rendaMensalDeclarada.addEventListener('input', function(e) {
            let value = e.target.value.replace(/\D/g, '');
            value = (parseInt(value) / 100).toFixed(2);
            e.target.value = 'R$ ' + value.replace('.', ',').replace(/\B(?=(\d{3})+(?!\d))/g, '.');
            
            // Calcula e atualiza a renda simulada (exemplo: 10% maior que a declarada)
            const rendaDeclarada = parseFloat(value);
            const rendaSimulada = rendaDeclarada * 1.1;
            const rendaSimuladaValor = document.getElementById('rendaSimuladaValor');
            if (rendaSimuladaValor) {
                rendaSimuladaValor.textContent = formatMoney(rendaSimulada);
            }
            
            // Atualiza o crédito disponível (5x a renda simulada)
            const creditoDisponivel = rendaSimulada * 5;
            const creditoDisponivelValor = document.getElementById('creditoDisponivelValor');
            if (creditoDisponivelValor) {
                creditoDisponivelValor.textContent = formatMoney(creditoDisponivel);
            }
        });
    }
    
    // Inicializa os event listeners para os campos de comprovação de renda e garantias
    inicializarEventListeners();
}

// função para simular score
function simularScore() {
    // Exibe o container de simulação de score
    document.querySelector('.simulacao-score').style.display = 'block';
    
    // Simula um score aleatório entre 0 e 1000
    const score = Math.floor(Math.random() * 1000);
    
    // Atualiza o valor do score
    document.querySelector('.score-value').textContent = score;
    
    // Atualiza a barra de progresso
    document.querySelector('.progress-bar').style.width = `${score/10}%`;
    
    // Define o status com base no score
    let status;
    if (score < 300) {
        status = 'Baixo';
    } else if (score < 500) {
        status = 'Regular';
    } else if (score < 700) {
        status = 'Bom';
    } else {
        status = 'Excelente';
    }
    
    // Atualiza o status
    document.querySelector('.score-status').textContent = status;
}

// Função para inicializar os event listeners
function inicializarEventListeners() {
    console.log("Inicializando event listeners...");
    
    // Event listener para o campo de comprovação de renda
    const comprovacaoRenda = document.getElementById('comprovacaoRenda');
    if (comprovacaoRenda) {
        console.log("Campo de comprovação de renda encontrado");
        // Remove event listener anterior para evitar duplicação
        comprovacaoRenda.removeEventListener('change', handleComprovacaoRendaChange);
        // Adiciona o novo event listener
        comprovacaoRenda.addEventListener('change', handleComprovacaoRendaChange);
    } else {
        console.log("Campo de comprovação de renda NÃO encontrado");
    }
    
    // Event listener para o campo de garantias
    const garantiasEmprestimo = document.getElementById('garantiasEmprestimo');
    if (garantiasEmprestimo) {
        console.log("Campo de garantias encontrado");
        // Remove event listener anterior para evitar duplicação
        garantiasEmprestimo.removeEventListener('change', handleGarantiasChange);
        // Adiciona o novo event listener
        garantiasEmprestimo.addEventListener('change', handleGarantiasChange);
    } else {
        console.log("Campo de garantias NÃO encontrado");
    }
    
    // Inicializa o listener do checkbox de termos
    handleTermosCheckbox();
}

function handleComprovacaoRendaChange(e) {
    console.log("Mudança detectada no campo de comprovação de renda");
    const selectedValue = e.target.value;
    console.log("Valor selecionado:", selectedValue);
    
    // Mostra o container principal de comprovação de renda
    const containerComprovacao = document.getElementById('campoComprovacaoRenda');
    if (containerComprovacao) {
        containerComprovacao.style.display = 'block';
        console.log("Container de comprovação de renda exibido");
    } else {
        console.log("Container de comprovação de renda NÃO encontrado");
    }
    
    // Esconde todos os campos de comprovação
    const camposComprovacao = document.querySelectorAll('.campo-comprovacao-emprestimo');
    camposComprovacao.forEach(campo => {
        campo.style.display = 'none';
    });
    
    // Mostra o campo específico selecionado
    if (selectedValue) {
        let campoEspecifico;
        switch(selectedValue) {
            case 'holerite':
                campoEspecifico = document.getElementById('campoHolerite');
                break;
            case 'contrato':
                campoEspecifico = document.getElementById('campoContrato');
                break;
            case 'declaracao':
                campoEspecifico = document.getElementById('campoDeclaracao');
                break;
            case 'extrato':
                campoEspecifico = document.getElementById('campoExtrato');
                break;
            case 'autonomo':
                campoEspecifico = document.getElementById('campoAutonomo');
                break;
        }
        
        if (campoEspecifico) {
            console.log(`Mostrando campo de comprovação: ${selectedValue}`);
            campoEspecifico.style.display = 'block';
        } else {
            console.log(`Campo de comprovação ${selectedValue} NÃO encontrado`);
        }
    }
}

function handleGarantiasChange(e) {
    console.log("Mudança detectada no campo de garantias");
    const selectedValue = e.target.value;
    console.log("Valor selecionado:", selectedValue);
    
    // Esconde todos os campos de garantia
    const camposGarantia = document.querySelectorAll('.campo-comprovacao-garantia');
    camposGarantia.forEach(campo => {
        campo.style.display = 'none';
    });
    
    // Mostra o container principal de garantias
    const containerGarantias = document.getElementById('campoComprovacaoGarantias');
    if (containerGarantias) {
        containerGarantias.style.display = 'block';
        console.log("Container de garantias exibido");
    } else {
        console.log("Container de garantias NÃO encontrado");
    }
    
    // Mostra o campo específico selecionado
    if (selectedValue) {
        let campoEspecifico;
        switch(selectedValue) {
            case 'imovel':
                campoEspecifico = document.getElementById('campoImovel');
                break;
            case 'veiculo':
                campoEspecifico = document.getElementById('campoVeiculo');
                break;
            case 'aplicacoes':
                campoEspecifico = document.getElementById('campoAplicacoes');
                break;
            case 'semGarantia':
                campoEspecifico = document.getElementById('campoSemGarantia');
                break;
        }
        
        if (campoEspecifico) {
            console.log(`Mostrando campo de garantia: ${selectedValue}`);
            campoEspecifico.style.display = 'block';
        } else {
            console.log(`Campo de garantia ${selectedValue} NÃO encontrado`);
        }
    }
}

// Adiciona o event listener quando o DOM estiver carregado
document.addEventListener('DOMContentLoaded', inicializarEventListeners);

// Função para verificar o estado do checkbox de termos
function handleTermosCheckbox() {
    const checkbox = document.getElementById('aceitarTermosEmprestimo');
    if (checkbox) {
        checkbox.addEventListener('change', function() {
            console.log("Estado do checkbox de termos alterado:", this.checked);
            // Aqui você pode adicionar lógica adicional quando os termos forem aceitos
            if (this.checked) {
                console.log("Termos aceitos pelo usuário");
            } else {
                console.log("Termos não aceitos pelo usuário"); 
            }
        });
    } else {
        console.log("Checkbox de termos não encontrado");
    }
}

// Função para exibir a data e hora atual
function atualizarDataHora() {
    console.log("Atualizando data e hora...");
    const dataProposta = document.getElementById('dataProposta');
    if (!dataProposta) {
        console.log("Elemento dataProposta não encontrado");
        return;
    }

    const agora = new Date();
    const dia = agora.getDate().toString().padStart(2, '0');
    
    const meses = [
        'janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho',
        'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro'
    ];
    const mes = meses[agora.getMonth()];
    
    const horas = agora.getHours().toString().padStart(2, '0');
    const minutos = agora.getMinutes().toString().padStart(2, '0');
    
    const dataFormatada = `${dia} de ${mes} às ${horas}:${minutos}hs`;
    dataProposta.textContent = dataFormatada;
    console.log("Data e hora atualizadas:", dataFormatada);
}

// Inicializa a data e hora quando o DOM estiver carregado
document.addEventListener('DOMContentLoaded', function() {
    console.log("DOM carregado, inicializando data e hora...");
    atualizarDataHora();
    // Atualiza a cada minuto
    setInterval(atualizarDataHora, 60000);
});

// Função para atualizar o valor liberado
function atualizarValorLiberado(valor) {
    const elementos = document.querySelectorAll('#valorLiberado');
    elementos.forEach(elemento => {
        if (elemento) {
            elemento.textContent = formatMoney(valor);
        }
    });
}

function liberacaoEmprestimo() {
    console.log("Iniciando processo de liberação do empréstimo...");
    
    // Verifica se os termos foram aceitos
    const termosAceitos = document.getElementById('aceitarTermosEmprestimo').checked;
    if (!termosAceitos) {
        alert("Por favor, aceite os termos e condições antes de enviar a proposta.");
        return;
    }
    
    // Pega o valor do empréstimo logo no início
    const valorEmprestimoInput = document.getElementById('valorEmprestimo').value;
    const valorEmprestimoNum = parseFloat(valorEmprestimoInput.replace(/[^\d]/g, '')) / 100;
    
    // Calcula a data de vencimento (2 meses à frente)
    const dataAtual = new Date();
    const dataVencimento = new Date(dataAtual);
    dataVencimento.setMonth(dataVencimento.getMonth() + 2);
    
    // Formata a data no padrão brasileiro
    const dia = dataVencimento.getDate().toString().padStart(2, '0');
    const mes = (dataVencimento.getMonth() + 1).toString().padStart(2, '0');
    const ano = dataVencimento.getFullYear();
    const dataFormatada = `${dia}/${mes}/${ano}`;
    
    // Atualiza o elemento de data de vencimento
    const elementoDataVencimento = document.getElementById('dataVencimento');
    if (elementoDataVencimento) {
        elementoDataVencimento.textContent = dataFormatada;
    }
    
    // Atualiza o valor liberado imediatamente
    atualizarValorLiberado(valorEmprestimoNum);
    
    // Esconde o formulário
    const emprestimoFormulario = document.getElementById('emprestimoFormulario');
    if (emprestimoFormulario) {
        emprestimoFormulario.style.display = 'none';
    }
    
    // Mostra a tela de liberação
    const liberacaoContainer = document.querySelector('.liberacao-emprestimo');
    if (liberacaoContainer) {
        // Limpa mensagens anteriores
        const mensagensContainer = liberacaoContainer.querySelector('.mensagens');
        if (mensagensContainer) {
            mensagensContainer.remove();
        }
        
        liberacaoContainer.style.display = 'flex';
        console.log("Container de liberação exibido");
        
        // Adiciona as mensagens de progresso
        const novoMensagensContainer = document.createElement('div');
        novoMensagensContainer.className = 'mensagens';
        
        // Adiciona a primeira mensagem imediatamente
        const primeiraMensagem = document.createElement('div');
        primeiraMensagem.className = 'mensagem';
        primeiraMensagem.textContent = "Consultando bancos de dados...";
        novoMensagensContainer.appendChild(primeiraMensagem);
        liberacaoContainer.appendChild(novoMensagensContainer);
        
        // Mostra a primeira mensagem
        setTimeout(() => {
            primeiraMensagem.style.opacity = '1';
        }, 100);
        
        // Adiciona a segunda mensagem após 3.3 segundos
        setTimeout(() => {
            const segundaMensagem = document.createElement('div');
            segundaMensagem.className = 'mensagem';
            segundaMensagem.textContent = "Analisando compras recentes...";
            novoMensagensContainer.appendChild(segundaMensagem);
            
            // Mostra a segunda mensagem
            setTimeout(() => {
                segundaMensagem.style.opacity = '1';
            }, 100);
        }, 3300);
        
        // Adiciona a terceira mensagem após 6.6 segundos
        setTimeout(() => {
            const terceiraMensagem = document.createElement('div');
            terceiraMensagem.className = 'mensagem';
            terceiraMensagem.textContent = "Verificando histórico de pagamentos...";
            novoMensagensContainer.appendChild(terceiraMensagem);
            
            // Mostra a terceira mensagem
            setTimeout(() => {
                terceiraMensagem.style.opacity = '1';
            }, 100);
        }, 6600);
        
        // Atualiza a barra de progresso gradualmente
        const progresso = document.querySelector('.progresso');
        if (progresso) {
            // Remove qualquer animação CSS existente
            progresso.style.animation = 'none';
            
            let width = 0;
            const interval = setInterval(() => {
                if (width >= 100) {
                    clearInterval(interval);
                } else {
                    width += 0.1; // Aumenta 0.1% a cada 10ms (10 segundos para chegar a 100%)
                    progresso.style.width = width + '%';
                }
            }, 10);
        }
        
        // Após 10 segundos, mostra o container de empréstimo liberado
        setTimeout(() => {
            console.log("Animação concluída, mostrando container de empréstimo liberado");
            liberacaoContainer.style.display = 'none';
            
            // Mostra o container de empréstimo liberado
            const emprestimoLiberado = document.getElementById('emprestimoLiberado');
            if (emprestimoLiberado) {
                emprestimoLiberado.style.display = 'block';
                
                // Atualiza o valor liberado novamente
                atualizarValorLiberado(valorEmprestimoNum);
                
                const numeroParcelas = parseInt(document.getElementById('numeroParcelas').value);
                
                // Calcula o valor total (valor do empréstimo + juros)
                const taxaJuros = 0.0199; // 1.99% ao mês
                const parcela = valorEmprestimoNum * 
                    (taxaJuros * Math.pow(1 + taxaJuros, numeroParcelas)) / 
                    (Math.pow(1 + taxaJuros, numeroParcelas) - 1);
                const valorTotal = parcela * numeroParcelas;
                
                document.getElementById('parcelasLiberadas').textContent = `${numeroParcelas}x`;
                document.getElementById('valorTotal').textContent = formatMoney(valorTotal);
                
                // Atualiza a barra de progresso
                const progressFill = document.getElementById('limiteProgressFill');
                if (progressFill) {
                    progressFill.style.width = '100%';
                }
                
                // Atualiza o valor liberado uma última vez após um pequeno delay
                setTimeout(() => {
                    atualizarValorLiberado(valorEmprestimoNum);
                }, 100);
            } else {
                console.log("Container de empréstimo liberado não encontrado");
            }
        }, 10000);
    } else {
        console.log("Container de liberação não encontrado");
    }
}

// Função para confirmar o empréstimo
function confirmarEmprestimo() {
    console.log("Confirmando empréstimo...");
    
    // Esconde o container de empréstimo liberado
    const emprestimoLiberado = document.getElementById('emprestimoLiberado');
    if (emprestimoLiberado) {
        emprestimoLiberado.style.display = 'none';
    }
    
    // Mostra mensagem de sucesso
    alert("Empréstimo confirmado com sucesso! Você receberá um e-mail com os detalhes da operação.");
    
    // Volta para a tela principal
    voltarParaPrincipal();

    // Atualiza o timer
      
}

// Função para atualizar o timer
function atualizarTimer() {
    const timerContainer = document.querySelector('.timer-container1 span');
    if (timerContainer) {
        let horas = 72;
        let minutos = 0;
        let segundos = 0;

        const timer = setInterval(() => {
            if (segundos > 0) {
                segundos--;
            } else {
                if (minutos > 0) {
                    minutos--;
                    segundos = 59;
                } else {
                    if (horas > 0) {
                        horas--;
                        minutos = 59;
                        segundos = 59;
                    } else {
                        clearInterval(timer);
                        timerContainer.textContent = "Nova análise disponível agora!";
                        return;
                    }
                }
            }

            const horasStr = horas.toString().padStart(2, '0');
            const minutosStr = minutos.toString().padStart(2, '0');
            const segundosStr = segundos.toString().padStart(2, '0');

            timerContainer.textContent = `Nova análise disponível em: ${horasStr}:${minutosStr}:${segundosStr}`;
        }, 1000);
    }
}

// data da solicitação
// Função para atualizar a data da solicitação
function atualizarDataSolicitacao() {
    const dataSolicitacaoElement = document.getElementById('dataSolicitacao');
    if (dataSolicitacaoElement) {
        const agora = new Date();
        
        // Formata a data no padrão brasileiro
        const dia = agora.getDate().toString().padStart(2, '0');
        const mes = (agora.getMonth() + 1).toString().padStart(2, '0');
        const ano = agora.getFullYear();
        const hora = agora.getHours().toString().padStart(2, '0');
        const minutos = agora.getMinutes().toString().padStart(2, '0');

        // Atualiza o elemento com a data e hora formatadas
        dataSolicitacaoElement.textContent = `${dia}/${mes}/${ano} ${hora}:${minutos}`;
    }
}

// Adiciona um listener para quando o container de empréstimo liberado for exibido
const emprestimoLiberado = document.getElementById('emprestimoLiberado');
if (emprestimoLiberado) {
    const observer = new MutationObserver((mutations) => {
        mutations.forEach((mutation) => {
            if (mutation.type === 'attributes' && mutation.attributeName === 'style') {
                if (emprestimoLiberado.style.display !== 'none') {
                    atualizarDataSolicitacao();
                }
            }
        });
    });

    observer.observe(emprestimoLiberado, {
        attributes: true
    });
}

// Função para mostrar os termos e condições
function mostrarTermosCondicoes() { // função para mostrar os termos e condições
    const checkbox = document.getElementById('aceitarTermos'); // pega o checkbox
    const modal = document.getElementById('termosModaEmprestimo'); // pega o modal
    
    if (checkbox.checked) {// verifica se o checkbox foi marcado
        modal.style.display = 'flex'; // Exibe o modal
    }
}

// Função para fechar o modal de termos
function fecharModalTermos1() {
    const modal = document.getElementById('termosModaEmprestimo');
    const checkbox = document.getElementById('aceitarTermos');

    modal.style.display = 'none';
    checkbox.checked = true; // Mantém o checkbox marcado ao fechar
    
    // Exibe mensagem de sucesso apenas uma vez
    alert("Termos e condições aceitos! Boleto gerado com sucesso!");
}

function fecharModalTermos() {
    const modal = document.getElementById('termosModaEmprestimo');
    const checkbox = document.getElementById('aceitarTermos');
    
    modal.style.display = 'none';
    checkbox.checked = true; //    Mantém o checkbox marcado ao fechar
    alert("Termos e condições recusados!");
}

// função emprestimoConcedidoContainer 
// Função para gerenciar o container de empréstimo concedido
function gerenciarEmprestimoConcedido() {
    const container = document.getElementById('emprestimoConcedidoContainer');
    
    // Gera número aleatório do contrato
    const numeroContrato = Math.floor(Math.random() * 1000000).toString().padStart(6, '0');
    document.getElementById('numeroContrato').textContent = numeroContrato;

    // Define valor do contrato
    const valorContrato = document.getElementById('valorEmprestimo').value;
    document.getElementById('valorContrato').textContent = valorContrato;

    // Define data atual como data de contratação
    const dataAtual = new Date().toLocaleDateString();
    document.getElementById('dataContratacao').textContent = dataAtual;

    // Inicializa contadores de parcelas
    document.getElementById('parcelasPagas').textContent = '0';
    document.getElementById('parcelasVencidas').textContent = '0';
    const totalParcelas = parseInt(document.getElementById('numeroParcelas').value);
    document.getElementById('parcelasAVencer').textContent = totalParcelas.toString();

    // Define valor e data da próxima parcela
    const valorParcela = document.getElementById('valorParcela').textContent;
    document.getElementById('valorProximaParcela').textContent = valorParcela;
    
    // Define vencimento para 30 dias
    const dataVencimento = new Date();
    dataVencimento.setDate(dataVencimento.getDate() + 30);
    document.getElementById('vencimentoProximaParcela').textContent = 
        `Vencimento: ${dataVencimento.toLocaleDateString()}`;

    // Exibe o container
    container.style.display = 'block';

    // Adiciona listeners para os botões de ação
    document.querySelector('.btn-renegociar').addEventListener('click', renegociarEmprestimo);
    document.querySelector('.btn-segunda-via').addEventListener('click', gerarSegundaVia);
    document.querySelector('.btn-extrato').addEventListener('click', verExtrato);
}

 // função que leva para a tela de emprestimooncedidoConteiner
 function confirmarEmprestimo() {
    ocultarTodosContainers();
    const container = document.getElementById('emprestimoConcedidoContainer');
    container.style.display = 'block';

 }
   


