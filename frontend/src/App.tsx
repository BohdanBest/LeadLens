import { lazy, type ReactNode, Suspense, useEffect } from "react";
import { Navigate, Route, Routes } from "react-router-dom";
import { QueryClientProvider } from "@tanstack/react-query";
import { queryClient } from "@/api/queryClient";
import { useAuthStore } from "@/stores/useAuthStore";
import { ErrorBoundary } from "@/components/ui/ErrorBoundary/ErrorBoundary";
import { AppShell } from "@/components/layout/AppShell";
import { Skeleton } from "@/components/ui/Skeleton/Skeleton";
import styles from "./App.module.scss";

const AuthPage = lazy(() =>
  import("@/pages/AuthPage/AuthPage").then((m) => ({ default: m.AuthPage }))
);
const DashboardPage = lazy(() =>
  import("@/pages/DashboardPage/DashboardPage").then((m) => ({ default: m.DashboardPage }))
);
const CampaignsPage = lazy(() =>
  import("@/pages/CampaignsPage/CampaignsPage").then((m) => ({ default: m.CampaignsPage }))
);
const CampaignCreatePage = lazy(() =>
  import("@/pages/CampaignCreatePage/CampaignCreatePage").then((m) => ({
    default: m.CampaignCreatePage,
  }))
);
const CampaignDetailPage = lazy(() =>
  import("@/pages/CampaignDetailPage/CampaignDetailPage").then((m) => ({
    default: m.CampaignDetailPage,
  }))
);
const LeadsPage = lazy(() =>
  import("@/pages/LeadsPage/LeadsPage").then((m) => ({ default: m.LeadsPage }))
);
const SiteReportPage = lazy(() =>
  import("@/pages/SiteReportPage/SiteReportPage").then((m) => ({ default: m.SiteReportPage }))
);
const EmailEditorPage = lazy(() =>
  import("@/pages/EmailEditorPage/EmailEditorPage").then((m) => ({ default: m.EmailEditorPage }))
);
const SettingsPage = lazy(() =>
  import("@/pages/SettingsPage/SettingsPage").then((m) => ({ default: m.SettingsPage }))
);
const PublicReportPage = lazy(() =>
  import("@/pages/PublicReportPage/PublicReportPage").then((m) => ({
    default: m.PublicReportPage,
  }))
);
const NotFoundPage = lazy(() =>
  import("@/pages/NotFoundPage/NotFoundPage").then((m) => ({ default: m.NotFoundPage }))
);

function RouteFallback() {
  return <Skeleton variant="card" count={2} />;
}

function BootFallback() {
  return (
    <div className={styles.bootScreen} aria-busy="true">
      <div className={styles.bootBox}>
        <Skeleton variant="title" />
        <Skeleton variant="line" count={2} />
      </div>
    </div>
  );
}

function ProtectedRoute({ children }: { children: ReactNode }) {
  const isAuthenticated = useAuthStore((s) => Boolean(s.session));
  const bootstrapped = useAuthStore((s) => s.bootstrapped);
  if (!bootstrapped) return <BootFallback />;
  if (!isAuthenticated) {
    return <Navigate to="/login" replace />;
  }
  return (
    <AppShell>
      <Suspense fallback={<RouteFallback />}>{children}</Suspense>
    </AppShell>
  );
}

function PublicOnlyRoute({ children }: { children: ReactNode }) {
  const isAuthenticated = useAuthStore((s) => Boolean(s.session));
  const bootstrapped = useAuthStore((s) => s.bootstrapped);
  if (!bootstrapped) return <BootFallback />;
  if (isAuthenticated) {
    return <Navigate to="/dashboard" replace />;
  }
  return <Suspense fallback={<RouteFallback />}>{children}</Suspense>;
}

export function App() {
  const bootstrap = useAuthStore((s) => s.bootstrap);

  useEffect(() => {
    void bootstrap();
  }, [bootstrap]);

  return (
    <ErrorBoundary>
      <QueryClientProvider client={queryClient}>
        <Routes>
          <Route
            element={
              <PublicOnlyRoute>
                <AuthPage />
              </PublicOnlyRoute>
            }
          >
            <Route path="/login" element={null} />
            <Route path="/register" element={null} />
          </Route>
          <Route
            path="/public/reports/:token"
            element={
              <Suspense fallback={<RouteFallback />}>
                <PublicReportPage />
              </Suspense>
            }
          />

          <Route
            path="/"
            element={
              <ProtectedRoute>
                <Navigate to="/dashboard" replace />
              </ProtectedRoute>
            }
          />
          <Route
            path="/dashboard"
            element={
              <ProtectedRoute>
                <DashboardPage />
              </ProtectedRoute>
            }
          />
          <Route
            path="/campaigns"
            element={
              <ProtectedRoute>
                <CampaignsPage />
              </ProtectedRoute>
            }
          />
          <Route
            path="/campaigns/new"
            element={
              <ProtectedRoute>
                <CampaignCreatePage />
              </ProtectedRoute>
            }
          />
          <Route
            path="/campaigns/:id"
            element={
              <ProtectedRoute>
                <CampaignDetailPage />
              </ProtectedRoute>
            }
          />
          <Route
            path="/leads"
            element={
              <ProtectedRoute>
                <LeadsPage />
              </ProtectedRoute>
            }
          />
          <Route
            path="/leads/:id/report"
            element={
              <ProtectedRoute>
                <SiteReportPage />
              </ProtectedRoute>
            }
          />
          <Route
            path="/leads/:id/email"
            element={
              <ProtectedRoute>
                <EmailEditorPage />
              </ProtectedRoute>
            }
          />
          <Route
            path="/settings"
            element={
              <ProtectedRoute>
                <SettingsPage />
              </ProtectedRoute>
            }
          />
          <Route
            path="*"
            element={
              <ProtectedRoute>
                <NotFoundPage />
              </ProtectedRoute>
            }
          />
        </Routes>
      </QueryClientProvider>
    </ErrorBoundary>
  );
}

export default App;
