import React, { useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { useRevvoCanvasScale } from '../../hooks/useRevvoCanvasScale';
import './RevvoRankingPreview.css';

const rankingData = {
  activePeriod: 'weekly',
  user: {
    name: 'Voce',
    handle: '@camila.creator',
    position: 14,
    level: 'Creator Pro',
    levelNumber: 12,
    xp: 1680,
    nextLevelXp: 2000,
    missingTop10Xp: 320,
    rvcEarned: 2480,
    streakDays: 7,
    avatar: '/banco/assets/revvo-home-v2/revvo-home-v2-avatar-camila.png'
  },
  podium: [
    { position: 1, name: 'Larissa', handle: '@larissacreator', rvcEarned: 12450, streakDays: 15, avatar: null, frame: '/banco/assets/revvo-ranking/revvo-ranking-podium-frame-1-gold.png' },
    { position: 2, name: 'Pedro', handle: '@pedro.mkt', rvcEarned: 9860, streakDays: 12, avatar: null, frame: '/banco/assets/revvo-ranking/revvo-ranking-podium-frame-2-silver.png' },
    { position: 3, name: 'Eumafe', handle: '@eumafe', rvcEarned: 7230, streakDays: 10, avatar: null, frame: '/banco/assets/revvo-ranking/revvo-ranking-podium-frame-3-bronze.png' }
  ],
  ranking: [
    { position: 4, handle: '@joaocreator', level: 'Creator Pro', xp: 2150, rvcEarned: 6240, avatarTone: 'male' },
    { position: 5, handle: '@anacontent', level: 'Creator Pro', xp: 1980, rvcEarned: 5870, avatarTone: 'female' },
    { position: 6, handle: '@ruancips', level: 'Creator Plus', xp: 1750, rvcEarned: 4980, avatarTone: 'blue' },
    { position: 7, handle: '@biancamidia', level: 'Creator Plus', xp: 1620, rvcEarned: 4560, avatarTone: 'orange' },
    { type: 'separator' },
    { position: 14, handle: 'Voce', level: 'Creator Pro', xp: 1680, rvcEarned: 2480, isCurrentUser: true, avatarTone: 'user' },
    { type: 'separator' },
    { position: 50, handle: '@mateus.social', level: 'Creator Start', xp: 320, rvcEarned: 680, avatarTone: 'green' }
  ],
  rewards: [
    { tier: 'Top 1', tone: 'gold', bonus: '500 RVC bonus', perks: ['Badge exclusivo', '+ Experiencia'] },
    { tier: 'Top 3', tone: 'purple', bonus: '300 RVC bonus', perks: ['Badge exclusivo', '+ Experiencia'] },
    { tier: 'Top 10', tone: 'blue', bonus: '100 RVC bonus', perks: ['XP extra', '+ Destaque no app'] }
  ]
};

const ASSETS = {
  podium: '/banco/assets/revvo-ranking/revvo-ranking-podium-3d.png',
  avatarSlot: '/banco/assets/revvo-ranking/revvo-ranking-avatar-slot.png',
  rvcCoin: '/banco/assets/revvo-ranking/revvo-ranking-rvc-coin.png',
  streakFire: '/banco/assets/revvo-ranking/revvo-ranking-fire.png',
  rocket: '/banco/assets/revvo-ranking/revvo-ranking-rocket-3d.png'
};

const formatNumber = (value) => value.toLocaleString('pt-BR');
const percent = (current, target) => `${Math.min(100, Math.round((current / target) * 100))}%`;

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

const RvcCoin = () => <img className="revvo-ranking__coin" src={ASSETS.rvcCoin} alt="" width="19" height="19" decoding="async" />;

const Avatar = ({ tone = 'blue', src, online = false }) => (
  <span className={`revvo-ranking__avatar revvo-ranking__avatar--${tone}`}>
    {src ? <img src={src} alt="" width="52" height="52" decoding="async" /> : <i />}
    {online ? <b aria-hidden="true" /> : null}
  </span>
);

const LevelBadge = ({ level }) => {
  const tone = level.includes('Start') ? 'green' : level.includes('Plus') ? 'blue' : 'purple';
  return (
    <span className={`revvo-ranking__levelBadge revvo-ranking__levelBadge--${tone}`} title={level}>
      <Icon><path d="M12 2 4 6v6c0 4.8 3.2 8.6 8 10 4.8-1.4 8-5.2 8-10V6l-8-4Zm0 5.2 1.3 2.6 2.9.4-2.1 2 .5 2.9-2.6-1.4-2.6 1.4.5-2.9-2.1-2 2.9-.4L12 7.2Z" /></Icon>
    </span>
  );
};

const RevvoRankingPreview = () => {
  const navigate = useNavigate();
  const { scaleRef, innerRef } = useRevvoCanvasScale();

  const periods = useMemo(
    () => [
      { id: 'weekly', label: 'Semanal', icon: <path d="M19 5h-2V3H7v2H5c-1.1 0-2 .9-2 2v1c0 2.4 1.7 4.4 4 4.9.7 1.5 2 2.6 4 3V19H7v2h10v-2h-4v-3.1c2-.4 3.3-1.5 4-3 2.3-.5 4-2.5 4-4.9V7c0-1.1-.9-2-2-2ZM5 8V7h2v3.6C5.8 10.1 5 9.1 5 8Zm14 0c0 1.1-.8 2.1-2 2.6V7h2v1Z" /> },
      { id: 'monthly', label: 'Mensal', icon: <path d="M7 2h2v2h6V2h2v2h3v18H4V4h3V2Zm13 8H6v10h14V10Z" /> },
      { id: 'all', label: 'Geral', icon: <path d="m12 2 2.9 6 6.6.9-4.8 4.6 1.1 6.5-5.8-3.1L6.2 20l1.1-6.5-4.8-4.6 6.6-.9L12 2Z" /> }
    ],
    []
  );

  const nav = useMemo(
    () => [
      { id: 'home', label: 'Inicio', path: '/dev/revvo-home', icon: <path d="M10 20v-6h4v6h5v-8h3L12 3 2 12h3v8h5Z" /> },
      { id: 'missions', label: 'Missoes', path: '/dev/revvo-missions', icon: <path d="M12 2a10 10 0 1 0 10 10A10 10 0 0 0 12 2Zm0 4a6 6 0 1 1-6 6 6 6 0 0 1 6-6Z" /> },
      { id: 'wallet', label: 'Ganhos', path: '/dev/revvo-carteira', icon: <path d="M20 6H4a2 2 0 0 0-2 2v10h20V8a2 2 0 0 0-2-2Zm0 8h-4a2 2 0 1 1 0-4h4v4Z" /> },
      { id: 'ranking', label: 'Ranking', active: true, icon: <path d="M19 5h-2V3H7v2H5c-1.1 0-2 .9-2 2v1c0 2.4 1.7 4.4 4 4.9.7 1.5 2 2.6 4 3V19H7v2h10v-2h-4v-3.1c2-.4 3.3-1.5 4-3 2.3-.5 4-2.5 4-4.9V7c0-1.1-.9-2-2-2Z" /> },
      { id: 'profile', label: 'Perfil', path: '/dev/revvo-profile', icon: <path d="M12 12a4 4 0 1 0-4-4 4 4 0 0 0 4 4Zm0 2c-2.7 0-8 1.3-8 4v2h16v-2c0-2.7-5.3-4-8-4Z" /> }
    ],
    []
  );

  const podiumByPosition = [2, 1, 3].map((position) => rankingData.podium.find((item) => item.position === position));

  return (
    <div className="revvo-ranking-app revvo-canvas-app">
      <div className="revvo-ranking__scale revvo-canvas-scale" ref={scaleRef}>
        <div className="revvo-ranking revvo-canvas-surface" ref={innerRef}>
          <section className="revvo-ranking-top">
            <header className="revvo-ranking__header">
              <button type="button" className="revvo-ranking__headerBtn" aria-label="Voltar" onClick={() => navigate('/dev/revvo-home')}>
                <OutlineIcon><path d="M15 18 9 12l6-6" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" /></OutlineIcon>
              </button>
              <div className="revvo-ranking__titleBlock">
                <h1>Ranking Revvo</h1>
                <p>Veja sua posicao e suba ganhando RVC</p>
              </div>
              <button type="button" className="revvo-ranking__headerBtn" aria-label="Ajuda">
                <OutlineIcon><path d="M12 17h.01M9.7 9.4A2.4 2.4 0 1 1 12 12v1.2M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z" stroke="currentColor" strokeWidth="2" strokeLinecap="round" /></OutlineIcon>
              </button>
            </header>

            <nav className="revvo-ranking__periods" aria-label="Periodo do ranking">
              {periods.map((period) => (
                <button key={period.id} type="button" className={period.id === rankingData.activePeriod ? 'is-active' : ''}>
                  <Icon>{period.icon}</Icon>
                  {period.label}
                </button>
              ))}
            </nav>

            <article className="revvo-ranking__userCard" aria-label="Sua posicao no ranking">
              <Avatar tone="user" src={rankingData.user.avatar} online />
              <div className="revvo-ranking__position">
                <span>Sua posicao</span>
                <strong>#{rankingData.user.position}</strong>
              </div>
              <div className="revvo-ranking__userLevel">
                <div>
                  <h2>{rankingData.user.level}</h2>
                  <LevelBadge level={rankingData.user.level} />
                </div>
                <span>Nivel {rankingData.user.levelNumber}</span>
                <div className="revvo-ranking__xpTrack" aria-hidden="true"><i style={{ width: percent(rankingData.user.xp, rankingData.user.nextLevelXp) }} /></div>
                <p>{formatNumber(rankingData.user.xp)} / {formatNumber(rankingData.user.nextLevelXp)} XP</p>
              </div>
              <div className="revvo-ranking__userStats">
                <span><RvcCoin /><strong>{formatNumber(rankingData.user.rvcEarned)}</strong> RVC ganhos</span>
                <span><Icon><path d="M13.5.7c-.3.7-1 2.1-1.9 4.1-.9 1.9-1.9 4.2-2.7 6.2-.8-2-1.8-4.3-2.7-6.2C5.3 2.8 4.6 1.4 4.3.7 3.8 2.2 5.1 1 6.5 1c1.2 0 2.2.7 2.7 1.7C9.7 1.7 10.6 1 11.8 1c1.4 0 2.7 1.2 2.8 2.7ZM12 22c-2.8 0-5-2.2-5-5 0-1.5.7-2.9 1.8-3.8.6 2.5 2.2 5.1 3.2 6.8 1-1.7 2.7-4.3 3.2-6.8A5 5 0 0 1 17 17c0 2.8-2.2 5-5 5Z" /></Icon><strong>{rankingData.user.streakDays} dias</strong> Sequencia atual</span>
              </div>
              <p className="revvo-ranking__motivation">
                <Icon><path d="M4 19h16v2H4v-2Zm2-2h3V9H6v8Zm5 0h3V5h-3v12Zm5 0h3v-6h-3v6Z" /></Icon>
                <span>Faltam <strong>{formatNumber(rankingData.user.missingTop10Xp)} XP</strong> para entrar no Top 10</span>
                <Chevron />
              </p>
            </article>

            <section className="revvo-ranking__podium" aria-label="Podio Top 3">
              <img className="revvo-ranking__podiumStage" src={ASSETS.podium} alt="" width="430" height="258" decoding="async" />
              {podiumByPosition.map((creator) => (
                <article key={creator.position} className={`revvo-ranking__podiumItem revvo-ranking__podiumItem--${creator.position}`}>
                  <div className="revvo-ranking__podiumAvatar">
                    <img
                      className="revvo-ranking__podiumPhoto"
                      src={creator.avatar || ASSETS.avatarSlot}
                      alt=""
                      width="96"
                      height="96"
                      decoding="async"
                    />
                    <img className="revvo-ranking__podiumFrame" src={creator.frame} alt="" width="168" height="206" decoding="async" />
                  </div>
                  <h3>{creator.handle}</h3>
                  <p><RvcCoin />{formatNumber(creator.rvcEarned)}</p>
                  <small><img src={ASSETS.streakFire} alt="" width="14" height="14" decoding="async" />{creator.streakDays} dias</small>
                </article>
              ))}
            </section>
          </section>

          <main className="revvo-ranking-body">
            <section className="revvo-ranking__tableCard" aria-label="Lista do ranking">
              <div className="revvo-ranking__tableHead">
                <span>#</span>
                <span>Creator</span>
                <span>Nivel</span>
                <span>XP</span>
                <span>RVC</span>
              </div>
              <div className="revvo-ranking__rows">
                {rankingData.ranking.map((row, index) => {
                  if (row.type === 'separator') {
                    return <div key={`sep-${index}`} className="revvo-ranking__separator">...</div>;
                  }
                  return (
                    <article key={`${row.position}-${row.handle}`} className={`revvo-ranking__row ${row.isCurrentUser ? 'is-current' : ''}`}>
                      <strong className="revvo-ranking__rankNumber">{row.position}</strong>
                      <div className="revvo-ranking__creator">
                        <Avatar tone={row.isCurrentUser ? 'user' : row.avatarTone} src={row.isCurrentUser ? rankingData.user.avatar : undefined} online={row.isCurrentUser} />
                        <div>
                          <h3>{row.handle}</h3>
                          <p>{row.level}</p>
                        </div>
                      </div>
                      <LevelBadge level={row.level} />
                      <b>{formatNumber(row.xp)} XP</b>
                      <span className="revvo-ranking__rvc"><RvcCoin />{formatNumber(row.rvcEarned)}</span>
                    </article>
                  );
                })}
              </div>
            </section>

            <section className="revvo-ranking__cta" aria-label="Subir no ranking">
              <span className="revvo-ranking__rocket">
                <img src={ASSETS.rocket} alt="" width="72" height="88" decoding="async" />
              </span>
              <p>Complete 3 missoes hoje e suba ate <strong>5 posicoes!</strong></p>
              <button type="button" onClick={() => navigate('/dev/revvo-missions')}>
                Ver missoes disponiveis
                <Chevron />
              </button>
            </section>

            <section className="revvo-ranking__rewards" aria-label="Recompensas do ranking semanal">
              <div className="revvo-ranking__sectionHead">
                <h2>Recompensas do ranking semanal</h2>
                <button type="button">Ver todas <Chevron /></button>
              </div>
              <div className="revvo-ranking__rewardGrid">
                {rankingData.rewards.map((reward) => (
                  <article key={reward.tier} className={`revvo-ranking__reward revvo-ranking__reward--${reward.tone}`}>
                    <span>
                      <Icon>
                        {reward.tone === 'gold'
                          ? <path d="M19 5h-2V3H7v2H5c-1.1 0-2 .9-2 2v1c0 2.4 1.7 4.4 4 4.9.7 1.5 2 2.6 4 3V19H7v2h10v-2h-4v-3.1c2-.4 3.3-1.5 4-3 2.3-.5 4-2.5 4-4.9V7c0-1.1-.9-2-2-2Z" />
                          : <path d="M12 2 4 6v6c0 4.8 3.2 8.6 8 10 4.8-1.4 8-5.2 8-10V6l-8-4Zm0 5.2 1.3 2.6 2.9.4-2.1 2 .5 2.9-2.6-1.4-2.6 1.4.5-2.9-2.1-2 2.9-.4L12 7.2Z" />}
                      </Icon>
                    </span>
                    <h3>{reward.tier}</h3>
                    <strong>{reward.bonus}</strong>
                    {reward.perks.map((perk) => <p key={perk}>{perk}</p>)}
                  </article>
                ))}
              </div>
            </section>
          </main>

          <nav className="revvo-ranking-bottom-nav" aria-label="Navegacao principal">
            {nav.map((item) => (
              <button key={item.id} type="button" className={item.active ? 'is-active' : ''} onClick={() => item.path && navigate(item.path)} aria-current={item.active ? 'page' : undefined}>
                <span className="revvo-ranking__navIcon">
                  {item.active ? <Icon>{item.icon}</Icon> : <Icon>{item.icon}</Icon>}
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

export default RevvoRankingPreview;
