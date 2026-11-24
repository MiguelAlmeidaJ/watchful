import { Shield, CloudRain, Map, Bell } from 'lucide-react';
export default function Home() {
  return <main className="mx-auto max-w-6xl p-8">
    <header className="flex items-center gap-3"><Shield className="text-teal-700"/><h1 className="text-2xl font-semibold">Watchful</h1></header>
    <section className="mt-12"><p className="text-sm text-teal-800">CENTRAL DE MONITORAMENTO</p><h2 className="mt-2 text-4xl font-semibold">Inteligência territorial</h2><p className="mt-3 text-slate-600">Ambiente em construção. Dados reais ainda não conectados.</p></section>
    <div className="mt-8 grid gap-4 md:grid-cols-3">{[{name:'Meteorologia',Icon:CloudRain},{name:'Mapa de riscos',Icon:Map},{name:'Alertas',Icon:Bell}].map(({name,Icon})=><article key={name} className="rounded-xl border border-slate-200 bg-white p-6"><Icon className="text-teal-700"/><h3 className="mt-4 font-medium">{name}</h3><p className="mt-2 text-sm text-slate-500">Dados indisponíveis</p></article>)}</div>
  </main>;
}
