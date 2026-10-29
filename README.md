# IMOBPROJ

Plataforma da WSA Sistemas para gerir projetos de tecnologia junto com o cliente: documentação e EAP,
cronograma (calendário + Gantt), atas, Ordens de Serviço com evidências e aceite, e as conversas dos grupos
de WhatsApp por equipe (OpenWA). Especificação completa em [Docs/IMOBPROJ-PRD-e-prompts.md](Docs/IMOBPROJ-PRD-e-prompts.md).

**Stack:** Next.js 15 (App Router) · TypeScript · Tailwind CSS v4 · shadcn/ui (Base UI) · lucide-react ·
Supabase (Postgres, Auth, RLS, Storage, Realtime) · React Query · react-hook-form + zod · date-fns.

## Estado atual — Fase 0 (Prompt 0)

- Design system da PARTE B: tokens em [tailwind.config.mts](tailwind.config.mts) e em
  [src/app/globals.css](src/app/globals.css) (variáveis CSS), Inter via `next/font`, componentes shadcn com o
  tema do PRD (botão vermelho, badges de situação, cartão, abas em pílula, tabela, switch vermelho…).
- **Tema claro e escuro escolhido pelo usuário** (botão sol/lua no cabeçalho e na entrada), salvo no
  navegador (`localStorage` `imobproj:tema`). Ícones no padrão Apple HIG (símbolo branco em tile colorido).
- AppShell igual ao IMOBDESK: cabeçalho branco, menu lateral escuro recolhível (flyout quando recolhido,
  gaveta no celular), breadcrumb, título, subtítulo e abas em pílula. Menu em [src/config/menu.ts](src/config/menu.ts).
- Tela de entrada no design system do Imobenviomassa/ImobDesk (`.mpl-*`), com Supabase Auth, "Lembrar meu
  e-mail", recuperação de senha e middleware protegendo as rotas.
- Banco completo em [supabase/migrations](supabase/migrations) (enums, tabelas, triggers, numeração de OS,
  views de avanço, `fn_user_role`, RLS por papel, buckets `imobproj-documentos` e `imobproj-evidencias`, Realtime) e
  [supabase/seed.sql](supabase/seed.sql) com o projeto "PRJ-014 · Portal de Tickets Calper".
- As telas dos módulos ainda abrem "Módulo em construção" (Prompts 1 a 3).

## Rodar local

Pré-requisitos: Node 20+, Docker Desktop rodando e o Supabase CLI (`npx supabase` serve).

```bash
npm install

# 1. Sobe o Supabase local (Postgres, Auth, Storage, Studio) e aplica migrations + seed
npx supabase start
#    Para recriar o banco do zero depois de mudar migrations/seed:
npx supabase db reset

# 2. Variáveis de ambiente
cp .env.example .env.local
#    Preencha com os valores que o `supabase start` mostra (ou `npx supabase status`):
#    API URL -> NEXT_PUBLIC_SUPABASE_URL, anon key -> NEXT_PUBLIC_SUPABASE_ANON_KEY,
#    service_role key -> SUPABASE_SERVICE_ROLE_KEY

# 3. App
npm run dev        # http://localhost:3000
```

Usuários do seed (só para o ambiente local), todos com a senha `Imobproj@2026`:

| E-mail | Papel |
| --- | --- |
| superadmin@exemplo.com.br | super_admin |
| diretor@exemplo.com.br | diretor |
| gerente@exemplo.com.br | gerente |
| usuario.chave@exemplo.com.br | usuario_chave |
| analista@exemplo.com.br | analista |
| prestador@exemplo.com.br | prestador |

Studio local: http://127.0.0.1:56323 · e-mails de teste (recuperação de senha): Inbucket em http://127.0.0.1:56324.

Comandos úteis: `npm run lint`, `npm run build`.

## Publicar

### Supabase (nuvem) — schema `imobproj` no projeto compartilhado

O IMOBPROJ usa o projeto Supabase **Imobsystem** (`ikvjaowvpvxojvcfwnct`), compartilhado pelos sistemas
IMOBSYSTEMS. Cada sistema tem o próprio schema; o nosso é **`imobproj`** (os clientes do portal, das Edge
Functions e do app usam `db: { schema: "imobproj" }`). Objetos globais do banco levam o prefixo do sistema:

| Objeto | Nome no IMOBPROJ |
| --- | --- |
| Buckets do Storage | `imobproj-documentos`, `imobproj-evidencias`, `imobproj-whatsapp` |
| Policies em `storage.objects` | `imobproj_<bucket>_<ação>` |
| Trigger em `auth.users` | `imobproj_on_auth_user_created` (só cria profile de quem tem `sistema = imobproj` no metadado; nunca lança erro) |
| Segredos do Vault | `imobproj_openwa_*` |
| Jobs do pg_cron | `imobproj-openwa-reenvio`, `imobproj-push-reenvio` |

