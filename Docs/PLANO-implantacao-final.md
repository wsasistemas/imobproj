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

- [ ] Tabelas `imobproj.setores`, `imobproj.setor_numeros` (ligado a `wa_sessions`), `imobproj.setor_horarios`, `imobproj.setor_regras`, `imobproj.setor_mensagens`.
- [ ] Tela **Setores e números**: setor, números (sessões OpenWA), gestor, equipes que atendem.
- [ ] Tela **Fila e horários**: horário por dia, feriados, regras da fila, mensagens automáticas com variáveis.
- [ ] Roteamento: uma conversa nova entra na fila do setor dono do número chamado (webhook `openwa-webhook`).

## Fase 4 — Monitor de atendimento

- [ ] Tabelas `imobproj.atendimentos` (ticket, setor, cliente, atendente, entrou na fila, assumiu, encerrou) e `imobproj.atendente_status` (online, pausa).
- [ ] View/RPC de indicadores por período: atendidas, resolvidas no 1º atendimento, não resolvidas, fora do horário, tempo médio de espera, tempo médio de atendimento, com a variação em relação ao período anterior.
- [ ] Tela **Monitor de atendimento** em tempo real (Realtime): indicadores, atendentes por setor, aguardando (Atender) e em atendimento (Visualizar, Abrir/transferir).
- [ ] Distribuição automática respeitando o limite por atendente.

## Fase 5 — App de OS (abertura pelo celular)

- [ ] Aba "+ Nova" no app de campo: cliente e projeto, tipo, título, data e horário, responsável. Funciona offline (fila local).
- [ ] Campo "Materiais usados" nas evidências.
- [ ] Server: a OS aberta pelo app recebe número, histórico e aviso no WhatsApp do cliente (quando ligado em Configurações).
- [ ] Tela **App de OS** no portal: indicadores, aparelhos conectados (versão, último acesso, push, pendências), convidar por WhatsApp.

## Fase 6 — Configurações gerais

- [ ] Tabela `imobproj.configuracoes` (uma linha).
- [ ] Abas Empresa (nome, CNPJ, logo, fuso, valor da hora técnica), Ordens de Serviço (numeração, prazo de aceite automático, foto e assinatura obrigatórias, aviso ao cliente, resumo semanal), Notificações, Integrações.
- [ ] As regras de OS passam a ser lidas por portal, app e Edge Functions.

## Fase 7 — Versão demo com dados fictícios

- [ ] Modo demo (`NEXT_PUBLIC_MODO=demo`) num projeto Vercel à parte, ligado a um banco de demonstração (Supabase local publicado ou projeto próprio).
- [ ] Seed de demonstração com clientes, pessoas, projetos, OS, atas e conversas inventados.
- [ ] Faixa "Demonstração", "Ver como" (troca de perfil sem senha) e "Restaurar dados da demo".

## Fase 8 — Centro de Treinamento

- [ ] Tabelas `imobproj.tr_trilhas`, `tr_modulos`, `tr_passos` (alvo em %), `tr_progresso`, com a mesma estrutura do Portal Atendimento.
- [ ] Telas capturadas da demo por script Playwright (`public/treinamento/*.webp`).
- [ ] Telas **Meus treinamentos** (trilha do perfil, cartões com progresso) e **Gerenciar tutoriais** (editor de balão, progresso por perfil).
- [ ] Tour por balões com pergunta no fim e "Praticar na demonstração".
- [ ] Trilhas: Gerente de projetos (6), Técnico de campo (4), Atendente (3), Usuário-chave (3).
