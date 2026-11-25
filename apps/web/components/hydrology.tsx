'use client';
import { useEffect, useState } from 'react';
import { query, type Client } from '@watchful/api-client';
import { Panel, State } from './ui/panel';
import { AnaTelemetry } from './ana-telemetry';

type Summary = { municipality: { main_river: string | null; main_river_source: string | null } };

export function Hydrology({ api, city, platform, revision, refresh }: {
 api: Client; city: string; platform: boolean; revision: number; refresh: () => void;
}) {
 const [name, setName] = useState('');
 const [source, setSource] = useState('');
 const [loading, setLoading] = useState(true);
 const [busy, setBusy] = useState(false);
 const [error, setError] = useState('');

 useEffect(() => {
  let active = true;
  setLoading(true);
  setError('');
  api.request<Summary>('/hydrology/summary'+query({municipalityId:city})).then(({ municipality }) => {
   if (!active) return;
   setName(municipality.main_river ?? '');
   setSource(municipality.main_river_source ?? '');
  }).catch(e => { if (active) setError(e instanceof Error ? e.message : 'Falha ao consultar o rio principal.'); })
   .finally(() => { if (active) setLoading(false); });
  return () => { active = false; };
 }, [api, city, revision]);

 return <div className="sources-layout">
  <Panel title="Rio principal do painel público">
   <State loading={loading} error={error}/>
   {platform ? <form className="grid gap-3" onSubmit={async event => {
    event.preventDefault();
    setBusy(true);
    setError('');
    try {
     await api.request('/hydrology/main-river','POST',{municipalityId:city,name,source});
     refresh();
    } catch (e) {
     setError(e instanceof Error ? e.message : 'Falha ao salvar o rio principal.');
    } finally { setBusy(false); }
   }}>
    <label>Nome do rio<input className="field" required value={name} onChange={e=>setName(e.target.value)}/></label>
    <label>Referência da identificação<input className="field" required value={source} onChange={e=>setSource(e.target.value)}/></label>
    <button className="btn" disabled={busy || loading}>{busy ? 'Salvando…' : 'Salvar rio principal'}</button>
   </form> : !loading && <p>{name || 'Rio principal ainda não cadastrado.'}</p>}
  </Panel>
  <AnaTelemetry {...{api,city,platform,revision,refresh}}/>
 </div>;
}
