import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Connexion — MySwarms",
};

/**
 * Layout minimal pour la page de connexion — pas de rails Cockpit.
 * Override le RootLayout via la convention de routage Next.js App Router.
 */
export default function LoginLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return children;
}
