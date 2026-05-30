import React, { useCallback, useMemo, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useRevvoCanvasScale } from '../../hooks/useRevvoCanvasScale';
import {
  DEFAULT_MISSION_ID,
  getMissionExecutionData,
  MISSION_EXECUTION_STATUS
} from './missionData';
import './RevvoMissionExecutionPreview.css';

const HERO_PHONE_ASSET = '/banco/assets/revvo-mission-execution-v2/revvo-mission-execution-v2-hero-phone-3d.png';

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

const BrandMark = ({ type }) => {
  if (type === 'adidas') {
    return (
      <span className="revvo-mexec__brandLogo revvo-mexec__brandLogo--adidas" aria-hidden="true">
        <svg viewBox="0 0 24 24" fill="none">
          <path d="M2.2 18.2 7.4 7.8l2.8 5.6 2.4-4.8 2.9 5.8 2.7-5.1 3.8 8.9H2.2Z" fill="#fff" />
        </svg>
      </span>
    );
  }
  return (
    <span className="revvo-mexec__brandLogo revvo-mexec__brandLogo--ig" aria-hidden="true">
      <svg viewBox="0 0 24 24"><path d="M7 2h10a5 5 0 0 1 5 5v10a5 5 0 0 1-5 5H7a5 5 0 0 1-5-5V7a5 5 0 0 1 5-5Zm5 5.2A4.8 4.8 0 1 0 16.8 12 4.8 4.8 0 0 0 12 7.2Zm6.2-2.3a1.1 1.1 0 1 0 1.1 1.1 1.1 1.1 0 0 0-1.1-1.1Z" fill="currentColor" /></svg>
    </span>
  );
};

function resolveSteps(steps, flowState) {
  const completedCount =
    flowState === MISSION_EXECUTION_STATUS.NOT_STARTED
      ? 0
      : flowState === MISSION_EXECUTION_STATUS.EXTERNAL_OPENED
        ? 1
        : flowState === MISSION_EXECUTION_STATUS.PROOF_PENDING
          ? 3
          : flowState === MISSION_EXECUTION_STATUS.UNDER_REVIEW
            ? 4
            : flowState === MISSION_EXECUTION_STATUS.APPROVED
              ? 5
              : 0;

  return steps.map((step, index) => {
    if (index < completedCount) return { ...step, status: 'done' };
    if (index === completedCount) return { ...step, status: 'active' };
    return { ...step, status: 'locked' };
  });
}

