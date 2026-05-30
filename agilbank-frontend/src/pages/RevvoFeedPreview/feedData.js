/** Mock centralizado — Feed Revvo (preview). Integrar com API quando existir. */

const FEED_ASSETS = '/banco/assets/revvo-feed';
const HOME_ASSETS = '/banco/assets/revvo-home-v2';
const RANKING_ASSETS = '/banco/assets/revvo-ranking';

export const feedData = {
  notificationCount: 3,
  searchPlaceholder: 'Buscar no feed...',

  filters: [
    { id: 'all', label: 'Todos', icon: 'grid' },
    { id: 'achievements', label: 'Conquistas', icon: 'trophy' },
    { id: 'missions', label: 'Missões', icon: 'target' },
    { id: 'ranking', label: 'Ranking', icon: 'chart' },
    { id: 'campaigns', label: 'Campanhas', icon: 'megaphone' }
  ],

  sidebar: {
    streak: {
      title: 'Sua sequência',
      days: 7,
      label: '7 dias seguidos!',
      weekDays: ['S', 'T', 'Q', 'Q', 'S', 'S', 'D'],
      checked: [true, true, true, true, true, true, false],
      fireImage: `${RANKING_ASSETS}/revvo-ranking-fire.png`
    },
    progress: {
      title: 'Seu progresso',
      percent: 80,
      hint: 'Rumo ao próximo nível',
      badgeImage: `${HOME_ASSETS}/revvo-home-v2-badge-3d.png`
    },
    weeklyRanking: {
      title: 'Ranking semanal',
      top: [
        { id: 'lucas', name: 'Lucas M.', rvc: '4.820 RVC', avatar: `${FEED_ASSETS}/revvo-feed-avatar-camila.png` },
        { id: 'camila', name: 'Camila S.', rvc: '4.510 RVC', avatar: `${FEED_ASSETS}/revvo-feed-avatar-camila.png` },
        { id: 'pedro', name: 'Pedro H.', rvc: '4.200 RVC', avatar: `${FEED_ASSETS}/revvo-feed-avatar-camila.png` }
      ],
      you: { position: 10, label: 'Você', rvc: '3.210 RVC' },
      linkLabel: 'Ver ranking completo'
    }
  },

  spotlightCampaigns: [
    {
      id: 'adidas-summer',
      brand: 'Adidas',
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
      brand: 'Nike',
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
      rewardTone: 'purple',
      time: '2h atrás',
      badgeImage: `${FEED_ASSETS}/revvo-brand-adidas-avatar.png`,
      likes: 24,
      comments: 5,
      shares: 2
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
      rewardSub: 'TOP 10',
      rewardTone: 'gold',
      time: '3h atrás',
      badgeImage: `${FEED_ASSETS}/revvo-feed-trophy-top10.png`,
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
      rewardTone: 'blue',
      time: '5h atrás',
      badgeImage: `${FEED_ASSETS}/revvo-feed-achievement-creator-ativo.png`,
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
      rewardTone: 'orange',
      time: '6h atrás',
      badgeImage: `${HOME_ASSETS}/revvo-home-v2-megaphone-3d.png`,
      likes: 42,
      comments: 9,
      shares: 6
    },
    {
      id: 'post_5',
      type: 'pix_withdrawal',
      userName: 'João Victor',
      textBefore: 'sacou ',
      textHighlight: 'R$ 120,00',
      textAfter: ' via PIX',
      avatar: `${FEED_ASSETS}/revvo-feed-avatar-camila.png`,
      avatarBadge: 'check',
      reward: '+120 RVC',
      rewardTone: 'green',
      time: '8h atrás',
      badgeImage: `${FEED_ASSETS}/revvo-feed-pix-wallet.png`,
      likes: 15,
      comments: 2,
      shares: 1
    }
  ]
};

/** TODO: avatares distintos por usuário quando assets dedicados existirem. */
