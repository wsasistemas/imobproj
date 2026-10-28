-- =============================================================================
-- IMOBPROJ · 001 · Extensões e tipos enumerados
-- Migration aditiva e idempotente: cada enum é criado dentro de um bloco
-- que ignora duplicate_object, então pode ser reaplicada sem erro.
-- =============================================================================

create schema if not exists extensions;
create extension if not exists pgcrypto with schema extensions;

do $$
begin
  -- Organizações ---------------------------------------------------------------
  begin
    create type public.org_tipo as enum ('executora', 'cliente', 'prestador');
  exception when duplicate_object then null;
  end;

  -- Projetos -------------------------------------------------------------------
  begin
    create type public.project_status as enum ('planejamento', 'execucao', 'homologacao', 'encerrado', 'suspenso');
  exception when duplicate_object then null;
  end;

  -- Papel do membro no projeto (super_admin NÃO está aqui: é flag global em profiles)
  begin
    create type public.member_role as enum ('diretor', 'gerente', 'usuario_chave', 'analista', 'prestador');
  exception when duplicate_object then null;
  end;

  -- Documentos -----------------------------------------------------------------
  begin
    create type public.document_tipo as enum (
      'termo_abertura', 'escopo', 'processo_asis', 'processo_tobe',
      'raci', 'plano_comunicacao', 'requisitos', 'outro'
    );
  exception when duplicate_object then null;
  end;

  begin
    create type public.document_status as enum ('rascunho', 'revisao', 'aprovado', 'vivo');
  exception when duplicate_object then null;
  end;

  -- EAP / cronograma -----------------------------------------------------------
  begin
    -- FS = término-início, SS = início-início, FF = término-término, SF = início-término
    create type public.dependency_tipo as enum ('FS', 'SS', 'FF', 'SF');
  exception when duplicate_object then null;
  end;

  begin
    create type public.event_tipo as enum ('atividade', 'reuniao', 'os', 'marco');
  exception when duplicate_object then null;
  end;

  -- Atas -----------------------------------------------------------------------
  begin
    create type public.meeting_status as enum ('rascunho', 'publicada', 'aprovada');
  exception when duplicate_object then null;
  end;

  begin
    create type public.presenca_tipo as enum ('presente', 'ausente');
  exception when duplicate_object then null;
  end;

  begin
    create type public.action_status as enum ('aberta', 'em_andamento', 'concluida', 'cancelada');
  exception when duplicate_object then null;
  end;

  -- Ordens de Serviço ----------------------------------------------------------
  begin
    create type public.os_status as enum (
      'rascunho', 'agendada', 'em_execucao', 'aguardando_aceite', 'aprovada', 'recusada'
    );
  exception when duplicate_object then null;
  end;

  begin
    create type public.os_origem as enum ('portal', 'app', 'whatsapp');
  exception when duplicate_object then null;
  end;

  begin
    create type public.evidence_tipo as enum ('foto', 'arquivo', 'print', 'assinatura');
  exception when duplicate_object then null;
  end;

  begin
    create type public.scope_status as enum ('pendente', 'aprovada', 'recusada');
  exception when duplicate_object then null;
  end;

  -- WhatsApp / OpenWA ----------------------------------------------------------
  begin
    create type public.wa_session_status as enum ('conectado', 'desconectado', 'erro');
  exception when duplicate_object then null;
  end;

  begin
    create type public.wa_direction as enum ('in', 'out');
  exception when duplicate_object then null;
  end;

  begin
    create type public.wa_message_status as enum ('recebida', 'pendente', 'enviada', 'falhou');
  exception when duplicate_object then null;
  end;

  -- Auditoria ------------------------------------------------------------------
  begin
    create type public.audit_acao as enum ('INSERT', 'UPDATE', 'DELETE');
  exception when duplicate_object then null;
  end;
end
$$;
