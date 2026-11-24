import './globals.css';
import type { ReactNode } from 'react';
export const metadata = { title: 'Watchful', description: 'Monitoramento e inteligência territorial' };
export default function Layout({children}: {children: ReactNode}) { return <html lang="pt-BR"><body>{children}</body></html>; }
