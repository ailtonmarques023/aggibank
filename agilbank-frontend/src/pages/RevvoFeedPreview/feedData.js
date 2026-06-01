/** Mock centralizado — Feed Revvo v2 (referência maio/2026). */

const FEED_ASSETS = '/banco/assets/revvo-feed';
const HOME_ASSETS = '/banco/assets/revvo-home-v2';
const RANKING_ASSETS = '/banco/assets/revvo-ranking';

export const feedData = {
  notificationCount: 3,
  searchPlaceholder: 'Buscar no feed...',

  userStats: {
    balance: { label: 'Saldo', value: '3.210 RVC', icon: 'coin' },
    level: { label: 'Nível', value: 'Criador Ativo', progress: 62, icon: 'star' },
    streak: { label: 'Sequência', value: '7 dias', icon: 'fire', fireImage: `${RANKING_ASSETS}/revvo-ranking-fire.png` },
    progress: {
      label: 'Progresso',
      percent: 80,
      hint: 'Rumo ao próximo nível',
      badgeImage: `${HOME_ASSETS}/revvo-home-v2-badge-3d.png`
    }
  },

  stories: [
    { id: 'new-mission', label: 'Nova missão', image: `${FEED_ASSETS}/revvo-feed-campaign-phone.png`, ring: '#0066ff', badge: '+' },
    { id: 'top10', label: 'Top 10', image: `${FEED_ASSETS}/revvo-story-top10.png`, ring: '#ffb020' },
    { id: 'badge', label: 'Badge', image: `${FEED_ASSETS}/revvo-story-badge.png`, ring: '#7b2cff' },
    { id: 'bonus', label: 'Bônus', image: `${FEED_ASSETS}/revvo-story-bonus.png`, ring: '#ff8a00' },
    { id: 'ranking', label: 'Ranking', image: `${FEED_ASSETS}/revvo-feed-trophy-top10.png`, ring: '#16b85f' }
  ],

  filters: [
    { id: 'all', label: 'Todos', icon: 'grid' },
    { id: 'missions', label: 'Missões', icon: 'target' },
    { id: 'achievements', label: 'Conquistas', icon: 'trophy' },
    { id: 'ranking', label: 'Ranking', icon: 'chart' },
    { id: 'campaigns', label: 'Campanhas', icon: 'megaphone' }
  ],

  posts: [
    {
      id: 'post_1',
      type: 'mission_completed',
      userName: 'Camila Santos',
      textBefore: 'concluiu uma missão da ',
      textHighlight: 'Adidas',
      avatar: `${FEED_ASSETS}/revvo-feed-avatar-camila.png`,
      avatarBadge: 'star',
      reward: '+25 RVC',
      time: '2h atrás',
      badgeImage: `${FEED_ASSETS}/revvo-brand-adidas-avatar.png`,
      brandLogo: `${FEED_ASSETS}/revvo-brand-adidas-avatar.png`,
      ctaLabel: 'Ver missão',
      missionId: 'adidas-like',
      likes: 128,
      comments: 24,
      shares: 12,
      badgeCheck: true
    },
    {
      id: 'post_2',
      type: 'ranking',
      userName: 'Pedro Henrique',
      textBefore: 'entrou no ',
      textHighlight: 'Top 10',
      textAfter: ' semanal',
      avatar: `${FEED_ASSETS}/revvo-feed-avatar-camila.png`,
      avatarBadge: 'crown',
      reward: '+50 RVC',
      time: '3h atrás',
      badgeImage: `${FEED_ASSETS}/revvo-feed-trophy-top10.png`,
      ctaLabel: 'Ver ranking',
      rankingPath: '/dev/revvo-ranking',
      likes: 31,
      comments: 7,
      shares: 3
    },
    {
      id: 'post_3',
      type: 'achievement',
      userName: 'Ana Beatriz',
      textBefore: 'desbloqueou o badge ',
      textHighlight: 'Creator Ativo',
      avatar: `${FEED_ASSETS}/revvo-feed-avatar-camila.png`,
      avatarBadge: 'check',
      reward: '+15 RVC',
      time: '5h atrás',
      badgeImage: `${FEED_ASSETS}/revvo-feed-achievement-creator-ativo.png`,
      ctaLabel: 'Ver conquista',
      likes: 18,
      comments: 4,
      shares: 1
    },
    {
      id: 'post_4',
      type: 'system_campaign',
      userName: 'Revvo',
      textBefore: 'Nova campanha disponível!',
      reward: '+25%',
      time: '6h atrás',
      badgeImage: `${HOME_ASSETS}/revvo-home-v2-megaphone-3d.png`,
      ctaLabel: 'Ver campanha',
      missionId: 'tiktok-comment',
      likes: 42,
      comments: 9,
      shares: 6
    }
  ],

  weeklyRanking: {
    title: 'Ranking semanal',
    countdown: 'Atualiza em 2d 6h',
    top: [
      { id: 'lucas', name: 'Lucas M.', rvc: '4.820 RVC', position: 1, avatar: `${FEED_ASSETS}/revvo-feed-avatar-camila.png`, frame: `${RANKING_ASSETS}/ranking-frame-1-gold.png` },
      { id: 'camila', name: 'Camila S.', rvc: '4.510 RVC', position: 2, avatar: `${FEED_ASSETS}/revvo-feed-avatar-camila.png`, frame: `${RANKING_ASSETS}/ranking-frame-2-silver.png` },
      { id: 'pedro', name: 'Pedro H.', rvc: '4.200 RVC', position: 3, avatar: `${FEED_ASSETS}/revvo-feed-avatar-camila.png`, frame: `${RANKING_ASSETS}/ranking-frame-3-bronze.png` }
    ],
    you: { position: 10, label: 'Você', rvc: '3.210 RVC', avatar: `${FEED_ASSETS}/revvo-feed-avatar-camila.png` },
    linkLabel: 'Ver ranking completo'
  },

  spotlightCampaigns: [
    {
      id: 'adidas-summer',
      title: 'Adidas – Coleção Verão',
      descriptionBefore: 'Conclua missões e ganhe até',
      descriptionHighlight: '+25% RVC',
      descriptionAfter: 'de bônus',
      bonusTag: 'BÔNUS ATIVO',
      timer: 'Termina em 3 dias',
      timerTone: 'green',
      missionId: 'adidas-like',
      brandLogo: `${FEED_ASSETS}/revvo-brand-adidas-avatar.png`,
      heroImage: `${HOME_ASSETS}/revvo-home-v2-campaign-source.png`,
      tone: 'purple',
      variant: 'gradient'
    },
    {
      id: 'nike-air',
      title: 'Nike Air – New',
      descriptionBefore: 'Missões com bônus de até',
      descriptionHighlight: '+20%',
      descriptionAfter: 'de bônus',
      bonusTag: 'BÔNUS ATIVO',
      timer: 'Termina em 5 dias',
      timerTone: 'urgent',
      missionId: 'tiktok-comment',
      brandLogo: `${FEED_ASSETS}/revvo-brand-nike-avatar.png`,
      heroImage: `${HOME_ASSETS}/revvo-home-v2-campaign-source.png`,
      tone: 'orange',
      variant: 'light'
    }
  ]
};
