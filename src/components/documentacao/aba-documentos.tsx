"use client";

import { FileText, Paperclip, Search, Upload } from "lucide-react";
import { useMemo, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { pode } from "@/lib/projeto/permissoes";
import { SITUACAO_DOCUMENTO, TIPO_DOCUMENTO } from "@/lib/projeto/tipos";
import { EsqueletoTabela, EstadoVazio, ErroCarregar } from "./comum";
import { useDocumentos, useMembros } from "./consultas";
import { DialogEnvio } from "./dialog-envio";
import type { PropsModulo } from "./documentacao";
import { PainelDocumento } from "./painel-documento";
import { dataHora } from "./utilidades";

export function AbaDocumentos({ projetoId, papel, userId }: PropsModulo) {
  const { data: documentos, isPending, isError, error, refetch } = useDocumentos(projetoId);
  const { data: membros = [] } = useMembros(projetoId);
  const [busca, setBusca] = useState("");
  const [selecionadoId, setSelecionadoId] = useState<string | null>(null);
  const [envioAberto, setEnvioAberto] = useState(false);
  const podeEditar = pode(papel, "documento_editar");

  const filtrados = useMemo(() => {
    const termo = busca.trim().toLowerCase();
    if (!documentos) return [];
    if (!termo) return documentos;
    return documentos.filter(
      (d) => d.titulo.toLowerCase().includes(termo) || TIPO_DOCUMENTO[d.tipo].toLowerCase().includes(termo),
    );
  }, [documentos, busca]);

  const selecionado = documentos?.find((d) => d.id === selecionadoId) ?? null;

  return (
    <div className="grid gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="relative w-full max-w-xs">
          <Search size={16} aria-hidden="true" className="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-muted-foreground" />
          <Input
            type="search"
            aria-label="Buscar documentos por título ou tipo"
            placeholder="Buscar por título ou tipo"
            value={busca}
            onChange={(e) => setBusca(e.target.value)}
            className="pl-9"
          />
        </div>
        {podeEditar && (
          <Button onClick={() => setEnvioAberto(true)}>
            <Upload aria-hidden="true" /> Enviar documento
          </Button>
        )}
      </div>

      {isPending ? (
        <EsqueletoTabela rotulo="Carregando documentos" />
      ) : isError ? (
        <ErroCarregar mensagem={error.message} tentar={() => refetch()} />
      ) : documentos.length === 0 ? (
        <EstadoVazio
          icone={FileText}
          titulo="Nenhum documento neste projeto"
          acao={
            podeEditar && (
              <Button onClick={() => setEnvioAberto(true)}>
                <Upload aria-hidden="true" /> Enviar o primeiro documento
              </Button>
            )
          }
        >
          Aqui ficam termo de abertura, escopo, RACI, requisitos e demais documentos, com versão, situação e comentários.
          {!podeEditar && " O gerente do projeto é quem envia os arquivos."}
        </EstadoVazio>
      ) : (
        <div className="overflow-hidden rounded-[12px] border border-border bg-card">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Tipo</TableHead>
                <TableHead>Título</TableHead>
                <TableHead>Versão</TableHead>
                <TableHead>Situação</TableHead>
                <TableHead>Atualizado em</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtrados.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={5} className="py-8 text-center text-muted-foreground">
                    Nenhum documento encontrado para “{busca}”. Tente outro termo.
                  </TableCell>
                </TableRow>
              ) : (
                filtrados.map((d) => (
                  <TableRow
                    key={d.id}
                    aria-selected={d.id === selecionadoId}
                    className="cursor-pointer"
                    onClick={() => setSelecionadoId(d.id)}
                  >
                    <TableCell className="text-muted-foreground">{TIPO_DOCUMENTO[d.tipo]}</TableCell>
                    <TableCell className="max-w-[420px] whitespace-normal">
                      <button
                        type="button"
                        className="inline-flex items-center gap-1.5 text-left font-medium hover:underline focus-visible:underline focus-visible:outline-none"
                        onClick={(e) => {
                          e.stopPropagation();
                          setSelecionadoId(d.id);
                        }}
                      >
                        {d.titulo}
                        {d.storage_path && <Paperclip size={13} className="text-muted-foreground" aria-label="Tem arquivo" />}
                      </button>
                    </TableCell>
                    <TableCell className="tabular-nums">{d.versao}</TableCell>
                    <TableCell>
                      <Badge variant={SITUACAO_DOCUMENTO[d.status].variant}>{SITUACAO_DOCUMENTO[d.status].label}</Badge>
                    </TableCell>
                    <TableCell className="text-muted-foreground tabular-nums">{dataHora(d.updated_at)}</TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </div>
      )}

      <PainelDocumento
        projetoId={projetoId}
        documento={selecionado}
        papel={papel}
        userId={userId}
        membros={membros}
        aoFechar={() => setSelecionadoId(null)}
      />
      <DialogEnvio projetoId={projetoId} aberto={envioAberto} aoMudar={setEnvioAberto} aoCriar={setSelecionadoId} />
    </div>
  );
}
