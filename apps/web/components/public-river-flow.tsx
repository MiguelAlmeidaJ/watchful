'use client';
import dynamic from 'next/dynamic';
import { faixaConhecida, type Faixa } from './rio/paisagem';
import { useNearViewport } from './use-near-viewport';
import { ArrowDown, Clock, Waves } from 'lucide-react';
import './rio/rio.css';

const CenaRio = dynamic(() => import('./rio/cena-rio').then(m => m.CenaRio), {
 loading: () => <ReservaIlustracao/>,
});

function ReservaIlustracao() {
 return <figure className="rio-figura" aria-hidden="true">
  <div className="rio-quadro"><div className="rio-desenho rio-reserva"/></div>
  <figcaption><strong>Ilustração de Além Paraíba</strong></figcaption>
 </figure>;
}

function IlustracaoRio({ faixa, motivoSemFaixa, dashboardReady }: {
 faixa: Faixa | null; motivoSemFaixa: string; dashboardReady: boolean;
}) {
 const { ref, near } = useNearViewport('0px', dashboardReady);
 return <div ref={ref} className="rio-viewport">
  {near ? <CenaRio faixa={faixa} motivoSemFaixa={motivoSemFaixa}/> : <ReservaIlustracao/>}
 </div>;
}

type Band = { level: string; label: string; minimumM3s: number };
export type PublicRiver = {
 estimatedM3s: number | null;
 observedAt: string | null;
 status: 'available' | 'historical' | 'unavailable';
 contributions: { stationCode: string; stationName: string | null; name: string; dischargeM3s: number | null; observedAt: string | null }[];
 localStage: { current: Pick<Band, 'level' | 'label'> | null; thresholds: Band[] } | null;
};

const number = new Intl.NumberFormat('pt-BR', { maximumFractionDigits: 8 });
const date = new Intl.DateTimeFormat('pt-BR', {
 timeZone: 'America/Sao_Paulo', day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit',
});

function dataValida(value: string | null | undefined): value is string {
 return typeof value === 'string' && Number.isFinite(Date.parse(value)) && Date.parse(value) <= Date.now();
}

function vazaoValida(value: unknown): value is number {
 return typeof value === 'number' && Number.isFinite(value) && value >= 0;
}

export function PublicRiverFlow({ river, riverName, municipality, municipalityCode, dashboardReady = true }: {
 river: PublicRiver | null; riverName: string | null; municipality: string; municipalityCode: string; dashboardReady?: boolean;
}) {
 const stage = river?.localStage;
 const temHorario = dataValida(river?.observedAt);
 const temLeitura = river?.status === 'available' || river?.status === 'historical';
 const total = temLeitura && temHorario && vazaoValida(river?.estimatedM3s) ? river.estimatedM3s : null;
 const atual = total !== null && river?.status === 'available';
 const ilustrar = municipalityCode === '3101508';
 const candidato = atual ? stage?.current : null;
 const faixa = faixaConhecida(candidato?.level) ? candidato.level : null;
 const current = ilustrar && !faixa ? null : candidato;
 const motivoSemFaixa = river?.status === 'historical' ? 'Leitura desatualizada' : 'Aguardando leituras aprovadas';

 return <section className="pm-river-overview" aria-labelledby="pm-river-title">
  <article className="pm-river-main">
   <div className="pm-river-reading">
    <div className="pm-river-name"><Waves size={23} aria-hidden="true"/><h2 id="pm-river-title">{riverName ?? 'Rio principal'}</h2></div>
    <p className="pm-river-caption">{river?.status === 'historical' ? 'Última vazão estimada' : 'Vazão total estimada'} em {municipality}</p>
    <div className="pm-number" data-unavailable={total == null}>
     {total == null ? 'Indisponível' : <>{number.format(total)} <span>m³/s</span></>}
    </div>
    <p className="pm-river-time"><Clock size={15} aria-hidden="true"/>
     {temHorario && river?.observedAt
      ? <>{river.status === 'historical' ? 'Leitura desatualizada' : 'Horário das leituras'} <span>·</span> <time dateTime={river.observedAt}>{date.format(new Date(river.observedAt))}</time></>
      : 'Aguardando leituras aprovadas no mesmo horário.'}
    </p>
   </div>
   {stage && <div className="pm-river-classification">
    <div className="pm-river-band">
     <p>Faixa atual em {municipality}</p>
     <strong role="status" data-level={current?.level}>{current?.label ?? motivoSemFaixa}</strong>
    </div>
    <ul className="pm-river-thresholds" aria-label={`Faixas de vazão em ${municipality}`}>
     {stage.thresholds.map(band => <li key={band.level} data-level={band.level} data-current={current?.level === band.level}>
      <strong>{band.label}</strong><span>a partir de {number.format(band.minimumM3s)} m³/s</span>
     </li>)}
    </ul>
    <a className="pm-river-alert-link" href="#avisos">Consultar avisos oficiais <ArrowDown size={14} aria-hidden="true"/></a>
   </div>}
  </article>
  {!!river?.contributions?.length && <section aria-labelledby="pm-contributions-title">
   <h3 id="pm-contributions-title">Vazões que compõem o total</h3>
   <div className="pm-river-contributions">
    {river.contributions.map(contribution => <article key={contribution.stationCode} className="pm-river-contribution">
     <h4>{contribution.name}</h4>
     <strong>{!vazaoValida(contribution.dischargeM3s) ? 'Indisponível' : <>{number.format(contribution.dischargeM3s)} <span>m³/s</span></>}</strong>
     <small>Estação {contribution.stationCode}{dataValida(contribution.observedAt) && <> · <time dateTime={contribution.observedAt}>{date.format(new Date(contribution.observedAt))}</time></>}</small>
    </article>)}
   </div>
   {total == null && <p className="pm-note">As leituras individuais disponíveis podem ser de horários diferentes.</p>}
  </section>}
  {ilustrar && <IlustracaoRio faixa={faixa} motivoSemFaixa={motivoSemFaixa} dashboardReady={dashboardReady}/>}
 </section>;
}
