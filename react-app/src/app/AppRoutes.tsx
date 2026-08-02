import type { ReactNode } from "react";
import { Navigate, Route, Routes } from "react-router-dom";

export interface AppRoutePages {
  home: ReactNode;
  login: ReactNode;
  profile: ReactNode;
  backup: ReactNode;
  settings: ReactNode;
  discordFormat: ReactNode;
  scenarios: ReactNode;
  scenarioCreate: ReactNode;
  scenarioEdit: ReactNode;
  scenarioDetail: ReactNode;
}

export function AppRoutes({ pages }: { pages: AppRoutePages }) {
  return (
    <Routes>
      <Route path="/" element={pages.home} />
      <Route path="/login" element={pages.login} />
      <Route path="/profile" element={pages.profile} />
      <Route path="/backup" element={pages.backup} />
      <Route path="/settings" element={pages.settings} />
      <Route path="/settings/discord-format" element={pages.discordFormat} />
      <Route path="/scenarios" element={pages.scenarios} />
      <Route path="/scenarios/new" element={pages.scenarioCreate} />
      <Route path="/scenarios/:scenarioId/edit" element={pages.scenarioEdit} />
      <Route path="/scenarios/:scenarioId" element={pages.scenarioDetail} />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
