export interface ScenarioDraft {
  id: string;
  ownerId: string;
  scenarioId: string | null;
  title: string;
  payload: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
}
