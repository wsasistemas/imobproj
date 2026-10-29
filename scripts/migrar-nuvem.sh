#!/usr/bin/env bash
# Aplica no Supabase da nuvem (projeto vinculado com `npx supabase link`) as migrations do IMOBPROJ
# que ainda não rodaram lá.
#
# Por que não `supabase db push`: o banco é compartilhado pelos sistemas IMOBSYSTEMS e o histórico
# supabase_migrations.schema_migrations tem as versões dos outros sistemas. O push exigiria marcar essas
# versões como revertidas (quebrando o controle deles), e gravar as nossas lá quebraria o push deles.
# Então o IMOBPROJ mantém o próprio histórico em imobproj._migracoes.
#
# Uso (na raiz do repositório):
#   bash scripts/migrar-nuvem.sh            # aplica as pendentes
#   bash scripts/migrar-nuvem.sh --listar   # só mostra o que falta
#
# Cada migration roda numa transação; se uma falhar, o script para e nada dela fica gravado.
# O seed (usuários de teste) NUNCA vai para a nuvem.
set -euo pipefail

cd "$(dirname "$0")/.."
SUPA="npx --yes supabase"
TMP="$(mktemp -d)"
trap 'rm -rf "$TMP"' EXIT

historico="create schema if not exists imobproj; create table if not exists imobproj._migracoes (versao text primary key, nome text not null, aplicada_em timestamptz not null default now()); revoke all on imobproj._migracoes from anon, authenticated;"
if ! saida="$($SUPA db query --linked "$historico" 2>&1)"; then
  echo "$saida" | tail -5
  echo "Não consegui criar imobproj._migracoes. Rode antes: npx supabase login && npx supabase link --project-ref <ref>"
  exit 1
fi

aplicadas="$($SUPA db query --linked "select coalesce(string_agg(versao, ' '), '') as v from imobproj._migracoes" 2>/dev/null \
  | grep -o '"v": *"[^"]*"' | sed -E 's/"v": *"([^"]*)"/\1/')"

pendentes=()
for arquivo in supabase/migrations/*.sql; do
  base="$(basename "$arquivo" .sql)"
  versao="${base%%_*}"
  [[ " $aplicadas " == *" $versao "* ]] || pendentes+=("$arquivo")
done

if [[ ${#pendentes[@]} -eq 0 ]]; then
  echo "Nuvem em dia: nenhuma migration pendente."
  exit 0
fi

printf 'Pendentes:\n'; printf '  %s\n' "${pendentes[@]}"
[[ "${1:-}" == "--listar" ]] && exit 0

for arquivo in "${pendentes[@]}"; do
  base="$(basename "$arquivo" .sql)"
  versao="${base%%_*}"
  nome="${base#*_}"
  {
    echo "begin;"
    cat "$arquivo"
    echo
    echo "insert into imobproj._migracoes (versao, nome) values ('$versao', '$nome');"
    echo "commit;"
  } > "$TMP/$base.sql"
  echo "Aplicando $base..."
  if ! saida="$($SUPA db query --linked -f "$TMP/$base.sql" 2>&1)" || grep -q '"_tag": *"Error"\|ERROR:' <<<"$saida"; then
    echo "$saida" | tail -20
    echo "FALHOU em $base — parei aqui. Corrija e rode de novo (as anteriores já estão gravadas)."
    exit 1
  fi
done

echo "Pronto: ${#pendentes[@]} migration(s) aplicada(s)."
