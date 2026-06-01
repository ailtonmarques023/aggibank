import React, { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useRevvoCanvasScale } from '../../hooks/useRevvoCanvasScale';
import { exploreData } from './exploreData';
import './RevvoMissionsPreview.css';

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

const RevvoLogo = () => (
  <div className="revvo-missions__logo" aria-label="Revvo">
    <span className="revvo-missions__logoMark">R</span>
    <span className="revvo-missions__logoText">Revvo</span>
  </div>
);

const FilterChipIcon = ({ type }) => {
  const icons = {
    instagram: (
      <OutlineIcon className="revvo-missions__chipSvg">
        <rect x="4" y="4" width="16" height="16" rx="5" stroke="currentColor" strokeWidth="1.8" />
        <circle cx="12" cy="12" r="3.5" stroke="currentColor" strokeWidth="1.8" />
        <circle cx="17" cy="7" r="1" fill="currentColor" />
      </OutlineIcon>
    ),
    tiktok: <Icon className="revvo-missions__chipSvg"><path d="M16.6 5.82a4.28 4.28 0 0 1-.78-.05v3.44a4.94 4.94 0 0 1-4.94 4.94 4.94 4.94 0 0 1-.78-.06 4.94 4.94 0 0 0 4.72 6.41V5.82Z" /></Icon>,
    youtube: <Icon className="revvo-missions__chipSvg"><path d="M21.58 7.19a2.43 2.43 0 0 0-1.7-1.71C18.36 5 12 5 12 5s-6.36 0-7.88.48a2.43 2.43 0 0 0-1.7 1.71A25.06 25.06 0 0 0 2 12a25.06 25.06 0 0 0 .42 4.81 2.43 2.43 0 0 0 1.7 1.71C5.64 19 12 19 12 19s6.36 0 7.88-.48a2.43 2.43 0 0 0 1.7-1.71A25.06 25.06 0 0 0 22 12a25.06 25.06 0 0 0-.42-4.81ZM10 15.5v-7l6 3.5-6 3.5Z" /></Icon>,
    heart: <Icon className="revvo-missions__chipSvg"><path d="M12 21.35 10.55 20.03C5.4 15.36 2 12.28 2 8.5A5.45 5.45 0 0 1 7.5 3C9.24 3 10.91 3.81 12 5.08A6.02 6.02 0 0 1 16.5 3 5.45 5.45 0 0 1 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35Z" /></Icon>,
    follow: <Icon className="revvo-missions__chipSvg"><path d="M15 12c2.21 0 4-1.79 4-4s-1.79-4-4-4-4 1.79-4 4 1.79 4 4 4Zm-8 0c1.66 0 3-1.34 3-3S8.66 6 7 6 4 7.34 4 9s1.34 3 3 3Zm0 2c-2.33 0-7 1.17-7 3.5V20h14v-2.5C14 15.17 9.33 14 7 14Zm8 0c-.29 0-.62.02-.97.05 1.16.84 1.97 1.97 1.97 3.45V20h8v-2.5c0-2.33-4.67-3.5-9-3.5Z" /></Icon>,
    comment: <Icon className="revvo-missions__chipSvg"><path d="M20 2H4a2 2 0 0 0-2 2v18l4-4h14a2 2 0 0 0 2-2V4a2 2 0 0 0-2-2Zm-2 12H6v-2h12v2Zm0-3H6V9h12v2Zm0-3H6V6h12v2Z" /></Icon>,
    bolt: <Icon className="revvo-missions__chipSvg"><path d="M11 21h-1l1-7H7l6-11h1l-1 7h4l-6 11Z" /></Icon>
  };
  return icons[type] || null;
};

const QuickIcon = ({ type }) => {
  const icons = {
    bolt: <Icon><path d="M11 21h-1l1-7H7l6-11h1l-1 7h4l-6 11Z" /></Icon>,
    gift: <Icon><path d="M20 6h-2.18c.11-.31.18-.65.18-1a2.996 2.996 0 0 0-5.5-1.65l-.5.67-.5-.68C10.96 2.54 10.05 2 9 2 7.34 2 6 3.34 6 5c0 .35.07.69.18 1H4c-1.11 0-2 .89-2 2v11c0 1.11.89 2 2 2h16c1.11 0 2-.89 2-2V8c0-1.11-.89-2-2-2Zm-9-2c.55 0 1 .45 1 1s-.45 1-1 1-1-.45-1-1 .45-1 1-1Zm6 16H7v-2h10v2Zm0-4H7v-2h10v2Z" /></Icon>,
    timer: (
      <OutlineIcon>
        <circle cx="12" cy="13" r="8" stroke="currentColor" strokeWidth="1.8" />
        <path d="M12 9v4l2.5 1.5M9 2h6" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
      </OutlineIcon>
    ),
    star: <Icon><path d="M12 2l2.2 4.5 4.9.7-3.5 3.4.8 4.9L12 13.8 7.6 15.5l.8-4.9L5 7.2l4.9-.7L12 2Z" /></Icon>
  };
  return icons[type] || icons.bolt;
};

