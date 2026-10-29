"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ImageUp, Loader2, Trash2 } from "lucide-react";
import { useRef, useState, type ReactNode } from "react";
import { toast } from "sonner";
import { enviarLogo, removerLogo, salvarConfiguracoes } from "@/app/(app)/configuracoes/gerais/acoes";
import { ErroBloco, RotuloSecao } from "@/components/cadastros/blocos";
import { executar } from "@/components/cadastros/util";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Switch } from "@/components/ui/switch";
import { MSG_BANCO_DESATUALIZADO, ehBancoDesatualizado } from "@/lib/acoes";
import { createClient } from "@/lib/supabase/client";
import { SUPABASE_URL } from "@/lib/supabase/env";
import { FUSOS, type AbaConfig, type Configuracoes } from "./esquemas-gerais";

// Configurações gerais (Fase 6): uma linha em imobproj.configuracoes, editada por aba.

const CHAVE = ["configuracoes", "gerais"];
const COLUNAS =
  "empresa_nome, empresa_cnpj, logo_path, fuso, valor_hora_tecnica, os_numero_inicial, aceite_automatico_horas, " +
  "exigir_foto_checkout, exigir_assinatura_checkout, avisar_cliente_abertura_os, resumo_semanal_usuario_chave, " +
  "notificar_os_atribuida, notificar_os_decidida, notificar_ata_publicada, email_remetente_nome, app_campo_url, portal_url, updated_at";

export const urlLogo = (caminho: string | null) =>
  caminho ? `${SUPABASE_URL}/storage/v1/object/public/imobproj-marca/${encodeURIComponent(caminho)}` : null;

export function ConfiguracoesGerais({ aba, podeEditar }: { aba: AbaConfig; podeEditar: boolean }) {
  const config = useQuery({
    queryKey: CHAVE,
    queryFn: async (): Promise<Configuracoes> => {
      const { data, error } = await createClient().from("configuracoes").select(COLUNAS).eq("id", true).single();
      if (error) throw error;
      const c = data as unknown as Configuracoes & { valor_hora_tecnica: number | string };
      return { ...c, valor_hora_tecnica: Number(c.valor_hora_tecnica ?? 0) };
    },
  });

  if (config.isPending) return <Skeleton className="h-96 w-full max-w-3xl rounded-[12px]" />;
  if (config.isError)
    return (
      <ErroBloco
        texto={ehBancoDesatualizado(config.error) ? MSG_BANCO_DESATUALIZADO : "Não foi possível carregar as configurações."}
        onTentar={() => config.refetch()}
      />
    );

  const c = config.data;
  // key: ao salvar, o formulário recomeça com o valor gravado.
  const chave = `${aba}-${c.updated_at ?? ""}`;
  return (
    <div className="grid max-w-3xl gap-4">
      {aba === "empresa" && <AbaEmpresa key={chave} c={c} podeEditar={podeEditar} />}
      {aba === "os" && <AbaOs key={chave} c={c} podeEditar={podeEditar} />}
      {aba === "notificacoes" && <AbaNotificacoes key={chave} c={c} podeEditar={podeEditar} />}
      {aba === "integracoes" && <AbaIntegracoes key={chave} c={c} podeEditar={podeEditar} />}
      {!podeEditar && (
        <p className="text-[13px] text-muted-foreground">Seu perfil pode consultar estas configurações, mas não alterá-las.</p>
      )}
    </div>
  );
}

function useSalvar(aba: AbaConfig) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (dados: Record<string, unknown>) => executar(salvarConfiguracoes(aba, dados)),
    onSuccess: () => toast.success("Configurações salvas."),
    onError: (e: Error) => toast.error(e.message),
    onSettled: () => queryClient.invalidateQueries({ queryKey: CHAVE }),
  });
}

function Cartao({ titulo, children, rodape }: { titulo: string; children: ReactNode; rodape?: ReactNode }) {
  return (
    <Card className="min-w-0 gap-0 p-0">
      <div className="border-b border-border-soft px-4 py-3">
        <h2 className="text-[15px] font-semibold">{titulo}</h2>
      </div>
      {children}
      {rodape && <div className="flex justify-end border-t border-border-soft px-4 py-3">{rodape}</div>}
    </Card>
  );
}

