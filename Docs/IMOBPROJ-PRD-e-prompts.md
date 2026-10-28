# IMOBPROJ — PRD técnico e prompts para o VS Code

Como usar:

1. Crie uma pasta vazia `imobproj`, abra no VS Code e salve este arquivo como `docs/PRD.md`.
2. Coloque prints das telas do mockup e do sistema de referência (IMOBDOCERIA / IMOBDESK) em `docs/mockups/`.
3. No Claude Code (ou no agente do Copilot), cole **um prompt por vez**, na ordem: Prompt 0, Prompt 1, Prompt 2 e Prompt 3.
4. Só passe para o próximo prompt depois de testar o anterior e fazer commit.

---

## PARTE A — PRD resumido (contexto que o agente deve ler)

### Produto

IMOBPROJ é uma plataforma da WSA Sistemas para gerir projetos de tecnologia junto com o cliente. Ela centraliza documentação, EAP, cronograma (calendário + Gantt), atas de reunião, Ordens de Serviço com evidências e aceite, e as conversas dos grupos de WhatsApp por equipe via OpenWA.

O avanço físico de cada atividade é calculado assim: horas de OS aprovadas ÷ horas orçadas na EAP.

### Perfis (por projeto, tabela `project_members.role`)

| Papel | O que pode fazer |
| --- | --- |
| super_admin | Tudo, inclusive configurar OpenWA, níveis e projetos |
| diretor | Ver avanço, custos e marcos; dar ciência em atas; aceitar OS |
| gerente | Manter EAP, cronograma e linha de base; abrir OS; redigir atas; administrar grupos |
| usuario_chave | Comentar documentos e processos; aceitar ou recusar OS; dar ciência em atas |
| analista | Executar e apontar as próprias OS; ver as próprias atividades e horas |
| prestador | Igual ao analista, restrito às OS atribuídas a ele |

### Módulos

1. Visão geral do projeto.
2. Documentação e EAP: documentos versionados, processos AS-IS e TO-BE, EAP em árvore e em tabela, importação via .xlsx.
3. Cronograma em calendário: dia, semana e mês, no estilo Google Agenda.
4. Cronograma em Gantt: fases, dependências, caminho crítico, linha de base e linha de hoje.
5. Atas: participantes, pauta, decisões e encaminhamentos. Cada encaminhamento pode virar atividade no cronograma.
6. Ordens de Serviço: check-in/out, evidências, aceite ou recusa, marcação de fora do escopo e medição mensal.
7. Conversas WhatsApp: grupos por equipe espelhados em tempo real via OpenWA. Resposta pelo portal, fila de reenvio e indicador de saúde da sessão.
8. Administração: equipe e permissões, configuração do OpenWA, configurações gerais.
9. App de campo (Expo): login, OS do dia, check-in/out com GPS, fotos, assinatura e modo offline.

### Stack

- **Web:** Next.js 14+ (App Router), TypeScript, Tailwind CSS, shadcn/ui e lucide-react.
- **Backend:** Supabase (Postgres, Auth, RLS, Realtime, Storage, Edge Functions, pg_cron, Vault).
- **Deploy:** Vercel para o web.
- **Mobile:** Expo (React Native) na fase 3.
- **WhatsApp:** OpenWA em servidor dedicado. Webhook para uma Edge Function do Supabase.
- **Calendário:** FullCalendar (pacotes MIT: daygrid, timegrid, interaction).
- **Gantt:** componente próprio em React com CSS grid. Não usar biblioteca paga.

---

## PARTE B — Design system (padrão IMOBSYSTEMS: IMOBDOCERIA / IMOBDESK)

> Agente: estes tokens foram extraídos das telas do IMOBDESK, que segue o mesmo padrão da IMOBDOCERIA. Se houver prints em `docs/mockups/` com diferenças, os prints prevalecem.

### Cores (Tailwind `theme.extend.colors` e variáveis CSS)

