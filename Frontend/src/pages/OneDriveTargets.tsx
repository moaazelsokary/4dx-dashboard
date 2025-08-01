import React, { useEffect, useState } from 'react';

// Use local proxy for development, Netlify function for production
const isLocalhost = window.location.hostname === 'localhost';
const ONEDRIVE_FUNCTION_URL = isLocalhost 
  ? 'http://localhost:3002/api/onedrive'
  : '/.netlify/functions/get_excel_data_from_onedrive_url';
const ONEDRIVE_SAMPLE_URL = 'https://lifemaker-my.sharepoint.com/:x:/r/personal/hamed_ibrahim_lifemakers_org/_layouts/15/Doc.aspx?sourcedoc=%7B084A3748-79EC-41B1-B3EB-8ECED81E5C53%7D&file=Projects%20Dashboard%202025%20-%20Internal%20tracker.xlsx&fromShare=true&action=default&mobileredirect=true';

const OneDriveTargets: React.FC = () => {
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function fetchData() {
      setLoading(true);
      setError(null);
      try {
        const res = await fetch(`${ONEDRIVE_FUNCTION_URL}?oneDriveUrl=${encodeURIComponent(ONEDRIVE_SAMPLE_URL)}`);
        if (!res.ok) throw new Error('Failed to fetch OneDrive data');
        const json = await res.json();
        setData(json.worksheets);
      } catch (e: any) {
        setError(e.message);
      } finally {
        setLoading(false);
      }
    }
    fetchData();
  }, []);

  return (
    <div className="container mx-auto px-4 py-6">
      <h1 className="text-2xl font-bold mb-4">OneDrive Targets</h1>
      {loading && <div>Loading...</div>}
      {error && <div className="text-red-500">{error}</div>}
      {!loading && !error && data && (
        <div>
          {/* TODO: Add targets table or cards here using data from the Overall Targets tab */}
          <pre className="bg-muted p-4 rounded text-xs overflow-x-auto">{JSON.stringify(data['Overall Targets'], null, 2)}</pre>
        </div>
      )}
    </div>
  );
};

export default OneDriveTargets; 