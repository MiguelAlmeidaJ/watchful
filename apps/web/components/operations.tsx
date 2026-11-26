'use client';
import { useEffect,useMemo,useState,type FormEvent,type ReactNode } from 'react';
import dynamic from 'next/dynamic';
import {ShieldCheck,LayoutDashboard,Droplets,Activity,Building2,MapPin,Globe2,Users,History,LogOut,RefreshCw,Menu,X,ArrowUpRight,ChevronRight,Info,Sun,Moon} from 'lucide-react';
import {createClient,formatDate,type Client,type Organization,type Municipality,type Profile,type Row} from '@watchful/api-client';
import { browserApiBase } from '../lib/browser-api';
import { Button } from './ui/button';
import { Panel,State } from './ui/panel';
import { Municipalities } from './municipalities';
import { Toaster,toast } from 'sonner';
const FlowCompositions=dynamic(()=>import('./flow-compositions').then(m=>m.FlowCompositions));
const Hydrology=dynamic(()=>import('./hydrology').then(m=>m.Hydrology));
const DataSources=dynamic(()=>import('./data-sources').then(m=>m.DataSources));

const pages=[
 ['overview','Visão geral',LayoutDashboard],
 ['hydrology','Telemetria ANA',Droplets],
 ['flow-compositions','Composições de vazão',Activity],
 ['sources','Fontes de dados',Globe2],
 ['organizations','Organizações',Building2],
 ['municipalities','Municípios',MapPin],
 ['users','Usuários',Users],
 ['audit','Auditoria',History],
] as const;
type Page=typeof pages[number][0];
type AccountPage='users'|'audit';
function useLoad<T>(load:()=>Promise<T>,deps:unknown[],enabled=true){
 const [data,setData]=useState<T|null>(null),[error,setError]=useState(''),[loading,setLoading]=useState(false);
 useEffect(()=>{let live=true;setData(null);setError('');setLoading(enabled);if(enabled)load().then(v=>{if(live)setData(v);}).catch(e=>{if(live)setError(e instanceof Error?e.message:'Falha de comunicação');}).finally(()=>{if(live)setLoading(false);});return()=>{live=false;};},deps);return {data,error,loading};
}
function Select({value,onChange,options,placeholder}:{value:string;onChange:(v:string)=>void;options:{id:string;name:string}[];placeholder:string}){return <select aria-label={placeholder} className="field" value={value} onChange={e=>onChange(e.target.value)}><option value="">{placeholder}</option>{options.map(o=><option key={o.id} value={o.id}>{o.name}</option>)}</select>;}
function Table({rows,columns}:{rows:Row[];columns:{key:string;title:string;format?:(v:unknown)=>string}[]}){return rows.length?<div className="table-wrap"><table className="w-full text-left text-sm"><thead className="text-slate-500">{<tr>{columns.map(c=><th key={c.key} className="p-3">{c.title}</th>)}</tr>}</thead><tbody>{rows.map((r,i)=><tr key={String(r.id??i)} className="border-t border-slate-200">{columns.map(c=><td key={c.key} className="p-3 align-top">{c.format?c.format(r[c.key]):typeof r[c.key]==='object'?JSON.stringify(r[c.key]):String(r[c.key]??'—')}</td>)}</tr>)}</tbody></table></div>:<State empty/>;}
const col=(key:string,title:string,format?:(v:unknown)=>string)=>({key,title,format});
function Login({api,onLogin}:{api:Client;onLogin:(p:Profile)=>void}){const [error,setError]=useState(''),[busy,setBusy]=useState(false);async function submit(e:FormEvent<HTMLFormElement>){e.preventDefault();const d=new FormData(e.currentTarget);setBusy(true);setError('');try{await api.login(String(d.get('email')),String(d.get('password')));onLogin(await api.request<Profile>('/auth/me'));}catch(e){setError(e instanceof Error?e.message:'Falha de acesso');}finally{setBusy(false);}}return <main className="login-layout"><section className="login-visual"><div className="brand-lockup"><span className="brand-mark"><ShieldCheck size={25}/></span><span>Vem Chuva <span className="brand-accent">Aí?</span></span></div><div className="login-copy"><p className="eyebrow">INTELIGÊNCIA TERRITORIAL</p><h1>Antecipe.<br/>Monitore.<br/><span>Proteja.</span></h1><p>Uma central para compreender o território, acompanhar as condições meteorológicas e apoiar decisões operacionais.</p></div><div className="radar-art" aria-hidden="true"><i/><i/><i/><i/><span/><b/></div><div className="login-footer"><Activity size={17}/> Monitoramento integrado <span>•</span> Ambiente de validação</div></section><section className="login-form-side"><form onSubmit={submit} className="login-form"><div className="mobile-brand"><ShieldCheck/> Vem Chuva Aí</div><p className="eyebrow">ACESSO À PLATAFORMA</p><h2>Bem-vindo de volta.</h2><p className="text-slate-500 mb-7">Entre com sua conta para acessar a central de operações.</p><label className="block mb-4">E-mail<input className="field mt-2" name="email" type="email" placeholder="Seu e-mail" autoComplete="username" required/></label><label className="block mb-5">Senha<input className="field mt-2" name="password" type="password" placeholder="Sua senha" autoComplete="current-password" required/></label><State error={error}/><button disabled={busy} className="btn w-full flex justify-between items-center">{busy?'Entrando…':'Acessar plataforma'}<ArrowUpRight size={18}/></button><p className="login-note"><Info size={17}/> Acesso restrito. Consulte os canais oficiais em caso de emergência.</p></form></section></main>;}