```
--sidebar-bg: #1E2126      --sidebar-hover: #2A2E35
--sidebar-text: #D1D5DB    --sidebar-label: #9CA3AF
--primary: #D52B36         --primary-hover: #B91C1C
--primary-soft: #FFF5F5    --primary-border: #F5C2C5
--bg: #F5F6F8              --surface: #FFFFFF
--border: #E5E7EB          --border-soft: #F0F1F3
--text: #1F2937            --muted: #6B7280
--success-bg: #E7F5EC  --success: #166534
--warning-bg: #FEF3C7  --warning: #92400E
--info-bg: #E6EEFD     --info: #1D4ED8
--danger-bg: #FDECEC   --danger: #B91C1C
--purple-bg: #F1EAFD   --purple: #6D28D9
--banner-info-bg: #EFF6FF  --banner-info-border: #BFDBFE
```

### Tipografia

- Fonte Inter (via `next/font/google`), pesos 400, 500, 600 e 700.
- Título da página: 24px/700. Subtítulo: 14px na cor muted.
- Texto: 14px. Rótulos de seção: 11.5px, MAIÚSCULAS, letter-spacing .07em, 700, cor muted.

### Layout (AppShell)

- **Cabeçalho branco** (altura ~64px, borda inferior) com:
  - botão hambúrguer;
  - logo redonda;
  - nome do sistema em MAIÚSCULAS;
  - à direita: "Sincronizado" + data por extenso, cartão do usuário (nome + papel) com botão sair, e sino de notificações.
- **Menu lateral escuro** de 250px, recolhível:
  - grupos com rótulo "MENU PRINCIPAL" etc.;
  - cada item tem um ícone colorido de 14px;
  - submenus indentados;
  - item ativo com fundo `--primary`, texto branco e cantos de 8px.
  - No rodapé: Recolher menu, Alterar senha, Sair.
- **Conteúdo** com padding 24–32px:
  - breadcrumb "Início / …";
  - título e subtítulo;
  - linha de **abas em pílula** (borda cinza, raio 999px; a ativa tem borda e texto `--primary` e fundo `--primary-soft`);
  - depois, cartões.

### Componentes

- **Cartão:** fundo branco, borda 1px `--border`, raio 12px, sem sombra forte.
- **Botões:**
  - primário: vermelho sólido, raio 8px, texto branco 600;
  - secundário: branco com borda cinza.
- **Badge de situação:** pílula com fundo claro e texto escuro da mesma família de cor (success, warning, info, danger, purple, neutro).
- **Toggle:** vermelho quando ligado (igual ao IMOBDESK).
- **Banner informativo:** azul-claro com ícone "i" e texto com destaques em negrito.
- **Tabela:**
  - cabeçalho com fundo #FAFAFB, texto 11.5px em maiúsculas na cor muted;
  - linhas com borda `--border-soft`;
  - linha selecionada com fundo `--primary-soft`.
- **Tela de conversas** igual ao portal de atendimento:
  - lista de conversas à esquerda;
  - mensagens no centro, com fundo #EFEAE2 e balões brancos (os enviados em #E2F7D5);
  - painel de contexto à direita.
- **Acessibilidade:** contraste mínimo de 4.5:1, foco visível, `aria-label` em botões só com ícone.

---

## PARTE C — Modelo de dados (Supabase)

Use enums em Postgres, `uuid` como chave, `created_at` e `updated_at` em todas as tabelas, e RLS ligada em todas.

