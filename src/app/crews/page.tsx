import Link from "next/link";

export const metadata = {
  title: "Crews — myswarms",
};

export default function CrewsIndex() {
  return (
    <>
      <div className="ct-eyebrow">Cockpit · Crews</div>
      <h1 className="ct-title">Crews</h1>
      <p className="ct-sub">Tes crews AI disponibles.</p>

      <div className="ct-card">
        <div
          style={{
            display: "flex",
            alignItems: "flex-start",
            justifyContent: "space-between",
            gap: 16,
          }}
        >
          <div>
            <div
              style={{
                fontSize: 14,
                fontWeight: 600,
                color: "var(--ct-text-strong)",
                marginBottom: 4,
              }}
            >
              Daily Chief of Staff
            </div>
            <p className="ct-card-body" style={{ marginBottom: 0 }}>
              Inbox triage · classification · prioritization · drafts · daily summary
            </p>
          </div>
          <Link
            href="/crews/chief-of-staff"
            className="ct-seg-btn"
            style={{ flexShrink: 0 }}
          >
            Ouvrir →
          </Link>
        </div>
      </div>
    </>
  );
}
