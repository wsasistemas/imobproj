import Link from "next/link";
import { Card, CardContent } from "@/components/ui/card";
import { telasDoMenu } from "@/config/menu";
import { CabecalhoPagina } from "./cabecalho-pagina";
import { IconeMenu } from "./icone-menu";

/** Tela no lugar da página quando o perfil de acesso não tem "ver" no item do menu. */
export function SemAcesso({ menu }: { menu: string }) {
  const tela = telasDoMenu().find(({ item }) => item.id === menu);
  const item = tela?.item;
  return (
    <>
      <CabecalhoPagina migalhas={[{ label: item?.label ?? "Acesso" }]} titulo={item?.label ?? "Sem acesso"} />
      <Card>
        <CardContent className="flex flex-col items-center gap-3 py-14 text-center">
          {item && <IconeMenu icon={item.icon} cor={item.cor} colorido={item.colorido} tamanho={52} />}
          <h2 className="mt-2 text-[17px] font-semibold">Seu perfil não tem acesso a esta tela</h2>
          <p className="max-w-md text-muted-foreground">
            Se você precisa usar <b>{item?.label ?? "esta tela"}</b>, peça ao administrador para liberar no seu perfil de
            acesso, em Configurações › Perfis e permissões.
          </p>
          <Link
            href="/"
            className="mt-2 inline-flex h-9 items-center gap-2 rounded-[8px] border border-border bg-card px-3.5 text-sm font-semibold hover:bg-muted"
          >
            Voltar para a Página Inicial
          </Link>
        </CardContent>
      </Card>
    </>
  );
}
