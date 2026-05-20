// Script para manipular o container de perfil do usuário - VERSÃO UNIFICADA

// Elementos principais
const perfilContainer = document.getElementById('perfilContainer');
const editarFotoBtn = document.querySelector('.editar-foto');
const editarPerfilBtn = document.querySelector('.editar-perfil');
const editarContatoBtns = document.querySelectorAll('.editar-contato');
const editarEnderecoBtn = document.querySelector('.editar-endereco');
const alterarSenhaBtn = document.querySelector('.alterar-senha');
const verDispositivosBtn = document.querySelector('.ver-dispositivos');

// Elementos dos modais
const edicaoModal = document.querySelector('.edicao-modal');
const dispositivosModal = document.querySelector('.dispositivos-modal');
const fecharModalBtns = document.querySelectorAll('.fechar-modal');
const loadingElement = document.querySelector('.perfil-loading');

if (editarFotoBtn) {
    editarFotoBtn.addEventListener('click', () => {
        const input = document.createElement('input');
        input.type = 'file';
        input.accept = 'image/*';
        input.onchange = e => {
            const file = e.target.files && e.target.files[0];
            if (!file) return;
            const reader = new FileReader();
            reader.onload = function (event) {
                const avatarIcon = document.querySelector('.avatar-img');
                if (!avatarIcon || !avatarIcon.parentNode) return;
                const img = document.createElement('img');
                img.src = event.target.result;
                img.style.width = '90px';
                img.style.height = '90px';
                img.style.objectFit = 'cover';
                img.style.borderRadius = '50%';
                img.style.position = 'absolute';
                img.style.top = '0';
                img.style.left = '0';
                avatarIcon.parentNode.replaceChild(img, avatarIcon);
                img.classList.add('custom-avatar');
            };
            reader.readAsDataURL(file);
        };
        input.click();
    });
}

if (editarPerfilBtn) {
    editarPerfilBtn.addEventListener('click', () => {
        mostrarModal(edicaoModal);
    });
}

editarContatoBtns.forEach((btn) => {
    btn.addEventListener('click', () => {
        mostrarModal(edicaoModal);
    });
});

if (editarEnderecoBtn) {
    editarEnderecoBtn.addEventListener('click', () => {
        mostrarModal(edicaoModal);
    });
}

if (alterarSenhaBtn) {
    alterarSenhaBtn.addEventListener('click', () => {
        console.log('Alterar senha');
    });
}

if (verDispositivosBtn) {
    verDispositivosBtn.addEventListener('click', () => {
        mostrarModal(dispositivosModal);
    });
}

// Manipulação do switch de biometria
const biometriaSwitch = document.querySelector('.switch input');
if (biometriaSwitch) {
    biometriaSwitch.addEventListener('change', () => {
        const ativado = biometriaSwitch.checked;
        console.log('Biometria ' + (ativado ? 'ativada' : 'desativada'));
    });
}

// Manipulação dos botões de remover dispositivo
const removerDispositivoBtns = document.querySelectorAll('.remover-dispositivo');
removerDispositivoBtns.forEach(btn => {
    btn.addEventListener('click', (e) => {
        const dispositivo = e.target.closest('.dispositivo-item');
        if (dispositivo && !dispositivo.classList.contains('atual')) {
            dispositivo.remove();
        }
    });
});

// Manipulação do botão de remover todos os dispositivos
const removerTodosBtn = document.querySelector('.remover-todos');
if (removerTodosBtn) {
    removerTodosBtn.addEventListener('click', () => {
        const dispositivos = document.querySelectorAll('.dispositivo-item:not(.atual)');
        dispositivos.forEach(dispositivo => dispositivo.remove());
    });
}

