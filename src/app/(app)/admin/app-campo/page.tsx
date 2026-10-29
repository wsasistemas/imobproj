import { redirect } from "next/navigation";

// O item do menu mudou para Configurações › App de OS (Fase 5).
export default function AppCampoAntigo() {
  redirect("/configuracoes/app-campo");
}
