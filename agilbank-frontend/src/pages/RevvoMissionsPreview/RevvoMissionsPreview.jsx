import React, { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useRevvoCanvasScale } from '../../hooks/useRevvoCanvasScale';
import './RevvoMissionsPreview.css';

const ASSETS = {
  avatar: '/banco/assets/revvo-home-v2/revvo-home-v2-avatar-camila.png',
  trophy: '/banco/assets/revvo-home-v2/revvo-home-v2-trophy-cutout-3d.png'
};

const Icon = ({ children, className }) => (
  <svg className={className} viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
    {children}
  </svg>
);

const OutlineIcon = ({ children }) => (
  <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
    {children}
  </svg>
);

const RevvoLogo = () => (
  <div className="revvo-missions__logo" aria-label="Revvo">
    <span className="revvo-missions__logoMark">R</span>
    <span className="revvo-missions__logoText">Revvo</span>
  </div>
);

const PlatformMark = ({ type }) => {
  if (type === 'instagram') return <span className="revvo-missions__brandMark revvo-missions__brandMark--instagram">◎</span>;
  if (type === 'tiktok') return <span className="revvo-missions__brandMark revvo-missions__brandMark--tiktok">♪</span>;
  if (type === 'youtube') return <span className="revvo-missions__brandMark revvo-missions__brandMark--youtube">▶</span>;
  if (type === 'adidas') return <span className="revvo-missions__brandMark revvo-missions__brandMark--adidas">///</span>;
  return <span className="revvo-missions__brandMark">R</span>;
};

const MissionMetric = ({ icon, main, sub, muted }) => (
  <span className={`revvo-missions__metric ${muted ? 'revvo-missions__metric--muted' : ''}`}>
    <span className="revvo-missions__metricIcon">{icon}</span>
    <span className="revvo-missions__metricText">
      <strong>{main}</strong>
      {sub ? <small>{sub}</small> : null}
    </span>
  </span>
);

