/** Cron endpoints require `Authorization: Bearer $CRON_SECRET` (Vercel Cron sends this automatically). */
export function cronAuthorised(req: Request): boolean {
  const secret = process.env.CRON_SECRET;
  return Boolean(secret) && req.headers.get("authorization") === `Bearer ${secret}`;
}
