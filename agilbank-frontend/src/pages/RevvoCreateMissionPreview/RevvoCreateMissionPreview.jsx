import React, { useMemo, useState } from 'react';
import { useRevvoCanvasScale } from '../../hooks/useRevvoCanvasScale';
import './RevvoCreateMissionPreview.css';

const ASSETS = {
  avatar: '/banco/assets/revvo-home-v2/revvo-home-v2-avatar-camila.png'
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
  <div className="revvo-create__logo" aria-label="Revvo">
    <span className="revvo-create__logoMark">R</span>
    <span className="revvo-create__logoText">Revvo</span>
  </div>
);

const MISSION_TYPES = [
  { id: 'like', label: 'Curtir', icon: <path d="M12 21.35 10.55 20.03C5.4 15.36 2 12.28 2 8.5A5.45 5.45 0 0 1 7.5 3C9.24 3 10.91 3.81 12 5.08A6.02 6.02 0 0 1 16.5 3 5.45 5.45 0 0 1 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35Z" /> },
  { id: 'follow', label: 'Seguir', icon: <path d="M15 12c2.21 0 4-1.79 4-4s-1.79-4-4-4-4 1.79-4 4 1.79 4 4 4Zm-8 0c1.66 0 3-1.34 3-3S8.66 6 7 6 4 7.34 4 9s1.34 3 3 3Zm0 2c-2.67 0-8 1.34-8 4v2h16v-2c0-2.66-5.33-4-8-4Z" /> },
  { id: 'comment', label: 'Comentar', icon: <path d="M20 2H4a2 2 0 0 0-2 2v18l4-4h14a2 2 0 0 0 2-2V4a2 2 0 0 0-2-2Zm-2 12H6v-2h12v2Zm0-3H6V9h12v2Zm0-3H6V6h12v2Z" /> },
  { id: 'watch', label: 'Assistir', icon: <path d="M8 5v14l11-7L8 5Z" /> },
  { id: 'share', label: 'Compartilhar', icon: <path d="M18 16.08c-.76 0-1.44.3-1.96.77L8.91 12.7c.05-.23.09-.46.09-.7s-.04-.47-.09-.7l7.05-4.11c.54.5 1.25.81 2.04.81 1.66 0 3-1.34 3-3s-1.34-3-3-3-3 1.34-3 3c0 .24.04.47.09.7L8.04 9.81C7.5 9.31 6.79 9 6 9c-1.66 0-3 1.34-3 3s1.34 3 3 3c.79 0 1.5-.31 2.04-.81l7.12 4.16c-.05.21-.08.43-.08.65 0 1.66 1.34 3 3 3s3-1.34 3-3-1.34-3-3-3Z" /> }
];

const REWARD_TYPES = [
  { id: 'rvc', label: 'RVC', icon: 'R' },
  { id: 'xp', label: 'XP', icon: 'XP' },
  { id: 'badge', label: 'Badge', icon: '★' }
];

const STEPS = [
  { id: 1, label: 'Dados' },
  { id: 2, label: 'Ação' },
  { id: 3, label: 'Recompensa' },
  { id: 4, label: 'Revisão' }
];

