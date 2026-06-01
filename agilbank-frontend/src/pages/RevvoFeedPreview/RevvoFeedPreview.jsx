import React, { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useRevvoCanvasScale } from '../../hooks/useRevvoCanvasScale';
import { feedData } from './feedData';
import './RevvoFeedPreview.css';

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

const FilterIcon = ({ type }) => {
  const paths = {
    grid: <path d="M4 8h4V4H4v4Zm6 12h4v-4h-4v4Zm-6 0h4v-4H4v4Zm0-6h4v-4H4v4Zm6 0h4v-4h-4v4Zm6-10v4h4V4h-4Zm0 6h4v-4h-4v4Zm0 6h4v-4h-4v4Zm0 6h4v-4h-4v4Z" />,
    trophy: <path d="M19 5h-2V3H7v2H5c-1.1 0-2 .9-2 2v1c0 2.4 1.7 4.4 4 4.9.7 1.5 2 2.6 4 3V19H7v2h10v-2h-4v-3.1c2-.4 3.3-1.5 4-3 2.3-.5 4-2.5 4-4.9V7c0-1.1-.9-2-2-2Z" />,
    target: <path d="M12 2a10 10 0 1 0 10 10A10 10 0 0 0 12 2Zm0 2a8 8 0 1 1-8 8 8 8 0 0 1 8-8Zm0 2.5A5.5 5.5 0 1 0 17.5 12 5.51 5.51 0 0 0 12 6.5Zm0 2A3.5 3.5 0 1 1 8.5 12 3.5 3.5 0 0 1 12 8.5Z" />,
    chart: <path d="M4 20h16v-2H4v2Zm2-4h3V9H6v7Zm5 0h3V5h-3v11Zm5 0h3V12h-3v4Z" />,
    megaphone: <path d="M18 11V8l4-4v11l-4-4v-3c-1.1 0-2 .9-2 2v1.5c0 2.2-1.8 4-4 4H9v2h3c2.8 0 5.2-1.7 6.2-4.2.5.3 1 .5 1.5.5 1.1 0 2-.9 2-2Zm-8 7H5c-1.1 0-2-.9-2-2v-2h5v4Z" />
  };
  return <Icon className="revvo-feed__filterIcon">{paths[type] || paths.grid}</Icon>;
};

const UserStatsCard = ({ stats }) => (
  <article className="revvo-feed__statsCard" aria-label="Seu resumo no Revvo">
    <div className="revvo-feed__stat">
      <span className="revvo-feed__statIcon revvo-feed__statIcon--coin">R</span>
      <small>{stats.balance.label}</small>
      <strong>{stats.balance.value}</strong>
    </div>
    <div className="revvo-feed__stat revvo-feed__stat--level">
      <span className="revvo-feed__statIcon revvo-feed__statIcon--star">
        <Icon><path d="M12 2l2.2 4.5 4.9.7-3.5 3.4.8 4.9L12 13.8 7.6 15.5l.8-4.9L5 7.2l4.9-.7L12 2Z" /></Icon>
      </span>
      <small>{stats.level.label}</small>
      <strong>{stats.level.value}</strong>
      <div className="revvo-feed__levelBar" aria-hidden="true">
        <span style={{ width: `${stats.level.progress}%` }} />
      </div>
    </div>
    <div className="revvo-feed__stat">
      <img src={stats.streak.fireImage} alt="" className="revvo-feed__statFire" decoding="async" />
      <small>{stats.streak.label}</small>
      <strong>{stats.streak.value}</strong>
    </div>
    <div className="revvo-feed__stat revvo-feed__stat--progress">
      <div className="revvo-feed__statRing" style={{ '--progress': stats.progress.percent }}>
        <svg viewBox="0 0 36 36" aria-hidden="true">
          <circle className="revvo-feed__ringTrack" cx="18" cy="18" r="14" />
          <circle className="revvo-feed__ringFill" cx="18" cy="18" r="14" />
        </svg>
        <span>{stats.progress.percent}%</span>
      </div>
      <small>{stats.progress.label}</small>
      <span className="revvo-feed__statHint">{stats.progress.hint}</span>
    </div>
  </article>
);

