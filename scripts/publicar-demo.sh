#!/usr/bin/env bash
# Publica a VERSÃO DEMO do IMOBPROJ num banco Supabase de demonstração (nunca no de produção).
#
# O que faz, nesta ordem:
#   1. aplica as migrations de supabase/migrations que faltam no banco de demo (histórico em imobproj._migracoes);
#   2. aplica supabase/local/central-acessos.sql se o schema "acessos" não existir (use --sem-central para pular);
#   3. aplica supabase/demo/funcoes-demo.sql (demo_restaurar e a tabela do seed);
#   4. grava o seed da demo (supabase/demo/seed-demo.sql, com a senha trocada) e chama imobproj.demo_restaurar().
#
# Banco de destino (um dos dois):
#   SUPABASE_DEMO_DB_URL="postgresql://postgres:<senha>@db.<ref>.supabase.co:5432/postgres" bash scripts/publicar-demo.sh
#   bash scripts/publicar-demo.sh --project-ref <ref-do-projeto-demo>     (usa o login do `npx supabase login`)
#
# Variáveis:
#   DEMO_SENHA        obrigatória (menos em --listar): senha de todos os usuários fictícios. A MESMA vai na Vercel.
#   DEMO_PORTAL_URL   opcional: endereço da demo publicada (Configurações → Integrações). Padrão: http://localhost:3000
#
# Opções: --listar (só mostra as migrations pendentes) · --sem-central · --sem-dados (não recria os dados)
set -euo pipefail

cd "$(dirname "$0")/.."
PRODUCAO="ikvjaowvpvxojvcfwnct"
SUPA="npx --yes supabase"
TMP="$(mktemp -d)"
trap 'rm -rf "$TMP"' EXIT

REF="" LISTAR=0 CENTRAL=1 DADOS=1
while [[ $# -gt 0 ]]; do
  case "$1" in
    --project-ref) REF="${2:-}"; shift 2 ;;
    --listar) LISTAR=1; shift ;;
    --sem-central) CENTRAL=0; shift ;;
    --sem-dados) DADOS=0; shift ;;
    *) echo "Opção desconhecida: $1"; exit 1 ;;
  esac
done

if [[ -n "$REF" ]]; then
  DESTINO=(--linked --project-ref "$REF")
  ALVO="projeto $REF"
elif [[ -n "${SUPABASE_DEMO_DB_URL:-}" ]]; then
  DESTINO=(--db-url "$SUPABASE_DEMO_DB_URL")
  ALVO="$(sed -E 's#://[^@]*@#://***@#' <<<"$SUPABASE_DEMO_DB_URL")"
else
  echo "Informe o banco de demo: --project-ref <ref> ou SUPABASE_DEMO_DB_URL=..."
  exit 1
fi

# Proteção: o banco de produção (compartilhado pelos sistemas IMOBSYSTEMS) nunca recebe a demo.
if [[ "$REF" == "$PRODUCAO" || "${SUPABASE_DEMO_DB_URL:-}" == *"$PRODUCAO"* ]]; then
  echo "RECUSADO: $PRODUCAO é o banco de PRODUÇÃO. A demo precisa de um projeto Supabase próprio."
  exit 1
fi

echo "Destino da demo: $ALVO"

consulta() { $SUPA db query "${DESTINO[@]}" "$@" 2>&1; }
falhou() { grep -q '"_tag": *"Error"\|ERROR:\|error:' <<<"$1"; }

# O --db-url do supabase CLI só aceita UM comando por chamada; por isso cada arquivo vai embrulhado num
# único DO que executa o conteúdo inteiro (e o DO é atômico: se algo falha, nada do arquivo fica gravado).
embrulhar() { # embrulhar <arquivo-sql> <saida>
  if grep -q 'demo_sql\$\|demo_bloco\$' "$1"; then echo "O arquivo $1 usa a marca reservada demo_sql/demo_bloco."; exit 1; fi
  { echo 'do $demo_bloco$ begin execute $demo_sql$'; cat "$1"; echo; echo '$demo_sql$; end $demo_bloco$;'; } > "$2"
}

