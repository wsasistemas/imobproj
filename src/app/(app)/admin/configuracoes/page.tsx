import { redirect } from "next/navigation";

// O item do menu mudou para Configurações › Configurações gerais (Fase 6).
export default function ConfiguracoesAntigo() {
  redirect("/configuracoes/gerais");
}
