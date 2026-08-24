import { forwardRef, type ButtonHTMLAttributes } from "react";

type Variante = "primaire" | "secondaire" | "discret";

interface ButonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variante?: Variante;
}

const CLASSES_VARIANTE: Record<Variante, string> = {
  primaire: "border-primaire text-primaire hover:bg-primaire hover:text-white",
  secondaire: "border-texte-fort text-texte-fort hover:bg-texte-fort hover:text-fond-page",
  discret: "border-bordure text-texte-faible hover:border-texte-faible",
};

export const Bouton = forwardRef<HTMLButtonElement, ButonProps>(function Bouton(
  { variante = "secondaire", className = "", ...props },
  ref,
) {
  return (
    <button
      ref={ref}
      className={`inline-flex items-center justify-center gap-2 border bg-transparent px-4 py-2 text-sm font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:bg-transparent disabled:hover:text-inherit ${CLASSES_VARIANTE[variante]} ${className}`}
      {...props}
    />
  );
});
