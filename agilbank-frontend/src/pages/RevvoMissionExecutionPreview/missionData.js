/** Dados temporários de preview — substituir por API quando existir contrato. */

export const MISSION_EXECUTION_STATUS = {
  NOT_STARTED: 'not_started',
  EXTERNAL_OPENED: 'external_opened',
  PROOF_PENDING: 'proof_pending',
  UNDER_REVIEW: 'under_review',
  APPROVED: 'approved',
  REJECTED: 'rejected'
};

const BASE_STEPS = [
  {
    id: 'open',
    title: 'Abrir publicação oficial',
    description: 'Clique no botão para abrir o post da Adidas',
    status: 'active'
  },
  {
    id: 'like',
    title: 'Curtir o post',
    description: 'Curta a publicação no Instagram',
    status: 'locked'
  },
  {
    id: 'return',
    title: 'Voltar para o Revvo',
    description: 'Retorne para o app após curtir o post',
    status: 'locked'
  },
  {
    id: 'proof',
    title: 'Enviar comprovante',
    description: 'Envie um print comprovando que curtiu',
    status: 'locked'
  },
  {
    id: 'validation',
    title: 'Aguardar validação',
    description: 'Nossa equipe vai validar sua missão',
    status: 'locked'
  }
];

export const MISSION_EXECUTION_CATALOG = {
  'adidas-like': {
    id: 'mission_adidas_like_001',
    platform: 'Instagram',
    actionType: 'Curtir',
    brandName: 'Adidas',
    brandMark: 'adidas',
    title: 'Curtir post da Adidas',
    description: 'Mostre apoio à marca no Instagram 👏',
    rarity: 'ÉPICA',
    rewardRvc: 30,
    rewardXp: 15,
    bonusPercent: 25,
    bonusTimeLeft: '09:42',
    slotsUsed: 215,
    slotsTotal: 300,
    estimatedTime: '1 min',
    validationType: 'Automática',
    missionUrl: 'https://instagram.com/',
    steps: BASE_STEPS
  },
  'instagram-follow': {
    id: 'mission_instagram_follow_001',
    platform: 'Instagram',
    actionType: 'Seguir',
    brandName: 'Revvo',
    brandMark: 'instagram',
    title: 'Seguir perfil oficial',
    description: 'Siga o perfil oficial da marca no Instagram.',
    rarity: 'RARA',
    rewardRvc: 25,
    rewardXp: 10,
    bonusPercent: 0,
    bonusTimeLeft: null,
    slotsUsed: 342,
    slotsTotal: 500,
    estimatedTime: '1 min',
    validationType: 'Automática',
    missionUrl: 'https://instagram.com/',
    steps: BASE_STEPS.map((s, i) => ({
      ...s,
      description: s.description.replace('Adidas', 'marca'),
      status: i === 0 ? 'active' : 'locked'
    }))
  }
};

export const DEFAULT_MISSION_ID = 'adidas-like';

export function getMissionExecutionData(missionId) {
  return MISSION_EXECUTION_CATALOG[missionId] ?? MISSION_EXECUTION_CATALOG[DEFAULT_MISSION_ID];
}
