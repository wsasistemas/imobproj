"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { Loader2, Mail } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { useForm } from "react-hook-form";
import { z } from "zod";
import {
  Aviso,
  Campo,
  CampoSenha,
  LinhaLembrar,
  LoginCard,
  NotaEntrada,
  iconeCampo,
  submitCls,
} from "@/components/login/login-layout";
import { createClient } from "@/lib/supabase/client";

const esquemaEntrada = z.object({
  email: z.string().trim().min(1, "Informe o e-mail.").email("E-mail inválido."),
  senha: z.string().min(1, "Informe a senha."),
});
type Entrada = z.infer<typeof esquemaEntrada>;

const esquemaEsqueci = z.object({
  email: z.string().trim().min(1, "Informe o e-mail.").email("E-mail inválido."),
});
type Esqueci = z.infer<typeof esquemaEsqueci>;

// "Lembrar meu e-mail": só o e-mail, no próprio navegador (nunca a senha).
const CHAVE_EMAIL_LEMBRADO = "imobproj:email-lembrado";
function lerEmailLembrado(): string {
  try {
    return localStorage.getItem(CHAVE_EMAIL_LEMBRADO) ?? "";
  } catch {
    return "";
  }
}
function guardarEmailLembrado(email: string) {
  try {
    if (email) localStorage.setItem(CHAVE_EMAIL_LEMBRADO, email);
    else localStorage.removeItem(CHAVE_EMAIL_LEMBRADO);
  } catch {
    /* navegador sem armazenamento: não lembra */
  }
}

/** Traduz os erros do Supabase Auth para mensagens úteis. */
function mensagemDeErro(mensagem: string): string {
  const m = mensagem.toLowerCase();
  if (m.includes("invalid login credentials")) return "E-mail ou senha incorretos.";
  if (m.includes("email not confirmed")) return "Confirme o seu e-mail antes de entrar.";
  if (m.includes("rate limit") || m.includes("too many")) return "Muitas tentativas. Aguarde alguns minutos.";
  if (m.includes("fetch")) return "Sem conexão com o servidor. Tente novamente.";
  return "Não foi possível entrar. Tente novamente.";
}

export function FormEntrada({
  destino,
  erroLink,
  configurado,
}: {
  destino: string;
  erroLink: boolean;
  configurado: boolean;
}) {
  const [esqueci, setEsqueci] = useState<string | null>(null);
  return esqueci === null ? (
    <FormLogin destino={destino} erroLink={erroLink} configurado={configurado} onEsqueci={setEsqueci} />
  ) : (
    <FormEsqueci emailInicial={esqueci} onVoltar={() => setEsqueci(null)} />
  );
}

