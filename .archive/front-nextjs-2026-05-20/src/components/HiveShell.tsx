"use client";

import { CockpitShell } from "@hearst/cockpit-shell";
import { Suspense, type ReactNode } from "react";
import { usePathname } from "next/navigation";
import { COLOR } from "@/lib/ui/tokens";
import { AppBottomBar } from "@/components/cockpit/AppBottomBar";

const HIVE_PRODUCTS = [
  { id: "hive" as const, name: "Hearst Hive", short: "HV", color: COLOR.brandHive },
];

// Routes rendues hors du shell Cockpit (plein écran, sans rails ni bottom bar).
const BARE_ROUTES = ["/login"];

export function HiveShell({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const isBare = BARE_ROUTES.some(
    (r) => pathname === r || pathname.startsWith(`${r}/`),
  );

  if (isBare) {
    return <>{children}</>;
  }

  return (
    <CockpitShell products={HIVE_PRODUCTS} appId="hive">
      {children}
      <Suspense fallback={null}>
        <AppBottomBar />
      </Suspense>
    </CockpitShell>
  );
}
