// Sessão do app: login por e-mail/senha, "Manter conectado", trava por biometria e papéis do usuário.
//
// * Manter conectado desligado → a sessão é encerrada na próxima abertura do app.
// * Biometria (oferecida depois do primeiro login): com sessão salva, o app abre travado e pede
//   digital/Face ID; "Usar senha" encerra a sessão e volta ao formulário.

import type { Session } from "@supabase/supabase-js";
import * as LocalAuthentication from "expo-local-authentication";
import * as SecureStore from "expo-secure-store";
import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { registrarPush } from "./push";
import { supabase } from "./supabase";
import type { Papel } from "./tipos";

const CHAVE_MANTER = "campo.manter_conectado";
const CHAVE_BIOMETRIA = "campo.biometria";
const CHAVE_EMAIL = "campo.ultimo_email";

export type Perfil = { id: string; nome: string; email: string | null; telefone_whatsapp: string | null; is_super_admin: boolean };
export type Vinculo = { project_id: string; role: Papel; projeto: { codigo: string; nome: string } | null };

type ContextoSessao = {
  carregando: boolean;
  sessao: Session | null;
  bloqueado: boolean;
  perfil: Perfil | null;
  vinculos: Vinculo[];
  /** Diretor ou usuário-chave em algum projeto (ou super admin): vê a aba Aceites. */
  aprovador: boolean;
  biometriaAtiva: boolean;
  ultimoEmail: string;
  entrar: (email: string, senha: string, manter: boolean) => Promise<string | null>;
  desbloquear: () => Promise<boolean>;
  sair: () => Promise<void>;
  definirBiometria: (ativa: boolean) => Promise<void>;
};

const Contexto = createContext<ContextoSessao | null>(null);

export async function biometriaDisponivel() {
  return (await LocalAuthentication.hasHardwareAsync()) && (await LocalAuthentication.isEnrolledAsync());
}

export function SessaoProvider({ children }: { children: ReactNode }) {
  const [carregando, setCarregando] = useState(true);
  const [sessao, setSessao] = useState<Session | null>(null);
  const [bloqueado, setBloqueado] = useState(false);
  const [perfil, setPerfil] = useState<Perfil | null>(null);
  const [vinculos, setVinculos] = useState<Vinculo[]>([]);
  const [biometriaAtiva, setBiometriaAtiva] = useState(false);
  const [ultimoEmail, setUltimoEmail] = useState("");

  useEffect(() => {
    let vivo = true;
    (async () => {
      const [manter, biometria, email] = await Promise.all([
        SecureStore.getItemAsync(CHAVE_MANTER),
        SecureStore.getItemAsync(CHAVE_BIOMETRIA),
        SecureStore.getItemAsync(CHAVE_EMAIL),
      ]);
      let { data } = await supabase.auth.getSession();
      if (data.session && manter === "0") {
        await supabase.auth.signOut({ scope: "local" });
        data = { session: null };
      }
      if (!vivo) return;
      setUltimoEmail(email ?? "");
      setBiometriaAtiva(biometria === "1");
      setBloqueado(!!data.session && biometria === "1" && (await biometriaDisponivel()));
      setSessao(data.session);
      setCarregando(false);
    })();
    const { data } = supabase.auth.onAuthStateChange((_evento, nova) => setSessao(nova));
    return () => {
      vivo = false;
      data.subscription.unsubscribe();
    };
  }, []);

  const userId = sessao?.user.id;
  useEffect(() => {
    if (!userId || bloqueado) return;
    (async () => {
      const [p, v] = await Promise.all([
        supabase.from("profiles").select("id, nome, email, telefone_whatsapp, is_super_admin").eq("id", userId).maybeSingle(),
        supabase
          .from("project_members")
          .select("project_id, role, projeto:projects(codigo, nome)")
          .eq("user_id", userId)
          .eq("ativo", true),
      ]);
      if (p.data) setPerfil(p.data as Perfil);
      if (v.data) setVinculos(v.data as unknown as Vinculo[]);
      void registrarPush();
    })();
  }, [userId, bloqueado]);

  const entrar = useCallback(async (email: string, senha: string, manter: boolean) => {
    const { error } = await supabase.auth.signInWithPassword({ email: email.trim(), password: senha });
    if (error) {
      if (/invalid login credentials/i.test(error.message)) return "E-mail ou senha incorretos.";
      if (/network|fetch/i.test(error.message)) return "Sem conexão. O primeiro acesso precisa de internet.";
      return error.message;
    }
    await SecureStore.setItemAsync(CHAVE_MANTER, manter ? "1" : "0");
    await SecureStore.setItemAsync(CHAVE_EMAIL, email.trim());
    setUltimoEmail(email.trim());
    setBloqueado(false);
    return null;
  }, []);

  const desbloquear = useCallback(async () => {
    const r = await LocalAuthentication.authenticateAsync({
      promptMessage: "Desbloquear o IMOBPROJ Campo",
      cancelLabel: "Cancelar",
      fallbackLabel: "Usar senha do aparelho",
    });
    if (r.success) setBloqueado(false);
    return r.success;
  }, []);

  const sair = useCallback(async () => {
    await supabase.auth.signOut({ scope: "local" });
    setPerfil(null);
    setVinculos([]);
    setBloqueado(false);
  }, []);

  const definirBiometria = useCallback(async (ativa: boolean) => {
    await SecureStore.setItemAsync(CHAVE_BIOMETRIA, ativa ? "1" : "0");
    if (ativa) await SecureStore.setItemAsync(CHAVE_MANTER, "1"); // biometria só faz sentido com a sessão salva
    setBiometriaAtiva(ativa);
  }, []);

  const aprovador =
    !!perfil?.is_super_admin || vinculos.some((v) => v.role === "usuario_chave" || v.role === "diretor");

  const valor = useMemo(
    () => ({
      carregando,
      sessao,
      bloqueado,
      perfil,
      vinculos,
      aprovador,
      biometriaAtiva,
      ultimoEmail,
      entrar,
      desbloquear,
      sair,
      definirBiometria,
    }),
    [carregando, sessao, bloqueado, perfil, vinculos, aprovador, biometriaAtiva, ultimoEmail, entrar, desbloquear, sair, definirBiometria],
  );
  return <Contexto.Provider value={valor}>{children}</Contexto.Provider>;
}

export function useSessao() {
  const c = useContext(Contexto);
  if (!c) throw new Error("useSessao fora do SessaoProvider");
  return c;
}

export const PREFERENCIAS = { CHAVE_MANTER, CHAVE_BIOMETRIA };