function FormLogin({
  destino,
  erroLink,
  configurado,
  onEsqueci,
}: {
  destino: string;
  erroLink: boolean;
  configurado: boolean;
  onEsqueci: (email: string) => void;
}) {
  const router = useRouter();
  const [lembrar, setLembrar] = useState(false);
  const [erro, setErro] = useState<string | null>(erroLink ? "O link expirou ou já foi usado. Peça um novo." : null);
  const {
    register,
    handleSubmit,
    getValues,
    setValue,
    setFocus,
    formState: { errors, isSubmitting },
  } = useForm<Entrada>({ resolver: zodResolver(esquemaEntrada), defaultValues: { email: "", senha: "" } });

  // O e-mail lembrado só existe no navegador: aplica depois de montar (sem divergir do HTML do servidor).
  useEffect(() => {
    const lembrado = lerEmailLembrado();
    if (lembrado) {
      setValue("email", lembrado);
      setLembrar(true);
      setFocus("senha");
    } else {
      setFocus("email");
    }
  }, [setValue, setFocus]);

  async function entrar({ email, senha }: Entrada) {
    setErro(null);
    const { error } = await createClient().auth.signInWithPassword({ email, password: senha });
    if (error) {
      setErro(mensagemDeErro(error.message));
      return;
    }
    guardarEmailLembrado(lembrar ? email : "");
    router.replace(destino);
    router.refresh();
  }

  return (
    <LoginCard onSubmit={handleSubmit(entrar)} titulo="Entrar" sub="Acesse o sistema com o seu e-mail.">
      {!configurado && (
        <Aviso>
          Supabase não configurado: copie o .env.example para .env.local e preencha a URL e a chave anon.
        </Aviso>
      )}
      {erro && <Aviso>{erro}</Aviso>}
      <Campo id="login-email" label="E-mail" icon={iconeCampo(Mail)} erro={errors.email?.message}>
        <input
          id="login-email"
          type="email"
          autoComplete="username"
          placeholder="voce@suaempresa.com.br"
          aria-invalid={errors.email ? true : undefined}
          aria-describedby={errors.email ? "login-email-erro" : undefined}
          className="mpl-campo"
          {...register("email", { onChange: () => setErro(null) })}
        />
      </Campo>

      <CampoSenha
        id="login-senha"
        label="Senha"
        autoComplete="current-password"
        erro={errors.senha?.message}
        {...register("senha", { onChange: () => setErro(null) })}
      />

      <LinhaLembrar lembrar={lembrar} onLembrar={setLembrar}>
        <button type="button" onClick={() => onEsqueci(getValues("email").trim())} className="mpl-link">
          Esqueceu a senha?
        </button>
      </LinhaLembrar>

      <button type="submit" disabled={isSubmitting || !configurado} className={submitCls}>
        <span className="inline-flex items-center gap-2">
          {isSubmitting && <Loader2 className="size-4 animate-spin" />}
          {isSubmitting ? "Entrando…" : "Entrar"}
        </span>
      </button>

      {/* Sem auto-cadastro: o acesso é criado pela equipe (Administração → Equipe e permissões). */}
      <NotaEntrada>
        O acesso é criado pelo gerente do projeto ou pela WSA Sistemas. O mesmo login vale nos outros sistemas
        da WSA que a sua empresa usa.
      </NotaEntrada>
    </LoginCard>
  );
}

function FormEsqueci({ emailInicial, onVoltar }: { emailInicial: string; onVoltar: () => void }) {
  const [enviado, setEnviado] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<Esqueci>({ resolver: zodResolver(esquemaEsqueci), defaultValues: { email: emailInicial } });

  async function enviar({ email }: Esqueci) {
    setErro(null);
    const { error } = await createClient().auth.resetPasswordForEmail(email, {
      redirectTo: `${window.location.origin}/auth/callback?next=/redefinir-senha`,
    });
    // A resposta é a mesma exista ou não a conta; só falha de rede/limite aparece.
    if (error && !error.message.toLowerCase().includes("not found")) {
      setErro(mensagemDeErro(error.message));
      return;
    }
    setEnviado(true);
  }

  return (
    <LoginCard
      onSubmit={handleSubmit(enviar)}
      titulo="Recuperar senha"
      sub={enviado ? undefined : "Informe o seu e-mail de acesso. Enviaremos um link para criar uma nova senha."}
    >
      {enviado && (
        <Aviso tom="ok">Se o e-mail estiver cadastrado, o link chega em instantes. Confira também a caixa de spam.</Aviso>
      )}
      <Campo id="esqueci-email" label="E-mail" icon={iconeCampo(Mail)} erro={errors.email?.message}>
        <input
          id="esqueci-email"
          type="email"
          autoComplete="username"
          placeholder="voce@suaempresa.com.br"
          autoFocus
          disabled={enviado}
          aria-invalid={errors.email ? true : undefined}
          className="mpl-campo"
          {...register("email")}
        />
      </Campo>

      {erro && <Aviso>{erro}</Aviso>}

      {!enviado && (
        <button type="submit" disabled={isSubmitting} className={submitCls}>
          <span className="inline-flex items-center gap-2">
            {isSubmitting && <Loader2 className="size-4 animate-spin" />}
            {isSubmitting ? "Enviando…" : "Enviar link"}
          </span>
        </button>
      )}
      <button type="button" onClick={onVoltar} className="mpl-secundario">
        Voltar para entrar <span aria-hidden="true">←</span>
      </button>
    </LoginCard>
  );
}
