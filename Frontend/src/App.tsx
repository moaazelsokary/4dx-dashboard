import { Suspense, lazy } from "react";
import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import LoadingFallback from "@/components/ui/loading-fallback";
import SkipLink from "@/components/ui/skip-link";

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

const queryClient = new QueryClient();

const App = () => (
  <QueryClientProvider client={queryClient}>
    <Toaster />
    <Sonner />
    <BrowserRouter>
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
        <Route path="*" element={<NotFound />} />
      </Routes>
      </Suspense>
    </BrowserRouter>
  </QueryClientProvider>
);

export default App;
