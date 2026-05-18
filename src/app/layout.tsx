import type { Metadata } from "next";
import "./globals.css";
import "./cockpit.css";
import { RailLeft } from "./_cockpit/RailLeft";
import { RailRight } from "./_cockpit/RailRight";
import { BottomBar } from "./_cockpit/BottomBar";
import { HubModeStyles } from "./_cockpit/HubModeStyles";

export const metadata: Metadata = {
  title: "Hearst Hive",
  description: "Hearst Hive — swarms & crews orchestration",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="fr">
      <body>
        <div className="ct-root">
          <div className="ct-ambient-deep"></div>
          <div className="ct-ambient-glow"></div>

          {/* hub-mode Phase A : masque le chrome interne quand embarqué dans le hub */}
          <HubModeStyles />

          <div className="ct-panels-row">
            <RailLeft />

            <div className="ct-center-panel">
              <div className="ct-page-area">
                {children}
              </div>
              <BottomBar />
            </div>

            <RailRight />
          </div>
        </div>
      </body>
    </html>
  );
}
