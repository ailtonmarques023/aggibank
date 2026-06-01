import React, { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useRevvoCanvasScale } from '../../hooks/useRevvoCanvasScale';
import './RevvoSaqueResgatePreview.css';

const revvoWalletMock = {
  points: 12480,
  availableBalance: 48.7,
  conversionRateText: '100 pontos = R$ 0,50',
  pixKey: 'joao.silva@email.com',
  selectedWithdrawAmount: 30,
  feePercent: 0,
  estimatedTime: 'Até 1 dia útil',
};

const formatPoints = (value) => value.toLocaleString('pt-BR');
const formatBrl = (value) =>
  value.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

const Icon = ({ children, className }) => (
  <svg className={className} viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
    {children}
  </svg>
);

const OutlineIcon = ({ children, className }) => (
  <svg className={className} viewBox="0 0 24 24" fill="none" aria-hidden="true">
    {children}
  </svg>
);

const CoinIcon = () => (
  <span className="revvo-saque__coinIcon" aria-hidden="true">
    <i />
    <i />
    <i />
    <i />
  </span>
);

const PixIcon = () => (
  <Icon className="revvo-saque__smallSvg">
    <path d="M13.5 6.5 11 4 4 11l7 7 2.5-2.5L9 11l4.5-4.5Zm-3 11 2.5 2.5L20 13l-7-7-2.5 2.5L15 13l-4.5 4.5Z" />
  </Icon>
);

const BankIcon = () => (
  <Icon className="revvo-saque__smallSvg">
    <path d="M12 2 2 7l10 5 10-5-10-5Zm0 7.2L4.2 6.9 12 3.6l7.8 3.3L12 9.2ZM2 17l10 5 10-5v-6l-10 5-10-5v6Z" />
  </Icon>
);

const GiftIcon = () => (
  <Icon className="revvo-saque__smallSvg">
    <path d="M20 7h-1V5a2 2 0 0 0-2-2H7a2 2 0 0 0-2 2v2H4a2 2 0 0 0-2 2v1h20V9a2 2 0 0 0-2-2Zm-3 0H7V5h10v2Zm-5 14H9v-9h3v9Zm5 0h-3v-9h3v9ZM2 12v10a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2V12H2Z" />
  </Icon>
);

const RocketIcon = () => (
  <Icon className="revvo-saque__smallSvg">
    <path d="M12.5 2.5c3.4 1.1 6 3.8 7 7.1.2.7-.2 1.4-.8 1.6l-3.1 1.1-1.1 3.1c-.2.6-.9 1-1.6.8-3.3-1-6-3.6-7.1-7-.2-.7.2-1.4.8-1.6l3.1-1.1 1.1-3.1c.2-.6.9-1 1.6-.8Zm-2 9.9 3.6-3.6-1.1-1.1-3.6 3.6 1.1 1.1Z" />
  </Icon>
);

const LockIcon = () => (
  <Icon className="revvo-saque__lockSvg">
    <path d="M17 10V8a5 5 0 0 0-10 0v2H5v12h14V10h-2Zm-8 0V8a3 3 0 0 1 6 0v2H9Zm3 6.1a2 2 0 1 1-2 0V14h2v2.1Z" />
  </Icon>
);

const PaperPlaneIcon = () => (
  <Icon className="revvo-saque__ctaSvg">
    <path d="M2 21l21-9L2 3v7l16 2-16 2v7Z" />
  </Icon>
);

const EditIcon = () => (
  <OutlineIcon className="revvo-saque__editSvg">
    <path
      d="M12 20h9"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
    />
    <path
      d="M16.5 3.5a2.1 2.1 0 0 1 3 3L8 18l-4 1 1-4 11.5-11.5Z"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    />
  </OutlineIcon>
);

const WalletSummaryIcon = () => (
  <OutlineIcon className="revvo-saque__summarySvg">
    <path
      d="M3 8h18v11H3V8Zm2-2V6a4 4 0 0 1 8 0v2"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
    />
    <path d="M16 14.5h4" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
  </OutlineIcon>
);

