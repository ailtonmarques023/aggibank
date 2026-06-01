import React, { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useRevvoCanvasScale } from '../../hooks/useRevvoCanvasScale';
import { minhasMissoesData } from './minhasMissoesData';
import './RevvoMinhasMissoesPreview.css';

const ASSETS = {
  rocket: '/banco/assets/revvo-ranking/revvo-ranking-rocket-3d.png',
  coin: '/banco/assets/revvo-ranking/revvo-ranking-rvc-coin.png'
};

const formatPoints = (value) => value.toLocaleString('pt-BR');

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

const SummaryIcon = ({ type }) => {
  const icons = {
    clock: (
      <OutlineIcon>
        <circle cx="12" cy="12" r="9" stroke="currentColor" strokeWidth="1.8" />
        <path d="M12 7v5l3 2" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
      </OutlineIcon>
    ),
    hourglass: (
      <OutlineIcon>
        <path d="M8 3h8v3l-3 4 3 4v3H8v-3l3-4-3-4V3Z" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round" />
      </OutlineIcon>
    ),
    upload: (
      <OutlineIcon>
        <path d="M12 16V6m0 0 4 4m-4-4-4 4M5 20h14" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
      </OutlineIcon>
    ),
    check: <Icon><path d="m9.2 16.6-4.1-4.1 1.6-1.6 2.5 2.5 7.9-7.9 1.6 1.6-9.5 9.5Z" /></Icon>,
    x: (
      <OutlineIcon>
        <path d="m8 8 8 8M16 8l-8 8" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
      </OutlineIcon>
    )
  };
  return icons[type] || icons.clock;
};

const SectionIcon = ({ type }) => {
  const icons = {
    play: <Icon><path d="M8 5v14l11-7-11-7Z" /></Icon>,
    upload: (
      <OutlineIcon>
        <path d="M12 16V6m0 0 4 4m-4-4-4 4M5 20h14" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
      </OutlineIcon>
    ),
    hourglass: (
      <OutlineIcon>
        <path d="M8 3h8v3l-3 4 3 4v3H8v-3l3-4-3-4V3Z" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round" />
      </OutlineIcon>
    ),
    check: <Icon><path d="m9.2 16.6-4.1-4.1 1.6-1.6 2.5 2.5 7.9-7.9 1.6 1.6-9.5 9.5Z" /></Icon>
  };
  return icons[type] || icons.play;
};

const CategoryIcon = ({ tone }) => {
  const icons = {
    pix: (
      <Icon>
        <path d="M13.5 6.5 11 4 4 11l7 7 2.5-2.5L9 11l4.5-4.5Zm-3 11 2.5 2.5L20 13l-7-7-2.5 2.5L15 13l-4.5 4.5Z" />
      </Icon>
    ),
    convite: (
      <Icon>
        <path d="M16 11c1.66 0 3-1.34 3-3s-1.34-3-3-3-3 1.34-3 3 1.34 3 3 3Zm-8 0c1.66 0 3-1.34 3-3S9.66 5 8 5 5 6.34 5 8s1.34 3 3 3Zm0 2c-2.67 0-8 1.34-8 4v2h16v-2c0-2.66-5.33-4-8-4Z" />
      </Icon>
    ),
    compra: (
      <Icon>
        <path d="M7 18a2 2 0 1 0 0 4 2 2 0 0 0 0-4Zm10 0a2 2 0 1 0 .001 3.999A2 2 0 0 0 17 18ZM6.2 6h14.8l-1.4 7H7.7L6.2 6Zm-.6-2h16.4l1.6 8H5.2L4.6 4Z" />
      </Icon>
    ),
    social: (
      <Icon>
        <path d="M12 21.35 10.55 20.03C5.4 15.36 2 12.28 2 8.5A5.45 5.45 0 0 1 7.5 3C9.24 3 10.91 3.81 12 5.08A6.02 6.02 0 0 1 16.5 3 5.45 5.45 0 0 1 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35Z" />
      </Icon>
    ),
    desafio: (
      <Icon>
        <path d="M12 2l2.2 4.5 4.9.7-3.5 3.4.8 4.9L12 13.8 7.6 15.5l.8-4.9L5 7.2l4.9-.7L12 2Z" />
      </Icon>
    )
  };
  return icons[tone] || icons.desafio;
};

