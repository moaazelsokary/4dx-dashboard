import { useEffect, useMemo, useState } from 'react';
import { useInfiniteQuery, useQuery } from '@tanstack/react-query';
import { format, parseISO } from 'date-fns';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Skeleton } from '@/components/ui/skeleton';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import {
  fetchBeneficiariesSearch,
  fetchCaseProfile,
  fetchCaseServicesPage,
  normStr,
} from '@/services/beneficiariesService';
import type { RbProfileHouseholdRow, RbSearchHit, RbServiceRow } from '@/types/beneficiaries';
import { beneficiarySearchHint, canRunBeneficiarySearch } from '@/lib/rbCaseSearch';
import {
  formatCaseStatusLabel,
  formatFollowUpStatusLabel,
  searchResultContextLines,
} from '@/lib/rbCaseLabels';
import { SerpentineServiceJourney } from '@/components/strategic-topics/SerpentineServiceJourney';
import { cn } from '@/lib/utils';
import { BookOpen, Search } from 'lucide-react';

function safeDateLabel(v: unknown): string | null {
  if (v == null) return null;
  const s = String(v);
  if (!s) return null;
  try {
    const d = parseISO(s.slice(0, 19));
    if (Number.isNaN(d.getTime())) return s.slice(0, 16);
    return format(d, 'MMM d, yyyy HH:mm');
  } catch {
    return s.slice(0, 16);
  }
}

function formatIdBlock(r: RbProfileHouseholdRow): string {
  const parts: string[] = [];
  if (normStr(r.cc)) parts.push(`Kobo: ${normStr(r.cc)}`);
  if (normStr(r.nid)) parts.push(`Passport: ${normStr(r.nid)}`);
  if (normStr(r.pin)) parts.push(`Personal: ${normStr(r.pin)}`);
  if (normStr(r.fn)) parts.push(`File: ${normStr(r.fn)}`);
  return parts.length ? parts.join(' · ') : '—';
}

function SearchResultRow({
  hit,
  selected,
  onSelect,
}: {
  hit: RbSearchHit;
  selected: boolean;
  onSelect: () => void;
}) {
  const matchName = normStr(hit.mn) || '—';
  const caseName = normStr(hit.cn);
  const isDependant = String(hit.rt || '').toLowerCase() === 'dependant';
  const contextLines = searchResultContextLines(hit.mf, hit.nt);
  const caseStatus = formatCaseStatusLabel(hit.st);
  const followUpStatus = formatFollowUpStatusLabel(hit.og);
  const statusLines = [caseStatus, followUpStatus].filter(Boolean);

  return (
    <button
      type="button"
      onClick={onSelect}
      className={cn(
        'w-full text-left rounded-md px-2.5 py-2 text-sm transition-colors',
        selected ? 'bg-primary text-primary-foreground' : 'hover:bg-muted/80'
      )}
    >
      <div className="grid grid-cols-[minmax(0,1fr)_minmax(0,0.9fr)_minmax(0,1fr)] gap-2 items-start">
        <div className="min-w-0" dir="auto">
          <div className={cn('font-medium leading-snug truncate', selected && 'text-primary-foreground')}>
            {matchName}
          </div>
          {isDependant && caseName ? (
            <div
              className={cn(
                'text-[11px] mt-0.5 truncate',
                selected ? 'text-primary-foreground/85' : 'text-muted-foreground'
              )}
              dir="auto"
            >
              {caseName}
            </div>
          ) : null}
        </div>
        <div
          className={cn(
            'text-[10px] leading-tight text-center px-1 min-w-0',
            selected ? 'text-primary-foreground/90' : 'text-muted-foreground'
          )}
          dir="auto"
        >
          {contextLines.map((line) => (
            <div key={line} className="truncate">
              {line}
            </div>
          ))}
        </div>
        {statusLines.length > 0 ? (
          <div
            className={cn(
              'text-[10px] leading-tight text-right',
              selected ? 'text-primary-foreground/90' : 'text-muted-foreground'
            )}
          >
            {statusLines.map((line) => (
              <div key={line}>{line}</div>
            ))}
          </div>
        ) : (
          <div />
        )}
      </div>
    </button>
  );
}

