"use client";

import { CockpitShell } from "@hearst/cockpit-shell";
import type { ReactNode } from "react";

const HIVE_PRODUCTS = [
  { id: "hive" as const, name: "Hearst Hive", short: "HV", color: "#F59E0B" },
];

export function HiveShell({ children }: { children: ReactNode }) {
  return (
    <CockpitShell products={HIVE_PRODUCTS} appId="hive">
      {children}
    </CockpitShell>
  );
}
