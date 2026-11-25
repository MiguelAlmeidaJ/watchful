'use client';
import {useEffect,useState} from 'react';
import {Map,Globe2,CheckCircle2,Download} from 'lucide-react';
import {formatDate,type Client} from '@watchful/api-client';
import {Panel,State} from './ui/panel';
import {WeatherSetup} from './weather-setup';
import {toast} from 'sonner';
type Extent={bbox:number[]|null;boundary_source?:string;boundary_updated_at?:string;boundary_version?:string};
export function DataSources({api,city,platform,revision,refresh}:{api:Client;city:string;platform:boolean;revision:number;refresh:()=>void}){
 const [extent,setExtent]=useState<Extent|null>(null),[loading,setLoading]=useState(true),[busy,setBusy]=useState(false),[error,setError]=useState('');
 useEffect(()=>{let live=true;setLoading(true);setError('');api.request<Extent>('/geo/municipalities/'+city+'/extent').then(v=>{if(live)setExtent(v);}).catch(e=>{if(live)setError(e instanceof Error?e.message:'Falha de consulta');}).finally(()=>{if(live)setLoading(false);});return()=>{live=false;};},[api,city,revision]);
 async function importBoundary(){if(extent?.bbox&&!window.confirm('Atualizar o limite municipal com a malha simplificada do IBGE?'))return;setBusy(true);setError('');try{await api.request('/geo/municipalities/'+city+'/boundary/ibge','POST');toast.success('Malha territorial importada');refresh();}catch(e){setError(e instanceof Error?e.message:'Falha na importação');}finally{setBusy(false);}}
 return <div className="sources-layout"><div className="source-intro"><Globe2 size={28}/><div><h2>Integrações públicas e abertas</h2><p>Sem assinaturas obrigatórias. Cada fonte possui condições de uso e disponibilidade próprias.</p></div></div><Panel title="Configuração territorial"><State loading={loading} error={error}/><div className="source-row"><span className="metric-icon"><Map size={20}/></span><div className="source-description"><h3>IBGE</h3><p>Malha municipal oficial, simplificada para visualização.</p><span className="source-status">{extent?.bbox?<><CheckCircle2 size={14}/> Limite cadastrado · {extent.boundary_source??'Fonte não informada'} · {formatDate(extent.boundary_updated_at)}</>:'Limite ainda não cadastrado'}</span></div>{platform&&<button disabled={busy||loading} className="btn source-action" onClick={()=>void importBoundary()}><Download size={16}/>{busy?'Importando…':extent?.bbox?'Atualizar malha':'Importar malha'}</button>}</div></Panel><WeatherSetup {...{api,city,platform,revision,refresh}}/><p className="chart-caption">Nenhum serviço é habilitado para emitir alertas automaticamente. Dados de fontes gratuitas não possuem garantia operacional de emergência.</p></div>;
}
