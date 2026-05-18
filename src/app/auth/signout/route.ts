import { type NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

/**
 * Route de déconnexion Supabase.
 * Usage : <a href="/auth/signout"> ou formulaire POST.
 * Supporte GET et POST pour flexibilité (liens nav + formulaires).
 */
async function handleSignout(_request: NextRequest): Promise<NextResponse> {
  const supabase = await createClient();
  await supabase.auth.signOut();

  const redirectUrl = new URL("/login", _request.url);
  return NextResponse.redirect(redirectUrl);
}

export { handleSignout as GET, handleSignout as POST };
