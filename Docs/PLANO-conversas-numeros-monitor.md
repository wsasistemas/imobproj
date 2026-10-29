# IMOBPROJ — Plano: vários números, grupo → equipe → projeto, Monitor, Anotações da equipe e Base de Conhecimento

Mockup: `docs/mockups/conversas-numeros-monitor.html` (7 telas). Decisões do Wagner em 29/10/2026.
Checklist binário: cada item está **feito** ou **não feito**. Nada de "parcial".

## Decisões do Wagner (29/10/2026)

| # | Decisão |
|---|---|
| D1 | **O número é do projeto, em nome da empresa contratante.** `wa_sessions.project_id` continua obrigatório. O titular exibido é o cliente do projeto (`projects.cliente_org_id`). Um projeto pode ter vários números; um número nunca atende dois projetos. |
| D2 | **Equipe pode estar em vários projetos** (tabela `project_teams`, N:N). |
| D3 | **Um grupo, um vínculo:** 1 projeto + 1 equipe + 1 número, e o número precisa ser do mesmo projeto do grupo. Mensagem nunca aparece em dois projetos. |
| D4 | **"Online agora" = mensagem nos últimos 15 min.** O motor whatsapp-web.js não informa presença (o OpenWA responde 501). |
| D5 | **30 dias sem mensagem → aba "Anotações da equipe" do projeto**, por equipe, só leitura. Nada dessa aba aparece nem é citado na Ordem de Serviço; as marcas de OS/evidência ficam escondidas nela. Mensagem nova devolve o grupo para Conversas. |
| D6 | **Monitor só para gerente do projeto, diretor e super admin.** |
| D7 | **Número de demonstração:** `wsa-sistemas` (+55 21 99477-1524) é da WSA Sistemas e fica no projeto **Demonstração WSA** (contratante WSA Sistemas). Projeto real ganha número próprio. |
| D8 | **Anotações da equipe:** todos os membros da equipe do grupo veem as anotações dela; gerente, diretor e super admin veem as de todas as equipes do projeto. |

## Base de Conhecimento — recomendações aguardando aprovação (K1–K6)

| # | Recomendação |
|---|---|
| K1 | Entram OS aprovadas (título, descrição, materiais, comentário do aceite), atas aprovadas/publicadas (pauta e decisões), documentos aprovados ou vivos (conteúdo digitado) e anotações da equipe. Rascunho, OS recusada e PDF anexo ficam fora. |
| K2 | A busca respeita as permissões: cada usuário só recebe resposta com o que já pode ver (membro → projetos dele; prestador → as próprias OS; super admin → tudo). |
| K3 | Gemini (padrão da casa) para a resposta; busca semântica com `pgvector`. Se a extensão não puder ser ligada no ikvj, começa com busca por texto em português (`tsvector`). Chave no Vault. |
| K4 | Resposta só com fonte citada; sem fonte = "não encontrei". Telefone e CPF mascarados antes de ir à IA. |
| K5 | Indexação automática por fila (`kb_fila`) + pg_cron de 1 min, ao aprovar OS, publicar ata, aprovar documento ou mover grupo para Anotações. |
| K6 | Menu "Base de Conhecimento" no grupo principal, para todos os perfis; histórico de perguntas por usuário e 👍/👎. |

## Regras que valem para todas as fases

- Migrations **aditivas** (`create … if not exists`, `add column if not exists`). Nada de `drop`.
- Código novo funciona sem a migration aplicada (lição da Fase 2 da implantação final).
- A nuvem recebe a migration por `bash scripts/migrar-nuvem.sh` (o Wagner roda).
- Cada fase termina com `tsc`, `lint` e `build` verdes, tela conferida no Playwright e um commit.

---

## Fase 1 — Banco (`20261101000100_numeros_grupos_anotacoes.sql`)

