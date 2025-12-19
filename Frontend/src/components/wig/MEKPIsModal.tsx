import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Trash2, Folder } from "lucide-react";
import type { DepartmentObjective } from "@/types/wig";

interface MEKPIsModalProps {
  isOpen: boolean;
  onClose: () => void;
  objectiveKPI: string;
  objectiveActivity?: string;
  meKPIs: DepartmentObjective[];
  onDelete: (id: number) => void;
}

const MEKPIsModal = ({ isOpen, onClose, objectiveKPI, objectiveActivity, meKPIs, onDelete }: MEKPIsModalProps) => {
  const formatDate = (dateString: string | null | undefined): string => {
    if (!dateString) return '—';
    try {
      return new Date(dateString).toLocaleDateString();
    } catch {
      return dateString;
    }
  };

  // Extract text in parentheses from KPI
  const extractParenthesesText = (kpi: string): string => {
    if (!kpi) return kpi;
    const match = kpi.match(/\(([^)]+)\)/);
    return match ? match[1] : kpi;
  };

  const displayKPI = extractParenthesesText(objectiveKPI);

  // Debug: Log the first M&E KPI to see what fields are available
  if (meKPIs.length > 0) {
    console.log('=== M&E KPIs Modal Debug ===');
    console.log('Number of M&E KPIs:', meKPIs.length);
    console.log('First M&E KPI object:', meKPIs[0]);
    console.log('Available keys:', Object.keys(meKPIs[0]));
    console.log('me_target:', meKPIs[0].me_target, typeof meKPIs[0].me_target);
    console.log('me_actual:', meKPIs[0].me_actual, typeof meKPIs[0].me_actual);
    console.log('me_frequency:', meKPIs[0].me_frequency, typeof meKPIs[0].me_frequency);
    console.log('me_start_date:', meKPIs[0].me_start_date, typeof meKPIs[0].me_start_date);
    console.log('me_end_date:', meKPIs[0].me_end_date, typeof meKPIs[0].me_end_date);
    console.log('me_tool:', meKPIs[0].me_tool, typeof meKPIs[0].me_tool);
    console.log('me_responsible:', meKPIs[0].me_responsible, typeof meKPIs[0].me_responsible);
    console.log('me_folder_link:', meKPIs[0].me_folder_link, typeof meKPIs[0].me_folder_link);
    console.log('mov:', meKPIs[0].mov, typeof meKPIs[0].mov);
    console.log('===========================');
  }

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-w-6xl max-h-[80vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>
            M&E KPIs for: {displayKPI}
          </DialogTitle>
        </DialogHeader>
        <div className="mt-4">
          {meKPIs.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              No M&E KPIs found for this objective.
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>KPI</TableHead>
                  <TableHead>Target</TableHead>
                  <TableHead>Actual</TableHead>
                  <TableHead>Frequency</TableHead>
                  <TableHead>Start Date</TableHead>
                  <TableHead>End Date</TableHead>
                  <TableHead>Tool</TableHead>
                  <TableHead>Responsible</TableHead>
                  <TableHead>MOV</TableHead>
                  <TableHead>Folder Link</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {meKPIs.map((meObj) => {
                  return (
                  <TableRow key={meObj.id}>
                    <TableCell className="font-medium">{meObj.kpi}</TableCell>
                    <TableCell className="text-right">
                      {meObj.me_target !== null && meObj.me_target !== undefined
                        ? Number(meObj.me_target).toLocaleString()
                        : '—'}
                    </TableCell>
                    <TableCell className="text-right">
                      {meObj.me_actual !== null && meObj.me_actual !== undefined
                        ? Number(meObj.me_actual).toLocaleString()
                        : '—'}
                    </TableCell>
                    <TableCell>
                      {meObj.me_frequency || '—'}
                    </TableCell>
                    <TableCell>
                      {formatDate(meObj.me_start_date)}
                    </TableCell>
                    <TableCell>
                      {formatDate(meObj.me_end_date)}
                    </TableCell>
                    <TableCell>
                      {meObj.me_tool || '—'}
                    </TableCell>
                    <TableCell>
                      {meObj.me_responsible || '—'}
                    </TableCell>
                    <TableCell>
                      {meObj.mov || '—'}
                    </TableCell>
                    <TableCell>
                      {meObj.me_folder_link ? (
                        <a
                          href={meObj.me_folder_link}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-primary hover:underline flex items-center gap-1"
                        >
                          <Folder className="h-4 w-4" />
                          folder
                        </a>
                      ) : (
                        '—'
                      )}
                    </TableCell>
                    <TableCell className="text-right">
                      <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        onClick={() => meObj.id && onDelete(meObj.id)}
                        aria-label={`Delete M&E KPI ${meObj.id}`}
                        title="Delete M&E KPI"
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </TableCell>
                  </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
};

export default MEKPIsModal;