const RevvoCreateMissionPreview = () => {
  const { scaleRef, innerRef } = useRevvoCanvasScale();
  const [missionName, setMissionName] = useState('');
  const [description, setDescription] = useState('');
  const [missionType, setMissionType] = useState('like');
  const [rewardType, setRewardType] = useState('rvc');
  const [rewardQty, setRewardQty] = useState('100');
  const [goal, setGoal] = useState('100');
  const [highlight, setHighlight] = useState(true);
  const [active, setActive] = useState(true);

  const previewTitle = useMemo(() => {
    const map = {
      like: 'Curta este post no Instagram',
      follow: 'Siga o perfil oficial no Instagram',
      comment: 'Comente na publicação no Instagram',
      watch: 'Assista ao vídeo no Instagram',
      share: 'Compartilhe o story da marca'
    };
    return map[missionType] || 'Curta este post no Instagram';
  }, [missionType]);

  return (
    <div className="revvo-create-app revvo-canvas-app">
      <div className="revvo-create__scale revvo-canvas-scale" ref={scaleRef}>
        <div className="revvo-create revvo-canvas-surface" ref={innerRef}>
          <div className="revvo-create__shell">
          <header className="revvo-create__topbar">
            <button type="button" className="revvo-create__backBtn" aria-label="Voltar">
              <OutlineIcon>
                <path d="M15 18 9 12l6-6" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" />
              </OutlineIcon>
            </button>
            <RevvoLogo />
            <button type="button" className="revvo-create__profileCapsule" aria-label="Perfil">
              <span className="revvo-create__profileAvatar">
                <img src={ASSETS.avatar} alt="" width="40" height="40" decoding="async" />
                <i aria-hidden="true" />
              </span>
              <OutlineIcon>
                <path d="M7 10l5 5 5-5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
              </OutlineIcon>
            </button>
          </header>

          <section className="revvo-create__intro">
            <div className="revvo-create__introCopy">
              <h1>Criar missão</h1>
              <p>Engaje sua comunidade e recompense ações.</p>
            </div>
            <div className="revvo-create__heroArt" aria-hidden="true">
              <div className="revvo-create__bullseye" />
            </div>
          </section>

          <nav className="revvo-create__stepper" aria-label="Etapas da criação">
          {STEPS.map((step, index) => (
            <React.Fragment key={step.id}>
              <div className={`revvo-create__step ${step.id === 1 ? 'revvo-create__step--active' : ''}`}>
                <span className="revvo-create__stepNum">{step.id}</span>
                <span className="revvo-create__stepLabel">{step.label}</span>
              </div>
              {index < STEPS.length - 1 ? <span className="revvo-create__stepLine" aria-hidden="true" /> : null}
            </React.Fragment>
          ))}
          </nav>
          </div>

        <main className="revvo-create__main">
          <section className="revvo-create__card">
            <h2 className="revvo-create__cardTitle">
              <span className="revvo-create__cardNum">1</span>
              <span>Informações básicas</span>
            </h2>
            <label className="revvo-create__field">
              <span>Nome da missão</span>
              <input
                type="text"
                placeholder="Ex.: Convide 3 amigos"
                maxLength={60}
                value={missionName}
                onChange={(e) => setMissionName(e.target.value)}
              />
              <em>{missionName.length}/60</em>
            </label>
            <label className="revvo-create__field">
              <span>Descrição</span>
              <textarea
                rows={3}
                placeholder="Explique o que o usuário precisa fazer para concluir a missão..."
                maxLength={200}
                value={description}
                onChange={(e) => setDescription(e.target.value)}
              />
              <em>{description.length}/200</em>
            </label>
            <label className="revvo-create__field revvo-create__field--select">
              <span>Categoria</span>
              <div className="revvo-create__selectWrap">
                <Icon className="revvo-create__selectIcon">
                  <path d="M4 8h4V4H4v4Zm6 12h4v-4h-4v4Zm-6 0h4v-4H4v4Zm0-6h4v-4H4v4Zm6 0h4v-4h-4v4Zm6-10v4h4V4h-4Zm0 6h4v-4h-4v4Zm0 6h4v-4h-4v4Zm0 6h4v-4h-4v4Z" />
                </Icon>
                <select defaultValue="">
                  <option value="" disabled>
                    Selecione uma categoria
                  </option>
                  <option value="social">Redes sociais</option>
                  <option value="invite">Convites</option>
                  <option value="brand">Marca patrocinadora</option>
                </select>
              </div>
            </label>
          </section>

          <section className="revvo-create__card">
            <h2 className="revvo-create__cardTitle">
              <span className="revvo-create__cardNum">2</span>
              <span>Tipo de missão</span>
            </h2>
            <div className="revvo-create__typeRow" role="radiogroup" aria-label="Tipo de missão">
              {MISSION_TYPES.map(({ id, label, icon }) => (
                <button
                  key={id}
                  type="button"
                  role="radio"
                  aria-checked={missionType === id}
                  className={`revvo-create__typeBtn ${missionType === id ? 'revvo-create__typeBtn--active' : ''}`}
                  onClick={() => setMissionType(id)}
                >
                  <Icon>{icon}</Icon>
                  <span>{label}</span>
                </button>
              ))}
            </div>
          </section>

          <section className="revvo-create__card">
            <h2 className="revvo-create__cardTitle">
              <span className="revvo-create__cardNum">3</span>
              <span>Objetivo</span>
            </h2>
            <div className="revvo-create__grid2">
              <label className="revvo-create__field revvo-create__field--select">
                <span>Plataforma</span>
                <div className="revvo-create__selectWrap">
                  <span className="revvo-create__igMark" aria-hidden="true">◎</span>
                  <select defaultValue="instagram">
                    <option value="instagram">Instagram</option>
                    <option value="tiktok">TikTok</option>
                    <option value="youtube">YouTube</option>
                  </select>
                </div>
              </label>
              <label className="revvo-create__field">
                <span>Meta</span>
                <input type="number" min="1" value={goal} onChange={(e) => setGoal(e.target.value)} />
                <small>Número de vezes que a ação precisa ser realizada</small>
              </label>
            </div>
          </section>

          <section className="revvo-create__card">
            <h2 className="revvo-create__cardTitle">
              <span className="revvo-create__cardNum">4</span>
              <span>Recompensa</span>
            </h2>
            <div className="revvo-create__rewardGrid">
              <div className="revvo-create__rewardCol">
                <div className="revvo-create__rewardRow" role="radiogroup" aria-label="Tipo de recompensa">
                {REWARD_TYPES.map(({ id, label, icon }) => (
                  <button
                    key={id}
                    type="button"
                    role="radio"
                    aria-checked={rewardType === id}
                    className={`revvo-create__rewardBtn ${rewardType === id ? 'revvo-create__rewardBtn--active' : ''}`}
                    onClick={() => setRewardType(id)}
                  >
                    <span className={`revvo-create__rewardIcon revvo-create__rewardIcon--${id}`}>{icon}</span>
                    <span>{label}</span>
                  </button>
                ))}
                </div>
              </div>
              <label className="revvo-create__field revvo-create__field--qty">
                <span>Quantidade</span>
                <div className="revvo-create__qtyWrap">
                  <input type="number" min="1" value={rewardQty} onChange={(e) => setRewardQty(e.target.value)} />
                  <span className="revvo-create__qtyBadge">
                    <i>R</i> RVC
                  </span>
                </div>
                <small>Quantidade que o usuário receberá ao concluir a missão</small>
              </label>
            </div>
          </section>

          <section className="revvo-create__card">
            <h2 className="revvo-create__cardTitle">
              <span className="revvo-create__cardNum">5</span>
              <span>Configurações</span>
            </h2>
            <div className="revvo-create__period">
              <span>Período</span>
              <div className="revvo-create__dates">
                <label>
                  <input type="text" defaultValue="17/05/2025" readOnly />
                  <OutlineIcon>
                    <path d="M7 2v2M17 2v2M4 6h16M5 4h14a2 2 0 0 1 2 2v13a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2Z" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
                  </OutlineIcon>
                </label>
                <em>até</em>
                <label>
                  <input type="text" defaultValue="24/05/2025" readOnly />
                  <OutlineIcon>
                    <path d="M7 2v2M17 2v2M4 6h16M5 4h14a2 2 0 0 1 2 2v13a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2Z" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
                  </OutlineIcon>
                </label>
              </div>
            </div>
            <div className="revvo-create__grid2">
              <label className="revvo-create__field revvo-create__field--select">
                <span>Visibilidade</span>
                <div className="revvo-create__selectWrap">
                  <Icon className="revvo-create__selectIcon">
                    <path d="M12 2a10 10 0 1 0 10 10A10 10 0 0 0 12 2Zm0 3a7 7 0 1 1-7 7 7 7 0 0 1 7-7Zm0 2.2c-1.2 0-2.2 1-2.2 2.2 0 .6.2 1.1.6 1.5l2.8 2.8 2.8-2.8c.4-.4.6-.9.6-1.5 0-1.2-1-2.2-2.2-2.2Z" />
                  </Icon>
                  <select defaultValue="public">
                    <option value="public">Pública</option>
                    <option value="private">Privada</option>
                  </select>
                </div>
              </label>
              <label className="revvo-create__field revvo-create__field--select">
                <span>Vagas</span>
                <div className="revvo-create__selectWrap">
                  <Icon className="revvo-create__selectIcon">
                    <path d="M16 11c1.66 0 3-1.34 3-3s-1.34-3-3-3-3 1.34-3 3 1.34 3 3 3Zm-8 0c1.66 0 3-1.34 3-3S9.66 5 8 5 5 6.34 5 8s1.34 3 3 3Zm0 2c-2.67 0-8 1.34-8 4v2h16v-2c0-2.66-5.33-4-8-4Z" />
                  </Icon>
                  <select defaultValue="unlimited">
                    <option value="unlimited">Ilimitadas</option>
                    <option value="300">300 vagas</option>
                  </select>
                </div>
              </label>
            </div>
            <div className="revvo-create__toggles">
              <label className="revvo-create__toggle">
                <div>
                  <strong>Destacar missão</strong>
                  <small>A missão ficará em destaque</small>
                </div>
                <input type="checkbox" checked={highlight} onChange={(e) => setHighlight(e.target.checked)} />
                <span className="revvo-create__switch" aria-hidden="true" />
              </label>
              <label className="revvo-create__toggle">
                <div>
                  <strong>Ativar missão</strong>
                  <small>A missão ficará disponível</small>
                </div>
                <input type="checkbox" checked={active} onChange={(e) => setActive(e.target.checked)} />
                <span className="revvo-create__switch" aria-hidden="true" />
              </label>
            </div>
          </section>

          <section className="revvo-create__card revvo-create__card--preview">
            <div className="revvo-create__previewHead">
              <h2 className="revvo-create__cardTitle">
                <span className="revvo-create__cardNum">6</span>
                <span>Prévia da missão</span>
              </h2>
              <span className="revvo-create__previewPill">Como será exibido</span>
            </div>
            <article className="revvo-create__previewCard">
              <span className="revvo-create__previewIcon revvo-create__previewIcon--like" aria-hidden="true">
                <Icon>
                  <path d="M12 21.35 10.55 20.03C5.4 15.36 2 12.28 2 8.5A5.45 5.45 0 0 1 7.5 3C9.24 3 10.91 3.81 12 5.08A6.02 6.02 0 0 1 16.5 3 5.45 5.45 0 0 1 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35Z" />
                </Icon>
              </span>
              <div className="revvo-create__previewBody">
                <span className="revvo-create__previewBonus">BÔNUS +25%</span>
                <h3>{previewTitle}</h3>
                <p>Ajude a espalhar e ganhe recompensas!</p>
                <div className="revvo-create__previewRewards">
                  <span>
                    <i>R</i> {rewardQty || '100'} RVC
                  </span>
                  <span>
                    <b>XP</b> 50 XP
                  </span>
                </div>
              </div>
              <button type="button" className="revvo-create__previewCta">
                Fazer missão
              </button>
            </article>
          </section>
        </main>

        <footer className="revvo-create__footer">
          <button type="button" className="revvo-create__draftBtn">
            <OutlineIcon>
              <path d="M19 21H5a2 2 0 0 1-2-2V7l4-4h10l4 4v12a2 2 0 0 1-2 2Z" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round" />
              <path d="M17 21v-8H7v8M7 3v4h10V3" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
            </OutlineIcon>
            Salvar rascunho
          </button>
          <button type="button" className="revvo-create__continueBtn">
            Continuar
            <Icon>
              <path d="M10 6 8.59 7.41 13.17 12l-4.58 4.59L10 18l6-6-6-6z" />
            </Icon>
          </button>
        </footer>
        </div>
      </div>
    </div>
  );
};

export default RevvoCreateMissionPreview;
