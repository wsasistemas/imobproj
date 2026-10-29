"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Download, Loader2, Pencil, Plus, Star, Trash2, X } from "lucide-react";
import { useMemo, useState } from "react";
import { Controller, useForm } from "react-hook-form";
import { toast } from "sonner";
import type { z } from "zod";
import { removerContato, salvarCliente, salvarContato } from "@/app/(app)/cadastros/clientes/acoes";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { createClient } from "@/lib/supabase/client";
import { cn } from "@/lib/utils";
import { EstadoVazio, ErroBloco, ErroCampo, PilulaFiltro, RotuloSecao, SkeletonListaPainel } from "./blocos";
import {
  ROTULO_TIPO_ORGANIZACAO,
  TIPOS_ORGANIZACAO,
  esquemaCliente,
  esquemaContato,
  type TipoOrganizacao,
} from "./esquemas";
import { executar, formatarTelefone } from "./util";

type Contato = {
  id: string;
  nome: string;
  cargo: string | null;
  email: string | null;
  telefone_whatsapp: string | null;
  principal: boolean;
};
type Empresa = {
  id: string;
  nome: string;
  nome_fantasia: string | null;
  tipo: TipoOrganizacao;
  cnpj: string | null;
  segmento: string | null;
  endereco: string | null;
  ativo: boolean;
  organization_contacts: Contato[];
  projects: { id: string; codigo: string; nome: string }[];
};

const CHAVE = ["cadastros", "clientes"];
const ITENS_TIPO = TIPOS_ORGANIZACAO.map((t) => ({ value: t, label: ROTULO_TIPO_ORGANIZACAO[t] }));
const ITENS_FILTRO_TIPO = [{ value: "todos", label: "Todos os tipos" }, ...ITENS_TIPO];

function principalDe(e: Empresa) {
  return e.organization_contacts.find((c) => c.principal) ?? e.organization_contacts[0] ?? null;
}

