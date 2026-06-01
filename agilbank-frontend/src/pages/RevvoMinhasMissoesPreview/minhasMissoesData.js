export const minhasMissoesData = {
  points: 12480,
  summary: [
    { id: 'em-andamento', count: 3, label: 'Em andamento', tone: 'blue', icon: 'clock' },
    { id: 'em-analise', count: 2, label: 'Em análise', tone: 'yellow', icon: 'hourglass' },
    { id: 'aguardando', count: 1, label: 'Aguardando comprovante', tone: 'purple', icon: 'upload' },
    { id: 'concluidas', count: 7, label: 'Concluídas', tone: 'green', icon: 'check' },
    { id: 'recusadas', count: 0, label: 'Recusadas', tone: 'red', icon: 'x' }
  ],
  filters: [
    { id: 'todas', label: 'Todas', count: 13 },
    { id: 'em-andamento', label: 'Em andamento', count: 3 },
    { id: 'em-analise', label: 'Em análise', count: 2 },
    { id: 'concluidas', label: 'Concluídas', count: 7 },
    { id: 'recusadas', label: 'Recusadas', count: 0 }
  ],
  sections: [
    {
      id: 'em-andamento',
      title: 'Em andamento',
      status: 'em-andamento',
      icon: 'play',
      missions: [
        {
          id: 'pix-50',
          category: 'Pix',
          categoryTone: 'pix',
          title: 'Faça um Pix acima de R$ 50',
          description: 'Realize um pagamento via Pix de qualquer valor acima de R$ 50.',
          reward: 1000,
          progress: { type: 'percent', value: 60, label: '60%' },
          time: '2 dias restantes',
          participants: '8,2k participantes',
          button: { label: 'Continuar missão', variant: 'primary', route: '/dev/revvo-mission/1' }
        },
        {
          id: 'convite-3',
          category: 'Convite',
          categoryTone: 'convite',
          title: 'Convide 3 amigos para o Revvo',
          description: 'Convide 3 amigos e complete o cadastro deles no Revvo.',
          reward: 2000,
          progress: { type: 'fraction', current: 2, total: 3, label: '2/3 amigos cadastrados' },
          time: '5 dias restantes',
          participants: '15,6k participantes',
          avatars: [
            { initials: 'AM', tone: 'blue' },
            { initials: 'JP', tone: 'green' }
          ],
          button: { label: 'Chamar amigos', variant: 'outline-purple', route: '/dev/revvo-mission/1' }
        },
        {
          id: 'compra-100',
          category: 'Compra',
          categoryTone: 'compra',
          title: 'Compre e ganhe pontos',
          description: 'Faça uma compra acima de R$ 100 com o cartão Revvo.',
          reward: 2500,
          progress: { type: 'percent', value: 30, label: '30%' },
          time: '3 dias restantes',
          participants: '6,7k participantes',
          button: { label: 'Ver detalhes', variant: 'outline-orange', route: '/dev/revvo-mission/1' }
        }
      ]
    },
    {
      id: 'aguardando',
      title: 'Aguardando comprovante',
      status: 'aguardando',
      icon: 'upload',
      missions: [
        {
          id: 'social-instagram',
          category: 'Social',
          categoryTone: 'social',
          title: 'Siga o Revvo no Instagram',
          description: 'Siga nosso perfil no Instagram e curta a última publicação.',
          reward: 500,
          progress: null,
          time: '1 dia restante',
          participants: '9,1k participantes',
          button: { label: 'Enviar comprovante', variant: 'outline-pink', route: '/dev/revvo-mission' }
        }
      ]
    },
    {
      id: 'em-analise',
      title: 'Em análise',
      status: 'em-analise',
      icon: 'hourglass',
      missions: [
        {
          id: 'tiktok-curtir',
          category: 'Social',
          categoryTone: 'social',
          title: 'Curta o último vídeo da Nike',
          description: 'Curta e comente no perfil oficial da Nike no TikTok.',
          reward: 800,
          progress: { type: 'percent', value: 100, label: 'Enviado' },
          time: 'Aguardando revisão',
          participants: '12,4k participantes',
          button: { label: 'Ver status', variant: 'outline-purple', route: '/dev/revvo-mission' }
        },
        {
          id: 'youtube-assistir',
          category: 'Desafio',
          categoryTone: 'desafio',
          title: 'Assista vídeo completo no YouTube',
          description: 'Assista até o final o vídeo da campanha Revvo Creator.',
          reward: 650,
          progress: { type: 'percent', value: 100, label: 'Enviado' },
          time: 'Aguardando revisão',
          participants: '5,8k participantes',
          button: { label: 'Ver status', variant: 'outline-purple', route: '/dev/revvo-mission' }
        }
      ]
    },
    {
      id: 'concluidas',
      title: 'Concluídas',
      status: 'concluidas',
      icon: 'check',
      missions: [
        {
          id: 'done-1',
          category: 'Pix',
          categoryTone: 'pix',
          title: 'Primeiro Pix do mês',
          description: 'Realize seu primeiro Pix do mês no Revvo.',
          reward: 500,
          progress: { type: 'percent', value: 100, label: '100%' },
          time: 'Concluída há 2 dias',
          participants: '21,3k participantes',
          button: { label: 'Ver detalhes', variant: 'outline-green', route: '/dev/revvo-mission/1' }
        },
        {
          id: 'done-2',
          category: 'Social',
          categoryTone: 'social',
          title: 'Siga @modaurbana',
          description: 'Siga o perfil e curta a última publicação.',
          reward: 350,
          progress: { type: 'percent', value: 100, label: '100%' },
          time: 'Concluída há 4 dias',
          participants: '18,9k participantes',
          button: { label: 'Ver detalhes', variant: 'outline-green', route: '/dev/revvo-mission/1' }
        },
        {
          id: 'done-3',
          category: 'Desafio',
          categoryTone: 'desafio',
          title: 'Complete 5 missões na semana',
          description: 'Finalize cinco missões em sete dias consecutivos.',
          reward: 1200,
          progress: { type: 'percent', value: 100, label: '100%' },
          time: 'Concluída há 1 semana',
          participants: '9,6k participantes',
          button: { label: 'Ver detalhes', variant: 'outline-green', route: '/dev/revvo-mission/1' }
        }
      ]
    }
  ]
};
