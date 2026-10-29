# IMOBPROJ Campo

App de campo do IMOBPROJ (Expo SDK 58 + React Native + TypeScript + expo-router). Usa o mesmo Supabase do
portal (projeto **Imobsystem**, schema **`imobproj`**) e o design system IMOBSYSTEMS adaptado ao celular:
cabeçalho escuro `#1E2126`, botões vermelhos `#D52B36` com no mínimo 48 px e cartões brancos com raio 14.

## Telas

| Tela | O que faz |
| --- | --- |
| Login | E-mail e senha, **Manter conectado**, **Esqueci a senha** (link para `/redefinir-senha` do portal) e **biometria** (oferecida depois do primeiro login; o app abre travado e pede digital/Face ID) |
| Hoje | OS do usuário no dia (e as que estão em execução) com situação, local e horário. **Fazer check-in** grava a hora e o GPS |
| OS (evidências) | Foto pela câmera com **marca d'água** (OS, data, hora e GPS gravados na imagem), arquivo, print da galeria e **assinatura do cliente** na tela. Descrição, **Fora do escopo** e **Check-out e enviar para aceite** (calcula as horas e muda para `aguardando_aceite`) |
| Agenda | Semana do usuário (domingo a sábado), com navegação entre semanas |
| Aceites | Só para usuário-chave e diretor: aprovar ou recusar a OS, com comentário obrigatório na recusa |
| Perfil | Dados, papéis por projeto, fila de sincronização, biometria e **Sair** |

## Offline

- Check-in, check-out e evidências entram primeiro numa **fila local** (`expo-sqlite`, arquivo `campo.db`).
  Fotos e arquivos são copiados para `Documentos/fila` até subirem.
- A fila é enviada **em ordem** quando a rede volta, quando o app volta ao primeiro plano e logo depois de cada
  registro. Se um item de uma OS falhar por regra de negócio, os itens seguintes **da mesma OS** esperam. O erro
  aparece no Perfil, onde o item pode ser descartado.
- O selo no cabeçalho mostra *Sincronizado*, *Offline · N*, *Enviando…* ou *N pendentes*.
- As listas ficam em cache: sem rede, as telas mostram o último retrato, com a data.
- O servidor é **idempotente** (`fn_app_checkin`, `fn_app_checkout`, `fn_app_registrar_evidencia`), então
  reenviar depois de uma queda é seguro.

**Hora e GPS no servidor.** A hora do fato (`checkin_at`, `checkout_at`, `os_evidences.captured_at`) é a do
aparelho, porque ele pode estar offline. Ela é corrigida para a hora do servidor se vier no futuro. O GPS fica
em colunas próprias (`checkin_lat/lng`, `checkout_lat/lng`, `os_evidences.lat/lng/precisao_m`), não só na marca
d'água. Além disso, o banco grava a hora em que **recebeu** cada registro: `checkin_recebido_em`,
`checkout_recebido_em` e `os_evidences.recebido_em`. Essa última é forçada por trigger.
Migration: [`supabase/migrations/20261030000100_app_campo.sql`](../../supabase/migrations/20261030000100_app_campo.sql).

## Notificações push

O trigger `fn_push_os_notificar` enfileira em `imobproj.push_outbox` quando uma OS é **atribuída**, **aprovada**
ou **recusada** (com o motivo). O insert dispara a Edge Function **`push-send`**, que entrega pelo Expo Push.
O job `imobproj-push-reenvio` tenta de novo as falhas, até 5 vezes.
O app registra o aparelho em `imobproj.push_tokens` (`fn_push_registrar_token`) a cada login. Tocar na
notificação abre a OS.

Para funcionar:

1. `npx eas-cli@latest init` grava o `extra.eas.projectId` no `app.json`. Sem ele não há token.
2. Credenciais de push: **Android** precisa de FCM V1 (`npx eas-cli@latest credentials`, Google Service Account);
   **iOS** precisa de chave APNs (o EAS cria no primeiro build iOS).
3. Publique a função: `npx supabase functions deploy push-send` (na raiz do repositório).
4. No portal, **Administração › WhatsApp OpenWA › base das Edge Functions** grava
   `imobproj_openwa_functions_url` e `imobproj_openwa_anon_key` no Vault. O push usa os mesmos segredos para
   chamar a função.