export function Operations(){
 const [profile,setProfile]=useState<Profile|null>(null),[page,setPage]=useState<Page>('overview'),[org,setOrg]=useState(''),[city,setCity]=useState(''),[revision,setRevision]=useState(0),[menu,setMenu]=useState(false);
 const [theme,setTheme]=useState<'light'|'dark'>('light');
 useEffect(()=>{if(!menu)return;const close=(e:KeyboardEvent)=>{if(e.key==='Escape')setMenu(false);};window.addEventListener('keydown',close);return()=>window.removeEventListener('keydown',close);},[menu]);
 useEffect(()=>{let saved:string|null=null;try{saved=localStorage.getItem('watchful-theme');}catch{}setTheme(saved==='dark'?'dark':'light');},[]);
 useEffect(()=>{document.documentElement.dataset.theme=theme;},[theme]);
 const toggleTheme=()=>{const next=theme==='dark'?'light':'dark';setTheme(next);try{localStorage.setItem('watchful-theme',next);}catch{}};
 const api=useMemo(()=>createClient(browserApiBase,()=>{setProfile(null);setOrg('');setCity('');}),[]);
 const organizations=useLoad(()=>api.request<Organization[]>('/organizations'),[profile,revision],!!profile);
 const cities=useLoad(()=>api.request<Municipality[]>('/organizations/'+org+'/municipalities'),[profile,org,revision],!!profile&&!!org);
 useEffect(()=>{if(organizations.data?.length===1&&!org)setOrg(organizations.data[0]!.id);},[organizations.data,org]);
 useEffect(()=>{if(cities.data?.length===1&&!city)setCity(cities.data[0]!.id);},[cities.data,city]);
 const selected=organizations.data?.find(o=>o.id===org),admin=!!profile?.platformAdmin||selected?.role==='admin';
 const nav=pages.filter(p=>!['users','audit','municipalities'].includes(p[0])||admin);
 const refresh=()=>setRevision(x=>x+1);
 if(!profile)return <><button className="login-theme icon-button" aria-label="Alternar tema" onClick={toggleTheme}>{theme==='dark'?<Sun size={18}/>:<Moon size={18}/>}</button><Login api={api} onLogin={p=>{setProfile(p);setPage('overview');}}/></>;
 const groups=[{title:'Monitoramento',keys:['overview','hydrology','flow-compositions','sources']},{title:'Administração',keys:['organizations','municipalities','users','audit']}];
 const title=pages.find(p=>p[0]===page)?.[1];
 return <><Toaster theme={theme} position="bottom-right" richColors/><div className="app-shell">{menu&&<button className="mobile-overlay" aria-label="Fechar navegação" onClick={()=>setMenu(false)}/>}<aside className={'sidebar '+(menu?'sidebar-open':'')}><div className="brand-lockup"><span className="brand-mark"><ShieldCheck size={23}/></span><span>Vem Chuva <span className="brand-accent">Aí?</span></span><button className="sidebar-close" aria-label="Fechar menu" onClick={()=>setMenu(false)}><X/></button></div><div className="sidebar-caption">CENTRAL DE OPERAÇÕES</div><nav aria-label="Navegação principal">{groups.map(g=>{const entries=nav.filter(p=>g.keys.includes(p[0]));return entries.length?<div className="nav-group" key={g.title}><p>{g.title}</p>{entries.map(([key,name,Icon])=><button key={key} aria-current={page===key?'page':undefined} onClick={()=>{setPage(key);setMenu(false);}} className={'nav-link '+(page===key?'nav-active':'')}><Icon size={18}/><span>{name}</span>{page===key&&<ChevronRight size={14}/>}</button>)}</div>:null;})}</nav><div className="sidebar-bottom"><div className="sidebar-account"><span className="sidebar-avatar">{profile.email.slice(0,2).toUpperCase()}</span><div><strong>{profile.email.split('@')[0]}</strong><small>{profile.platformAdmin?'Administrador da plataforma':selected?.role==='admin'?'Administrador':selected?.role==='operator'?'Operador':'Usuário'}</small></div></div><div className="sidebar-environment"><span className="environment-dot"/> Ambiente interno</div></div></aside><main className="main-workspace"><header className="topbar"><div className="breadcrumb"><button aria-label="Abrir menu" className="mobile-menu icon-button" aria-expanded={menu} onClick={()=>setMenu(true)}><Menu size={21}/></button><span className="hidden sm:inline">Workspace</span><ChevronRight size={14}/><strong>{title}</strong></div><div className="top-actions"><Button variant="ghost" size="icon" aria-label="Alternar tema" onClick={toggleTheme}>{theme==='dark'?<Sun size={18}/>:<Moon size={18}/>}</Button><button className="icon-button" onClick={refresh} aria-label="Atualizar dados"><RefreshCw size={18}/></button><div className="avatar" title={profile.email}>{profile.email.slice(0,2).toUpperCase()}</div><button className="icon-button" onClick={()=>{void api.logout();setProfile(null);setOrg('');setCity('');}} aria-label="Sair"><LogOut size={18}/></button></div></header><div className="workspace-content"><div className="page-intro"><div><p className="eyebrow">Vem Chuva Aí / OPERAÇÕES</p><h1>{title}</h1><p>{page==='overview'?'Acompanhe as condições do território e os dados disponíveis.':'Gerencie e acompanhe as informações do seu território.'}</p></div><div className="territory-picker"><div><span>Organização</span><Select value={org} onChange={v=>{setOrg(v);setCity('');setPage('overview');}} options={organizations.data??[]} placeholder="Selecionar organização"/></div><div><span>Município</span><Select value={city} onChange={setCity} options={(cities.data??[]).map(c=>({...c,name:c.name+' — '+c.state}))} placeholder="Selecionar município"/></div></div></div><div className="validation-banner"><Info size={18}/><span><strong>Ambiente em validação.</strong> Ausência de dados ou alertas não significa ausência de risco.</span></div><State loading={organizations.loading||cities.loading} error={organizations.error||cities.error}/><Workspace key={profile.id+':'+org+':'+city+':'+page} {...{api,page,org,city,revision,refresh}} navigate={setPage} onSelectCity={setCity} platform={profile.platformAdmin} organizations={organizations.data??[]} cities={cities.data??[]}/></div></main></div></>;
}
function Workspace({api,page,org,city,revision,refresh,platform,organizations,cities,navigate,onSelectCity}:{api:Client;page:Page;org:string;city:string;revision:number;refresh:()=>void;platform:boolean;organizations:Organization[];cities:Municipality[];navigate:(p:Page)=>void;onSelectCity:(id:string)=>void}){
 if(page==='organizations')return <Panel title="Organizações cadastradas"><Table rows={organizations as unknown as Row[]} columns={[col('name','Nome'),col('role','Perfil')]}/>{platform&&<ActionForm title="Nova organização" fields={[['name','Nome']]} onSend={v=>api.request('/organizations','POST',v)} refresh={refresh}/>}</Panel>;
 if(!org)return <div className="onboarding-grid"><section className="welcome-card"><div className="welcome-content"><span className="eyebrow">COMEÇAR MONITORAMENTO</span><h2>Seu território, em foco.</h2><p>{organizations.length?'Selecione uma organização no cabeçalho para visualizar os municípios e iniciar o acompanhamento.':'Nenhuma organização disponível para esta conta. Configure o primeiro território para iniciar o monitoramento.'}</p>{platform&&<button className="btn" onClick={()=>navigate('organizations')}>Gerenciar organizações <ArrowUpRight size={16}/></button>}</div><div className="welcome-radar" aria-hidden="true"><i/><i/><i/><MapPin size={35}/></div></section><section className="panel setup-panel"><h2 className="panel-heading">Primeiros passos</h2>{[{n:'Organização',d:'Crie ou selecione uma organização.',ok:organizations.length>0},{n:'Território',d:'Vincule um município autorizado.',ok:false},{n:'Monitoramento',d:'Cadastre a telemetria e a composição de vazão.',ok:false}].map((s,i)=><div className="setup-step" key={s.n}><span>{s.ok?'✓':String(i+1).padStart(2,'0')}</span><div><strong>{s.n}</strong><p>{s.d}</p></div></div>)}</section></div>;
 if(page==='users'||page==='audit')return <AccountSettings {...{api,page,org,revision,refresh,platform}}/>;
 if(page==='municipalities')return <Municipalities api={api} org={org} linked={cities} platform={platform} revision={revision} refresh={refresh} onSelect={onSelectCity}/>;
 if(!city)return <div className="welcome-empty"><span className="welcome-icon"><MapPin size={34}/></span><h2>Qual território vamos acompanhar?</h2><p>{cities.length?'Selecione um município no cabeçalho para carregar os dados.':'Nenhum município disponível nesta organização. Vincule um território para continuar.'}</p>{platform&&<button className="btn" onClick={()=>navigate('municipalities')}>Configurar município <ArrowUpRight size={16}/></button>}</div>;
 if(page==='flow-compositions')return <FlowCompositions {...{api,city,platform,revision,refresh}}/>;
 if(page==='hydrology')return <Hydrology {...{api,city,platform,revision,refresh}}/>;
 if(page==='sources')return <DataSources {...{api,city,platform,revision,refresh}}/>;
 return <Panel title="Configuração do monitoramento">
  <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
   <button type="button" className="btn-secondary" onClick={()=>navigate('hydrology')}>Consultar telemetria ANA</button>
   <button type="button" className="btn-secondary" onClick={()=>navigate('flow-compositions')}>Configurar vazão pública</button>
   <button type="button" className="btn-secondary" onClick={()=>navigate('sources')}>Configurar fontes de dados</button>
  </div>
  <a href="/" className="admin-return">Abrir painel público <ArrowUpRight size={16}/></a>
 </Panel>;
}
function ActionForm({title,fields,onSend,refresh}:{title:string;fields:[string,string,string?][];onSend:(v:Record<string,string>)=>Promise<unknown>;refresh:()=>void}){
 const [busy,setBusy]=useState(false),[status,setStatus]=useState(''),[error,setError]=useState('');
 async function submit(e:FormEvent<HTMLFormElement>){e.preventDefault();const form=e.currentTarget,v=Object.fromEntries(new FormData(form)) as Record<string,string>;setBusy(true);setError('');setStatus('');try{await onSend(v);form.reset();setStatus('Operação registrada.');toast.success('Operação registrada');refresh();}catch(e){setError(e instanceof Error?e.message:'Falha na operação');toast.error('Não foi possível salvar');}finally{setBusy(false);}}
 return <form className="mt-5 space-y-3 border-t border-slate-200 pt-4" onSubmit={submit}><h3 className="font-semibold">{title}</h3><div className="grid gap-3 md:grid-cols-2">{fields.map(([key,name,type])=><label key={key} className="text-sm">{name}{key==='role'?<select className="field mt-1" name={key} required><option value="">Selecione o perfil</option><option value="admin">Administrador</option><option value="operator">Operador</option><option value="viewer">Visualizador</option></select>:<input className="field mt-1" name={key} type={type??'text'} autoComplete={type==='password'?'new-password':type==='email'?'off':undefined} required/>}</label>)}</div><button disabled={busy} className="btn">{busy?'Salvando…':'Salvar'}</button><State error={error}/>{status&&<p role="status">{status}</p>}</form>;
}
function AccountSettings({api,page,org,revision,refresh,platform}:{api:Client;page:AccountPage;org:string;revision:number;refresh:()=>void;platform:boolean}){
 const result=useLoad(()=>api.request<Row[]>('/organizations/'+org+'/'+page),[org,revision,page]);
 const users=page==='users';
 const columns=users
  ? [col('email','E-mail'),col('role','Perfil'),col('active','Ativo')]
  : [col('created_at','Data',formatDate),col('action','Ação'),col('target','Objeto')];
 return <Panel title={users?'Usuários':'Auditoria'}>
  <State {...result}/>
  {result.data&&<Table rows={result.data} columns={columns}/>}
  {users&&platform&&<ActionForm
   title="Novo usuário"
   fields={[['email','E-mail','email'],['password','Senha','password'],['role','Perfil de acesso']]}
   onSend={values=>api.request('/organizations/'+org+'/users','POST',values)}
   refresh={refresh}
  />}
 </Panel>;
}
