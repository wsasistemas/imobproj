-- =============================================================================
-- Cadastra o IMOBPROJ na Central de Acessos da NUVEM (schema `acessos`, compartilhado).
-- Rodar UMA vez, à mão, no SQL Editor do Supabase (projeto ikvjaowvpvxojvcfwnct).
-- Não é migration: a Central pertence ao conjunto IMOBSYSTEMS e o scripts/migrar-nuvem.sh não toca nela.
--
-- Entra com o controle DESLIGADO (todo login segue entrando). Ligue em
-- Configurações › Permissões por aplicativo depois de conferir a lista de usuários.
-- perfil_liberar = 'prestador': quem for liberado pela Central sem cadastro ganha o perfil mais restrito.
-- =============================================================================
insert into acessos.aplicativos (schema_name, nome, url, controle_ativo, padrao_novos, perfil_liberar)
values ('imobproj', 'IMOBPROJ', 'https://imobproject.vercel.app', false, 'bloqueado', 'prestador')
on conflict (schema_name) do nothing;
