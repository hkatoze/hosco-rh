import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../router", () => ({
  router: {
    navigate: vi.fn(),
    state: { location: { pathname: "/personnel" } },
  },
}));

import { router } from "../router";
import { ErreurApi } from "./client";
import { agirSurErreur } from "./queryClient";

describe("agirSurErreur — intercepteur global 401/403", () => {
  beforeEach(() => {
    vi.mocked(router.navigate).mockClear();
    router.state.location.pathname = "/personnel";
  });

  it("redirige vers /connexion sur une erreur 401", () => {
    agirSurErreur(new ErreurApi("Authentification requise.", 401));
    expect(router.navigate).toHaveBeenCalledWith("/connexion");
  });

  it("ne redirige pas si déjà sur /connexion", () => {
    router.state.location.pathname = "/connexion";
    agirSurErreur(new ErreurApi("Authentification requise.", 401));
    expect(router.navigate).not.toHaveBeenCalled();
  });

  it("redirige vers /changer-mot-de-passe sur un 403 MOT_DE_PASSE_A_CHANGER", () => {
    agirSurErreur(new ErreurApi("Changement requis.", 403, "MOT_DE_PASSE_A_CHANGER"));
    expect(router.navigate).toHaveBeenCalledWith("/changer-mot-de-passe");
  });

  it("ignore un 403 sans ce code (ex: rôle insuffisant)", () => {
    agirSurErreur(new ErreurApi("Accès refusé.", 403));
    expect(router.navigate).not.toHaveBeenCalled();
  });

  it("ignore les erreurs qui ne viennent pas de l'API", () => {
    agirSurErreur(new Error("erreur quelconque"));
    expect(router.navigate).not.toHaveBeenCalled();
  });
});
