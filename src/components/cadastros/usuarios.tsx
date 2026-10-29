"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Check, Loader2, Plus, Send, X } from "lucide-react";
import Link from "next/link";
import { useMemo, useState } from "react";
import { Controller, useForm } from "react-hook-form";
import { toast } from "sonner";
import type { z } from "zod";
import { convitesPendentesUsuarios, reenviarConviteUsuario, salvarUsuario } from "@/app/(app)/cadastros/usuarios/acoes";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { ROTULO_PAPEL, type PapelMembro } from "@/lib/projeto/tipos";
import { createClient } from "@/lib/supabase/client";
import { cn } from "@/lib/utils";
import { EstadoVazio, ErroBloco, ErroCampo, PilulaFiltro, RotuloSecao, SkeletonListaPainel } from "./blocos";
import { ROTULO_TIPO_ORGANIZACAO, esquemaUsuario, type TipoOrganizacao } from "./esquemas";
import { executar, formatarTelefone, iniciais } from "./util";

type Usuario = {
  id: string;
  nome: string;
  email: string | null;
  telefone_whatsapp: string | null;
  cargo: string | null;
  perfil: string | null;
  ativo: boolean;
  atende_whatsapp: boolean;
  is_super_admin: boolean;
  organization_id: string | null;
  organizations: { nome: string; nome_fantasia: string | null; tipo: TipoOrganizacao } | null;
  team_members: { team_id: string; teams: { nome: string } | null }[];
  project_members: { role: PapelMembro; ativo: boolean; projects: { codigo: string; nome: string } | null }[];
};
type Opcao = { id: string; nome: string };
type Empresa = Opcao & { tipo: TipoOrganizacao };

type Filtro = "todos" | "executora" | "cliente" | "prestador";
const ROTULO_FILTRO: Record<Filtro, string> = {
  todos: "Todos",
  executora: "Equipe interna",
  cliente: "Clientes",
  prestador: "Prestadores",
};

const CHAVE = ["cadastros", "usuarios"];

