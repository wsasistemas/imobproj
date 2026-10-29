"use client";

import { Icon } from "@iconify/react";
import { ICONES_MENU, type ChaveIcone } from "./icones-menu.data";

/** Ícone Fluent Color do Portal Atendimento (dados embutidos: nada é buscado na API do Iconify). */
export function IconeColorido({ nome, tamanho = 22 }: { nome: ChaveIcone; tamanho?: number }) {
  return <Icon icon={ICONES_MENU[nome].data} width={tamanho} height={tamanho} aria-hidden="true" />;
}
