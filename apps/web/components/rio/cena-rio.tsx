'use client';
import { animate } from 'animejs';
import { memo, useEffect, useId, useRef, useState } from 'react';
import { Pause, Play, Waves } from 'lucide-react';
import { contorno, correntes, explicacaoDaCena, perfilVisual, type Faixa } from './paisagem';
import { Margens, type MargensHandle } from './margens';

const base = '/rios/alem-paraiba';
// Faixas curtas de luz seguem a superfície sem desenhar pistas paralelas no rio.
const brilhos = [
  [1,288,25],[17,281,12],[43,285,18],[57,277,8],[84,265,17],[101,273,9],[113,267,20],
  [167,256,16],[189,263,8],[201,248,24],[221,251,11],[249,244,14],[279,247,11],
  [306,242,13],[381,244,18],[419,236,22],[453,236,13],[471,227,16],[497,223,8],
  [516,216,16],[549,214,11],[588,197,17],[604,194,10],[651,190,20],[699,188,9],
  [754,178,16],[794,175,11],[831,170,16],[879,165,11],[913,160,8],[966,155,14],
] as const;
const trilhasDeBrilho = Array.from({ length: 6 }, (_, grupo) => brilhos
  .filter((_, i) => i % 6 === grupo)
  .map(([x,y,w]) => `M${x} ${y}q${w*.4} .45 ${w} -1.2`)
  .join(' '));
const pilares = [[228,225,0.82],[342.3,251,1],[456.7,277,1.15]] as const;