aplicar() { # aplicar <arquivo> <rótulo>
  local saida
  embrulhar "$1" "$TMP/embrulhado.sql"
  if ! saida="$(consulta -f "$TMP/embrulhado.sql")" || falhou "$saida"; then
    echo "$saida" | tail -20
    echo "FALHOU em $2 — parei aqui."
    exit 1
  fi
}

historico="create schema if not exists imobproj; create table if not exists imobproj._migracoes (versao text primary key, nome text not null, aplicada_em timestamptz not null default now()); revoke all on imobproj._migracoes from anon, authenticated;"
if [[ $LISTAR -eq 0 ]]; then
  echo "$historico" > "$TMP/historico.sql"
  aplicar "$TMP/historico.sql" "histórico de migrations"
fi

aplicadas="$(consulta "select coalesce(string_agg(versao, ' '), '') as v from imobproj._migracoes" \
  | grep -o '"v": *"[^"]*"' | sed -E 's/"v": *"([^"]*)"/\1/' || true)"

pendentes=()
for arquivo in supabase/migrations/*.sql; do
  base="$(basename "$arquivo" .sql)"
  versao="${base%%_*}"
  [[ " $aplicadas " == *" $versao "* ]] || pendentes+=("$arquivo")
done

if [[ ${#pendentes[@]} -eq 0 ]]; then
  echo "Migrations: em dia."
else
  printf 'Migrations pendentes:\n'; printf '  %s\n' "${pendentes[@]}"
fi
[[ $LISTAR -eq 1 ]] && exit 0

if [[ $DADOS -eq 1 ]]; then
  if [[ -z "${DEMO_SENHA:-}" ]]; then echo "Defina DEMO_SENHA (a mesma senha que vai na Vercel)."; exit 1; fi
  if [[ "$DEMO_SENHA" == *"'"* || "$DEMO_SENHA" == *'$'* || ${#DEMO_SENHA} -lt 8 ]]; then
    echo "DEMO_SENHA precisa ter 8+ caracteres e não pode ter aspas simples nem \$."; exit 1
  fi
fi

for arquivo in "${pendentes[@]}"; do
  base="$(basename "$arquivo" .sql)"
  { cat "$arquivo"; echo
    echo "insert into imobproj._migracoes (versao, nome) values ('${base%%_*}', '${base#*_}');"; } > "$TMP/$base.sql"
  echo "Aplicando $base..."
  aplicar "$TMP/$base.sql" "$base"
done

if [[ $CENTRAL -eq 1 ]]; then
  tem="$(consulta "select count(*)::int as n from pg_namespace where nspname = 'acessos'" | grep -o '"n": *[0-9]*' | grep -o '[0-9]*$' || echo 0)"
  if [[ "$tem" == "0" ]]; then
    echo "Aplicando a Central de Acessos (réplica local)..."
    aplicar supabase/local/central-acessos.sql "central-acessos"
  fi
fi

echo "Aplicando as funções da demo..."
aplicar supabase/demo/funcoes-demo.sql "funcoes-demo"

if [[ $DADOS -eq 1 ]]; then
  portal="${DEMO_PORTAL_URL:-http://localhost:3000}"
  {
    printf 'insert into imobproj._demo_seed (id, sql) values (1, $DEMOSEED$'
    sed -e "s|__DEMO_SENHA__|${DEMO_SENHA//|/\\|}|g" -e "s|__DEMO_PORTAL_URL__|${portal//|/\\|}|g" supabase/demo/seed-demo.sql
    printf '$DEMOSEED$) on conflict (id) do update set sql = excluded.sql, atualizado_em = now();\n'
    printf 'select imobproj.demo_restaurar();\n'
  } > "$TMP/dados-demo.sql"
  echo "Recriando os dados fictícios..."
  aplicar "$TMP/dados-demo.sql" "dados da demo"
fi

echo "Pronto: demo publicada em $ALVO."
