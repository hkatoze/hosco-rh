import { useEffect, useRef, type RefObject } from "react";

const SELECTEUR_FOCUSABLE =
  'a[href], button:not([disabled]), textarea:not([disabled]), input:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])';

/**
 * Focus déplacé dans la modale à l'ouverture, piégé dedans (Tab/Shift+Tab),
 * rendu à l'élément déclencheur à la fermeture (voir CLAUDE.md, tâche 6,
 * point 7). Échap appelle `onEchap` plutôt que de fermer directement : au
 * consommateur de décider s'il faut confirmer (données saisies non
 * enregistrées) avant de fermer réellement.
 */
export function useFocusTrap(conteneur: RefObject<HTMLElement>, active: boolean, onEchap: () => void): void {
  const elementDeclencheur = useRef<HTMLElement | null>(null);

  useEffect(() => {
    if (!active) return;
    elementDeclencheur.current = document.activeElement as HTMLElement | null;

    const noeud = conteneur.current;
    const premierFocusable = noeud?.querySelector<HTMLElement>(SELECTEUR_FOCUSABLE);
    (premierFocusable ?? noeud)?.focus();

    function surTouche(e: KeyboardEvent) {
      if (e.key === "Escape") {
        e.preventDefault();
        onEchap();
        return;
      }
      if (e.key !== "Tab" || !noeud) return;
      const focusables = Array.from(noeud.querySelectorAll<HTMLElement>(SELECTEUR_FOCUSABLE));
      if (focusables.length === 0) return;
      const premier = focusables[0]!;
      const dernier = focusables[focusables.length - 1]!;
      if (e.shiftKey && document.activeElement === premier) {
        e.preventDefault();
        dernier.focus();
      } else if (!e.shiftKey && document.activeElement === dernier) {
        e.preventDefault();
        premier.focus();
      }
    }

    document.addEventListener("keydown", surTouche);
    return () => {
      document.removeEventListener("keydown", surTouche);
      elementDeclencheur.current?.focus();
    };
  }, [active, conteneur, onEchap]);
}
