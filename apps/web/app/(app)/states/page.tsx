import { redirect } from 'next/navigation';

/** State rules moved to Market activation (docs/markets.md). */
export default function StatesPage() {
  redirect('/markets');
}