// Função para salvar os dados do formulário
function salvarDadosFormulario() {
    // Pegar valores dos campos
    const novoNome = document.getElementById('novoNome').value;
    const novoEmail = document.getElementById('email').value;
    const novoCelular = document.getElementById('celular').value;

    // Mostrar loading
    mostrarLoading();

    // Simular processamento e atualizar dados após 1.5 segundos
    setTimeout(() => {
        // Atualizar nome completo nos dados pessoais
        const nomeCompletoValor = document.getElementById('nomeCompletoValor');
        if (nomeCompletoValor) {
            nomeCompletoValor.textContent = novoNome || 'Nome não disponível';
        }

        // Atualizar email na seção de contatos
        const emailValor = document.getElementById('emailValor');
        if (emailValor) {
            emailValor.textContent = novoEmail || 'Email não disponível';
        }

        // Atualizar celular na seção de contatos
        const celularValor = document.getElementById('celularValor');
        if (celularValor) {
            celularValor.textContent = novoCelular || 'Celular não disponível';
        }

        // Esconder loading
        esconderLoading();

        // Fechar modal
        fecharModal(edicaoModal);

        // Mostrar notificação de sucesso
        mostrarNotificacao('Dados atualizados com sucesso!', 'success');
    }, 1500);
}

// Função para mostrar modal
function mostrarModal(modal) {
    if (modal) {
        modal.style.display = 'block';
    }
}

// Função para fechar modal
function fecharModal(modal) {
    if (modal) {
        modal.style.display = 'none';
    }
}

// Função para mostrar loading
function mostrarLoading() {
    if (loadingElement) {
        loadingElement.style.display = 'block';
    }
}

// Função para esconder loading
function esconderLoading() {
    if (loadingElement) {
        loadingElement.style.display = 'none';
    }
}

// Função para mostrar notificação
function mostrarNotificacao(mensagem, tipo = 'info') {
    // Criar modal de notificação se não existir
    let notificationModal = document.querySelector('.notification-modal');
    
    if (!notificationModal) {
        notificationModal = document.createElement('div');
        notificationModal.className = 'notification-modal modal-content';
        notificationModal.innerHTML = `
            <div class="modal-header">
                <h2 class="notification-title">Notificação</h2>
                <button class="fechar-modal">
                    <i class="fas fa-times"></i>
                </button>
            </div>
            <div class="modal-body notification-body">
                <p></p>
            </div>
            <div class="modal-footer">
                <button class="ok-notification">OK</button>
            </div>
        `;
        var root =
            document.querySelector('.perfil-container') ||
            document.getElementById('perfilContainer') ||
            document.body;
        root.appendChild(notificationModal);
    }

    const modalBody = notificationModal.querySelector('.notification-body p');
    const modalTitle = notificationModal.querySelector('.notification-title');
    const closeModalBtn = notificationModal.querySelector('.fechar-modal');
    const okBtn = notificationModal.querySelector('.ok-notification');

    if (!modalBody || !modalTitle || !closeModalBtn || !okBtn) {
        console.warn('[perfil] Estrutura do modal de notificação incompleta.');
        return;
    }

    notificationModal.classList.remove('error', 'success', 'warning');
    notificationModal.classList.add(tipo);

    switch (tipo) {
        case 'error':
            modalTitle.textContent = 'Erro';
            break;
        case 'success':
            modalTitle.textContent = 'Sucesso';
            break;
        case 'warning':
            modalTitle.textContent = 'Aviso';
            break;
        default:
            modalTitle.textContent = 'Notificação';
    }

    modalBody.textContent = mensagem;
    notificationModal.style.display = 'block';

    const closeModal = () => {
        notificationModal.style.display = 'none';
    };

    closeModalBtn.addEventListener('click', closeModal);
    okBtn.addEventListener('click', closeModal);

    notificationModal.addEventListener('click', (e) => {
        if (e.target === notificationModal) {
            closeModal();
        }
    });
}

// Event listeners para fechar modais
fecharModalBtns.forEach(btn => {
    btn.addEventListener('click', (e) => {
        const modal = e.target.closest('.modal-content');
        if (modal) {
            fecharModal(modal);
        }
    });
});

// Event listener para salvar dados do formulário
const salvarBtn = document.querySelector('.salvar-dados');
if (salvarBtn) {
    salvarBtn.addEventListener('click', salvarDadosFormulario);
}

// Event listener para cancelar edição
const cancelarBtn = document.querySelector('.cancelar-edicao');
if (cancelarBtn) {
    cancelarBtn.addEventListener('click', () => {
        fecharModal(edicaoModal);
    });
}

// Inicialização quando DOM estiver carregado
document.addEventListener('DOMContentLoaded', () => {
    console.log('Container de perfil inicializado');
});