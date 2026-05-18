"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { BottomBarSwarmActions } from "@/components/swarms/BottomBarSwarmActions";
import { LaunchButton } from "@/components/cockpit/LaunchButton";

const SWARM_DETAIL_REGEX = /^\/swarms\/([0-9a-f-]{36})$/i;
const SWARM_EDIT_REGEX = /^\/swarms\/([0-9a-f-]{36})\/edit$/i;

export function BottomBar() {
  const pathname = usePathname() ?? "/";
  const router = useRouter();

  const isSwarmsArea = pathname.startsWith("/swarms");
  const detailMatch = pathname.match(SWARM_DETAIL_REGEX);
  const isSwarmDetail = Boolean(detailMatch);
  const isSwarmEdit = SWARM_EDIT_REGEX.test(pathname);
  const isSwarmNew = pathname === "/swarms/new";
  const isHome = pathname === "/";
  const swarmIdFromDetail = detailMatch?.[1] ?? null;

  const sectionLabel = isHome
    ? "Cockpit"
    : isSwarmsArea
      ? "Swarms"
      : pathname.startsWith("/crews")
        ? "Crews"
        : "Cockpit";

  return (
    <div className="ct-bottom-bar">
      <div className="ct-bottom-bar-inner">
        <span className="ct-bottom-label">● {sectionLabel}</span>

        <div className="ct-seg-track">
          <Link
            href="/"
            className={`ct-seg-btn ${isHome ? "active" : ""}`}
          >
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
            className={`ct-seg-btn ${pathname.startsWith("/crews") ? "active" : ""}`}
          >
            Crews
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
              {/* C6 : bouton Run contextuel sur la route détail */}
              <BottomBarSwarmActions swarmId={swarmIdFromDetail} />
              <Link href={`${pathname}/edit`} className="ct-seg-btn">
                Edit
              </Link>
              <span className="ct-seg-btn active">View</span>
            </>
          ) : isSwarmEdit ? (
            <>
              <span className="ct-seg-btn active">Edit</span>
              <Link
                href={pathname.replace(/\/edit$/, "")}
                className="ct-seg-btn"
              >
                View
              </Link>
            </>
          ) : isSwarmNew ? (
            <span className="ct-seg-btn primary">Create</span>
          ) : (
            <Link href="/swarms/new" className="ct-seg-btn primary">
              Build
            </Link>
          )}
        </div>
      </div>
    </div>
  );
}
