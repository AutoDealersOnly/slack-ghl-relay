import { useAuth } from "@/_core/hooks/useAuth";
import DashboardLayout from "@/components/DashboardLayout";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { trpc } from "@/lib/trpc";
import {
  Activity,
  ArrowUpRight,
  CheckCircle2,
  CircleAlert,
  Clock3,
  Database,
  FileWarning,
  KeyRound,
  Loader2,
  Radio,
  RefreshCw,
  ShieldCheck,
  Workflow,
  XCircle,
} from "lucide-react";

const dateTime = (value: Date | string | null | undefined) => {
  if (!value) return "—";
  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? "—"
    : new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" }).format(date);
};

const archiveLabel: Record<string, string> = {
  not_scheduled: "Not scheduled",
  scheduled: "Scheduled",
  cancelled: "Cancelled",
  archived: "Archived",
  failed: "Needs attention",
};

function HomeContent() {
  const { isAuthenticated, loading: authLoading } = useAuth();
  const statusQuery = trpc.relay.status.useQuery(undefined, {
    enabled: isAuthenticated,
    refetchInterval: 30_000,
  });
  const status = statusQuery.data;
  const readiness = status?.readiness ?? [];
  const settingsMetadata = new Map((status?.settingsMetadata ?? []).map(item => [item.settingKey, item]));
  const configuredCount = readiness.filter(item => item.configured).length;
  const fullyConfigured = readiness.length > 0 && configuredCount === readiness.length;
  const failedActions = status?.recentActions.filter(action => action.outcome === "failed") ?? [];

  return (
    <div className="min-h-screen bg-[#f4f6f2] text-[#15211a]">
      <div className="absolute inset-x-0 top-0 h-64 bg-[radial-gradient(ellipse_at_top_left,_rgba(49,94,66,0.15),_transparent_63%)] pointer-events-none" />
      <div className="relative mx-auto max-w-7xl px-1 pb-10 pt-3 sm:px-5 sm:pt-8">
        <header className="flex flex-col gap-5 border-b border-[#dce4dd] pb-7 sm:flex-row sm:items-end sm:justify-between">
          <div className="max-w-2xl">
            <div className="mb-3 flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.18em] text-[#56715e]">
              <span className="h-2 w-2 rounded-full bg-[#4f8b61]" />
              Private operations workspace
            </div>
            <h1 className="font-serif text-3xl tracking-tight text-[#122218] sm:text-4xl">Relay recovery center</h1>
            <p className="mt-2 max-w-xl text-sm leading-6 text-[#536158]">
              A clear view of the GHL-to-Slack relay. Readiness, campaign channels, archives, and safe action results appear here; sensitive values never do.
            </p>
          </div>
          <div className="flex items-center gap-3">
            <Badge className="gap-1.5 rounded-full border-0 bg-[#e6f1e8] px-3 py-1.5 text-[#28613a] hover:bg-[#e6f1e8]">
              <ShieldCheck className="h-3.5 w-3.5" /> Internal only
            </Badge>
            <Button
              variant="outline"
              size="sm"
              onClick={() => statusQuery.refetch()}
              disabled={statusQuery.isFetching || authLoading}
              className="border-[#cbd6cd] bg-white shadow-sm hover:bg-[#f7faf7]"
            >
              <RefreshCw className={`mr-2 h-3.5 w-3.5 ${statusQuery.isFetching ? "animate-spin" : ""}`} />
              Refresh
            </Button>
          </div>
        </header>

        {authLoading || (statusQuery.isLoading && !status) ? (
          <div className="flex min-h-[380px] items-center justify-center">
            <div className="flex items-center gap-3 rounded-full border border-[#d8e0d9] bg-white px-5 py-3 text-sm text-[#5b6a60] shadow-sm">
              <Loader2 className="h-4 w-4 animate-spin text-[#3a7550]" /> Loading relay status
            </div>
          </div>
        ) : statusQuery.error ? (
          <Card className="mt-8 border-[#e9c9c1] bg-[#fffafa] shadow-none">
            <CardContent className="flex gap-4 p-6">
              <CircleAlert className="mt-0.5 h-5 w-5 shrink-0 text-[#b5432a]" />
              <div>
                <h2 className="font-semibold text-[#7e2f20]">Status data is temporarily unavailable</h2>
                <p className="mt-1 text-sm leading-6 text-[#875344]">The relay itself has not been changed. Refresh the page after checking that you are signed in.</p>
              </div>
            </CardContent>
          </Card>
        ) : (
          <>
            <section className="mt-8 grid gap-4 lg:grid-cols-[1.38fr_0.62fr]">
              <Card className="overflow-hidden border-[#d7e1d8] bg-[#183728] text-white shadow-[0_16px_40px_rgba(18,50,32,0.12)]">
                <CardContent className="relative p-6 sm:p-7">
                  <div className="absolute -right-10 -top-10 h-40 w-40 rounded-full border-[18px] border-white/5" />
                  <div className="relative flex h-full flex-col justify-between gap-8">
                    <div className="flex items-start justify-between gap-4">
                      <div>
                        <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.16em] text-[#b3cfbd]">
                          <Radio className="h-3.5 w-3.5" /> Relay readiness
                        </div>
                        <p className="mt-4 text-4xl font-semibold tracking-tight">{configuredCount}<span className="text-xl text-[#9eb9a7]">/{readiness.length || 8}</span></p>
                        <p className="mt-1 text-sm text-[#c7d9cc]">protected settings configured</p>
                      </div>
                      <div className={`rounded-full p-2.5 ${fullyConfigured ? "bg-[#4a8c5a]" : "bg-[#ae7b32]"}`}>
                        {fullyConfigured ? <CheckCircle2 className="h-5 w-5" /> : <Clock3 className="h-5 w-5" />}
                      </div>
                    </div>
                    <div className="grid grid-cols-2 gap-3 border-t border-white/10 pt-5 text-sm sm:grid-cols-3">
                      <div><span className="block text-xs text-[#9eb9a7]">Database</span><span className="font-medium">{status?.databaseAvailable ? "Connected" : "Unavailable"}</span></div>
                      <div><span className="block text-xs text-[#9eb9a7]">Campaigns</span><span className="font-medium">{status?.campaigns.length ?? 0} tracked</span></div>
                      <div><span className="block text-xs text-[#9eb9a7]">Failures</span><span className="font-medium">{failedActions.length} recent</span></div>
                    </div>
                  </div>
                </CardContent>
              </Card>

              <Card className="border-[#d7e1d8] bg-white shadow-[0_12px_30px_rgba(22,43,28,0.06)]">
                <CardContent className="p-6">
                  <div className="flex items-center gap-3">
                    <div className="rounded-xl bg-[#eef4ef] p-2.5 text-[#347044]"><KeyRound className="h-5 w-5" /></div>
                    <div><p className="font-semibold">Secret-safe by design</p><p className="text-xs text-[#68766c]">Configuration values are never returned to this page.</p></div>
                  </div>
                  <div className="mt-6 space-y-3">
                    <div className="flex items-center justify-between text-sm"><span className="text-[#56645a]">Webhook protection</span><span className="font-medium text-[#275c37]">Required</span></div>
                    <div className="h-1.5 overflow-hidden rounded-full bg-[#e9efea]"><div className="h-full rounded-full bg-[#4f8b61]" style={{ width: `${readiness.length ? (configuredCount / readiness.length) * 100 : 0}%` }} /></div>
                    <p className="text-xs leading-5 text-[#6e7a70]">A failed or missing setting is shown as a status only. Tokens, keys, IDs, and URLs remain hidden.</p>
                  </div>
                </CardContent>
              </Card>
            </section>

            <section className="mt-5 grid gap-5 xl:grid-cols-[0.84fr_1.16fr]">
              <Card className="border-[#d7e1d8] bg-white shadow-[0_12px_30px_rgba(22,43,28,0.05)]">
                <CardContent className="p-6">
                  <div className="mb-5 flex items-center justify-between"><div><h2 className="font-semibold">Configuration checklist</h2><p className="mt-1 text-xs text-[#6b786e]">The relay will not disclose values here.</p></div><KeyRound className="h-4 w-4 text-[#608069]" /></div>
                  <div className="space-y-3">
                    {readiness.map(item => (
                      <div key={item.key} className="flex items-center justify-between gap-4 rounded-xl border border-[#e5ece6] px-3.5 py-3">
                        <span className="text-sm text-[#314036]">{item.label}</span>
                        <span className={`shrink-0 text-xs font-semibold ${item.configured ? "text-[#2d7242]" : "text-[#9a681f]"}`}>{item.configured ? (settingsMetadata.get(item.key)?.recoveryVaultVerifiedAt ? "Vault checked" : "Configured") : "Needed"}</span>
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>

              <Card className="border-[#d7e1d8] bg-white shadow-[0_12px_30px_rgba(22,43,28,0.05)]">
                <CardContent className="p-0">
                  <div className="flex items-start justify-between border-b border-[#e8eeea] p-6"><div><h2 className="font-semibold">Campaign channels</h2><p className="mt-1 text-xs text-[#6b786e]">Canvas linkage and archive state survive relay restarts.</p></div><Database className="h-4 w-4 text-[#608069]" /></div>
                  {status?.campaigns.length ? (
                    <div className="overflow-x-auto"><table className="w-full min-w-[620px] text-left text-sm"><thead className="bg-[#f7f9f7] text-[11px] font-semibold uppercase tracking-[0.1em] text-[#768278]"><tr><th className="px-6 py-3">Campaign</th><th className="px-4 py-3">Canvas</th><th className="px-4 py-3">Archive</th><th className="px-6 py-3 text-right">End date</th></tr></thead><tbody>{status.campaigns.map(campaign => <tr key={campaign.id} className="border-t border-[#eef2ee]"><td className="px-6 py-4"><p className="font-medium text-[#26352b]">{campaign.productionName}</p><p className="mt-0.5 font-mono text-xs text-[#718074]">#{campaign.channelName}</p></td><td className="px-4 py-4"><span className={campaign.canvasId ? "text-[#2c7041]" : "text-[#9b6922]"}>{campaign.canvasId ? "Linked" : "Pending"}</span></td><td className="px-4 py-4"><Badge variant="outline" className="border-[#dce6dd] bg-[#f8faf8] text-[#536358]">{archiveLabel[campaign.archiveStatus] ?? campaign.archiveStatus}</Badge></td><td className="px-6 py-4 text-right text-[#627066]">{campaign.eventEndDate ?? "—"}</td></tr>)}</tbody></table></div>
                  ) : <div className="flex flex-col items-center px-6 py-14 text-center"><Workflow className="h-6 w-6 text-[#8da294]" /><p className="mt-3 font-medium text-[#3e5044]">No campaign channels have been recorded yet</p><p className="mt-1 max-w-sm text-sm leading-6 text-[#718074]">After the first protected test workflow runs, its channel, canvas, and archive state will appear here.</p></div>}
                </CardContent>
              </Card>
            </section>

            <section className="mt-5 grid gap-5 lg:grid-cols-[1.2fr_0.8fr]">
              <Card className="border-[#d7e1d8] bg-white shadow-[0_12px_30px_rgba(22,43,28,0.05)]"><CardContent className="p-6"><div className="mb-5 flex items-center justify-between"><div><h2 className="font-semibold">Recent relay activity</h2><p className="mt-1 text-xs text-[#6b786e]">Safe diagnostic messages only.</p></div><Activity className="h-4 w-4 text-[#608069]" /></div>{status?.recentActions.length ? <div className="space-y-3">{status.recentActions.map(action => <div key={action.id} className="flex gap-3"><div className={`mt-1 h-2 w-2 shrink-0 rounded-full ${action.outcome === "success" ? "bg-[#4f8b61]" : action.outcome === "failed" ? "bg-[#bc4b35]" : "bg-[#c68d36]"}`} /><div className="min-w-0 flex-1"><div className="flex justify-between gap-3"><p className="font-medium text-[#304036]">{action.action.replace(/_/g, " ")}</p><time className="shrink-0 text-xs text-[#879287]">{dateTime(action.createdAt)}</time></div><p className="mt-1 text-sm leading-5 text-[#68756b]">{action.detail}</p></div></div>)}</div> : <p className="rounded-xl border border-dashed border-[#d9e3da] px-4 py-7 text-sm leading-6 text-[#718074]">Action results will appear here after the first protected relay test. Failures are retained for recovery review.</p>}</CardContent></Card>
              <Card className={`${failedActions.length ? "border-[#ead0c8] bg-[#fffaf8]" : "border-[#d7e1d8] bg-white"} shadow-[0_12px_30px_rgba(22,43,28,0.05)]`}><CardContent className="p-6"><div className="flex items-center gap-3"><div className={`rounded-xl p-2.5 ${failedActions.length ? "bg-[#f7e5df] text-[#b5432a]" : "bg-[#eef4ef] text-[#347044]"}`}>{failedActions.length ? <FileWarning className="h-5 w-5" /> : <CheckCircle2 className="h-5 w-5" />}</div><div><h2 className="font-semibold">Recovery attention</h2><p className="text-xs text-[#6b786e]">What needs a human check next.</p></div></div><div className="mt-6 rounded-xl bg-[#f6f8f6] p-4"><p className="text-sm font-medium text-[#334239]">{failedActions.length ? `${failedActions.length} failed action${failedActions.length === 1 ? "" : "s"} need review` : "No failed actions recorded"}</p><p className="mt-1 text-sm leading-6 text-[#6b786e]">{failedActions.length ? "Open the activity list to review the safe error summary, then correct the underlying setting or workflow before retrying." : "The recovery page will call attention to failed relay work here without exposing connection details."}</p></div><div className="mt-5 flex items-center text-sm font-medium text-[#336c45]">Recovery guide is maintained in GitHub <ArrowUpRight className="ml-1.5 h-4 w-4" /></div></CardContent></Card>
            </section>
          </>
        )}
      </div>
    </div>
  );
}

export default function Home() {
  return (
    <DashboardLayout>
      <HomeContent />
    </DashboardLayout>
  );
}
