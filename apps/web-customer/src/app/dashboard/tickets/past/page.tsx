import { redirect } from 'next/navigation';

export default function PastTicketsRedirect() {
  redirect('/dashboard/tickets?filter=past');
}