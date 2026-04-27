import { useEffect } from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { getAuthToken, getCurrentUser } from '@/services/authService';
import { canAccessAppPath } from '@/utils/routeAccess';
import { getPowerbiDashboards, POWERBI_DASHBOARDS_QUERY_KEY } from '@/services/configService';
import { setPowerbiRoutingCatalogFromRecords } from '@/config/powerbi';

type GuardedRouteProps = {
  children: React.ReactNode;
};

/**
 * Loads Power BI dashboard catalog once per session so route checks and nav match dbo.powerbi_dashboards.
 */
function PowerbiCatalogSync() {
  const { data } = useQuery({
    queryKey: POWERBI_DASHBOARDS_QUERY_KEY,
    queryFn: getPowerbiDashboards,
    staleTime: 60_000,
    retry: 1,
  });
  useEffect(() => {
    if (data?.length) {
      setPowerbiRoutingCatalogFromRecords(data);
    }
  }, [data]);
  return null;
}

/**
 * Requires a valid session and enforces per-user allowed routes when overrides are set.
 */
export default function GuardedRoute({ children }: GuardedRouteProps) {
  const location = useLocation();
  const token = getAuthToken();
  const user = getCurrentUser();

  if (!token || !user) {
    return <Navigate to="/" replace state={{ from: location.pathname }} />;
  }

  const path = location.pathname;
  if (!canAccessAppPath(path, user)) {
    return <Navigate to="/access-denied" replace />;
  }

  return (
    <>
      <PowerbiCatalogSync />
      {children}
    </>
  );
}
