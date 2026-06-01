export const exploreData = {
  searchPlaceholder: 'Buscar por marca, Instagram, TikTok...',
  banner: {
    badge: 'Missões em alta hoje',
    titleBefore: 'Ganhe até',
    titleHighlight: '850 RVC',
    titleAfter: 'hoje',
    subtitle: 'Complete missões rápidas e suba no ranking.',
    cta: 'Ver missões em alta',
    art: {
      hero: '/banco/assets/revvo-missions/revvo-missions-banner-hero-3d.png',
      fire: '/banco/assets/revvo-ranking/revvo-ranking-fire.png'
    }
  },
  filters: [
    { id: 'all', label: 'Todas' },
    { id: 'instagram', label: 'Instagram', platform: 'instagram' },
    { id: 'tiktok', label: 'TikTok', platform: 'tiktok' },
    { id: 'youtube', label: 'YouTube', platform: 'youtube' },
    { id: 'like', label: 'Curtir', icon: 'heart' },
    { id: 'follow', label: 'Seguir', icon: 'follow' },
    { id: 'comment', label: 'Comentar', icon: 'comment' },
    { id: 'fast', label: 'Rápidas', icon: 'bolt' }
  ],
  quickAccess: [
    { id: 'fast', label: 'Missões rápidas', tone: 'purple', icon: 'bolt' },
    { id: 'rewards', label: 'Melhores recompensas', tone: 'blue', icon: 'gift' },
    { id: 'ending', label: 'Quase encerrando', tone: 'orange', icon: 'timer' },
    { id: 'brands', label: 'Novas marcas', tone: 'cyan', icon: 'star' }
  ],
  missions: [
    {
      id: 'moda-urbana-follow',
      brand: 'MODA URBANA',
      brandTone: 'red',
      title: 'Siga @modaurbana',
      platform: 'Instagram',
      action: 'Seguir perfil',
      seats: '42 vagas restantes',
      time: '2 min',
      rvc: '+120 RVC',
      xp: '+35 XP'
    },
    {
      id: 'youtube-watch',
      brand: 'YouTube',
      brandTone: 'youtube',
      title: 'Assista por 30s',
      platform: 'YouTube',
      action: 'Assistir vídeo',
      seats: '18 vagas restantes',
      time: '1 min',
      rvc: '+80 RVC',
      xp: '+20 XP'
    },
    {
      id: 'tiktok-like',
      brand: 'TikTok',
      brandTone: 'tiktok',
      title: 'Curta a publicação',
      platform: 'TikTok',
      action: 'Curtir post',
      seats: '65 vagas restantes',
      time: '1 min',
      rvc: '+45 RVC',
      xp: '+12 XP'
    }
  ],
  recommended: {
    title: 'Recomendado para você',
    subtitle: 'Missões com mais chance de aprovação para o seu nível.',
    items: [
      {
        id: 'fit-zone',
        brand: 'FIT ZONE',
        brandTone: 'purple',
        title: 'Comente no post',
        platform: 'Instagram',
        action: 'Comentar',
        rvc: '+95 RVC',
        xp: '+28 XP'
      },
      {
        id: 'eco-life',
        brand: 'eco life',
        brandTone: 'green',
        title: 'Seguir perfil',
        platform: 'TikTok',
        action: 'Seguir',
        rvc: '+70 RVC',
        xp: '+18 XP'
      }
    ]
  }
};
