import React, { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useRevvoCanvasScale } from '../../hooks/useRevvoCanvasScale';
import './RevvoHomePreview.css';

const formatRvc = (value) => value.toLocaleString('pt-BR');

const ASSETS = {
  trophy: '/banco/assets/revvo-home-v2/revvo-home-v2-trophy-cutout-3d.png',
  campaign: '/banco/assets/revvo-home-v2/revvo-home-v2-campaign-3d.png',
  megaphone: '/banco/assets/revvo-home-v2/revvo-home-v2-megaphone-3d.png',
  invite: '/banco/assets/revvo-home-v2/revvo-home-v2-invite-3d.png',
  badge: '/banco/assets/revvo-home-v2/revvo-home-v2-badge-3d.png',
  store: '/banco/assets/revvo-home-v2/revvo-home-v2-store-3d.png',
  avatar: '/banco/assets/revvo-home-v2/revvo-home-v2-avatar-camila.png'
};

const Icon = ({ children, className }) => (
  <svg className={className} viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
    {children}
  </svg>
);

const RevvoLogo = () => (
  <div className="revvo-preview__logo" aria-label="Revvo">
    <span className="revvo-preview__logoMark">R</span>
    <span className="revvo-preview__logoText">Revvo</span>
  </div>
);

const RevvoHomePreview = () => {
  const navigate = useNavigate();
  const { scaleRef, innerRef } = useRevvoCanvasScale();
  const [showBalance, setShowBalance] = useState(true);

  const shortcuts = useMemo(
    () => [
      {
        id: 'missions',
        label: 'Missões',
        icon: (
          <Icon>
            <path d="M12 2a10 10 0 1 0 10 10A10 10 0 0 0 12 2Zm0 2a8 8 0 1 1-8 8 8 8 0 0 1 8-8Zm0 2.5A5.5 5.5 0 1 0 17.5 12 5.51 5.51 0 0 0 12 6.5Zm0 2A3.5 3.5 0 1 1 8.5 12 3.5 3.5 0 0 1 12 8.5Z" />
          </Icon>
        )
      },
      {
        id: 'wallet',
        label: 'Carteira',
        icon: (
          <Icon>
            <path d="M20 4H4a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2V6a2 2 0 0 0-2-2Zm0 14H4V8h16v10Zm-2-6h-2a2 2 0 1 0 0 4h2v-4Z" />
          </Icon>
        )
      },
      {
        id: 'ranking',
        label: 'Ranking',
        icon: (
          <Icon>
            <path d="M4 20h16v-2H4v2Zm2-4h3V9H6v7Zm5 0h3V5h-3v11Zm5 0h3V12h-3v4Z" />
          </Icon>
        )
      },
      {
        id: 'achievements',
        label: 'Conquistas',
        icon: (
          <Icon>
            <path d="M12 2l2.2 4.5 4.9.7-3.5 3.4.8 4.9L12 13.8 7.6 15.5l.8-4.9L5 7.2l4.9-.7L12 2Zm0 4.2-1.1 2.2-2.4.4 1.7 1.7-.4 2.4 2.2-1.2 2.2 1.2-.4-2.4 1.7-1.7-2.4-.4L12 6.2Z" />
          </Icon>
        )
      },
      {
        id: 'all',
        label: 'Ver tudo',
        icon: (
          <Icon>
            <path d="M4 8h4V4H4v4Zm6 12h4v-4h-4v4Zm-6 0h4v-4H4v4Zm0-6h4v-4H4v4Zm6 0h4v-4h-4v4Zm6-10v4h4V4h-4Zm0 6h4v-4h-4v4Zm0 6h4v-4h-4v4Zm0 6h4v-4h-4v4Z" />
          </Icon>
        )
      }
    ],
    []
  );

  const todayCards = useMemo(
    () => [
      {
        id: 'open',
        tone: 'green',
        title: 'Missões abertas',
        value: '12 disponíveis',
        hint: 'Ganhe até 320 RVC hoje',
        icon: (
          <Icon>
            <path d="M14.4 6 14 4H5v17h2v-7h5.6l.4 2h7.4V8h-6.4l.4-2Z" />
          </Icon>
        )
      },
      {
        id: 'streak',
        tone: 'orange',
        title: 'Sua sequência',
        value: '7 dias seguidos',
        hint: 'Mantenha o ritmo!',
        icon: (
          <Icon>
            <path d="M13.5.67c-.32.66-1.04 2.12-1.93 4.13-.86 1.93-1.9 4.22-2.67 6.16-.77-1.94-1.81-4.23-2.67-6.16-.89-2.01-1.61-3.47-1.93-4.13C3.79 2.17 5.07 1 6.5 1c1.2 0 2.17.72 2.67 1.67.5-.95 1.47-1.67 2.67-1.67 1.43 0 2.71 1.17 2.83 2.67ZM12 22c-2.76 0-5-2.24-5-5 0-1.53.69-2.9 1.78-3.83.55 2.46 2.18 5.08 3.22 6.83 1.04-1.75 2.67-4.37 3.22-6.83A4.98 4.98 0 0 1 17 17c0 2.76-2.24 5-5 5Z" />
          </Icon>
        )
      },
      {
        id: 'ranking',
        tone: 'purple',
        title: 'Ranking semanal',
        value: 'Você está em #14',
        hint: 'Top 10 está perto',
        icon: (
          <Icon>
            <path d="M19 5h-2V3H7v2H5c-1.1 0-2 .9-2 2v2c0 2.55 1.92 4.63 4.39 4.94.63 1.5 1.98 2.63 3.61 2.96V19H7v2h10v-2h-4v-4.1c1.63-.33 2.98-1.46 3.61-2.96C19.08 11.63 21 9.55 21 7V7c0-1.1-.9-2-2-2ZM5 7V5h2v6.82C5.55 11.1 5 9.14 5 7Zm14 0c0 2.14-.55 4.1-2 5.82V5h2v2Z" />
          </Icon>
        )
      }
    ],
    []
  );

  const discoverCards = useMemo(
    () => [
      {
        id: 'sponsored',
        title: 'Missões patrocinadas',
        subtitle: 'Descubra campanhas e ganhe mais RVC.',
        imageSrc: ASSETS.megaphone,
        tone: 'blue'
      },
      {
        id: 'invite',
        title: 'Convide amigos e ganhe',
        subtitle: 'Convide, ajude e ganhe recompensas.',
        imageSrc: ASSETS.invite,
        tone: 'green'
      },
      {
        id: 'badges',
        title: 'Badges e metas',
        subtitle: 'Complete objetivos e suba de nível.',
        imageSrc: ASSETS.badge,
        tone: 'purple'
      },
      {
        id: 'store',
        title: 'Loja de benefícios',
        subtitle: 'Troque RVC por vantagens.',
        imageSrc: ASSETS.store,
        tone: 'pink'
      }
    ],
    []
  );

  const services = useMemo(
    () => [
      {
        id: 'feed',
        title: 'Feed',
        subtitle: 'Veja novidades',
        tone: 'blue',
        icon: (
          <Icon>
            <path d="M19 3H5a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V5a2 2 0 0 0-2-2Zm-2 14H7v-2h10v2Zm0-4H7v-2h10v2Zm0-4H7V7h10v2Z" />
          </Icon>
        )
      },
      {
        id: 'missions',
        title: 'Missões',
        subtitle: 'Curta, siga e ganhe',
        tone: 'blue',
        icon: (
          <Icon>
            <path d="M12 2a10 10 0 1 0 10 10A10 10 0 0 0 12 2Zm0 2a8 8 0 1 1-8 8 8 8 0 0 1 8-8Zm0 2.5A5.5 5.5 0 1 0 17.5 12 5.51 5.51 0 0 0 12 6.5Z" />
          </Icon>
        )
      },
      {
        id: 'pix',
        title: 'Saque PIX',
        subtitle: 'Converta RVC',
        tone: 'teal',
        icon: (
          <Icon>
            <path d="M13.5 6.5 11 4 4 11l7 7 2.5-2.5L9 11l4.5-4.5Zm-3 11 2.5 2.5L20 13l-7-7-2.5 2.5L15 13l-4.5 4.5Z" />
          </Icon>
        )
      },
      {
        id: 'profile',
        title: 'Perfil público',
        subtitle: 'Sua vitrine',
        tone: 'blue',
        icon: (
          <Icon>
            <path d="M12 12c2.21 0 4-1.79 4-4s-1.79-4-4-4-4 1.79-4 4 1.79 4 4 4Zm0 2c-2.67 0-8 1.34-8 4v2h16v-2c0-2.66-5.33-4-8-4Z" />
          </Icon>
        )
      },
      {
        id: 'messages',
        title: 'Mensagens',
        subtitle: 'Fale com marcas',
        tone: 'blue',
        icon: (
          <Icon>
            <path d="M20 2H4c-1.1 0-2 .9-2 2v18l4-4h14c1.1 0 2-.9 2-2V4c0-1.1-.9-2-2-2Zm0 14H5.17L4 17.17V4h16v12Z" />
          </Icon>
        )
      },
      {
        id: 'benefits',
        title: 'Loja/Benefícios',
        subtitle: 'Resgate vantagens',
        tone: 'blue',
        icon: (
          <Icon>
            <path d="M20 6h-2.18c.11-.31.18-.65.18-1a2.996 2.996 0 0 0-5.5-1.65l-.5.67-.5-.68C10.96 2.54 10.05 2 9 2 7.34 2 6 3.34 6 5c0 .35.07.69.18 1H4c-1.11 0-2 .89-2 2v11c0 1.11.89 2 2 2h16c1.11 0 2-.89 2-2V8c0-1.11-.89-2-2-2Zm-9-2c.55 0 1 .45 1 1s-.45 1-1 1-1-.45-1-1 .45-1 1-1Zm6 16H7v-2h10v2Zm0-4H7v-2h10v2Z" />
          </Icon>
        )
      }
    ],
    []
  );

  const bottomNav = useMemo(
    () => [
      { id: 'home', label: 'Início', active: true, icon: <path d="M10 20v-6h4v6h5v-8h3L12 3 2 12h3v8h5Z" /> },
      { id: 'missions', label: 'Missões', active: false, path: '/dev/revvo-missions', icon: <path d="M12 2a10 10 0 1 0 10 10A10 10 0 0 0 12 2Zm0 2a8 8 0 1 1-8 8 8 8 0 0 1 8-8Zm0 2.5A5.5 5.5 0 1 0 17.5 12 5.51 5.51 0 0 0 12 6.5Z" /> },
      { id: 'feed', label: 'Feed', active: false, path: '/dev/revvo-feed', icon: <path d="M19 3H5a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V5a2 2 0 0 0-2-2Zm-2 14H7v-2h10v2Zm0-4H7v-2h10v2Zm0-4H7V7h10v2Z" /> },
      { id: 'ranking', label: 'Ranking', active: false, path: '/dev/revvo-ranking', icon: <path d="M4 20h16v-2H4v2Zm2-4h3V9H6v7Zm5 0h3V5h-3v11Zm5 0h3V12h-3v4Z" /> },
      { id: 'profile', label: 'Perfil', active: false, path: '/dev/revvo-profile', icon: <path d="M12 12c2.21 0 4-1.79 4-4s-1.79-4-4-4-4 1.79-4 4 1.79 4 4 4Zm0 2c-2.67 0-8 1.34-8 4v2h16v-2c0-2.66-5.33-4-8-4Z" /> }
    ],
    []
  );

  const balanceRvc = 2480;
  const balanceBrl = 74.4;

  return (
    <div className="revvo-app revvo-canvas-app">
      <div className="revvo-preview__scale revvo-canvas-scale" ref={scaleRef}>
        <div className="revvo-preview revvo-canvas-surface" ref={innerRef}>
        <section className="revvo-preview__hero" aria-label="Área principal Revvo">
          <header className="revvo-preview__header">
            <RevvoLogo />
            <div className="revvo-preview__headerActions">
              <button type="button" className="revvo-preview__iconBtn revvo-preview__iconBtn--notif" aria-label="Notificações">
                <Icon>
                  <path d="M12 22a2.5 2.5 0 0 0 2.45-2h-4.9A2.5 2.5 0 0 0 12 22Zm7-6V11a7 7 0 0 0-5-6.71V4a2 2 0 1 0-4 0v.29A7 7 0 0 0 5 11v5l-2 2v1h18v-1l-2-2Z" />
                </Icon>
                <span className="revvo-preview__notifBadge">3</span>
              </button>
              <button type="button" className="revvo-preview__iconBtn" aria-label="Buscar">
                <Icon>
                  <path d="M15.5 14h-.79l-.28-.27A6.47 6.47 0 0 0 16 9.5 6.5 6.5 0 1 0 9.5 16c1.61 0 3.09-.59 4.23-1.57l.27.28v.79l5 4.99L20.49 19l-4.99-5Zm-6 0C7.01 14 5 11.99 5 9.5S7.01 5 9.5 5 14 7.01 14 9.5 11.99 14 9.5 14Z" />
                </Icon>
              </button>
              <button type="button" className="revvo-preview__profileBtn" aria-label="Perfil">
                <span className="revvo-preview__profileAvatar" aria-hidden="true">
                  <img src={ASSETS.avatar} alt="" width="42" height="42" decoding="async" />
                </span>
                <span className="revvo-preview__profileOnline" aria-hidden="true" />
              </button>
            </div>
          </header>

          <div className="revvo-preview__greeting">
            <div className="revvo-preview__greetingAvatar" aria-hidden="true">
              <img src={ASSETS.avatar} alt="" width="54" height="54" decoding="async" />
              <span className="revvo-preview__greetingOnline" />
            </div>
            <div>
              <h1 className="revvo-preview__greetingTitle">Olá, Camila! 👋</h1>
              <p className="revvo-preview__greetingSub">Pronta para subir no ranking hoje?</p>
            </div>
          </div>

          <article className="revvo-preview__wallet" aria-label="Saldo e nível Revvo">
            <div className="revvo-preview__walletTop">
              <div className="revvo-preview__walletCopy">
                <div className="revvo-preview__balanceLabelRow">
                  <span className="revvo-preview__balanceLabel">Saldo disponível</span>
                  <button
                    type="button"
                    className="revvo-preview__eyeBtn"
                    aria-label={showBalance ? 'Ocultar saldo' : 'Mostrar saldo'}
                    onClick={() => setShowBalance((v) => !v)}
                  >
                    <Icon>
                      <path d="M12 4.5C7 4.5 2.73 7.61 1 12c1.73 4.39 6 7.5 11 7.5s9.27-3.11 11-7.5c-1.73-4.39-6-7.5-11-7.5zM12 17c-2.76 0-5-2.24-5-5s2.24-5 5-5 5 2.24 5 5-2.24 5-5 5zm0-8c-1.66 0-3 1.34-3 3s1.34 3 3 3 3-1.34 3-3-1.34-3-3-3z" />
                    </Icon>
                  </button>
                </div>
                <p className={`revvo-preview__balanceValue ${showBalance ? '' : 'is-hidden'}`}>
                  <span className="revvo-preview__balanceCurrency">RVC</span>
                  <span className="revvo-preview__balanceAmount">{showBalance ? formatRvc(balanceRvc) : '••••'}</span>
                </p>
                <p className="revvo-preview__balanceBrl">
                  {showBalance ? `≈ R$ ${balanceBrl.toFixed(2).replace('.', ',')}` : '≈ R$ ••,••'}
                </p>
              </div>
              <div className="revvo-preview__walletArt" aria-hidden="true">
                <img className="revvo-preview__trophyImg" src={ASSETS.trophy} alt="" decoding="async" />
              </div>
            </div>

            <div className="revvo-preview__level">
              <span className="revvo-preview__levelBadge" aria-label="Nível 12">
                12
              </span>
              <div className="revvo-preview__levelBody">
                <p className="revvo-preview__levelTitle">
                  Nível 12 <span>•</span> Creator Pro
                </p>
                <div className="revvo-preview__xpTrack" aria-hidden="true">
                  <span className="revvo-preview__xpFill" style={{ width: '62%' }} />
                </div>
                <p className="revvo-preview__xpText">780 XP para o próximo nível</p>
              </div>
            </div>

            <div className="revvo-preview__walletFoot">
              <div className="revvo-preview__walletMsg">
                <span className="revvo-preview__hourglass" aria-hidden="true">
                  <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
                    <path
                      d="M6 2h12v3.2l-4.2 4.8 4.2 4.8V22H6v-7.2l4.2-4.8L6 5.2V2Z"
                      stroke="currentColor"
                      strokeWidth="1.5"
                      strokeLinejoin="round"
                    />
                  </svg>
                </span>
                <p>
                  Você tem <strong>8 missões</strong> aguardando validação.
                </p>
              </div>
              <button type="button" className="revvo-preview__pixBtn">
                Sacar via PIX
                <Icon>
                  <path d="M10 6 8.59 7.41 13.17 12l-4.58 4.59L10 18l6-6-6-6z" />
                </Icon>
              </button>
            </div>
          </article>
        </section>

        <main className="revvo-preview__main">
          <nav className="revvo-preview__shortcuts" aria-label="Atalhos principais">
            {shortcuts.map(({ id, label, icon }) => (
              <button
                key={id}
                type="button"
                className="revvo-preview__shortcut"
                onClick={() => {
                  if (id === 'wallet') navigate('/dev/revvo-carteira');
                  if (id === 'ranking') navigate('/dev/revvo-ranking');
                }}
              >
                <span className="revvo-preview__shortcutCircle">{icon}</span>
                <span className="revvo-preview__shortcutLabel">{label}</span>
              </button>
            ))}
          </nav>

          <section className="revvo-preview__section" aria-labelledby="revvo-today-title">
            <div className="revvo-preview__sectionHead">
              <h2 className="revvo-preview__sectionTitle" id="revvo-today-title">
                Para hoje
              </h2>
              <button type="button" className="revvo-preview__linkAll">
                Ver tudo <span aria-hidden="true">›</span>
              </button>
            </div>
            <div className="revvo-preview__todayScroll">
              {todayCards.map(({ id, tone, title, value, hint, icon }) => (
                <article key={id} className={`revvo-preview__todayCard revvo-preview__todayCard--${tone}`}>
                  <div className="revvo-preview__todayTop">
                    <div>
                      <p className="revvo-preview__todayKey">{title}</p>
                      <p className="revvo-preview__todayVal">{value}</p>
                    </div>
                    <span className="revvo-preview__todayIcon">{icon}</span>
                  </div>
                  <div className="revvo-preview__todayBottom">
                    <p className="revvo-preview__todaySub">{hint}</p>
                    <button type="button" className="revvo-preview__todayGo" aria-label={`Abrir ${title}`}>
                      <Icon>
                        <path d="M10 6 8.59 7.41 13.17 12l-4.58 4.59L10 18l6-6-6-6z" />
                      </Icon>
                    </button>
                  </div>
                </article>
              ))}
            </div>
          </section>

          <section className="revvo-preview__bannerWrap" aria-label="Campanhas em alta">
            <div className="revvo-preview__banner">
              <div className="revvo-preview__bannerCopy">
                <span className="revvo-preview__bannerKicker">Campanhas em alta</span>
                <h2 className="revvo-preview__bannerTitle">Missões com bônus de até +25% RVC</h2>
                <button type="button" className="revvo-preview__bannerCta">
                  Explorar agora
                </button>
              </div>
              <div className="revvo-preview__bannerArt" aria-hidden="true">
                <img className="revvo-preview__bannerImg" src={ASSETS.campaign} alt="" decoding="async" />
              </div>
            </div>
            <div className="revvo-preview__dots" role="tablist" aria-label="Banners">
              <span className="revvo-preview__dot" />
              <span className="revvo-preview__dot revvo-preview__dot--active" aria-selected="true" />
              <span className="revvo-preview__dot" />
              <span className="revvo-preview__dot" />
              <span className="revvo-preview__dot" />
            </div>
          </section>

          <section className="revvo-preview__section" aria-labelledby="revvo-discover-title">
            <div className="revvo-preview__sectionHead">
              <h2 className="revvo-preview__sectionTitle" id="revvo-discover-title">
                Descubra no Revvo
              </h2>
              <button type="button" className="revvo-preview__linkAll">
                Ver tudo <span aria-hidden="true">›</span>
              </button>
            </div>
            <div className="revvo-preview__discoverScroll">
              {discoverCards.map(({ id, title, subtitle, imageSrc, tone }) => (
                <article key={id} className={`revvo-preview__discoverCard revvo-preview__discoverCard--${tone}`}>
                  <div className="revvo-preview__discoverCopy">
                    <h3>{title}</h3>
                    <p>{subtitle}</p>
                  </div>
                  <div className="revvo-preview__discoverArt" aria-hidden="true">
                    <img src={imageSrc} alt="" decoding="async" />
                  </div>
                  <button type="button" className="revvo-preview__discoverGo" aria-label={`Abrir ${title}`}>
                    <Icon>
                      <path d="M10 6 8.59 7.41 13.17 12l-4.58 4.59L10 18l6-6-6-6z" />
                    </Icon>
                  </button>
                </article>
              ))}
            </div>
          </section>

          <section className="revvo-preview__section revvo-preview__section--last" aria-labelledby="revvo-services-title">
            <h2 className="revvo-preview__sectionTitle revvo-preview__sectionTitle--solo" id="revvo-services-title">
              Serviços
            </h2>
            <div className="revvo-preview__servicesGrid">
              {services.map(({ id, title, subtitle, tone, icon }) => (
                <button
                  key={id}
                  type="button"
                  className="revvo-preview__serviceCard"
                  onClick={() => {
                    if (id === 'feed') navigate('/dev/revvo-feed');
                    if (id === 'missions') navigate('/dev/revvo-missions');
                  }}
                >
                  <span className={`revvo-preview__serviceIcon revvo-preview__serviceIcon--${tone}`}>{icon}</span>
                  <span className="revvo-preview__serviceText">
                    <span className="revvo-preview__serviceTitle">{title}</span>
                    <span className="revvo-preview__serviceSub">{subtitle}</span>
                  </span>
                </button>
              ))}
            </div>
          </section>
        </main>

        <nav className="revvo-preview__bottomNav" aria-label="Navegação principal">
          {bottomNav.map(({ id, label, active, icon, path }) => (
            <button
              key={id}
              type="button"
              className={`revvo-preview__navItem ${active ? 'revvo-preview__navItem--active' : ''}`}
              onClick={() => path && navigate(path)}
              aria-current={active ? 'page' : undefined}
            >
              <Icon>{icon}</Icon>
              <span>{label}</span>
            </button>
          ))}
        </nav>
        </div>
      </div>
    </div>
  );
};

export default RevvoHomePreview;
