import { Route, Routes } from 'react-router-dom';
import { BuildPage } from './pages/BuildPage';
import { ComparePage } from './pages/ComparePage';
import { FindingsPage } from './pages/FindingsPage';
import { LandingPage } from './pages/LandingPage';
import { MethodPage } from './pages/MethodPage';
import { NotFoundPage } from './pages/NotFoundPage';
import { ReportPage } from './pages/ReportPage';
import { ROUTES } from './ui';
import { Shell } from './ui/Shell';

export function App() {
  return (
    <Routes>
      <Route element={<Shell />}>
        <Route path={ROUTES.home} element={<LandingPage />} />
        <Route path={ROUTES.build} element={<BuildPage />} />
        <Route path={ROUTES.findings} element={<FindingsPage />} />
        <Route path={ROUTES.compare} element={<ComparePage />} />
        <Route path={ROUTES.report} element={<ReportPage />} />
        <Route path={ROUTES.method} element={<MethodPage />} />
        <Route path="*" element={<NotFoundPage />} />
      </Route>
    </Routes>
  );
}