- [x] Tabela `imobproj.project_teams (project_id, team_id)`, PK composta, RLS: lê quem vê o projeto; escreve quem gere o projeto.
- [x] `wa_groups.team_id uuid references teams` (o texto `equipe` continua preenchido com o nome, para não quebrar o que já roda).
- [x] `wa_groups.anotacao_desde timestamptz` (null = está em Conversas).
- [x] Trigger: o número do grupo (`session_id`) precisa ser do mesmo projeto do grupo; a equipe precisa estar em `project_teams` do projeto.
- [x] `fn_anotacoes_mover()` + pg_cron diário: grupo sem mensagem há 30 dias recebe `anotacao_desde = now()`.
- [x] Mensagem nova em grupo com `anotacao_desde` volta o campo para null (no trigger de `wa_messages`).
- [x] Grupo em Anotações não cria evidência nem OS automática (as flags `auto_evidencia`/`auto_os` são ignoradas enquanto `anotacao_desde` não é null).
- [x] `fn_wa_conversas` deixa de trazer grupos em Anotações.
- [x] `conversas_monitor(p_project_id)`: online (15 min), não lidas, esperando há mais de 30 min, foram para Anotações; recusa quem não é gerente/diretor do projeto nem super admin.
- [x] `anotacoes_grupos(p_project_id, p_busca)` e `anotacoes_mensagens(p_group_id)`: mensagens sem os campos de OS/evidência; acesso para membros da equipe do grupo (`team_members`) e para gerente, diretor e super admin.
- [x] Teste de banco `supabase/tests/numeros_grupos_anotacoes.sql` (vínculo de outro projeto recusado, 30 dias, volta com mensagem, Monitor recusado para analista).
- [x] `openwa-webhook`: número não vinculado ao grupo é ignorado (D3); a mensagem que tira o grupo de Anotações não gera evidência nem OS.

## Fase 2 — Números

- [x] Tela Números: colunas Projeto e Titular (empresa contratante), filtro por projeto.
- [x] "Conectar número": projeto obrigatório; "Nova sessão (QR)" ou "Usar sessão existente" (lista as sessões do OpenWA que ainda não estão cadastradas).
- [x] QR atualizado sozinho enquanto o status for `qr_ready`; fecha ao ficar `ready`.
- [ ] Cliente "WSA Sistemas" e projeto "Demonstração WSA"; `wsa-sistemas` (+55 21 99477-1524) registrado nele com selo "Demonstração".
- [x] Script `supabase/snippets/demonstracao-wsa.sql` (cliente WSA Sistemas + projeto DEMO-WSA), aplicado e conferido no banco local.

Verificado no local (29/10/2026): "Usar sessão existente" leu as sessões do OpenWA, preencheu número e titular e gravou `wsa-sistemas` no DEMO-WSA. O QR de sessão nova não foi testado com celular (criaria uma sessão real no OpenWA).

## Fase 3 — Grupos e equipes

- [x] Vincular grupo na ordem Projeto → Número (só do projeto) → Grupo lido do número → Equipe (só do projeto).
- [x] Grupo já vinculado aparece desabilitado.
- [x] Cadastros › Equipes: campo "Projetos que a equipe atende" (`project_teams`).
- [x] Lista de grupos com filtro por número e projeto e situação "Em Anotações da equipe".
- [x] Vincular importa os participantes atuais do grupo para `wa_group_members` (sem isso, "Sincronizar" removeria todo mundo do grupo real); se não conseguir ler, desfaz o vínculo.
- [x] `project_teams` também pode ser gravada por quem edita equipes em Cadastros (perfil `cadastros_equipes`).

Verificado no local (29/10/2026): equipe Suporte técnico ligada ao DEMO-WSA pela tela de Equipes; grupo real "Wsasistemas.ia" lido do número da WSA e vinculado com 2 participantes importados.

## Fase 4 — Monitor dentro de Conversas

