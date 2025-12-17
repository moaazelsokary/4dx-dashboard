import { useEffect, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Progress } from '@/components/ui/progress';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, PieChart, Pie, Cell } from 'recharts';
import { getKPIBreakdown } from '@/services/wigService';
import type { KPIBreakdownResponse } from '@/types/wig';
import { Loader2 } from 'lucide-react';

interface DepartmentBreakdownProps {
  kpi: string;
  annualTarget: number;
}

const COLORS = ['#0088FE', '#00C49F', '#FFBB28', '#FF8042', '#8884d8', '#82ca9d', '#ffc658', '#ff7300'];

export default function DepartmentBreakdown({ kpi, annualTarget }: DepartmentBreakdownProps) {
  const [data, setData] = useState<KPIBreakdownResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const fetchData = async () => {
      try {
        setLoading(true);
        const breakdown = await getKPIBreakdown(kpi);
        setData(breakdown);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to load breakdown');
        console.error('Error fetching KPI breakdown:', err);
      } finally {
        setLoading(false);
      }
    };

    fetchData();
  }, [kpi]);

  if (loading) {
    return (
      <Card>
        <CardContent className="pt-6">
          <div className="flex items-center justify-center py-8">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        </CardContent>
      </Card>
    );
  }

  if (error || !data) {
    return (
      <Card>
        <CardContent className="pt-6">
          <div className="text-center text-sm text-muted-foreground py-4">
            {error || 'No data available'}
          </div>
        </CardContent>
      </Card>
    );
  }

  const chartData = data.breakdown.map((item) => ({
    name: item.department,
    value: item.sum,
    percentage: item.percentage.toFixed(1),
  }));

  const totalSum = data.breakdown.reduce((sum, item) => sum + item.sum, 0);

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Department Breakdown: {kpi}</CardTitle>
          <div className="text-sm text-muted-foreground">
            Annual Target: {annualTarget.toLocaleString()} | Total Sum: {totalSum.toLocaleString()}
          </div>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Department</TableHead>
                <TableHead className="text-right">Sum</TableHead>
                <TableHead className="text-right">Percentage</TableHead>
                <TableHead>Visual</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {data.breakdown.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={4} className="text-center text-muted-foreground py-4">
                    No department objectives found for this KPI
                  </TableCell>
                </TableRow>
              ) : (
                data.breakdown.map((item) => (
                  <TableRow key={item.departmentId}>
                    <TableCell className="font-medium">{item.department}</TableCell>
                    <TableCell className="text-right">{item.sum.toLocaleString()}</TableCell>
                    <TableCell className="text-right">{item.percentage.toFixed(2)}%</TableCell>
                    <TableCell>
                      <Progress value={item.percentage} className="h-2" />
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {data.breakdown.length > 0 && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Bar Chart</CardTitle>
            </CardHeader>
            <CardContent>
              <ResponsiveContainer width="100%" height={300}>
                <BarChart data={chartData}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="name" angle={-45} textAnchor="end" height={100} />
                  <YAxis />
                  <Tooltip />
                  <Legend />
                  <Bar dataKey="value" fill="#0088FE" name="Sum" />
                </BarChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-base">Pie Chart</CardTitle>
            </CardHeader>
            <CardContent>
              <ResponsiveContainer width="100%" height={300}>
                <PieChart>
                  <Pie
                    data={chartData}
                    cx="50%"
                    cy="50%"
                    labelLine={false}
                    label={({ name, percentage }) => `${name}: ${percentage}%`}
                    outerRadius={80}
                    fill="#8884d8"
                    dataKey="value"
                  >
                    {chartData.map((entry, index) => (
                      <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                    ))}
                  </Pie>
                  <Tooltip />
                </PieChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  );
}

