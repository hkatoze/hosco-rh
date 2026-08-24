import { useEffect } from "react";
import { useBlocker } from "react-router-dom";

const MESSAGE_PAR_DEFAUT = "Des modifications non enregistrées seront perdues. Continuer ?";

/**
 * Empêche de perdre des données saisies non enregistrées (voir CLAUDE.md,
 * tâche 6, point 4) : bloque la navigation interne React Router
 * (useBlocker, nécessite le data router — voir router.tsx) et la
 * fermeture d'onglet/rechargement (beforeunload). Les deux sont
 * nécessaires : useBlocker ne couvre pas la sortie du navigateur,
 * beforeunload ne couvre pas la navigation interne.
 */
export function useGardeSortie(estModifie: boolean, message: string = MESSAGE_PAR_DEFAUT): void {
  useBlocker(({ currentLocation, nextLocation }) => {
    if (!estModifie || currentLocation.pathname === nextLocation.pathname) return false;
    return !window.confirm(message);
  });

  useEffect(() => {
    function surFermeture(e: BeforeUnloadEvent) {
      if (!estModifie) return;
      e.preventDefault();
      e.returnValue = "";
    }
    window.addEventListener("beforeunload", surFermeture);
    return () => window.removeEventListener("beforeunload", surFermeture);
  }, [estModifie]);
}
