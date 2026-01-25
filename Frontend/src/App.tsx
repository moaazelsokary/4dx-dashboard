import { Suspense, lazy } from "react";
import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import LoadingFallback from "@/components/ui/loading-fallback";
import SkipLink from "@/components/ui/skip-link";
import { useNetworkStatus } from "@/hooks/useNetworkStatus";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Wifi, WifiOff } from "lucide-react";
import ErrorBoundary from "@/components/ErrorBoundary";

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
const CMSDashboard = lazy(() => import("./pages/admin/CMSDashboard"));
const Configuration = lazy(() => import("./pages/admin/Configuration"));

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
    <QueryClientProvider client={queryClient}>
      <Toaster />
      <Sonner />
      <BrowserRouter>
        <NetworkStatusBanner />
        <SkipLink />
        <Suspense fallback={<LoadingFallback />}>
        <Routes>
          <Route path="/" element={<SignIn />} />
          <Route path="/dashboard" element={<Dashboard />} />
          <Route path="/wig-plan-2025" element={<WIGPlan2025 />} />
          <Route path="/main-plan" element={<MainPlanObjectives />} />
          <Route path="/department-objectives" element={<DepartmentObjectives />} />
          <Route path="/test" element={<TestConnection />} />
          <Route path="/summary" element={<Summary />} />
          <Route path="/project-details" element={<ProjectDetails />} />
          <Route path="/powerbi" element={<PowerBIDashboard />} />
          <Route path="/access-denied" element={<AccessDenied />} />
            <Route path="/privacy-policy" element={<PrivacyPolicy />} />
            <Route path="/terms-of-service" element={<TermsOfService />} />
            <Route path="/settings" element={<Settings />} />
            <Route path="/admin/cms" element={<CMSDashboard />} />
            <Route path="/admin/configuration" element={<Configuration />} />
          <Route path="*" element={<NotFound />} />
        </Routes>
        </Suspense>
      </BrowserRouter>
    </QueryClientProvider>
  </ErrorBoundary>
);

export default App;
