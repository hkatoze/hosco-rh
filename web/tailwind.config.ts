import type { Config } from "tailwindcss";

// Seul endroit où les couleurs/rayons/typo sont définis (voir CLAUDE.md).
// Aucune couleur en dur ailleurs dans les composants.
export default {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    borderRadius: {
      none: "0px",
      DEFAULT: "0px",
      full: "9999px", // réservé aux pastilles (badges numériques), jamais aux boîtes
    },
    extend: {
      colors: {
        primaire: "#A32D2D",
        // Thème clair chaud (décision du 2026-08-26, retour sur le thème
        // sombre sitewide du 2026-08-21) : mêmes tons crème/brun que le
        // thème sombre, inversés — le rouge de marque ne change pas.
        // Contrastes vérifiés ≥4.5:1 (texte) / ≥3:1 (bordures) sur les
        // fonds correspondants.
        texte: {
          fort: "#241E17",
          faible: "#6B5D4A",
        },
        bordure: "#C9B896",
        statut: {
          // Assombris par rapport à la palette sombre précédente pour
          // rester lisibles (contraste) sur fond clair.
          vert: "#3F7A1F",
          ambre: "#965F10",
          gris: "#726657",
          rouge: "#A32D2D",
        },
        fond: {
          page: "#F7F3EC",
          carte: "#FFFFFF",
        },
      },
      fontFamily: {
        sans: ["Inter", "system-ui", "sans-serif"],
      },
      fontWeight: {
        normal: "400",
        moyen: "500",
      },
      spacing: {
        barreLaterale: "248px",
        barreSuperieure: "64px",
      },
      boxShadow: {
        // Ombre courante pour les cartes/panneaux (fond-carte) partout dans
        // l'application. Teinte brune (pas noire) et opacité réduite pour un
        // rendu doux sur fond clair.
        carte: "0 12px 30px -10px rgba(36,30,23,0.16), 0 0 0 1px rgba(36,30,23,0.05)",
        // Ombre plus marquée, réservée aux écrans d'authentification
        // (connexion, changement de mot de passe) pour un effet "carte
        // flottante" plus prononcé.
        connexion: "0 30px 80px -20px rgba(36,30,23,0.28), 0 0 0 1px rgba(163,45,45,0.15)",
      },
    },
  },
  plugins: [],
} satisfies Config;
