import { useImperativeHandle, useRef, useState, type Ref } from 'react';
import { fachadasDaOrla, mascaraDasFachadas, transbordamento } from './paisagem';

export type MargensHandle = { atualizar(abertura: number, umidade: number): void };
// Traçado da estrada baixa no SVG do vale, a partir do encontro da ponte.
const estradaBaixa = 'M571 303C589 298 605.83 297 628 294S678.33 287.67 704 285S754 285.5 782 278S842.67 249.83 872 240';

export function Margens({ prefixo, inicial, ref }: {
  prefixo: string;
  inicial: number;
  ref: Ref<MargensHandle>;
}) {
  const aguaUrbana = useRef<SVGPathElement>(null);
  const aguaVarzea = useRef<SVGPathElement>(null);
  const bordaUrbana = useRef<SVGPathElement>(null);
  const bordaVarzea = useRef<SVGPathElement>(null);
  const urbano = useRef<SVGGElement>(null);
  const varzea = useRef<SVGGElement>(null);
  const estruturas = useRef<SVGGElement>(null);
  const mascara = useRef<SVGPathElement>(null);
  const contato = useRef<SVGGElement>(null);
  const estrada = useRef<SVGGElement>(null);
  const rastro = useRef<SVGPathElement>(null);
  const estado = useRef(transbordamento(inicial)).current;
  const [fachadasAtivas, setFachadasAtivas] = useState(estado.fachadas > 0);
  const solicitouFachadas = useRef(fachadasAtivas);

  useImperativeHandle(ref, () => ({
    atualizar(abertura, umidade) {
      const v = transbordamento(abertura);
      aguaUrbana.current?.setAttribute('d', v.aguaUrbana);
      aguaVarzea.current?.setAttribute('d', v.aguaVarzea);
      bordaUrbana.current?.setAttribute('d', v.bordaUrbana);
      bordaVarzea.current?.setAttribute('d', v.bordaVarzea);
      urbano.current?.setAttribute('opacity', String(v.urbano));
      varzea.current?.setAttribute('opacity', String(v.varzea));
      contato.current?.setAttribute('opacity', String(v.contato));
      estruturas.current?.setAttribute('opacity', String(v.fachadas));
      mascara.current?.setAttribute('d', mascaraDasFachadas(abertura));
      if (v.fachadas > 0 && !solicitouFachadas.current) {
        solicitouFachadas.current = true;
        setFachadasAtivas(true);
      }
      estrada.current?.setAttribute('stroke-dashoffset', String(1 - v.estrada));
      estrada.current?.setAttribute('opacity', String(v.estrada));
      const recuo = Math.max(0, umidade - abertura);
      if (recuo > 0) {
        const marcas = transbordamento(umidade);
        rastro.current?.setAttribute('d', marcas.aguaUrbana + marcas.aguaVarzea);
      }
      rastro.current?.setAttribute('opacity', String(Math.min(.23, recuo * .7)));
    },
  }), []);

  return <g data-margens-rio="">
    <defs>
      <clipPath id={prefixo+'-ruas'}><path ref={aguaUrbana} d={estado.aguaUrbana}/></clipPath>
      <clipPath id={prefixo+'-varzea'}><path ref={aguaVarzea} d={estado.aguaVarzea}/></clipPath>
      <linearGradient id={prefixo+'-agua-rasa'} x1="0" y1="0" x2=".2" y2="1">
        <stop stopColor="#d0c0a0" stopOpacity=".5"/>
        <stop offset=".46" stopColor="#a79979" stopOpacity=".79"/>
        <stop offset="1" stopColor="#8c795d" stopOpacity=".96"/>
      </linearGradient>
      <linearGradient id={prefixo+'-agua-varzea'} x1="0" y1="1" x2=".2" y2="0">
        <stop stopColor="#c1b38b" stopOpacity=".56"/>
        <stop offset="1" stopColor="#8d8162" stopOpacity=".95"/>
      </linearGradient>
      <linearGradient id={prefixo+'-agua-na-estrada'}>
        <stop stopColor="#978966" stopOpacity=".9"/>
        <stop offset=".7" stopColor="#ac9f7a" stopOpacity=".85"/>
        <stop offset="1" stopColor="#bcae87" stopOpacity="0"/>
      </linearGradient>
      <mask id={prefixo+'-fachadas'} maskUnits="userSpaceOnUse" x="0" y="0" width="1000" height="340">
        <rect width="1000" height="340" fill="white"/>
        <path ref={mascara} d={mascaraDasFachadas(inicial)}/>
      </mask>
      <path id={prefixo+'-frente-urbana'} ref={bordaUrbana} d={estado.bordaUrbana}/>
      <path id={prefixo+'-frente-varzea'} ref={bordaVarzea} d={estado.bordaVarzea}/>
    </defs>
    <path ref={rastro} fill="#59523e" opacity="0"/>
    <g ref={urbano} opacity={estado.urbano} data-agua-urbana="">
      <use href={'#'+prefixo+'-frente-urbana'} fill="none" stroke="#635642" opacity=".14" strokeWidth=".8"/>
      <g clipPath={`url(#${prefixo}-ruas)`}>
        <rect x="-24" y="182" width="560" height="143" fill={`url(#${prefixo}-cor)`}/>
        <rect x="-24" y="182" width="560" height="143" fill={`url(#${prefixo}-agua-rasa)`} opacity=".23"/>
        <use href={'#'+prefixo+'-frente-urbana'} fill="none" stroke="#f8e5ba" opacity=".34" strokeWidth=".55"/>
        <g fill="none" stroke="#f5e1bd" strokeLinecap="round">
          <path d="M-5 240Q65 223 112 232T214 223M129 239Q204 228 250 225T354 222M242 214Q292 222 325 214T456 209" strokeWidth=".72" opacity=".35" strokeDasharray="13 7 2 8" data-ciclo="30"/>
          <path d="M18 252Q106 241 132 239T251 236M196 231Q253 234 309 228T455 219" strokeWidth=".76" opacity=".32" strokeDasharray="19 15 4 22" data-ciclo="60"/>
        </g>
      </g>
    </g>
    <g ref={varzea} opacity={estado.varzea} data-agua-varzea="">
      <use href={'#'+prefixo+'-frente-varzea'} fill="none" stroke="#625847" opacity=".13" strokeWidth=".85"/>
      <g clipPath={`url(#${prefixo}-varzea)`}>
        <rect x="485" y="190" width="334" height="151" fill={`url(#${prefixo}-cor)`}/>
        <rect x="485" y="190" width="334" height="151" fill={`url(#${prefixo}-agua-varzea)`} opacity=".19"/>
        <use href={'#'+prefixo+'-frente-varzea'} fill="none" stroke="#f7dfaf" opacity=".32" strokeWidth=".65"/>
        <path d="M510 300Q543 286 566 292Q581 299 610 294M587 306q25-15 61-17t78-4q31-4 62-23M654 278q39-2 75-13t55-26" fill="none" stroke="#f6dfae" strokeWidth=".86" strokeLinecap="round" opacity=".50" strokeDasharray="15 5 3 12" data-ciclo="35"/>
      </g>
    </g>
    <g ref={estrada} data-agua-estrada="" opacity={estado.estrada} strokeDasharray="1 1" strokeDashoffset={1 - estado.estrada} fill="none" strokeLinecap="round">
      <path d={estradaBaixa} pathLength="1" stroke={`url(#${prefixo}-agua-na-estrada)`} strokeWidth="5.4"/>
      <path d={estradaBaixa} transform="translate(0 .9)" pathLength="1" stroke={`url(#${prefixo}-agua-na-estrada)`} strokeWidth=".65"/>
    </g>
    <g ref={estruturas} opacity={estado.fachadas} mask={`url(#${prefixo}-fachadas)`}>
      {fachadasAtivas && fachadasDaOrla.map(({id}) => <use key={id} href={`/rios/alem-paraiba/vale.svg#${id}`}/>)}
    </g>
    <g ref={contato} opacity={estado.contato} fill="none" strokeLinecap="round">
      <path d="M241 215.3q5-.8 12 .4m-8 2.2 11 .4m13 1q9-1.1 19 .5m43-.4q12-.9 28-1.7" stroke="#f7e3bb" strokeWidth=".85" strokeDasharray="10 4 2 7" data-ciclo="23"/>
      <path d="M557 303q11-8 20-5m-21 9q13-7 18-5m-7 10q5 0 15-4m-8 7q9-1 14-4" stroke="#f4deae" strokeWidth="1.05" strokeDasharray="7 4 2 5" data-ciclo="18"/>
    </g>
  </g>;
}
