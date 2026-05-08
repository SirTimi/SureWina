import { createClient } from '@surewina/api-client';

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? 'https://api.surewina.ng';

export const api = createClient({
  baseUrl: API_URL,
  // Mocks ignore the URL — wired up for backend phase
});