- `organizations` (id, nome, tipo: executora|cliente|prestador, cnpj)
- `profiles` (id = auth.users.id, nome, email, telefone_whatsapp, avatar_url, is_super_admin)
- `projects` (id, codigo, nome, cliente_org_id, executora_org_id, inicio, fim, status: planejamento|execucao|homologacao|encerrado|suspenso, horas_orcadas)
- `project_members` (project_id, user_id, role: diretor|gerente|usuario_chave|analista|prestador, ativo)
- `documents` (id, project_id, tipo: termo_abertura|escopo|processo_asis|processo_tobe|raci|plano_comunicacao|requisitos|outro, titulo, versao, status: rascunho|revisao|aprovado|vivo, storage_path, conteudo jsonb)
- `document_comments` (id, document_id, autor_id, texto, resolvido)
- `wbs_items` (id, project_id, parent_id, codigo, titulo, responsavel_id, horas_orcadas, inicio, fim, ordem, is_milestone, is_fase)
- `wbs_dependencies` (id, predecessora_id, sucessora_id, tipo default 'FS', lag_dias)
- `baselines` (id, project_id, numero, congelada_em, snapshot jsonb)
- `schedule_changes` (id, wbs_item_id, autor_id, de jsonb, para jsonb, justificativa)
- `calendar_events` (id, project_id, tipo: atividade|reuniao|os|marco, wbs_item_id, os_id, meeting_id, titulo, inicio, fim, local, google_event_id)
- `meetings` (id, project_id, numero, titulo, data, inicio, fim, local, pauta jsonb, decisoes jsonb, status: rascunho|publicada|aprovada, redator_id)
- `meeting_participants` (meeting_id, user_id, presenca: presente|ausente, ciente_em)
- `meeting_actions` (id, meeting_id, acao, responsavel_id, prazo, status, wbs_item_id, vincular_cronograma bool)
- `service_orders` (id, project_id, numero sequencial por projeto, wbs_item_id, executor_id, titulo, descricao, agendada_inicio, agendada_fim, checkin_at, checkout_at, checkin_lat, checkin_lng, horas numeric, status: rascunho|agendada|em_execucao|aguardando_aceite|aprovada|recusada, fora_escopo bool, aceite_por, aceite_em, aceite_comentario, origem: portal|app|whatsapp)
- `os_evidences` (id, os_id, tipo: foto|arquivo|print|assinatura, storage_path, captured_at, lat, lng, origem)
- `os_status_history` (id, os_id, de, para, autor_id, comentario)
- `scope_proposals` (id, project_id, os_id, descricao, horas, valor, status)
- `wa_sessions` (id, project_id, numero, openwa_url, api_key_secret_id (Vault), status: conectado|desconectado|erro, last_heartbeat)
- `wa_groups` (id, project_id, session_id, equipe, nome, wa_group_id, ativo, auto_evidencia bool, auto_os bool)
- `wa_group_members` (group_id, user_id, telefone, is_admin)
- `wa_messages` (id, group_id, wa_message_id unique, direction: in|out, author_phone, author_user_id, body, media_path, quoted_wa_message_id, status: recebida|pendente|enviada|falhou, tentativas, erro, created_at)
- `audit_log` (id, tabela, registro_id, acao, autor_id, dados jsonb)

**Views e funções:**

- `v_wbs_progress`: soma das horas de OS aprovadas ÷ `horas_orcadas` por item; agrega por fase e por projeto.
- `fn_user_role(project_id)`: devolve o papel do usuário logado no projeto. É usada em todas as políticas de RLS.

---

## PARTE D — PROMPTS (cole um por vez)

### Prompt 0 — Setup e AppShell

```
Leia docs/PRD.md inteiro (partes A, B e C) e os prints em docs/mockups/ antes de qualquer código.

Crie o projeto IMOBPROJ nesta pasta:
1. Next.js 14+ com App Router, TypeScript, Tailwind, ESLint, src/ e alias @/*. Instale shadcn/ui, lucide-react, @supabase/ssr, @supabase/supabase-js, zod, react-hook-form, date-fns (locale pt-BR) e @tanstack/react-query.
2. Configure o design system da PARTE B: tokens no tailwind.config e em globals.css como variáveis CSS, fonte Inter via next/font, e tema dos componentes shadcn (Button, Badge, Card, Tabs em pílula, Table, Dialog, Sheet, Switch vermelho, Input, Select, Textarea, Toast).
3. Construa o AppShell igual ao IMOBDESK: cabeçalho branco, menu lateral escuro recolhível com grupos e submenus, breadcrumb, título, subtítulo e abas em pílula. Menu:
   MENU PRINCIPAL: Página Inicial; Projetos (Visão geral, Documentação e EAP, Cronograma, Atas de reunião, Ordens de Serviço).
   COMUNICAÇÃO: Conversas WhatsApp.
   ADMINISTRAÇÃO: Equipe e permissões, WhatsApp OpenWA, App de campo, Configurações.
   Rodapé: Recolher menu, Alterar senha, Sair.
4. Tela de login (e-mail e senha) com Supabase Auth e middleware protegendo as rotas.
5. Crie supabase/migrations com TODO o modelo da PARTE C: enums, tabelas, índices, triggers de updated_at, numeração sequencial de OS por projeto, view v_wbs_progress, função fn_user_role e políticas RLS conforme a tabela de perfis da PARTE A. Crie também os buckets de Storage "documentos" e "evidencias" (privados, com políticas por projeto).
6. Crie supabase/seed.sql com o projeto de exemplo "PRJ-014 · Portal de Tickets Calper": 6 pessoas (um de cada papel), EAP de 4 fases com subitens, 7 OS em situações variadas, 5 atas e 4 grupos de WhatsApp.
7. Crie .env.example (NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_ANON_KEY, SUPABASE_SERVICE_ROLE_KEY) e um README com os passos para rodar local (supabase start) e publicar na Vercel.
Não crie telas de módulos ainda. Ao final, rode o build e o lint e corrija os erros.
```

