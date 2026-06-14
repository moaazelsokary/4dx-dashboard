import { useCallback, useRef, useState } from 'react';
import {
  AlertCircle,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  Download,
  FileSpreadsheet,
  Loader2,
  Upload,
  X,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Label } from '@/components/ui/label';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { cn } from '@/lib/utils';
import { toast } from '@/hooks/use-toast';
import { validateMealUpload } from '@/services/mealValidationService';
import type {
  MealValidateMode,
  MealValidationIssue,
  MealValidationResult,
} from '@/types/mealValidation';

type ReportLang = 'ar' | 'en';

const ACCEPT = '.xlsx,.xls,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,application/vnd.ms-excel';

export default function MealDataValidationTab() {
  const inputRef = useRef<HTMLInputElement>(null);
  const [file, setFile] = useState<File | null>(null);
  const [validateMode, setValidateMode] = useState<MealValidateMode>('both');
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<MealValidationResult | null>(null);
  const [lang, setLang] = useState<ReportLang>('ar');
  const [issuesOpen, setIssuesOpen] = useState(false);
  const [dragOver, setDragOver] = useState(false);

  const pickFile = useCallback((f: File | null) => {
    if (!f) {
      setFile(null);
      return;
    }
    const lower = f.name.toLowerCase();
    if (!lower.endsWith('.xlsx') && !lower.endsWith('.xls')) {
      toast({
        title: 'Invalid file',
        description: 'Please upload an Excel file (.xlsx or .xls).',
        variant: 'destructive',
      });
      return;
    }
    setFile(f);
    setResult(null);
  }, []);

  const onDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      setDragOver(false);
      const f = e.dataTransfer.files?.[0];
      if (f) pickFile(f);
    },
    [pickFile]
  );

  const handleValidate = async () => {
    if (!file) {
      toast({ title: 'No file', description: 'Choose an Excel file first.', variant: 'destructive' });
      return;
    }
    setLoading(true);
    setResult(null);
    try {
      const res = await validateMealUpload(file, { validateMode });
      setResult(res);
      setIssuesOpen(res.issues.length > 0 && res.issues.length <= 200);
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Could not validate file.';
      const hint =
        msg.includes('Authentication') || msg.includes('403')
          ? ' Sign in with CEO, Admin, or M&E role.'
          : '';
      toast({
        title: 'Validation failed',
        description: msg + hint,
        variant: 'destructive',
      });
    } finally {
      setLoading(false);
    }
  };

  const handleClear = () => {
    setFile(null);
    setResult(null);
    setIssuesOpen(false);
    if (inputRef.current) inputRef.current.value = '';
  };

  const handleDownload = () => {
    if (!result) return;
    const isAr = lang === 'ar';
    const summary = isAr ? result.summary_ar : result.summary_en;
    const messages = isAr ? result.messages_ar : result.messages_en;
    const blob = new Blob([`${summary}\n\n---\n\n${messages}`], {
      type: 'text/plain;charset=utf-8',
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `meal-validation-${lang}.txt`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const reportText = result
    ? lang === 'ar'
      ? result.messages_ar
      : result.messages_en
    : '';
  const summaryText = result
    ? lang === 'ar'
      ? result.summary_ar
      : result.summary_en
    : '';

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle className="text-base sm:text-lg">Upload spreadsheet</CardTitle>
          <CardDescription>
            Upload a cases/services Excel sheet. You receive a validation report immediately. Files are
            not saved on the server.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div
            role="button"
            tabIndex={0}
            onKeyDown={(e) => {
              if (e.key === 'Enter' || e.key === ' ') inputRef.current?.click();
            }}
            onDragOver={(e) => {
              e.preventDefault();
              setDragOver(true);
            }}
            onDragLeave={() => setDragOver(false)}
            onDrop={onDrop}
            onClick={() => inputRef.current?.click()}
            className={cn(
              'flex flex-col items-center justify-center gap-2 rounded-lg border border-dashed p-8 transition-colors cursor-pointer',
              dragOver ? 'border-primary bg-primary/5' : 'border-border/80 bg-muted/30 hover:bg-muted/50'
            )}
          >
            <Upload className="h-8 w-8 text-muted-foreground" />
            <p className="text-sm text-muted-foreground text-center">
              Drag and drop .xlsx / .xls here, or click to browse
            </p>
            <input
              ref={inputRef}
              type="file"
              accept={ACCEPT}
              className="hidden"
              onChange={(e) => pickFile(e.target.files?.[0] ?? null)}
            />
          </div>

          {file ? (
            <div className="flex items-center gap-2 rounded-md border bg-muted/40 px-3 py-2 text-sm">
              <FileSpreadsheet className="h-4 w-4 shrink-0 text-primary" />
              <span className="truncate flex-1">{file.name}</span>
              <span className="text-muted-foreground shrink-0">
                {(file.size / 1024).toFixed(0)} KB
              </span>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="h-7 w-7 shrink-0"
                onClick={(e) => {
                  e.stopPropagation();
                  pickFile(null);
                  if (inputRef.current) inputRef.current.value = '';
                }}
                aria-label="Remove file"
              >
                <X className="h-4 w-4" />
              </Button>
            </div>
          ) : null}

          <div className="space-y-2">
            <Label>What to validate</Label>
            <RadioGroup
              value={validateMode}
              onValueChange={(v) => setValidateMode(v as MealValidateMode)}
              className="flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:gap-4"
            >
              <div className="flex items-center gap-2">
                <RadioGroupItem value="both" id="meal-mode-both" />
                <Label htmlFor="meal-mode-both" className="font-normal cursor-pointer">
                  Cases and services
                </Label>
              </div>
              <div className="flex items-center gap-2">
                <RadioGroupItem value="cases" id="meal-mode-cases" />
                <Label htmlFor="meal-mode-cases" className="font-normal cursor-pointer">
                  Cases only
                </Label>
              </div>
              <div className="flex items-center gap-2">
                <RadioGroupItem value="services" id="meal-mode-services" />
                <Label htmlFor="meal-mode-services" className="font-normal cursor-pointer">
                  Services only
                </Label>
              </div>
            </RadioGroup>
            <p className="text-xs text-muted-foreground">
              Services only skips case fields (nationality, phones, address, etc.). Cases only skips
              service columns.
            </p>
          </div>

          <div className="flex flex-wrap gap-2">
            <Button type="button" onClick={() => void handleValidate()} disabled={!file || loading}>
              {loading ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Validating…
                </>
              ) : (
                'Validate'
              )}
            </Button>
            <Button type="button" variant="outline" onClick={handleClear} disabled={loading}>
              Clear
            </Button>
          </div>
        </CardContent>
      </Card>

      {result ? (
        <>
          <Alert variant={result.ok ? 'default' : 'destructive'}>
            {result.ok ? (
              <CheckCircle2 className="h-4 w-4" />
            ) : (
              <AlertCircle className="h-4 w-4" />
            )}
            <AlertTitle>{result.ok ? 'Validation passed' : 'Validation issues found'}</AlertTitle>
            <AlertDescription>
              {summaryText}
              {result.engine_version ? (
                <span className="block mt-1 text-xs opacity-70">
                  Validator: {result.engine_version}
                </span>
              ) : (
                <span className="block mt-1 text-xs text-amber-600 dark:text-amber-400">
                  Validator version missing — restart `npm run proxies` and try again.
                </span>
              )}
              {!result.ok && (
                <span className="block mt-1 text-xs opacity-90">
                  {result.errors_count} error(s), {result.warnings_count} warning(s)
                </span>
              )}
            </AlertDescription>
          </Alert>

          <Card>
            <CardHeader className="flex flex-row flex-wrap items-center justify-between gap-2 space-y-0 pb-2">
              <CardTitle className="text-base">Report</CardTitle>
              <div className="flex flex-wrap gap-2">
                <Button
                  type="button"
                  size="sm"
                  variant={lang === 'ar' ? 'default' : 'outline'}
                  onClick={() => setLang('ar')}
                >
                  العربية
                </Button>
                <Button
                  type="button"
                  size="sm"
                  variant={lang === 'en' ? 'default' : 'outline'}
                  onClick={() => setLang('en')}
                >
                  English
                </Button>
                <Button type="button" size="sm" variant="outline" onClick={handleDownload}>
                  <Download className="h-4 w-4" />
                  Download .txt
                </Button>
              </div>
            </CardHeader>
            <CardContent>
              <pre
                dir={lang === 'ar' ? 'rtl' : 'ltr'}
                className={cn(
                  'max-h-[min(60vh,32rem)] overflow-auto rounded-md border bg-muted/30 p-4 text-xs whitespace-pre-wrap font-mono leading-relaxed',
                  lang === 'ar' && 'text-right'
                )}
              >
                {reportText || (lang === 'ar' ? 'لا توجد ملاحظات.' : 'No issues.')}
              </pre>
            </CardContent>
          </Card>

          {result.issues.length > 0 ? (
            <Card>
              <CardHeader className="pb-2">
                <Button
                  type="button"
                  variant="ghost"
                  className="w-full justify-between px-0 h-auto hover:bg-transparent"
                  onClick={() => setIssuesOpen((o) => !o)}
                >
                  <CardTitle className="text-base">Issues ({result.issues.length})</CardTitle>
                  {issuesOpen ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
                </Button>
              </CardHeader>
              {issuesOpen ? (
                <CardContent className="pt-0">
                  <IssuesTable issues={result.issues} lang={lang} />
                </CardContent>
              ) : null}
            </Card>
          ) : null}
        </>
      ) : null}
    </div>
  );
}

function IssuesTable({ issues, lang }: { issues: MealValidationIssue[]; lang: ReportLang }) {
  const shown = issues.slice(0, 500);
  return (
    <div className="overflow-auto max-h-80 rounded-md border">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead className="w-20">Severity</TableHead>
            <TableHead className="w-36">Code</TableHead>
            <TableHead className="w-24">Excel row</TableHead>
            <TableHead>Message</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {shown.map((issue, idx) => (
            <TableRow key={`${issue.code}-${issue.excel_row ?? idx}-${idx}`}>
              <TableCell className="capitalize text-xs">{issue.severity}</TableCell>
              <TableCell className="font-mono text-xs">{issue.code}</TableCell>
              <TableCell className="text-xs">{issue.excel_row ?? '—'}</TableCell>
              <TableCell className="text-xs" dir={lang === 'ar' ? 'rtl' : 'ltr'}>
                {lang === 'ar' ? issue.message_ar : issue.message_en}
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
      {issues.length > 500 ? (
        <p className="p-2 text-xs text-muted-foreground border-t">
          Showing first 500 of {issues.length} issues.
        </p>
      ) : null}
    </div>
  );
}
