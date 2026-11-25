'use client';
import { useState } from 'react';
import { PublicRiverFlow, type PublicRiver } from '../../../components/public-river-flow';
import styles from './previa.module.css';

type FaixaMunicipal = NonNullable<PublicRiver['localStage']>;
const maximo = 3000;
const numero = new Intl.NumberFormat('pt-BR');

export function PreviaRio({ faixas, abaixoDaAtencao, observadoEm }: {
  faixas: FaixaMunicipal['thresholds'];
  abaixoDaAtencao: NonNullable<FaixaMunicipal['current']>;
  observadoEm: string;
}) {
  const [vazao, setVazao] = useState(853);
  const atual = faixas.findLast(faixa => vazao >= faixa.minimumM3s) ?? abaixoDaAtencao;
  const leitura: PublicRiver = {
    estimatedM3s: vazao,
    status: 'available',
    observedAt: observadoEm,
    contributions: [],
    localStage: { current: atual, thresholds: faixas },
  };

  return <main className="public-site">
    <section className="public-container public-monitor">
      <div className="pm-heading">
        <div><p className="pm-heading-context">Prévia local · dados simulados</p><h1>Teste da animação do rio</h1></div>
      </div>
      <div className={styles.controles}>
        <div className={styles.cabecalho}>
          <label htmlFor="vazao-simulada">Vazão simulada</label>
          <output htmlFor="vazao-simulada">{numero.format(vazao)} m³/s</output>
        </div>
        <input
          className={styles.barra}
          id="vazao-simulada"
          type="range"
          min={0}
          max={maximo}
          step={1}
          value={vazao}
          aria-valuetext={`${numero.format(vazao)} metros cúbicos por segundo, ${atual.label}`}
          onChange={e => setVazao(e.currentTarget.valueAsNumber)}
        />
        <div className={styles.extremos} aria-hidden="true"><span>0</span><span>{numero.format(maximo)} m³/s</span></div>
        <div className={styles.limites}>
          {faixas.map(faixa => <button type="button" key={faixa.level} data-faixa={faixa.level} onClick={() => setVazao(faixa.minimumM3s)}>
            <span>{faixa.label}</span><small>{numero.format(faixa.minimumM3s)} m³/s</small>
          </button>)}
        </div>
      </div>
      <PublicRiverFlow river={leitura} municipalityCode="3101508" municipality="Além Paraíba" riverName="Rio Paraíba do Sul"/>
      <p id="avisos" className="pm-note">Os cenários desta página usam dados simulados.</p>
    </section>
  </main>;
}
