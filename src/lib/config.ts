export const isSupabaseConfigured = (): boolean =>
  Boolean(process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY);

/** Demo mode = no database configured (or forced). Demo data is always labelled in the UI. */
export const isDemoMode = (): boolean => process.env.FORCE_DEMO_MODE === "true" || !isSupabaseConfigured();

export const clusterThreshold = () => Number(process.env.CLUSTER_THRESHOLD ?? 3);
export const clusterWindowMin = () => Number(process.env.CLUSTER_WINDOW_MINUTES ?? 60);
