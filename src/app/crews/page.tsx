import Link from "next/link";

export const metadata = {
  title: "Crews — myswarms",
};

export default function CrewsIndex() {
  return (
    <main className="mx-auto max-w-3xl p-8">
      <h1 className="text-2xl font-bold mb-6">Crews</h1>
      <ul className="space-y-3">
        <li>
          <Link
            href="/crews/chief-of-staff"
            className="block rounded-lg border border-neutral-200 p-4 hover:bg-neutral-50 transition"
          >
            <div className="font-semibold">Daily Chief of Staff</div>
            <div className="text-sm text-neutral-600">
              Inbox triage · classification · prioritization · drafts · daily summary
            </div>
          </Link>
        </li>
      </ul>
    </main>
  );
}
