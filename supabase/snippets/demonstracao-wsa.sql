-- Projeto "Demonstração WSA" (decisão D7 de 29/10/2026, docs/PLANO-conversas-numeros-monitor.md).
-- O número da WSA Sistemas (sessão OpenWA "wsa-sistemas", +55 21 99477-1524) é o número de demonstração.
-- Ele fica neste projeto, com a WSA Sistemas como empresa contratante. Projeto real ganha número próprio.
--
-- Rodar uma vez no SQL Editor (ou psql). Idempotente: não duplica se já existir.
-- Depois: Administração › WhatsApp OpenWA › Conectar número › Usar sessão existente › "wsa-sistemas".

do $$
declare
  v_org uuid;
begin
  select id into v_org from imobproj.organizations where lower(nome) = 'wsa sistemas' limit 1;
  if v_org is null then
    insert into imobproj.organizations (nome, tipo) values ('WSA Sistemas', 'cliente') returning id into v_org;
  end if;

  if not exists (select 1 from imobproj.projects where codigo = 'DEMO-WSA') then
    insert into imobproj.projects (codigo, nome, cliente_org_id, status)
    values ('DEMO-WSA', 'Demonstração WSA', v_org, 'execucao');
  end if;
end;
$$;
