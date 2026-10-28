"use client";

import { useQuery } from "@tanstack/react-query";
import { Loader2, UserMinus, UserPlus, Users } from "lucide-react";
import { useMemo, useState } from "react";
import {
  adicionarParticipantes,
  definirPresenca,
  removerParticipante,
} from "@/app/(app)/projetos/[id]/atas/acoes";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Skeleton } from "@/components/ui/skeleton";
import { Switch } from "@/components/ui/switch";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { pode } from "@/lib/projeto/permissoes";
import { ROTULO_PAPEL, type Papel } from "@/lib/projeto/tipos";
import { RotuloSecao } from "./campos";
import {
  buscarMembros,
  chavesAtas,
  formatarDataHora,
  PAPEIS_CIENCIA,
  type AtaDetalhe,
  type MembroProjeto,
} from "./dados";
import { useAcaoAta } from "./use-acao";

type Props = { projetoId: string; ata: AtaDetalhe; papel: Papel };

export function Participantes({ projetoId, ata, papel }: Props) {
  const podeEditar = pode(papel, "ata_redigir") && ata.status !== "aprovada";
  const membros = useQuery({ queryKey: chavesAtas.membros(projetoId), queryFn: () => buscarMembros(projetoId) });
  const papelDe = useMemo(() => new Map((membros.data ?? []).map((m) => [m.id, m.papel])), [membros.data]);

  const presencaMut = useAcaoAta(projetoId, definirPresenca, null);
  const removerMut = useAcaoAta(projetoId, removerParticipante, "Participante removido.");

  const presentes = ata.participantes.filter((p) => p.presenca === "presente").length;
  const comCiencia = ata.participantes.filter((p) => p.ciente_em).length;

  return (
    <Card className="gap-0 py-0" aria-labelledby={`participantes-${ata.id}`}>
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border px-5 py-3">
        <div>
          <RotuloSecao id={`participantes-${ata.id}`}>Participantes</RotuloSecao>
          {ata.participantes.length > 0 && (
            <p className="mt-0.5 text-[12.5px] text-muted-foreground">
              {presentes} de {ata.participantes.length} presentes · {comCiencia} com ciência
            </p>
          )}
        </div>
        {podeEditar && (
          <DialogAdicionar
            projetoId={projetoId}
            ata={ata}
            membros={membros.data}
            carregando={membros.isPending}
            erro={membros.isError ? membros.error.message : null}
          />
        )}
      </div>

      {ata.participantes.length === 0 ? (
        <CardContent className="flex flex-col items-center gap-1 py-8 text-center">
          <Users className="size-6 text-muted-foreground" aria-hidden="true" />
          <p className="font-medium">Nenhum participante</p>
          <p className="max-w-md text-[13px] text-muted-foreground">
            {podeEditar
              ? "Adicione os membros do projeto que participaram da reunião. Diretores e usuários-chave darão ciência depois da publicação."
              : "O gerente ainda não registrou os participantes desta reunião."}
          </p>
        </CardContent>
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="pl-5">Nome</TableHead>
              <TableHead className="hidden sm:table-cell">Papel</TableHead>
              <TableHead>Presença</TableHead>
              <TableHead>Ciência</TableHead>
              {podeEditar && <TableHead className="w-12 pr-5"><span className="sr-only">Ações</span></TableHead>}
            </TableRow>
          </TableHeader>
          <TableBody>
            {ata.participantes.map((p) => {
              const papelP = papelDe.get(p.user_id);
              const daCiencia = !!papelP && PAPEIS_CIENCIA.includes(papelP);
              const presente = p.presenca === "presente";
              const mudandoPresenca = presencaMut.isPending && presencaMut.variables?.participanteId === p.id;
              return (
                <TableRow key={p.id}>
                  <TableCell className="pl-5 font-medium">
                    {p.nome}
                    <span className="block text-[12px] font-normal text-muted-foreground sm:hidden">
                      {papelP ? ROTULO_PAPEL[papelP] : "Fora da equipe"}
                    </span>
                  </TableCell>
                  <TableCell className="hidden text-muted-foreground sm:table-cell">
                    {papelP ? ROTULO_PAPEL[papelP] : membros.isPending ? <Skeleton className="h-4 w-20" /> : "Fora da equipe"}
                  </TableCell>
                  <TableCell>
                    {podeEditar ? (
                      <label className="inline-flex min-h-9 cursor-pointer items-center gap-2">
                        <Switch
                          checked={presente}
                          disabled={mudandoPresenca}
                          onCheckedChange={(v) =>
                            presencaMut.mutate({ projectId: projetoId, participanteId: p.id, presenca: v ? "presente" : "ausente" })
                          }
                          aria-label={`Presença de ${p.nome}`}
                        />
                        <span className={presente ? "text-success" : "text-muted-foreground"}>
                          {presente ? "Presente" : "Ausente"}
                        </span>
                      </label>
                    ) : (
                      <Badge variant={presente ? "success" : "neutral"}>{presente ? "Presente" : "Ausente"}</Badge>
                    )}
                  </TableCell>
                  <TableCell>
                    {p.ciente_em ? (
                      <span className="text-[13px] text-success">{formatarDataHora(p.ciente_em)}</span>
                    ) : daCiencia ? (
                      <Badge variant={ata.status === "rascunho" ? "neutral" : "warning"}>
                        {ata.status === "rascunho" ? "Após publicar" : "Pendente"}
                      </Badge>
                    ) : (
                      <span className="text-[13px] text-muted-foreground" title="Só diretores e usuários-chave dão ciência">
                        Não se aplica
                      </span>
                    )}
                  </TableCell>
                  {podeEditar && (
                    <TableCell className="pr-5">
                      <Button
                        variant="ghost"
                        size="icon"
                        aria-label={`Remover ${p.nome} dos participantes`}
                        disabled={removerMut.isPending && removerMut.variables?.participanteId === p.id}
                        onClick={() => removerMut.mutate({ projectId: projetoId, participanteId: p.id })}
                      >
                        <UserMinus aria-hidden="true" />
                      </Button>
                    </TableCell>
                  )}
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      )}
    </Card>
  );
}

function DialogAdicionar({
  projetoId,
  ata,
  membros,
  carregando,
  erro,
}: {
  projetoId: string;
  ata: AtaDetalhe;
  membros: MembroProjeto[] | undefined;
  carregando: boolean;
  erro: string | null;
}) {
  const [aberto, setAberto] = useState(false);
  const [escolhidos, setEscolhidos] = useState<Set<string>>(new Set());
  const jaParticipam = new Set(ata.participantes.map((p) => p.user_id));
  const disponiveis = (membros ?? []).filter((m) => !jaParticipam.has(m.id));

  const mut = useAcaoAta(
    projetoId,
    adicionarParticipantes,
    (r) => (r.adicionados === 1 ? "1 participante adicionado." : `${r.adicionados} participantes adicionados.`),
    () => {
      setAberto(false);
      setEscolhidos(new Set());
    },
  );

  const alternar = (id: string, marcado: boolean) =>
    setEscolhidos((s) => {
      const n = new Set(s);
      if (marcado) n.add(id);
      else n.delete(id);
      return n;
    });

  return (
    <Dialog
      open={aberto}
      onOpenChange={(a) => {
        setAberto(a);
        if (!a) setEscolhidos(new Set());
      }}
    >
      <DialogTrigger render={<Button variant="outline" size="sm" />}>
        <UserPlus aria-hidden="true" />
        Adicionar
      </DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Adicionar participantes</DialogTitle>
          <DialogDescription>Escolha entre os membros ativos do projeto. Todos entram como presentes.</DialogDescription>
        </DialogHeader>

        {carregando ? (
          <div className="grid gap-2" aria-busy="true" aria-label="Carregando equipe">
            {[1, 2, 3].map((i) => (
              <Skeleton key={i} className="h-9 w-full" />
            ))}
          </div>
        ) : erro ? (
          <p role="alert" className="text-[13px] text-danger">
            {erro}
          </p>
        ) : disponiveis.length === 0 ? (
          <p className="text-[13px] text-muted-foreground">
            Todos os membros ativos do projeto já são participantes. Para incluir outra pessoa, adicione-a antes à equipe do
            projeto (Administração › Equipe e permissões).
          </p>
        ) : (
          <fieldset className="grid max-h-[50vh] gap-1 overflow-y-auto pr-1">
            <legend className="sr-only">Membros do projeto</legend>
            <label className="flex min-h-9 cursor-pointer items-center gap-3 rounded-md px-2 text-[13px] font-medium hover:bg-muted">
              <Checkbox
                checked={escolhidos.size === disponiveis.length}
                indeterminate={escolhidos.size > 0 && escolhidos.size < disponiveis.length}
                onCheckedChange={(v) => setEscolhidos(v ? new Set(disponiveis.map((m) => m.id)) : new Set())}
              />
              Selecionar todos
            </label>
            {disponiveis.map((m) => (
              <label
                key={m.id}
                className="flex min-h-9 cursor-pointer items-center gap-3 rounded-md px-2 hover:bg-muted"
              >
                <Checkbox checked={escolhidos.has(m.id)} onCheckedChange={(v) => alternar(m.id, !!v)} />
                <span className="min-w-0 flex-1 truncate">{m.nome}</span>
                <span className="text-[12px] text-muted-foreground">{ROTULO_PAPEL[m.papel]}</span>
              </label>
            ))}
          </fieldset>
        )}

        <DialogFooter>
          <Button variant="outline" type="button" onClick={() => setAberto(false)}>
            Cancelar
          </Button>
          <Button
            disabled={escolhidos.size === 0 || mut.isPending}
            onClick={() => mut.mutate({ projectId: projetoId, meetingId: ata.id, userIds: [...escolhidos] })}
          >
            {mut.isPending && <Loader2 className="animate-spin" aria-hidden="true" />}
            Adicionar{escolhidos.size > 0 ? ` (${escolhidos.size})` : ""}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
