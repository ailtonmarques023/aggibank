(function setupAgilBankInstallPage(window, document) {
  'use strict';

  var deferredPrompt = null;
  var installButton = document.getElementById('installButton');
  var openButton = document.getElementById('openButton');
  var browserLink = document.getElementById('browserLink');
  var statusTitle = document.getElementById('installStatusTitle');
  var statusText = document.getElementById('installStatusText');
  var manualSteps = document.getElementById('manualInstallSteps');
  var referralCode = getReferralCode();
  var appUrl = withReferral('/banco/index.html');
  var signupUrl = withReferral('/banco/pages/formularioCadastrodeConta.html');

  function isIos() {
    var ua = window.navigator.userAgent || '';
    var platform = window.navigator.platform || '';
    return /iPad|iPhone|iPod/.test(ua) || (platform === 'MacIntel' && window.navigator.maxTouchPoints > 1);
  }

  function getReferralCode() {
    var params = new URLSearchParams(window.location.search || '');
    var rawCode = params.get('ref') || params.get('referral') || params.get('referralCode') || params.get('indicacao') || '';
    var code = String(rawCode).trim().toUpperCase().replace(/[^A-Z0-9]/g, '');
    if (code && window.localStorage) {
      window.localStorage.setItem('agilbank_referral_code', code);
    }
    return code;
  }

  function withReferral(path) {
    if (!referralCode) return path;
    return path + '?ref=' + encodeURIComponent(referralCode);
  }

  function prepareReferralLinks() {
    if (!browserLink) return;
    browserLink.href = referralCode ? signupUrl : appUrl;
  }

  function isStandalone() {
    return window.matchMedia('(display-mode: standalone)').matches || window.navigator.standalone === true;
  }

  function setMessage(title, text) {
    if (statusTitle) statusTitle.textContent = title;
    if (statusText) statusText.textContent = text;
  }

  function showManualInstructions(text) {
    setMessage('Instalação manual', text || 'Use o menu do navegador para adicionar o AgilBank à tela inicial.');
    if (manualSteps) manualSteps.hidden = false;
    if (installButton) installButton.disabled = false;
  }

  function setInstalledState() {
    setMessage('AgilBank já está instalado neste dispositivo.', 'Abra pelo ícone na tela inicial ou continue pelo botão abaixo.');
    if (manualSteps) manualSteps.hidden = true;
    if (installButton) installButton.hidden = true;
    if (openButton) openButton.hidden = false;
  }

  function updateInitialState() {
    if (isStandalone()) {
      setInstalledState();
      return;
    }

    if (isIos()) {
      showManualInstructions('No iPhone, toque no botão Compartilhar do Safari e depois em Adicionar à Tela de Início.');
      if (installButton) installButton.hidden = true;
      return;
    }

    setMessage('Pronto para instalar', 'Quando o navegador liberar a instalação, toque no botão abaixo para adicionar o AgilBank à tela inicial.');
    if (installButton) installButton.disabled = false;
  }

  window.addEventListener('beforeinstallprompt', function (event) {
    event.preventDefault();
    deferredPrompt = event;
    setMessage('Instalação disponível', 'Toque em Instalar AgilBank para salvar o app na tela inicial.');
    if (installButton) {
      installButton.disabled = false;
      installButton.hidden = false;
    }
    if (manualSteps) manualSteps.hidden = true;
  });

  window.addEventListener('appinstalled', function () {
    deferredPrompt = null;
    setInstalledState();
  });

  if (installButton) {
    installButton.addEventListener('click', async function () {
      if (isStandalone()) {
        setInstalledState();
        return;
      }

      if (isIos()) {
        showManualInstructions('No iPhone, toque no botão Compartilhar do Safari e depois em Adicionar à Tela de Início.');
        return;
      }

      if (!deferredPrompt) {
        showManualInstructions('Se o botão de instalação não aparecer, abra o menu do Chrome e escolha Instalar app ou Adicionar à tela inicial.');
        return;
      }

      installButton.disabled = true;
      deferredPrompt.prompt();
      var choice = await deferredPrompt.userChoice.catch(function () {
        return { outcome: 'dismissed' };
      });
      deferredPrompt = null;

      if (choice && choice.outcome === 'accepted') {
        setMessage('Instalação iniciada', 'Conclua a instalação pelo navegador. Depois, abra o AgilBank pelo ícone na tela inicial.');
      } else {
        setMessage('Instalação cancelada', 'Você pode tentar novamente pelo menu do navegador ou voltar a esta página mais tarde.');
        installButton.disabled = false;
      }
    });
  }

  if (openButton) {
    openButton.addEventListener('click', function () {
      window.location.href = appUrl;
    });
  }

  if (browserLink) {
    browserLink.addEventListener('click', function () {
      window.location.href = referralCode ? signupUrl : appUrl;
    });
  }

  prepareReferralLinks();
  updateInitialState();
})(window, document);