**Não use `supabase db push`** nem `migration repair`: o histórico `supabase_migrations` é dos outros
sistemas. As migrations do IMOBPROJ têm histórico próprio em `imobproj._migracoes`:

```bash
npx supabase login
npx supabase link --project-ref ikvjaowvpvxojvcfwnct
bash scripts/migrar-nuvem.sh --listar   # o que falta
bash scripts/migrar-nuvem.sh            # aplica as pendentes (cada uma numa transação; o seed nunca vai)
```

Migration nova: evite `create extension` direto (dispara o event trigger do pg_cron e falha no banco
compartilhado) — use `if not exists (select 1 from pg_extension ...)` num bloco `do`.

O schema precisa estar em **Exposed schemas** da API (já feito; a lista fica em `pgrst.db_schemas` do papel
`authenticator`). Para conferir: Dashboard › Project Settings › API.

1. Em **Authentication → URL Configuration**, inclua `https://<dominio-do-imobproj>/auth/callback` em
   *Redirect URLs* (usado pela recuperação de senha e pelo convite). A *Site URL* é compartilhada: não troque.
2. Primeiro super admin (o Auth é compartilhado; pode ser uma conta que já existe em outro sistema):
   ```sql
   select imobproj.fn_garantir_profile('<email>', '<Nome>');
   update imobproj.profiles set is_super_admin = true where email = '<email>';
   ```
3. Depois disso, a Equipe é administrada pelo portal: quem já tem conta em outro sistema é vinculado na
   hora (entra com a senha atual); quem não tem recebe convite por e-mail.

### Vercel

1. Importe o repositório em https://vercel.com/new (framework detectado: Next.js).
2. Em **Settings → Environment Variables**, cadastre `NEXT_PUBLIC_SUPABASE_URL`,
   `NEXT_PUBLIC_SUPABASE_ANON_KEY` e `SUPABASE_SERVICE_ROLE_KEY` (Production e Preview).
3. Faça o deploy. Cada push no `main` publica em produção.

> Nunca faça commit do `.env.local` nem use a `SUPABASE_SERVICE_ROLE_KEY` em código de navegador.

## Estrutura

```
src/
  app/
    (app)/            área logada (AppShell): Página Inicial e rotas do menu
    login/            entrada (e-mail e senha) + recuperação de senha
    redefinir-senha/  nova senha pelo link do e-mail
    auth/callback/    troca o código do link do Supabase pela sessão
  components/
    shell/            cabeçalho, menu lateral, cabeçalho de página, alterar senha
    login/            layout da entrada e cena do cronograma
    tema/             botão sol/lua
    ui/               componentes shadcn com o tema do PRD
  config/menu.ts      menu lateral (fonte única)
  lib/supabase/       clientes do navegador, do servidor e do middleware
  middleware.ts       protege as rotas e renova a sessão
supabase/
  migrations/         modelo de dados completo (PARTE C)
  seed.sql            projeto de exemplo PRJ-014
```

## WhatsApp (OpenWA)

Integração com o OpenWA (gateway HTTP do WhatsApp) por três Edge Functions em
`supabase/functions/` (código compartilhado em `_shared/`) e a migration `20261029000700_whatsapp_openwa.sql`.
A tela de configuração é **Administração › WhatsApp OpenWA** (`/admin/whatsapp`, só super admin).

| Função | Quem chama | O que faz |
| --- | --- | --- |
| `openwa-webhook` | o OpenWA (sem JWT: `verify_jwt = false`) | valida o segredo, grava mensagens dos grupos em `wa_messages`, guarda a mídia, cria evidência/OS automáticas, atualiza o heartbeat da sessão |
| `openwa-send` | o portal (`enfileirarMensagemWhatsApp`) e o cron | envia uma mensagem da fila (`{ message_id }`) com timeout de 15 s |
| `openwa-groups` | Server Actions (`criarGrupoWhatsApp`, `sincronizarGrupoWhatsApp`) | cria o grupo no WhatsApp e sincroniza participantes com `wa_group_members` (super admin ou gerente) |

### Publicar as funções

```bash
npx supabase link --project-ref <projeto>
bash scripts/migrar-nuvem.sh             # aplica a migration (Vault, pg_cron, pg_net, bucket "imobproj-whatsapp", alertas)
npx supabase functions deploy openwa-webhook openwa-send openwa-groups
```

O `supabase/config.toml` já declara `verify_jwt = false` só para `openwa-webhook`. As funções usam as variáveis
padrão (`SUPABASE_URL`, `SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`); não há segredo extra para
`supabase secrets set`: a API key do OpenWA e os segredos ficam no **Supabase Vault**.

### Configurar (tela /admin/whatsapp)

1. **Conexão com o OpenWA**: informe a URL do servidor e a API key (`X-API-Key`). A chave vai para o Vault
   (`imobproj_openwa_api_key`) e nunca volta ao navegador — a tela só mostra "configurada em <data>". Use **Testar conexão**
   (chama `GET /api/sessions`, timeout de 10 s) e ligue o switch.
