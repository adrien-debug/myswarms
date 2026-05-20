import type { Metadata } from "next";
import "./globals.css";
import "@hearst/cockpit-shell/tokens.css";
import "./cockpit.css";
import { HiveShell } from "@/components/HiveShell";
import { HubSessionBridge } from "@/components/HubSessionBridge";

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
        <HubSessionBridge />
        <HiveShell>{children}</HiveShell>
      </body>
    </html>
  );
}
