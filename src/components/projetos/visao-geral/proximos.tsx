"use client";

import { useQuery } from "@tanstack/react-query";
import { CalendarClock, Diamond, Users } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { veProjetoInteiro } from "@/lib/projeto/permissoes";
import { SITUACAO_ATA, type MeetingStatus, type Papel } from "@/lib/projeto/tipos";
import { createClient } from "@/lib/supabase/client";
import { dataExtenso, distanciaDias, hojeISO } from "../formatos";
import { Bloco, ErroBloco, EsqueletoLinhas, Vazio } from "./bloco";

type Marco = { id: string; codigo: string; titulo: string; fim: string };
type Reuniao = { id: string; numero: number; titulo: string; data: string; inicio: string | null; local: string | null; status: MeetingStatus };

/** Próximos marcos (EAP is_milestone, fim ≥ hoje) e próximas reuniões (meetings, data ≥ hoje). */
export function ProximosEventos({ projetoId, papel }: { projetoId: string; papel: Papel }) {
  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ["projeto", projetoId, "visao-geral", "proximos", hojeISO()],
    queryFn: async () => {
      const supabase = createClient();
      const hoje = hojeISO();
      const [marcos, reunioes] = await Promise.all([
        supabase
          .from("wbs_items")
          .select("id, codigo, titulo, fim")
          .eq("project_id", projetoId)
          .eq("is_milestone", true)
          .gte("fim", hoje)
          .order("fim")
          .limit(5),
        supabase
          .from("meetings")
          .select("id, numero, titulo, data, inicio, local, status")
          .eq("project_id", projetoId)
          .gte("data", hoje)
          .order("data")
          .order("inicio")
          .limit(5),
      ]);
      if (marcos.error) throw marcos.error;
      if (reunioes.error) throw reunioes.error;
      return { marcos: (marcos.data ?? []) as Marco[], reunioes: (reunioes.data ?? []) as Reuniao[] };
    },
    enabled: veProjetoInteiro(papel),
  });

  return (
    <Bloco titulo="Próximos marcos e reuniões" icone={CalendarClock} cor="var(--sys-red)">
      {!veProjetoInteiro(papel) ? (
        <Vazio>Marcos e reuniões do projeto não ficam visíveis para o seu papel. Suas OS agendadas estão na aba Ordens de Serviço.</Vazio>
      ) : isLoading ? (
        <EsqueletoLinhas linhas={4} />
      ) : isError ? (
        <ErroBloco tentar={() => refetch()} />
      ) : (
        <div className="space-y-4">
          <div>
            <h3 className="rotulo-secao mb-2">Marcos</h3>
            {data!.marcos.length === 0 ? (
              <Vazio>Nenhum marco à frente. Marcos são itens da EAP marcados como marco.</Vazio>
            ) : (
              <ul className="space-y-2">
                {data!.marcos.map((m) => (
                  <li key={m.id} className="flex items-start gap-2.5">
                    <Diamond size={15} className="mt-0.5 shrink-0 fill-current text-[var(--sys-red)]" aria-hidden="true" />
                    <div className="min-w-0">
                      <p className="text-[13px] font-medium">
                        <span className="text-muted-foreground">{m.codigo}</span> {m.titulo}
                      </p>
                      <p className="text-[12px] text-muted-foreground first-letter:uppercase">
                        {dataExtenso(m.fim)} · {distanciaDias(m.fim)}
                      </p>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </div>
          <div>
            <h3 className="rotulo-secao mb-2">Reuniões</h3>
            {data!.reunioes.length === 0 ? (
              <Vazio>Nenhuma reunião marcada. O gerente agenda as reuniões em Atas de reunião.</Vazio>
            ) : (
              <ul className="space-y-2">
                {data!.reunioes.map((r) => (
                  <li key={r.id} className="flex items-start gap-2.5">
                    <Users size={15} className="mt-0.5 shrink-0 text-[var(--sys-purple)]" aria-hidden="true" />
                    <div className="min-w-0 flex-1">
                      <p className="flex flex-wrap items-center gap-x-2 text-[13px] font-medium">
                        {r.titulo}
                        {r.status !== "rascunho" && (
                          <Badge variant={SITUACAO_ATA[r.status].variant} className="h-5 px-2">
                            {SITUACAO_ATA[r.status].label}
                          </Badge>
                        )}
                      </p>
                      <p className="text-[12px] text-muted-foreground first-letter:uppercase">
                        {dataExtenso(r.data)}
                        {r.inicio && `, às ${r.inicio.slice(0, 5)}`} · {distanciaDias(r.data)}
                        {r.local && ` · ${r.local}`}
                      </p>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      )}
    </Bloco>
  );
}
