"use client";

import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useRef, useState } from "react";
import { BottomBarSwarmActions } from "@/components/swarms/BottomBarSwarmActions";
import { LaunchButton } from "@/components/cockpit/LaunchButton";
import { BUILDER_TABS, type BuilderTabId, parseBuilderTab } from "@/lib/swarms/builderTabs";

const SWARM_DETAIL_REGEX = /^\/swarms\/([0-9a-f-]{36})$/i;
const SWARM_EDIT_REGEX = /^\/swarms\/([0-9a-f-]{36})\/edit$/i;
const REFRESH_FEEDBACK_MS = 600;

export function AppBottomBar() {
  const pathname = usePathname() ?? "/";
  const router = useRouter();
  const searchParams = useSearchParams();
  const [refreshing, setRefreshing] = useState(false);
  const tablistRef = useRef<HTMLDivElement>(null);

  const isHome = pathname === "/";
  const isSwarmsArea = pathname.startsWith("/swarms");
  const isCrewsArea = pathname.startsWith("/crews");
  const isToolsArea = pathname.startsWith("/tools");
  const detailMatch = pathname.match(SWARM_DETAIL_REGEX);
  const isSwarmDetail = Boolean(detailMatch);
  const isSwarmEdit = SWARM_EDIT_REGEX.test(pathname);
  const isSwarmNew = pathname === "/swarms/new";
  const swarmIdFromDetail = detailMatch?.[1] ?? null;

  const isBuilderRoute = isSwarmNew || isSwarmEdit;

  const sectionLabel = isHome
    ? "Cockpit"
    : isSwarmsArea
      ? "Swarms"
      : isCrewsArea
        ? "Crews"
        : isToolsArea
          ? "Tools"
          : "Cockpit";

  const activeTab: BuilderTabId = parseBuilderTab(searchParams.get("tab"));

  const navigateToTab = (tabId: BuilderTabId) => {
    const params = new URLSearchParams(Array.from(searchParams.entries()));
    params.set("tab", tabId);
    router.replace(`${pathname}?${params.toString()}`, { scroll: false });
  };

  const handleTablistKeyDown = (e: React.KeyboardEvent<HTMLDivElement>) => {
    const tabs = tablistRef.current?.querySelectorAll<HTMLButtonElement>(
      '[role="tab"]'
    );
    if (!tabs || tabs.length === 0) return;

    const tabsArray = Array.from(tabs);
    const currentIndex = BUILDER_TABS.findIndex((t) => t.id === activeTab);

    let nextIndex: number | null = null;

    switch (e.key) {
      case "ArrowLeft":
        e.preventDefault();
        nextIndex =
          currentIndex <= 0 ? tabsArray.length - 1 : currentIndex - 1;
        break;
      case "ArrowRight":
        e.preventDefault();
        nextIndex =
          currentIndex >= tabsArray.length - 1 ? 0 : currentIndex + 1;
        break;
      case "Home":
        e.preventDefault();
        nextIndex = 0;
        break;
      case "End":
        e.preventDefault();
        nextIndex = tabsArray.length - 1;
        break;
      default:
        return;
    }

    if (nextIndex !== null) {
      const targetTab = BUILDER_TABS[nextIndex];
      navigateToTab(targetTab.id);
      tabsArray[nextIndex].focus();
    }
  };

  const handleRefresh = () => {
    setRefreshing(true);
    router.refresh();
    setTimeout(() => setRefreshing(false), REFRESH_FEEDBACK_MS);
  };

  return (
    <nav className="ct-bottom-bar" role="navigation" aria-label="Main navigation">
      <div className="ct-bottom-bar-inner">
        <span className="ct-bottom-label">{sectionLabel}</span>

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

        {isBuilderRoute && (
          <div
            ref={tablistRef}
            className="ct-seg-track"
            role="tablist"
            aria-label="Swarm builder sections"
            onKeyDown={handleTablistKeyDown}
          >
            {BUILDER_TABS.map((t) => (
              <button
                key={t.id}
                role="tab"
                id={`swarm-tab-${t.id}`}
                aria-selected={activeTab === t.id}
                aria-controls={`swarm-panel-${t.id}`}
                tabIndex={activeTab === t.id ? 0 : -1}
                className={`ct-seg-btn${activeTab === t.id ? " active" : ""}`}
                onClick={() => navigateToTab(t.id)}
              >
                {t.label}
              </button>
            ))}
          </div>
        )}

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
            onClick={handleRefresh}
            disabled={refreshing}
            aria-disabled={refreshing}
          >
            {refreshing ? "Refresh…" : "Refresh"}
          </button>
        </div>

        <div className="ct-seg-track">
          {isSwarmDetail && swarmIdFromDetail ? (
            <>
              <BottomBarSwarmActions swarmId={swarmIdFromDetail} />
              <Link href={`${pathname}/edit`} className="ct-seg-btn">
                Edit
              </Link>
              <span className="ct-seg-btn active" aria-current="page">View</span>
            </>
          ) : isSwarmEdit ? (
            <>
              <span className="ct-seg-btn active" aria-current="page">Edit</span>
              <Link
                href={pathname.replace(/\/edit$/, "")}
                className="ct-seg-btn"
              >
                View
              </Link>
            </>
          ) : isSwarmNew ? (
            <span className="ct-seg-btn primary" aria-current="page">Create</span>
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
