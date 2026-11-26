import './globals.css';
import type { ReactNode } from 'react';
export const metadata = { title: 'Vem Chuva Aí', description: 'Monitoramento e inteligência territorial' };
export default function Layout({children}: {children: ReactNode}) { return <html lang="pt-BR"><body>{children}</body></html>; }
