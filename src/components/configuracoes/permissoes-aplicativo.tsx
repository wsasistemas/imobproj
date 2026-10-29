"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Loader2, Search } from "lucide-react";
import { useMemo, useState } from "react";
import { toast } from "sonner";
import { ErroBloco, PilulaFiltro, RotuloSecao } from "@/components/cadastros/blocos";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { APP_CENTRAL } from "@/lib/central-acessos";
import { mensagemErroBanco } from "@/lib/acoes";
import { createClient } from "@/lib/supabase/client";
import { cn } from "@/lib/utils";

// Permissões por aplicativo (D3), no comportamento da tela do imobdesk (PermissoesAplicativo.tsx).
// Tudo pelos atalhos public.pa_* da Central de Acessos (schema `acessos`, compartilhado): a mesma tela e os
// mesmos dados em todos os aplicativos IMOBSYSTEMS. As funções conferem o super admin da Central no banco.

export type Aplicativo = {
  schema_name: string;
  nome: string;
  url: string | null;
  controle_ativo: boolean;
  padrao_novos: "bloqueado" | "liberado";
  schema_dados: string;
  ultima_verificacao_em: string | null;
  controle_ativado_em: string | null;
  liberados: number;
  bloqueados: number;
};

type UsuarioApp = {
  user_id: string;
  email: string;
  criado_em: string;
  ultimo_login: string | null;
  proprietario: boolean;
  tem_cadastro: boolean;
  decisao: boolean | null;
  efetivo: boolean;
};

type Filtro = "todos" | "podem" | "bloqueados" | "nunca";

const central = () => createClient().schema("public");
const iniciais = (nome: string) =>
  nome
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0]!.toUpperCase())
    .join("");
const dataHora = (iso: string | null) =>
  iso ? new Intl.DateTimeFormat("pt-BR", { dateStyle: "short", timeStyle: "short", timeZone: "America/Sao_Paulo" }).format(new Date(iso)) : "—";

export function PermissoesAplicativo({ aplicativos }: { aplicativos: Aplicativo[] }) {
  const [selecionado, setSelecionado] = useState(
    () => aplicativos.find((a) => a.schema_name === APP_CENTRAL)?.schema_name ?? aplicativos[0]?.schema_name ?? null,
  );
  const app = aplicativos.find((a) => a.schema_name === selecionado) ?? null;
  const registrado = aplicativos.some((a) => a.schema_name === APP_CENTRAL);

  return (
    <div className="grid items-start gap-4 lg:grid-cols-[minmax(0,0.55fr)_minmax(0,1.45fr)]">
      <Card className="min-w-0 gap-0 p-0" aria-label="Aplicativos">
        <div className="border-b border-border-soft px-4 py-3">
          <h2 className="text-[15px] font-semibold">Aplicativos</h2>
        </div>
        <ul>
          {aplicativos.map((a) => {
            const ativo = a.schema_name === selecionado;
            return (
              <li key={a.schema_name} className="border-b border-border-soft last:border-b-0">
                <button
                  type="button"
                  onClick={() => setSelecionado(a.schema_name)}
                  aria-pressed={ativo}
                  className={cn(
                    "flex w-full items-center justify-between gap-3 px-4 py-3 text-left hover:bg-muted focus-visible:outline-2 focus-visible:outline-ring",
                    ativo && "bg-primary-soft",
                  )}
                >
                  <span className="flex min-w-0 items-center gap-2.5">
                    <span className="grid size-8 shrink-0 place-items-center rounded-full bg-primary-soft text-[11px] font-bold text-primary">
                      {iniciais(a.nome)}
                    </span>
                    <span className="min-w-0">
                      <span className={cn("block truncate font-semibold", ativo && "text-primary")}>{a.nome}</span>
                      <code className="block truncate text-[11.5px] text-muted-foreground">
                        {a.schema_dados !== a.schema_name ? `${a.schema_name} · dados em ${a.schema_dados}` : a.schema_name}
                      </code>
                    </span>
                  </span>
                  <SeloControle app={a} />
                </button>
              </li>
            );
          })}
        </ul>
        <p className="border-t border-border-soft px-4 py-2.5 text-[12px] text-muted-foreground">
          A lista mostra os aplicativos cadastrados na Central de Acessos. Um aplicativo novo entra pela Central, com o controle
          desligado.
        </p>
      </Card>

      <div className="grid min-w-0 gap-4">
        {!registrado && (
          <p role="status" className="rounded-[10px] border border-banner-info-border bg-banner-info-bg px-4 py-3 text-[13px]">
            O <b>IMOBPROJ</b> ainda não está cadastrado na Central de Acessos. Enquanto isso, todo login com perfil entra. Para
            cadastrar, rode uma vez o <code>supabase/central-acessos/registrar-imobproj.sql</code> no SQL Editor do Supabase.
          </p>
        )}
        {app ? <DetalheAplicativo key={app.schema_name} app={app} /> : null}
      </div>
    </div>
  );
}