Push remoto **não funciona no Expo Go**. Use um development build.

## Rodar

```bash
cd apps/campo
npm install            # o .npmrc já liga legacy-peer-deps (conflito de peer só do react-dom web)
cp .env.example .env   # URL e chave publishable do Supabase + URL do portal
```

| Variável | Valor |
| --- | --- |
| `EXPO_PUBLIC_SUPABASE_URL` | `https://ikvjaowvpvxojvcfwnct.supabase.co` (nuvem) ou `http://<IP-da-máquina>:56321` (Supabase local; no celular use o IP, não `127.0.0.1`) |
| `EXPO_PUBLIC_SUPABASE_ANON_KEY` | chave **publishable/anon** (pública). Nunca a `service_role` |
| `EXPO_PUBLIC_PORTAL_URL` | URL do portal, usada no link de "Esqueci a senha" |

Câmera, biometria, push e SQLite são módulos nativos, então use um **development build** (o Expo Go não cobre tudo):

```bash
npx eas-cli@latest build --profile development --platform android   # instala o APK de desenvolvimento
npx expo start --dev-client                                         # e abre o app nele
# ou, com Android Studio/Xcode instalados:
npx expo run:android
npx expo run:ios
```

Validação: `npm run typecheck`, `npm run doctor`.

O `expo-doctor` acusa `react` duplicado porque o portal (Next.js) tem outro React no `node_modules` da raiz.
O [`metro.config.js`](metro.config.js) bloqueia a raiz, e no EAS só o app é instalado. É falso positivo.

## Build EAS (Android e iOS)

Perfis em [`eas.json`](eas.json):

| Perfil | Para quê | Saída |
| --- | --- | --- |
| `development` | app de desenvolvimento (dev client) em aparelho | Android: APK · iOS: ad hoc (registre o aparelho com `eas device:create`) |
| `development-simulador` | dev client no simulador iOS | `.app` para o simulador |
| `preview` | teste interno com a equipe de campo | Android: **APK** instalável · iOS: ad hoc |
| `production` | lojas | Android: AAB (Play Store) · iOS: IPA (App Store) — versão incrementada automaticamente |

```bash
cd apps/campo
npx eas-cli@latest login
npx eas-cli@latest init                      # uma vez: cria o projeto no EAS e grava o projectId

# Variáveis por ambiente (EXPO_PUBLIC_* vão dentro do app: visibilidade plaintext ou sensitive, nunca secret)
npx eas-cli@latest env:create --environment preview    --name EXPO_PUBLIC_SUPABASE_URL      --value https://ikvjaowvpvxojvcfwnct.supabase.co --visibility plaintext
npx eas-cli@latest env:create --environment preview    --name EXPO_PUBLIC_SUPABASE_ANON_KEY --value <CHAVE_PUBLISHABLE> --visibility plaintext
npx eas-cli@latest env:create --environment preview    --name EXPO_PUBLIC_PORTAL_URL        --value https://<dominio-do-portal> --visibility plaintext
# repita para --environment production (e development, se usar)

# Android
npx eas-cli@latest build --platform android --profile preview       # APK para testar
npx eas-cli@latest build --platform android --profile production    # AAB para a Play Store
npx eas-cli@latest submit --platform android --profile production

# iOS (precisa de conta Apple Developer; o EAS cuida de certificados e perfis)
npx eas-cli@latest build --platform ios --profile preview
npx eas-cli@latest build --platform ios --profile production
npx eas-cli@latest submit --platform ios --profile production
```

As variáveis `EXPO_PUBLIC_*` são embutidas no momento do build. Mudar o valor exige novo build.
Identificadores: `br.com.wsasistemas.imobproj.campo` (Android `package` e iOS `bundleIdentifier`, em `app.json`).

## Estrutura

```
src/app/                 rotas (expo-router)
  _layout.tsx            provedores + Stack.Protected (login × app)
  login.tsx
  (app)/(tabs)/          Hoje (index), Agenda, Aceites, Perfil
  (app)/os/[id]/         detalhe/evidências, câmera, assinatura
  (app)/aceite/[id].tsx  aprovar/recusar
src/lib/                 supabase (sessão criptografada), sessao, fila offline, os, apontamento, evidencias, push, gps, tema
src/components/          ui (botão, cartão, selo, campo...), cartão de OS, indicador da fila
```
