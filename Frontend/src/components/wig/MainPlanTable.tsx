import { useState } from 'react';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { createMainObjective, updateMainObjective, deleteMainObjective } from '@/services/wigService';
import { toast } from '@/hooks/use-toast';
import type { MainPlanObjective } from '@/types/wig';
import { Edit2, Save, X, Trash2, Plus, Table2, Sparkles } from 'lucide-react';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';

interface MainPlanTableProps {
  objectives: MainPlanObjective[];
  onUpdate: () => void;
}

// Helper function to extract or generate numbers from hierarchy
function extractNumber(text: string, pattern: RegExp): string {
  const match = text.match(pattern);
  return match ? match[0] : '';
}

// Target to Objective number mapping (target number -> objective number)
// Based on the structure: targets 1.1, 1.2, 1.3 share objective, target 1.4 is different objective, etc.
const TARGET_TO_OBJECTIVE_MAP: Record<string, string> = {
  // Pillar 1 objectives
  '1.1': '1.1', // تنمية قاعدة المتطوعين وتوسيع قاعدة الانتشار
  '1.2': '1.2', // تنمية قاعدة المتطوعين وتوسيع قاعدة الانتشار (different target, same objective text)
  '1.3': '1.3', // تنمية قاعدة المتطوعين وتوسيع قاعدة الانتشار (different target, same objective text)
  '1.4': '1.4', // تعظيم الأثر المجتمعي لأنشطة المتطوعين
  '1.5': '1.5', // تعزيز تجربة المتطوعين ورفاهيتهم
  // Pillar 2
  '2.1': '2.1', // رفع حجم ومعدل مساهمة المؤسسة في المشروعات التنموية
  // Pillar 3
  '3.1': '3.1', // بناء صورة ذهنية قوية للمؤسسة
  // Pillar 4
  '4.1': '4.1', // بناء وإدارة شبكة علاقات استراتيجية فعّالة
  // Pillar 5
  '5.1': '5.1', // ترسيخ مكانة صناع الحياة...
  '5.2': '5.2', // تعزيز ريادة صُنّاع الحياة...
  '5.3': '5.3', // تعزيز وعي المجتمع المصري...
  '5.4': '5.4', // دوق ادنبرة...
  // Pillar 6
  '6.1': '6.1', // زيادة حجم التمويل المستدام
  // Pillar 7
  '7.1': '7.1', // تحسين الكفاءة الإدارية...
  // Pillar 8
  '8.1': '8.1', // قيادة التحول الرقمي...
  // Pillar 9
  '9.1': '9.1', // تطوير وتطبيق أنظمة...
};

// Generate hierarchical numbers based on position
function generateNumbers(objectives: MainPlanObjective[]): Map<number, { objNum: string; targetNum: string; kpiNum: string }> {
  const numbers = new Map<number, { objNum: string; targetNum: string; kpiNum: string }>();
  
  objectives.forEach((obj) => {
    // Extract target number from target field (e.g., "1.1" from "1.1 تنمية...")
    const targetNum = extractNumber(obj.target, /^\d+(\.\d+)?/) || '';
    
    // Objective number = target number (they match in this structure: 1.1, 1.2, 1.3, etc.)
    let objNum = targetNum;
    
    // If no target number, try to get from mapping or extract from objective text
    if (!objNum) {
      objNum = extractNumber(obj.objective, /^\d+(\.\d+)?/) || '';
    }
    
    // Extract KPI number from KPI field (e.g., "1.1.1" from "1.1.1 عدد...")
    const kpiNum = extractNumber(obj.kpi, /^\d+(\.\d+)*(\.\d+)?/) || '';
    
    numbers.set(obj.id, {
      objNum: objNum,
      targetNum: targetNum,
      kpiNum: kpiNum,
    });
  });

  return numbers;
}