function BotaoSalvar({ pendente, onClick }: { pendente: boolean; onClick: () => void }) {
  return (
    <Button onClick={onClick} disabled={pendente}>
      {pendente && <Loader2 className="animate-spin" aria-hidden="true" />}
      Salvar alterações
    </Button>
  );
}

function Campo({ id, rotulo, ajuda, children }: { id: string; rotulo: string; ajuda?: string; children: ReactNode }) {
  return (
    <div className="grid min-w-0 gap-1.5">
      <Label htmlFor={id} className="text-[13px]">
        {rotulo}
      </Label>
      {children}
      {ajuda && <p className="text-[12px] text-muted-foreground">{ajuda}</p>}
    </div>
  );
}

function LinhaChave({ id, titulo, ajuda, checked, onChange }: { id: string; titulo: string; ajuda?: string; checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <div className="flex items-center justify-between gap-4 border-b border-border-soft px-4 py-3 last:border-b-0">
      <div className="min-w-0">
        <Label htmlFor={id} className="text-[13.5px] font-medium">
          {titulo}
        </Label>
        {ajuda && <p className="text-[12px] text-muted-foreground">{ajuda}</p>}
      </div>
      <Switch id={id} checked={checked} onCheckedChange={onChange} />
    </div>
  );
}

function AbaEmpresa({ c, podeEditar }: { c: Configuracoes; podeEditar: boolean }) {
  const [nome, setNome] = useState(c.empresa_nome);
  const [cnpj, setCnpj] = useState(c.empresa_cnpj ?? "");
  const [fuso, setFuso] = useState(c.fuso);
  const [valor, setValor] = useState(String(c.valor_hora_tecnica).replace(".", ","));
  const salvar = useSalvar("empresa");
  const enviar = () =>
    salvar.mutate({
      empresa_nome: nome,
      empresa_cnpj: cnpj,
      fuso,
      valor_hora_tecnica: Number(valor.replace(/\./g, "").replace(",", ".")),
    });

  return (
    <>
      <Cartao titulo="Empresa" rodape={podeEditar && <BotaoSalvar pendente={salvar.isPending} onClick={enviar} />}>
        <fieldset disabled={!podeEditar || salvar.isPending} className="grid min-w-0 gap-4 p-4 sm:grid-cols-2">
          <Campo id="cfg-nome" rotulo="Nome da empresa">
            <Input id="cfg-nome" value={nome} onChange={(e) => setNome(e.target.value)} maxLength={120} />
          </Campo>
          <Campo id="cfg-cnpj" rotulo="CNPJ">
            <Input id="cfg-cnpj" value={cnpj} onChange={(e) => setCnpj(e.target.value)} inputMode="numeric" placeholder="00.000.000/0000-00" />
          </Campo>
          <Campo id="cfg-fuso" rotulo="Fuso horário" ajuda="Usado nos horários das mensagens e dos relatórios.">
            <Select items={FUSOS.map((f) => ({ value: f.value, label: f.label }))} value={fuso} onValueChange={(v) => v && setFuso(v)}>
              <SelectTrigger id="cfg-fuso" className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {FUSOS.map((f) => (
                  <SelectItem key={f.value} value={f.value}>
                    {f.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Campo>
          <Campo id="cfg-valor" rotulo="Valor da hora técnica (R$)" ajuda="Aparece na medição do mês como valor estimado.">
            <Input id="cfg-valor" value={valor} onChange={(e) => setValor(e.target.value)} inputMode="decimal" className="tabular-nums" />
          </Campo>
        </fieldset>
      </Cartao>
      <CartaoLogo logo={c.logo_path} podeEditar={podeEditar} />
    </>
  );
}

function CartaoLogo({ logo, podeEditar }: { logo: string | null; podeEditar: boolean }) {
  const queryClient = useQueryClient();
  const entrada = useRef<HTMLInputElement>(null);
  const invalidar = () => queryClient.invalidateQueries({ queryKey: CHAVE });
  const mEnviar = useMutation({
    mutationFn: (arquivo: File) => {
      const fd = new FormData();
      fd.append("logo", arquivo);
      return executar(enviarLogo(fd));
    },
    onSuccess: () => toast.success("Logo atualizado."),
    onError: (e: Error) => toast.error(e.message),
    onSettled: invalidar,
  });
  const mRemover = useMutation({
    mutationFn: () => executar(removerLogo()),
    onSuccess: () => toast.success("Logo retirado."),
    onError: (e: Error) => toast.error(e.message),
    onSettled: invalidar,
  });
  const src = urlLogo(logo);

  return (
    <Cartao titulo="Logo">
      <div className="flex flex-wrap items-center gap-4 p-4">
        <div className="grid size-16 place-items-center overflow-hidden rounded-full border border-border bg-muted">
          {src ? (
            // eslint-disable-next-line @next/next/no-img-element -- imagem do Storage público, sem otimização do Next
            <img src={src} alt="Logo da empresa" className="size-full object-contain" />
          ) : (
            <span className="text-[12px] text-muted-foreground">Sem logo</span>
          )}
        </div>
        <div className="grid gap-1">
          <RotuloSecao>PNG, JPG, WEBP ou SVG · até 2 MB</RotuloSecao>
          {podeEditar && (
            <div className="flex flex-wrap gap-2">
              <input
                ref={entrada}
                type="file"
                accept="image/png,image/jpeg,image/webp,image/svg+xml"
                className="sr-only"
                id="cfg-logo"
                aria-label="Escolher imagem do logo"
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (f) mEnviar.mutate(f);
                  e.target.value = "";
                }}
              />
              <Button variant="outline" size="sm" onClick={() => entrada.current?.click()} disabled={mEnviar.isPending}>
                {mEnviar.isPending ? <Loader2 className="animate-spin" aria-hidden="true" /> : <ImageUp aria-hidden="true" />}
                {logo ? "Trocar logo" : "Enviar logo"}
              </Button>
              {logo && (
                <Button variant="ghost" size="sm" onClick={() => mRemover.mutate()} disabled={mRemover.isPending}>
                  <Trash2 aria-hidden="true" />
                  Retirar
                </Button>
              )}
            </div>
          )}
        </div>
      </div>
    </Cartao>
  );
}

function AbaOs({ c, podeEditar }: { c: Configuracoes; podeEditar: boolean }) {
  const [v, setV] = useState({
    os_numero_inicial: String(c.os_numero_inicial),
    aceite_automatico_horas: String(c.aceite_automatico_horas),
    exigir_foto_checkout: c.exigir_foto_checkout,
    exigir_assinatura_checkout: c.exigir_assinatura_checkout,
    avisar_cliente_abertura_os: c.avisar_cliente_abertura_os,
    resumo_semanal_usuario_chave: c.resumo_semanal_usuario_chave,
  });
  const salvar = useSalvar("os");
  const muda = (campo: Partial<typeof v>) => setV((x) => ({ ...x, ...campo }));
  const enviar = () =>
    salvar.mutate({ ...v, os_numero_inicial: Number(v.os_numero_inicial), aceite_automatico_horas: Number(v.aceite_automatico_horas) });

  return (
    <Cartao titulo="Ordens de Serviço" rodape={podeEditar && <BotaoSalvar pendente={salvar.isPending} onClick={enviar} />}>
      <fieldset disabled={!podeEditar || salvar.isPending} className="min-w-0">
        <div className="grid gap-4 border-b border-border-soft p-4 sm:grid-cols-2">
          <Campo id="cfg-numero" rotulo="Número da primeira OS" ajuda="Vale para projetos novos. Os projetos que já têm OS seguem a própria sequência.">
            <Input
              id="cfg-numero"
              type="number"
              min={1}
              value={v.os_numero_inicial}
              onChange={(e) => muda({ os_numero_inicial: e.target.value })}
              className="tabular-nums"
            />
          </Campo>
          <Campo id="cfg-aceite" rotulo="Aceite automático (horas)" ajuda="OS sem resposta do cliente depois desse prazo é aprovada sozinha. Use 0 para desligar.">
            <Input
              id="cfg-aceite"
              type="number"
              min={0}
              max={2160}
              value={v.aceite_automatico_horas}
              onChange={(e) => muda({ aceite_automatico_horas: e.target.value })}
              className="tabular-nums"
            />
          </Campo>
        </div>
        <LinhaChave
          id="cfg-foto"
          titulo="Foto obrigatória no check-out"
          ajuda="Sem ao menos uma foto, a OS não vai para o aceite (no app e no portal)."
          checked={v.exigir_foto_checkout}
          onChange={(x) => muda({ exigir_foto_checkout: x })}
        />
        <LinhaChave
          id="cfg-assinatura"
          titulo="Assinatura do cliente obrigatória"
          checked={v.exigir_assinatura_checkout}
          onChange={(x) => muda({ exigir_assinatura_checkout: x })}
        />
        <LinhaChave
          id="cfg-aviso"
          titulo="Avisar o cliente no WhatsApp ao abrir a OS"
          ajuda="A mensagem vai para o grupo do cliente no projeto, pela fila de envio do OpenWA."
          checked={v.avisar_cliente_abertura_os}
          onChange={(x) => muda({ avisar_cliente_abertura_os: x })}
        />
        <LinhaChave
          id="cfg-resumo"
          titulo="Enviar resumo semanal de horas ao usuário-chave"
          checked={v.resumo_semanal_usuario_chave}
          onChange={(x) => muda({ resumo_semanal_usuario_chave: x })}
        />
      </fieldset>
    </Cartao>
  );
}

function AbaNotificacoes({ c, podeEditar }: { c: Configuracoes; podeEditar: boolean }) {
  const [v, setV] = useState({
    notificar_os_atribuida: c.notificar_os_atribuida,
    notificar_os_decidida: c.notificar_os_decidida,
    notificar_ata_publicada: c.notificar_ata_publicada,
    email_remetente_nome: c.email_remetente_nome,
  });
  const salvar = useSalvar("notificacoes");
  const muda = (campo: Partial<typeof v>) => setV((x) => ({ ...x, ...campo }));

  return (
    <Cartao titulo="Notificações" rodape={podeEditar && <BotaoSalvar pendente={salvar.isPending} onClick={() => salvar.mutate(v)} />}>
      <fieldset disabled={!podeEditar || salvar.isPending} className="min-w-0">
        <LinhaChave
          id="cfg-n-atribuida"
          titulo="OS atribuída"
          ajuda="Push no app de campo para quem vai executar."
          checked={v.notificar_os_atribuida}
          onChange={(x) => muda({ notificar_os_atribuida: x })}
        />
        <LinhaChave
          id="cfg-n-decidida"
          titulo="OS aprovada ou recusada"
          ajuda="Push para o executor quando o cliente decide."
          checked={v.notificar_os_decidida}
          onChange={(x) => muda({ notificar_os_decidida: x })}
        />
        <LinhaChave
          id="cfg-n-ata"
          titulo="Ata publicada"
          ajuda="Aviso aos participantes para registrarem ciência."
          checked={v.notificar_ata_publicada}
          onChange={(x) => muda({ notificar_ata_publicada: x })}
        />
        <div className="grid gap-4 p-4 sm:grid-cols-2">
          <Campo id="cfg-remetente" rotulo="Nome do remetente dos e-mails">
            <Input id="cfg-remetente" value={v.email_remetente_nome} onChange={(e) => muda({ email_remetente_nome: e.target.value })} maxLength={60} />
          </Campo>
        </div>
      </fieldset>
    </Cartao>
  );
}

function AbaIntegracoes({ c, podeEditar }: { c: Configuracoes; podeEditar: boolean }) {
  const [app, setApp] = useState(c.app_campo_url ?? "");
  const [portal, setPortal] = useState(c.portal_url ?? "");
  const salvar = useSalvar("integracoes");

  return (
    <Cartao
      titulo="Integrações"
      rodape={podeEditar && <BotaoSalvar pendente={salvar.isPending} onClick={() => salvar.mutate({ app_campo_url: app, portal_url: portal })} />}
    >
      <fieldset disabled={!podeEditar || salvar.isPending} className="grid min-w-0 gap-4 p-4">
        <Campo id="cfg-app-url" rotulo="Link de instalação do app de campo" ajuda="Vai no convite por WhatsApp da tela App de OS.">
          <Input id="cfg-app-url" value={app} onChange={(e) => setApp(e.target.value)} placeholder="https://expo.dev/…" inputMode="url" />
        </Campo>
        <Campo id="cfg-portal-url" rotulo="Endereço do portal" ajuda="Usado nos links das mensagens e dos e-mails.">
          <Input id="cfg-portal-url" value={portal} onChange={(e) => setPortal(e.target.value)} placeholder="https://imobproject.vercel.app" inputMode="url" />
        </Campo>
        <p className="text-[12.5px] text-muted-foreground">
          WhatsApp (OpenWA) e a Central de Acessos têm telas próprias em Configurações.
        </p>
      </fieldset>
    </Cartao>
  );
}
