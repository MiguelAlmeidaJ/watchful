'use client';

import { useSyncExternalStore } from 'react';

function subscribeToHash(onChange: () => void) {
 window.addEventListener('hashchange', onChange);
 return () => window.removeEventListener('hashchange', onChange);
}

export function usePublicAnchor() {
 return useSyncExternalStore(subscribeToHash, () => window.location.hash, () => '');
}

export function isWeatherAnchor(anchor: string) {
 return anchor === '#tempo' || anchor === '#avisos' || anchor === '#orientacoes';
}

export function PublicSkipLink() {
 const weather = isWeatherAnchor(usePublicAnchor());
 return <a className="public-skip" href={weather ? '#tempo' : '#monitoramento'}>Ir para o conteúdo</a>;
}
