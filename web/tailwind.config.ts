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
        // Thème sombre sitewide (décision du 2026-08-21) : anciennement
        // réservé à l'écran de connexion, généralisé à toute l'application.
        texte: {
          fort: "#F7F3EC",
          faible: "#C6B9A8",
        },
        bordure: "#4E4030",
        statut: {
          // Éclaircis par rapport à la palette claire d'origine pour rester
          // lisibles (contraste) sur fond sombre.
          vert: "#7FBF3E",
          ambre: "#E0A339",
          gris: "#A79C8E",
          rouge: "#A32D2D",
        },
        fond: {
          page: "#241E17",
          carte: "#332A20",
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
        // l'application.
        carte: "0 12px 30px -10px rgba(0,0,0,0.45), 0 0 0 1px rgba(0,0,0,0.25)",
        // Ombre plus marquée, réservée aux écrans d'authentification
        // (connexion, changement de mot de passe) pour un effet "carte
        // flottante" plus prononcé.
        connexion: "0 30px 80px -20px rgba(0,0,0,0.65), 0 0 0 1px rgba(163,45,45,0.18)",
      },
    },
  },
  plugins: [],
} satisfies Config;
