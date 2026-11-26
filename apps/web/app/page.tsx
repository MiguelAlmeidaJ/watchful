import Link from 'next/link';
import { ArrowUpRight, CloudRain } from 'lucide-react';
import { PublicMonitoring } from '../components/public-monitoring';
import { PublicSkipLink } from '../components/public-navigation';
import './public.css';

export default function Home() {
 return (
  <div className="public-site">
   <PublicSkipLink/>
   <header className="public-header">
    <div className="public-container public-nav">
     <a href="#monitoramento" className="public-brand"><CloudRain size={25} aria-hidden="true"/> Vem Chuva Aí</a>
     <nav aria-label="Navegação pública">
      <a href="#monitoramento">Monitoramento</a>
      <a href="#tempo">Tempo e avisos</a>
      <a href="#avisos">Avisos oficiais</a>
      <a href="#orientacoes">Orientações</a>
     </nav>
     <Link href="/admin" className="public-admin-link">Administração <ArrowUpRight size={16} aria-hidden="true"/></Link>
    </div>
   </header>
   <main id="conteudo"><PublicMonitoring/></main>
   <footer className="public-footer">
    <div className="public-container public-footer-inner">
     <a href="#monitoramento" className="public-brand"><CloudRain size={22} aria-hidden="true"/> Vem Chuva Aí</a>
     <p>Fontes de dados · ANA, INMET, Open-Meteo e IBGE</p>
     <Link href="/admin" className="public-admin-link">Administração <ArrowUpRight size={16} aria-hidden="true"/></Link>
    </div>
   </footer>
  </div>
 );
}
