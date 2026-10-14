import { SettingsForm } from "@/components/SettingsForm";
import { isDemoMode } from "@/lib/config";

export const metadata = { title: "My alerts – PowerWatch" };

export default function SettingsPage({ searchParams }: { searchParams: { suburb?: string; ward?: string } }) {
  return (
    <div className="mx-auto max-w-3xl space-y-4">
      <h1 className="text-2xl font-extrabold text-brand-900">My areas &amp; alerts</h1>
      <SettingsForm demo={isDemoMode()} prefill={searchParams} vapidKey={process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY ?? ""} />
    </div>
  );
}
