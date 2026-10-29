import { redirect } from "next/navigation";

type Props = { searchParams: Promise<{ aba?: string }> };

// "Equipe e permissões" virou Cadastros › Usuários (abas "Acesso por projeto" e "Matriz de permissões").
export default async function EquipePage({ searchParams }: Props) {
  const { aba } = await searchParams;
  redirect(aba === "matriz" ? "/cadastros/usuarios?aba=matriz" : "/cadastros/usuarios?aba=projetos");
}