function SeloControle({ app }: { app: Aplicativo }) {
  if (!app.ultima_verificacao_em)
    return (
      <Badge variant="outline" className="shrink-0 border-info/30 bg-info-bg text-info">
        Novo · configurar
      </Badge>
    );
  return app.controle_ativo ? (
    <Badge variant="outline" className="shrink-0 border-success/30 bg-success-bg text-success">
      Controle ativo
    </Badge>
  ) : (
    <Badge variant="outline" className="shrink-0">
      Controle desligado
    </Badge>
  );
}

function DetalheAplicativo({ app }: { app: Aplicativo }) {
  const queryClient = useQueryClient();
  const [nome, setNome] = useState(app.nome);
  const [url, setUrl] = useState(app.url ?? "");
  const [padrao, setPadrao] = useState(app.padrao_novos);
  const [controle, setControle] = useState(app.controle_ativo);
  const [busca, setBusca] = useState("");
  const [filtro, setFiltro] = useState<Filtro>("todos");
  const [marcados, setMarcados] = useState<Set<string>>(new Set());

  const chave = ["central", "usuarios", app.schema_name];
  const usuarios = useQuery({
    queryKey: chave,
    queryFn: async () => {
      const { data, error } = await central().rpc("pa_listar_usuarios", { p_app: app.schema_name });
      if (error) throw new Error(mensagemErroBanco(error));
      return (data ?? []) as UsuarioApp[];
    },
  });
  // Nome e perfil de quem tem cadastro no IMOBPROJ (só para este aplicativo).
  const pessoas = useQuery({
    queryKey: ["central", "pessoas-imobproj"],
    enabled: app.schema_name === APP_CENTRAL,
    queryFn: async () => {
      const { data, error } = await createClient().from("profiles").select("id, nome, perfil, perfis(nome)");
      if (error) throw error;
      return new Map(
        ((data ?? []) as unknown as { id: string; nome: string; perfis: { nome: string } | null }[]).map((p) => [p.id, p]),
      );
    },
  });

  const mSalvar = useMutation({
    mutationFn: async () => {
      const { error } = await central().rpc("pa_salvar_aplicativo", {
        p_app: app.schema_name,
        p_nome: nome,
        p_url: url,
        p_padrao_novos: padrao,
      });
      if (error) throw new Error(mensagemErroBanco(error));
    },
    onSuccess: () => toast.success(`${nome} salvo`),
    onError: (e: Error) => toast.error(e.message),
  });
  const mControle = useMutation({
    mutationFn: async (ativo: boolean) => {
      const { error } = await central().rpc("pa_definir_controle", { p_app: app.schema_name, p_ativo: ativo });
      if (error) throw new Error(mensagemErroBanco(error));
      return ativo;
    },
    onSuccess: (ativo) => {
      setControle(ativo);
      toast.success(ativo ? "Controle ligado: só quem pode entrar acessa." : "Controle desligado: o bloqueio não está valendo.");
      queryClient.invalidateQueries({ queryKey: chave });
    },
    onError: (e: Error) => toast.error(e.message),
  });
  const mPermissao = useMutation({
    mutationFn: async ({ ids, pode }: { ids: string[]; pode: boolean }) => {
      for (const id of ids) {
        const { error } = await central().rpc("pa_definir_permissao", { p_app: app.schema_name, p_usuario: id, p_pode: pode });
        if (error) throw new Error(mensagemErroBanco(error));
      }
      return { n: ids.length, pode };
    },
    onSuccess: ({ n, pode }) => {
      toast.success(`${n} ${n === 1 ? "usuário" : "usuários"} ${pode ? "liberado" : "bloqueado"}${n === 1 ? "" : "s"}`);
      setMarcados(new Set());
      queryClient.invalidateQueries({ queryKey: chave });
    },
    onError: (e: Error) => {
      toast.error(e.message);
      queryClient.invalidateQueries({ queryKey: chave });
    },
  });

  const lista = useMemo(() => usuarios.data ?? [], [usuarios.data]);
  const de = (f: Filtro) =>
    lista.filter((u) =>
      f === "todos" ? true : f === "podem" ? u.efetivo : f === "bloqueados" ? !u.efetivo : u.ultimo_login === null,
    );
  const termo = busca.trim().toLowerCase();
  const filtrados = de(filtro).filter(
    (u) => !termo || u.email.toLowerCase().includes(termo) || (pessoas.data?.get(u.user_id)?.nome ?? "").toLowerCase().includes(termo),
  );
  const todosMarcados = filtrados.length > 0 && filtrados.every((u) => marcados.has(u.user_id));
  const alterado = nome !== app.nome || url !== (app.url ?? "") || padrao !== app.padrao_novos;

  return (
    <Card className="min-w-0 gap-0 p-0">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border-soft px-4 py-3">
        <h2 className="text-[15px] font-semibold">{app.nome}</h2>
        <label className="inline-flex items-center gap-2 text-[13px] font-medium">
          Controle de acesso
          <Switch
            checked={controle}
            disabled={mControle.isPending}
            onCheckedChange={(v) => mControle.mutate(v)}
            aria-label={controle ? "Desligar controle" : "Ligar controle"}
          />
        </label>
      </div>

      <div className="grid gap-3.5 p-4">
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="grid gap-1.5">
            <Label htmlFor="app-nome">Nome</Label>
            <Input id="app-nome" value={nome} onChange={(e) => setNome(e.target.value)} />
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor="app-url">Endereço</Label>
            <Input id="app-url" value={url} onChange={(e) => setUrl(e.target.value)} placeholder="https://" />
          </div>
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="grid gap-1.5">
            <Label htmlFor="app-schema">{app.schema_dados !== app.schema_name ? "Chave · schema de dados" : "Schema"}</Label>
            <Input
              id="app-schema"
              readOnly
              value={app.schema_dados !== app.schema_name ? `${app.schema_name} · ${app.schema_dados}` : app.schema_name}
            />
          </div>
          <div className="grid gap-1.5">
            <Label id="app-novos-rotulo">Logins novos da WSA</Label>
            <Select
              items={[
                { value: "bloqueado", label: "Bloqueado até liberar" },
                { value: "liberado", label: "Pode entrar" },
              ]}
              value={padrao}
              onValueChange={(v) => v && setPadrao(v as Aplicativo["padrao_novos"])}
            >
              <SelectTrigger className="w-full" aria-labelledby="app-novos-rotulo">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="bloqueado">Bloqueado até liberar</SelectItem>
                <SelectItem value="liberado">Pode entrar</SelectItem>
              </SelectContent>
            </Select>
            <p className="text-[12px] text-muted-foreground">Vale para quem ainda não tem cadastro neste aplicativo.</p>
          </div>
        </div>
        <div className="flex justify-end">
          <Button size="sm" onClick={() => mSalvar.mutate()} disabled={!alterado || mSalvar.isPending}>
            {mSalvar.isPending && <Loader2 className="animate-spin" aria-hidden="true" />}
            {mSalvar.isPending ? "Salvando…" : "Salvar"}
          </Button>
        </div>

        <p className={cn("rounded-[10px] px-4 py-2.5 text-[13px] leading-relaxed", controle ? "bg-info-bg text-info" : "bg-warning-bg text-warning")}>
          {controle ? (
            <>
              <b>Ligado:</b> entra quem está como &quot;Pode entrar&quot;: conta proprietária, liberação manual, cadastro próprio no
              aplicativo ou, sem nada disso, o padrão de logins novos.
            </>
          ) : (
            <>
              <b>Desligado:</b> bloqueio NÃO está valendo. Todo login entra; as decisões ficam guardadas para quando o controle for
              ligado.
            </>
          )}
        </p>

        <RotuloSecao>Usuários</RotuloSecao>
        <div className="flex flex-wrap items-center gap-2">
          <div className="relative min-w-0 flex-1 basis-56">
            <Search size={15} className="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-muted-foreground" aria-hidden="true" />
            <Input value={busca} onChange={(e) => setBusca(e.target.value)} placeholder="Buscar por nome ou e-mail" aria-label="Buscar por nome ou e-mail" className="pl-9" />
          </div>
          <div className="flex flex-wrap gap-1.5" role="group" aria-label="Filtro">
            {(
              [
                ["todos", "Todos"],
                ["podem", "Podem entrar"],
                ["bloqueados", "Bloqueados"],
                ["nunca", "Nunca entrou"],
              ] as const
            ).map(([f, rotulo]) => (
              <PilulaFiltro key={f} ativa={filtro === f} onClick={() => setFiltro(f)}>
                {rotulo} · {de(f).length}
              </PilulaFiltro>
            ))}
          </div>
        </div>
      </div>

      {usuarios.isError ? (
        <div className="px-4 pb-4">
          <ErroBloco texto={(usuarios.error as Error).message || "Carregando os logins falhou."} onTentar={() => void usuarios.refetch()} />
        </div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full border-collapse text-[13px]">
            <thead>
              <tr className="bg-table-head text-left text-muted-foreground">
                <th className="w-10 px-4 py-2.5">
                  <Checkbox
                    checked={todosMarcados}
                    onCheckedChange={(v) =>
                      setMarcados(v ? new Set([...marcados, ...filtrados.map((u) => u.user_id)]) : new Set())
                    }
                    aria-label="Selecionar todos desta página"
                  />
                </th>
                <th className="px-3 py-2.5 font-semibold">Usuário</th>
                <th className="px-3 py-2.5 font-semibold">Cadastro no aplicativo</th>
                <th className="px-3 py-2.5 font-semibold">Último acesso</th>
                <th className="px-3 py-2.5 font-semibold">Acesso</th>
              </tr>
            </thead>
            <tbody>
              {usuarios.isPending && (
                <tr>
                  <td colSpan={5} className="px-4 py-6 text-center text-muted-foreground">
                    <Loader2 className="mr-2 inline animate-spin" size={15} aria-hidden="true" />
                    Carregando os logins
                  </td>
                </tr>
              )}
              {!usuarios.isPending && filtrados.length === 0 && (
                <tr>
                  <td colSpan={5} className="px-4 py-6 text-center text-muted-foreground">
                    Nenhum login com esse filtro.
                  </td>
                </tr>
              )}
              {filtrados.map((u) => {
                const pessoa = pessoas.data?.get(u.user_id) as { nome: string; perfis: { nome: string } | null } | undefined;
                return (
                  <tr key={u.user_id} className="border-b border-border-soft last:border-b-0">
                    <td className="px-4 py-2.5">
                      <Checkbox
                        checked={marcados.has(u.user_id)}
                        disabled={u.proprietario}
                        onCheckedChange={(v) => {
                          const n = new Set(marcados);
                          if (v) n.add(u.user_id);
                          else n.delete(u.user_id);
                          setMarcados(n);
                        }}
                        aria-label={`Selecionar ${u.email}`}
                      />
                    </td>
                    <td className="px-3 py-2.5">
                      <span className="block font-medium">{pessoa?.nome || u.email.split("@")[0]}</span>
                      <span className="block text-[12px] text-muted-foreground">{u.email}</span>
                    </td>
                    <td className="px-3 py-2.5">
                      {u.proprietario ? (
                        <Badge variant="outline" className="border-purple/30 bg-purple-bg text-purple">
                          Proprietário
                        </Badge>
                      ) : u.tem_cadastro ? (
                        (pessoa?.perfis?.nome ?? "Cadastrado")
                      ) : (
                        <span className="text-muted-foreground">Sem cadastro</span>
                      )}
                    </td>
                    <td className="px-3 py-2.5 whitespace-nowrap tabular-nums">
                      {u.ultimo_login ? dataHora(u.ultimo_login) : <span className="text-muted-foreground">Nunca entrou</span>}
                    </td>
                    <td className="px-3 py-2.5">
                      {!controle ? (
                        <Badge variant="outline">Livre (controle desligado)</Badge>
                      ) : u.efetivo ? (
                        <Badge variant="outline" className="border-success/30 bg-success-bg text-success">
                          Pode entrar
                        </Badge>
                      ) : (
                        <Badge variant="outline" className="border-danger/30 bg-danger-bg text-danger">
                          Bloqueado
                        </Badge>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      <div className="flex flex-wrap items-center gap-2 border-t border-border-soft px-4 py-3">
        <span className="mr-auto text-[12.5px] text-muted-foreground">
          {marcados.size ? `${marcados.size} selecionado${marcados.size === 1 ? "" : "s"}` : "Marque os usuários para liberar ou bloquear."}
        </span>
        <Button
          size="sm"
          variant="outline"
          disabled={marcados.size === 0 || mPermissao.isPending}
          onClick={() => mPermissao.mutate({ ids: [...marcados], pode: true })}
        >
          Liberar selecionados
        </Button>
        <Button
          size="sm"
          variant="outline"
          disabled={marcados.size === 0 || mPermissao.isPending}
          onClick={() => mPermissao.mutate({ ids: [...marcados], pode: false })}
        >
          {mPermissao.isPending && <Loader2 className="animate-spin" aria-hidden="true" />}
          Bloquear selecionados
        </Button>
      </div>
    </Card>
  );
}
