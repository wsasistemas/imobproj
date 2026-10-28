"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { Loader2 } from "lucide-react";
import { useState, type ReactElement } from "react";
import { useForm } from "react-hook-form";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { createClient } from "@/lib/supabase/client";
import { esquemaNovaSenha, type NovaSenha } from "@/lib/senha";

/** "Alterar senha" do rodapé do menu: troca a senha do próprio usuário logado. */
export function DialogAlterarSenha({ trigger }: { trigger: ReactElement }) {
  const [aberto, setAberto] = useState(false);
  const {
    register,
    handleSubmit,
    reset,
    formState: { errors, isSubmitting },
  } = useForm<NovaSenha>({ resolver: zodResolver(esquemaNovaSenha), defaultValues: { senha: "", confirmacao: "" } });

  async function salvar({ senha }: NovaSenha) {
    const { error } = await createClient().auth.updateUser({ password: senha });
    if (error) {
      toast.error("Não foi possível alterar a senha. Use uma senha diferente da atual.");
      return;
    }
    toast.success("Senha alterada.");
    reset();
    setAberto(false);
  }

  return (
    <Dialog
      open={aberto}
      onOpenChange={(v) => {
        setAberto(v);
        if (!v) reset();
      }}
    >
      <DialogTrigger render={trigger} />
      <DialogContent className="sm:max-w-md">
        <form onSubmit={handleSubmit(salvar)} noValidate className="grid gap-4">
          <DialogHeader>
            <DialogTitle>Alterar senha</DialogTitle>
            <DialogDescription>Use pelo menos 8 caracteres, com letras e números.</DialogDescription>
          </DialogHeader>
          <div className="grid gap-1.5">
            <Label htmlFor="alt-senha">Nova senha</Label>
            <Input id="alt-senha" type="password" autoComplete="new-password" aria-invalid={!!errors.senha} {...register("senha")} />
            {errors.senha && <p className="text-[13px] text-danger">{errors.senha.message}</p>}
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor="alt-confirmacao">Confirme a nova senha</Label>
            <Input
              id="alt-confirmacao"
              type="password"
              autoComplete="new-password"
              aria-invalid={!!errors.confirmacao}
              {...register("confirmacao")}
            />
            {errors.confirmacao && <p className="text-[13px] text-danger">{errors.confirmacao.message}</p>}
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setAberto(false)}>
              Cancelar
            </Button>
            <Button type="submit" disabled={isSubmitting}>
              {isSubmitting && <Loader2 className="animate-spin" />}
              Salvar senha
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
