import { useEffect, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Checkbox } from '@/components/ui/checkbox';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { getRASCIByKPI, createOrUpdateRASCI, deleteRASCI, getKPIsWithRASCI, getDepartments } from '@/services/wigService';
import { toast } from '@/hooks/use-toast';
import type { RASCI, Department } from '@/types/wig';
import { Loader2, Save, Trash2, Users, CheckCircle2, XCircle, AlertCircle, Info, HelpCircle } from 'lucide-react';
import BidirectionalText from '@/components/ui/BidirectionalText';

interface RASCIEditorProps {
  kpi?: string;
  onKPIChange?: (kpi: string) => void;
  readOnly?: boolean;
}

export default function RASCIEditor({ kpi: initialKPI, onKPIChange, readOnly = false }: RASCIEditorProps) {
  const [selectedKPI, setSelectedKPI] = useState<string>(initialKPI || '');
  const [kpis, setKpis] = useState<string[]>([]);
  const [departments, setDepartments] = useState<Department[]>([]);
  const [rasciData, setRasciData] = useState<Map<string, RASCI>>(new Map());
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    const fetchData = async () => {
      try {
        setLoading(true);
        const [kpiList, deptList] = await Promise.all([
          getKPIsWithRASCI(),
          getDepartments(),
        ]);
        setKpis(kpiList);
        setDepartments(deptList);
        
        if (kpiList.length > 0 && !selectedKPI) {
          setSelectedKPI(kpiList[0]);
        }
      } catch (err) {
        toast({
          title: 'Error',
          description: 'Failed to load data',
          variant: 'destructive',
        });
      } finally {
        setLoading(false);
      }
    };

    fetchData();
  }, []);

  useEffect(() => {
    if (selectedKPI) {
      loadRASCIForKPI(selectedKPI);
      if (onKPIChange) {
        onKPIChange(selectedKPI);
      }
    }
  }, [selectedKPI]);

  // Helper function to normalize department names for matching
  // Always use "Direct Fundraising / Resource Mobilization" for DFR
  const normalizeDepartmentName = (name: string, code: string): string => {
    // If code is "dfr", always use the full name
    if (code.toLowerCase() === 'dfr') {
      return 'Direct Fundraising / Resource Mobilization';
    }
    return name;
  };

  // Helper function to match department from database with frontend department
  const matchDepartment = (dbDepartment: string, deptName: string, deptCode: string): boolean => {
    // Exact match
    if (dbDepartment === deptName || dbDepartment === deptCode) {
      return true;
    }
    
    // Handle DFR special case - match both "DFR" and "Direct Fundraising / Resource Mobilization"
    if (deptCode.toLowerCase() === 'dfr') {
      const normalizedName = 'Direct Fundraising / Resource Mobilization';
      if (dbDepartment === normalizedName || 
          dbDepartment === 'DFR' || 
          dbDepartment.toLowerCase() === 'dfr' ||
          dbDepartment.toLowerCase().includes('direct fundraising') ||
          dbDepartment.toLowerCase().includes('resource mobilization')) {
        return true;
      }
    }
    
    // Case-insensitive match
    if (dbDepartment.toLowerCase() === deptName.toLowerCase() || 
        dbDepartment.toLowerCase() === deptCode.toLowerCase()) {
      return true;
    }
    
    return false;
  };

  const loadRASCIForKPI = async (kpi: string) => {
    try {
      setLoading(true);
      const data = await getRASCIByKPI(kpi);
      const rasciMap = new Map<string, RASCI>();
      
      // Initialize with all departments
      // Use department name as key since database stores department names
      departments.forEach((dept) => {
        // Match by name or code, with special handling for DFR
        const existing = data.find((r) => matchDepartment(r.department, dept.name, dept.code));
        if (existing) {
          // Normalize the department name - always use "Direct Fundraising / Resource Mobilization" for DFR
          const normalizedDeptName = normalizeDepartmentName(dept.name, dept.code);
          
          // Update the existing record to use the normalized department name
          const updatedExisting = {
            ...existing,
            department: normalizedDeptName
          };
          
          rasciMap.set(dept.name, updatedExisting);
        } else {
          // Create new entry with department name (not code)
          rasciMap.set(dept.name, {
            id: 0,
            kpi,
            department: dept.name, // Use name, not code
            responsible: false,
            accountable: false,
            supportive: false,
            consulted: false,
            informed: false,
          });
        }
      });
      
      setRasciData(rasciMap);
    } catch (err: any) {
      console.error('Error loading RASCI data for KPI:', kpi, err);
      const errorMessage = err?.message || err?.toString() || 'Unknown error';
      toast({
        title: 'Error',
        description: `Failed to load RASCI data: ${errorMessage}`,
        variant: 'destructive',
      });
    } finally {
      setLoading(false);
    }
  };

  const updateRASCI = (departmentName: string, field: keyof Omit<RASCI, 'id' | 'kpi' | 'department' | 'created_at' | 'updated_at'>, value: boolean) => {
    const updated = new Map(rasciData);
    const current = updated.get(departmentName) || {
      id: 0,
      kpi: selectedKPI,
      department: departmentName, // Use department name
      responsible: false,
      accountable: false,
      supportive: false,
      consulted: false,
      informed: false,
    };
    
    updated.set(departmentName, { ...current, [field]: value });
    setRasciData(updated);
  };

  const saveRASCI = async () => {
    if (!selectedKPI) {
      toast({
        title: 'Error',
        description: 'Please select a KPI',
        variant: 'destructive',
      });
      return;
    }

    try {
      setSaving(true);
      const promises: Promise<any>[] = [];
      
      rasciData.forEach((rasci) => {
        const hasAnyRole = rasci.responsible || rasci.accountable || rasci.supportive || rasci.consulted || rasci.informed;
        
        // Find the department to get the correct name/code
        const dept = departments.find(d => d.name === rasci.department || d.code === rasci.department);
        
        // Normalize department name - if it's DFR-related, always use "Direct Fundraising / Resource Mobilization"
        let dbDepartmentName = rasci.department;
        if (dept && dept.code.toLowerCase() === 'dfr') {
          // Always use the full name for DFR
          dbDepartmentName = 'Direct Fundraising / Resource Mobilization';
        }
        
        if (hasAnyRole) {
          // Save if at least one role is assigned
          const rasciToSave = {
            ...rasci,
            department: dbDepartmentName // Use normalized name
          };
          promises.push(createOrUpdateRASCI(rasciToSave).catch(err => {
            console.error(`Error saving RASCI for ${rasciToSave.department}:`, err);
            throw err;
          }));
        } else if (rasci.id && rasci.id > 0) {
          // Delete if no roles assigned AND record exists in database (has id > 0)
          console.log(`Deleting RASCI record id=${rasci.id} for department ${rasci.department}`);
          promises.push(deleteRASCI(rasci.id).catch(err => {
            console.error(`Error deleting RASCI id=${rasci.id}:`, err);
            throw err;
          }));
        }
        // If no roles and no id (id === 0), it was never saved, so do nothing
      });

      // Use Promise.allSettled to handle partial failures
      const results = await Promise.allSettled(promises);
      console.log('RASCI save results:', results);
      
      // Process results
      const successful: any[] = [];
      const failed: Array<{ department: string; error: Error }> = [];
      
      let index = 0;
      rasciData.forEach((rasci) => {
        const result = results[index++];
        if (result.status === 'fulfilled') {
          successful.push(result.value);
        } else {
          const error = result.reason instanceof Error ? result.reason : new Error('Save failed');
          failed.push({ department: rasci.department, error });
        }
      });
      
      // Show results
      if (failed.length === 0) {
        toast({
          title: 'Success',
          description: 'RASCI assignments saved successfully',
        });
      } else if (successful.length > 0) {
        toast({
          title: 'Partial Success',
          description: `Saved ${successful.length} assignment(s), but ${failed.length} failed. Please try again.`,
          variant: 'default',
        });
        // Log failed departments for debugging
        console.error('Failed RASCI saves:', failed);
      } else {
        toast({
          title: 'Save Failed',
          description: 'Failed to save RASCI assignments. Please try again.',
          variant: 'destructive',
        });
      }
      
      // Reload data to reflect successful saves (even if some failed)
      if (successful.length > 0) {
        await loadRASCIForKPI(selectedKPI);
      }
    } catch (err) {
      console.error('Error saving RASCI:', err);
      toast({
        title: 'Error',
        description: 'Failed to save RASCI assignments',
        variant: 'destructive',
      });
    } finally {
      setSaving(false);
    }
  };

  if (loading && !selectedKPI) {
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

  // Get RASCI badge color
  const getRASCIColor = (role: string, isActive: boolean) => {
    if (!isActive) return 'bg-gray-100 text-gray-400 border-gray-200 dark:bg-gray-800 dark:text-gray-600 dark:border-gray-700';
    
    switch (role) {
      case 'R':
        return 'bg-blue-100 text-blue-700 border-blue-300 dark:bg-blue-900 dark:text-blue-300 dark:border-blue-700';
      case 'A':
        return 'bg-emerald-100 text-emerald-700 border-emerald-300 dark:bg-emerald-900 dark:text-emerald-300 dark:border-emerald-700';
      case 'S':
        return 'bg-purple-100 text-purple-700 border-purple-300 dark:bg-purple-900 dark:text-purple-300 dark:border-purple-700';
      case 'C':
        return 'bg-amber-100 text-amber-700 border-amber-300 dark:bg-amber-900 dark:text-amber-300 dark:border-amber-700';
      case 'I':
        return 'bg-teal-100 text-teal-700 border-teal-300 dark:bg-teal-900 dark:text-teal-300 dark:border-teal-700';
      default:
        return 'bg-gray-100 text-gray-400 border-gray-200';
    }
  };

  return (
    <Card className="border-primary/20 bg-gradient-to-br from-primary/5 to-accent/5 shadow-lg">
      <CardHeader className="bg-gradient-to-r from-primary/10 to-accent/10 border-b border-primary/20">
        <div className="flex items-center justify-between flex-wrap gap-4">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-lg bg-primary/10 border border-primary/20">
              <Users className="h-5 w-5 text-primary" />
            </div>
            <div>
              <CardTitle className="text-xl">RASCI Metrics Editor</CardTitle>
              <p className="text-sm text-muted-foreground mt-1">Assign responsibilities for each KPI</p>
            </div>
          </div>
          <div className="flex items-center gap-4 flex-wrap">
            <div className="flex items-center gap-2">
              <Label htmlFor="kpi-select" className="font-semibold">KPI:</Label>
              <Select value={selectedKPI} onValueChange={setSelectedKPI}>
                <SelectTrigger id="kpi-select" className="w-[300px] border-primary/30 bg-background">
                  <SelectValue placeholder="Select KPI" />
                </SelectTrigger>
                <SelectContent>
                  {kpis.map((kpi) => (
                    <SelectItem key={kpi} value={kpi}>
                      {kpi}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            {!readOnly && (
              <Button 
                onClick={saveRASCI} 
                disabled={saving || !selectedKPI}
                className="bg-gradient-to-r from-primary to-accent hover:from-primary/90 hover:to-accent/90 shadow-lg hover:shadow-xl transition-all duration-200"
              >
                {saving ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Saving...
                  </>
                ) : (
                  <>
                    <Save className="mr-2 h-4 w-4" />
                    Save
                  </>
                )}
              </Button>
            )}
          </div>
        </div>
      </CardHeader>
      <CardContent className="pt-6">
        {selectedKPI ? (
          <>
            {/* RASCI Legend */}
            <div className="mb-6 p-4 bg-muted/50 rounded-lg border border-border">
              <div className="flex items-center gap-2 mb-3">
                <Info className="h-4 w-4 text-primary" />
                <span className="text-sm font-semibold">RASCI Roles:</span>
              </div>
              <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
                <Badge className="bg-blue-100 text-blue-700 border-blue-300 dark:bg-blue-900 dark:text-blue-300 dark:border-blue-700">
                  <CheckCircle2 className="h-3 w-3 mr-1" />
                  R - Responsible
                </Badge>
                <Badge className="bg-emerald-100 text-emerald-700 border-emerald-300 dark:bg-emerald-900 dark:text-emerald-300 dark:border-emerald-700">
                  <CheckCircle2 className="h-3 w-3 mr-1" />
                  A - Accountable
                </Badge>
                <Badge className="bg-purple-100 text-purple-700 border-purple-300 dark:bg-purple-900 dark:text-purple-300 dark:border-purple-700">
                  <CheckCircle2 className="h-3 w-3 mr-1" />
                  S - Supportive
                </Badge>
                <Badge className="bg-amber-100 text-amber-700 border-amber-300 dark:bg-amber-900 dark:text-amber-300 dark:border-amber-700">
                  <CheckCircle2 className="h-3 w-3 mr-1" />
                  C - Consulted
                </Badge>
                <Badge className="bg-teal-100 text-teal-700 border-teal-300 dark:bg-teal-900 dark:text-teal-300 dark:border-teal-700">
                  <CheckCircle2 className="h-3 w-3 mr-1" />
                  I - Informed
                </Badge>
              </div>
            </div>
            
            <div className="overflow-x-auto rounded-lg border border-primary/20">
              <Table>
                <TableHeader>
                  <TableRow className="bg-primary/10 hover:bg-primary/15 border-b-2 border-primary/20">
                    <TableHead className="font-bold text-foreground">Department</TableHead>
                    <TableHead className="text-center font-bold text-foreground">
                      <div className="flex flex-col items-center gap-1">
                        <span>R</span>
                        <span className="text-xs font-normal text-muted-foreground">Responsible</span>
                      </div>
                    </TableHead>
                    <TableHead className="text-center font-bold text-foreground">
                      <div className="flex flex-col items-center gap-1">
                        <span>A</span>
                        <span className="text-xs font-normal text-muted-foreground">Accountable</span>
                      </div>
                    </TableHead>
                    <TableHead className="text-center font-bold text-foreground">
                      <div className="flex flex-col items-center gap-1">
                        <span>S</span>
                        <span className="text-xs font-normal text-muted-foreground">Supportive</span>
                      </div>
                    </TableHead>
                    <TableHead className="text-center font-bold text-foreground">
                      <div className="flex flex-col items-center gap-1">
                        <span>C</span>
                        <span className="text-xs font-normal text-muted-foreground">Consulted</span>
                      </div>
                    </TableHead>
                    <TableHead className="text-center font-bold text-foreground">
                      <div className="flex flex-col items-center gap-1">
                        <span>I</span>
                        <span className="text-xs font-normal text-muted-foreground">Informed</span>
                      </div>
                    </TableHead>
                  </TableRow>
                </TableHeader>
              <TableBody>
                {departments.map((dept) => {
                  // Use department name as key (what database stores)
                  const rasci = rasciData.get(dept.name) || {
                    id: 0,
                    kpi: selectedKPI,
                    department: dept.name, // Use name, not code
                    responsible: false,
                    accountable: false,
                    supportive: false,
                    consulted: false,
                    informed: false,
                  };
                  
                  const hasAnyRole = rasci.responsible || rasci.accountable || rasci.supportive || rasci.consulted || rasci.informed;
                  
                  return (
                    <TableRow 
                      key={dept.id}
                      className={`hover:bg-primary/5 transition-colors duration-200 ${hasAnyRole ? 'bg-primary/2' : ''}`}
                    >
                      <TableCell className="font-semibold">
                        <div className="flex items-center gap-2">
                          <div className={`w-2 h-2 rounded-full ${hasAnyRole ? 'bg-primary' : 'bg-gray-300'}`}></div>
                          <BidirectionalText>{dept.name}</BidirectionalText>
                        </div>
                      </TableCell>
                      <TableCell className="text-center">
                        <div className="flex justify-center">
                          <div className={`p-2 rounded-lg border-2 transition-all duration-200 ${getRASCIColor('R', rasci.responsible)}`}>
                            <Checkbox
                              checked={rasci.responsible}
                              disabled={readOnly}
                              onCheckedChange={(checked) => updateRASCI(dept.name, 'responsible', checked === true)}
                              className="data-[state=checked]:bg-blue-600 data-[state=checked]:border-blue-600"
                            />
                          </div>
                        </div>
                      </TableCell>
                      <TableCell className="text-center">
                        <div className="flex justify-center">
                          <div className={`p-2 rounded-lg border-2 transition-all duration-200 ${getRASCIColor('A', rasci.accountable)}`}>
                            <Checkbox
                              checked={rasci.accountable}
                              disabled={readOnly}
                              onCheckedChange={(checked) => updateRASCI(dept.name, 'accountable', checked === true)}
                              className="data-[state=checked]:bg-emerald-600 data-[state=checked]:border-emerald-600"
                            />
                          </div>
                        </div>
                      </TableCell>
                      <TableCell className="text-center">
                        <div className="flex justify-center">
                          <div className={`p-2 rounded-lg border-2 transition-all duration-200 ${getRASCIColor('S', rasci.supportive)}`}>
                            <Checkbox
                              checked={rasci.supportive}
                              disabled={readOnly}
                              onCheckedChange={(checked) => updateRASCI(dept.name, 'supportive', checked === true)}
                              className="data-[state=checked]:bg-purple-600 data-[state=checked]:border-purple-600"
                            />
                          </div>
                        </div>
                      </TableCell>
                      <TableCell className="text-center">
                        <div className="flex justify-center">
                          <div className={`p-2 rounded-lg border-2 transition-all duration-200 ${getRASCIColor('C', rasci.consulted)}`}>
                            <Checkbox
                              checked={rasci.consulted}
                              disabled={readOnly}
                              onCheckedChange={(checked) => updateRASCI(dept.name, 'consulted', checked === true)}
                              className="data-[state=checked]:bg-amber-600 data-[state=checked]:border-amber-600"
                            />
                          </div>
                        </div>
                      </TableCell>
                      <TableCell className="text-center">
                        <div className="flex justify-center">
                          <div className={`p-2 rounded-lg border-2 transition-all duration-200 ${getRASCIColor('I', rasci.informed)}`}>
                            <Checkbox
                              checked={rasci.informed}
                              disabled={readOnly}
                              onCheckedChange={(checked) => updateRASCI(dept.name, 'informed', checked === true)}
                              className="data-[state=checked]:bg-teal-600 data-[state=checked]:border-teal-600"
                            />
                          </div>
                        </div>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
            </div>
          </>
        ) : (
          <div className="text-center text-muted-foreground py-8">
            Please select a KPI to edit RASCI assignments
          </div>
        )}
      </CardContent>
    </Card>
  );
}