const WeeklyRankingPodium = ({ ranking, onOpen }) => (
  <section className="revvo-feed__rankingBlock" aria-label={ranking.title}>
    <div className="revvo-feed__rankingHead">
      <h2>{ranking.title}</h2>
      <span className="revvo-feed__rankingTimer">{ranking.countdown}</span>
    </div>
    <div className="revvo-feed__rankPodium">
      {ranking.top.map((item) => (
        <div key={item.id} className={`revvo-feed__podiumItem revvo-feed__podiumItem--${item.position}`}>
          <div className="revvo-feed__podiumAvatar">
            <img src={item.frame} alt="" className="revvo-feed__podiumFrame" decoding="async" />
            <img src={item.avatar} alt="" className="revvo-feed__podiumPhoto" decoding="async" />
            <span className="revvo-feed__podiumPos">{item.position}</span>
          </div>
          <strong>{item.name}</strong>
          <span className="revvo-feed__rankRvc">{item.rvc}</span>
        </div>
      ))}
      <div className="revvo-feed__podiumItem revvo-feed__podiumItem--you">
        <div className="revvo-feed__podiumAvatar revvo-feed__podiumAvatar--you">
          <img src={ranking.you.avatar} alt="" className="revvo-feed__podiumPhoto" decoding="async" />
          <span className="revvo-feed__podiumPos">{ranking.you.position}</span>
        </div>
        <strong>{ranking.you.label}</strong>
        <span className="revvo-feed__rankRvc">{ranking.you.rvc}</span>
      </div>
    </div>
    <button type="button" className="revvo-feed__rankLink" onClick={onOpen}>
      {ranking.linkLabel} <span aria-hidden="true">›</span>
    </button>
  </section>
);

const FeedPostCard = ({ post, onCta }) => (
  <article className={`revvo-feed__post revvo-feed__post--${post.type}`}>
    <div className="revvo-feed__postGrid">
      <div className="revvo-feed__avatarWrap">
        {post.avatar ? (
          <img className="revvo-feed__avatar" src={post.avatar} alt="" width="38" height="38" decoding="async" />
        ) : (
          <span className="revvo-feed__avatar revvo-feed__avatar--system" aria-hidden="true">R</span>
        )}
        {post.avatarBadge ? (
          <span className={`revvo-feed__avatarBadge revvo-feed__avatarBadge--${post.avatarBadge}`} aria-hidden="true" />
        ) : null}
      </div>

      <div className="revvo-feed__postMain">
        <p className="revvo-feed__postLine">
          <strong>{post.userName}</strong> {post.textBefore}
          {post.textHighlight ? <strong className="revvo-feed__postHighlight">{post.textHighlight}</strong> : null}
          {post.textAfter}
        </p>
        <time>{post.time}</time>
        <div className="revvo-feed__postRewardRow">
          <span className="revvo-feed__rvcMark">R</span>
          <strong>{post.reward}</strong>
        </div>
      </div>

      <div className="revvo-feed__postAside">
        <button type="button" className="revvo-feed__postMenu" aria-label="Mais opções">
          <span /><span /><span />
        </button>
        <div className={`revvo-feed__postBadge ${post.type === 'mission_completed' ? 'revvo-feed__postBadge--mission' : ''}`}>
          {post.type === 'mission_completed' ? (
            <>
              <span className="revvo-feed__badgeAura" aria-hidden="true" />
              <span className="revvo-feed__badgeShield">
                <img className="revvo-feed__badgeBrand" src={post.brandLogo || post.badgeImage} alt="" decoding="async" />
              </span>
            </>
          ) : (
            <img src={post.badgeImage} alt="" decoding="async" />
          )}
          {post.badgeCheck ? (
            <img
              className="revvo-feed__badgeCheck"
              src="/banco/assets/revvo-feed/revvo-feed-check-approved.png"
              alt=""
              decoding="async"
            />
          ) : null}
        </div>
      </div>

      <div className="revvo-feed__postFoot">
        <div className="revvo-feed__postActions">
          <button type="button" className="revvo-feed__actionBtn revvo-feed__actionBtn--like" aria-label="Curtir">
            <Icon>
              <path d="M12 21.35 10.55 20.03C5.4 15.36 2 12.28 2 8.5A5.45 5.45 0 0 1 7.5 3C9.24 3 10.91 3.81 12 5.08A6.02 6.02 0 0 1 16.5 3 5.45 5.45 0 0 1 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35Z" />
            </Icon>
            <span>{post.likes}</span>
          </button>
          <button type="button" className="revvo-feed__actionBtn" aria-label="Comentar">
            <OutlineIcon>
              <path d="M20 2H4a2 2 0 0 0-2 2v18l4-4h14a2 2 0 0 0 2-2V4a2 2 0 0 0-2-2Zm-2 12H6v-2h12v2Z" stroke="currentColor" strokeWidth="1.5" />
            </OutlineIcon>
            <span>{post.comments}</span>
          </button>
          <button type="button" className="revvo-feed__actionBtn" aria-label="Compartilhar">
            <OutlineIcon>
              <path d="M18 16.08c-.76 1.64-2.55 2.7-4.18 2.7-2.2 0-4-1.79-4-4 0-.55.11-1.08.32-1.57L3 9.5V7l4.5 1.2C8.4 7.45 9.67 7 11 7c2.76 0 5 2.24 5 5 0 .69-.14 1.35-.4 1.96L21 16l-3-3.92Z" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round" />
            </OutlineIcon>
            <span>{post.shares}</span>
          </button>
        </div>
        {post.ctaLabel ? (
          <button type="button" className="revvo-feed__postCta" onClick={() => onCta(post)}>
            {post.ctaLabel}
          </button>
        ) : null}
      </div>
    </div>
  </article>
);

