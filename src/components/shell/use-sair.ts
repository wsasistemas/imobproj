"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { toast } from "sonner";
import { createClient } from "@/lib/supabase/client";

/** Encerra a sessão no Supabase e volta para a entrada. */
export function useSair() {
  const router = useRouter();
  const [saindo, setSaindo] = useState(false);

  async function sair() {
    setSaindo(true);
    const { error } = await createClient().auth.signOut();
    if (error) {
      setSaindo(false);
      toast.error("Não foi possível sair. Tente novamente.");
      return;
    }
    router.replace("/login");
    router.refresh();
  }

  return { saindo, sair };
}
