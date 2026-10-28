# Padrões para os módulos do IMOBPROJ (Prompt 1 em diante)

Leia antes de escrever qualquer tela. Idioma do código, comentários e textos: português do Brasil.

## Contexto

- PRD: `Docs/IMOBPROJ-PRD-e-prompts.md` (PARTE A perfis, PARTE B design system, PARTE C dados).
- Banco: `supabase/migrations/*.sql` (leia as tabelas, views `v_wbs_progress`/`v_fase_progress`/`v_project_progress`,
  funções `fn_user_role`, `fn_has_role`, triggers de OS e as políticas RLS de `..._rls.sql`).
  Seed de exemplo em `supabase/seed.sql` (PRJ-014).
- Stack: Next 15 App Router, React 19, Tailwind v4, shadcn/ui **Base UI** (`@base-ui/react`: triggers usam
  `render={<button/>}`, não `asChild`), lucide-react, React Query, react-hook-form + zod, date-fns (`ptBR`), sonner.
- **Paleta azul WSA + abóbora** (tokens em `src/app/globals.css`), tema claro e escuro. Use SEMPRE tokens/classes
  (`bg-card`, `text-muted-foreground`, `border-border`, `bg-primary`, `bg-primary-soft`, `text-success`, `bg-warning-bg`,
  `bg-table-head`, `var(--sys-blue)`…). Nunca cor fixa (`#fff`, `text-gray-500`) — quebra o tema escuro.

## Peças prontas (não duplique)

| O quê | Onde |
| --- | --- |
| Tipos das tabelas, rótulos e cores de situação (`SITUACAO_OS`, `SITUACAO_DOCUMENTO`, `COR_EVENTO`, `ROTULO_PAPEL`…) | `src/lib/projeto/tipos.ts` |
| Permissões por papel (`pode(papel, acao)`, `PERMISSOES`) | `src/lib/projeto/permissoes.ts` |
| Servidor: `contextoProjeto(id)` (projeto + papel; 404 sem acesso), `exigirPermissao(projectId, acao)`, `exigirSuperAdmin()`, `ehSuperAdmin()` | `src/lib/projeto/servidor.ts` |
| Retorno de Server Action: `ResultadoAcao`, `sucesso`, `falha`, `mensagemErroBanco(error)` | `src/lib/acoes.ts` |
| Supabase: navegador `@/lib/supabase/client`, servidor `@/lib/supabase/server`, service role `@/lib/supabase/admin` (só após exigir permissão) | `src/lib/supabase/*` |
| Layout de `/projetos/[id]/*` já renderiza breadcrumb, título, situação e **abas em pílula** | `src/app/(app)/projetos/[id]/layout.tsx` |
| Cabeçalho de página fora de projeto (breadcrumb, título, subtítulo, ações, abas) | `src/components/shell/cabecalho-pagina.tsx` |
| Ícone HIG em tile (`<IconeMenu icon={X} cor="var(--sys-blue)" tamanho={36} />`) | `src/components/shell/icone-menu.tsx` |
| Envio ao WhatsApp (fila `wa_messages` + Edge Function `openwa-send`): `enfileirarMensagemWhatsApp({ groupId, body, mediaPath?, quotedWaMessageId? })` — use em Server Actions | `src/lib/whatsapp/enviar.ts` |
| PDF no navegador/servidor: `@react-pdf/renderer` (instalado) | — |
| UI: button, badge (variants `success warning info danger purple neutral primary`), card, tabs (`variant="pill"`), table, dialog, sheet, alert-dialog, switch, input, select, textarea, checkbox, label, popover, dropdown-menu, tooltip, skeleton, progress, scroll-area, radio-group, calendar, sonner | `src/components/ui/*` |

## Padrão de cada tela

1. `page.tsx` (Server Component): `const { projeto, papel, userId } = await contextoProjeto(id)` e renderiza um
   componente cliente passando `projetoId`, `papel` e o que for preciso. Não duplique o cabeçalho do projeto.
2. Leitura no cliente com **React Query** + cliente Supabase do navegador (a RLS filtra). `queryKey` sempre começa
   por `["projeto", projetoId, "<modulo>", ...]`.
3. Escrita com **Server Actions** num arquivo `acoes.ts` (`"use server"`) da própria pasta do módulo:
   validar com zod → `await exigirPermissao(projectId, "<acao>")` (try/catch → `falha(e.message)`) → gravar com o
   cliente do servidor (a RLS valida de novo) → `return sucesso(...)` ou `falha(mensagemErroBanco(error))`.
   No cliente: `useMutation` → `toast.success/erro` → `queryClient.invalidateQueries({ queryKey: [...] })`.
   **Nunca** confie só em esconder botão: a action sempre confere.
4. `loading.tsx` com `<Skeleton>` no formato da tela; estados vazios com texto útil (o que é, e o que fazer — ex.:
   "Nenhuma OS aguardando aceite. As OS aparecem aqui quando o executor faz o check-out.").
5. Interface: botões só-ícone com `aria-label`; foco visível; alvos ≥ 36px; datas em pt-BR (`date-fns` + `ptBR`);
   horas com `Intl.NumberFormat("pt-BR")`. Esconda ações que o papel não pode (via `pode(papel, ...)`).
6. Componentes do módulo em `src/components/<modulo>/` ou ao lado da rota (`_componentes/`).

## Regras de convivência (vários agentes ao mesmo tempo)

- Mexa **só** nas pastas do seu módulo. Arquivos compartilhados (`src/lib/projeto/*`, `src/lib/acoes.ts`,
  `src/components/ui/*`, `src/components/shell/*`, `src/config/menu.ts`, `globals.css`, `package.json`) são
  somente leitura: se precisar mudar algo neles, descreva no relatório final.
- **Não** rode `npm install`, `next build`, `next dev`, `supabase db reset` nem `supabase start` (outro agente pode
  estar usando). Todas as dependências já estão instaladas (FullCalendar 6, xlsx 0.20.3 da SheetJS, react-day-picker…).
- Edge Functions ficam em `supabase/functions/<nome>/index.ts` (Deno; fora do `tsconfig` e do eslint do Next).
- Verificação: `npx tsc --noEmit` e `npx eslint <suas pastas>` — corrija só os erros dos seus arquivos.
- Precisa de mudança no banco? Crie migration **aditiva** nova em `supabase/migrations/` com o prefixo de timestamp do
  seu módulo (indicado no seu briefing), idempotente, e explique no relatório. Não aplique.
- Banco local: se existir `.env.local`, o Supabase local está em `http://127.0.0.1:56321` com o seed (senha
  `Imobproj@2026`, usuários `superadmin|diretor|gerente|usuario.chave|analista|prestador@exemplo.com.br`). Você pode
  consultar via script Node no scratchpad com `@supabase/supabase-js` (login com e-mail/senha) para conferir nomes de
  colunas e a RLS. Não grave dados de teste permanentes.
