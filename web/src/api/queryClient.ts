import { MutationCache, QueryCache, QueryClient } from "@tanstack/react-query";
import { ErreurApi } from "./client";
import { router } from "../router";

/**
 * Intercepteur global : toute réponse 401 renvoie vers la connexion, tout
 * 403 { code: "MOT_DE_PASSE_A_CHANGER" } renvoie vers l'écran dédié, qui
 * bloque le reste tant que le mot de passe n'a pas été changé.
 */
export function agirSurErreur(erreur: unknown): void {
  if (!(erreur instanceof ErreurApi)) return;

  const cheminActuel = router.state.location.pathname;

  if (erreur.status === 401 && cheminActuel !== "/connexion") {
    void router.navigate("/connexion");
    return;
  }

  if (erreur.status === 403 && erreur.code === "MOT_DE_PASSE_A_CHANGER" && cheminActuel !== "/changer-mot-de-passe") {
    void router.navigate("/changer-mot-de-passe");
  }
}

export const queryClient = new QueryClient({
  queryCache: new QueryCache({
    onError: (erreur, requete) => {
      // La vérification de session elle-même (GET /api/auth/moi) peut
      // échouer en 401 de façon parfaitement normale (utilisateur non
      // connecté) : c'est la garde de route qui interprète son résultat,
      // pas cet intercepteur.
      if (requete.meta?.ignorerInterception) return;
      agirSurErreur(erreur);
    },
  }),
  mutationCache: new MutationCache({
    onError: (erreur) => agirSurErreur(erreur),
  }),
  defaultOptions: {
    queries: {
      retry: false,
      refetchOnWindowFocus: false,
    },
  },
});
