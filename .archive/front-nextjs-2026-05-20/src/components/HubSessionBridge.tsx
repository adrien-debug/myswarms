"use client";
import { useEffect } from "react";
import { bridgeHubSession, onHubSessionChange } from "@hearst/hub-sdk";
import { createClient } from "@/lib/supabase/client";

export function HubSessionBridge() {
  useEffect(() => {
    const sb = createClient();
    void bridgeHubSession(sb);
    const unsubscribe = onHubSessionChange(async (session) => {
      if (!session) {
        await sb.auth.signOut();
        return;
      }
      await sb.auth.setSession({
        access_token: session.access_token,
        refresh_token: session.refresh_token,
      });
    });
    return () => unsubscribe();
  }, []);
  return null;
}
