# IMOBPROJ — Plano da implantação final

Mockup aprovado em 28/10/2026: `docs/mockups/implantacao-final.html` (e `docs/mockups/app-campo.html`).
Checklist binário: cada item está **feito** ou **não feito**. Nada de "parcial".

## Decisões do Wagner (28/10/2026)

| # | Decisão |
|---|---|
| D1 | **Perfil × papel.** O perfil define os menus e as ações (Ver, Criar, Editar, Excluir, Aprovar) no sistema todo. O papel por projeto (diretor, gerente, usuário-chave, analista, prestador) continua em `project_members` e vale dentro de cada projeto. |
| D2 | **App de OS = app de campo.** A abertura de OS fica no próprio app de campo (`apps/campo`), na aba "+ Nova". Não vai existir um segundo app. |
| D3 | **Permissões por aplicativo dentro do IMOBPROJ**, usando a Central de Acessos que já existe no banco (`acessos.aplicativos`, `acessos.permissoes`, `acessos.eu_posso`, `acessos.provisionar`). Não se cria um modelo paralelo. |
| D4 | **Monitor de atendimento** igual ao do imobdesk: indicadores com período, acompanhamento de atendentes por setor, conversas aguardando e conversas em atendimento. |
| D5 | **Ícones** Fluent Color do Portal Atendimento, gerados de `imobdesk/src/components/iconesMenu.data.ts` com `@iconify/react` (offline, sem chamar a API do Iconify). |
| D6 | **Versão demo e Centro de Treinamento ficam por último**, depois de todas as funcionalidades. As regras do Portal Atendimento continuam valendo: só texto; balão sobre a tela real; trilha por perfil; progresso no banco; "Praticar na demonstração". |

## Regras que valem para todas as fases

- Migrations **aditivas** (só `create … if not exists`, `alter … add column if not exists`). Nada de `drop`.
- Tudo no schema `imobproj`. A nuvem recebe a migration por `bash scripts/migrar-nuvem.sh` (o Wagner roda, porque o modo automático bloqueia escrita em produção).
- RLS em toda tabela nova. Escrita administrativa por Server Action com `service_role`, depois de checar a permissão.
- Telas seguem `docs/padroes-modulos.md` e o design system do portal (azul com abóbora, claro e escuro).
- Cada fase termina com `tsc`, `lint` e `build` verdes, a tela conferida no Playwright, e um commit.

---

## Fase 1 — Cadastros: Clientes, Usuários e Equipes

- [x] Migration `imobproj.organizations`: colunas `nome_fantasia`, `segmento`, `endereco`, `ativo`.
- [x] Tabela `imobproj.organization_contacts` (nome, cargo, e-mail, WhatsApp, principal).
- [x] Coluna `imobproj.profiles.cargo` e `profiles.ativo`.
- [x] Tabelas `imobproj.teams` (nome, setor, líder) e `imobproj.team_members`.
- [x] Tela **Clientes** (`/cadastros/clientes`): lista com busca e filtro Ativos/Inativos, ficha com contatos e projetos, exportar Excel.
- [x] Tela **Usuários** (`/cadastros/usuarios`): nome, e-mail, WhatsApp, cargo, empresa, equipes, acesso por projeto, "Atende no WhatsApp", convidar e reenviar convite.
- [x] Tela **Equipes** (`/cadastros/equipes`): cartões por equipe, líder, adicionar e remover pessoas.
- [x] Menu: grupo "Cadastros". "Equipe e permissões" passa a redirecionar para Usuários.

## Fase 2 — Perfis e permissões; Permissões por aplicativo

- [x] Tabelas `imobproj.perfis` e `imobproj.perfil_permissoes` (menu × ver/criar/editar/excluir/aprovar). Coluna `profiles.perfil` (chave em texto, não uuid: a Central grava a chave do perfil em `<schema>.usuarios.perfil`).
- [x] Perfis iniciais: Super admin (fixo), Gerente de projetos, Analista, Atendente, Prestador, Usuário-chave.
- [x] Função `imobproj.pode(menu, acao)` usada pelo menu e pelas Server Actions (mais `imobproj.minhas_permissoes()` para o menu numa chamada só).
- [x] Tela **Perfis e permissões** (`/configuracoes/perfis`): lista de perfis, matriz por menu, filtro, "Liberar todos", aviso de alterações não salvas.
- [x] Tela **Permissões por aplicativo** (`/configuracoes/aplicativos`) lendo e gravando em `acessos.*` pelas funções existentes (`public.pa_*`).
- [x] O portal chama a Central no login e no middleware (`public.pode_acessar_app('imobproj')`, o atalho público de `acessos.eu_posso`) e bloqueia quem não pode entrar.

Pendências da Fase 2 que dependem do Wagner:
- Rodar `bash scripts/migrar-nuvem.sh` (aplica `20261031000100_cadastros` e `20261031000200_perfis`). Até lá, o portal publicado funciona no modo de compatibilidade: menu completo, alterar só o super admin.
- Rodar uma vez `supabase/central-acessos/registrar-imobproj.sql` no SQL Editor, para o IMOBPROJ aparecer na Central (entra com o controle desligado).
- "Adicionar aplicativo" não existe na tela: a Central da nuvem não tem a função `pa_adicionar_aplicativo` (o código do imobdesk já a espera; ela ainda não foi publicada no banco).

## Fase 3 — Setores, números e fila

