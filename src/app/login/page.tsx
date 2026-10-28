import type { Metadata } from "next";
import { LoginLayout } from "@/components/login/login-layout";
import { supabaseConfigurado } from "@/lib/supabase/env";
import { FormEntrada } from "./form-entrada";

export const metadata: Metadata = { title: "Entrar" };

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ voltar?: string; erro?: string }>;
}) {
  const { voltar, erro } = await searchParams;
  // Só volta para caminhos internos (evita redirecionamento aberto).
  const destino = voltar && voltar.startsWith("/") && !voltar.startsWith("//") ? voltar : "/";

  return (
    <LoginLayout>
      <FormEntrada destino={destino} erroLink={erro === "link"} configurado={supabaseConfigurado} />
    </LoginLayout>
  );
}
