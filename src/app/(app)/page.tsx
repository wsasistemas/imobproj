import { Info } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { CabecalhoPagina } from "@/components/shell/cabecalho-pagina";
import { IconeMenu } from "@/components/shell/icone-menu";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { cookies } from "next/headers";
import { hrefDoItem, telasDoMenu } from "@/config/menu";
import { COOKIE_PROJETO_ATUAL } from "@/lib/tema";
import { SITUACAO_PROJETO, type ProjectStatus } from "@/lib/projeto/tipos";
import { usuarioLogado } from "@/lib/sessao";
import { createClient } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "Página Inicial" };

type ProgressoProjeto = {
  project_id: string;
  codigo: string;
  nome: string;
  status: ProjectStatus;
  horas_aprovadas: number;
  horas_orcadas_eap: number;
  os_aguardando_aceite: number;
  percentual: number;
};


const formatoHoras = new Intl.NumberFormat("pt-BR", { maximumFractionDigits: 1 });

export default async function PaginaInicial() {
  const usuario = await usuarioLogado();
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("v_project_progress")
    .select("project_id, codigo, nome, status, horas_aprovadas, horas_orcadas_eap, os_aguardando_aceite, percentual")
    .order("codigo");
  const projetos = (data ?? []) as ProgressoProjeto[];
  const atalhos = telasDoMenu().filter(({ item }) => item.href !== "/");
  // Atalhos de projeto apontam para o último projeto aberto (cookie) ou, sem ele, o primeiro da lista.
  const cookieProjeto = (await cookies()).get(COOKIE_PROJETO_ATUAL)?.value;
  const projetoAtual = projetos.find((p) => p.project_id === cookieProjeto)?.project_id ?? projetos[0]?.project_id;

  return (
    <>
      <CabecalhoPagina
        titulo={`Olá, ${usuario.nome.split(" ")[0]}`}
        subtitulo="Resumo dos seus projetos, pendências e próximos marcos."
      />

      <div
        role="note"
        className="mb-6 flex items-start gap-3 rounded-[12px] border border-banner-info-border bg-banner-info-bg px-4 py-3 text-[13.5px]"
      >
        <Info size={18} className="mt-px shrink-0 text-info" aria-hidden="true" />
        <p>
          O <b>avanço físico</b> de cada atividade é calculado pelas <b>horas de OS aprovadas</b> ÷ <b>horas orçadas na EAP</b>.
          OS marcadas como fora do escopo não entram na conta.
        </p>
      </div>

      <Card className="mb-6 py-0">
        <CardHeader className="border-b py-4">
          <CardTitle>Seus projetos</CardTitle>
        </CardHeader>
        <CardContent className="px-0">
          {error ? (
            <p className="px-5 py-8 text-center text-muted-foreground">Não foi possível carregar os projetos agora.</p>
          ) : projetos.length === 0 ? (
            <p className="px-5 py-8 text-center text-muted-foreground">
              Você ainda não participa de nenhum projeto. Peça ao gerente para incluir você na equipe.
            </p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="pl-5">Projeto</TableHead>
                  <TableHead>Situação</TableHead>
                  <TableHead className="w-[28%]">Avanço físico</TableHead>
                  <TableHead className="text-right">Horas aprovadas</TableHead>
                  <TableHead className="pr-5 text-right">OS para aceite</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {projetos.map((p) => {
                  const situacao = SITUACAO_PROJETO[p.status] ?? { label: p.status, variant: "neutral" as const };
                  const pct = Number(p.percentual);
                  return (
                    <TableRow key={p.project_id}>
                      <TableCell className="pl-5">
                        <span className="font-semibold">{p.codigo}</span>
                        <span className="text-muted-foreground"> · {p.nome}</span>
                      </TableCell>
                      <TableCell>
                        <Badge variant={situacao.variant}>{situacao.label}</Badge>
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center gap-2.5">
                          <div
                            className="h-2 flex-1 overflow-hidden rounded-full bg-muted"
                            role="progressbar"
                            aria-valuenow={pct}
                            aria-valuemin={0}
                            aria-valuemax={100}
                            aria-label={`Avanço físico de ${p.codigo}`}
                          >
                            <div className="h-full rounded-full bg-primary" style={{ width: `${pct}%` }} />
                          </div>
                          <span className="w-12 text-right tabular-nums">{formatoHoras.format(pct)}%</span>
                        </div>
                      </TableCell>
                      <TableCell className="text-right tabular-nums">
                        {formatoHoras.format(Number(p.horas_aprovadas))} / {formatoHoras.format(Number(p.horas_orcadas_eap))} h
                      </TableCell>
                      <TableCell className="pr-5 text-right">
                        {p.os_aguardando_aceite > 0 ? (
                          <Badge variant="warning">{p.os_aguardando_aceite}</Badge>
                        ) : (
                          <span className="text-muted-foreground">—</span>
                        )}
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      <h2 className="rotulo-secao mb-3">Módulos</h2>
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
        {atalhos.map(({ item, pai }) => (
          <Link
            key={item.id}
            href={hrefDoItem(item, projetoAtual)}
            className="group flex items-start gap-3 rounded-[12px] border border-border bg-card p-4 shadow-[var(--shadow-card)] transition-colors hover:border-primary-border hover:bg-primary-soft focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
          >
            <IconeMenu icon={item.icon} cor={item.cor} tamanho={36} />
            <span className="min-w-0">
              <span className="block font-semibold group-hover:text-primary">
                {pai ? `${pai.label} · ` : ""}
                {item.label}
              </span>
              <span className="mt-0.5 block text-[13px] text-muted-foreground">{item.descricao}</span>
            </span>
          </Link>
        ))}
      </div>
    </>
  );
}
