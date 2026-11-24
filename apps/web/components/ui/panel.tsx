import type { ReactNode } from 'react';
import { Inbox } from 'lucide-react';
export function Panel({title,children}:{title:string;children:ReactNode}){return <section className="panel"><h2 className="panel-heading">{title}</h2>{children}</section>;}
export function State({loading,error,empty=false}:{loading?:boolean;error?:string;empty?:boolean}){return loading?<div role="status" className="skeleton-stack"><span className="sr-only">Carregando informações</span><i/><i/><i/></div>:error?<p role="alert" className="state-error">Não foi possível carregar: {error}</p>:empty?<p className="empty-state"><Inbox size={23}/>Nenhum registro disponível no recorte consultado.</p>:null;}
