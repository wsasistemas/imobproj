import { redirect } from "next/navigation";

// Centro de Treinamento: a entrada é "Meus treinamentos".
export default function TreinamentoPage() {
  redirect("/treinamento/meus");
}
