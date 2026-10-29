"use client";

import type { EmailOtpType } from "@supabase/supabase-js";
import { Loader2 } from "lucide-react";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { LoginLayout } from "@/components/login/login-layout";
import { createClient } from "@/lib/supabase/client";

// Volta dos links de e-mail do Supabase Auth (convite e "Esqueceu a senha?").
//
// O convite sai do servidor (auth.admin.inviteUserByEmail), sem PKCE: o Supabase devolve a sessão no #hash
// (#access_token=…&refresh_token=…&type=invite). O cliente do portal é PKCE e recusa esse formato
// ("Not a valid PKCE flow url"), e o /auth/callback (servidor) nem enxerga o hash — por isso esta página
// lê o hash e grava a sessão com setSession. Também aceita ?code= (PKCE) e ?token_hash=&type= (verifyOtp).

function destinoSeguro(next: string | null) {
  return next && next.startsWith("/") && !next.startsWith("//") ? next : "/";
}

function mensagemDoErro(codigo: string | null, descricao: string | null) {
  if (codigo === "otp_expired")
    return "O link expirou ou já foi usado. Peça ao administrador para reenviar o convite, ou use “Esqueceu a senha?” na entrada.";
  return descricao?.replace(/\+/g, " ") || "Não foi possível validar o link.";
}

export default function ConfirmarPage() {
  const [erro, setErro] = useState<string | null>(null);
  const feito = useRef(false);

  useEffect(() => {
    if (feito.current) return;
    feito.current = true;

    const url = new URL(window.location.href);
    const hash = new URLSearchParams(url.hash.slice(1));
    const destino = destinoSeguro(url.searchParams.get("next"));
    // Tira os tokens da barra de endereço e do histórico antes de qualquer outra coisa.
    window.history.replaceState(null, "", url.pathname);

    async function validar() {
      const erroHash = hash.get("error_code") ?? url.searchParams.get("error_code");
      if (erroHash || hash.get("error")) {
        setErro(mensagemDoErro(erroHash, hash.get("error_description") ?? url.searchParams.get("error_description")));
        return;
      }

      const supabase = createClient();
      const code = url.searchParams.get("code");
      const tokenHash = url.searchParams.get("token_hash");
      const accessToken = hash.get("access_token");
      const refreshToken = hash.get("refresh_token");

      let falhou: { message: string } | null = null;
      if (code) {
        falhou = (await supabase.auth.exchangeCodeForSession(code)).error;
      } else if (tokenHash) {
        const tipo = (url.searchParams.get("type") ?? "invite") as EmailOtpType;
        falhou = (await supabase.auth.verifyOtp({ token_hash: tokenHash, type: tipo })).error;
      } else if (accessToken && refreshToken) {
        falhou = (await supabase.auth.setSession({ access_token: accessToken, refresh_token: refreshToken })).error;
      } else {
        setErro("Link incompleto. Abra de novo o link do e-mail ou peça um novo.");
        return;
      }

      if (falhou) {
        setErro(mensagemDoErro(null, "O link expirou ou já foi usado. Peça um novo."));
        return;
      }
      window.location.replace(destino);
    }

    validar().catch(() => setErro("Não foi possível validar o link."));
  }, []);

  return (
    <LoginLayout>
      <div className="mx-auto grid w-full max-w-sm gap-4 text-center">
        {erro ? (
          <>
            <h1 className="text-xl font-semibold">Link inválido</h1>
            <p className="text-[14px] text-muted-foreground">{erro}</p>
            <Link href="/login" className="text-[14px] font-semibold text-primary hover:underline">
              Ir para a entrada
            </Link>
          </>
        ) : (
          <p className="inline-flex items-center justify-center gap-2 text-[14px] text-muted-foreground">
            <Loader2 className="size-4 animate-spin" aria-hidden="true" />
            Validando o link…
          </p>
        )}
      </div>
    </LoginLayout>
  );
}
