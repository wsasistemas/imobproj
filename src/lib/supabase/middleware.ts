import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { podeEntrarNoApp } from "@/lib/central-acessos";
import { SUPABASE_ANON_KEY, SUPABASE_SCHEMA, SUPABASE_URL, supabaseConfigurado } from "./env";

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
    db: { schema: SUPABASE_SCHEMA },
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

  // Central de Acessos (D3): quem foi bloqueado em Permissões por aplicativo sai do IMOBPROJ.
  // A resposta fica guardada 5 min num cookie para não consultar a cada navegação.
  if (user && !ehPublica(pathname) && request.cookies.get(COOKIE_ACESSO)?.value !== user.id) {
    const acesso = await podeEntrarNoApp(supabase);
    if (acesso === false) {
      await supabase.auth.signOut();
      const url = request.nextUrl.clone();
      url.pathname = "/login";
      url.search = "?motivo=sem-acesso";
      const resposta = NextResponse.redirect(url);
      response.cookies.getAll().forEach((cookie) => resposta.cookies.set(cookie));
      // A sessão já foi revogada no Auth; apaga também os cookies dela no navegador.
      request.cookies
        .getAll()
        .filter((c) => c.name.startsWith("sb-"))
        .forEach((c) => resposta.cookies.delete(c.name));
      resposta.cookies.delete(COOKIE_ACESSO);
      return resposta;
    }
    if (acesso === true) {
      response.cookies.set(COOKIE_ACESSO, user.id, { httpOnly: true, sameSite: "lax", path: "/", maxAge: 300 });
    }
  }

  if (user && pathname === "/login") return redirecionar(request, "/", response);
  return response;
}

const COOKIE_ACESSO = "imobproj_acesso";