### Prompt 1 — MVP: projetos, documentação, EAP, cronograma e OS

```
Continue o IMOBPROJ seguindo docs/PRD.md e o design system da PARTE B. Implemente:

1. /projetos: lista em cartões e tabela, com filtro por situação e botão "Novo projeto" (Dialog).
2. /projetos/[id]: visão geral com:
   - cartões de KPI: avanço físico vs. linha de base, horas apontadas/orçadas, OS por situação e pendências de atas;
   - barras de avanço por fase;
   - próximos marcos e reuniões;
   - pessoas envolvidas por papel;
   - feed de atividade recente (Supabase Realtime em audit_log).
3. /projetos/[id]/documentacao:
   - lista de documentos com versão e status, upload no Storage, comentários e fluxo rascunho → revisão → aprovado;
   - EAP em tabela hierárquica (código, título, responsável, horas, barra de avanço), editável inline;
   - importação de .xlsx (biblioteca xlsx) com pré-visualização antes de gravar;
   - editor simples de processo com etapas em sequência e um ponto de decisão.
4. /projetos/[id]/cronograma com seletor Dia | Semana | Mês | Gantt:
   - Dia, Semana e Mês: FullCalendar em pt-BR, no visual do Google Agenda, com cores por tipo (atividade azul, reunião roxo, OS laranja, marco vermelho), linha da hora atual e filtros por tipo e por pessoa no painel lateral com minicalendário. Arrastar evento atualiza as datas e pede justificativa (schedule_changes).
   - Gantt: componente próprio com tabela à esquerda (atividade, responsável, período, %) e linha do tempo semanal à direita. Mostra barra de fase, barra de tarefa com preenchimento do avanço, barra fina da linha de base, losango de marco, linha vermelha de hoje e caminho crítico em vermelho (calcule pelas dependências). Botões "Nova linha de base" e "Exportar PDF".
5. /projetos/[id]/os:
   - filtros em pílula por situação e tabela;
   - painel de detalhe com dados, descrição, galeria de evidências, histórico e ações: Aprovar e Recusar (só usuario_chave ou diretor; comentário obrigatório na recusa) e Marcar fora do escopo (cria scope_proposal);
   - página "Medição do mês": horas aprovadas por pessoa e por prestador, com exportação .xlsx.
6. /admin/equipe: matriz de permissões (somente leitura) e CRUD de membros por projeto, com convite por e-mail (Supabase Auth invite).

Regras: valide permissões no servidor (Server Actions + RLS), nunca só na interface. Use React Query, mostre skeletons durante o carregamento e estados vazios com texto útil. Ao final, rode o build e o lint.
```

### Prompt 2 — Atas e WhatsApp via OpenWA

