import React, { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useRevvoCanvasScale } from '../../hooks/useRevvoCanvasScale';
import './RevvoProfilePreview.css';

const profileData = {
  name: 'Camila Creator',
  handle: '@camila.creator',
  level: 'Creator Pro',
  levelNumber: 12,
  bio: 'Criadora de conteudo • Apaixonada por marketing e novas tendencias 🚀',
  tags: ['Marketing', 'Lifestyle', 'Tecnologia'],
  followers: '12,8K',
  connections: '3,2K',
  following: '45',
  rvcEarned: 2480,
  xp: 1680,
  nextLevelXp: 2000,
  ranking: 14,
  rankingPercent: 'Top 15%',
  streakDays: 7,
  bestStreak: 12,
  missionsDone: 156,
  approvalRate: 98,
  platforms: ['instagram', 'tiktok', 'youtube', 'x']
};

const ASSETS = {
  avatar: '/banco/assets/revvo-home-v2/revvo-home-v2-avatar-camila.png',
  badge: '/banco/assets/revvo-home-v2/revvo-home-v2-badge-3d.png',
  trophy: '/banco/assets/revvo-home-v2/revvo-home-v2-trophy-cutout-3d.png',
  fire: '/banco/assets/revvo-ranking/revvo-ranking-fire.png',
  rvcCoin: '/banco/assets/revvo-ranking/revvo-ranking-rvc-coin.png',
  rocket: '/banco/assets/revvo-home-v2/revvo-home-v2-megaphone-3d.png'
};

const formatNumber = (value) => value.toLocaleString('pt-BR');
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
    <path d="m9 6 6 6-6 6" stroke="currentColor" strokeWidth="2.1" strokeLinecap="round" strokeLinejoin="round" />
  </OutlineIcon>
);

const PlatformMark = ({ type, size = 'md' }) => {
  const className = `revvo-profile__platform revvo-profile__platform--${type} revvo-profile__platform--${size}`;
  if (type === 'instagram') return <span className={className}>◎</span>;
  if (type === 'tiktok') return <span className={className}>♪</span>;
  if (type === 'youtube') return <span className={className}>▶</span>;
  if (type === 'x') return <span className={className}>𝕏</span>;
  return <span className={className}>R</span>;
};