export function Usuarios({ podeEditar, podeDefinirPerfil }: { podeEditar: boolean; podeDefinirPerfil: boolean }) {
  const [busca, setBusca] = useState("");
  const [filtro, setFiltro] = useState<Filtro>("todos");
  const [aberto, setAberto] = useState<string | null>(null);

  const usuarios = useQuery({
    queryKey: CHAVE,
    queryFn: async () => {
      const { data, error } = await createClient()
        .from("profiles")
        .select(
          "id, nome, email, telefone_whatsapp, cargo, perfil, ativo, atende_whatsapp, is_super_admin, organization_id, organizations(nome, nome_fantasia, tipo), team_members(team_id, teams(nome)), project_members(role, ativo, projects(codigo, nome))",
        )
        .order("nome");
      if (error) throw error;
      return (data ?? []) as unknown as Usuario[];
    },
  });
  const opcoes = useQuery({
    queryKey: ["cadastros", "opcoes-usuario"],
    queryFn: async () => {
      const sb = createClient();
      const [empresas, equipes, perfis] = await Promise.all([
        sb.from("organizations").select("id, nome, tipo").eq("ativo", true).order("nome"),
        sb.from("teams").select("id, nome").eq("ativo", true).order("nome"),
        sb.from("perfis").select("chave, nome").neq("chave", "super_admin").order("ordem"),
      ]);
      if (empresas.error) throw empresas.error;
      if (equipes.error) throw equipes.error;
      if (perfis.error) throw perfis.error;
      return {
        empresas: (empresas.data ?? []) as Empresa[],
        equipes: (equipes.data ?? []) as Opcao[],
        perfis: (perfis.data ?? []) as { chave: string; nome: string }[],
      };
    },
  });
  const pendentes = useQuery({
    queryKey: [...CHAVE, "convites"],
    enabled: podeEditar,
    queryFn: () => executar(convitesPendentesUsuarios()),
    select: (ids) => new Set(ids),
  });

  const lista = useMemo(() => usuarios.data ?? [], [usuarios.data]);
  const contagem = (f: Filtro) => (f === "todos" ? lista.length : lista.filter((u) => u.organizations?.tipo === f).length);
  const filtrados = useMemo(() => {
    const termo = busca.trim().toLowerCase();
    return lista.filter(
      (u) =>
        (filtro === "todos" || u.organizations?.tipo === filtro) &&
        (!termo ||
          u.nome.toLowerCase().includes(termo) ||
          (u.email ?? "").toLowerCase().includes(termo) ||
          (u.cargo ?? "").toLowerCase().includes(termo)),
    );
  }, [lista, busca, filtro]);
  const selecionado = aberto && aberto !== "novo" ? lista.find((u) => u.id === aberto) ?? null : null;

  if (usuarios.isPending) return <SkeletonListaPainel linhas={6} />;
  if (usuarios.isError) return <ErroBloco texto="Não foi possível carregar os usuários." onTentar={() => usuarios.refetch()} />;

  return (
    <div className="grid gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap gap-2">
          {(Object.keys(ROTULO_FILTRO) as Filtro[]).map((f) => (
            <PilulaFiltro key={f} ativa={filtro === f} onClick={() => setFiltro(f)}>
              {ROTULO_FILTRO[f]} · {contagem(f)}
            </PilulaFiltro>
          ))}
        </div>
        {podeEditar && (
          <Button onClick={() => setAberto("novo")}>
            <Plus aria-hidden="true" />
            Novo usuário
          </Button>
        )}
      </div>

      <div className={cn("grid items-start gap-4", aberto && "xl:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)]")}>
        <Card className="min-w-0 p-0">
          <div className="border-b border-border p-4">
            <Input
              value={busca}
              onChange={(e) => setBusca(e.target.value)}
              placeholder="Buscar por nome, e-mail ou cargo"
              aria-label="Buscar usuários"
              className="w-[min(320px,100%)]"
            />
          </div>
          {filtrados.length === 0 ? (
            <div className="p-4">
              <EstadoVazio
                icone="usuarios"
                titulo="Nenhum usuário encontrado"
                texto={busca ? "Nada corresponde à busca." : "Ninguém neste grupo ainda. Use “Novo usuário” para convidar."}
              />
            </div>
          ) : (
            <Table>
              <caption className="sr-only">Usuários do IMOBPROJ</caption>
              <TableHeader>
                <TableRow>
                  <TableHead className="pl-4">Nome</TableHead>
                  <TableHead>E-mail</TableHead>
                  <TableHead>WhatsApp</TableHead>
                  <TableHead>Cargo</TableHead>
                  <TableHead>Empresa</TableHead>
                  <TableHead>Equipes</TableHead>
                  <TableHead className="pr-4">Situação</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filtrados.map((u) => {
                  const convite = pendentes.data?.has(u.id) ?? false;
                  return (
                    <TableRow
                      key={u.id}
                      className={cn("cursor-pointer", aberto === u.id && "bg-primary-soft hover:bg-primary-soft", !u.ativo && "text-muted-foreground")}
                      onClick={() => setAberto(u.id)}
                    >
                      <TableCell className="pl-4">
                        <div className="flex items-center gap-2.5">
                          <Avatar aria-hidden="true">
                            <AvatarFallback className="bg-primary-soft text-[12px] font-semibold text-primary">
                              {iniciais(u.nome || u.email || "?")}
                            </AvatarFallback>
                          </Avatar>
                          <button
                            type="button"
                            className="text-left font-medium text-foreground hover:underline focus-visible:underline focus-visible:outline-none"
                            onClick={(ev) => {
                              ev.stopPropagation();
                              setAberto(u.id);
                            }}
                          >
                            {u.nome || u.email}
                          </button>
                        </div>
                      </TableCell>
                      <TableCell>{u.email ?? "—"}</TableCell>
                      <TableCell className="tabular-nums">{formatarTelefone(u.telefone_whatsapp) || "—"}</TableCell>
                      <TableCell>{u.cargo ?? "—"}</TableCell>
                      <TableCell>{u.organizations?.nome_fantasia || u.organizations?.nome || "—"}</TableCell>
                      <TableCell>
                        <div className="flex flex-wrap gap-1">
                          {u.team_members.length === 0
                            ? "—"
                            : u.team_members.map((t) => (
                                <Badge key={t.team_id} variant="neutral">
                                  {t.teams?.nome}
                                </Badge>
                              ))}
                        </div>
                      </TableCell>
                      <TableCell className="pr-4">
                        {convite ? (
                          <Badge variant="warning">Convite enviado</Badge>
                        ) : (
                          <Badge variant={u.ativo ? "success" : "neutral"}>{u.ativo ? "Ativo" : "Inativo"}</Badge>
                        )}
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          )}
        </Card>

        {aberto && (
          <FichaUsuario
            key={aberto}
            usuario={selecionado}
            empresas={opcoes.data?.empresas ?? []}
            equipes={opcoes.data?.equipes ?? []}
            perfis={opcoes.data?.perfis ?? []}
            convitePendente={!!selecionado && (pendentes.data?.has(selecionado.id) ?? false)}
            podeEditar={podeEditar}
            podeDefinirPerfil={podeDefinirPerfil}
            onFechar={() => setAberto(null)}
            onSalvo={(id) => setAberto(id)}
          />
        )}
      </div>
    </div>
  );
}

const esquemaForm = esquemaUsuario.omit({ id: true });
type Entrada = z.input<typeof esquemaForm>;
type Saida = z.output<typeof esquemaForm>;

function FichaUsuario({
  usuario,
  empresas,
  equipes,
  perfis,
  convitePendente,
  podeEditar,
  podeDefinirPerfil,
  onFechar,
  onSalvo,
}: {
  usuario: Usuario | null;
  empresas: Empresa[];
  equipes: Opcao[];
  perfis: { chave: string; nome: string }[];
  convitePendente: boolean;
  podeEditar: boolean;
  podeDefinirPerfil: boolean;
  onFechar: () => void;
  onSalvo: (id: string) => void;
}) {
  const queryClient = useQueryClient();
  const {
    register,
    control,
    handleSubmit,
    formState: { errors },
  } = useForm<Entrada, unknown, Saida>({
    resolver: zodResolver(esquemaForm),
    defaultValues: {
      nome: usuario?.nome ?? "",
      email: usuario?.email ?? "",
      telefone_whatsapp: formatarTelefone(usuario?.telefone_whatsapp),
      cargo: usuario?.cargo ?? "",
      organization_id: usuario?.organization_id ?? null,
      atende_whatsapp: usuario?.atende_whatsapp ?? false,
      ativo: usuario?.ativo ?? true,
      equipes: usuario?.team_members.map((t) => t.team_id) ?? [],
      perfil: usuario?.perfil ?? null,
    },
  });

  const mSalvar = useMutation({
    mutationFn: (d: Saida) => executar(salvarUsuario({ ...d, id: usuario?.id })),
    onSuccess: (r) => {
      toast.success(r.mensagem);
      queryClient.invalidateQueries({ queryKey: CHAVE });
      queryClient.invalidateQueries({ queryKey: ["cadastros", "equipes"] });
      onSalvo(r.id);
    },
    onError: (e: Error) => toast.error(e.message),
  });
  const mReenviar = useMutation({
    mutationFn: (id: string) => executar(reenviarConviteUsuario({ id })),
    onSuccess: (msg) => toast.success(msg),
    onError: (e: Error) => toast.error(e.message),
  });

  const so = !podeEditar;
  const itensEmpresa = [
    { value: "", label: "Sem empresa" },
    ...empresas.map((e) => ({ value: e.id, label: `${e.nome} · ${ROTULO_TIPO_ORGANIZACAO[e.tipo].toLowerCase()}` })),
  ];
  const vinculos = (usuario?.project_members ?? []).filter((p) => p.projects);

  return (
    <Card className="min-w-0 p-0">
      <form onSubmit={handleSubmit((d) => mSalvar.mutate(d))} noValidate>
        <div className="flex items-center justify-between gap-2 border-b border-border px-4 py-3">
          <h2 className="truncate text-[15px] font-semibold">{usuario ? "Editar usuário" : "Novo usuário"}</h2>
          <div className="flex items-center gap-2">
            {usuario?.is_super_admin && <Badge variant="purple">Super admin</Badge>}
            {usuario && (convitePendente ? <Badge variant="warning">Convite enviado</Badge> : <Badge variant={usuario.ativo ? "success" : "neutral"}>{usuario.ativo ? "Ativo" : "Inativo"}</Badge>)}
            <Button type="button" variant="ghost" size="icon" aria-label="Fechar ficha" onClick={onFechar}>
              <X aria-hidden="true" />
            </Button>
          </div>
        </div>

        <fieldset disabled={so || mSalvar.isPending} className="grid gap-4 p-4">
          <div className="grid gap-1.5">
            <Label htmlFor="usu-nome">Nome completo</Label>
            <Input id="usu-nome" autoComplete="off" aria-invalid={!!errors.nome} aria-describedby="usu-nome-erro" {...register("nome")} />
            <ErroCampo id="usu-nome-erro" mensagem={errors.nome?.message} />
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="grid gap-1.5">
              <Label htmlFor="usu-email">E-mail</Label>
              <Input
                id="usu-email"
                type="email"
                autoComplete="off"
                readOnly={!!usuario}
                className={cn(usuario && "bg-muted")}
                aria-invalid={!!errors.email}
                aria-describedby="usu-email-ajuda usu-email-erro"
                {...register("email")}
              />
              <p id="usu-email-ajuda" className="text-[12px] text-muted-foreground">
                {usuario ? "É o login no portal e no app; não muda por aqui." : "Recebe o convite para criar a senha."}
              </p>
              <ErroCampo id="usu-email-erro" mensagem={errors.email?.message} />
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="usu-whats">WhatsApp</Label>
              <Input id="usu-whats" inputMode="tel" placeholder="(19) 99999-0000" aria-invalid={!!errors.telefone_whatsapp} aria-describedby="usu-whats-ajuda usu-whats-erro" {...register("telefone_whatsapp")} />
              <p id="usu-whats-ajuda" className="text-[12px] text-muted-foreground">Recebe avisos de OS e identifica a pessoa nos grupos.</p>
              <ErroCampo id="usu-whats-erro" mensagem={errors.telefone_whatsapp?.message} />
            </div>
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="grid gap-1.5">
              <Label htmlFor="usu-cargo">Cargo</Label>
              <Input id="usu-cargo" placeholder="Ex.: Técnico de campo" {...register("cargo")} />
            </div>
            <div className="grid gap-1.5">
              <Label id="usu-empresa-rotulo">Empresa</Label>
              <Controller
                control={control}
                name="organization_id"
                render={({ field }) => (
                  <Select items={itensEmpresa} value={field.value ?? ""} onValueChange={(v) => field.onChange(v ? v : null)} disabled={so}>
                    <SelectTrigger className="w-full" aria-labelledby="usu-empresa-rotulo">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {itensEmpresa.map((i) => (
                        <SelectItem key={i.value || "nenhuma"} value={i.value}>
                          {i.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}
              />
            </div>
          </div>

          <div className="grid gap-1.5">
            <Label id="usu-perfil-rotulo">Perfil de acesso</Label>
            {usuario?.is_super_admin ? (
              <p className="text-[13px] text-muted-foreground">Super admin: acesso total, sem perfil.</p>
            ) : (
              <Controller
                control={control}
                name="perfil"
                render={({ field }) => (
                  <Select
                    items={[{ value: "", label: "Sem perfil (só a Página Inicial)" }, ...perfis.map((p) => ({ value: p.chave, label: p.nome }))]}
                    value={field.value ?? ""}
                    onValueChange={(v) => field.onChange(v ? v : null)}
                    disabled={!podeDefinirPerfil}
                  >
                    <SelectTrigger className="w-full" aria-labelledby="usu-perfil-rotulo" aria-describedby="usu-perfil-ajuda">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="">Sem perfil (só a Página Inicial)</SelectItem>
                      {perfis.map((p) => (
                        <SelectItem key={p.chave} value={p.chave}>
                          {p.nome}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}
              />
            )}
            <p id="usu-perfil-ajuda" className="text-[12px] text-muted-foreground">
              Define os menus e as ações no sistema todo. O papel em cada projeto continua em Acesso por projeto.
            </p>
          </div>

          <div className="grid gap-1.5">
            <Label id="usu-equipes-rotulo">Equipes</Label>
            <Controller
              control={control}
              name="equipes"
              render={({ field }) =>
                equipes.length === 0 ? (
                  <p className="text-[13px] text-muted-foreground">
                    Nenhuma equipe cadastrada. Crie em{" "}
                    <Link href="/cadastros/equipes" className="font-semibold text-primary hover:underline">
                      Equipes
                    </Link>
                    .
                  </p>
                ) : (
                  <div role="group" aria-labelledby="usu-equipes-rotulo" className="flex flex-wrap gap-1.5">
                    {equipes.map((eq) => {
                      const marcada = field.value.includes(eq.id);
                      return (
                        <button
                          key={eq.id}
                          type="button"
                          aria-pressed={marcada}
                          disabled={so}
                          onClick={() => field.onChange(marcada ? field.value.filter((x) => x !== eq.id) : [...field.value, eq.id])}
                          className={cn(
                            "inline-flex min-h-8 items-center gap-1 rounded-full border px-3 text-[12.5px] font-medium focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring disabled:opacity-60",
                            marcada ? "border-primary bg-primary-soft text-primary" : "border-dashed border-border text-muted-foreground hover:bg-muted",
                          )}
                        >
                          {marcada ? <Check size={13} aria-hidden="true" /> : <Plus size={13} aria-hidden="true" />}
                          {eq.nome}
                        </button>
                      );
                    })}
                  </div>
                )
              }
            />
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <Controller
              control={control}
              name="atende_whatsapp"
              render={({ field }) => (
                <div className="flex items-start justify-between gap-3 rounded-[10px] border border-border p-3">
                  <div>
                    <Label htmlFor="usu-atende">Atende no WhatsApp</Label>
                    <p className="text-[12px] text-muted-foreground">Aparece no Monitor e recebe conversas da fila do setor.</p>
                  </div>
                  <Switch id="usu-atende" checked={field.value} onCheckedChange={field.onChange} disabled={so} />
                </div>
              )}
            />
            <Controller
              control={control}
              name="ativo"
              render={({ field }) => (
                <div className="flex items-start justify-between gap-3 rounded-[10px] border border-border p-3">
                  <div>
                    <Label htmlFor="usu-ativo">Usuário ativo</Label>
                    <p className="text-[12px] text-muted-foreground">Inativo some das listas de escolha, mas fica no histórico.</p>
                  </div>
                  <Switch id="usu-ativo" checked={field.value} onCheckedChange={field.onChange} disabled={so} />
                </div>
              )}
            />
          </div>
        </fieldset>

        {usuario && (
          <div className="grid gap-2 px-4 pb-4">
            <div className="flex items-center justify-between">
              <RotuloSecao>Acesso por projeto</RotuloSecao>
              <Link href="/cadastros/usuarios?aba=projetos" className="text-[12.5px] font-semibold text-primary hover:underline">
                Gerenciar acessos
              </Link>
            </div>
            {vinculos.length === 0 ? (
              <p className="text-[13px] text-muted-foreground">Não participa de nenhum projeto.</p>
            ) : (
              <ul className="divide-y divide-border-soft rounded-[10px] border border-border text-[13px]">
                {vinculos.map((p, i) => (
                  <li key={i} className={cn("flex items-center justify-between gap-2 px-3 py-2", !p.ativo && "text-muted-foreground")}>
                    <span className="truncate">
                      {p.projects!.codigo} · {p.projects!.nome}
                    </span>
                    <Badge variant={p.ativo ? "primary" : "neutral"}>
                      {ROTULO_PAPEL[p.role]}
                      {!p.ativo && " (inativo)"}
                    </Badge>
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}

        {podeEditar && (
          <div className="flex flex-wrap justify-end gap-2 border-t border-border px-4 py-3">
            {usuario && convitePendente && (
              <Button type="button" variant="outline" disabled={mReenviar.isPending} onClick={() => mReenviar.mutate(usuario.id)}>
                {mReenviar.isPending ? <Loader2 className="animate-spin" aria-hidden="true" /> : <Send aria-hidden="true" />}
                Reenviar convite
              </Button>
            )}
            <Button type="button" variant="outline" onClick={onFechar}>
              Cancelar
            </Button>
            <Button type="submit" disabled={mSalvar.isPending}>
              {mSalvar.isPending && <Loader2 className="animate-spin" aria-hidden="true" />}
              {usuario ? "Salvar usuário" : "Convidar"}
            </Button>
          </div>
        )}
      </form>
    </Card>
  );
}
