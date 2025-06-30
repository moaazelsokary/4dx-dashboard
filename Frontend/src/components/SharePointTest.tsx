import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { RefreshCw, AlertCircle, CheckCircle } from 'lucide-react';
import { getDepartmentData, getDepartmentFiles } from '@/services/sharepointService';

const SharePointTest = () => {
  const [isLoading, setIsLoading] = useState(false);
  const [result, setResult] = useState<{ success: boolean; message: string; data?: any } | null>(null);

  const testConnection = async () => {
    setIsLoading(true);
    setResult(null);

    try {
      // Test with the first available department
      const departments = getDepartmentFiles();
      console.log('Available departments:', departments);

      if (departments.length === 0) {
        setResult({
          success: false,
          message: 'No departments configured. Please check your environment variables.'
        });
        return;
      }

      const testDepartment = departments[0];
      console.log('Testing with department:', testDepartment);

      const data = await getDepartmentData(testDepartment.department);
      console.log('Fetched data:', data);

      setResult({
        success: true,
        message: `Successfully connected to SharePoint! Found ${data.length} LAG measures for ${testDepartment.department}.`,
        data
      });
    } catch (error) {
      console.error('SharePoint test failed:', error);
      setResult({
        success: false,
        message: error instanceof Error ? error.message : 'Unknown error occurred'
      });
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <Card className="w-full max-w-2xl mx-auto">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <RefreshCw className="w-5 h-5" />
          SharePoint Connection Test
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex items-center gap-2">
          <Button 
            onClick={testConnection} 
            disabled={isLoading}
            className="flex items-center gap-2"
          >
            {isLoading && <RefreshCw className="w-4 h-4 animate-spin" />}
            {isLoading ? 'Testing...' : 'Test Connection'}
          </Button>
        </div>

        {result && (
          <div className={`p-4 rounded-lg border ${
            result.success 
              ? 'border-green-200 bg-green-50' 
              : 'border-red-200 bg-red-50'
          }`}>
            <div className="flex items-center gap-2">
              {result.success ? (
                <CheckCircle className="w-5 h-5 text-green-600" />
              ) : (
                <AlertCircle className="w-5 h-5 text-red-600" />
              )}
              <span className={`font-medium ${
                result.success ? 'text-green-800' : 'text-red-800'
              }`}>
                {result.success ? 'Success' : 'Error'}
              </span>
            </div>
            <p className={`mt-2 text-sm ${
              result.success ? 'text-green-700' : 'text-red-700'
            }`}>
              {result.message}
            </p>
            
            {result.success && result.data && (
              <div className="mt-4">
                <h4 className="font-medium text-green-800 mb-2">Sample Data:</h4>
                <div className="space-y-2">
                  {result.data.slice(0, 3).map((lag: any, index: number) => (
                    <div key={index} className="p-2 bg-white rounded border">
                      <div className="font-medium text-sm">{lag.name}</div>
                      <div className="text-xs text-gray-600">
                        Value: {lag.value} / Target: {lag.target} 
                        ({lag.value === 0 && lag.target === 0 ? '100%' : Math.round((lag.value / lag.target) * 100) + '%' })
                        {lag.value === 0 && lag.target === 0 && (
                          <span className="ml-2 px-2 py-0.5 rounded bg-blue-100 text-blue-700">Not Yet</span>
                        )}
                      </div>
                      <div className="text-xs text-gray-500">
                        {lag.leads.length} related leads
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}

        <div className="text-xs text-gray-500 space-y-1">
          <p><strong>Environment Variables:</strong></p>
          <p>Client ID: {import.meta.env.VITE_SHAREPOINT_CLIENT_ID ? '✓ Set' : '✗ Missing'}</p>
          <p>Tenant ID: {import.meta.env.VITE_SHAREPOINT_TENANT_ID ? '✓ Set' : '✗ Missing'}</p>
          <p>Site Name: {import.meta.env.VITE_SHAREPOINT_SITE_NAME ? '✓ Set' : '✗ Missing'}</p>
          <p>Department Files: {import.meta.env.VITE_DEPARTMENT_FILES ? '✓ Set' : '✗ Missing'}</p>
        </div>
      </CardContent>
    </Card>
  );
};

export default SharePointTest; 