const RevvoProfilePreview = () => {
  const navigate = useNavigate();
  const { scaleRef, innerRef } = useRevvoCanvasScale();
  const [activeTab, setActiveTab] = useState('activity');

  const stats = useMemo(
    () => [
      {
        id: 'rvc',
        label: 'RVC ganhos',
        value: formatNumber(profileData.rvcEarned),
        sub: 'Total acumulado',
        tone: 'gold',
        icon: <img src={ASSETS.rvcCoin} alt="" width="22" height="22" decoding="async" />
      },
      {
        id: 'xp',
        label: 'XP atual',
        value: formatNumber(profileData.xp),
        sub: `Nivel ${profileData.levelNumber}`,
        tone: 'purple',
        icon: (
          <Icon>
            <path d="m12 2 2.4 4.9 5.4.8-3.9 3.8.9 5.4L12 14.3 7.2 16.9l.9-5.4L4.2 7.7l5.4-.8L12 2Z" />
          </Icon>
        )
      },
      {
        id: 'ranking',
        label: 'Ranking semanal',
        value: `#${profileData.ranking}`,
        sub: profileData.rankingPercent,
        tone: 'blue',
        icon: (
          <Icon>
            <path d="M5 3h14v4H5V3Zm2 6h4v12H7V9Zm5 0h5v8h-5V9Z" />
          </Icon>
        )
      },
      {
        id: 'streak',
        label: 'Sequencia atual',
        value: `${profileData.streakDays} dias`,
        sub: `Melhor: ${profileData.bestStreak} dias`,
        tone: 'orange',
        icon: <img src={ASSETS.fire} alt="" width="22" height="22" decoding="async" />
      },
      {
        id: 'missions',
        label: 'Missoes concluidas',
        value: String(profileData.missionsDone),
        sub: `Taxa: ${profileData.approvalRate}%`,
        tone: 'green',
        icon: (
          <Icon>
            <path d="M9 16.2 4.8 12l-1.4 1.4L9 19 21 7l-1.4-1.4L9 16.2Z" />
          </Icon>
        )
      }
    ],
    []
  );

  const socialStats = useMemo(
    () => [
      {
        id: 'followers',
        value: profileData.followers,
        label: 'Seguidores',
        tone: 'blue',
        icon: <path d="M16 11c1.66 0 3-1.34 3-3s-1.34-3-3-3-3 1.34-3 3 1.34 3 3 3Zm-8 0c1.66 0 3-1.34 3-3S9.66 5 8 5 5 6.34 5 8s1.34 3 3 3Zm0 2c-2.33 0-7 1.17-7 3.5V18h14v-1.5C15 14.17 10.33 13 8 13Zm8 0c-.29 0-.62.02-.97.05 1.16.84 1.97 1.97 1.97 3.45V18h6v-1.5c0-2.33-4.67-3.5-9-3.5Z" />
      },
      {
        id: 'connections',
        value: profileData.connections,
        label: 'Conexoes',
        tone: 'pink',
        icon: <path d="M12 21.35 10.55 20.03C5.4 15.36 2 12.28 2 8.5A5.45 5.45 0 0 1 7.5 3C9.24 3 10.91 3.81 12 5.08A6.02 6.02 0 0 1 16.5 3 5.45 5.45 0 0 1 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35Z" />
      },
      {
        id: 'following',
        value: profileData.following,
        label: 'Seguindo',
        tone: 'orange',
        icon: <path d="M12 2l2.2 4.5 4.9.7-3.5 3.4.8 4.9L12 13.8 7.6 15.5l.8-4.9L5 7.2l4.9-.7L12 2Z" />
      }
    ],
    []
  );

  const achievements = useMemo(
    () => [
      { id: 'top10', label: 'Top 10 Semanal', image: ASSETS.trophy, tone: 'purple' },
      { id: 'streak7', label: '7 Dias Seguidos', image: ASSETS.fire, tone: 'orange' },
      { id: 'active', label: 'Creator Ativo', image: ASSETS.badge, tone: 'blue' },
      { id: 'm50', label: '50 Missoes Concluidas', image: ASSETS.badge, tone: 'violet' },
      { id: 'approved', label: 'Missoes Aprovadas', image: ASSETS.badge, tone: 'green' },
      { id: 'performer', label: 'Top Performer', image: ASSETS.trophy, tone: 'gold' }
    ],
    []
  );

  const activities = useMemo(
    () => [
      {
        id: 'a1',
        platform: 'instagram',
        title: 'Curtir post da Adidas',
        date: 'Hoje 10:21',
        status: 'Concluida',
        statusTone: 'done',
        reward: '+30 RVC',
        thumbTone: 'sneaker'
      },
      {
        id: 'a2',
        platform: 'tiktok',
        title: 'Seguir @nikebrasil',
        date: 'Hoje 09:45',
        status: 'Concluida',
        statusTone: 'done',
        reward: '+25 RVC',
        thumbTone: 'portrait'
      },
      {
        id: 'a3',
        platform: 'youtube',
        title: 'Assistir video completo',
        date: 'Ontem 21:15',
        status: 'Aguardando validacao',
        statusTone: 'pending',
        reward: '+80 RVC',
        thumbTone: 'tech'
      }
    ],
    []
  );

  const tabs = useMemo(
    () => [
      { id: 'activity', label: 'Atividade' },
      { id: 'campaigns', label: 'Campanhas' },
      { id: 'achievements', label: 'Conquistas' },
      { id: 'about', label: 'Sobre' }
    ],
    []
  );

  const nav = useMemo(
    () => [
      { id: 'home', label: 'Inicio', path: '/dev/revvo-home', icon: <path d="M10 20v-6h4v6h5v-8h3L12 3 2 12h3v8h5Z" /> },
      { id: 'missions', label: 'Missoes', path: '/dev/revvo-missions', icon: <path d="M12 2a10 10 0 1 0 10 10A10 10 0 0 0 12 2Zm0 4a6 6 0 1 1-6 6 6 6 0 0 1 6-6Z" /> },
      { id: 'wallet', label: 'Ganhos', path: '/dev/revvo-ganhos', icon: <path d="M12 2a10 10 0 1 0 10 10A10 10 0 0 0 12 2Zm-3 7h6v2H9V9Zm0 4h6v2H9v-2Z" /> },
      { id: 'ranking', label: 'Ranking', path: '/dev/revvo-ranking', icon: <path d="M4 20h16v-2H4v2Zm2-4h3V9H6v7Zm5 0h3V5h-3v11Zm5 0h3v-4h-3v4Z" /> },
      { id: 'profile', label: 'Perfil', active: true, icon: <path d="M12 12a4 4 0 1 0-4-4 4 4 0 0 0 4 4Zm0 2c-2.67 0-8 1.34-8 4v2h16v-2c0-2.66-5.33-4-8-4Z" /> }
    ],
    []
  );

  return (
    <div className="revvo-profile-app revvo-canvas-app">
      <div className="revvo-profile__scale revvo-canvas-scale" ref={scaleRef}>
        <div className="revvo-profile revvo-canvas-surface" ref={innerRef}>
          <section className="revvo-profile__hero" aria-label="Perfil do creator">
            <header className="revvo-profile__toolbar">
              <button type="button" className="revvo-profile__iconBtn" aria-label="Voltar" onClick={() => navigate('/dev/revvo-home')}>
                <OutlineIcon>
                  <path d="m15 6-6 6 6 6" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
                </OutlineIcon>
              </button>
              <div className="revvo-profile__toolbarActions">
                <button type="button" className="revvo-profile__iconBtn" aria-label="Compartilhar">
                  <OutlineIcon>
                    <path d="M18 8a3 3 0 1 0-2.83-4H15v2h.17A1 1 0 1 1 14 7.17V7a3 3 0 0 0 0 6v2a5 5 0 1 0-5-5h2a3 3 0 0 1 3 3 3 3 0 0 1-3 3v2a5 5 0 0 0 5-5 5 5 0 0 0-5-5Z" stroke="currentColor" strokeWidth="1.8" />
                  </OutlineIcon>
                </button>
                <button type="button" className="revvo-profile__iconBtn" aria-label="Mais opcoes">
                  <Icon>
                    <path d="M6 10a2 2 0 1 0 0-4 2 2 0 0 0 0 4Zm6 0a2 2 0 1 0 0-4 2 2 0 0 0 0 4Zm6 0a2 2 0 1 0 0-4 2 2 0 0 0 0 4Z" />
                  </Icon>
                </button>
              </div>
            </header>

            <div className="revvo-profile__identity">
              <div className="revvo-profile__avatarCol">
                <div className="revvo-profile__avatarWrap">
                  <img className="revvo-profile__avatar" src={ASSETS.avatar} alt="" width="88" height="88" decoding="async" />
                  <span className="revvo-profile__online" aria-hidden="true" />
                </div>
                <span className="revvo-profile__levelPill">
                  <Icon><path d="M12 2 4 6v6c0 4.8 3.2 8.6 8 10 4.8-1.4 8-5.2 8-10V6l-8-4Z" /></Icon>
                  {profileData.level}
                </span>
              </div>
              <div className="revvo-profile__identityCopy">
                <button type="button" className="revvo-profile__editBtn">
                  <OutlineIcon>
                    <path d="M4 20h4l10.5-10.5a2.1 2.1 0 0 0 0-3L16.5 4a2.1 2.1 0 0 0-3 0L3 14.5V20Z" stroke="currentColor" strokeWidth="1.8" />
                  </OutlineIcon>
                  Editar perfil
                </button>
                <h1>
                  {profileData.name}
                  <Icon><path d="M9.5 12.5 11 14l4.5-4.5L16 8l-5 5-2.5-2.5L9.5 12.5Z" /></Icon>
                </h1>
                <p className="revvo-profile__handle">{profileData.handle}</p>
                <p className="revvo-profile__bio">{profileData.bio}</p>
                <div className="revvo-profile__tags">
                  {profileData.tags.map((tag) => (
                    <span key={tag}>{tag}</span>
                  ))}
                </div>
              </div>
            </div>

            <div className="revvo-profile__social">
              {socialStats.map((item) => (
                <article key={item.id} className={`revvo-profile__socialCard revvo-profile__socialCard--${item.tone}`}>
                  <span className="revvo-profile__socialIcon">
                    <Icon>{item.icon}</Icon>
                  </span>
                  <div>
                    <strong>{item.value}</strong>
                    <span>{item.label}</span>
                  </div>
                </article>
              ))}
            </div>
          </section>

          <section className="revvo-profile__statsWrap" aria-label="Resumo do creator">
            <div className="revvo-profile__stats">
              {stats.map((item) => (
                <article key={item.id} className={`revvo-profile__stat revvo-profile__stat--${item.tone}`}>
                  <span className="revvo-profile__statIcon">{item.icon}</span>
                  <div className="revvo-profile__statBody">
                    <strong>{item.value}</strong>
                    <p>{item.label}</p>
                    <small>{item.sub}</small>
                  </div>
                </article>
              ))}
            </div>
          </section>

          <section className="revvo-profile__achievements" aria-labelledby="revvo-profile-achievements">
            <div className="revvo-profile__achievementsCard">
              <div className="revvo-profile__sectionHead">
                <h2 id="revvo-profile-achievements">
                  <Icon><path d="M5 3h14v4H5V3Zm2 6h4v12H7V9Zm5 0h5v8h-5V9Z" /></Icon>
                  Conquistas
                </h2>
                <button type="button">Ver todas <Chevron /></button>
              </div>
              <div className="revvo-profile__achievementScroll">
                {achievements.map((item) => (
                  <article key={item.id} className={`revvo-profile__achievement revvo-profile__achievement--${item.tone}`}>
                    <img src={item.image} alt="" decoding="async" />
                    <p>{item.label}</p>
                  </article>
                ))}
              </div>
            </div>
          </section>

          <section className="revvo-profile__body">
            <div className="revvo-profile__tabs" role="tablist" aria-label="Secoes do perfil">
              {tabs.map((tab) => (
                <button
                  key={tab.id}
                  type="button"
                  role="tab"
                  className={activeTab === tab.id ? 'is-active' : ''}
                  aria-selected={activeTab === tab.id}
                  onClick={() => setActiveTab(tab.id)}
                >
                  {tab.label}
                </button>
              ))}
            </div>

            <div className="revvo-profile__mainGrid">
              <div className="revvo-profile__activityList" role="tabpanel">
                {activities.map((item) => (
                  <article key={item.id} className="revvo-profile__activity">
                    <div className="revvo-profile__activityMedia">
                      <div className={`revvo-profile__activityThumb revvo-profile__activityThumb--${item.thumbTone}`} aria-hidden="true" />
                      <PlatformMark type={item.platform} size="sm" />
                    </div>
                    <div className="revvo-profile__activityCopy">
                      <h3>{item.title}</h3>
                      <p>{item.date}</p>
                    </div>
                    <div className="revvo-profile__activityMeta">
                      <span className={`revvo-profile__status revvo-profile__status--${item.statusTone}`}>{item.status}</span>
                      <strong>{item.reward}</strong>
                    </div>
                  </article>
                ))}
                <button type="button" className="revvo-profile__moreBtn">
                  Ver mais atividades
                  <OutlineIcon>
                    <path d="m6 9 6 6 6-6" stroke="currentColor" strokeWidth="2.1" strokeLinecap="round" strokeLinejoin="round" />
                  </OutlineIcon>
                </button>
              </div>

              <aside className="revvo-profile__aside">
                <article className="revvo-profile__levelCard">
                  <div className="revvo-profile__levelTop">
                    <span>Nivel {profileData.levelNumber}</span>
                    <b>{profileData.level}</b>
                  </div>
                  <div className="revvo-profile__levelBar">
                    <i style={{ width: pct(profileData.xp, profileData.nextLevelXp) }} />
                  </div>
                  <p>{formatNumber(profileData.xp)} / {formatNumber(profileData.nextLevelXp)} XP</p>
                </article>

                <article className="revvo-profile__platformsCard">
                  <div className="revvo-profile__miniHead">
                    <h3>Plataformas conectadas</h3>
                    <button type="button">Ver todas</button>
                  </div>
                  <div className="revvo-profile__platformRow">
                    {profileData.platforms.map((platform) => (
                      <div key={platform} className="revvo-profile__platformItem">
                        <PlatformMark type={platform} size="lg" />
                        <Icon><path d="M9 16.2 4.8 12l-1.4 1.4L9 19 21 7l-1.4-1.4L9 16.2Z" /></Icon>
                      </div>
                    ))}
                  </div>
                </article>

                <article className="revvo-profile__approvalCard">
                  <h3>Taxa de aprovacao</h3>
                  <div className="revvo-profile__approvalRing" style={{ '--revvo-profile-approval': `${profileData.approvalRate}%` }}>
                    <strong>{profileData.approvalRate}%</strong>
                  </div>
                  <p>Excelente! Voce esta entre os melhores criadores</p>
                  <span className="revvo-profile__approvalBadge">Excelente!</span>
                </article>
              </aside>
            </div>
          </section>

          <section className="revvo-profile__cta" aria-label="Continuar evoluindo">
            <img src={ASSETS.rocket} alt="" decoding="async" />
            <div className="revvo-profile__ctaCopy">
              <h2>Continue evoluindo!</h2>
              <p>Complete missoes, suba no ranking e ganhe ainda mais RVC!</p>
            </div>
            <button type="button" className="revvo-profile__ctaBtn" onClick={() => navigate('/dev/revvo-missions')}>
              Ver missoes disponiveis <Chevron />
            </button>
          </section>

          <nav className="revvo-profile-bottom-nav" aria-label="Navegacao principal">
            {nav.map((item) => (
              <button
                key={item.id}
                type="button"
                className={item.active ? 'is-active' : ''}
                onClick={() => item.path && navigate(item.path)}
                aria-current={item.active ? 'page' : undefined}
              >
                <span className="revvo-profile__navIcon">
                  <Icon>{item.icon}</Icon>
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

export default RevvoProfilePreview;
