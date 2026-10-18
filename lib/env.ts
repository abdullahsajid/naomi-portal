export function env(name: string): string {
  const v = process.env[name];
  if (!v) throw new Error(`Missing env var ${name}`);
  return v;
}

export const reservationMinutes = () => Number(process.env.RESERVATION_MINUTES) || 15;
