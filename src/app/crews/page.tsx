import Link from "next/link";
import { FONT, FONT_WEIGHT, SPACING } from "@/lib/ui/tokens";
import { Chevron } from "@/components/ui/Chevron";

export const metadata = {
  title: "Crews — myswarms",
};

export default function CrewsIndex() {
  return (
    <>
      <div className="ct-eyebrow">Cockpit · Crews</div>
      <h1 className="ct-title">Crews</h1>
      <p className="ct-sub">Your available AI crews.</p>

      <div className="ct-card">
        <div
          style={{
            display: "flex",
            alignItems: "flex-start",
            justifyContent: "space-between",
            gap: SPACING.lg,
          }}
        >
          <div>
            <div
              style={{
                fontSize: FONT.md,
                fontWeight: FONT_WEIGHT.semibold,
                color: "var(--ct-text-strong)",
                marginBottom: SPACING.xs,
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
            Open<Chevron direction="right" />
          </Link>
        </div>
      </div>
    </>
  );
}
