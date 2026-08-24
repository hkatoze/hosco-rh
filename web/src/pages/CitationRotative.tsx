import { useEffect, useState } from "react";

// Citations réelles, attribuées à leur auteur — vérifiées, pas de paraphrase.
// La typographie garde la casse d'origine de la citation (fidélité), même si
// le reste de l'interface est en minuscules.
interface Citation {
  texte: string;
  auteur: string;
}

const CITATIONS: readonly Citation[] = [
  { texte: "On ne voit bien qu'avec le cœur. L'essentiel est invisible pour les yeux.", auteur: "Antoine de Saint-Exupéry" },
  { texte: "Dans la vie, rien n'est à craindre, tout est à comprendre.", auteur: "Marie Curie" },
  { texte: "La chance ne sourit qu'aux esprits bien préparés.", auteur: "Louis Pasteur" },
  { texte: "Là où est l'amour des hommes, là est aussi l'amour de l'art.", auteur: "Hippocrate" },
  { texte: "Ce que nous faisons pour les autres demeure et est immortel.", auteur: "Marc Aurèle" },
];

const INTERVALLE_MS = 7000;
const DUREE_FONDU_MS = 600;

/** Fait défiler quelques citations sobres, sans rapport avec les données de l'app. */
export function CitationRotative() {
  const [index, setIndex] = useState(0);
  const [visible, setVisible] = useState(true);

  useEffect(() => {
    const minuteur = setInterval(() => {
      setVisible(false);
      setTimeout(() => {
        setIndex((i) => (i + 1) % CITATIONS.length);
        setVisible(true);
      }, DUREE_FONDU_MS);
    }, INTERVALLE_MS);
    return () => clearInterval(minuteur);
  }, []);

  const citation = CITATIONS[index]!;

  return (
    // Hauteur réservée : la citation la plus longue ne doit jamais changer
    // la hauteur du bloc, sinon tout ce qui est au-dessus (centré
    // verticalement dans la colonne) se décale à chaque rotation.
    <div className="flex min-h-[5.5rem] max-w-sm flex-col justify-start gap-2">
      <p
        aria-live="off"
        className={`text-sm italic leading-relaxed text-texte-faible transition-all ease-in-out ${
          visible ? "translate-y-0 opacity-100" : "translate-y-1 opacity-0"
        }`}
        style={{ transitionDuration: `${DUREE_FONDU_MS}ms` }}
      >
        « {citation.texte} »
      </p>
      <p
        className={`text-xs text-texte-faible/70 transition-opacity ease-in-out ${visible ? "opacity-100" : "opacity-0"}`}
        style={{ transitionDuration: `${DUREE_FONDU_MS}ms` }}
      >
        {citation.auteur}
      </p>
    </div>
  );
}
