// Coordenadas de desenho (1000 × 340). Os deslocamentos não têm escala hidráulica.
export const perfilVisual = {
  below_attention: { abertura: 0, velocidade: 0.7, duracao: 1550, agua: '#39736f', luz: '#afbfa3', espuma: 0.24 },
  attention:       { abertura: 0.32, velocidade: 1, duracao: 1750, agua: '#567b70', luz: '#bdc3a1', espuma: 0.39 },
  alert:           { abertura: 0.66, velocidade: 1.28, duracao: 2050, agua: '#728675', luz: '#c3b897', espuma: 0.58 },
  flood:           { abertura: 1, velocidade: 1.72, duracao: 2450, agua: '#776652', luz: '#b7a181', espuma: 0.78 },
} as const;
export type Faixa = keyof typeof perfilVisual;
export function faixaConhecida(valor?: string): valor is Faixa {
  return !!valor && Object.hasOwn(perfilVisual, valor);
}

export function contorno(abertura: number) {
  // O canal enche antes de a água avançar pelas áreas baixas do desenho.
  const a = abertura * .27;
  return [
    `M-30 ${289-37*a} C64 ${259-32*a} 132 ${247-26*a} 231 ${236-25*a}`,
    `S430 ${242-27*a} 521 ${213-20*a} C592 ${191-14*a} 519 ${199-12*a} 586 ${185-10*a}`,
    `S746 ${185-10*a} 844 ${161-6*a} Q924 ${146-4*a} 1030 ${146-3*a}`,
    `L1030 ${166+4*a} Q968 ${167+5*a} 928 ${179+7*a}`,
    `C891 ${195+9*a} 775 ${195+13*a} 752 ${213+14*a}`,
    `S777 ${242+21*a} 676 ${263+22*a} C558 ${285+29*a} 481 ${268+24*a} 349 ${297+28*a}`,
    `S124 ${362+32*a} -30 ${392+35*a} Z`,
  ].join(' ');
}

function avanco(abertura: number, inicio: number, fim: number) {
  const p = Math.min(1, Math.max(0, (abertura - inicio) / (fim - inicio)));
  return p * p * (3 - 2 * p);
}

export function transbordamento(a: number) {
  // Os primeiros pontos de extravasamento ficam no patamar da escada e no encontro da ponte.
  const cais = avanco(a, .18, .74);
  const oeste = avanco(a, .59, 1);
  const leste = avanco(a, .48, .97);
  const ponte = avanco(a, .35, .81);
  const varzea = avanco(a, .50, 1);
  const bordaUrbana = [
    `M-24 ${294-48*oeste} C39 ${273-29*oeste} 78 ${260-33*oeste} 117 ${250-19*oeste}`,
    `Q159 ${244-12*oeste} 190 ${241-15*cais} Q210 ${238-13*cais} 222 ${237-22*cais}`,
    `C230 ${236-25*cais} 246 ${237-23*cais} 263 ${235-16*cais} S295 ${237-15*leste} 313 ${236-16*leste}`,
    `C335 ${237-16*leste} 355 ${234-19*leste} 376 ${231-15*leste} S416 ${229-15*leste} 431 ${225-12*leste}`,
    `Q465 ${223-10*leste} 488 ${220-10*leste} T532 204`,
  ].join(' ');
  const bordaVarzea = [
    `M489 291 C516 ${286+18*ponte} 539 ${283+25*ponte} 557 ${282+23*ponte}`,
    `Q575 ${280+30*ponte} 595 ${278+28*ponte} T628 ${273+26*varzea}`,
    `C663 ${266+27*varzea} 681 ${262+29*varzea} 704 ${256+30*varzea}`,
    `Q732 ${250+33*varzea} 754 ${233+41*varzea} T782 ${222+47*varzea}`,
    `Q796 ${210+33*varzea} 815 207`,
  ].join(' ');
  return {
    bordaUrbana,
    aguaUrbana: bordaUrbana + 'L526 239C408 263 233 278 -24 319Z',
    bordaVarzea,
    aguaVarzea: bordaVarzea + 'L805 190C700 207 606 239 489 262Z',
    urbano: avanco(a, .24, .67),
    varzea: avanco(a, .34, .84),
    contato: avanco(a, .42, .85),
    fachadas: avanco(a, .40, .68),
    estrada: avanco(a, .49, 1),
  };
}

// Limites no desenho para que a água cubra os pés das fachadas e deixe os andares à vista.
export const fachadasDaOrla = [
  { id: 'orla-plataforma', x: 122, largura: 90, base: 231, declive: -8, profundidade: 4, inicio: 0.54 },
  { id: 'orla-oeste', x: 0, largura: 39, base: 262, declive: -12, profundidade: 7, inicio: 0.68 },
  { id: 'orla-azul', x: 59, largura: 25, base: 243, declive: -6, profundidade: 10, inicio: 0.58 },
  { id: 'orla-varandas', x: 82, largura: 30, base: 238, declive: -5, profundidade: 6, inicio: 0.64 },
  { id: 'orla-torre', x: 238, largura: 25, base: 222, declive: 0, profundidade: 9, inicio: 0.38 },
  { id: 'orla-cais', x: 268, largura: 32, base: 224, declive: 1, profundidade: 7, inicio: 0.41 },
  { id: 'orla-leste', x: 330, largura: 39, base: 224, declive: -1, profundidade: 6, inicio: 0.56 },
  { id: 'orla-curva', x: 423, largura: 30, base: 217, declive: -3, profundidade: 7, inicio: 0.61 },
];

export function mascaraDasFachadas(a: number) {
  return fachadasDaOrla.map(({ x, largura, base, declive, profundidade, inicio }) => {
    const y = base + 7 - (profundidade + 7) * avanco(a, inicio, 1);
    return `M${x} ${y}l${largura} ${declive}V340H${x}Z`;
  }).join(' ');
}

export const explicacaoDaCena: Record<Faixa, string> = {
  below_attention: 'A correnteza segue pelo canal e a orla permanece seca.',
  attention: 'A água alcança o cais e se aproxima do acesso baixo da ponte.',
  alert: 'A água começa a passar pelo acesso da ponte e alcança trechos da rua da orla.',
  flood: 'O extravasamento avança pelas duas margens e cobre parte da ilha.',
};

// Trilhas de corrente junto aos vãos da ponte e ao redor da ilha.
export const correntes = [
  'M-26 307C76 275 144 251 216 244Q247 239 272 245T340 247Q412 250 485 228',
  'M-18 339C99 297 181 274 280 266Q321 259 343 262T400 266Q471 267 531 247',
  'M300 293C374 275 424 284 454 279S507 279 549 264Q589 247 639 245T737 218',
  'M492 241Q547 226 569 206T630 191Q714 189 787 179T1009 151',
];
