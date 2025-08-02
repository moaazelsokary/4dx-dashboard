import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { testSharePointConnection, getDepartmentData } from "@/services/sharepointService";

const TestConnection = () => {
  const [isLoading, setIsLoading] = useState(false);
  const [result, setResult] = useState<string>("");
  const navigate = useNavigate();

  // Authentication check
  useEffect(() => {
    const userData = localStorage.getItem("user");
    if (!userData) {
      navigate("/");
      return;
    }
    
    const user = JSON.parse(userData);
    // Allow CEO, operations department, and all other department users (admin, hr, it, etc.)
    if (user.role !== "CEO" && 
        !(user.role === "department" && user.departments.includes("operations")) &&
        user.role !== "project") {
      // Allow all department users (admin, hr, it, etc.) but not project users
      if (user.role !== "department") {
        navigate("/access-denied");
        return;
      }
    }
  }, [navigate]);

  const testConnection = async () => {
    setIsLoading(true);
    setResult("Testing connection...");

    try {
      // Test environment variables
      console.log("🔧 Environment Variables Debug:");
      console.log("VITE_SHAREPOINT_CLIENT_ID:", import.meta.env.VITE_SHAREPOINT_CLIENT_ID);
      console.log("VITE_SHAREPOINT_TENANT_ID:", import.meta.env.VITE_SHAREPOINT_TENANT_ID);
      console.log("VITE_SHAREPOINT_SITE_NAME:", import.meta.env.VITE_SHAREPOINT_SITE_NAME);
      console.log("VITE_DEPARTMENT_FILES:", import.meta.env.VITE_DEPARTMENT_FILES);
      console.log("VITE_DEPARTMENT_FILES length:", import.meta.env.VITE_DEPARTMENT_FILES?.length);

      // Test the connection
      const connectionResult = await testSharePointConnection();
      
      if (connectionResult.success) {
        setResult(`✅ ${connectionResult.message}`);
        console.log("📊 Connection details:", connectionResult.details);
      } else {
        setResult(`❌ ${connectionResult.message}`);
        console.error("Connection failed:", connectionResult.details);
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : "Unknown error";
      setResult(`❌ Error: ${errorMessage}`);
      console.error("Test failed:", error);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center p-4">
      <Card className="w-full max-w-md">
        <CardHeader>
          <CardTitle>SharePoint Connection Test</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <Button 
            onClick={testConnection} 
            disabled={isLoading}
            className="w-full"
          >
            {isLoading ? "Testing..." : "Test Connection"}
          </Button>
          
          {result && (
            <div className="p-3 bg-muted rounded">
              <p className="text-sm">{result}</p>
            </div>
          )}

          <div className="text-xs text-muted-foreground space-y-1">
            <p><strong>Environment Variables:</strong></p>
            <p>Client ID: {import.meta.env.VITE_SHAREPOINT_CLIENT_ID ? "✓ Set" : "✗ Missing"}</p>
            <p>Tenant ID: {import.meta.env.VITE_SHAREPOINT_TENANT_ID ? "✓ Set" : "✗ Missing"}</p>
            <p>Site Name: {import.meta.env.VITE_SHAREPOINT_SITE_NAME ? "✓ Set" : "✗ Missing"}</p>
            <p>Department Files: {import.meta.env.VITE_DEPARTMENT_FILES ? "✓ Set" : "✗ Missing"}</p>
            {import.meta.env.VITE_DEPARTMENT_FILES && (
              <p>Length: {import.meta.env.VITE_DEPARTMENT_FILES.length} characters</p>
            )}
          </div>

          <div className="text-xs text-muted-foreground">
            <p><strong>Test Instructions:</strong></p>
            <p>1. Click "Test Connection" to verify SharePoint access</p>
            <p>2. Check browser console for detailed logs</p>
            <p>3. If successful, try signing in with "hr" / "password123"</p>
            <p>4. If env vars are missing, restart the dev server</p>
          </div>
        </CardContent>
      </Card>
    </div>
  );
};

export default TestConnection; 