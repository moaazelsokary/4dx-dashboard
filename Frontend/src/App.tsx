import { Suspense, lazy } from "react";
import { ThemeProvider } from "next-themes";
import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import LoadingFallback from "@/components/ui/loading-fallback";
import { useNetworkStatus } from "@/hooks/useNetworkStatus";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Wifi, WifiOff } from "lucide-react";
import ErrorBoundary from "@/components/ErrorBoundary";
import GuardedRoute from "@/components/auth/GuardedRoute";

// Lazy load all route components
const SignIn = lazy(() => import("./pages/SignIn"));
const Dashboard = lazy(() => import("./pages/Dashboard"));
const WIGPlan2025 = lazy(() => import("./pages/WIGPlan2025"));
const MainPlanObjectives = lazy(() => import("./pages/MainPlanObjectives"));
const DepartmentObjectives = lazy(() => import("./pages/DepartmentObjectives"));
const NotFound = lazy(() => import("./pages/NotFound"));
const AccessDenied = lazy(() => import("./pages/AccessDenied"));
const TestConnection = lazy(() => import("./pages/TestConnection"));
const Summary = lazy(() => import("./pages/OneDriveSummary1"));
const ProjectDetails = lazy(() => import("./pages/OneDriveProject"));
const PowerBIDashboard = lazy(() => import("./pages/PowerBIDashboard"));
const PrivacyPolicy = lazy(() => import("./pages/PrivacyPolicy"));
const TermsOfService = lazy(() => import("./pages/TermsOfService"));
const Settings = lazy(() => import("./pages/Settings"));
const Configuration = lazy(() => import("./pages/admin/Configuration"));
const PMSOdooMetrics = lazy(() => import("./pages/PMSOdooMetrics"));
const VolunteersPage = lazy(() => import("./pages/strategic-topics/VolunteersPage"));
const RefugeesPage = lazy(() => import("./pages/strategic-topics/RefugeesPage"));
const ReturneesPage = lazy(() => import("./pages/strategic-topics/ReturneesPage"));
const ReliefPage = lazy(() => import("./pages/strategic-topics/ReliefPage"));
const AwarenessPage = lazy(() => import("./pages/strategic-topics/AwarenessPage"));

const queryClient = new QueryClient();

// Network Status Banner Component
function NetworkStatusBanner() {
  const { isOnline, wasOffline, quality } = useNetworkStatus();

  if (isOnline && !wasOffline) {
    return null; // Don't show banner when online and stable
  }

  return (
    <Alert
      className={`fixed top-0 left-0 right-0 z-50 rounded-none border-x-0 border-t-0 ${
        isOnline
          ? 'bg-green-50 dark:bg-green-950 border-green-200 dark:border-green-800'
          : 'bg-red-50 dark:bg-red-950 border-red-200 dark:border-red-800'
      }`}
    >
      <div className="flex items-center gap-2">
        {isOnline ? (
          <>
            <Wifi className="h-4 w-4 text-green-600 dark:text-green-400" />
            <AlertDescription className="text-green-800 dark:text-green-200">
              {wasOffline ? 'Connection restored. Syncing changes...' : 'Connected'}
              {quality === 'slow' && ' (Slow connection)'}
            </AlertDescription>
          </>
        ) : (
          <>
            <WifiOff className="h-4 w-4 text-red-600 dark:text-red-400" />
            <AlertDescription className="text-red-800 dark:text-red-200">
              No internet connection. Changes will be saved when connection is restored.
            </AlertDescription>
          </>
        )}
      </div>
    </Alert>
  );
}

const App = () => (
  <ErrorBoundary>
    <ThemeProvider attribute="class" defaultTheme="dark" enableSystem={false} storageKey="lifemakers-theme">
      <QueryClientProvider client={queryClient}>
        <Toaster />
        <Sonner />
        <BrowserRouter>
          <NetworkStatusBanner />
          <Suspense fallback={<LoadingFallback />}>
            <Routes>
              <Route path="/" element={<SignIn />} />
              <Route path="/privacy-policy" element={<PrivacyPolicy />} />
              <Route path="/terms-of-service" element={<TermsOfService />} />
              <Route path="/access-denied" element={<AccessDenied />} />
              <Route path="/dashboard" element={<GuardedRoute><Dashboard /></GuardedRoute>} />
              <Route path="/wig-plan-2025" element={<GuardedRoute><WIGPlan2025 /></GuardedRoute>} />
              <Route path="/main-plan" element={<GuardedRoute><MainPlanObjectives /></GuardedRoute>} />
              <Route path="/main-plan/volunteers" element={<GuardedRoute><VolunteersPage /></GuardedRoute>} />
              <Route path="/main-plan/refugees" element={<GuardedRoute><RefugeesPage /></GuardedRoute>} />
              <Route path="/main-plan/returnees" element={<GuardedRoute><ReturneesPage /></GuardedRoute>} />
              <Route path="/main-plan/relief" element={<GuardedRoute><ReliefPage /></GuardedRoute>} />
              <Route path="/main-plan/awareness" element={<GuardedRoute><AwarenessPage /></GuardedRoute>} />
              <Route path="/department-objectives" element={<GuardedRoute><DepartmentObjectives /></GuardedRoute>} />
              <Route path="/test" element={<GuardedRoute><TestConnection /></GuardedRoute>} />
              <Route path="/summary" element={<GuardedRoute><Summary /></GuardedRoute>} />
              <Route path="/project-details" element={<GuardedRoute><ProjectDetails /></GuardedRoute>} />
              <Route path="/powerbi" element={<GuardedRoute><PowerBIDashboard /></GuardedRoute>} />
              <Route path="/settings" element={<GuardedRoute><Settings /></GuardedRoute>} />
              <Route path="/admin/configuration" element={<GuardedRoute><Configuration /></GuardedRoute>} />
              <Route path="/pms-odoo-metrics" element={<GuardedRoute><PMSOdooMetrics /></GuardedRoute>} />
              <Route path="*" element={<NotFound />} />
            </Routes>
          </Suspense>
        </BrowserRouter>
      </QueryClientProvider>
    </ThemeProvider>
  </ErrorBoundary>
);

export default App;
