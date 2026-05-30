import React, { useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { useRevvoCanvasScale } from '../../hooks/useRevvoCanvasScale';
import './RevvoWalletPreview.css';

const walletData = {
  balanceRvc: 2480,
  balanceBrl: 74.4,
  availableRvc: 2480,
  pendingRvc: 780,
  reviewingRvc: 350,
  monthTotalRvc: 3610,
  withdrawMinRvc: 3000,
  missingToWithdrawRvc: 520,
  streakDays: 7,
  recentEarnings: [
    { id: 'earn_1', platform: 'Instagram', title: 'Curtir post da Adidas', dateLabel: 'Hoje 10:21', status: 'Pago', amountRvc: 30 },
    { id: 'earn_2', platform: 'TikTok', title: 'Seguir @nikebrasil', dateLabel: 'Hoje 09:45', status: 'Pago', amountRvc: 25 },
    { id: 'earn_3', platform: 'YouTube', title: 'Assistir video completo', dateLabel: 'Ontem 21:15', status: 'Aguardando', amountRvc: 80 },
    { id: 'earn_4', platform: 'X', title: 'Repostar no X (Twitter)', dateLabel: 'Ontem 20:30', status: 'Pago', amountRvc: 15 }
  ],
  lastWithdrawal: {
    method: 'PIX',
    destination: '41.***.***-58',
    date: '12/05/2025 - 14:32',
    status: 'Pago',
    amountBrl: 120
  },
  weeklyGoal: { current: 3240, target: 5000 },
  dailyStreak: { current: 7, target: 14 },
  helpLinks: [
    { id: 'withdraw_rules', label: 'Regras de saque', tone: 'green', icon: 'shield' },
    { id: 'how_it_works', label: 'Como funciona', tone: 'blue', icon: 'spark' },
    { id: 'fees_deadlines', label: 'Taxas e prazos', tone: 'purple', icon: 'clock' },
    { id: 'faq', label: 'Duvidas frequentes', tone: 'gold', icon: 'chat' }
  ]
};

const ASSETS = {
  walletHero: '/banco/assets/revvo-wallet/revvo-wallet-hero-3d.png?v=2',
  streakMedal: '/banco/assets/revvo-wallet/revvo-wallet-streak-medal-3d.png',
  invite: '/banco/assets/revvo-home-v2/revvo-home-v2-invite-3d.png'
};

const formatRvc = (value) => value.toLocaleString('pt-BR');
const formatBrl = (value) => value.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
const pct = (current, target) => `${Math.min(100, Math.round((current / target) * 100))}%`;

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

const Chevron = () => (
  <OutlineIcon>
    <path d="m9 6 6 6-6 6" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
  </OutlineIcon>
);

const PixMark = ({ className = '' }) => (
  <span className={`revvo-wallet__pixMark ${className}`} aria-hidden="true">
    <i />
    <i />
    <i />
    <i />
  </span>
);

const HelpIcon = ({ type }) => {
  if (type === 'shield') {
    return (
      <Icon>
        <path d="M12 2 4 5.5v5.6c0 4.9 3.3 8.9 8 10.4 4.7-1.5 8-5.5 8-10.4V5.5L12 2Zm-1 13.6-3.1-3.1 1.3-1.4 1.8 1.8 4.1-4.3 1.4 1.4-5.5 5.6Z" />
      </Icon>
    );
  }
  if (type === 'clock') {
    return (
      <Icon>
        <path d="M12 2a10 10 0 1 0 10 10A10 10 0 0 0 12 2Zm1 5h-2v6l5 3 1-1.7-4-2.3V7Z" />
      </Icon>
    );
  }
  if (type === 'chat') {
    return (
      <Icon>
        <path d="M4 4h16v11H8.7L4 19.4V4Zm5 5h6V7H9v2Zm0 4h9v-2H9v2Z" />
      </Icon>
    );
  }
  return (
    <Icon>
      <path d="m12 2 1.6 5.2L19 9l-5.4 1.8L12 16l-1.6-5.2L5 9l5.4-1.8L12 2Zm6 12 .8 2.6 2.7.9-2.7.9L18 21l-.8-2.6-2.7-.9 2.7-.9L18 14Z" />
    </Icon>
  );
};

const PlatformMark = ({ platform }) => {
  const key = platform.toLowerCase();
  const labels = {
    instagram: '◎',
    tiktok: '♪',
    youtube: '▶',
    x: 'X'
  };
  return <span className={`revvo-wallet__platform revvo-wallet__platform--${key}`}>{labels[key] || platform.slice(0, 1)}</span>;
};

const RevvoWalletPreview = () => {
  const navigate = useNavigate();
  const { scaleRef, innerRef } = useRevvoCanvasScale();
  const progress = pct(walletData.availableRvc, walletData.withdrawMinRvc);

  const metrics = useMemo(
    () => [
      {
        id: 'available',
        label: 'Disponivel',
        value: walletData.availableRvc,
        tone: 'green',
        icon: <path d="m9.2 16.6-4.1-4.1 1.6-1.6 2.5 2.5 7.9-7.9 1.6 1.6-9.5 9.5Z" />
      },
      {
        id: 'pending',
        label: 'Aguardando',
        value: walletData.pendingRvc,
        tone: 'yellow',
        icon: <path d="M12 2a10 10 0 1 0 10 10A10 10 0 0 0 12 2Zm1 5h-2v6l5 3 1-1.7-4-2.3V7Z" />
      },
      {
        id: 'reviewing',
        label: 'Em analise',
        value: walletData.reviewingRvc,
        tone: 'purple',
        icon: <path d="M9.8 4a5.8 5.8 0 0 1 4.6 9.34l4.13 4.13-1.41 1.41-4.13-4.13A5.8 5.8 0 1 1 9.8 4Zm0 2a3.8 3.8 0 1 0 0 7.6 3.8 3.8 0 0 0 0-7.6Z" />
      },
      {
        id: 'month',
        label: 'Total este mes',
        value: walletData.monthTotalRvc,
        tone: 'blue',
        icon: <path d="M4 19h16v2H4v-2Zm2-2h3V9H6v8Zm5 0h3V5h-3v12Zm5 0h3v-6h-3v6Z" />
      }
    ],
    []
  );

  const nav = useMemo(
    () => [
      { id: 'home', label: 'Inicio', path: '/dev/revvo-home', icon: <path d="M10 20v-6h4v6h5v-8h3L12 3 2 12h3v8h5Z" /> },
      { id: 'missions', label: 'Missoes', path: '/dev/revvo-missions', icon: <path d="M12 2a10 10 0 1 0 10 10A10 10 0 0 0 12 2Zm0 4a6 6 0 1 1-6 6 6 6 0 0 1 6-6Z" /> },
      { id: 'wallet', label: 'Ganhos', active: true, icon: <path d="M12 2a10 10 0 1 0 10 10A10 10 0 0 0 12 2Zm-3 7h6v2H9V9Zm0 4h6v2H9v-2Z" /> },
      { id: 'ranking', label: 'Ranking', path: '/dev/revvo-ranking', icon: <path d="M4 20h16v-2H4v2Zm2-4h3V9H6v7Zm5 0h3V5h-3v11Zm5 0h3v-4h-3v4Z" /> },
      { id: 'profile', label: 'Perfil', path: '/dev/revvo-profile', icon: <path d="M12 12a4 4 0 1 0-4-4 4 4 0 0 0 4 4Zm0 2c-2.67 0-8 1.34-8 4v2h16v-2c0-2.66-5.33-4-8-4Z" /> }
    ],
    []
  );

  return (
    <div className="revvo-wallet-app revvo-canvas-app">
      <div className="revvo-wallet__scale revvo-canvas-scale" ref={scaleRef}>
        <div className="revvo-wallet revvo-canvas-surface" ref={innerRef}>
          <section className="revvo-wallet-top">
            <header className="revvo-wallet__header">
              <button type="button" className="revvo-wallet__headerBtn" aria-label="Voltar" onClick={() => navigate('/dev/revvo-home')}>
                <OutlineIcon>
                  <path d="M15 18 9 12l6-6" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
                </OutlineIcon>
              </button>
              <div className="revvo-wallet__titleBlock">
                <h1>Carteira Revvo</h1>
                <p>Acompanhe seus ganhos e saque via PIX</p>
              </div>
              <button type="button" className="revvo-wallet__headerBtn revvo-wallet__bell" aria-label="Notificacoes">
                <Icon>
                  <path d="M12 22a2.5 2.5 0 0 0 2.45-2h-4.9A2.5 2.5 0 0 0 12 22Zm7-6V11a7 7 0 0 0-5-6.71V4a2 2 0 1 0-4 0v.29A7 7 0 0 0 5 11v5l-2 2v1h18v-1l-2-2Z" />
                </Icon>
                <span>3</span>
              </button>
            </header>

            <article className="revvo-wallet__hero" aria-label="Saldo disponivel">
              <div className="revvo-wallet__heroCopy">
                <p className="revvo-wallet__balanceLabel">Saldo disponivel</p>
                <div className="revvo-wallet__balanceLine">
                  <span className="revvo-wallet__coin">R</span>
                  <strong>{formatRvc(walletData.balanceRvc)}</strong>
                </div>
                <p className="revvo-wallet__brl">≈ {formatBrl(walletData.balanceBrl)}</p>
                <button type="button" className="revvo-wallet__pixButton">
                  <PixMark />
                  Sacar via PIX
                  <Chevron />
                </button>
              </div>
              <div className="revvo-wallet__heroArt" aria-hidden="true">
                <img src={ASSETS.walletHero} alt="" decoding="async" />
              </div>
            </article>

            <section className="revvo-wallet__metrics" aria-label="Resumo da carteira">
              {metrics.map((metric) => (
                <article key={metric.id} className="revvo-wallet__metric">
                  <span className={`revvo-wallet__metricIcon revvo-wallet__metricIcon--${metric.tone}`}>
                    <Icon>{metric.icon}</Icon>
                  </span>
                  <div className="revvo-wallet__metricBody">
                    <p>{metric.label}</p>
                    <div className="revvo-wallet__metricValue">
                      <strong>{formatRvc(metric.value)}</strong>
                      <small>RVC</small>
                    </div>
                  </div>
                </article>
              ))}
            </section>
          </section>

          <main className="revvo-wallet-body">
            <section className="revvo-wallet__card revvo-wallet__withdraw" aria-label="Proximo saque disponivel">
              <div className="revvo-wallet__withdrawMain">
                <div className="revvo-wallet__sectionHead revvo-wallet__sectionHead--inline">
                  <h2>Proximo saque disponivel</h2>
                  <span>Liberacao automatica</span>
                </div>
                <p>
                  Faltam <strong>{formatRvc(walletData.missingToWithdrawRvc)} RVC</strong> para liberar novo saque
                </p>
                <div className="revvo-wallet__progress" aria-hidden="true">
                  <i style={{ width: progress }} />
                </div>
                <p className="revvo-wallet__withdrawProgress">{formatRvc(walletData.availableRvc)} / {formatRvc(walletData.withdrawMinRvc)} RVC</p>
              </div>
              <aside className="revvo-wallet__streak">
                <img
                  className="revvo-wallet__streakMedal"
                  src={ASSETS.streakMedal}
                  alt=""
                  width="52"
                  height="65"
                  decoding="async"
                />
                <div className="revvo-wallet__streakCopy">
                  <p>Consistencia</p>
                  <strong>{walletData.streakDays} dias</strong>
                  <span>ganhando</span>
                </div>
              </aside>
            </section>

            <section className="revvo-wallet__card revvo-wallet__earnings" aria-label="Ganhos recentes">
              <div className="revvo-wallet__sectionHead revvo-wallet__sectionHead--plain">
                <h2>Ganhos recentes</h2>
                <button type="button">Ver tudo <Chevron /></button>
              </div>
              <div className="revvo-wallet__earningsList">
                {walletData.recentEarnings.map((earning) => {
                  const paid = earning.status === 'Pago';
                  return (
                    <article key={earning.id} className="revvo-wallet__earning">
                      <PlatformMark platform={earning.platform} />
                      <div className="revvo-wallet__earningCopy">
                        <h3>{earning.title}</h3>
                        <p>Concluida • {earning.dateLabel}</p>
                      </div>
                      <div className="revvo-wallet__earningValue">
                        <span className={paid ? 'is-paid' : 'is-pending'}>{earning.status}</span>
                        <strong className={paid ? 'is-paid' : 'is-pending'}>+{earning.amountRvc} RVC</strong>
                      </div>
                      <Chevron />
                    </article>
                  );
                })}
              </div>
            </section>

            <section className="revvo-wallet__split" aria-label="Saques e indicacoes">
              <div className="revvo-wallet__sectionHead revvo-wallet__sectionHead--plain">
                <h2>Meus saques</h2>
                <button type="button">Ver historico</button>
              </div>
              <div className="revvo-wallet__splitGrid">
                <div className="revvo-wallet__withdrawalBox">
                  <span className="revvo-wallet__withdrawalIcon" aria-hidden="true">
                    <PixMark />
                  </span>
                  <div className="revvo-wallet__withdrawalBody">
                    <div className="revvo-wallet__withdrawalRow">
                      <h3>Saque via {walletData.lastWithdrawal.method}</h3>
                      <span className="revvo-wallet__withdrawalStatus">{walletData.lastWithdrawal.status}</span>
                    </div>
                    <div className="revvo-wallet__withdrawalRow revvo-wallet__withdrawalRow--meta">
                      <p>
                        Enviado para {walletData.lastWithdrawal.destination}
                        <br />
                        {walletData.lastWithdrawal.date}
                      </p>
                      <strong>{formatBrl(walletData.lastWithdrawal.amountBrl)}</strong>
                    </div>
                  </div>
                </div>
                <article className="revvo-wallet__invite">
                  <div>
                    <h2>Indique e ganhe 10%</h2>
                    <p>dos ganhos de amigos</p>
                    <button type="button">Convidar</button>
                  </div>
                  <img src={ASSETS.invite} alt="" width="126" height="126" decoding="async" />
                  <Chevron />
                </article>
              </div>
            </section>

            <section className="revvo-wallet__card revvo-wallet__goals" aria-label="Metas e recompensas">
              <div className="revvo-wallet__sectionHead revvo-wallet__sectionHead--plain">
                <h2>Metas e recompensas</h2>
                <button type="button">Ver todas as metas <Chevron /></button>
              </div>
              <div className="revvo-wallet__goalGrid">
                <article className="revvo-wallet__goal">
                  <span className="revvo-wallet__goalIcon revvo-wallet__goalIcon--blue">
                    <Icon><path d="M12 2a10 10 0 1 0 10 10A10 10 0 0 0 12 2Zm0 4a6 6 0 1 1-6 6 6 6 0 0 1 6-6Zm0 3a3 3 0 1 0 3 3 3 3 0 0 0-3-3Z" /></Icon>
                  </span>
                  <h3>Meta semanal</h3>
                  <p>Ganhe 5.000 RVC esta semana</p>
                  <div className="revvo-wallet__goalBar" aria-hidden="true">
                    <span style={{ width: pct(walletData.weeklyGoal.current, walletData.weeklyGoal.target) }} />
                  </div>
                  <p className="revvo-wallet__goalValue">
                    {formatRvc(walletData.weeklyGoal.current)} / {formatRvc(walletData.weeklyGoal.target)} RVC
                  </p>
                </article>
                <article className="revvo-wallet__goal revvo-wallet__goal--streak">
                  <span className="revvo-wallet__goalIcon revvo-wallet__goalIcon--orange">
                    <Icon><path d="M13.5.67c-.32.66-1.04 2.12-1.93 4.13-.86 1.93-1.9 4.22-2.67 6.16-.77-1.94-1.81-4.23-2.67-6.16C5.34 2.79 4.62 1.33 4.3.67 3.79 2.17 5.07 1 6.5 1c1.2 0 2.17.72 2.67 1.67C9.67 1.72 10.64 1 11.84 1c1.43 0 2.71 1.17 2.83 2.67ZM12 22c-2.76 0-5-2.24-5-5 0-1.53.69-2.9 1.78-3.83.55 2.46 2.18 5.08 3.22 6.83 1.04-1.75 2.67-4.37 3.22-6.83A4.98 4.98 0 0 1 17 17c0 2.76-2.24 5-5 5Z" /></Icon>
                  </span>
                  <h3>Sequencia diaria</h3>
                  <p>Complete missoes por 14 dias</p>
                  <div className="revvo-wallet__goalBar" aria-hidden="true">
                    <span style={{ width: pct(walletData.dailyStreak.current, walletData.dailyStreak.target) }} />
                  </div>
                  <p className="revvo-wallet__goalValue">
                    {walletData.dailyStreak.current} / {walletData.dailyStreak.target} dias
                  </p>
                </article>
              </div>
            </section>

            <section className="revvo-wallet__help" aria-label="Ajuda e regras">
              {walletData.helpLinks.map((item) => (
                <button key={item.id} type="button" className={`revvo-wallet__helpBtn revvo-wallet__helpBtn--${item.tone}`}>
                  <span>
                    <HelpIcon type={item.icon} />
                  </span>
                  <b>{item.label}</b>
                  <Chevron />
                </button>
              ))}
            </section>
          </main>

          <nav className="revvo-wallet-bottom-nav" aria-label="Navegacao principal">
            {nav.map((item) => (
              <button key={item.id} type="button" className={item.active ? 'is-active' : ''} onClick={() => item.path && navigate(item.path)} aria-current={item.active ? 'page' : undefined}>
                <span className="revvo-wallet__navIcon">
                  {item.active ? <b>R</b> : <Icon>{item.icon}</Icon>}
                </span>
                <small>{item.label}</small>
              </button>
            ))}
          </nav>
        </div>
      </div>
    </div>
  );
};

export default RevvoWalletPreview;