export function Clientes({ podeEditar }: { podeEditar: boolean }) {
  const [busca, setBusca] = useState("");
  const [situacao, setSituacao] = useState<"ativos" | "inativos">("ativos");
  const [tipo, setTipo] = useState<string>("cliente");
  // null = nada aberto; "novo" = cadastro novo; id = edição
  const [aberto, setAberto] = useState<string | null>(null);

  const empresas = useQuery({
    queryKey: CHAVE,
    queryFn: async () => {
      const { data, error } = await createClient()
        .from("organizations")
        .select(
          "id, nome, nome_fantasia, tipo, cnpj, segmento, endereco, ativo, organization_contacts(id, nome, cargo, email, telefone_whatsapp, principal), projects!projects_cliente_org_id_fkey(id, codigo, nome)",
        )
        .order("nome");
      if (error) throw error;
      return (data ?? []) as unknown as Empresa[];
    },
  });

  const doTipo = useMemo(
    () => (empresas.data ?? []).filter((e) => tipo === "todos" || e.tipo === tipo),
    [empresas.data, tipo],
  );
  const contagem = { ativos: doTipo.filter((e) => e.ativo).length, inativos: doTipo.filter((e) => !e.ativo).length };
  const filtradas = useMemo(() => {
    const termo = busca.trim().toLowerCase();
    const termoDigitos = termo.replace(/\D/g, "");
    return doTipo.filter((e) => {
      if (e.ativo !== (situacao === "ativos")) return false;
      if (!termo) return true;
      const contato = principalDe(e);
      return (
        e.nome.toLowerCase().includes(termo) ||
        (e.nome_fantasia ?? "").toLowerCase().includes(termo) ||
        (contato?.nome ?? "").toLowerCase().includes(termo) ||
        (!!termoDigitos && (e.cnpj ?? "").replace(/\D/g, "").includes(termoDigitos))
      );
    });
  }, [doTipo, busca, situacao]);

  const selecionada = aberto && aberto !== "novo" ? (empresas.data ?? []).find((e) => e.id === aberto) ?? null : null;

  async function exportar() {
    const XLSX = await import("xlsx");
    const linhas = filtradas.map((e) => {
      const c = principalDe(e);
      return {
        "Razão social": e.nome,
        "Nome fantasia": e.nome_fantasia ?? "",
        Tipo: ROTULO_TIPO_ORGANIZACAO[e.tipo],
        CNPJ: e.cnpj ?? "",
        Segmento: e.segmento ?? "",
        Endereço: e.endereco ?? "",
        "Contato principal": c?.nome ?? "",
        "E-mail do contato": c?.email ?? "",
        WhatsApp: formatarTelefone(c?.telefone_whatsapp),
        Projetos: e.projects.map((p) => p.codigo).join(", "),
        Situação: e.ativo ? "Ativo" : "Inativo",
      };
    });
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(linhas), "Clientes");
    XLSX.writeFile(wb, "clientes-imobproj.xlsx");
  }

  if (empresas.isPending) return <SkeletonListaPainel />;
  if (empresas.isError) return <ErroBloco texto="Não foi possível carregar os clientes." onTentar={() => empresas.refetch()} />;

  return (
    <div className="grid gap-4">
      <div className="flex flex-wrap items-center justify-end gap-2">
        <Button variant="outline" onClick={() => void exportar()} disabled={filtradas.length === 0}>
          <Download aria-hidden="true" />
          Exportar Excel
        </Button>
        {podeEditar && (
          <Button onClick={() => setAberto("novo")}>
            <Plus aria-hidden="true" />
            Novo cliente
          </Button>
        )}
      </div>

      <div className={cn("grid items-start gap-4", aberto && "xl:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)]")}>
        <Card className="min-w-0 p-0">
          <div className="flex flex-wrap items-center gap-3 border-b border-border p-4">
            <Input
              value={busca}
              onChange={(e) => setBusca(e.target.value)}
              placeholder="Buscar por nome, CNPJ ou contato"
              aria-label="Buscar clientes"
              className="w-[min(320px,100%)]"
            />
            <Select items={ITENS_FILTRO_TIPO} value={tipo} onValueChange={(v) => setTipo(v ?? "cliente")}>
              <SelectTrigger className="w-[190px]" aria-label="Tipo de empresa">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {ITENS_FILTRO_TIPO.map((i) => (
                  <SelectItem key={i.value} value={i.value}>
                    {i.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <div className="flex gap-2">
              <PilulaFiltro ativa={situacao === "ativos"} onClick={() => setSituacao("ativos")}>
                Ativos · {contagem.ativos}
              </PilulaFiltro>
              <PilulaFiltro ativa={situacao === "inativos"} onClick={() => setSituacao("inativos")}>
                Inativos · {contagem.inativos}
              </PilulaFiltro>
            </div>
          </div>

          {filtradas.length === 0 ? (
            <div className="p-4">
              <EstadoVazio
                icone="clientes"
                titulo={busca ? "Nenhuma empresa encontrada" : "Nenhuma empresa aqui"}
                texto={
                  busca
                    ? "Nada corresponde à busca. Confira o nome, o CNPJ ou o contato."
                    : podeEditar
                      ? "Cadastre a primeira empresa em “Novo cliente”."
                      : "As empresas aparecem aqui quando o super admin as cadastra."
                }
              />
            </div>
          ) : (
            <Table>
              <caption className="sr-only">Empresas cadastradas</caption>
              <TableHeader>
                <TableRow>
                  <TableHead className="pl-4">Empresa</TableHead>
                  <TableHead>CNPJ</TableHead>
                  <TableHead>Contato principal</TableHead>
                  <TableHead>WhatsApp</TableHead>
                  <TableHead>Projetos</TableHead>
                  <TableHead className="pr-4">Situação</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filtradas.map((e) => {
                  const c = principalDe(e);
                  return (
                    <TableRow
                      key={e.id}
                      className={cn("cursor-pointer", aberto === e.id && "bg-primary-soft hover:bg-primary-soft")}
                      onClick={() => setAberto(e.id)}
                    >
                      <TableCell className="pl-4">
                        <button
                          type="button"
                          className="text-left font-semibold text-foreground hover:underline focus-visible:underline focus-visible:outline-none"
                          onClick={(ev) => {
                            ev.stopPropagation();
                            setAberto(e.id);
                          }}
                        >
                          {e.nome}
                        </button>
                        {tipo === "todos" && <span className="block text-[12px] text-muted-foreground">{ROTULO_TIPO_ORGANIZACAO[e.tipo]}</span>}
                      </TableCell>
                      <TableCell className="tabular-nums">{e.cnpj ?? "—"}</TableCell>
                      <TableCell>{c?.nome ?? "—"}</TableCell>
                      <TableCell className="tabular-nums">{formatarTelefone(c?.telefone_whatsapp) || "—"}</TableCell>
                      <TableCell className="tabular-nums">{e.projects.length}</TableCell>
                      <TableCell className="pr-4">
                        <Badge variant={e.ativo ? "success" : "neutral"}>{e.ativo ? "Ativo" : "Inativo"}</Badge>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          )}
        </Card>

        {aberto && (
          <FichaEmpresa
            key={aberto}
            empresa={selecionada}
            tipoInicial={tipo === "todos" ? "cliente" : (tipo as TipoOrganizacao)}
            podeEditar={podeEditar}
            onFechar={() => setAberto(null)}
            onSalvo={(id) => setAberto(id)}
          />
        )}
      </div>
    </div>
  );
}

const esquemaFormEmpresa = esquemaCliente.omit({ id: true });
type EntradaEmpresa = z.input<typeof esquemaFormEmpresa>;
type SaidaEmpresa = z.output<typeof esquemaFormEmpresa>;

function FichaEmpresa({
  empresa,
  tipoInicial,
  podeEditar,
  onFechar,
  onSalvo,
}: {
  empresa: Empresa | null;
  tipoInicial: TipoOrganizacao;
  podeEditar: boolean;
  onFechar: () => void;
  onSalvo: (id: string) => void;
}) {
  const queryClient = useQueryClient();
  const [contatoAberto, setContatoAberto] = useState<Contato | "novo" | null>(null);
  const {
    register,
    control,
    handleSubmit,
    formState: { errors, isDirty },
  } = useForm<EntradaEmpresa, unknown, SaidaEmpresa>({
    resolver: zodResolver(esquemaFormEmpresa),
    defaultValues: {
      nome: empresa?.nome ?? "",
      nome_fantasia: empresa?.nome_fantasia ?? "",
      tipo: empresa?.tipo ?? tipoInicial,
      cnpj: empresa?.cnpj ?? "",
      segmento: empresa?.segmento ?? "",
      endereco: empresa?.endereco ?? "",
      ativo: empresa?.ativo ?? true,
    },
  });

  const mSalvar = useMutation({
    mutationFn: (d: SaidaEmpresa) => executar(salvarCliente({ ...d, id: empresa?.id })),
    onSuccess: (id) => {
      toast.success(empresa ? "Empresa salva." : "Empresa cadastrada. Agora inclua os contatos.");
      queryClient.invalidateQueries({ queryKey: CHAVE });
      onSalvo(id);
    },
    onError: (e: Error) => toast.error(e.message),
  });
  const mRemoverContato = useMutation({
    mutationFn: (id: string) => executar(removerContato({ id })),
    onSuccess: () => toast.success("Contato removido."),
    onError: (e: Error) => toast.error(e.message),
    onSettled: () => queryClient.invalidateQueries({ queryKey: CHAVE }),
  });

  const so = !podeEditar;
  const contatos = [...(empresa?.organization_contacts ?? [])].sort(
    (a, b) => Number(b.principal) - Number(a.principal) || a.nome.localeCompare(b.nome, "pt-BR"),
  );

  return (
    <Card className="min-w-0 p-0">
      <form onSubmit={handleSubmit((d) => mSalvar.mutate(d))} noValidate>
        <div className="flex items-center justify-between gap-2 border-b border-border px-4 py-3">
          <h2 className="truncate text-[15px] font-semibold">{empresa ? empresa.nome : "Nova empresa"}</h2>
          <div className="flex items-center gap-2">
            {empresa && <Badge variant={empresa.ativo ? "success" : "neutral"}>{empresa.ativo ? "Ativo" : "Inativo"}</Badge>}
            <Button type="button" variant="ghost" size="icon" aria-label="Fechar ficha" onClick={onFechar}>
              <X aria-hidden="true" />
            </Button>
          </div>
        </div>

        <fieldset disabled={so || mSalvar.isPending} className="grid gap-4 p-4">
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="grid gap-1.5">
              <Label htmlFor="cli-nome">Razão social</Label>
              <Input id="cli-nome" aria-invalid={!!errors.nome} aria-describedby="cli-nome-erro" {...register("nome")} />
              <ErroCampo id="cli-nome-erro" mensagem={errors.nome?.message} />
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="cli-fantasia">Nome fantasia</Label>
              <Input id="cli-fantasia" {...register("nome_fantasia")} />
            </div>
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="grid gap-1.5">
              <Label htmlFor="cli-cnpj">CNPJ</Label>
              <Input id="cli-cnpj" inputMode="numeric" placeholder="00.000.000/0000-00" aria-invalid={!!errors.cnpj} aria-describedby="cli-cnpj-erro" {...register("cnpj")} />
              <ErroCampo id="cli-cnpj-erro" mensagem={errors.cnpj?.message} />
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="cli-segmento">Segmento</Label>
              <Input id="cli-segmento" placeholder="Ex.: Construção civil" {...register("segmento")} />
            </div>
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="grid gap-1.5">
              <Label id="cli-tipo-rotulo">Tipo</Label>
              <Controller
                control={control}
                name="tipo"
                render={({ field }) => (
                  <Select items={ITENS_TIPO} value={field.value} onValueChange={(v) => v && field.onChange(v)} disabled={so}>
                    <SelectTrigger className="w-full" aria-labelledby="cli-tipo-rotulo">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {ITENS_TIPO.map((i) => (
                        <SelectItem key={i.value} value={i.value}>
                          {i.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}
              />
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="cli-ativo">Situação</Label>
              <Controller
                control={control}
                name="ativo"
                render={({ field }) => (
                  <div className="flex min-h-9 items-center gap-2">
                    <Switch id="cli-ativo" checked={field.value} onCheckedChange={field.onChange} disabled={so} />
                    <span className="text-[13.5px]">{field.value ? "Ativo" : "Inativo"}</span>
                  </div>
                )}
              />
            </div>
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor="cli-endereco">Endereço</Label>
            <Input id="cli-endereco" placeholder="Rua, número, bairro, cidade/UF" {...register("endereco")} />
          </div>
        </fieldset>

        {empresa && (
          <div className="grid gap-3 px-4 pb-4">
            <div className="flex items-center justify-between">
              <RotuloSecao>Contatos</RotuloSecao>
              {podeEditar && (
                <Button type="button" variant="outline" size="sm" onClick={() => setContatoAberto("novo")}>
                  <Plus aria-hidden="true" />
                  Contato
                </Button>
              )}
            </div>
            {contatos.length === 0 ? (
              <p className="rounded-[10px] border border-dashed border-border px-3 py-3 text-[13px] text-muted-foreground">
                Nenhum contato. Inclua quem fala pela empresa (o principal aparece na lista).
              </p>
            ) : (
              <ul className="divide-y divide-border-soft rounded-[10px] border border-border">
                {contatos.map((c) => (
                  <li key={c.id} className="flex items-start justify-between gap-3 px-3 py-2.5 text-[13px]">
                    <div className="min-w-0">
                      <p className="font-semibold">
                        {c.nome} {c.principal && <Badge variant="info" className="ml-1">Principal</Badge>}
                      </p>
                      <p className="text-muted-foreground">{c.cargo ?? "—"}</p>
                    </div>
                    <div className="min-w-0 text-right text-muted-foreground">
                      <p className="truncate">{c.email ?? "—"}</p>
                      <p className="tabular-nums">{formatarTelefone(c.telefone_whatsapp) || "—"}</p>
                    </div>
                    {podeEditar && (
                      <div className="flex shrink-0 gap-0.5">
                        <Button type="button" variant="ghost" size="icon" aria-label={`Editar ${c.nome}`} onClick={() => setContatoAberto(c)}>
                          <Pencil aria-hidden="true" />
                        </Button>
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          className="text-danger hover:text-danger"
                          aria-label={`Remover ${c.nome}`}
                          disabled={mRemoverContato.isPending && mRemoverContato.variables === c.id}
                          onClick={() => mRemoverContato.mutate(c.id)}
                        >
                          <Trash2 aria-hidden="true" />
                        </Button>
                      </div>
                    )}
                  </li>
                ))}
              </ul>
            )}

            <RotuloSecao className="mt-1">Projetos</RotuloSecao>
            {empresa.projects.length === 0 ? (
              <p className="text-[13px] text-muted-foreground">Nenhum projeto em que esta empresa é a cliente.</p>
            ) : (
              <div className="flex flex-wrap gap-1.5">
                {empresa.projects.map((p) => (
                  <Badge key={p.id} variant="purple">
                    {p.codigo} · {p.nome}
                  </Badge>
                ))}
              </div>
            )}
          </div>
        )}

        {podeEditar && (
          <div className="flex justify-end gap-2 border-t border-border px-4 py-3">
            <Button type="button" variant="outline" onClick={onFechar}>
              Cancelar
            </Button>
            <Button type="submit" disabled={mSalvar.isPending || (!!empresa && !isDirty)}>
              {mSalvar.isPending && <Loader2 className="animate-spin" aria-hidden="true" />}
              {empresa ? "Salvar cliente" : "Cadastrar"}
            </Button>
          </div>
        )}
      </form>

      {empresa && contatoAberto && (
        <DialogContato
          key={contatoAberto === "novo" ? "novo" : contatoAberto.id}
          organizacaoId={empresa.id}
          contato={contatoAberto === "novo" ? null : contatoAberto}
          primeiro={contatos.length === 0}
          onFechar={() => setContatoAberto(null)}
        />
      )}
    </Card>
  );
}

const esquemaFormContato = esquemaContato.omit({ id: true, organization_id: true });
type EntradaContato = z.input<typeof esquemaFormContato>;
type SaidaContato = z.output<typeof esquemaFormContato>;

function DialogContato({
  organizacaoId,
  contato,
  primeiro,
  onFechar,
}: {
  organizacaoId: string;
  contato: Contato | null;
  primeiro: boolean;
  onFechar: () => void;
}) {
  const queryClient = useQueryClient();
  const {
    register,
    control,
    handleSubmit,
    formState: { errors },
  } = useForm<EntradaContato, unknown, SaidaContato>({
    resolver: zodResolver(esquemaFormContato),
    defaultValues: {
      nome: contato?.nome ?? "",
      cargo: contato?.cargo ?? "",
      email: contato?.email ?? "",
      telefone_whatsapp: formatarTelefone(contato?.telefone_whatsapp),
      principal: contato?.principal ?? primeiro,
    },
  });
  const m = useMutation({
    mutationFn: (d: SaidaContato) => executar(salvarContato({ ...d, id: contato?.id, organization_id: organizacaoId })),
    onSuccess: () => {
      toast.success(contato ? "Contato salvo." : "Contato incluído.");
      queryClient.invalidateQueries({ queryKey: CHAVE });
      onFechar();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <Dialog open onOpenChange={(v) => !v && onFechar()}>
      <DialogContent className="sm:max-w-md">
        <form onSubmit={handleSubmit((d) => m.mutate(d))} noValidate className="grid gap-4">
          <DialogHeader>
            <DialogTitle>{contato ? "Editar contato" : "Novo contato"}</DialogTitle>
            <DialogDescription>Quem fala pela empresa. O contato principal aparece na lista de clientes.</DialogDescription>
          </DialogHeader>
          <div className="grid gap-1.5">
            <Label htmlFor="ct-nome">Nome</Label>
            <Input id="ct-nome" aria-invalid={!!errors.nome} aria-describedby="ct-nome-erro" {...register("nome")} />
            <ErroCampo id="ct-nome-erro" mensagem={errors.nome?.message} />
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor="ct-cargo">Cargo</Label>
            <Input id="ct-cargo" placeholder="Ex.: Usuário-chave · diretora" {...register("cargo")} />
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="grid gap-1.5">
              <Label htmlFor="ct-email">E-mail</Label>
              <Input id="ct-email" type="email" aria-invalid={!!errors.email} aria-describedby="ct-email-erro" {...register("email")} />
              <ErroCampo id="ct-email-erro" mensagem={errors.email?.message} />
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="ct-whats">WhatsApp</Label>
              <Input id="ct-whats" inputMode="tel" placeholder="(19) 99999-0000" aria-invalid={!!errors.telefone_whatsapp} aria-describedby="ct-whats-erro" {...register("telefone_whatsapp")} />
              <ErroCampo id="ct-whats-erro" mensagem={errors.telefone_whatsapp?.message} />
            </div>
          </div>
          <Controller
            control={control}
            name="principal"
            render={({ field }) => (
              <label className="flex items-center gap-2 text-[13.5px]">
                <Checkbox checked={field.value} onCheckedChange={(v) => field.onChange(!!v)} />
                <Star size={14} className="text-warning" aria-hidden="true" />
                Contato principal
              </label>
            )}
          />
          <DialogFooter>
            <Button type="button" variant="outline" onClick={onFechar}>
              Cancelar
            </Button>
            <Button type="submit" disabled={m.isPending}>
              {m.isPending && <Loader2 className="animate-spin" aria-hidden="true" />}
              Salvar contato
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