const MoneySummaryIcon = () => (
  <OutlineIcon className="revvo-saque__summarySvg">
    <rect x="3" y="6" width="18" height="12" rx="2" stroke="currentColor" strokeWidth="1.8" />
    <circle cx="12" cy="12" r="2.5" stroke="currentColor" strokeWidth="1.8" />
    <path d="M12 14.5v4" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
    <path d="M9.5 18.5h5" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
  </OutlineIcon>
);

const ClockSummaryIcon = () => (
  <OutlineIcon className="revvo-saque__summarySvg">
    <circle cx="12" cy="12" r="8" stroke="currentColor" strokeWidth="1.8" />
    <path d="M12 8v4.2l2.8 2.8" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
  </OutlineIcon>
);

const Chevron = () => (
  <OutlineIcon className="revvo-saque__chevron">
    <path d="m9 6 6 6-6 6" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
  </OutlineIcon>
);

const RevvoSaqueResgatePreview = () => {
  const navigate = useNavigate();
  const { scaleRef, innerRef } = useRevvoCanvasScale();

  const [activeOption, setActiveOption] = useState('pix');

  const [pixKey, setPixKey] = useState(revvoWalletMock.pixKey);
  const [customAmount, setCustomAmount] = useState(revvoWalletMock.selectedWithdrawAmount);
  const [isCustomAmount, setIsCustomAmount] = useState(false);
  const [withdrawAmount, setWithdrawAmount] = useState(revvoWalletMock.selectedWithdrawAmount);

  const [convertAmount, setConvertAmount] = useState(30);
  const [bonusToastOpen, setBonusToastOpen] = useState(false);
  const [pointsToUse, setPointsToUse] = useState(5000);

  const [toast, setToast] = useState({ open: false, title: '', message: '' });

  const availableBalance = revvoWalletMock.availableBalance;
  const feePercent = revvoWalletMock.feePercent;

  const effectiveAmount = isCustomAmount ? customAmount : withdrawAmount;
  const liquidAmount = effectiveAmount * (1 - feePercent / 100);

  const nav = useMemo(
    () => [
      { id: 'home', label: 'Home Revvo', path: '/dev/revvo-home', icon: <path d="M10 20v-6h4v6h5v-8h3L12 3 2 12h3v8h5Z" /> },
      { id: 'feed', label: 'Feed Revvo', path: '/dev/revvo-feed', icon: <path d="M19 3H5a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V5a2 2 0 0 0-2-2Zm-2 14H7v-2h10v2Zm0-4H7v-2h10v2Zm0-4H7V7h10v2Z" /> },
      { id: 'explore', label: 'Explorar', path: '/dev/revvo-missions', active: false, icon: <path d="M12 2a10 10 0 1 0 10 10A10 10 0 0 0 12 2Zm0 2a8 8 0 1 1-8 8 8 8 0 0 1 8-8Zm0 2.5A5.5 5.5 0 1 0 17.5 12 5.51 5.51 0 0 0 12 6.5Zm0 2A3.5 3.5 0 1 1 8.5 12 3.5 3.5 0 0 1 12 8.5Z" /> },
      { id: 'wallet', label: 'Carteira', path: '/dev/revvo-saque', active: true, icon: <path d="M12 2a10 10 0 1 0 10 10A10 10 0 0 0 12 2Zm-3 7h6v2H9V9Zm0 4h6v2H9v-2Z" /> },
      { id: 'profile', label: 'Perfil', path: '/dev/revvo-profile', icon: <path d="M12 12a4 4 0 1 0-4-4 4 4 0 0 0 4 4Zm0 2c-2.7 0-8 1.3-8 4v2h16v-2c0-2.7-5.3-4-8-4Z" /> },
    ],
    []
  );

  const showToast = (title, message) => {
    setToast({ open: true, title, message });
  };

  const handleRequestWithdraw = () => {
    showToast(
      'Solicitação enviada',
      `Seu saque de ${formatBrl(effectiveAmount)} está em processamento.`
    );
  };

  const handlePixKeyAlter = () => {
    setPixKey('joao.novo@email.com');
    showToast('Chave atualizada', 'Chave Pix atualizada (mock).');
  };

  const handleOptionAction = (kind) => {
    if (kind === 'convert') {
      showToast('Conversão simulada', `Conversão de ${formatBrl(convertAmount)} em andamento (mock).`);
      return;
    }
    if (kind === 'bonus') {
      showToast('Benefícios reservados', 'Seu resgate de bônus foi iniciado (mock).');
      return;
    }
    if (kind === 'missions') {
      showToast('Pontos aplicados', `Usando ${formatPoints(pointsToUse)} pontos em uma missão (mock).`);
      return;
    }
  };

  return (
    <div className="revvo-saque-app revvo-canvas-app">
      <div className="revvo-saque__scale revvo-canvas-scale" ref={scaleRef}>
        <div className="revvo-saque revvo-canvas-surface" ref={innerRef}>
          <section className="revvo-saque__top" aria-label="Saque e Resgate">
            <header className="revvo-saque__header">
              <button type="button" className="revvo-saque__backBtn" aria-label="Voltar" onClick={() => navigate('/dev/revvo-carteira')}>
                <OutlineIcon>
                  <path d="m15 6-6 6 6 6" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" />
                </OutlineIcon>
              </button>

              <div className="revvo-saque__pointsPillWrap">
                <button type="button" className="revvo-saque__pointsPill" onClick={() => console.log('[Revvo Saque] pontos')}>
                  <CoinIcon />
                  <span className="revvo-saque__pointsText">
                    <b>{formatPoints(revvoWalletMock.points)}</b>
                    <small>pontos</small>
                  </span>
                  <Chevron />
                </button>

                <button type="button" className="revvo-saque__bellBtn" aria-label="Notificações" onClick={() => console.log('[Revvo Saque] notificações')}>
                  <Icon>
                    <path d="M12 22a2.5 2.5 0 0 0 2.45-2h-4.9A2.5 2.5 0 0 0 12 22Zm7-6V11a7 7 0 0 0-5-6.71V4a2 2 0 1 0-4 0v.29A7 7 0 0 0 5 11v5l-2 2v1h18v-1l-2-2Z" />
                  </Icon>
                  <span className="revvo-saque__bellDot" aria-hidden="true" />
                </button>
              </div>
            </header>

            <div className="revvo-saque__titleBlock">
              <h1>Saque e Resgate 💸</h1>
              <p className="revvo-saque__titleSub">
                <span className="revvo-saque__titleSubLine">Transforme seus pontos e ganhos</span>
                <span className="revvo-saque__titleSubLine">em dinheiro ou benefícios!</span>
              </p>
            </div>

            <div className="revvo-saque__heroArt" aria-hidden="true">
              <img src="/banco/assets/revvo-wallet/revvo-wallet-hero-3d.png" alt="" decoding="async" />
              <span className="revvo-saque__heroSpark revvo-saque__heroSpark--1">✦</span>
              <span className="revvo-saque__heroSpark revvo-saque__heroSpark--2">★</span>
            </div>
          </section>

          <main className="revvo-saque__main">
            <section className="revvo-saque__balanceCard" aria-label="Saldo disponível">
              <div className="revvo-saque__balanceRow">
                <div className="revvo-saque__balanceMain">
                  <p className="revvo-saque__balanceLabel">Saldo disponível</p>
                  <strong className="revvo-saque__balanceValue">{formatBrl(revvoWalletMock.availableBalance)}</strong>
                  <div className="revvo-saque__pointsChip" aria-label="12.480 pontos">
                    <span className="revvo-saque__pointsChipCoin" aria-hidden="true">
                      <CoinIcon />
                    </span>
                    <span className="revvo-saque__pointsChipText">{formatPoints(revvoWalletMock.points)} pontos</span>
                  </div>
                </div>

                <div className="revvo-saque__balanceSide">
                  <p className="revvo-saque__balanceSideTitle">Seu saldo rende!</p>
                  <p className="revvo-saque__balanceSideRate">{revvoWalletMock.conversionRateText}</p>
                  <button type="button" className="revvo-saque__extractLink" onClick={() => console.log('[Revvo Saque] extrato')}>
                    Ver extrato <span aria-hidden="true">›</span>
                  </button>
                </div>
              </div>
            </section>

            <section className="revvo-saque__options" aria-label="Escolha uma opção">
              <button
                type="button"
                className={`revvo-saque__option ${activeOption === 'pix' ? 'is-active' : ''}`}
                onClick={() => setActiveOption('pix')}
              >
                <span className="revvo-saque__optionIcon revvo-saque__optionIcon--pix">
                  <PixIcon />
                </span>
                <span className="revvo-saque__optionText">
                  <b>Sacar via Pix</b>
                  <span>Dinheiro na sua conta</span>
                </span>
              </button>

              <button
                type="button"
                className={`revvo-saque__option ${activeOption === 'saldo' ? 'is-active' : ''}`}
                onClick={() => setActiveOption('saldo')}
              >
                <span className="revvo-saque__optionIcon revvo-saque__optionIcon--saldo">
                  <BankIcon />
                </span>
                <span className="revvo-saque__optionText">
                  <b>Converter em saldo AgilBank</b>
                  <span>Use como preferir</span>
                </span>
              </button>

              <button
                type="button"
                className={`revvo-saque__option ${activeOption === 'bonus' ? 'is-active' : ''}`}
                onClick={() => setActiveOption('bonus')}
              >
                <span className="revvo-saque__optionIcon revvo-saque__optionIcon--bonus">
                  <GiftIcon />
                </span>
                <span className="revvo-saque__optionText">
                  <b>Resgatar bônus</b>
                  <span>Cupons e benefícios</span>
                </span>
              </button>

              <button
                type="button"
                className={`revvo-saque__option ${activeOption === 'missoes' ? 'is-active' : ''}`}
                onClick={() => setActiveOption('missoes')}
              >
                <span className="revvo-saque__optionIcon revvo-saque__optionIcon--missoes">
                  <RocketIcon />
                </span>
                <span className="revvo-saque__optionText">
                  <b>Usar em missões</b>
                  <span>Impulsione seus ganhos</span>
                </span>
              </button>
            </section>

            {activeOption === 'pix' ? (
              <section className="revvo-saque__card" aria-label="Sacar via Pix">
                <div className="revvo-saque__cardHead">
                  <span className="revvo-saque__cardHeadIcon">
                    <PixIcon />
                  </span>
                  <div className="revvo-saque__cardHeadText">
                    <h2>Sacar via Pix</h2>
                    <p>Transferência rápida, segura e sem taxas.</p>
                  </div>
                  <span className="revvo-saque__feeBadge">Taxa: {feePercent}%</span>
                </div>

                <div className="revvo-saque__form">
                  <div className="revvo-saque__field">
                    <label>Chave Pix</label>
                    <div className="revvo-saque__inputBox">
                      <span className="revvo-saque__inputBoxPix" aria-hidden="true">
                        <PixIcon />
                      </span>
                      <span className="revvo-saque__inputBoxValue">{pixKey}</span>
                      <button type="button" className="revvo-saque__inputBoxLink" onClick={handlePixKeyAlter}>
                        Alterar <EditIcon />
                      </button>
                    </div>
                  </div>

                  <div className="revvo-saque__field">
                    <label>Valor do saque</label>
                    <div className="revvo-saque__inputBox revvo-saque__inputBox--amount">
                      <div className="revvo-saque__amountMain">
                        {isCustomAmount ? (
                          <input
                            type="number"
                            inputMode="decimal"
                            step="0.01"
                            className="revvo-saque__amountInput"
                            value={customAmount}
                            onChange={(e) => setCustomAmount(Number(e.target.value))}
                            aria-label="Valor do saque"
                          />
                        ) : (
                          <span className="revvo-saque__amountValue">{formatBrl(withdrawAmount)}</span>
                        )}
                      </div>
                      <button
                        type="button"
                        className="revvo-saque__inputBoxLink"
                        onClick={() => {
                          setIsCustomAmount(false);
                          setWithdrawAmount(Number(availableBalance.toFixed(2)));
                        }}
                      >
                        Usar saldo total
                      </button>
                    </div>

                    <div className="revvo-saque__quickGrid" aria-label="Valores rápidos">
                      {[10, 20, 30, 50].map((v) => {
                        const isSelected = !isCustomAmount && withdrawAmount === v;
                        return (
                          <button
                            key={v}
                            type="button"
                            className={`revvo-saque__quick ${isSelected ? 'is-selected' : ''}`}
                            onClick={() => {
                              setIsCustomAmount(false);
                              setWithdrawAmount(v);
                            }}
                          >
                            R$ {v},00
                          </button>
                        );
                      })}
                      <button
                        type="button"
                        className={`revvo-saque__quick revvo-saque__quick--other ${isCustomAmount ? 'is-selected' : ''}`}
                        onClick={() => {
                          setIsCustomAmount(true);
                          setCustomAmount(withdrawAmount);
                        }}
                      >
                        Outro
                      </button>
                    </div>
                  </div>

                  <div className="revvo-saque__summary" aria-label="Resumo do saque">
                    <div className="revvo-saque__summaryItem">
                      <span className="revvo-saque__summaryIcon revvo-saque__summaryIcon--wallet" aria-hidden="true">
                        <WalletSummaryIcon />
                      </span>
                      <small>Valor solicitado</small>
                      <strong>{formatBrl(effectiveAmount)}</strong>
                    </div>
                    <div className="revvo-saque__summaryItem revvo-saque__summaryItem--liquid">
                      <span className="revvo-saque__summaryIcon revvo-saque__summaryIcon--money" aria-hidden="true">
                        <MoneySummaryIcon />
                      </span>
                      <small>Valor líquido</small>
                      <strong>{formatBrl(liquidAmount)}</strong>
                    </div>
                    <div className="revvo-saque__summaryItem">
                      <span className="revvo-saque__summaryIcon revvo-saque__summaryIcon--clock" aria-hidden="true">
                        <ClockSummaryIcon />
                      </span>
                      <small>Prazo estimado</small>
                      <strong className="revvo-saque__summaryEta">{revvoWalletMock.estimatedTime}</strong>
                    </div>
                  </div>
                </div>
              </section>
            ) : null}

            {activeOption === 'saldo' ? (
              <section className="revvo-saque__card" aria-label="Converter em saldo AgilBank">
                <h2 className="revvo-saque__cardSimpleTitle">Converter em saldo AgilBank</h2>
                <p className="revvo-saque__cardSimpleText">Use seus ganhos como saldo dentro do AgilBank.</p>

                <div className="revvo-saque__simpleBalance">
                  <span>Valor disponível</span>
                  <strong>{formatBrl(availableBalance)}</strong>
                </div>

                <div className="revvo-saque__field">
                  <label>Valor</label>
                  <div className="revvo-saque__fieldRow">
                    <div className="revvo-saque__amountInputWrap">
                      <span className="revvo-saque__amountPrefix">R$</span>
                      <input
                        type="number"
                        inputMode="decimal"
                        step="0.01"
                        value={convertAmount}
                        onChange={(e) => setConvertAmount(Number(e.target.value))}
                        aria-label="Valor da conversão"
                      />
                    </div>
                  </div>
                </div>

                <button type="button" className="revvo-saque__primaryBtn" onClick={() => handleOptionAction('convert')}>
                  Converter agora <PaperPlaneIcon />
                </button>
              </section>
            ) : null}

            {activeOption === 'bonus' ? (
              <section className="revvo-saque__card" aria-label="Resgatar bônus">
                <h2 className="revvo-saque__cardSimpleTitle">Resgatar bônus</h2>
                <p className="revvo-saque__cardSimpleText">Cupons e benefícios para turbinar suas missões.</p>

                <div className="revvo-saque__bonusGrid">
                  {[
                    { title: 'Bônus de R$ 5', tone: 'green' },
                    { title: 'Cupom especial', tone: 'purple' },
                    { title: 'Dobro de pontos por 24h', tone: 'blue' },
                  ].map((b) => (
                    <div key={b.title} className={`revvo-saque__bonusItem revvo-saque__bonusItem--${b.tone}`}>
                      {b.title}
                    </div>
                  ))}
                </div>

                <button
                  type="button"
                  className="revvo-saque__primaryBtn"
                  onClick={() => handleOptionAction('bonus')}
                >
                  Resgatar <PaperPlaneIcon />
                </button>
              </section>
            ) : null}

            {activeOption === 'missoes' ? (
              <section className="revvo-saque__card" aria-label="Usar em missões">
                <h2 className="revvo-saque__cardSimpleTitle">Impulsione uma missão</h2>
                <p className="revvo-saque__cardSimpleText">
                  Use pontos para destacar uma missão ou aumentar sua recompensa.
                </p>

                <div className="revvo-saque__field">
                  <label>Pontos</label>
                  <div className="revvo-saque__fieldRow">
                    <div className="revvo-saque__amountInputWrap">
                      <input
                        type="number"
                        inputMode="numeric"
                        step="1"
                        value={pointsToUse}
                        onChange={(e) => setPointsToUse(Number(e.target.value))}
                        aria-label="Pontos para usar"
                      />
                      <span className="revvo-saque__amountSuffix">pontos</span>
                    </div>
                  </div>
                </div>

                <button
                  type="button"
                  className="revvo-saque__primaryBtn"
                  onClick={() => handleOptionAction('missions')}
                >
                  Usar pontos <PaperPlaneIcon />
                </button>
              </section>
            ) : null}

            {activeOption === 'pix' ? (
              <>
                <section className="revvo-saque__security" aria-label="Card de segurança">
                  <div className="revvo-saque__securityHead">
                    <LockIcon />
                    <div>
                      <h2>Seguro e confiável</h2>
                      <p>
                        Seu saque é processado com segurança. Pagamentos realizados apenas para contas de mesma titularidade.
                      </p>
                    </div>
                  </div>
                </section>

                <button
                  type="button"
                  className="revvo-saque__primaryBtn revvo-saque__primaryBtn--wide"
                  onClick={handleRequestWithdraw}
                >
                  Solicitar saque <PaperPlaneIcon />
                </button>

                <p className="revvo-saque__terms">
                  Ao solicitar, você concorda com nossos{' '}
                  <button type="button" className="revvo-saque__termsLink" onClick={() => showToast('Termos de Uso', 'Termos exibidos (mock).')}>
                    Termos de Uso
                  </button>
                  .
                </p>
              </>
            ) : null}
          </main>

          <nav className="revvo-saque__bottomNav" aria-label="Navegação principal">
            {nav.map(({ id, label, icon, path, active }) => (
              <button
                key={id}
                type="button"
                className={active ? 'is-active' : ''}
                onClick={() => path && navigate(path)}
                aria-current={active ? 'page' : undefined}
              >
                <span className="revvo-saque__navIconWrap">
                  {active ? <span className="revvo-saque__navActiveMark">R</span> : <Icon className="revvo-saque__navIcon">{icon}</Icon>}
                </span>
                <span className="revvo-saque__navLabel">{label}</span>
              </button>
            ))}
          </nav>

          {toast.open ? (
            <div className="revvo-saque__toastOverlay" role="dialog" aria-modal="true">
              <div className="revvo-saque__toastCard">
                <h3>{toast.title}</h3>
                <p>{toast.message}</p>
                <button type="button" className="revvo-saque__toastOk" onClick={() => setToast({ open: false, title: '', message: '' })}>
                  Ok
                </button>
              </div>
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
};

export default RevvoSaqueResgatePreview;