const RevvoMissionExecutionPreview = () => {
  const { scaleRef, innerRef } = useRevvoCanvasScale();
  const navigate = useNavigate();
  const { id: routeId } = useParams();
  const fileInputRef = useRef(null);

  const missionId = routeId || DEFAULT_MISSION_ID;
  const missionData = useMemo(() => getMissionExecutionData(missionId), [missionId]);

  const [flowState, setFlowState] = useState(MISSION_EXECUTION_STATUS.NOT_STARTED);
  const [publicationLink, setPublicationLink] = useState('');
  const [validatorNote, setValidatorNote] = useState('');
  const [proofFileName, setProofFileName] = useState('');

  const steps = useMemo(() => resolveSteps(missionData.steps, flowState), [missionData.steps, flowState]);

  const completedSteps = useMemo(
    () => steps.filter((s) => s.status === 'done').length,
    [steps]
  );

  const slotsPercent = Math.round((missionData.slotsUsed / missionData.slotsTotal) * 100);

  const openPublication = useCallback(() => {
    window.open(missionData.missionUrl, '_blank', 'noopener,noreferrer');
    if (flowState === MISSION_EXECUTION_STATUS.NOT_STARTED) {
      setFlowState(MISSION_EXECUTION_STATUS.EXTERNAL_OPENED);
    }
  }, [flowState, missionData.missionUrl]);

  const handleProofSelect = (event) => {
    const file = event.target.files?.[0];
    if (!file) return;
    setProofFileName(file.name);
    setFlowState(MISSION_EXECUTION_STATUS.PROOF_PENDING);
  };

  const earnings = useMemo(
    () => [
      {
        id: 'rvc',
        label: `+${missionData.rewardRvc} RVC`,
        tone: 'green',
        icon: (
          <span className="revvo-mexec__earnIcon revvo-mexec__earnIcon--coin" aria-hidden="true">
            R
          </span>
        )
      },
      {
        id: 'xp',
        label: `+${missionData.rewardXp} XP`,
        tone: 'purple',
        icon: (
          <span className="revvo-mexec__earnIcon revvo-mexec__earnIcon--xp" aria-hidden="true">
            XP
          </span>
        )
      },
      {
        id: 'ranking',
        label: '+1 Ranking',
        labelSub: 'semanal',
        tone: 'blue',
        icon: (
          <span className="revvo-mexec__earnIcon revvo-mexec__earnIcon--rank" aria-hidden="true">
            <Icon>
              <path d="M4 20h16v-2H4v2Zm2-4h3V9H6v7Zm5 0h3V5h-3v11Zm5 0h3V12h-3v4Z" />
            </Icon>
          </span>
        )
      },
      {
        id: 'streak',
        label: '+1 Sequência',
        labelSub: 'diária',
        tone: 'green',
        icon: (
          <span className="revvo-mexec__earnIcon revvo-mexec__earnIcon--streak" aria-hidden="true">
            <Icon>
              <path d="M13.5.67c-.32.66-1.04 2.12-1.93 4.13-.86 1.93-1.9 4.22-2.67 6.16-.77-1.94-1.81-4.23-2.67-6.16-.89-2.01-1.61-3.47-1.93-4.13C3.79 2.17 5.07 1 6.5 1c1.2 0 2.17.72 2.67 1.67.5-.95 1.47-1.67 2.67-1.67 1.43 0 2.71 1.17 2.83 2.67ZM12 22c-2.76 0-5-2.24-5-5 0-1.53.69-2.9 1.78-3.83.55 2.46 2.18 5.08 3.22 6.83 1.04-1.75 2.67-4.37 3.22-6.83A4.98 4.98 0 0 1 17 17c0 2.76-2.24 5-5 5Z" />
            </Icon>
          </span>
        )
      },
      {
        id: 'badge',
        label: 'Badge',
        labelSub: 'Creator Ativo',
        tone: 'gold',
        icon: (
          <span className="revvo-mexec__earnIcon revvo-mexec__earnIcon--badge" aria-hidden="true">
            ★
          </span>
        )
      }
    ],
    [missionData.rewardRvc, missionData.rewardXp]
  );

  return (
    <div className="revvo-mexec-app revvo-canvas-app">
      <div className="revvo-mexec__scale revvo-canvas-scale" ref={scaleRef}>
        <div className="revvo-mexec revvo-canvas-surface" ref={innerRef}>
          <section className="revvo-mission-top" aria-label="Topo da missão">
            <header className="revvo-mission-header">
              <button
                type="button"
                className="revvo-mexec__backBtn"
                aria-label="Voltar"
                onClick={() => navigate('/dev/revvo-missions')}
              >
                <OutlineIcon className="revvo-mexec__backIcon">
                  <path
                    d="M15 18 9 12l6-6"
                    stroke="currentColor"
                    strokeWidth="2.4"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                </OutlineIcon>
              </button>
              <h1 className="revvo-mission-header-title">Missão em andamento</h1>
              <button type="button" className="revvo-mexec__helpBtn" aria-label="Ajuda">
                <OutlineIcon className="revvo-mexec__helpIcon">
                  <path
                    d="M9.5 9.5a2.6 2.6 0 1 1 3.7 3.7c-.9.9-1.7 1.2-1.7 2.3"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                  />
                  <circle cx="12" cy="17.2" r="1" fill="currentColor" />
                  <circle cx="12" cy="12" r="9" stroke="currentColor" strokeWidth="2" />
                </OutlineIcon>
              </button>
            </header>

            <div className="revvo-mission-chips" aria-label="Informações da missão">
              <span className="revvo-mission-chip">
                <i className="revvo-mexec__chipIcon revvo-mexec__chipIcon--ig" aria-hidden="true" />
                {missionData.platform}
              </span>
              <span className="revvo-mission-chipSep" aria-hidden="true">
                ·
              </span>
              <span className="revvo-mission-chip">
                <Icon className="revvo-mexec__chipSvg revvo-mexec__chipSvg--target">
                  <path d="M12 8a4 4 0 1 0 4 4 4 4 0 0 0-4-4Zm0-6a10 10 0 1 0 10 10A10 10 0 0 0 12 2Zm0 2a8 8 0 1 1-8 8 8 8 0 0 1 8-8Zm0 2.5A5.5 5.5 0 1 0 6.5 12 5.51 5.51 0 0 0 12 6.5Z" />
                </Icon>
                Ação simples
              </span>
              {missionData.bonusPercent > 0 ? (
                <>
                  <span className="revvo-mission-chipSep" aria-hidden="true">
                    ·
                  </span>
                  <span className="revvo-mission-chip revvo-mission-chip--bonus">
                    <Icon className="revvo-mexec__chipSvg revvo-mexec__chipSvg--bolt">
                      <path d="M13 2 4 14h7l-1 8 9-12h-7l1-8Z" />
                    </Icon>
                    Bônus ativo
                  </span>
                </>
              ) : null}
            </div>

            <div className="revvo-mission-hero-group">
              <section className="revvo-mission-hero" aria-label="Resumo da missão">
                <div className="revvo-mission-hero__content">
                  <div className="revvo-mission-hero__head">
                    <div className="revvo-mission-brand-logo">
                      <BrandMark type={missionData.brandMark} />
                    </div>
                    <span className="revvo-mission-rarity">{missionData.rarity}</span>
                  </div>
                  <div className="revvo-mission-hero__copy">
                    <h2 className="revvo-mission-hero__title">{missionData.title}</h2>
                    <p className="revvo-mission-hero__subtitle">{missionData.description}</p>
                  </div>
                  <div className="revvo-mission-rewards">
                    <span className="revvo-mexec__rewardPill revvo-mexec__rewardPill--rvc">
                      <i className="revvo-mexec__coin" aria-hidden="true">
                        R
                      </i>
                      +{missionData.rewardRvc} RVC
                    </span>
                    <span className="revvo-mexec__rewardPill revvo-mexec__rewardPill--xp">
                      <i className="revvo-mexec__xp" aria-hidden="true">
                        XP
                      </i>
                      +{missionData.rewardXp} XP
                    </span>
                  </div>
                </div>
                {HERO_PHONE_ASSET ? (
                  <div className="revvo-mission-hero__phoneArt" aria-hidden="true">
                    <img
                      className="revvo-mission-hero__phone"
                      src={HERO_PHONE_ASSET}
                      alt=""
                    />
                  </div>
                ) : (
                  <div className="revvo-mission-hero__phone revvo-mission-hero__phone--placeholder" aria-hidden="true">
                    <span className="revvo-mission-hero__phoneHeart revvo-mission-hero__phoneHeart--left" />
                    <span className="revvo-mission-hero__phoneHeart revvo-mission-hero__phoneHeart--right" />
                    <span className="revvo-mission-hero__phoneDevice">
                      <span className="revvo-mission-hero__phoneScreen" />
                    </span>
                    <span className="revvo-mission-hero__phoneBase" />
                  </div>
                )}
              </section>

              <section className="revvo-mission-metrics" aria-label="Métricas da missão">
                <div className="revvo-mexec__metric">
                  <span className="revvo-mexec__metricIcon revvo-mexec__metricIcon--blue">
                    <Icon>
                      <path d="M16 11c1.66 0 3-1.34 3-3s-1.34-3-3-3-3 1.34-3 3 1.34 3 3 3Zm-8 0c1.66 0 3-1.34 3-3S9.66 5 8 5 5 6.34 5 8s1.34 3 3 3Zm0 2c-2.67 0-8 1.34-8 4v2h16v-2c0-2.66-5.33-4-8-4Z" />
                    </Icon>
                  </span>
                  <div>
                    <small>Vagas restantes</small>
                    <strong>
                      {missionData.slotsUsed} / {missionData.slotsTotal}
                    </strong>
                    <i className="revvo-mexec__metricBar" aria-hidden="true">
                      <b style={{ width: `${slotsPercent}%` }} />
                    </i>
                  </div>
                </div>
                <div className="revvo-mexec__metric">
                  <span className="revvo-mexec__metricIcon revvo-mexec__metricIcon--blue">
                    <Icon>
                      <path d="M12 2a10 10 0 1 0 10 10A10 10 0 0 0 12 2Zm1 5h-2v6l5 3 .9-1.45-3.9-2.3V7Z" />
                    </Icon>
                  </span>
                  <div>
                    <small>Tempo estimado</small>
                    <strong>{missionData.estimatedTime}</strong>
                  </div>
                </div>
                <div className="revvo-mexec__metric">
                  <span className="revvo-mexec__metricIcon revvo-mexec__metricIcon--green">
                    <Icon>
                      <path d="M12 1 3 5v6c0 5.55 3.84 10.74 9 12 5.16-1.26 9-6.45 9-12V5l-9-4Zm-1 14-4-4 1.41-1.41L11 12.17l6.59-6.59L19 7l-8 8Z" />
                    </Icon>
                  </span>
                  <div>
                    <small>Validação</small>
                    <strong className="revvo-mexec__metricAuto">{missionData.validationType}</strong>
                  </div>
                </div>
              </section>
            </div>
          </section>

          <main className="revvo-mission-body">
            {missionData.bonusPercent > 0 && missionData.bonusTimeLeft ? (
              <section className="revvo-mexec__bonus" aria-label="Bônus relâmpago">
                <span className="revvo-mexec__bonusBolt" aria-hidden="true">
                  <Icon>
                    <path d="M13 2 4 14h7l-1 8 9-12h-7l1-8Z" />
                  </Icon>
                </span>
                <div className="revvo-mexec__bonusCopy">
                  <strong>Bônus relâmpago ativo!</strong>
                  <p>Conclua agora e receba +{missionData.bonusPercent}% de RVC!</p>
                </div>
                <div className="revvo-mexec__bonusTimer">
                  <small>Tempo restante</small>
                  <strong>{missionData.bonusTimeLeft}</strong>
                </div>
              </section>
            ) : null}

            <section className="revvo-mexec__card" aria-labelledby="revvo-mexec-steps-title">
              <div className="revvo-mexec__cardHead">
                <h3 id="revvo-mexec-steps-title">Passos da missão</h3>
                <span className="revvo-mexec__stepsCount">
                  {completedSteps} / {steps.length} concluídos
                </span>
              </div>
              <ol className="revvo-mexec__steps">
                {steps.map((step, index) => (
                  <li
                    key={step.id}
                    className={`revvo-mexec__step revvo-mexec__step--${step.status}`}
                  >
                    <span className="revvo-mexec__stepNum">{index + 1}</span>
                    <div className="revvo-mexec__stepBody">
                      <strong>{step.title}</strong>
                      <p>{step.description}</p>
                    </div>
                    <div className="revvo-mexec__stepAction">
                      {step.id === 'open' && step.status === 'active' ? (
                        <button
                          type="button"
                          className="revvo-mexec__stepLinkBtn"
                          onClick={openPublication}
                        >
                          Abrir publicação
                          <OutlineIcon className="revvo-mexec__extIcon">
                            <path
                              d="M14 5h5v5M10 14 19 5M15 5l-4 4"
                              stroke="currentColor"
                              strokeWidth="2"
                              strokeLinecap="round"
                              strokeLinejoin="round"
                            />
                          </OutlineIcon>
                        </button>
                      ) : null}
                      {step.status === 'locked' ? (
                        <span className="revvo-mexec__stepLock" aria-label="Bloqueado">
                          <Icon>
                            <path d="M17 8h-1V6a4 4 0 0 0-8 0v2H7a2 2 0 0 0-2 2v10h14V10a2 2 0 0 0-2-2Zm-7 0V6a2 2 0 0 1 4 0v2h-4Z" />
                          </Icon>
                        </span>
                      ) : null}
                      {step.status === 'done' ? (
                        <span className="revvo-mexec__stepDone" aria-label="Concluído">
                          <Icon>
                            <path d="M9 16.17 4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41L9 16.17Z" />
                          </Icon>
                        </span>
                      ) : null}
                    </div>
                  </li>
                ))}
              </ol>
            </section>

            <section className="revvo-mexec__card revvo-mexec__proof" aria-labelledby="revvo-mexec-proof-title">
              <div className="revvo-mexec__cardHead">
                <h3 id="revvo-mexec-proof-title">Comprovante</h3>
                <span className="revvo-mexec__proofBadge">
                  <Icon>
                    <path d="M12 1 3 5v6c0 5.55 3.84 10.74 9 12 5.16-1.26 9-6.45 9-12V5l-9-4Zm-1 14-4-4 1.41-1.41L11 12.17l6.59-6.59L19 7l-8 8Z" />
                  </Icon>
                  Validação automática
                </span>
              </div>
              <div className="revvo-mexec__proofGrid">
                <button
                  type="button"
                  className="revvo-mexec__upload"
                  onClick={() => fileInputRef.current?.click()}
                >
                  <span className="revvo-mexec__uploadIcon" aria-hidden="true">
                    <OutlineIcon>
                      <rect x="4" y="5" width="16" height="14" rx="2" stroke="currentColor" strokeWidth="2" />
                      <path d="M8 13h8M12 9v8" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
                      <circle cx="9" cy="9" r="1.5" fill="currentColor" />
                    </OutlineIcon>
                  </span>
                  <strong>{proofFileName || 'Enviar print'}</strong>
                  <small>PNG, JPG até 10MB</small>
                </button>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/png,image/jpeg,image/jpg"
                  className="revvo-mexec__fileInput"
                  onChange={handleProofSelect}
                  aria-label="Selecionar comprovante"
                />
                <div className="revvo-mexec__proofFields">
                  <label className="revvo-mexec__field">
                    <span>Link da publicação (opcional)</span>
                    <span className="revvo-mexec__inputWrap">
                      <OutlineIcon className="revvo-mexec__fieldIcon">
                        <path
                          d="M10 13a5 5 0 0 0 7.07 0l1.41-1.41a5 5 0 0 0-7.07-7.07L9.5 6.5"
                          stroke="currentColor"
                          strokeWidth="1.8"
                          strokeLinecap="round"
                        />
                        <path
                          d="M14 11a5 5 0 0 0-7.07 0L5.52 12.41a5 5 0 0 0 7.07 7.07L14.5 17.5"
                          stroke="currentColor"
                          strokeWidth="1.8"
                          strokeLinecap="round"
                        />
                      </OutlineIcon>
                      <input
                        type="url"
                        value={publicationLink}
                        onChange={(e) => setPublicationLink(e.target.value)}
                        placeholder="https://instagram.com/p/xxxxxxxxxxx"
                      />
                    </span>
                  </label>
                  <label className="revvo-mexec__field">
                    <span>Observação para o validador (opcional)</span>
                    <span className="revvo-mexec__inputWrap">
                      <OutlineIcon className="revvo-mexec__fieldIcon">
                        <path
                          d="M4 20h16l-1.5-5.5L12 13l-6.5 1.5L4 20Z"
                          stroke="currentColor"
                          strokeWidth="1.8"
                          strokeLinejoin="round"
                        />
                        <path
                          d="M12 13V4"
                          stroke="currentColor"
                          strokeWidth="1.8"
                          strokeLinecap="round"
                        />
                      </OutlineIcon>
                      <input
                        type="text"
                        value={validatorNote}
                        onChange={(e) => setValidatorNote(e.target.value)}
                        placeholder="Alguma informação adicional..."
                      />
                    </span>
                  </label>
                </div>
              </div>
            </section>

            <section className="revvo-mexec__earnings" aria-labelledby="revvo-mexec-earn-title">
              <h3 id="revvo-mexec-earn-title">Você ganha com essa missão</h3>
              <div className="revvo-mexec__rewards">
                {earnings.map((item) => (
                  <article key={item.id} className={`revvo-mexec__earnCard revvo-mexec__earnCard--${item.tone}`}>
                    {item.icon}
                    <p className="revvo-mexec__earnLabel">
                      <strong>{item.label}</strong>
                      {item.labelSub ? <span>{item.labelSub}</span> : null}
                    </p>
                  </article>
                ))}
              </div>
            </section>

            <footer className="revvo-mexec__footer" aria-label="Ações da missão">
              <button type="button" className="revvo-mexec__ctaPrimary" onClick={openPublication}>
              <i className="revvo-mexec__ctaIg" aria-hidden="true" />
              Abrir publicação agora
              <OutlineIcon className="revvo-mexec__ctaExt">
                <path
                  d="M14 5h5v5M10 14 19 5M15 5l-4 4"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </OutlineIcon>
              </button>
              <button type="button" className="revvo-mexec__ctaSecondary">
                <OutlineIcon className="revvo-mexec__bookmark">
                  <path
                    d="M6 4h12v16l-6-4-6 4V4Z"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinejoin="round"
                  />
                </OutlineIcon>
                Salvar missão para depois
              </button>
            </footer>
          </main>
        </div>
      </div>
    </div>
  );
};

export default RevvoMissionExecutionPreview;