export const CenaRio = memo(function CenaRio({ faixa, motivoSemFaixa }: { faixa: Faixa | null; motivoSemFaixa: string }) {
  const id = useId().replace(/[^a-zA-Z0-9_-]/g, '');
  const ref = useRef<SVGSVGElement>(null);
  const costa = useRef<SVGPathElement>(null);
  const luz = useRef<SVGStopElement>(null);
  const fundo = useRef<SVGStopElement>(null);
  const espuma = useRef<SVGGElement>(null);
  const ilha = useRef<SVGGElement>(null);
  const vegetacaoDaIlha = useRef<SVGGElement>(null);
  const reflexos = useRef<SVGGElement>(null);
  const mascara = useRef<SVGGElement>(null);
  const margens = useRef<MargensHandle>(null);
  const estatico = useRef(perfilVisual[faixa ?? 'below_attention']);
  const atual = useRef({ ...estatico.current, abertura: Number(estatico.current.abertura), umidade: Number(estatico.current.abertura) });
  const [pausa, setPausa] = useState(false);
  const [reduzido, setReduzido] = useState(true);
  const [visivel, setVisivel] = useState(false);
  const movimentos = useRef<{ animacao: Animation; fator: number }[]>([]);

  useEffect(() => {
    const svg = ref.current;
    if (!svg || typeof svg.animate !== 'function' || typeof IntersectionObserver === 'undefined') return;
    const media = window.matchMedia('(prefers-reduced-motion: reduce)');
    const preferencia = () => setReduzido(media.matches);
    let naTela = false;
    const visibilidade = () => setVisivel(naTela && !document.hidden);
    const observer = new IntersectionObserver(([entry]) => {
      naTela = (entry?.intersectionRatio ?? 0) >= .12;
      visibilidade();
    }, { threshold: .12 });
    observer.observe(svg);
    preferencia();
    media.addEventListener('change', preferencia);
    document.addEventListener('visibilitychange', visibilidade);
    return () => {
      observer.disconnect();
      media.removeEventListener('change', preferencia);
      document.removeEventListener('visibilitychange', visibilidade);
      movimentos.current.forEach(({animacao}) => animacao.cancel());
      movimentos.current = [];
    };
  }, []);

  const animar = visivel && !pausa && !reduzido && faixa !== null;
  useEffect(() => {
    const { duracao, ...destino } = perfilVisual[faixa ?? 'below_attention'];
    if (animar && !movimentos.current.length && ref.current) {
      movimentos.current = Array.from(ref.current.querySelectorAll<SVGElement>('[data-ciclo]')).map((el, i) => {
        const ciclo = Number(el.dataset.ciclo);
        const fator = el.closest('[data-margens-rio]') ? .62 : 1;
        const animacao = el.animate([{strokeDashoffset: 0}, {strokeDashoffset: ciclo}], {
          duration: 8500 + i * 310, iterations: Infinity, easing: 'linear', delay: -841 * i,
        });
        return { animacao, fator };
      });
    }
    const aplicar = () => {
      const v = atual.current;
      costa.current?.setAttribute('d', contorno(v.abertura));
      margens.current?.atualizar(v.abertura, v.umidade);
      fundo.current?.setAttribute('stop-color', v.agua);
      luz.current?.setAttribute('stop-color', v.luz);
      espuma.current?.setAttribute('opacity', String(v.espuma));
      ilha.current?.setAttribute('transform', `translate(0 ${v.abertura}) scale(${1-.19*v.abertura} ${1-.78*v.abertura})`);
      ilha.current?.setAttribute('opacity', String(1-.68*v.abertura));
      vegetacaoDaIlha.current?.setAttribute('opacity', String(1-.17*v.abertura));
      reflexos.current?.setAttribute('transform', `translate(0 ${-20*v.abertura})`);
      mascara.current?.setAttribute('transform', `translate(0 ${-9*v.abertura})`);
    };
    movimentos.current.forEach(({ animacao, fator }) => {
      animacao.updatePlaybackRate(destino.velocidade * fator);
      if (animar) animacao.play(); else animacao.pause();
    });
    if (!animar) {
      Object.assign(atual.current, destino, { umidade: destino.abertura });
      aplicar();
      return;
    }
    if (atual.current.abertura === destino.abertura && atual.current.umidade === destino.abertura) return;
    const recuando = destino.abertura < atual.current.umidade;
    const efeito = animate(atual.current, {
      ...destino,
      umidade: { to: destino.abertura, duration: recuando ? 3600 : duracao },
      duration: duracao,
      ease: 'inOutSine',
      onUpdate: aplicar,
    });
    return () => { efeito.cancel(); };
  }, [animar, faixa]);

  const inicio = estatico.current;
  return <figure className="rio-figura" data-faixa={faixa ?? 'indeterminada'}>
    <div className="rio-quadro">
     <div className="rio-desenho" aria-hidden="true">
      {/* A arte estática fica em camadas próprias para o navegador reaproveitar sua pintura. */}
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img className="rio-arte" src={base+'/vale.svg'} width="1000" height="340" alt="" decoding="async"/>
      <svg ref={ref} viewBox="0 0 1000 340" preserveAspectRatio="xMidYMid slice" aria-hidden="true" focusable="false">
        <defs>
          <clipPath id={id+'-agua'}><path ref={costa} d={contorno(inicio.abertura)}/></clipPath>
          <linearGradient id={id+'-cor'} gradientUnits="userSpaceOnUse" x1="980" y1="140" x2="185" y2="360">
            <stop ref={luz} stopColor={inicio.luz}/><stop ref={fundo} offset="1" stopColor={inicio.agua}/>
          </linearGradient>
          <mask id={id+'-apoios'} maskUnits="userSpaceOnUse" x="0" y="0" width="1000" height="340">
            <rect width="1000" height="340" fill="white"/>
            <g ref={mascara}>
              {pilares.map(([x,y]) => <rect key={x} x={x-10} y={y+16} width="28" height="24"/>)}
              <path d="M563 321L575.5 322 585 316V344H563Z"/>
            </g>
          </mask>
          <linearGradient id={id+'-remanço'} x1="0" y1="0" x2=".18" y2="1">
            <stop stopColor="#324f4e" stopOpacity=".5"/><stop offset=".6" stopColor="#42625b" stopOpacity=".20"/><stop offset="1" stopColor="#638077" stopOpacity="0"/>
          </linearGradient>
          <linearGradient id={id+'-reflexo-solar'}>
            <stop stopColor="#f5e1ad" stopOpacity="0"/><stop offset=".47" stopColor="#fff0c9" stopOpacity=".60"/><stop offset="1" stopColor="#ebe4b6" stopOpacity=".06"/>
          </linearGradient>
        </defs>
        <Margens prefixo={id} inicial={inicio.abertura} ref={margens}/>
        <g clipPath={`url(#${id}-agua)`}>
          <rect width="1000" height="340" fill={`url(#${id}-cor)`}/>
          <g ref={reflexos} fill={`url(#${id}-remanço)`}>
            <path d="M-20 278Q131 228 234 231T514 211Q477 230 408 234Q356 244 280 241Q221 250 158 252Q52 273-20 309Z"/>
            <path d="M567 188Q647 177 716 178T888 153Q845 171 805 174Q734 191 665 189Q617 196 572 195Z"/>
          </g>
          <g fill={`url(#${id}-reflexo-solar)`} opacity=".65">
            <path d="M-12 321c98-44 141-52 240-68-72 14-139 39-178 51zM310 262c89-13 122-10 199-31-39 17-100 26-199 31Z"/>
            <path d="M573 218q50-24 128-22-43 7-128 22ZM727 188q65-16 122-20-64 10-122 20Z"/>
          </g>
          <g fill="none" stroke="#f3e6c0" strokeWidth=".72" opacity=".58" strokeLinecap="round">
            {trilhasDeBrilho.map((d, i) => <path key={d} d={d}
              strokeDasharray={i % 2 ? '4 3 1 6' : '7 4 1 3'} data-ciclo={i % 2 ? 14 : 15}/>)}
          </g>
          <g fill="none" strokeLinecap="round">
            {correntes.map((d,i) => <g key={d}>
              <path d={d} stroke="#365e53" opacity=".075" strokeWidth={1.2+i*.24} strokeDasharray="107 13 41 27" data-ciclo="188"/>
              <path d={d} transform="translate(0 2.2)" stroke="#f3eac6" opacity=".31" strokeWidth=".68" strokeDasharray="6 23 19 80 2 13" data-ciclo="143"/>
              <path d={d} transform="translate(0 5.3)" stroke="#fff4d4" opacity=".33" strokeWidth=".9" strokeDasharray="1.5 85.5 3 69" data-ciclo="159"/>
            </g>)}
            <g ref={espuma} opacity={inicio.espuma} stroke="#fff5d4">
              {pilares.map(([x,y]) => <g key={x} transform={`translate(${x} ${y+12})`}>
                <path d="M11-3Q20 2 5 5T-30 10M9 6Q0 11-27 13" strokeWidth="1.5" strokeDasharray="10 3 2 5" data-ciclo="20"/>
              </g>)}
              <path d="M566 306q-5 2-12 1m11 3q-4 1-9 1" strokeWidth="1" strokeDasharray="6 2 1 3" data-ciclo="12"/>
            </g>
            <g stroke="#374f4a" opacity=".21" strokeWidth="1.75" strokeDasharray="8 2 3 3" data-ciclo="16">
              <path d="M228 254q57 6 114 16t114 24 101 19M340 267q5 3 2 9m112 12q6 5 3 10"/>
            </g>
          </g>
          <g transform="translate(600 233) rotate(-7)">
            <g ref={ilha}>
              <path d="M-43 3Q-27-2-10-4T27-7Q48-11 65-7 49-1 27 1T-25 5Z" fill="#d1bb88"/>
              <path d="M-37 2Q-12-7 8-6T55-7Q33 1 10 1Z" fill="#85946d"/>
            </g>
            <g ref={vegetacaoDaIlha}>
              <image href={base+'/ilha.svg'} x="-43" y="-29" width="108" height="36"/>
            </g>
          </g>
        </g>
        <g mask={`url(#${id}-apoios)`}>
          {pilares.map(([x,y,s]) => <g key={x} transform={`translate(${x} ${y}) scale(${s})`}>
            <path d="M-5 0l9 1 1 15-11-1Z" fill="#a1977b"/>
            <path d="M4 1l5-3 1 15-5 3Z" fill="#777661"/>
            <path d="M-5 7l9 1m-9 3 9 1" fill="none" stroke="#c0b59a" strokeWidth=".7"/>
          </g>)}
        </g>
        <g data-encontro-ponte="">
          <g mask={`url(#${id}-apoios)`}>
            <path d="M564.8 304.0 571.7 305.4 575.3 303.6 575.6 318.3 569.1 320.2 564.4 317.8Z" fill="#a1967c"/>
            <path d="M571.7 305.4l3.6-1.8.3 14.7-6.5 1.9Z" fill="#777e6c"/>
            <path d="M565 309l6.4 1.7 3.8-2m-10.4 4.3 6 1.6 4.3-2.2m-10.4 4.1 5.7 1.7 5-2.1" fill="none" stroke="#716e60" strokeWidth=".55"/>
          </g>
          <path d="M564.8 304l2.8-4 7.1 1 1 2.5-4 1.9Z" fill="#c3b79a"/>
        </g>
      </svg>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img className="rio-arte" src={base+'/ponte.svg'} width="1000" height="340" alt="" decoding="async"/>
     </div>
      {!faixa && <div className="rio-sem-leitura"><Waves size={16} aria-hidden="true"/>{motivoSemFaixa}</div>}
      {faixa && !reduzido && <button type="button" className="rio-pausa" onClick={() => setPausa(valor => !valor)} aria-label={pausa ? 'Reproduzir animação do rio' : 'Pausar animação do rio'}>
        {pausa ? <Play size={15} aria-hidden="true"/> : <Pause size={15} aria-hidden="true"/>}
      </button>}
    </div>
    <figcaption>
      <strong>Ilustração de Além Paraíba</strong>
      {faixa && <span className="rio-etapa">{explicacaoDaCena[faixa]}</span>}
      <small>Cenário esquemático. A altura da água e as ruas atingidas exigem medições e modelagem locais.</small>
    </figcaption>
  </figure>;
});
