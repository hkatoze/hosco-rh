import { useQueryClient } from "@tanstack/react-query";
import { deposerDocument } from "../../api/uploadDocument";
import { Modale } from "../Modale";
import { DeposeDocument } from "./DeposeDocument";

interface AjouterDocumentModaleProps {
  agentId: string;
  ouverte: boolean;
  onFermer: () => void;
}

export function AjouterDocumentModale({ agentId, ouverte, onFermer }: AjouterDocumentModaleProps) {
  const queryClient = useQueryClient();

  return (
    <Modale ouverte={ouverte} titre="Ajouter un document" onFermer={onFermer}>
      <DeposeDocument
        onFichier={async (fichier, type, onProgression) => {
          await deposerDocument(agentId, fichier, type, onProgression);
          await queryClient.invalidateQueries({ queryKey: ["agent", agentId] });
        }}
      />
    </Modale>
  );
}
