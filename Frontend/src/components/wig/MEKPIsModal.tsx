import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Trash2, Folder, Edit2 } from "lucide-react";

export interface MEKPIDisplayRow {
  id: number;
  kpi: string;
  mov?: string | null;
  me_target?: number | null;
  me_actual?: number | null;
  me_frequency?: string | null;
  me_start_date?: string | null;
  me_end_date?: string | null;
  me_tool?: string | null;
  me_responsible?: string | null;
  me_folder_link?: string | null;
}

interface MEKPIsModalProps {
  isOpen: boolean;
  onClose: () => void;
  objectiveKPI: string;
  objectiveActivity?: string;
  meKPIs: MEKPIDisplayRow[];
  onDelete: (id: number) => void;
  onEdit?: (meKPI: MEKPIDisplayRow) => void;
  canModify?: boolean;
}

const MEKPIsModal = ({
  isOpen,
  onClose,
  objectiveKPI,
  objectiveActivity,
  meKPIs,
  onDelete,
  onEdit,
  canModify = false,
}: MEKPIsModalProps) => {
  const formatDate = (dateString: string | null | undefined): string => {
    if (!dateString) return '—';
    try {
      return new Date(dateString).toLocaleDateString();
    } catch {
      return dateString;
    }
  };

  const extractParenthesesText = (kpi: string): string => {
    if (!kpi) return kpi;
    const match = kpi.match(/\(([^)]+)\)/);
    return match ? match[1] : kpi;
  };

  const displayKPI = extractParenthesesText(objectiveKPI);

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="w-[min(98vw,144rem)] max-w-[min(98vw,144rem)] sm:max-w-[min(98vw,144rem)] max-h-[85vh] overflow-hidden flex flex-col">
        <DialogHeader>
          <DialogTitle>M&E KPIs for: {displayKPI}</DialogTitle>
          {objectiveActivity && (
            <p className="text-sm text-muted-foreground truncate" title={objectiveActivity}>
              {objectiveActivity}
            </p>
          )}
        </DialogHeader>
        <div className="mt-4 min-h-0 flex-1 overflow-auto">
          {meKPIs.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              No M&E KPIs found for this objective.
            </div>
          ) : (
            <Table className="min-w-full">
              <TableHeader>
                <TableRow>
                  <TableHead className="min-w-[14rem]">KPI</TableHead>
                  <TableHead className="min-w-[5rem]">Target</TableHead>
                  <TableHead className="min-w-[5rem]">Actual</TableHead>
                  <TableHead className="min-w-[6rem]">Frequency</TableHead>
                  <TableHead className="min-w-[6rem]">Start Date</TableHead>
                  <TableHead className="min-w-[6rem]">End Date</TableHead>
                  <TableHead className="min-w-[6rem]">Tool</TableHead>
                  <TableHead className="min-w-[7rem]">Responsible</TableHead>
                  <TableHead className="min-w-[8rem]">MOV</TableHead>
                  <TableHead className="min-w-[6rem]">Folder Link</TableHead>
                  <TableHead className="text-right min-w-[7rem]">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {meKPIs.map((meObj) => (
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
                    <TableCell>{meObj.me_frequency || '—'}</TableCell>
                    <TableCell>{formatDate(meObj.me_start_date)}</TableCell>
                    <TableCell>{formatDate(meObj.me_end_date)}</TableCell>
                    <TableCell>{meObj.me_tool || '—'}</TableCell>
                    <TableCell>{meObj.me_responsible || '—'}</TableCell>
                    <TableCell>{meObj.mov || '—'}</TableCell>
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
                      {canModify && (
                        <div className="flex justify-end gap-2">
                          {onEdit && (
                            <Button
                              type="button"
                              size="sm"
                              variant="outline"
                              onClick={() => onEdit(meObj)}
                              aria-label={`Edit M&E KPI ${meObj.id}`}
                              title="Edit M&E KPI"
                            >
                              <Edit2 className="h-4 w-4" />
                            </Button>
                          )}
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
                        </div>
                      )}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
};

export default MEKPIsModal;
