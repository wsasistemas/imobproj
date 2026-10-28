import type { Metadata } from "next";
import { Documentacao, type AbaDocumentacao } from "@/components/documentacao/documentacao";
import { contextoProjeto } from "@/lib/projeto/servidor";

export const metadata: Metadata = { title: "Documentação e EAP" };

type Props = { params: Promise<{ id: string }>; searchParams: Promise<{ aba?: string; doc?: string }> };

const ABAS: AbaDocumentacao[] = ["documentos", "eap", "processos"];

// Documentação e EAP: sub-abas Documentos | EAP | Processos (?aba=). O cabeçalho do projeto vem do layout.
export default async function DocumentacaoPage({ params, searchParams }: Props) {
  const [{ id }, sp] = await Promise.all([params, searchParams]);
  const { papel, userId } = await contextoProjeto(id);
  const aba = ABAS.includes(sp.aba as AbaDocumentacao) ? (sp.aba as AbaDocumentacao) : "documentos";
  return <Documentacao projetoId={id} papel={papel} userId={userId} abaInicial={aba} />;
}