```
Continue o IMOBPROJ seguindo docs/PRD.md.

1. /projetos/[id]/atas:
   - lista à esquerda e detalhe à direita;
   - participantes com presença e ciência; pauta e decisões em listas editáveis;
   - tabela de encaminhamentos com toggle "No cronograma" (cria ou atualiza wbs_item e calendar_event);
   - anexos; "Gerar PDF" (react-pdf), "Solicitar ciência" (notifica por e-mail e no grupo) e "Enviar ao grupo WhatsApp".
2. /admin/whatsapp, no mesmo layout da tela "WhatsApp OpenWA" do IMOBDESK:
   - banner informativo azul;
   - cartão "Conexão com o OpenWA" com toggle ligado/desligado, endereço e API key salvos no Supabase Vault, e botão "Testar conexão";
   - lista de sessões por projeto com status e último heartbeat.
3. Edge Function supabase/functions/openwa-webhook:
   - recebe eventos do OpenWA e valida um segredo no header;
   - grava em wa_messages (idempotente por wa_message_id) e baixa a mídia para o Storage;
   - mídia que cita uma OS aberta (#231 ou "OS 231") vira os_evidence;
   - mensagem iniciando com #OS cria service_order em rascunho;
   - atualiza wa_sessions.last_heartbeat.
4. Edge Function openwa-send: envia mensagem ou mídia para o grupo usando a API do OpenWA, com timeout de 15 s. Em falha, marca status 'falhou', incrementa tentativas e guarda o erro. Um job pg_cron a cada 2 minutos reenvia as falhas até 5 tentativas e depois alerta o super_admin.
5. Edge Function openwa-groups: cria o grupo no WhatsApp, adiciona e remove participantes conforme wa_group_members.
6. /projetos/[id]/conversas, igual ao portal de atendimento da Calper:
   - lista de grupos com busca e filtros (Todos, Não lidos, Menções, Arquivados);
   - centro com mensagens em tempo real (Supabase Realtime), nome e papel do autor, citação, mídia, mensagens de sistema e campo de envio;
   - painel direito com dados do grupo, participantes por papel, toggles de automação e aviso da fila de reenvio;
   - selo no topo "OpenWA conectado · sinal há X s".
   - Ação em cada mensagem: "Criar pendência" e "Levar para a próxima ata".
Documente no README como apontar o webhook do OpenWA para a Edge Function. Ao final, rode o build e o lint.
```

### Prompt 3 — App de campo (Expo)

```
Crie em apps/campo um app Expo (React Native + TypeScript + expo-router) que usa o mesmo Supabase do IMOBPROJ e o design system da PARTE B adaptado ao mobile (cabeçalho escuro #1E2126, botões vermelhos #D52B36 com altura mínima de 48px, cartões brancos com raio 14px).

Telas:
1. Login: e-mail e senha, "Manter conectado", "Esqueci a senha" e biometria (expo-local-authentication) após o primeiro login.
2. Hoje: OS do usuário no dia, com situação, local e horário. Botão "Fazer check-in", que grava a hora e o GPS (expo-location).
3. Registrar evidências:
   - fotos com expo-camera (marca d'água com data, hora e OS), arquivos, prints e assinatura do cliente na tela;
   - descrição; checkbox "Fora do escopo";
   - botão "Check-out e enviar para aceite", que calcula as horas e muda a situação para aguardando_aceite.
4. Agenda: semana do usuário. Perfil: dados e sair.
5. Usuário-chave: aba "Aceites" para aprovar ou recusar OS (comentário obrigatório na recusa).

Modo offline: fila local (expo-sqlite) para OS e fotos, sincronizada quando houver rede, com indicador de pendências. Notificações push (expo-notifications) quando uma OS for atribuída, aprovada ou recusada. Hora e GPS das evidências também são gravados pelo servidor. Gere o README com build EAS para Android e iOS.
```

---

## Checklist de validação por fase

- [ ] Fase 0: login funciona e o menu fica igual ao IMOBDESK; migrations e seed rodam sem erro.
- [ ] Fase 1: o calendário e o Gantt mostram os mesmos dados; aprovar uma OS muda o avanço da atividade.
- [ ] Fase 2: uma mensagem no grupo aparece no portal em menos de 3 s; uma resposta pelo portal chega ao grupo; uma falha vai para a fila de reenvio.
- [ ] Fase 3: uma OS feita offline sincroniza ao voltar a rede, com as fotos e o GPS.
