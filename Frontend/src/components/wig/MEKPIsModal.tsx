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

  // Debug: Log the first M&E KPI to see what fields are available
  if (meKPIs.length > 0) {
    console.log('First M&E KPI object:', meKPIs[0]);
    console.log('Available keys:', Object.keys(meKPIs[0]));
  }

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-w-6xl max-h-[80vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>
            M&E KPIs for: {objectiveKPI}
            {objectiveActivity && (
              <span className="text-sm font-normal text-muted-foreground ml-2">
                ({objectiveActivity})
              </span>
            )}
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
                  // Handle potential case sensitivity issues - try both lowercase and original case
                  const getValue = (key: string) => {
                    // Try lowercase first (most common)
                    if (meObj[key as keyof typeof meObj] !== undefined) {
                      return meObj[key as keyof typeof meObj];
                    }
                    // Try with different casing
                    const keys = Object.keys(meObj);
                    const foundKey = keys.find(k => k.toLowerCase() === key.toLowerCase());
                    if (foundKey) {
                      return (meObj as any)[foundKey];
                    }
                    return undefined;
                  };

                  return (
                  <TableRow key={meObj.id}>
                    <TableCell className="font-medium">{meObj.kpi}</TableCell>
                    <TableCell className="text-right">
                      {(() => {
                        const value = getValue('me_target');
                        return value !== null && value !== undefined
                          ? Number(value).toLocaleString()
                          : '—';
                      })()}
                    </TableCell>
                    <TableCell className="text-right">
                      {(() => {
                        const value = getValue('me_actual');
                        return value !== null && value !== undefined
                          ? Number(value).toLocaleString()
                          : '—';
                      })()}
                    </TableCell>
                    <TableCell>
                      {getValue('me_frequency') || '—'}
                    </TableCell>
                    <TableCell>
                      {formatDate(getValue('me_start_date') as string)}
                    </TableCell>
                    <TableCell>
                      {formatDate(getValue('me_end_date') as string)}
                    </TableCell>
                    <TableCell>
                      {getValue('me_tool') || '—'}
                    </TableCell>
                    <TableCell>
                      {getValue('me_responsible') || '—'}
                    </TableCell>
                    <TableCell>
                      {meObj.mov || '—'}
                    </TableCell>
                    <TableCell>
                      {(() => {
                        const folderLink = getValue('me_folder_link');
                        return folderLink ? (
                          <a
                            href={folderLink as string}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-primary hover:underline flex items-center gap-1"
                          >
                            <Folder className="h-4 w-4" />
                            folder
                          </a>
                        ) : (
                          '—'
                        );
                      })()}
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

