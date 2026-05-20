// Função para voltar para a tela principal
function voltarParaPrincipal() {
    ocultarTodosContainers();
    var credEl = document.getElementById('creditoContainer');
    if (credEl) credEl.style.display = 'none';
    var cont = document.getElementById('container');
    if (cont) cont.style.display = 'block';
}

let currentSlide = 0;

function refreshCreditoSliderDom() {
    return {
        slides: Array.prototype.slice.call(document.querySelectorAll('.credito-slide')),
        dots: Array.prototype.slice.call(document.querySelectorAll('.slider-dots .dot')),
        slider: document.querySelector('.credito-slider'),
    };
}

function showSlide(n) {
    const { slides, dots, slider } = refreshCreditoSliderDom();

    if (!slider || !slides.length) {
        return;
    }

    if (n >= slides.length) currentSlide = 0;
    else if (n < 0) currentSlide = slides.length - 1;
    else currentSlide = n;

    slides.forEach((slide) => {
        slide.style.opacity = '0';
        slide.style.transition = 'opacity 0.5s ease-in-out';
    });

    const idx = currentSlide;

    setTimeout(() => {
        slider.style.transform = `translateX(-${idx * 100}%)`;
        const cur = slides[idx];
        if (cur) cur.style.opacity = '1';
    }, 6000);

    dots.forEach((dot) => {
        dot.classList.remove('active');
    });
    if (dots[idx]) {
        dots[idx].classList.add('active');
    }
}

function autoSlide() {
    const { slides } = refreshCreditoSliderDom();
    if (!slides.length) return;
    currentSlide++;
    showSlide(currentSlide);
}

(function initCreditoCarousel() {
    const { slides, dots } = refreshCreditoSliderDom();
    if (!slides.length || !dots.length) {
        return;
    }

    showSlide(currentSlide);

    setInterval(autoSlide, 5000);

    dots.forEach((dot, index) => {
        dot.addEventListener('click', () => {
            currentSlide = index;
            showSlide(currentSlide);
        });
    });
})();
