"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { BottomBarSwarmActions } from "@/components/swarms/BottomBarSwarmActions";
import { LaunchButton } from "@/components/cockpit/LaunchButton";

const SWARM_DETAIL_REGEX = /^\/swarms\/([0-9a-f-]{36})$/i;
const SWARM_EDIT_REGEX = /^\/swarms\/([0-9a-f-]{36})\/edit$/i;

export function AppBottomBar() {
  const pathname = usePathname() ?? "/";
  const router = useRouter();

  const isHome = pathname === "/";
  const isSwarmsArea = pathname.startsWith("/swarms");
  const isCrewsArea = pathname.startsWith("/crews");
  const isToolsArea = pathname.startsWith("/tools");
  const detailMatch = pathname.match(SWARM_DETAIL_REGEX);
  const isSwarmDetail = Boolean(detailMatch);
  const isSwarmEdit = SWARM_EDIT_REGEX.test(pathname);
  const isSwarmNew = pathname === "/swarms/new";
  const swarmIdFromDetail = detailMatch?.[1] ?? null;

  const sectionLabel = isHome
    ? "Cockpit"
    : isSwarmsArea
      ? "Swarms"
      : isCrewsArea
        ? "Crews"
        : isToolsArea
          ? "Tools"
          : "Cockpit";

  return (
    <nav className="ct-app-nav" role="navigation" aria-label="Navigation principale">
      <div className="ct-app-nav-inner">
        <span className="ct-bottom-label ct-bottom-label--with-dot">{sectionLabel}</span>

        <div className="ct-seg-track">
          <Link href="/" className={`ct-seg-btn ${isHome ? "active" : ""}`}>
            Overview
          </Link>
          <Link
            href="/swarms"
            className={`ct-seg-btn ${isSwarmsArea ? "active" : ""}`}
          >
            Swarms
          </Link>
          <Link
            href="/crews"
            className={`ct-seg-btn ${isCrewsArea ? "active" : ""}`}
          >
            Crews
          </Link>
          <Link
            href="/tools"
            className={`ct-seg-btn ${isToolsArea ? "active" : ""}`}
          >
            Tools
          </Link>
        </div>

        <div className="ct-seg-track">
          <LaunchButton />
        </div>

        <div className="ct-seg-track">
          <Link href="/swarms/new" className="ct-seg-btn">
            + New
          </Link>
          <button
            type="button"
            className="ct-seg-btn"
            onClick={() => router.refresh()}
          >
            Refresh
          </button>
        </div>

        <div className="ct-seg-track">
          {isSwarmDetail && swarmIdFromDetail ? (
            <>
              <BottomBarSwarmActions swarmId={swarmIdFromDetail} />
              <Link href={`${pathname}/edit`} className="ct-seg-btn">
                Edit
              </Link>
              <span className="ct-seg-btn active" role="button" aria-disabled="true">View</span>
            </>
          ) : isSwarmEdit ? (
            <>
              <span className="ct-seg-btn active" role="button" aria-disabled="true">Edit</span>
              <Link
                href={pathname.replace(/\/edit$/, "")}
                className="ct-seg-btn"
              >
                View
              </Link>
            </>
          ) : isSwarmNew ? (
            <span className="ct-seg-btn primary" role="button" aria-disabled="true">Create</span>
          ) : (
            <Link href="/swarms/new" className="ct-seg-btn primary">
              Build
            </Link>
          )}
        </div>
      </div>
    </nav>
  );
}
