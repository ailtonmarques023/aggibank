// Store the current screen and selected options
let currentScreen = 0;
let selectedOptions = {};

// Function to show a specific screen
function showScreen(screenNumber) {
    // Hide current screen
    document.getElementById('screen' + currentScreen).classList.remove('active');
    
    // Show new screen
    document.getElementById('screen' + screenNumber).classList.add('active');
    
    // Update current screen
    currentScreen = screenNumber;
}

// Função para selecionar uma opção
function selectOption(groupName, element) {
    // Remove selection from all options in the group
    const options = document.querySelectorAll('#screen' + currentScreen + ' .option');
    
    options.forEach(option => {
        option.querySelector('.radio').classList.remove('selected');
    });
    
    // Select the clicked option
    element.querySelector('.radio').classList.add('selected');
    
    // Store the selection
    selectedOptions[groupName] = element.querySelector('.option-text').textContent;
}

// Função para avançar para a próxima tela
function nextScreen(screenNumber) {
    const selectedOption = document.querySelector('#screen' + screenNumber + ' .radio.selected');
    
    if (!selectedOption) {
        alert('Por favor, selecione uma opção para continuar.');
        return;
    }
    
    const optionText = selectedOption.nextElementSibling.textContent;
    
    // Route to appropriate next screen based on selection
    if (screenNumber === 1) {
        if (optionText.includes('Imóvel')) {
            showScreen(2);
        } else if (optionText.includes('Veículo')) {
            showScreen(4);
        } else if (optionText.includes('energia renovável')) {
            showScreen(6);
        } else if (optionText.includes('Sonhos')) {
            showScreen(5);
        }
    } else {
        showScreen(screenNumber + 1);
    }
}

// Função para reiniciar o chat
function resetChat() {
    // Limpar as opções selecionadas
    selectedOptions = {};
    
    // Reset all radio buttons
    const radios = document.querySelectorAll('.radio');
    radios.forEach(radio => {
        radio.classList.remove('selected');
    });
    
    // Voltar para a primeira tela
    showScreen(0);
}
function abrirChatSimulacao(){
    ocultarTodosContainers();
    document.getElementById('chatContainer').style.display = 'none';
    document.getElementById('emprestimoContainer').style.display = 'block';
}
