type CouleurBadge = "vert" | "ambre" | "gris" | "rouge";

interface BadgeProps {
  couleur: CouleurBadge;
  children: React.ReactNode;
}

const CLASSES_COULEUR: Record<CouleurBadge, string> = {
  vert: "border-statut-vert text-statut-vert",
  ambre: "border-statut-ambre text-statut-ambre",
  gris: "border-statut-gris text-statut-gris",
  rouge: "border-statut-rouge text-statut-rouge",
};

export function Badge({ couleur, children }: BadgeProps) {
  return (
    <span className={`inline-block border px-2 py-0.5 text-xs font-medium ${CLASSES_COULEUR[couleur]}`}>
      {children}
    </span>
  );
}

/** Pastille numérique ronde (ex: compteur d'anomalies dans la barre latérale). */
export function Pastille({ children }: { children: React.ReactNode }) {
  return (
    <span className="inline-flex min-w-[1.25rem] items-center justify-center rounded-full border border-primaire bg-primaire px-1.5 py-0.5 text-xs font-medium text-white">
      {children}
    </span>
  );
}
