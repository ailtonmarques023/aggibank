// Função para voltar para a tela principal
function voltarParaPrincipal() {
    ocultarTodosContainers();
    document.getElementById('creditoContainer').style.display = 'none';
    document.getElementById('container').style.display = 'block';
}

// Variáveis para controle do slider
let currentSlide = 0;
const slides = document.querySelectorAll('.credito-slide');
const dots = document.querySelectorAll('.slider-dots .dot');

// Função para mostrar slide específico
function showSlide(n) {
    // Reseta o índice se passar dos limites
    if (n >= slides.length) currentSlide = 0;
    if (n < 0) currentSlide = slides.length - 1;

    // Atualiza a posição do slider e aplica fade
    const slider = document.querySelector('.credito-slider');
    
    // Esconde todos os slides
    slides.forEach(slide => {
        slide.style.opacity = '0';
        slide.style.transition = 'opacity 0.5s ease-in-out';
    });

    // Mostra o slide atual com fade
    setTimeout(() => {
        slider.style.transform = `translateX(-${currentSlide * 100}%)`;
        slides[currentSlide].style.opacity = '1';
    }, 6000);

    // Remove classe active de todos os dots
    dots.forEach(dot => {
        dot.classList.remove('active');
    });

    // Ativa o dot correspondente
    dots[currentSlide].classList.add('active');
}

// Função para avançar slides
function autoSlide() {
    currentSlide++;
    showSlide(currentSlide);
}

// Inicia o slider
showSlide(currentSlide);

// Configura o intervalo para avançar automaticamente
setInterval(autoSlide, 5000);

// Adiciona listeners para os dots
dots.forEach((dot, index) => {
    dot.addEventListener('click', () => {
        currentSlide = index;
        showSlide(currentSlide);
    });
});