const BrandMark = ({ brand, tone }) => (
  <span className={`revvo-missions__brandMark revvo-missions__brandMark--${tone}`}>{brand}</span>
);

const MissionCard = ({ mission, onOpen }) => (
  <article className="revvo-missions__card">
    <BrandMark brand={mission.brand} tone={mission.brandTone} />
    <div className="revvo-missions__cardMain">
      <h3>{mission.title}</h3>
      <p className="revvo-missions__cardPlatform">
        <span>{mission.platform}</span>
        <i aria-hidden="true">·</i>
        {mission.action}
      </p>
      <div className="revvo-missions__cardMeta">
        <span>
          <Icon><path d="M16 11c1.66 0 3-1.34 3-3s-1.34-3-3-3-3 1.34-3 3 1.34 3 3 3Zm-8 0c1.66 0 3-1.34 3-3S9.66 5 8 5 5 6.34 5 8s1.34 3 3 3Zm0 2c-2.67 0-8 1.34-8 4v2h16v-2c0-2.66-5.33-4-8-4Z" /></Icon>
          {mission.seats}
        </span>
        <span>
          <OutlineIcon><circle cx="12" cy="12" r="9" stroke="currentColor" strokeWidth="1.8" /><path d="M12 7v5l3 2" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" /></OutlineIcon>
          {mission.time}
        </span>
      </div>
    </div>
    <div className="revvo-missions__cardSide">
      <strong className="revvo-missions__cardRvc">{mission.rvc}</strong>
      <span className="revvo-missions__cardXp">
        <Icon><path d="M12 2l2.2 4.5 4.9.7-3.5 3.4.8 4.9L12 13.8 7.6 15.5l.8-4.9L5 7.2l4.9-.7L12 2Z" /></Icon>
        {mission.xp}
      </span>
      <button type="button" className="revvo-missions__cardBtn" onClick={() => onOpen(mission.id)}>
        Ver missão
      </button>
    </div>
  </article>
);

const RecommendedCard = ({ item, onOpen }) => (
  <article className={`revvo-missions__recCard revvo-missions__recCard--${item.brandTone}`}>
    <BrandMark brand={item.brand} tone={item.brandTone} />
    <div className="revvo-missions__recCopy">
      <h4>{item.title}</h4>
      <p>
        {item.platform} · {item.action}
      </p>
      <div className="revvo-missions__recRewards">
        <strong>{item.rvc}</strong>
        <span>
          <Icon><path d="M12 2l2.2 4.5 4.9.7-3.5 3.4.8 4.9L12 13.8 7.6 15.5l.8-4.9L5 7.2l4.9-.7L12 2Z" /></Icon>
          {item.xp}
        </span>
      </div>
    </div>
    <button type="button" className="revvo-missions__recArrow" aria-label={`Abrir ${item.title}`} onClick={() => onOpen(item.id)}>
      <OutlineIcon>
        <path d="m9 6 6 6-6 6" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
      </OutlineIcon>
    </button>
  </article>
);

