import { type NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@supabase/ssr";

/**
 * Routes protégées — toute route non listée dans PUBLIC_PATHS requiert une session.
 */
const PUBLIC_PATHS = ["/login", "/api/health"];

/**
 * updateSession : rafraîchit la session Supabase à chaque requête et redirige
 * vers /login si aucune session n'est présente sur une route protégée.
 *
 * Pattern officiel @supabase/ssr middleware Next.js App Router.
 */
async function updateSession(request: NextRequest): Promise<NextResponse> {
  let supabaseResponse = NextResponse.next({ request });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          // Propager les cookies sur la requête (client-side)
          for (const { name, value } of cookiesToSet) {
            request.cookies.set(name, value);
          }
          // Recréer la réponse avec les cookies mis à jour
          supabaseResponse = NextResponse.next({ request });
          for (const { name, value, options } of cookiesToSet) {
            supabaseResponse.cookies.set(name, value, options);
          }
        },
      },
    },
  );

  // IMPORTANT : ne pas exécuter de logique entre createServerClient et getUser().
  // Un bug subtil peut rendre les sessions non rafraîchies (cf. docs @supabase/ssr).
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { pathname } = request.nextUrl;

  // Laisser passer les routes publiques sans vérification de session
  const isPublic = PUBLIC_PATHS.some((p) => pathname.startsWith(p));

  if (!user && !isPublic) {
    // Pas de session → rediriger vers /login
    const url = request.nextUrl.clone();
    url.pathname = "/login";
    return NextResponse.redirect(url);
  }

  // IMPORTANT : retourner supabaseResponse (et non un nouveau NextResponse.next())
  // pour que les cookies de session soient bien propagés au navigateur.
  return supabaseResponse;
}

export async function middleware(request: NextRequest) {
  return updateSession(request);
}

export const config = {
  matcher: [
    /*
     * Intercepter toutes les routes SAUF :
     * - _next/static (fichiers statiques)
     * - _next/image (optimisation images Next.js)
     * - favicon.ico, sitemap.xml, robots.txt
     */
    "/((?!_next/static|_next/image|favicon.ico|sitemap.xml|robots.txt).*)",
  ],
};
