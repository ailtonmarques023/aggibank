(function () {
  var toggle = document.getElementById('revvoBalanceToggle');
  var valueEl = document.getElementById('revvoBalanceValue');
  var amountEl = document.getElementById('revvoBalanceAmount');
  var brlEl = document.getElementById('revvoBalanceBrl');
  if (!toggle || !valueEl || !amountEl || !brlEl) return;

  var visible = true;
  toggle.addEventListener('click', function () {
    visible = !visible;
    valueEl.classList.toggle('is-hidden', !visible);
    amountEl.textContent = visible ? '2.480' : '••••';
    brlEl.textContent = visible ? '≈ R$ 74,40' : '≈ R$ ••,••';
    toggle.setAttribute('aria-label', visible ? 'Ocultar saldo' : 'Mostrar saldo');
  });
})();