- [x] Tabelas `imobproj.setores`, `imobproj.setor_numeros` (ligado a `wa_sessions`), `imobproj.setor_horarios`, `imobproj.setor_regras`, `imobproj.setor_mensagens` — mais `setor_feriados`, `teams.setor_id` e `wa_groups.setor_id` (migration `20261031000300_setores.sql`).
- [x] Tela **Setores e números**: setor, números (sessões OpenWA), gestor, equipes que atendem.
- [x] Tela **Fila e horários**: horário por dia, feriados, regras da fila, mensagens automáticas com variáveis.
- [x] Roteamento: uma conversa nova entra na fila do setor dono do número chamado (trigger em `wa_groups` + `fn_rotear_conversa` chamada pelo `openwa-webhook`; número sem setor segue como antes). Teste: `supabase/tests/setores_roteamento.sql`.

## Fase 4 — Monitor de atendimento

- [x] Tabelas `imobproj.atendimentos` (ticket, setor, cliente, atendente, entrou na fila, assumiu, encerrou) e `imobproj.atendente_status` (online, pausa).
- [x] View/RPC de indicadores por período: atendidas, resolvidas no 1º atendimento, não resolvidas, fora do horário, tempo médio de espera, tempo médio de atendimento, com a variação em relação ao período anterior.
- [x] Tela **Monitor de atendimento** em tempo real (Realtime): indicadores, atendentes por setor, aguardando (Atender) e em atendimento (Visualizar, Abrir/transferir).
- [x] Distribuição automática respeitando o limite por atendente.

## Fase 5 — App de OS (abertura pelo celular)

- [x] Aba "+ Nova" no app de campo: cliente e projeto, tipo, título, data e horário, responsável. Funciona offline (fila local).
- [x] Campo "Materiais usados" nas evidências.
- [x] Server: a OS aberta pelo app recebe número, histórico e origem "app" (`fn_app_abrir_os`).
- [x] Aviso no WhatsApp do cliente ao abrir a OS: feito na Fase 6 (trigger põe a mensagem na fila `wa_messages` do grupo do cliente; o cron `imobproj-openwa-reenvio` entrega).
- [x] Tela **App de OS** no portal: indicadores, aparelhos conectados (versão, último acesso, push, pendências), convidar por WhatsApp.

## Fase 6 — Configurações gerais

- [x] Tabela `imobproj.configuracoes` (uma linha). Migration `20261031000600_configuracoes.sql`; logo no bucket público `imobproj-marca`.
- [x] Abas Empresa (nome, CNPJ, logo, fuso, valor da hora técnica), Ordens de Serviço (numeração, prazo de aceite automático, foto e assinatura obrigatórias, aviso ao cliente, resumo semanal), Notificações, Integrações. Tela `/configuracoes/gerais` (`/admin/configuracoes` redireciona).
- [x] As regras de OS passam a ser lidas por portal, app e banco: foto/assinatura obrigatórias (trigger em `service_orders` + aviso no app antes do check-out), aceite automático (`fn_aceite_automatico` no pg_cron de hora em hora), aviso ao cliente, número inicial da OS em projetos novos, valor da hora na medição e link do app no convite.
- [x] Resumo semanal de horas ao usuário-chave e as chaves de Notificações (migration `20261031000800_notificacoes.sql`): push de OS atribuída/decidida condicionado às chaves; ata publicada avisa por push quem ainda não deu ciência; `fn_resumo_semanal()` no pg_cron toda segunda às 8h (Brasília) manda a semana anterior ao grupo do cliente no WhatsApp e por push a cada usuário-chave, sem repetir a semana (`resumo_semanal_envios`). Teste: `supabase/tests/notificacoes.sql` (7 cenários).

## Fase 7 — Versão demo com dados fictícios

- [x] Modo demo (`NEXT_PUBLIC_MODO=demo`) num projeto Vercel à parte, ligado a um banco de demonstração (Supabase local publicado ou projeto próprio). *(código, `scripts/publicar-demo.sh` e passo a passo no README; o projeto Supabase e o projeto Vercel da demo são criados pelo Wagner)*
- [x] Seed de demonstração com clientes, pessoas, projetos, OS, atas e conversas inventados. *(`supabase/demo/seed-demo.sql`, gerado por `scripts/gerar-seed-demo.mjs`)*
- [x] Faixa "Demonstração", "Ver como" (troca de perfil sem senha) e "Restaurar dados da demo". *(mais "Entrar como" na tela de entrada; `imobproj.demo_restaurar()` só no banco da demo)*

## Fase 8 — Centro de Treinamento

- [x] Tabelas `imobproj.tr_trilhas`, `tr_trilha_perfis` (perfil → trilha, no lugar do setor), `tr_modulos`, `tr_trilha_modulos`, `tr_passos` (alvo em %) e `tr_progresso`, com a mesma estrutura do Portal Atendimento. Migration `20261031000700_treinamento.sql`; funções `tr_*` (o gabarito só em `tr_admin_modulo`); teste `supabase/tests/treinamento.sql` (8 cenários).
- [x] Telas capturadas da demo por script Playwright (`public/treinamento/*.webp`): `node scripts/capturar-treinamento.mjs` mede os alvos (bounding box dos seletores, em %) e `node scripts/gerar-carga-treinamento.mjs` escreve a carga na migration a partir de `scripts/treinamento/conteudo.mjs`. Telas do celular vêm dos mockups aprovados do app.
- [x] Telas **Meus treinamentos** (`/treinamento/meus[/id]`: trilha do perfil, cartões com progresso, "Ver como" do admin) e **Gerenciar tutoriais** (`/treinamento/gerenciar`: módulos, editor de balão com arraste, trilha de cada perfil, progresso por perfil).
- [x] Tour por balões (teclado ← → Esc, retomada do passo, "Passar sozinho") com pergunta no fim e "Praticar na demonstração" (`NEXT_PUBLIC_DEMO_URL`; dentro da demo, a própria rota).
- [x] Trilhas: Gerente de projetos (6), Técnico de campo (4), Atendente (3), Usuário-chave (3, padrão de quem não tem perfil com trilha).
