import { redirect } from 'next/navigation';
import { isConfigured } from '@/lib/config';
export default function Home() { redirect(isConfigured() ? '/workspaces' : '/preview'); }