const RevvoMissionsPreview = () => {
  const navigate = useNavigate();
  const { scaleRef, innerRef } = useRevvoCanvasScale();
  const [activeTab, setActiveTab] = useState('open');

  const filters = useMemo(
    () => [
      { id: 'all', label: 'Todas', active: true },
      { id: 'instagram', label: 'Instagram', mark: <PlatformMark type="instagram" /> },
      { id: 'tiktok', label: 'TikTok', mark: <PlatformMark type="tiktok" /> },
      { id: 'youtube', label: 'YouTube', mark: <PlatformMark type="youtube" /> },
      { id: 'like', label: 'Curtir', icon: <path d="M12 21.35 10.55 20.03C5.4 15.36 2 12.28 2 8.5A5.45 5.45 0 0 1 7.5 3C9.24 3 10.91 3.81 12 5.08A6.02 6.02 0 0 1 16.5 3 5.45 5.45 0 0 1 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35Z" /> },
      { id: 'follow', label: 'Seguir', icon: <path d="M15 12c2.21 0 4-1.79 4-4s-1.79-4-4-4-4 1.79-4 4 1.79 4 4 4Zm-8 0c1.66 0 3-1.34 3-3S8.66 6 7 6 4 7.34 4 9s1.34 3 3 3Zm0 2c-2.33 0-7 1.17-7 3.5V20h14v-2.5C14 15.17 9.33 14 7 14Zm8 0c-.29 0-.62.02-.97.05 1.16.84 1.97 1.97 1.97 3.45V20h8v-2.5c0-2.33-4.67-3.5-9-3.5Z" /> },
      { id: 'comment', label: 'Comentar', icon: <path d="M20 2H4a2 2 0 0 0-2 2v18l4-4h14a2 2 0 0 0 2-2V4a2 2 0 0 0-2-2Zm-2 12H6v-2h12v2Zm0-3H6V9h12v2Zm0-3H6V6h12v2Z" /> },
      { id: 'watch', label: 'Assistir', icon: <path d="M8 5v14l11-7L8 5Z" /> }
    ],
    []
  );

  const missions = useMemo(
    () => [
      { id: 'adidas-like', platform: 'adidas', bonus: 'BÔNUS +25%', tags: ['Em alta', 'Vagas limitadas'], title: 'Curtir post da marca', text: 'Curta a última publicação no Instagram oficial.', rvc: '30 RVC', oldRvc: '24 RVC', xp: '15 XP', time: '1 min', seats: '215/300', highlighted: true },
      { id: 'instagram-follow', platform: 'instagram', tags: ['Validação automática'], title: 'Seguir perfil oficial', text: 'Siga o perfil oficial da marca no Instagram.', rvc: '25 RVC', xp: '10 XP', time: '1 min', seats: '342/500' },
      { id: 'tiktok-comment', platform: 'tiktok', tags: ['Novo'], title: 'Comentar publicação', text: 'Comente na última publicação do TikTok.', rvc: '40 RVC', xp: '20 XP', time: '2 min', seats: '160/250' },
      { id: 'youtube-watch', platform: 'youtube', tags: ['Validação automática'], title: 'Assistir vídeo por 30s', text: 'Assista ao vídeo completo no YouTube.', rvc: '35 RVC', xp: '15 XP', time: '2 min', seats: '278/400' },
      { id: 'story-share', platform: 'instagram', tags: ['Vagas limitadas'], title: 'Compartilhar story', text: 'Compartilhe o story da marca e marque @revvo.', rvc: '45 RVC', xp: '25 XP', time: '3 min', seats: '89/150' }
    ],
    []
  );

  const nav = useMemo(
    () => [
      { id: 'home', label: 'Início', path: '/dev/revvo-home', icon: <path d="M10 20v-6h4v6h5v-8h3L12 3 2 12h3v8h5Z" /> },
      { id: 'missions', label: 'Missões', active: true, icon: <path d="M12 2a10 10 0 1 0 10 10A10 10 0 0 0 12 2Zm0 2a8 8 0 1 1-8 8 8 8 0 0 1 8-8Zm0 2.5A5.5 5.5 0 1 0 17.5 12 5.51 5.51 0 0 0 12 6.5Zm0 2A3.5 3.5 0 1 1 8.5 12 3.5 3.5 0 0 1 12 8.5Z" /> },
      { id: 'feed', label: 'Feed', path: '/dev/revvo-feed', icon: <path d="M19 3H5a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V5a2 2 0 0 0-2-2Zm-2 14H7v-2h10v2Zm0-4H7v-2h10v2Zm0-4H7V7h10v2Z" /> },
      { id: 'ranking', label: 'Ranking', path: '/dev/revvo-ranking', icon: <path d="M4 20h16v-2H4v2Zm2-4h3V9H6v7Zm5 0h3V5h-3v11Zm5 0h3V12h-3v4Z" /> },
      { id: 'profile', label: 'Perfil', path: '/dev/revvo-profile', icon: <path d="M12 12c2.21 0 4-1.79 4-4s-1.79-4-4-4-4 1.79-4 4 1.79 4 4 4Zm0 2c-2.67 0-8 1.34-8 4v2h16v-2c0-2.66-5.33-4-8-4Z" /> }
    ],
    []
  );

  return (
    <div className="revvo-missions-app revvo-canvas-app">
      <div className="revvo-missions__scale revvo-canvas-scale" ref={scaleRef}>
        <div className="revvo-missions revvo-canvas-surface" ref={innerRef}>
        <section className="revvo-missions__hero" aria-label="Missões Revvo">
          <header className="revvo-missions__header">
            <button type="button" className="revvo-missions__backBtn" aria-label="Voltar">
              <OutlineIcon><path d="M15 18 9 12l6-6" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" /></OutlineIcon>
            </button>
            <RevvoLogo />
            <div className="revvo-missions__actions">
              <button type="button" className="revvo-missions__bell" aria-label="Notificações">
                <Icon><path d="M12 22a2.5 2.5 0 0 0 2.45-2h-4.9A2.5 2.5 0 0 0 12 22Zm7-6V11a7 7 0 0 0-5-6.71V4a2 2 0 1 0-4 0v.29A7 7 0 0 0 5 11v5l-2 2v1h18v-1l-2-2Z" /></Icon>
                <span>3</span>
              </button>
              <button type="button" className="revvo-missions__profile" aria-label="Perfil">
                <img src={ASSETS.avatar} alt="" width="44" height="44" decoding="async" />
                <i aria-hidden="true" />
              </button>
            </div>
          </header>

          <div className="revvo-missions__heroBody">
            <div className="revvo-missions__targetBadge" aria-hidden="true"><span /></div>
            <div className="revvo-missions__heroCopy">
              <h1>Missões</h1>
              <p>Escolha ações para ganhar RVC e subir no ranking.</p>
            </div>
            <div className="revvo-missions__heroArt" aria-hidden="true">
              <div className="revvo-missions__coin revvo-missions__coin--one">R</div>
              <div className="revvo-missions__coin revvo-missions__coin--two">R</div>
              <div className="revvo-missions__coin revvo-missions__coin--three">R</div>
              <div className="revvo-missions__bullseye" />
            </div>
          </div>
        </section>

        <main className="revvo-missions__main">
          <section className="revvo-missions__searchRow" aria-label="Busca e filtros">
            <label className="revvo-missions__search">
              <OutlineIcon><path d="m21 21-4.35-4.35M10.5 18a7.5 7.5 0 1 1 0-15 7.5 7.5 0 0 1 0 15Z" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" /></OutlineIcon>
              <input type="search" placeholder="Buscar missões, marcas ou ações..." aria-label="Buscar missões" />
            </label>
            <button type="button" className="revvo-missions__filterBtn">
              <OutlineIcon><path d="M4 7h10M18 7h2M4 17h3M11 17h9M8 5v4M15 15v4" stroke="currentColor" strokeWidth="2" strokeLinecap="round" /></OutlineIcon>
              Filtros
            </button>
          </section>

          <nav className="revvo-missions__chips" aria-label="Categorias de missões">
            {filters.map(({ id, label, active, icon, mark }) => (
              <button key={id} type="button" className={`revvo-missions__chip ${active ? 'revvo-missions__chip--active' : ''}`}>
                {mark}
                {icon ? <Icon>{icon}</Icon> : null}
                <span>{label}</span>
              </button>
            ))}
          </nav>

          <section className="revvo-missions__progress" aria-label="Seu progresso geral">
            <div className="revvo-missions__progressCopy">
              <h2>Seu progresso geral</h2>
              <div className="revvo-missions__stats">
                <div><span className="revvo-missions__statIcon revvo-missions__statIcon--blue"><Icon><path d="M12 2a10 10 0 1 0 10 10A10 10 0 0 0 12 2Zm0 3 1.4 3.4L17 9l-2.7 2.4.8 3.6L12 13.1 8.9 15l.8-3.6L7 9l3.6-.6L12 5Z" /></Icon></span><strong>24</strong><span>Missões disponíveis</span></div>
                <div><span className="revvo-missions__statIcon revvo-missions__statIcon--green"><Icon><path d="M12 3C7.58 3 4 4.57 4 6.5v11C4 19.43 7.58 21 12 21s8-1.57 8-3.5v-11C20 4.57 16.42 3 12 3Zm0 2c3.43 0 5.43.98 5.92 1.5C17.43 7.02 15.43 8 12 8S6.57 7.02 6.08 6.5C6.57 5.98 8.57 5 12 5Zm0 14c-3.43 0-5.43-.98-6-1.5v-2.17C7.45 16.34 9.61 17 12 17s4.55-.66 6-1.67v2.17c-.57.52-2.57 1.5-6 1.5Z" /></Icon></span><strong>180</strong><span>RVC ganhos hoje</span></div>
                <div><span className="revvo-missions__statIcon revvo-missions__statIcon--orange"><Icon><path d="M13.5.67c-.32.66-1.04 2.12-1.93 4.13-.86 1.93-1.9 4.22-2.67 6.16-.77-1.94-1.81-4.23-2.67-6.16-.89-2.01-1.61-3.47-1.93-4.13C3.79 2.17 5.07 1 6.5 1c1.2 0 2.17.72 2.67 1.67.5-.95 1.47-1.67 2.67-1.67 1.43 0 2.71 1.17 2.83 2.67ZM12 22c-2.76 0-5-2.24-5-5 0-1.53.69-2.9 1.78-3.83.55 2.46 2.18 5.08 3.22 6.83 1.04-1.75 2.67-4.37 3.22-6.83A4.98 4.98 0 0 1 17 17c0 2.76-2.24 5-5 5Z" /></Icon></span><strong>7 <small>dias</small></strong><span>Sequência</span></div>
              </div>
            </div>
            <div className="revvo-missions__levelCard">
              <img src={ASSETS.trophy} alt="" width="112" height="112" decoding="async" />
              <div><span>12</span><p><strong>Nível 12</strong> • Creator Pro</p><small>780 XP para o próximo nível</small><i aria-hidden="true"><b /></i></div>
            </div>
          </section>

          <section className="revvo-missions__tabs" aria-label="Status das missões">
            {[
              { id: 'open', label: 'Abertas', icon: <path d="M12 2a10 10 0 1 0 10 10A10 10 0 0 0 12 2Zm0 3a7 7 0 1 1-7 7 7 7 0 0 1 7-7Zm0 2.5A4.5 4.5 0 1 0 16.5 12 4.5 4.5 0 0 0 12 7.5Z" /> },
              { id: 'doing', label: 'Em andamento', icon: <path d="M6 2h12v5l-4 5 4 5v5H6v-5l4-5-4-5V2Zm2 2v2.3l4 5 4-5V4H8Z" /> },
              { id: 'done', label: 'Concluídas', icon: <path d="M9 16.17 4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41L9 16.17Z" /> }
            ].map((tab) => (
              <button key={tab.id} type="button" className={activeTab === tab.id ? 'is-active' : ''} onClick={() => setActiveTab(tab.id)}>
                <Icon>{tab.icon}</Icon>
                {tab.label}
              </button>
            ))}
          </section>

          <section className="revvo-missions__list" aria-label="Missões abertas">
            {missions.map((mission) => (
              <article key={mission.id} className={`revvo-missions__card ${mission.highlighted ? 'revvo-missions__card--hot' : ''}`}>
                <div className="revvo-missions__brand">
                  <PlatformMark type={mission.platform} />
                  <span className="revvo-missions__verified" aria-hidden="true"><Icon><path d="m9.2 16.2-3.4-3.4 1.4-1.4 2 2 7.6-7.6 1.4 1.4-9 9Z" /></Icon></span>
                </div>
                <div className="revvo-missions__cardBody">
                  <div className="revvo-missions__cardTop">
                    <div>{mission.bonus ? <span className="revvo-missions__bonus">{mission.bonus}</span> : null}<h3>{mission.title}</h3><p>{mission.text}</p></div>
                    <div className="revvo-missions__badges">
                      {mission.tags.map((tag) => (
                        <span key={tag} className={`revvo-missions__tag revvo-missions__tag--${tag.includes('autom') ? 'green' : tag.includes('Vagas') ? 'orange' : tag.includes('Novo') ? 'purple' : 'trend'}`}>{tag}</span>
                      ))}
                    </div>
                  </div>
                  <div className="revvo-missions__cardFoot">
                    <div className="revvo-missions__metrics">
                      <MissionMetric icon={<Icon><path d="M12 2a10 10 0 1 0 10 10A10 10 0 0 0 12 2Zm0 5a5 5 0 1 1-5 5 5 5 0 0 1 5-5Z" /></Icon>} main={mission.rvc} sub={mission.oldRvc} />
                      <MissionMetric icon={<span className="revvo-missions__xp">XP</span>} main={mission.xp} />
                      <MissionMetric icon={<Icon><path d="M12 2a10 10 0 1 0 10 10A10 10 0 0 0 12 2Zm1 5h-2v6l5 3 .9-1.45-3.9-2.3V7Z" /></Icon>} main={mission.time} sub="Tempo est." muted />
                      <MissionMetric icon={<Icon><path d="M16 11c1.66 0 3-1.34 3-3s-1.34-3-3-3-3 1.34-3 3 1.34 3 3 3Zm-8 0c1.66 0 3-1.34 3-3S9.66 5 8 5 5 6.34 5 8s1.34 3 3 3Zm0 2c-2.67 0-8 1.34-8 4v2h16v-2c0-2.66-5.33-4-8-4Z" /></Icon>} main={mission.seats} sub="vagas" muted />
                    </div>
                    <button
                      type="button"
                      className="revvo-missions__doBtn"
                      onClick={() => navigate(`/dev/revvo-mission/${mission.id}`)}
                    >
                      Fazer missão
                    </button>
                  </div>
                </div>
              </article>
            ))}
          </section>
        </main>

        <nav className="revvo-missions__bottomNav" aria-label="Navegação principal">
          {nav.map(({ id, label, active, icon, path }) => (
            <button key={id} type="button" className={active ? 'is-active' : ''} onClick={() => path && navigate(path)} aria-current={active ? 'page' : undefined}>
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

export default RevvoMissionsPreview;