const RevvoFeedPreview = () => {
  const navigate = useNavigate();
  const { scaleRef, innerRef } = useRevvoCanvasScale();
  const [activeFilter, setActiveFilter] = useState('all');

  const nav = useMemo(
    () => [
      { id: 'home', label: 'Início', active: true, path: '/dev/revvo-feed', icon: <path d="M10 20v-6h4v6h5v-8h3L12 3 2 12h3v8h5Z" /> },
      { id: 'missions', label: 'Missões', path: '/dev/revvo-missions', icon: <path d="M12 2a10 10 0 1 0 10 10A10 10 0 0 0 12 2Zm0 2a8 8 0 1 1-8 8 8 8 0 0 1 8-8Zm0 2.5A5.5 5.5 0 1 0 17.5 12 5.51 5.51 0 0 0 12 6.5Zm0 2A3.5 3.5 0 1 1 8.5 12 3.5 3.5 0 0 1 12 8.5Z" /> },
      { id: 'create', label: 'Criar', fab: true, path: '/dev/revvo-criar-missao' },
      { id: 'wallet', label: 'Carteira', path: '/dev/revvo-carteira', icon: <path d="M20 4H4a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2V6a2 2 0 0 0-2-2Zm0 14H4V8h16v10Zm-2-6h-2a2 2 0 1 0 0 4h2v-4Z" /> },
      { id: 'profile', label: 'Perfil', path: '/dev/revvo-profile', icon: <path d="M12 12c2.21 0 4-1.79 4-4s-1.79-4-4-4-4 1.79-4 4 1.79 4 4 4Zm0 2c-2.67 0-8 1.34-8 4v2h16v-2c0-2.66-5.33-4-8-4Z" /> }
    ],
    []
  );

  const handlePostCta = (post) => {
    if (post.rankingPath) navigate(post.rankingPath);
    else if (post.missionId) navigate(`/dev/revvo-mission/${post.missionId}`);
    else navigate('/dev/revvo-missions');
  };

  const goMission = (id) => navigate(id ? `/dev/revvo-mission/${id}` : '/dev/revvo-missions');

  return (
    <div className="revvo-feed-app revvo-canvas-app">
      <div className="revvo-feed__scale revvo-canvas-scale" ref={scaleRef}>
        <div className="revvo-feed revvo-canvas-surface" ref={innerRef}>
          <section className="revvo-feed-top" aria-label="Topo Feed Revvo">
            <header className="revvo-feed__header">
              <button type="button" className="revvo-feed__iconBtn" aria-label="Menu">
                <span className="revvo-feed__menu" aria-hidden="true">
                  <i /><i /><i />
                </span>
              </button>
              <div className="revvo-feed__titleBlock">
                <h1>
                  Feed <span>Revvo</span>
                </h1>
                <p>Veja o que a comunidade está conquistando</p>
              </div>
              <button type="button" className="revvo-feed__bell" aria-label="Notificações">
                <Icon>
                  <path d="M12 22a2.5 2.5 0 0 0 2.45-2h-4.9A2.5 2.5 0 0 0 12 22Zm7-6V11a7 7 0 0 0-5-6.71V4a2 2 0 1 0-4 0v.29A7 7 0 0 0 5 11v5l-2 2v1h18v-1l-2-2Z" />
                </Icon>
                <span>{feedData.notificationCount}</span>
              </button>
            </header>

            <UserStatsCard stats={feedData.userStats} />
          </section>

          <main className="revvo-feed-body">
            <div className="revvo-feed__searchRow">
              <label className="revvo-feed__search">
                <OutlineIcon className="revvo-feed__searchIcon">
                  <path d="m21 21-4.35-4.35M10.5 18a7.5 7.5 0 1 1 0-15 7.5 7.5 0 0 1 0 15Z" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
                </OutlineIcon>
                <input type="search" placeholder={feedData.searchPlaceholder} aria-label="Buscar no feed" />
              </label>
              <button type="button" className="revvo-feed__filterBtn" aria-label="Filtros">
                <OutlineIcon className="revvo-feed__iconSvg">
                  <path d="M4 7h10M18 7h2M4 17h3M11 17h9M8 5v4M15 15v4" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
                </OutlineIcon>
              </button>
            </div>

            <div className="revvo-feed__stories" aria-label="Atalhos rápidos">
              {feedData.stories.map((story) => (
                <button key={story.id} type="button" className="revvo-feed__story" style={{ '--story-ring': story.ring }}>
                  <span className="revvo-feed__storyRing">
                    <img src={story.image} alt="" decoding="async" />
                    {story.badge ? <em className="revvo-feed__storyBadge">{story.badge}</em> : null}
                  </span>
                  <small>{story.label}</small>
                </button>
              ))}
            </div>

            <nav className="revvo-feed__chips" aria-label="Filtros do feed">
              {feedData.filters.map((filter) => (
                <button
                  key={filter.id}
                  type="button"
                  className={`revvo-feed__chip revvo-feed__chip--${filter.id} ${activeFilter === filter.id ? 'revvo-feed__chip--active' : ''}`}
                  onClick={() => setActiveFilter(filter.id)}
                >
                  <FilterIcon type={filter.icon} />
                  <span>{filter.label}</span>
                </button>
              ))}
            </nav>

            <section className="revvo-feed__feedList" aria-label="Atividades da comunidade">
              {feedData.posts.map((post) => (
                <FeedPostCard key={post.id} post={post} onCta={handlePostCta} />
              ))}
            </section>

            <WeeklyRankingPodium ranking={feedData.weeklyRanking} onOpen={() => navigate('/dev/revvo-ranking')} />

            <section className="revvo-feed__spotlight" aria-labelledby="revvo-feed-spotlight-title">
              <div className="revvo-feed__spotlightHead">
                <h2 id="revvo-feed-spotlight-title">🔥 Campanhas em destaque</h2>
                <button type="button" className="revvo-feed__linkBtn" onClick={() => navigate('/dev/revvo-missions')}>
                  Ver todas <span aria-hidden="true">›</span>
                </button>
              </div>
              <div className="revvo-feed__spotlightScroll">
                {feedData.spotlightCampaigns.map((campaign) => (
                  <article
                    key={campaign.id}
                    className={`revvo-feed__spotCard revvo-feed__spotCard--${campaign.tone} ${campaign.variant === 'gradient' ? 'revvo-feed__spotCard--gradient' : ''}`}
                  >
                    <div className="revvo-feed__spotInner">
                      <div className="revvo-feed__spotCopy">
                        <span className="revvo-feed__spotBonus">{campaign.bonusTag}</span>
                        <div className="revvo-feed__spotBrand">
                          <img src={campaign.brandLogo} alt="" decoding="async" />
                          <h3>{campaign.title}</h3>
                        </div>
                        <p className="revvo-feed__spotDesc">
                          {campaign.descriptionBefore}{' '}
                          <strong>{campaign.descriptionHighlight}</strong> {campaign.descriptionAfter}
                        </p>
                        <div className="revvo-feed__spotFoot">
                          <span className={`revvo-feed__spotTimer revvo-feed__spotTimer--${campaign.timerTone}`}>
                            <OutlineIcon className="revvo-feed__iconSvg">
                              <circle cx="12" cy="12" r="9" stroke="currentColor" strokeWidth="1.8" />
                              <path d="M12 7v5l3 2" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
                            </OutlineIcon>
                            {campaign.timer}
                          </span>
                          <button type="button" className="revvo-feed__spotCta" onClick={() => goMission(campaign.missionId)}>
                            Fazer missão
                          </button>
                        </div>
                      </div>
                      <div className="revvo-feed__spotArt" aria-hidden="true">
                        <img src={campaign.heroImage} alt="" decoding="async" />
                      </div>
                    </div>
                  </article>
                ))}
              </div>
            </section>
          </main>

          <nav className="revvo-feed-bottom-nav" aria-label="Navegação principal">
            {nav.map(({ id, label, active, icon, path, fab }) =>
              fab ? (
                <button key={id} type="button" className="revvo-feed__navFab" aria-label={label} onClick={() => path && navigate(path)}>
                  <Icon>
                    <path d="M19 13h-6v6h-2v-6H5v-2h6V5h2v6h6v2Z" />
                  </Icon>
                </button>
              ) : (
                <button
                  key={id}
                  type="button"
                  className={active ? 'is-active' : ''}
                  onClick={() => path && navigate(path)}
                  aria-current={active ? 'page' : undefined}
                >
                  <Icon>{icon}</Icon>
                  <small>{label}</small>
                </button>
              )
            )}
          </nav>
        </div>
      </div>
    </div>
  );
};

export default RevvoFeedPreview;
