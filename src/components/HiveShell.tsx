"use client";

import { CockpitShell } from "@hearst/cockpit-shell";
import type { ReactNode } from "react";
import { COLOR } from "@/lib/ui/tokens";
import { AppBottomBar } from "@/components/cockpit/AppBottomBar";

const HIVE_PRODUCTS = [
  { id: "hive" as const, name: "Hearst Hive", short: "HV", color: COLOR.brandHive },
];

export function HiveShell({ children }: { children: ReactNode }) {
  return (
    <CockpitShell products={HIVE_PRODUCTS} appId="hive">
      {children}
      <AppBottomBar />
    </CockpitShell>
  );
}