const RevvoMissionsPreview = () => {
  const navigate = useNavigate();
  const { scaleRef, innerRef } = useRevvoCanvasScale();
  const [activeFilter, setActiveFilter] = useState('all');

  const nav = useMemo(
    () => [
      { id: 'home', label: 'Home', path: '/dev/revvo-home', icon: <path d="M10 20v-6h4v6h5v-8h3L12 3 2 12h3v8h5Z" /> },
      {
        id: 'explore',
        label: 'Explorar',
        active: true,
        icon: <path d="M12 2a10 10 0 1 0 10 10A10 10 0 0 0 12 2Zm0 2a8 8 0 1 1-8 8 8 8 0 0 1 8-8Zm0 2.5A5.5 5.5 0 1 0 17.5 12 5.51 5.51 0 0 0 12 6.5Zm0 2A3.5 3.5 0 1 1 8.5 12 3.5 3.5 0 0 1 12 8.5Z" />
      },
      { id: 'ranking', label: 'Ranking', path: '/dev/revvo-ranking', icon: <path d="M4 20h16v-2H4v2Zm2-4h3V9H6v7Zm5 0h3V5h-3v11Zm5 0h3V12h-3v4Z" /> },
      { id: 'wallet', label: 'Carteira', path: '/dev/revvo-carteira', icon: <path d="M20 4H4a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2V6a2 2 0 0 0-2-2Zm0 14H4V8h16v10Zm-2-6h-2a2 2 0 1 0 0 4h2v-4Z" /> },
      { id: 'profile', label: 'Perfil', path: '/dev/revvo-profile', icon: <path d="M12 12c2.21 0 4-1.79 4-4s-1.79-4-4-4-4 1.79-4 4 1.79 4 4 4Zm0 2c-2.67 0-8 1.34-8 4v2h16v-2c0-2.66-5.33-4-8-4Z" /> }
    ],
    []
  );

  const goMission = (id) => navigate(id ? `/dev/revvo-mission/${id}` : '/dev/revvo-mission');

  const { banner, recommended } = exploreData;

  return (
    <div className="revvo-missions-app revvo-canvas-app">
      <div className="revvo-missions__scale revvo-canvas-scale" ref={scaleRef}>
        <div className="revvo-missions revvo-canvas-surface" ref={innerRef}>
          <header className="revvo-missions__header">
            <RevvoLogo />
            <button type="button" className="revvo-missions__filterBtn">
              <OutlineIcon className="revvo-missions__filterIcon">
                <path d="M4 7h10M18 7h2M4 17h3M11 17h9M8 5v4M15 15v4" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
              </OutlineIcon>
              Filtros
            </button>
          </header>

          <main className="revvo-missions__main">
            <div className="revvo-missions__intro">
              <h1>Explorar Missões</h1>
              <p>Escolha uma missão, conclua e ganhe RevvoCoins.</p>
            </div>

            <label className="revvo-missions__search">
              <OutlineIcon className="revvo-missions__searchIcon">
                <path d="m21 21-4.35-4.35M10.5 18a7.5 7.5 0 1 1 0-15 7.5 7.5 0 0 1 0 15Z" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
              </OutlineIcon>
              <input type="search" placeholder={exploreData.searchPlaceholder} aria-label="Buscar missões" />
            </label>

            <section className="revvo-missions__banner" aria-label="Missões em alta">
              <div className="revvo-missions__bannerCopy">
                <span className="revvo-missions__bannerBadge">
                  <img src={banner.art.fire} alt="" decoding="async" />
                  {banner.badge}
                </span>
                <h2>
                  {banner.titleBefore} <strong>{banner.titleHighlight}</strong> {banner.titleAfter}
                </h2>
                <p>{banner.subtitle}</p>
                <button type="button" className="revvo-missions__bannerCta">
                  {banner.cta}
                  <span aria-hidden="true">›</span>
                </button>
              </div>
              <div className="revvo-missions__bannerArt" aria-hidden="true">
                <img className="revvo-missions__bannerHero" src={banner.art.hero} alt="" decoding="async" />
              </div>
            </section>

            <nav className="revvo-missions__chips" aria-label="Categorias de missões">
              {exploreData.filters.map((filter) => (
                <button
                  key={filter.id}
                  type="button"
                  className={`revvo-missions__chip ${activeFilter === filter.id ? 'revvo-missions__chip--active' : ''}`}
                  onClick={() => setActiveFilter(filter.id)}
                >
                  {filter.platform ? <FilterChipIcon type={filter.platform} /> : null}
                  {filter.icon ? <FilterChipIcon type={filter.icon} /> : null}
                  <span>{filter.label}</span>
                </button>
              ))}
            </nav>

            <section className="revvo-missions__quickGrid" aria-label="Atalhos rápidos">
              {exploreData.quickAccess.map((item) => (
                <button key={item.id} type="button" className={`revvo-missions__quickCard revvo-missions__quickCard--${item.tone}`}>
                  <span className="revvo-missions__quickIcon">{<QuickIcon type={item.icon} />}</span>
                  <span className="revvo-missions__quickLabel">{item.label}</span>
                  <OutlineIcon className="revvo-missions__quickChevron">
                    <path d="m9 6 6 6-6 6" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
                  </OutlineIcon>
                </button>
              ))}
            </section>

            <section className="revvo-missions__list" aria-label="Missões disponíveis">
              {exploreData.missions.map((mission) => (
                <MissionCard key={mission.id} mission={mission} onOpen={goMission} />
              ))}
            </section>

            <section className="revvo-missions__recommended" aria-labelledby="revvo-missions-rec-title">
              <div className="revvo-missions__recHead">
                <h2 id="revvo-missions-rec-title">
                  <Icon><path d="M12 2l1.8 3.6 4 0.6-2.9 2.8.7 4-3.6-1.9-3.6 1.9.7-4L7.2 6.2l4-.6L12 2Zm8 10.5 1.4 2.8 3.1.5-2.2 2.2.5 3.1-2.8-1.5-2.8 1.5.5-3.1-2.2-2.2 3.1-.5L20 12.5ZM4 12.5l1.4 2.8 3.1.5-2.2 2.2.5 3.1-2.8-1.5-2.8 1.5.5-3.1-2.2-2.2 3.1-.5L4 12.5Z" /></Icon>
                  {recommended.title}
                </h2>
                <p>{recommended.subtitle}</p>
              </div>
              <div className="revvo-missions__recScroll">
                {recommended.items.map((item) => (
                  <RecommendedCard key={item.id} item={item} onOpen={goMission} />
                ))}
              </div>
            </section>
          </main>

          <nav className="revvo-missions__bottomNav" aria-label="Navegação principal">
            {nav.map(({ id, label, active, icon, path }) => (
              <button
                key={id}
                type="button"
                className={active ? 'is-active' : ''}
                onClick={() => path && navigate(path)}
                aria-current={active ? 'page' : undefined}
              >
                <span className="revvo-missions__navIconWrap">
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

export default RevvoMissionsPreview;
