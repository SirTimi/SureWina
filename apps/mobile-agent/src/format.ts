export function naira(value: number): string {
  return '₦' + (Number.isFinite(value) ? value : 0).toLocaleString('en-NG');
}

export function messageOf(error: unknown, fallback: string): string {
  return error instanceof Error && error.message ? error.message : fallback;
}
