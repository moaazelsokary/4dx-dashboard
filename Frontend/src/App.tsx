import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import SignIn from "./pages/SignIn";
import Dashboard from "./pages/Dashboard";
import WIGPlan2025 from "./pages/WIGPlan2025";
import MainPlanObjectives from "./pages/MainPlanObjectives";
import DepartmentObjectives from "./pages/DepartmentObjectives";
import NotFound from "./pages/NotFound";
import AccessDenied from "./pages/AccessDenied";
import TestConnection from "./pages/TestConnection";
import Summary from "./pages/OneDriveSummary1";
import ProjectDetails from "./pages/OneDriveProject";
import PowerBIDashboard from "./pages/PowerBIDashboard";

const queryClient = new QueryClient();

const App = () => (
  <QueryClientProvider client={queryClient}>
    <Toaster />
    <Sonner />
    <BrowserRouter>
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
        <Route path="*" element={<NotFound />} />
      </Routes>
    </BrowserRouter>
  </QueryClientProvider>
);

export default App;
