"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { Loader2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { useForm } from "react-hook-form";
import { Aviso, CampoSenha, LoginCard, LoginLayout, submitCls } from "@/components/login/login-layout";
import { createClient } from "@/lib/supabase/client";
import { esquemaNovaSenha, type NovaSenha } from "@/lib/senha";

// Chega aqui pelo link de "Esqueceu a senha?" (/auth/callback já abriu a sessão de recuperação).
export default function RedefinirSenhaPage() {
  const router = useRouter();
  const [erro, setErro] = useState<string | null>(null);
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<NovaSenha>({ resolver: zodResolver(esquemaNovaSenha), defaultValues: { senha: "", confirmacao: "" } });

  async function salvar({ senha }: NovaSenha) {
    setErro(null);
    const supabase = createClient();
    const { data } = await supabase.auth.getUser();
    if (!data.user) {
      setErro("O link expirou ou já foi usado. Volte para a entrada e peça um novo.");
      return;
    }
    const { error } = await supabase.auth.updateUser({ password: senha });
    if (error) {
      setErro("Não foi possível salvar a nova senha. Use uma senha diferente da anterior.");
      return;
    }
    router.replace("/");
    router.refresh();
  }

  return (
    <LoginLayout>
      <LoginCard onSubmit={handleSubmit(salvar)} titulo="Nova senha" sub="Crie a sua nova senha de acesso.">
        {erro && <Aviso>{erro}</Aviso>}
        <CampoSenha
          id="nova-senha"
          label="Nova senha"
          autoComplete="new-password"
          erro={errors.senha?.message}
          {...register("senha")}
        />
        <CampoSenha
          id="nova-senha-confirmacao"
          label="Confirme a senha"
          autoComplete="new-password"
          erro={errors.confirmacao?.message}
          {...register("confirmacao")}
        />
        <button type="submit" disabled={isSubmitting} className={submitCls}>
          <span className="inline-flex items-center gap-2">
            {isSubmitting && <Loader2 className="size-4 animate-spin" />}
            {isSubmitting ? "Salvando…" : "Salvar e entrar"}
          </span>
        </button>
      </LoginCard>
    </LoginLayout>
  );
}