const MissionCard = ({ mission, onAction }) => {
  const progressWidth =
    mission.progress?.type === 'percent'
      ? `${mission.progress.value}%`
      : mission.progress?.type === 'fraction'
        ? `${Math.round((mission.progress.current / mission.progress.total) * 100)}%`
        : '0%';

  return (
    <article className={`revvo-minhas__mission revvo-minhas__mission--${mission.categoryTone}`}>
      <div className="revvo-minhas__missionTop">
        <div className={`revvo-minhas__missionIcon revvo-minhas__missionIcon--${mission.categoryTone}`}>
          <CategoryIcon tone={mission.categoryTone} />
        </div>
        <div className="revvo-minhas__missionCopy">
          <span className={`revvo-minhas__missionTag revvo-minhas__missionTag--${mission.categoryTone}`}>{mission.category}</span>
          <h3>{mission.title}</h3>
          <p>{mission.description}</p>
        </div>
      </div>

      {mission.progress ? (
        <div className="revvo-minhas__missionProgress">
          <div className="revvo-minhas__progressTrack" aria-hidden="true">
            <span className={`revvo-minhas__progressFill revvo-minhas__progressFill--${mission.categoryTone}`} style={{ width: progressWidth }} />
          </div>
          <div className="revvo-minhas__progressMeta">
            <strong>{mission.progress.label}</strong>
            {mission.avatars ? (
              <div className="revvo-minhas__avatars">
                {mission.avatars.map((avatar) => (
                  <span key={avatar.initials} className={`revvo-minhas__avatar revvo-minhas__avatar--${avatar.tone}`}>
                    {avatar.initials}
                  </span>
                ))}
                <button type="button" className="revvo-minhas__avatarAdd" aria-label="Convidar amigo">
                  +
                </button>
              </div>
            ) : null}
          </div>
        </div>
      ) : null}

      <div className="revvo-minhas__missionMeta">
        <span>
          <OutlineIcon className="revvo-minhas__metaIcon">
            <circle cx="12" cy="12" r="9" stroke="currentColor" strokeWidth="1.8" />
            <path d="M12 7v5l3 2" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
          </OutlineIcon>
          {mission.time}
        </span>
        <span>
          <OutlineIcon className="revvo-minhas__metaIcon">
            <path d="M16 11c1.66 0 3-1.34 3-3s-1.34-3-3-3-3 1.34-3 3 1.34 3 3 3Zm-8 0c1.66 0 3-1.34 3-3S9.66 5 8 5 5 6.34 5 8s1.34 3 3 3Zm0 2c-2.67 0-8 1.34-8 4v2h16v-2c0-2.66-5.33-4-8-4Z" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
          </OutlineIcon>
          {mission.participants}
        </span>
      </div>

      <div className="revvo-minhas__missionFoot">
        <div className="revvo-minhas__reward">
          <img src={ASSETS.coin} alt="" width="18" height="18" decoding="async" />
          <strong>{formatPoints(mission.reward)} pontos</strong>
        </div>
        <button
          type="button"
          className={`revvo-minhas__actionBtn revvo-minhas__actionBtn--${mission.button.variant}`}
          onClick={() => onAction(mission)}
        >
          {mission.button.label}
        </button>
      </div>
    </article>
  );
};

