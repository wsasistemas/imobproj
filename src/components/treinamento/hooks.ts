"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { treinamento } from "./servico";
import type { SalvarBalao, SalvarModulo } from "./tipos";

const CHAVE = ["treinamento"] as const;

/** Meus treinamentos; com perfil (só super admin), "ver como" as pessoas daquele perfil. */
export function useMeusTreinamentos(perfil: string | null = null) {
  return useQuery({ queryKey: [...CHAVE, "meus", perfil], queryFn: () => treinamento.meus(perfil) });
}

export function useModulo(id: number) {
  // Sem cache: o tour sempre lê o passo atual de novo ao abrir (retoma de onde parou).
  return useQuery({ queryKey: [...CHAVE, "modulo", id], queryFn: () => treinamento.modulo(id), enabled: id > 0, staleTime: 0 });
}

/** Passo atual: grava em segundo plano, sem recarregar a lista a cada passo. */
export function useSalvarProgresso() {
  return useMutation({ mutationFn: (p: { moduloId: number; passo: number }) => treinamento.salvarProgresso(p.moduloId, p.passo) });
}

function useMuda<T, R>(fn: (p: T) => Promise<R>) {
  const qc = useQueryClient();
  return useMutation({ mutationFn: fn, onSuccess: () => qc.invalidateQueries({ queryKey: CHAVE }) });
}

export const useResponder = () => useMuda((p: { moduloId: number; opcao: number }) => treinamento.responder(p.moduloId, p.opcao));

// Gerenciar tutoriais (super admin)

export function usePainelTreinamento(ativo = true) {
  return useQuery({ queryKey: [...CHAVE, "painel"], queryFn: () => treinamento.painel(), enabled: ativo });
}

export function useModuloAdmin(id: number) {
  return useQuery({ queryKey: [...CHAVE, "admin", id], queryFn: () => treinamento.moduloAdmin(id), enabled: id > 0 });
}

export function useProgressoPorPerfil() {
  return useQuery({ queryKey: [...CHAVE, "progresso"], queryFn: () => treinamento.progressoPorPerfil() });
}

export function useProgressoPessoas(perfil: string | null, ativo: boolean) {
  return useQuery({ queryKey: [...CHAVE, "pessoas", perfil], queryFn: () => treinamento.progressoPessoas(perfil), enabled: ativo });
}

export const useSalvarModulo = () => useMuda((p: SalvarModulo) => treinamento.salvarModulo(p));
export const useSalvarBalao = () => useMuda((p: SalvarBalao) => treinamento.salvarBalao(p));
export const useExcluirBalao = () => useMuda((id: number) => treinamento.excluirBalao(id));
export const useReordenarBaloes = () => useMuda((p: { moduloId: number; ids: number[] }) => treinamento.reordenarBaloes(p.moduloId, p.ids));
export const useSalvarPerfisDaTrilha = () =>
  useMuda((p: { trilhaId: number; perfis: string[] }) => treinamento.salvarPerfisDaTrilha(p.trilhaId, p.perfis));