export function RefugeesBeneficiariesCaseStoryTab() {
  const [q, setQ] = useState('');
  const [debouncedQ, setDebouncedQ] = useState('');
  const [selectedResCaseId, setSelectedResCaseId] = useState<string | null>(null);

  useEffect(() => {
    const t = window.setTimeout(() => setDebouncedQ(q.trim()), 320);
    return () => window.clearTimeout(t);
  }, [q]);

  const searchHint = beneficiarySearchHint(q.trim() ? debouncedQ : '');

  const searchQuery = useQuery({
    queryKey: ['rb', 'search', debouncedQ],
    queryFn: () => fetchBeneficiariesSearch(debouncedQ),
    enabled: canRunBeneficiarySearch(debouncedQ),
    staleTime: 0,
  });

  const profileQuery = useQuery({
    queryKey: ['rb', 'case', selectedResCaseId, 'profile'],
    queryFn: () => fetchCaseProfile(selectedResCaseId!),
    enabled: !!selectedResCaseId,
    staleTime: 15 * 60 * 1000,
    refetchOnWindowFocus: false,
  });

  const servicesInfinite = useInfiniteQuery({
    queryKey: ['rb', 'case', selectedResCaseId, 'services'],
    queryFn: ({ pageParam }) => fetchCaseServicesPage(selectedResCaseId!, pageParam as string | null),
    initialPageParam: null as string | null,
    getNextPageParam: (last) => (last.hm && last.nc ? last.nc : undefined),
    enabled: !!selectedResCaseId,
    staleTime: 15 * 60 * 1000,
    refetchOnWindowFocus: false,
  });

  const serviceRows = useMemo(
    () => servicesInfinite.data?.pages.flatMap((p) => p.it) ?? [],
    [servicesInfinite.data]
  );

  return (
    <div className="grid gap-4 xl:grid-cols-2">
      <Card className="border-border/80 shadow-sm">
        <CardHeader className="pb-2">
          <CardTitle className="text-base flex items-center gap-2">
            <Search className="h-4 w-4" />
            Find a case story
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          <Input
            placeholder="e.g. محمد محمود or national ID / case code"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            className="bg-background/80 h-9"
            dir="auto"
          />
          {searchQuery.isError && (
            <Alert variant="destructive">
              <AlertTitle>Search failed</AlertTitle>
              <AlertDescription>
                {searchQuery.error instanceof Error ? searchQuery.error.message : String(searchQuery.error)}
              </AlertDescription>
            </Alert>
          )}
          <ScrollArea className="h-52 rounded-md border border-border/80">
            <div className="p-1 space-y-0.5">
              {!q.trim() && (
                <p className="text-sm text-muted-foreground p-2">
                  Enter at least two name words (e.g. محمد محمود), or a single ID / case code.
                </p>
              )}
              {q.trim() && searchHint ? (
                <p className="text-sm text-amber-700 dark:text-amber-400 p-2">{searchHint}</p>
              ) : null}
              {canRunBeneficiarySearch(debouncedQ) && searchQuery.isLoading ? (
                <p className="text-sm text-muted-foreground p-2">Searching…</p>
              ) : null}
              {canRunBeneficiarySearch(debouncedQ) &&
              !searchQuery.isLoading &&
              (searchQuery.data?.r?.length ?? 0) === 0 ? (
                <p className="text-sm text-muted-foreground p-2">No matches. Try another name or identifier.</p>
              ) : null}
              {(searchQuery.data?.r ?? []).map((hit) => (
                <SearchResultRow
                  key={`${hit.id}-${hit.iid ?? hit.id}`}
                  hit={hit}
                  selected={selectedResCaseId === hit.id}
                  onSelect={() => setSelectedResCaseId(hit.id)}
                />
              ))}
            </div>
          </ScrollArea>
        </CardContent>
      </Card>

      <Card className="border-border/80 shadow-sm min-h-[32rem]">
        <CardHeader className="pb-2">
          <CardTitle className="text-base flex items-center gap-2">
            <BookOpen className="h-4 w-4" />
            Case journey
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-5">
          {!selectedResCaseId && (
            <p className="text-sm text-muted-foreground">Select a case from search to load its story.</p>
          )}
          {selectedResCaseId && profileQuery.isError && (
            <Alert variant="destructive">
              <AlertTitle>Profile unavailable</AlertTitle>
              <AlertDescription>
                {profileQuery.error instanceof Error ? profileQuery.error.message : String(profileQuery.error)}
              </AlertDescription>
            </Alert>
          )}
          {selectedResCaseId && profileQuery.isLoading && <Skeleton className="h-40 w-full rounded-md" />}
          {selectedResCaseId && profileQuery.data?.ok && (
            <>
              <section>
                <h4 className="text-sm font-semibold mb-2">Household ({profileQuery.data.hc})</h4>
                <HouseholdTable household={profileQuery.data.hh} />
              </section>

              <section>
                <h4 className="text-sm font-semibold mb-2">Service journey</h4>
                {servicesInfinite.isLoading && !servicesInfinite.data ? (
                  <Skeleton className="h-24 w-full rounded-md" />
                ) : (
                  <SerpentineServiceJourney services={serviceRows} />
                )}
                {servicesInfinite.hasNextPage ? (
                  <Button
                    variant="outline"
                    size="sm"
                    className="mt-2"
                    disabled={servicesInfinite.isFetchingNextPage}
                    onClick={() => void servicesInfinite.fetchNextPage()}
                  >
                    {servicesInfinite.isFetchingNextPage ? 'Loading…' : 'Load more for journey'}
                  </Button>
                ) : null}
              </section>

              <section>
                <h4 className="text-sm font-semibold mb-2">Services &amp; teams</h4>
                {servicesInfinite.isError && (
                  <Alert variant="destructive" className="mb-2">
                    <AlertTitle>Services list failed</AlertTitle>
                    <AlertDescription>
                      {servicesInfinite.error instanceof Error
                        ? servicesInfinite.error.message
                        : String(servicesInfinite.error)}
                    </AlertDescription>
                  </Alert>
                )}
                <ServicesTeamsTable serviceRows={serviceRows} />
                {servicesInfinite.hasNextPage ? (
                  <Button
                    variant="outline"
                    size="sm"
                    className="mt-2"
                    disabled={servicesInfinite.isFetchingNextPage}
                    onClick={() => void servicesInfinite.fetchNextPage()}
                  >
                    {servicesInfinite.isFetchingNextPage ? 'Loading…' : 'Load more services'}
                  </Button>
                ) : null}
              </section>
            </>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

const servicesTableHeadClass =
  'sticky top-0 z-20 h-10 px-3 text-left align-middle text-xs font-medium text-muted-foreground bg-background border-b shadow-[0_1px_0_0_hsl(var(--border))]';

function ServicesTeamsTable({ serviceRows }: { serviceRows: RbServiceRow[] }) {
  return (
    <div className="h-56 overflow-auto rounded-md border border-border/80">
      <table className="w-full border-collapse text-sm">
        <thead>
          <tr>
            <th className={servicesTableHeadClass}>Category</th>
            <th className={servicesTableHeadClass}>Product</th>
            <th className={servicesTableHeadClass}>Teams</th>
            <th className={servicesTableHeadClass}>Feedback</th>
            <th className={servicesTableHeadClass}>Receiver</th>
            <th className={cn(servicesTableHeadClass, 'whitespace-nowrap')}>Created</th>
            <th className={cn(servicesTableHeadClass, 'whitespace-nowrap')}>Last update</th>
            <th className={cn(servicesTableHeadClass, 'whitespace-nowrap')}>Actual date</th>
            <th className={cn(servicesTableHeadClass, 'whitespace-nowrap')}>Actual amount</th>
          </tr>
        </thead>
        <tbody>
          {serviceRows.map((s) => (
            <tr key={s.sid} className="border-b transition-colors hover:bg-muted/50">
              <td className="p-3 text-xs max-w-[140px] align-middle">{normStr(s.cat)}</td>
              <td className="p-3 text-sm max-w-[160px] align-middle">{normStr(s.pn)}</td>
              <td className="p-3 text-xs text-muted-foreground max-w-[160px] align-middle">
                {s.tn?.length ? s.tn.join(', ') : '—'}
              </td>
              <td className="p-3 text-xs align-middle">{normStr(s.fb)}</td>
              <td className="p-3 text-xs align-middle">{normStr(s.rcv)}</td>
              <td className="p-3 text-xs whitespace-nowrap align-middle">{safeDateLabel(s.cd) || '—'}</td>
              <td className="p-3 text-xs whitespace-nowrap align-middle">{safeDateLabel(s.lu) || '—'}</td>
              <td className="p-3 text-xs whitespace-nowrap align-middle">{safeDateLabel(s.ad) || '—'}</td>
              <td className="p-3 text-xs whitespace-nowrap align-middle">
                {s.amt != null ? String(s.amt) : '—'}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function HouseholdTable({ household }: { household: RbProfileHouseholdRow[] }) {
  return (
    <div className="rounded-md border border-border/80 overflow-x-auto">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead className="whitespace-nowrap">Type</TableHead>
            <TableHead>Name</TableHead>
            <TableHead className="min-w-[200px]">
              <span className="block text-xs font-medium">ID</span>
              <span className="block text-[10px] font-normal text-muted-foreground">
                Kobo code · Passport · Personal · File
              </span>
            </TableHead>
            <TableHead className="whitespace-nowrap">Age</TableHead>
            <TableHead>Teams</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {household.map((r) => (
            <TableRow key={r.iid}>
              <TableCell className="whitespace-nowrap text-xs">{normStr(r.rt)}</TableCell>
              <TableCell className="text-sm">{normStr(r.nm)}</TableCell>
              <TableCell className="text-xs text-muted-foreground">{formatIdBlock(r)}</TableCell>
              <TableCell className="text-xs whitespace-nowrap">{r.age != null ? String(r.age) : '—'}</TableCell>
              <TableCell className="text-xs max-w-[180px]">{normStr(r.tm) || '—'}</TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}
