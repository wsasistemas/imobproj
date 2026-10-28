import { Check } from "lucide-react";
import { Fragment } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { ROTULO_PAPEL } from "@/lib/projeto/tipos";
import { GRUPOS_MATRIZ, PAPEIS_MATRIZ, RESUMO_PAPEL, papelPode } from "./matriz-dados";

/** Matriz de permissões (somente leitura): ações × papéis, com cabeçalho fixo e legenda dos papéis. */
export function MatrizPermissoes() {
  return (
    <div className="grid gap-6">
      <Card className="overflow-hidden p-0">
        <div className="max-h-[70vh] overflow-auto">
          <table className="w-full min-w-[760px] border-separate border-spacing-0 text-sm">
            <caption className="sr-only">
              Matriz de permissões: o que cada papel pode fazer em um projeto. Somente leitura.
            </caption>
            <thead>
              <tr>
                <th
                  scope="col"
                  className="sticky top-0 left-0 z-20 border-b border-border bg-table-head px-4 py-3 text-left text-[12.5px] font-semibold text-muted-foreground"
                >
                  Ação
                </th>
                {PAPEIS_MATRIZ.map((papel) => (
                  <th
                    key={papel}
                    scope="col"
                    className="sticky top-0 z-10 w-[110px] border-b border-border bg-table-head px-2 py-3 text-center text-[12.5px] font-semibold text-muted-foreground"
                  >
                    {ROTULO_PAPEL[papel]}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {GRUPOS_MATRIZ.map((grupo) => (
                <Fragment key={grupo.id}>
                  <tr>
                    <th
                      scope="colgroup"
                      colSpan={PAPEIS_MATRIZ.length + 1}
                      className="border-b border-border bg-muted/60 px-4 py-2 text-left text-[12px] font-semibold tracking-wide text-foreground uppercase"
                    >
                      {grupo.titulo}
                    </th>
                  </tr>
                  {grupo.linhas.map((linha) => (
                    <tr key={linha.id} className="hover:bg-muted/40">
                      <th
                        scope="row"
                        className="sticky left-0 z-[5] border-b border-border bg-card px-4 py-2.5 text-left font-normal"
                      >
                        <span className="block">{linha.rotulo}</span>
                        {linha.detalhe && (
                          <span className="block text-[12px] text-muted-foreground">{linha.detalhe}</span>
                        )}
                      </th>
                      {PAPEIS_MATRIZ.map((papel) => (
                        <td key={papel} className="border-b border-border px-2 py-2.5 text-center">
                          {papelPode(linha, papel) ? (
                            <>
                              <Check size={18} strokeWidth={2.5} className="mx-auto text-success" aria-hidden="true" />
                              <span className="sr-only">Permitido</span>
                            </>
                          ) : (
                            <>
                              <span aria-hidden="true" className="text-muted-foreground">
                                —
                              </span>
                              <span className="sr-only">Não permitido</span>
                            </>
                          )}
                        </td>
                      ))}
                    </tr>
                  ))}
                </Fragment>
              ))}
            </tbody>
          </table>
        </div>
      </Card>

      <section aria-labelledby="legenda-papeis">
        <h2 id="legenda-papeis" className="mb-3 text-[15px] font-semibold">
          O que cada papel faz
        </h2>
        <Card>
          <CardContent>
            <dl className="grid gap-x-8 gap-y-3 sm:grid-cols-2">
              {PAPEIS_MATRIZ.map((papel) => (
                <div key={papel}>
                  <dt className="text-[13.5px] font-semibold">{ROTULO_PAPEL[papel]}</dt>
                  <dd className="text-[13px] text-muted-foreground">{RESUMO_PAPEL[papel]}</dd>
                </div>
              ))}
            </dl>
            <p className="mt-4 text-[12.5px] text-muted-foreground">
              Os papéis valem por projeto. O super admin é global e tem acesso a todos os projetos. As regras são
              conferidas no servidor e no banco (RLS), não só na tela.
            </p>
          </CardContent>
        </Card>
      </section>
    </div>
  );
}
