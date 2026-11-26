import type { Metadata } from 'next';
import { Operations } from '../../components/operations';
export const metadata: Metadata = {title:'Central de operações | Vem Chuva Aí',robots:{index:false,follow:false}};
export default function Admin(){return <Operations/>;}
