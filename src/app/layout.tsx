import type { Metadata } from "next";
import "./globals.css";
import "@hearst/cockpit-shell/tokens.css";
import { HiveShell } from "@/components/HiveShell";

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
        <HiveShell>{children}</HiveShell>
      </body>
    </html>
  );
}
