import { Construction } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { CabecalhoPagina } from "@/components/shell/cabecalho-pagina";
import { IconeMenu } from "@/components/shell/icone-menu";
import { Card, CardContent } from "@/components/ui/card";
import { telaExata } from "@/config/menu";

// Rotas do menu cujos módulos chegam nos próximos prompts. As telas reais (ex.: app/(app)/projetos/page.tsx)
// têm prioridade sobre esta rota coringa assim que forem criadas.

type Props = { params: Promise<{ rota: string[] }> };

function telaDa(rota: string[]) {
  return telaExata(`/${rota.join("/")}`);
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const tela = telaDa((await params).rota);
  return { title: tela?.item.label ?? "Página não encontrada" };
}

export default async function EmConstrucaoPage({ params }: Props) {
  const tela = telaDa((await params).rota);
  if (!tela) notFound();
  const { item, pai } = tela;

  return (
    <>
      <CabecalhoPagina
        migalhas={[...(pai ? [{ label: pai.label, href: pai.href }] : []), { label: item.label }]}
        titulo={item.label}
        subtitulo={item.descricao}
      />
      <Card>
        <CardContent className="flex flex-col items-center gap-3 py-14 text-center">
          <IconeMenu icon={item.icon} cor={item.cor} colorido={item.colorido} tamanho={52} />
          <h2 className="mt-2 text-[17px] font-semibold">Módulo em construção</h2>
          <p className="max-w-md text-muted-foreground">
            A estrutura do banco, as permissões e o menu já estão prontos. A tela de <b>{item.label}</b> chega na
            próxima fase do projeto.
          </p>
          <Link
            href="/"
            className="mt-2 inline-flex h-9 items-center gap-2 rounded-[8px] border border-border bg-card px-3.5 text-sm font-semibold hover:bg-muted"
          >
            <Construction size={16} aria-hidden="true" />
            Voltar para a Página Inicial
          </Link>
        </CardContent>
      </Card>
    </>
  );
}