const RevvoMinhasMissoesPreview = () => {
  const navigate = useNavigate();
  const { scaleRef, innerRef } = useRevvoCanvasScale();
  const [activeFilter, setActiveFilter] = useState('todas');

  const nav = useMemo(
    () => [
      { id: 'home', label: 'Home Revvo', path: '/dev/revvo-home', icon: <path d="M10 20v-6h4v6h5v-8h3L12 3 2 12h3v8h5Z" /> },
      { id: 'feed', label: 'Feed Revvo', path: '/dev/revvo-feed', icon: <path d="M19 3H5a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V5a2 2 0 0 0-2-2Zm-2 14H7v-2h10v2Zm0-4H7v-2h10v2Zm0-4H7V7h10v2Z" /> },
      {
        id: 'explore',
        label: 'Explorar',
        active: true,
        path: '/dev/revvo-missions',
        icon: <path d="M12 2a10 10 0 1 0 10 10A10 10 0 0 0 12 2Zm0 2a8 8 0 1 1-8 8 8 8 0 0 1 8-8Zm0 2.5A5.5 5.5 0 1 0 17.5 12 5.51 5.51 0 0 0 12 6.5Zm0 2A3.5 3.5 0 1 1 8.5 12 3.5 3.5 0 0 1 12 8.5Z" />
      },
      { id: 'wallet', label: 'Carteira', path: '/dev/revvo-carteira', icon: <path d="M20 4H4a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2V6a2 2 0 0 0-2-2Zm0 14H4V8h16v10Zm-2-6h-2a2 2 0 1 0 0 4h2v-4Z" /> },
      { id: 'profile', label: 'Perfil', path: '/dev/revvo-profile', icon: <path d="M12 12c2.21 0 4-1.79 4-4s-1.79-4-4-4-4 1.79-4 4 1.79 4 4 4Zm0 2c-2.67 0-8 1.34-8 4v2h16v-2c0-2.66-5.33-4-8-4Z" /> }
    ],
    []
  );

  const visibleSections = useMemo(() => {
    if (activeFilter === 'todas') {
      return minhasMissoesData.sections.filter((section) => section.missions.length > 0);
    }
    return minhasMissoesData.sections.filter((section) => section.status === activeFilter);
  }, [activeFilter]);

  const handleMissionAction = (mission) => {
    if (mission.button.route) {
      navigate(mission.button.route);
      return;
    }
    console.log('[Revvo Minhas Missões]', mission.id, mission.button.label);
  };

  return (
    <div className="revvo-minhas-app revvo-canvas-app">
      <div className="revvo-minhas__scale revvo-canvas-scale" ref={scaleRef}>
        <div className="revvo-minhas revvo-canvas-surface" ref={innerRef}>
          <section className="revvo-minhas-top" aria-label="Minhas Missões">
            <div className="revvo-minhas__statusBar" aria-hidden="true">
              <span>9:41</span>
              <span className="revvo-minhas__statusIcons">
                <i />
                <i />
                <i />
              </span>
            </div>

            <header className="revvo-minhas__header">
              <button type="button" className="revvo-minhas__backBtn" aria-label="Voltar" onClick={() => navigate('/dev/revvo-missions')}>
                <OutlineIcon>
                  <path d="m15 6-6 6 6 6" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
                </OutlineIcon>
              </button>

              <div className="revvo-minhas__headerActions">
                <button type="button" className="revvo-minhas__pointsPill" onClick={() => console.log('[Revvo Minhas Missões] pontos')}>
                  <img src={ASSETS.coin} alt="" width="18" height="18" decoding="async" />
                  <span>{formatPoints(minhasMissoesData.points)} pontos</span>
                  <OutlineIcon className="revvo-minhas__pointsChevron">
                    <path d="m9 6 6 6-6 6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                  </OutlineIcon>
                </button>
                <button type="button" className="revvo-minhas__bellBtn" aria-label="Notificações">
                  <Icon>
                    <path d="M12 22a2.5 2.5 0 0 0 2.45-2h-4.9A2.5 2.5 0 0 0 12 22Zm7-6V11a7 7 0 0 0-5-6.71V4a2 2 0 1 0-4 0v.29A7 7 0 0 0 5 11v5l-2 2v1h18v-1l-2-2Z" />
                  </Icon>
                  <span className="revvo-minhas__bellDot" aria-hidden="true" />
                </button>
              </div>
            </header>

            <div className="revvo-minhas__heroCopy">
              <h1>Minhas Missões 🎯</h1>
              <p>Acompanhe suas missões e ganhe pontos completando desafios!</p>
            </div>

            <div className="revvo-minhas__heroArt" aria-hidden="true">
              <img className="revvo-minhas__rocket" src={ASSETS.rocket} alt="" decoding="async" />
              <span className="revvo-minhas__spark revvo-minhas__spark--1">✦</span>
              <span className="revvo-minhas__spark revvo-minhas__spark--2">✦</span>
              <span className="revvo-minhas__spark revvo-minhas__spark--3">★</span>
            </div>
          </section>

          <main className="revvo-minhas__main">
            <article className="revvo-minhas__summary" aria-label="Resumo das missões">
              <div className="revvo-minhas__summaryHead">
                <h2>Resumo</h2>
                <button type="button" className="revvo-minhas__linkBtn" onClick={() => console.log('[Revvo Minhas Missões] ver histórico')}>
                  Ver histórico <span aria-hidden="true">›</span>
                </button>
              </div>
              <div className="revvo-minhas__summaryGrid">
                {minhasMissoesData.summary.map((item) => (
                  <div key={item.id} className={`revvo-minhas__summaryItem revvo-minhas__summaryItem--${item.tone}`}>
                    <span className="revvo-minhas__summaryIcon">
                      <SummaryIcon type={item.icon} />
                    </span>
                    <strong>{item.count}</strong>
                    <small>{item.label}</small>
                  </div>
                ))}
              </div>
            </article>

            <nav className="revvo-minhas__filters" aria-label="Filtrar missões">
              {minhasMissoesData.filters.map((filter) => (
                <button
                  key={filter.id}
                  type="button"
                  className={`revvo-minhas__filter ${activeFilter === filter.id ? 'revvo-minhas__filter--active' : ''}`}
                  onClick={() => setActiveFilter(filter.id)}
                >
                  {filter.label} ({filter.count})
                </button>
              ))}
            </nav>

            {visibleSections.length === 0 ? (
              <div className="revvo-minhas__empty">
                <span className="revvo-minhas__emptyIcon">🎯</span>
                <p>Nenhuma missão neste filtro por enquanto.</p>
              </div>
            ) : (
              visibleSections.map((section) => (
                <section key={section.id} className="revvo-minhas__section" aria-labelledby={`revvo-minhas-section-${section.id}`}>
                  <div className="revvo-minhas__sectionHead">
                    <h2 id={`revvo-minhas-section-${section.id}`}>
                      <span className="revvo-minhas__sectionIcon">
                        <SectionIcon type={section.icon} />
                      </span>
                      {section.title}
                    </h2>
                    <button type="button" className="revvo-minhas__linkBtn" onClick={() => setActiveFilter(section.status)}>
                      Ver todas <span aria-hidden="true">›</span>
                    </button>
                  </div>
                  <div className="revvo-minhas__missionList">
                    {section.missions.map((mission) => (
                      <MissionCard key={mission.id} mission={mission} onAction={handleMissionAction} />
                    ))}
                  </div>
                </section>
              ))
            )}
          </main>

          <nav className="revvo-minhas__bottomNav" aria-label="Navegação principal">
            {nav.map(({ id, label, active, icon, path }) => (
              <button
                key={id}
                type="button"
                className={active ? 'is-active' : ''}
                onClick={() => path && navigate(path)}
                aria-current={active ? 'page' : undefined}
              >
                <span className="revvo-minhas__navIconWrap">
                  <Icon>{icon}</Icon>
                </span>
                <span>{label}</span>
              </button>
            ))}
          </nav>
        </div>
      </div>
    </div>
  );
};

export default RevvoMinhasMissoesPreview;
