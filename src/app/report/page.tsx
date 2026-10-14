import { ReportForm } from "@/components/ReportForm";

export const metadata = { title: "Report an outage – PowerWatch" };

export default function ReportPage({ searchParams }: { searchParams: { type?: string; suburb?: string; ward?: string } }) {
  return (
    <div className="mx-auto max-w-2xl space-y-4">
      <h1 className="text-2xl font-extrabold text-brand-900">Report an outage</h1>
      <p className="text-sm text-slate-700">Tell us about your area. This does <strong>not</strong> notify the municipality – to log a fault officially, use the City of Ekurhuleni&apos;s own channels.</p>
      <ReportForm defaults={searchParams} />
    </div>
  );
}
