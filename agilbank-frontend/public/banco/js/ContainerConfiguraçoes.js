// Function to open Version Modal
function abrirModalVersao() {
    const modalVersao = document.getElementById('modalVersao');
    if (modalVersao) {
        modalVersao.style.display = 'block';
    }
}

// Function to close Version Modal
function fecharModalVersao() {
    const modalVersao = document.getElementById('modalVersao');
    if (modalVersao) {
        modalVersao.style.display = 'none';
    }
}

// Function to open Terms Modal
function abrirModalTermos() {
    const modalTermos = document.getElementById('modalTermosUso');
    if (modalTermos) {
        modalTermos.style.display = 'block';
    }
}

// Function to close Terms Modal
function fecharModalTermos() {
    const modalTermos = document.getElementById('modalTermosUso');
    if (modalTermos) {
        modalTermos.style.display = 'none';
    }
}

// Function to open Privacy Policy Modal
function abrirModalPrivacidade() {
    const modalPrivacidade = document.getElementById('modalPrivacidade');
    if (modalPrivacidade) {
        modalPrivacidade.style.display = 'block';
    }
}

// Function to close Privacy Policy Modal
function fecharModalPrivacidade() {
    const modalPrivacidade = document.getElementById('modalPrivacidade');
    if (modalPrivacidade) {
        modalPrivacidade.style.display = 'none';
    }
}

// Theme selection functionality
document.addEventListener('DOMContentLoaded', function() {
    const themeSelect = document.querySelector('.tema-select');
    
    if (themeSelect) {
        themeSelect.addEventListener('change', function() {
            const selectedTheme = this.value;
            
            switch(selectedTheme) {
                case 'claro':
                    document.body.classList.remove('dark-theme');
                    document.body.classList.add('light-theme');
                    break;
                case 'escuro':
                    document.body.classList.remove('light-theme');
                    document.body.classList.add('dark-theme');
                    break;
                case 'sistema':
                    // Use system preference
                    if (window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches) {
                        document.body.classList.remove('light-theme');
                        document.body.classList.add('dark-theme');
                    } else {
                        document.body.classList.remove('dark-theme');
                        document.body.classList.add('light-theme');
                    }
                    break;
            }
        });
    }

    // Handle notification toggles
    const notificationToggles = document.querySelectorAll('.switch input[type="checkbox"]');
    notificationToggles.forEach(toggle => {
        toggle.addEventListener('change', function() {
            const notificationType = this.closest('.config-item').querySelector('.item-info h3').textContent;
            console.log(`${notificationType} notifications ${this.checked ? 'enabled' : 'disabled'}`);
            // Add your notification preference saving logic here
        });
    });
});

// Confirmation modal handling
document.addEventListener('DOMContentLoaded', function() {
    const confirmationModal = document.querySelector('.confirmacao-modal');
    const cancelButton = confirmationModal?.querySelector('.cancelar');
    const confirmButton = confirmationModal?.querySelector('.confirmar');

    function openConfirmationModal() {
        if (confirmationModal) {
            confirmationModal.style.display = 'block';
        }
    }

    function closeConfirmationModal() {
        if (confirmationModal) {
            confirmationModal.style.display = 'none';
        }
    }

    // Example of when to trigger confirmation modal (you can expand on this)
    function triggerSettingsSave() {
        openConfirmationModal();
    }

    if (cancelButton) {
        cancelButton.addEventListener('click', closeConfirmationModal);
    }

    if (confirmButton) {
        confirmButton.addEventListener('click', function() {
            // Add save logic here
            closeConfirmationModal();
        });
    }
});