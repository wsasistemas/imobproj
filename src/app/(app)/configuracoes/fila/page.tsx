import type { Metadata } from "next";
import { FilaHorarios } from "@/components/configuracoes/fila";
import { CabecalhoPagina } from "@/components/shell/cabecalho-pagina";
import { SemAcesso } from "@/components/shell/sem-acesso";
import { pode } from "@/lib/perfil-acesso";

export const metadata: Metadata = { title: "Fila e horários" };

// Configurações › Fila e horários (Fase 3). Consulta quem tem "ver" em config_fila; grava quem tem "editar" (RLS setor_*_write).
export default async function FilaPage() {
  const [ver, editar] = await Promise.all([pode("config_fila"), pode("config_fila", "editar")]);
  if (!ver) return <SemAcesso menu="config_fila" />;
  return (
    <>
      <CabecalhoPagina
        migalhas={[{ label: "Configurações" }, { label: "Fila e horários" }]}
        titulo="Fila e horários"
        subtitulo="Horário, feriados, regras da fila e mensagens automáticas de cada setor."
      />
      <FilaHorarios podeEditar={editar} />
    </>
  );
}