export default function MainPlanTable({ objectives, onUpdate }: MainPlanTableProps) {
  const [editingId, setEditingId] = useState<number | null>(null);
  const [deletingId, setDeletingId] = useState<number | null>(null);
  const [isAdding, setIsAdding] = useState(false);
  const [editData, setEditData] = useState<Partial<MainPlanObjective>>({});
  const [newData, setNewData] = useState<Partial<MainPlanObjective>>({
    pillar: '',
    objective: '',
    target: '',
    kpi: '',
    annual_target: 0,
  });

  const numbers = generateNumbers(objectives);

  const startEdit = (obj: MainPlanObjective) => {
    setEditingId(obj.id);
    setEditData({ ...obj });
  };

  const cancelEdit = () => {
    setEditingId(null);
    setEditData({});
  };

  const saveEdit = async (e?: React.MouseEvent) => {
    if (e) {
      e.preventDefault();
      e.stopPropagation();
    }
    if (!editingId) return;

    try {
      const updated = await updateMainObjective(editingId, editData);
      toast({
        title: 'Success',
        description: 'Objective updated successfully',
      });
      setEditingId(null);
      setEditData({});
      // Refresh data without showing loading spinner
      onUpdate();
    } catch (err) {
      toast({
        title: 'Error',
        description: 'Failed to update objective',
        variant: 'destructive',
      });
    }
  };

  const handleDelete = async () => {
    if (!deletingId) return;

    try {
      await deleteMainObjective(deletingId);
      toast({
        title: 'Success',
        description: 'Objective deleted successfully',
      });
      setDeletingId(null);
      onUpdate();
    } catch (err) {
      toast({
        title: 'Error',
        description: 'Failed to delete objective',
        variant: 'destructive',
      });
    }
  };

  const handleAdd = async () => {
    if (!newData.pillar || !newData.objective || !newData.target || !newData.kpi || !newData.annual_target) {
      toast({
        title: 'Error',
        description: 'Please fill all fields',
        variant: 'destructive',
      });
      return;
    }

    try {
      await createMainObjective({
        pillar: newData.pillar!,
        objective: newData.objective!,
        target: newData.target!,
        kpi: newData.kpi!,
        annual_target: parseFloat(newData.annual_target!.toString()),
      });
      toast({
        title: 'Success',
        description: 'Objective created successfully',
      });
      setIsAdding(false);
      setNewData({
        pillar: '',
        objective: '',
        target: '',
        kpi: '',
        annual_target: 0,
      });
      onUpdate();
    } catch (err) {
      toast({
        title: 'Error',
        description: 'Failed to create objective',
        variant: 'destructive',
      });
    }
  };

  // Get pillar color based on pillar name
  const getPillarColor = (pillar: string) => {
    if (pillar === 'Strategic Themes') {
      return 'border-l-blue-500 bg-blue-50/30 dark:bg-blue-950/10';
    } else if (pillar === 'Contributors') {
      return 'border-l-emerald-500 bg-emerald-50/30 dark:bg-emerald-950/10';
    } else {
      return 'border-l-purple-500 bg-purple-50/30 dark:bg-purple-950/10';
    }
  };

  return (
    <>
      <div className="mb-6">
        <Button 
          type="button"
          onClick={() => setIsAdding(true)}
          className="bg-gradient-to-r from-primary to-accent hover:from-primary/90 hover:to-accent/90 shadow-lg hover:shadow-xl transition-all duration-200"
        >
          <Plus className="mr-2 h-4 w-4" />
          Add Objective
        </Button>
      </div>

      <Card className="border-primary/20 bg-gradient-to-br from-primary/5 to-accent/5 shadow-lg overflow-hidden">
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow className="bg-primary/10 hover:bg-primary/15 border-b-2 border-primary/20">
                <TableHead className="font-bold text-foreground">Pillar</TableHead>
                <TableHead className="font-bold text-foreground">Objective</TableHead>
                <TableHead className="font-bold text-foreground">Target #</TableHead>
                <TableHead className="font-bold text-foreground">Target</TableHead>
                <TableHead className="font-bold text-foreground">KPI #</TableHead>
                <TableHead className="font-bold text-foreground">KPI</TableHead>
                <TableHead className="text-right font-bold text-foreground">Annual Target</TableHead>
                <TableHead className="text-right font-bold text-foreground">Actions</TableHead>
              </TableRow>
            </TableHeader>
          <TableBody>
            {isAdding && (
              <TableRow>
                <TableCell>
                  <Input
                    value={newData.pillar || ''}
                    onChange={(e) => setNewData({ ...newData, pillar: e.target.value })}
                    placeholder="Pillar"
                    aria-label="Pillar"
                  />
                </TableCell>
                <TableCell>
                  <Input
                    value={newData.objective || ''}
                    onChange={(e) => setNewData({ ...newData, objective: e.target.value })}
                    placeholder="Objective"
                    aria-label="Objective"
                  />
                </TableCell>
                <TableCell>
                  <Input
                    value={extractNumber(newData.target || '', /^\d+(\.\d+)?/) || ''}
                    onChange={(e) => {
                      const num = e.target.value;
                      const currentTarget = newData.target || '';
                      const targetText = currentTarget.replace(/^\d+(\.\d+)?\s*/, '');
                      setNewData({ ...newData, target: num ? `${num} ${targetText}` : targetText });
                    }}
                    placeholder="1.1"
                    className="w-16"
                    aria-label="Target number"
                  />
                </TableCell>
                <TableCell>
                  <Input
                    value={newData.target?.replace(/^\d+(\.\d+)?\s*/, '') || ''}
                    onChange={(e) => {
                      const num = extractNumber(newData.target || '', /^\d+(\.\d+)?/);
                      setNewData({ ...newData, target: num ? `${num} ${e.target.value}` : e.target.value });
                    }}
                    placeholder="Target"
                    aria-label="Target description"
                  />
                </TableCell>
                <TableCell>
                  <Input
                    value={extractNumber(newData.kpi || '', /^\d+(\.\d+)*(\.\d+)?/) || ''}
                    onChange={(e) => {
                      const num = e.target.value;
                      const currentKpi = newData.kpi || '';
                      const kpiText = currentKpi.replace(/^\d+(\.\d+)*(\.\d+)?\s*/, '');
                      setNewData({ ...newData, kpi: num ? `${num} ${kpiText}` : kpiText });
                    }}
                    placeholder="1.1.1"
                    className="w-20"
                    aria-label="KPI number"
                  />
                </TableCell>
                <TableCell>
                  <Input
                    value={newData.kpi?.replace(/^\d+(\.\d+)*(\.\d+)?\s*/, '') || ''}
                    onChange={(e) => {
                      const num = extractNumber(newData.kpi || '', /^\d+(\.\d+)*(\.\d+)?/);
                      setNewData({ ...newData, kpi: num ? `${num} ${e.target.value}` : e.target.value });
                    }}
                    placeholder="KPI"
                    aria-label="KPI description"
                  />
                </TableCell>
                <TableCell>
                  <Input
                    type="number"
                    value={newData.annual_target || ''}
                    onChange={(e) => setNewData({ ...newData, annual_target: parseFloat(e.target.value) || 0 })}
                    placeholder="Annual Target"
                    className="text-right"
                    aria-label="Annual target"
                  />
                </TableCell>
                <TableCell className="text-right">
                  <div className="flex justify-end gap-2">
                    <Button type="button" size="sm" onClick={handleAdd} aria-label="Save new objective">
                      <Save className="h-4 w-4" />
                    </Button>
                    <Button type="button" size="sm" variant="outline" onClick={() => setIsAdding(false)} aria-label="Cancel adding objective">
                      <X className="h-4 w-4" />
                    </Button>
                  </div>
                </TableCell>
              </TableRow>
            )}

            {objectives
              .map((obj) => {
                // Extract numbers directly from fields (target and KPI have number prefixes)
                const targetNum = extractNumber(obj.target, /^\d+(\.\d+)?/) || '';
                const kpiNum = extractNumber(obj.kpi, /^\d+(\.\d+)*(\.\d+)?/) || '';
                
                // Clean text (remove numbers from start)
                // Objective doesn't have a number prefix in the database
                const objText = obj.objective.trim();
                const targetText = obj.target.replace(/^\d+(\.\d+)?\s*/, '').trim();
                const kpiText = obj.kpi.replace(/^\d+(\.\d+)*(\.\d+)?\s*/, '').trim();
                
                return { obj, targetNum, kpiNum, objText, targetText, kpiText };
              })
              .sort((a, b) => {
                // Sort by target number (e.g., "1.1" < "1.2" < "2.1")
                if (!a.targetNum && !b.targetNum) return 0;
                if (!a.targetNum) return 1;
                if (!b.targetNum) return -1;
                
                const aParts = a.targetNum.split('.').map(Number);
                const bParts = b.targetNum.split('.').map(Number);
                
                for (let i = 0; i < Math.max(aParts.length, bParts.length); i++) {
                  const aVal = aParts[i] || 0;
                  const bVal = bParts[i] || 0;
                  if (aVal !== bVal) return aVal - bVal;
                }
                
                // If target numbers are equal, sort by KPI number
                if (!a.kpiNum && !b.kpiNum) return 0;
                if (!a.kpiNum) return 1;
                if (!b.kpiNum) return -1;
                
                const aKpiParts = a.kpiNum.split('.').map(Number);
                const bKpiParts = b.kpiNum.split('.').map(Number);
                
                for (let i = 0; i < Math.max(aKpiParts.length, bKpiParts.length); i++) {
                  const aVal = aKpiParts[i] || 0;
                  const bVal = bKpiParts[i] || 0;
                  if (aVal !== bVal) return aVal - bVal;
                }
                
                return 0;
              })
              .map(({ obj, targetNum, kpiNum, objText, targetText, kpiText }) => {
                const pillarColor = getPillarColor(obj.pillar);
                return (
                  <TableRow 
                    key={obj.id} 
                    className={`border-l-4 ${pillarColor} hover:bg-primary/5 transition-colors duration-200`}
                  >
                    {editingId === obj.id ? (
                    <>
                      <TableCell>
                        <Input
                          value={editData.pillar || ''}
                          onChange={(e) => setEditData({ ...editData, pillar: e.target.value })}
                          placeholder="Pillar"
                          aria-label="Edit pillar"
                        />
                      </TableCell>
                      <TableCell>
                        <Input
                          value={editData.objective || ''}
                          onChange={(e) => setEditData({ ...editData, objective: e.target.value })}
                          placeholder="Objective"
                          aria-label="Edit objective"
                        />
                      </TableCell>
                      <TableCell>
                        <Input
                          value={extractNumber(editData.target || '', /^\d+(\.\d+)?/) || ''}
                          onChange={(e) => {
                            const num = e.target.value;
                            const currentTarget = editData.target || '';
                            const targetText = currentTarget.replace(/^\d+(\.\d+)?\s*/, '');
                            setEditData({ ...editData, target: num ? `${num} ${targetText}` : targetText });
                          }}
                          className="w-16"
                          placeholder="1.1"
                          aria-label="Edit target number"
                        />
                      </TableCell>
                      <TableCell>
                        <Input
                          value={editData.target?.replace(/^\d+(\.\d+)?\s*/, '') || ''}
                          onChange={(e) => {
                            const num = extractNumber(editData.target || '', /^\d+(\.\d+)?/);
                            setEditData({ ...editData, target: num ? `${num} ${e.target.value}` : e.target.value });
                          }}
                          placeholder="Target"
                          aria-label="Edit target description"
                        />
                      </TableCell>
                      <TableCell>
                        <Input
                          value={extractNumber(editData.kpi || '', /^\d+(\.\d+)*(\.\d+)?/) || ''}
                          onChange={(e) => {
                            const num = e.target.value;
                            const currentKpi = editData.kpi || '';
                            const kpiText = currentKpi.replace(/^\d+(\.\d+)*(\.\d+)?\s*/, '');
                            setEditData({ ...editData, kpi: num ? `${num} ${kpiText}` : kpiText });
                          }}
                          className="w-20"
                          placeholder="1.1.1"
                          aria-label="Edit KPI number"
                        />
                      </TableCell>
                      <TableCell>
                        <Input
                          value={editData.kpi?.replace(/^\d+(\.\d+)*(\.\d+)?\s*/, '') || ''}
                          onChange={(e) => {
                            const num = extractNumber(editData.kpi || '', /^\d+(\.\d+)*(\.\d+)?/);
                            setEditData({ ...editData, kpi: num ? `${num} ${e.target.value}` : e.target.value });
                          }}
                          placeholder="KPI"
                          aria-label="Edit KPI description"
                        />
                      </TableCell>
                      <TableCell>
                        <Input
                          type="number"
                          value={editData.annual_target || ''}
                          onChange={(e) => setEditData({ ...editData, annual_target: parseFloat(e.target.value) || 0 })}
                          className="text-right"
                          placeholder="Annual Target"
                          aria-label="Edit annual target"
                        />
                      </TableCell>
                      <TableCell className="text-right">
                        <div className="flex justify-end gap-2">
                          <Button type="button" size="sm" onClick={saveEdit} aria-label="Save changes">
                            <Save className="h-4 w-4" />
                          </Button>
                          <Button type="button" size="sm" variant="outline" onClick={cancelEdit} aria-label="Cancel editing">
                            <X className="h-4 w-4" />
                          </Button>
                        </div>
                      </TableCell>
                    </>
                  ) : (
                    <>
                      <TableCell className="font-semibold">
                        <Badge variant="outline" className="border-primary/30 bg-primary/5">
                          {obj.pillar}
                        </Badge>
                      </TableCell>
                      <TableCell className="font-medium">{objText || obj.objective}</TableCell>
                      <TableCell>
                        <Badge variant="secondary" className="font-mono text-xs font-bold">
                          {targetNum}
                        </Badge>
                      </TableCell>
                      <TableCell>{targetText || obj.target}</TableCell>
                      <TableCell>
                        <Badge variant="outline" className="font-mono text-xs font-semibold border-accent/50">
                          {kpiNum}
                        </Badge>
                      </TableCell>
                      <TableCell>{kpiText || obj.kpi}</TableCell>
                      <TableCell className="text-right">
                        <Badge className="bg-gradient-to-r from-primary to-accent text-white font-semibold">
                          {obj.annual_target.toLocaleString()}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-right">
                        <div className="flex justify-end gap-2">
                          <Button 
                            type="button"
                            size="sm" 
                            variant="outline" 
                            onClick={() => startEdit(obj)}
                            className="hover:bg-primary/10 hover:border-primary/50 transition-all"
                            aria-label={`Edit objective ${kpiNum || obj.id}`}
                            title="Edit objective"
                          >
                            <Edit2 className="h-4 w-4" />
                          </Button>
                          <Button 
                            type="button"
                            size="sm" 
                            variant="outline" 
                            onClick={() => setDeletingId(obj.id)}
                            className="hover:bg-destructive/10 hover:border-destructive/50 hover:text-destructive transition-all"
                            aria-label={`Delete objective ${kpiNum || obj.id}`}
                            title="Delete objective"
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </div>
                      </TableCell>
                    </>
                  )}
                  </TableRow>
                );
              })}
          </TableBody>
        </Table>
        </div>
      </Card>

      <AlertDialog open={deletingId !== null} onOpenChange={() => setDeletingId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Objective</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete this objective? This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleDelete} className="bg-destructive text-destructive-foreground">
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}

