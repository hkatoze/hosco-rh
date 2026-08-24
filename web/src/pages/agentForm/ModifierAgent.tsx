import { useParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { apiFetch, ErreurApi } from "../../api/client";
import type { AgentDetail } from "../../api/types";
import { Alerte } from "../../components/Alerte";
import { FormulaireAgent } from "./FormulaireAgent";

export function ModifierAgent() {
  const { id } = useParams<{ id: string }>();
  const { data: agent, isLoading, isError, error } = useQuery({
    queryKey: ["agent", id],
    queryFn: () => apiFetch<AgentDetail>(`/api/agents/${id}`),
  });

  if (isLoading) return null;
  if (isError || !agent) {
    return (
      <Alerte
        variante="erreur"
        titre="Agent introuvable"
        description={error instanceof ErreurApi ? error.message : "Impossible de charger cet agent."}
      />
    );
  }

  return <FormulaireAgent mode="modification" agentExistant={agent} />;
}
