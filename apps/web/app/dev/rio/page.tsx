import { notFound } from 'next/navigation';
import '../../public.css';

export default async function PaginaDeDesenvolvimento() {
  if (process.env.NODE_ENV !== 'development') notFound();
  const { classifyMunicipalFlow } = await import('../../../../api/src/modules/public/public-river');
  const { PreviaRio } = await import('./previa');
  const stage = classifyMunicipalFlow('3101508', 0, true)!;
  return <PreviaRio
    faixas={[...stage.thresholds]}
    abaixoDaAtencao={stage.current!}
    observadoEm={new Date(Date.now() - 1000).toISOString()}
  />;
}