2. **Webhook**: clique em **Gerar segredo** e copie o valor (mostrado uma única vez; "Regenerar" invalida o anterior).
3. **Sessões por projeto**: cadastre o número do sistema e o **id da sessão no OpenWA** (aparece no teste de conexão).
4. **Fila de reenvio**: salve a URL das funções como o banco a enxerga (`https://<projeto>.supabase.co/functions/v1`;
   localmente `http://kong:8000/functions/v1`). Grava `imobproj_openwa_functions_url` e `imobproj_openwa_anon_key` no Vault.

### Apontar o webhook do OpenWA

Para cada sessão, cadastre no OpenWA (`POST /api/sessions/<id>/webhooks`):

```json
{
  "url": "https://<projeto>.supabase.co/functions/v1/openwa-webhook",
  "events": ["message.received", "session.status", "session.authenticated", "session.disconnected",
             "group.join", "group.leave", "group.update"],
  "secret": "<SEGREDO DO WEBHOOK>",
  "headers": { "x-openwa-secret": "<SEGREDO DO WEBHOOK>" }
}
```

Localmente a URL é `http://127.0.0.1:56321/functions/v1/openwa-webhook` (se o OpenWA roda em Docker, use
`http://host.docker.internal:56321/...`). A função aceita o header `x-openwa-secret` **ou** a assinatura
`X-OpenWA-Signature` (HMAC-SHA256 do corpo com o `secret`); basta um dos dois. Sem segredo válido → 401; segredo
ainda não gerado → 503. Ligue `RESOLVE_LID_TO_PHONE=true` no OpenWA para que o autor das mensagens venha com telefone.

Teste rápido (segredo no header):

```bash
curl -X POST http://127.0.0.1:56321/functions/v1/openwa-webhook \
  -H "content-type: application/json" -H "x-openwa-secret: <SEGREDO>" \
  -d '{"event":"message.received","sessionId":"<id da sessão>","idempotencyKey":"t1","data":{"id":"false_1203...@g.us_ABC","chatId":"<wa_group_id>","author":"5511900000006@c.us","isGroup":true,"type":"chat","body":"#OS Trocar o switch","timestamp":1761700000}}'
```

### O que o webhook faz

- Qualquer evento da sessão atualiza `wa_sessions.last_heartbeat` (e `status` pelos eventos `session.*`).
- `message.received` em grupo cadastrado (`wa_groups.wa_group_id`) → `wa_messages` (`direction='in'`), idempotente por
  `wa_message_id`. Autor resolvido pelo telefone (`wa_group_members` → `profiles.telefone_whatsapp`, com e sem o nono dígito).
- Mídia → bucket privado **`imobproj-whatsapp`** (`<project_id>/<group_id>/<AAAA-MM>/<id>.<ext>`). `wa_messages.media_path`
  sempre no formato **`<bucket>/<caminho>`** (ex.: `imobproj-whatsapp/...`, `imobproj-documentos/...`, `imobproj-evidencias/...`).
- Mídia que cita uma OS aberta do projeto (`#231`, `OS 231`) em grupo com **auto_evidencia** → cópia em
  `evidencias/<project_id>/<os_id>/whatsapp-<id>.<ext>` + `os_evidences` (origem whatsapp). OS aprovada/recusada é ignorada.
- Texto começando com `#OS` em grupo com **auto_os** → `service_orders` em rascunho (origem whatsapp, título = resto da
  linha) e resposta no grupo citando a mensagem ("OS 238 registrada como rascunho: …").
- `group.join/leave/update` → mensagem de sistema (`direction='in'` sem `author_phone`/`author_user_id`).
- Com o OpenWA desligado na administração, só o heartbeat é gravado. Mensagens enviadas pelo próprio número
  (`message.sent`/`fromMe`) não são gravadas.

### Fila e reenvio (pg_cron)

O job **`imobproj-openwa-reenvio`** roda a cada 2 minutos (`select imobproj.fn_openwa_processar_fila()`) e, via `pg_net`, chama
`openwa-send` para cada mensagem de saída `falhou` (ou `pendente` há mais de 2 min) com menos de 5 tentativas.
A chamada leva `Authorization: Bearer <anon>` e `x-openwa-cron: <imobproj_openwa_cron_secret>` (segredo gerado pela migration
no Vault). Cada tentativa soma 1 em `tentativas`; a trava `enviando_desde` evita envio duplo. Na 5ª falha o trigger
`fn_wa_alerta_falha` grava um registro em **`alertas`** (`tipo = 'whatsapp_envio_falhou'`, só o super admin lê),
exibido no cartão "Fila de reenvio". Com o OpenWA desligado o cron não envia nada.

Ver os disparos: `select * from cron.job_run_details order by start_time desc limit 10;` e
`select * from net._http_response order by id desc limit 10;`.
