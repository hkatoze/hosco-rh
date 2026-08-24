import { useRef, type ReactNode } from "react";
import { useFocusTrap } from "../hooks/useFocusTrap";

interface ModaleProps {
  ouverte: boolean;
  titre: string;
  onFermer: () => void;
  children: ReactNode;
}

export function Modale({ ouverte, titre, onFermer, children }: ModaleProps) {
  const conteneur = useRef<HTMLDivElement>(null);
  useFocusTrap(conteneur, ouverte, onFermer);

  if (!ouverte) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40"
      role="dialog"
      aria-modal="true"
      aria-label={titre}
      onClick={onFermer}
    >
      <div
        ref={conteneur}
        tabIndex={-1}
        className="w-full max-w-lg border border-bordure bg-fond-carte p-6 shadow-carte"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-base font-medium text-texte-fort">{titre}</h2>
          <button
            type="button"
            onClick={onFermer}
            aria-label="fermer"
            className="border border-transparent px-2 py-1 text-texte-faible hover:border-bordure"
          >
            ✕
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}