- [x] Ação `conversas_monitor: ["diretor", "gerente"]` em `src/lib/projeto/permissoes.ts`.
- [x] Botão Conversas | Monitor na aba Conversas, só para quem tem a ação.
- [x] 4 indicadores e cartões em Online agora / Recentes / Foram para Anotações, filtros por equipe e número.
- [x] Clique no cartão abre a conversa na tela tipo WhatsApp; cartão de Anotações abre a aba Anotações.
- [x] Atualização em tempo real (Realtime de `wa_messages`, já na publication).
- [x] Conversas deixa de listar os grupos em Anotações da equipe (`buscarGrupos`).

Verificado no local (29/10/2026), super admin no PRJ-014: indicadores, seção Recentes com 6 grupos, espera de 14 h marcada e filtros por equipe e número.

## Fase 5 — Aba Anotações da equipe

- [x] Rota `/projetos/[id]/anotacoes`, aba no projeto: cada membro vê as equipes dele; gerente, diretor e super admin veem todas.
- [x] Lista de grupos por equipe, busca e período; leitura no formato WhatsApp, sem compositor.
- [x] Sem nenhuma marca de OS ou evidência, sem link para OS.
- [x] Mídia das anotações assinada no servidor (`urlMidiaAnotacao`), depois de conferir `fn_pode_ver_anotacao`: o membro da equipe que não vê o projeto inteiro também abre a foto.

Verificado no local (29/10/2026): grupo com 3 mensagens lido na aba, separado por equipe, sem marcas de OS/evidência.
Observação: o texto que as pessoas escreveram (ex.: "Enviei a OS 233") aparece como foi escrito; a aba só não liga nem marca nada de OS.

## Fase 6 — Verificação ponta a ponta

- [ ] 2 projetos, 1 número em cada, 2 grupos: mensagens de um nunca aparecem no outro.
- [ ] Analista não vê o Monitor; gerente, diretor e super admin veem.
- [ ] Grupo forçado para 30 dias vai para Anotações e volta com mensagem nova.
- [ ] Atualizar `docs/mockups` e este plano com o que foi entregue.

## Fase 7 — Base de Conhecimento: banco e indexação (depois de aprovar K1–K6)

- [ ] Verificar se a extensão `vector` pode ser ligada no ikvj; se não, seguir com `tsvector` (K3).
- [ ] Tabelas `kb_trechos` (fonte, id, projeto, equipe, texto, vetor/tsvector, atualizado_em), `kb_fila`, `kb_perguntas` (pergunta, resposta, fontes, 👍/👎).
- [ ] Gatilhos que põem na fila: OS aprovada, ata aprovada/publicada, documento aprovado/vivo, grupo movido para Anotações.
- [ ] Edge Function `kb-indexar` (pg_cron 1 min): monta o texto, mascara telefone/CPF, gera o vetor.
- [ ] `kb_buscar(p_pergunta_vetor, p_projeto, p_fontes)` SECURITY INVOKER: só volta trecho que o usuário pode ver (RLS das tabelas de origem).
- [ ] Teste de banco: prestador não recebe OS de outro executor; membro de A não recebe trecho de B.

## Fase 8 — Base de Conhecimento: tela de chat

- [ ] Menu "Base de Conhecimento" (grupo principal) e permissão no cadastro de perfis.
- [ ] Edge Function `kb-perguntar`: busca os trechos, Gemini responde só com eles e cita [n]; sem trecho = "não encontrei".
- [ ] Tela: escopo (meus projetos ou um projeto), fontes, chat, painel "Fontes desta resposta" com link para a OS/ata/documento, sugestões.
- [ ] Histórico "Minhas perguntas" e 👍/👎.
- [ ] Teste com 10 perguntas reais do Wagner: toda resposta com fonte, nenhuma inventada.

## Pendências que dependem do Wagner

- Na nuvem: rodar `supabase/snippets/demonstracao-wsa.sql` e conectar `wsa-sistemas` ao DEMO-WSA pela tela (o item de registro da Fase 2 fica aberto até isso).
- Depois da Fase 1: `bash scripts/migrar-nuvem.sh` e `npx supabase functions deploy openwa-webhook`.

- Aprovar K1–K6 da Base de Conhecimento.
- Rodar `bash scripts/migrar-nuvem.sh` depois da Fase 1.
