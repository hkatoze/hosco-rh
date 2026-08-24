import { useQuery } from "@tanstack/react-query";
import { apiFetch } from "../api/client";
import type { UtilisateurConnecte } from "../api/types";

export function useSession() {
  return useQuery({
    queryKey: ["session"],
    queryFn: () => apiFetch<UtilisateurConnecte>("/api/auth/moi"),
    retry: false,
    meta: { ignorerInterception: true },
  });
}
