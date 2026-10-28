import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { SUPABASE_ANON_KEY, SUPABASE_URL, supabaseConfigurado } from "./env";

/** Rotas abertas: entrada, recuperação de senha e o retorno do link enviado por e-mail. */
const ROTAS_PUBLICAS = ["/login", "/redefinir-senha", "/auth"];

function ehPublica(pathname: string) {
  return ROTAS_PUBLICAS.some((rota) => pathname === rota || pathname.startsWith(`${rota}/`));
}

function redirecionar(request: NextRequest, pathname: string, base: NextResponse) {
  const url = request.nextUrl.clone();
  url.pathname = pathname;
  url.search = "";
  if (pathname === "/login" && request.nextUrl.pathname !== "/") {
    url.searchParams.set("voltar", request.nextUrl.pathname + request.nextUrl.search);
  }
  const resposta = NextResponse.redirect(url);
  // Mantém os cookies de sessão renovados nesta mesma requisição.
  base.cookies.getAll().forEach((cookie) => resposta.cookies.set(cookie));
  return resposta;
}

/** Renova a sessão do Supabase a cada requisição e protege as rotas do portal. */
export async function updateSession(request: NextRequest) {
  let response = NextResponse.next({ request });
  const { pathname } = request.nextUrl;

  if (!supabaseConfigurado) {
    return ehPublica(pathname) ? response : redirecionar(request, "/login", response);
  }

  const supabase = createServerClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet) {
        cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
        response = NextResponse.next({ request });
        cookiesToSet.forEach(({ name, value, options }) => response.cookies.set(name, value, options));
      },
    },
  });

  // getUser() valida o token no Supabase Auth (getSession() só lê o cookie).
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user && !ehPublica(pathname)) return redirecionar(request, "/login", response);
  if (user && pathname === "/login") return redirecionar(request, "/", response);
  return response;
}
