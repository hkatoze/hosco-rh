import { createBrowserRouter, Navigate } from "react-router-dom";
import { Layout } from "./layout/Layout";
import { RouteProtegee } from "./components/RouteProtegee";
import { Connexion } from "./pages/Connexion";
import { ChangerMotDePasse } from "./pages/ChangerMotDePasse";
import { TableauDeBord } from "./pages/TableauDeBord";
import { Personnel } from "./pages/Personnel";
import { FicheAgent } from "./pages/FicheAgent";
import { NouvelAgent } from "./pages/agentForm/NouvelAgent";
import { ModifierAgent } from "./pages/agentForm/ModifierAgent";
import { Mouvements } from "./pages/Mouvements";
import { Anomalies } from "./pages/Anomalies";
import { Parametres } from "./pages/parametres/Parametres";
import { MotDePasseSection } from "./pages/parametres/MotDePasseSection";
import { ServicesSection } from "./pages/parametres/ServicesSection";
import { UtilisateursSection } from "./pages/parametres/UtilisateursSection";
import { CorbeilleSection } from "./pages/parametres/CorbeilleSection";

export const router = createBrowserRouter([
  { path: "/connexion", element: <Connexion /> },
  { path: "/changer-mot-de-passe", element: <ChangerMotDePasse /> },
  {
    element: (
      <RouteProtegee>
        <Layout />
      </RouteProtegee>
    ),
    children: [
      { path: "/", element: <TableauDeBord /> },
      { path: "/personnel", element: <Personnel /> },
      {
        path: "/personnel/nouveau",
        element: (
          <RouteProtegee roleMinimum="SAISIE">
            <NouvelAgent />
          </RouteProtegee>
        ),
      },
      { path: "/personnel/:id", element: <FicheAgent /> },
      {
        path: "/personnel/:id/modifier",
        element: (
          <RouteProtegee roleMinimum="SAISIE">
            <ModifierAgent />
          </RouteProtegee>
        ),
      },
      { path: "/mouvements", element: <Mouvements /> },
      { path: "/anomalies", element: <Anomalies /> },
      {
        path: "/parametres",
        element: <Parametres />,
        children: [
          { index: true, element: <Navigate to="mot-de-passe" replace /> },
          { path: "mot-de-passe", element: <MotDePasseSection /> },
          {
            path: "services",
            element: (
              <RouteProtegee roleMinimum="ADMIN">
                <ServicesSection />
              </RouteProtegee>
            ),
          },
          {
            path: "utilisateurs",
            element: (
              <RouteProtegee roleMinimum="ADMIN">
                <UtilisateursSection />
              </RouteProtegee>
            ),
          },
          {
            path: "corbeille",
            element: (
              <RouteProtegee roleMinimum="ADMIN">
                <CorbeilleSection />
              </RouteProtegee>
            ),
          },
        ],
      },
    ],
  },
]);
