"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { toast } from "sonner";
import { MessageSquare, Plus, Trash2, Zap } from "lucide-react";
import {
  useCreateSmsAutomationMutation,
  useCreateSmsTemplateMutation,
  useCreateSmsTopupSessionMutation,
  useDeleteSmsAutomationMutation,
  useDeleteSmsTemplateMutation,
  useGetClientMeQuery,
  useGetSmsAutomationsQuery,
  useGetSmsOverviewQuery,
  useGetSmsTemplatesQuery,
  useUpdateSmsAutomationMutation,
} from "@/lib/api/client-api";
import { SMS_COST_CENTS } from "@/lib/sms/constants";
import { SmsTemplateEditor } from "@/components/client/sms-template-editor";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { useI18n } from "@/components/providers/i18n-provider";

const statusOptions = [
  "new",
  "no_answer",
  "call_back",
  "qualified",
  "not_interested",
  "unqualified",
  "duplicate",
  "closed",
] as const;

const DEFAULT_NO_ANSWER_TEMPLATE =
  "Hi {{first_name}}, we tried reaching you about your inquiry. Reply to this message or call us back when you have a moment.";

export function ClientSms() {
  const { t } = useI18n();
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const { data: me } = useGetClientMeQuery();
  const { data: overview, refetch: refetchOverview } = useGetSmsOverviewQuery();
  const { data: automations, refetch: refetchAutomations } = useGetSmsAutomationsQuery();
  const { data: templates } = useGetSmsTemplatesQuery();
  const [createAutomation, { isLoading: creatingAutomation }] = useCreateSmsAutomationMutation();
  const [updateAutomation, { isLoading: updatingAutomation }] = useUpdateSmsAutomationMutation();
  const [deleteAutomation] = useDeleteSmsAutomationMutation();
  const [createTemplate, { isLoading: creatingTemplate }] = useCreateSmsTemplateMutation();
  const [deleteTemplate] = useDeleteSmsTemplateMutation();
  const [createTopup, { isLoading: creatingTopup }] = useCreateSmsTopupSessionMutation();

  const [topupAmount, setTopupAmount] = useState("30");
  const [automationName, setAutomationName] = useState("");
  const [triggerStatus, setTriggerStatus] = useState<string>("no_answer");
  const [messageTemplate, setMessageTemplate] = useState(DEFAULT_NO_ANSWER_TEMPLATE);
  const [templateName, setTemplateName] = useState("");
  const [templateBody, setTemplateBody] = useState(DEFAULT_NO_ANSWER_TEMPLATE);

  const isAdmin = me?.role === "customer_admin" && me?.is_active;
  const balanceCents = overview?.balance?.balance_cents ?? 0;
  const estimatedSms = Math.floor(balanceCents / SMS_COST_CENTS);
  const topupHandledRef = useRef<string | null>(null);

  const recentMessages = overview?.messages ?? [];
  const recentTransactions = overview?.transactions ?? [];

  const presetTopups = useMemo(
    () => [
      { label: "$10", cents: 1000 },
      { label: "$30", cents: 3000 },
      { label: "$50", cents: 5000 },
      { label: "$100", cents: 10000 },
    ],
    []
  );

  useEffect(() => {
    const topupState = searchParams.get("topup");
    if (!topupState) {
      topupHandledRef.current = null;
      return;
    }
    if (topupHandledRef.current === topupState) return;
    topupHandledRef.current = topupState;
    void (async () => {
      if (topupState === "success") {
        await Promise.all([refetchOverview(), refetchAutomations()]);
        router.replace(pathname, { scroll: false });
        toast.success(t("clientSms.toastTopupSuccess"));
        return;
      }
      if (topupState === "cancel") {
        router.replace(pathname, { scroll: false });
        toast.info(t("clientSms.toastTopupCanceled"));
      }
    })();
  }, [pathname, refetchAutomations, refetchOverview, router, searchParams, t]);

  async function startTopup(amountCents: number) {
    if (!isAdmin) {
      toast.error(t("clientSms.adminOnly"));
      return;
    }
    try {
      const { url } = await createTopup({ amount_cents: amountCents }).unwrap();
      window.location.href = url;
    } catch (err: unknown) {
      const msg =
        err && typeof err === "object" && "data" in err
          ? String((err as { data?: unknown }).data)
          : t("clientSms.topupFailed");
      toast.error(msg);
    }
  }

  async function submitAutomation(e: React.FormEvent) {
    e.preventDefault();
    if (!isAdmin) {
      toast.error(t("clientSms.adminOnly"));
      return;
    }
    try {
      await createAutomation({
        name: automationName.trim(),
        trigger_status: triggerStatus as (typeof statusOptions)[number],
        message_template: messageTemplate.trim(),
        is_active: true,
      }).unwrap();
      toast.success(t("clientSms.automationCreated"));
      setAutomationName("");
      setMessageTemplate(DEFAULT_NO_ANSWER_TEMPLATE);
      setTriggerStatus("no_answer");
    } catch (err: unknown) {
      const msg =
        err && typeof err === "object" && "data" in err
          ? String((err as { data?: unknown }).data)
          : t("clientSms.automationCreateFailed");
      toast.error(msg);
    }
  }

  async function toggleAutomation(id: string, isActive: boolean) {
    try {
      await updateAutomation({ id, is_active: !isActive }).unwrap();
    } catch {
      toast.error(t("clientSms.automationUpdateFailed"));
    }
  }

  async function removeAutomation(id: string) {
    try {
      await deleteAutomation({ id }).unwrap();
      toast.success(t("clientSms.automationDeleted"));
    } catch {
      toast.error(t("clientSms.automationDeleteFailed"));
    }
  }

  async function submitTemplate(e: React.FormEvent) {
    e.preventDefault();
    if (!isAdmin) {
      toast.error(t("clientSms.adminOnly"));
      return;
    }
    try {
      await createTemplate({
        name: templateName.trim(),
        body: templateBody.trim(),
      }).unwrap();
      toast.success(t("clientSms.templateCreated"));
      setTemplateName("");
      setTemplateBody(DEFAULT_NO_ANSWER_TEMPLATE);
    } catch (err: unknown) {
      const msg =
        err && typeof err === "object" && "data" in err
          ? String((err as { data?: unknown }).data)
          : t("clientSms.templateCreateFailed");
      toast.error(msg);
    }
  }

  async function removeTemplate(id: string) {
    try {
      await deleteTemplate({ id }).unwrap();
      toast.success(t("clientSms.templateDeleted"));
    } catch {
      toast.error(t("clientSms.templateDeleteFailed"));
    }
  }

  return (
    <div className="flex flex-1 flex-col gap-6 p-6 lg:p-8">
      <header className="space-y-1">
        <h1 className="text-2xl font-semibold tracking-tight">{t("clientSms.title")}</h1>
        <p className="text-sm text-muted-foreground">{t("clientSms.subtitle")}</p>
      </header>

      <div className="grid gap-4 md:grid-cols-3">
        <Card className="border-border/70 bg-card/50">
          <CardHeader className="pb-2">
            <CardTitle className="text-base">{t("clientSms.balanceTitle")}</CardTitle>
            <CardDescription>{t("clientSms.costPerSms")}</CardDescription>
          </CardHeader>
          <CardContent>
            <p className="text-3xl font-semibold">${(balanceCents / 100).toFixed(2)}</p>
            <p className="mt-1 text-sm text-muted-foreground">
              {t("clientSms.estimatedSms").replace("{count}", String(estimatedSms))}
            </p>
          </CardContent>
        </Card>

        <Card className="border-border/70 bg-card/50 md:col-span-2">
          <CardHeader className="pb-2">
            <CardTitle className="text-base">{t("clientSms.topupTitle")}</CardTitle>
            <CardDescription>{t("clientSms.topupHint")}</CardDescription>
          </CardHeader>
          <CardContent className="flex flex-wrap items-end gap-3">
            <div className="min-w-[140px] space-y-1">
              <Label htmlFor="sms-topup-amount">{t("clientSms.amountUsd")}</Label>
              <Input
                id="sms-topup-amount"
                type="number"
                min={3}
                step={0.01}
                value={topupAmount}
                onChange={(e) => setTopupAmount(e.target.value)}
                disabled={!isAdmin}
              />
            </div>
            <Button
              disabled={!isAdmin || creatingTopup}
              onClick={() => {
                const cents = Math.round(Number(topupAmount) * 100);
                if (!Number.isFinite(cents) || cents < 300) {
                  toast.error(t("clientSms.minTopup"));
                  return;
                }
                void startTopup(cents);
              }}
            >
              <Zap className="mr-2 size-4" />
              {t("clientSms.topupNow")}
            </Button>
            <div className="flex flex-wrap gap-2">
              {presetTopups.map((preset) => (
                <Button
                  key={preset.cents}
                  variant="outline"
                  size="sm"
                  disabled={!isAdmin || creatingTopup}
                  onClick={() => void startTopup(preset.cents)}
                >
                  {preset.label}
                </Button>
              ))}
            </div>
          </CardContent>
        </Card>
      </div>

      {isAdmin ? (
        <Card className="border-border/70 bg-card/50">
          <CardHeader>
            <CardTitle className="text-base">{t("clientSms.automationsTitle")}</CardTitle>
            <CardDescription>{t("clientSms.automationsHint")}</CardDescription>
          </CardHeader>
          <CardContent className="grid gap-6 lg:grid-cols-2">
            <form onSubmit={(e) => void submitAutomation(e)} className="space-y-3">
              <div className="space-y-1">
                <Label>{t("clientSms.automationName")}</Label>
                <Input
                  value={automationName}
                  onChange={(e) => setAutomationName(e.target.value)}
                  placeholder={t("clientSms.automationNamePlaceholder")}
                  required
                />
              </div>
              <div className="space-y-1">
                <Label>{t("clientSms.triggerStatus")}</Label>
                <Select value={triggerStatus} onValueChange={setTriggerStatus}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {statusOptions.map((status) => (
                      <SelectItem key={status} value={status}>
                        {t(`clientDashboard.status.${status}`)}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1">
                <Label>{t("clientSms.messageTemplate")}</Label>
                <SmsTemplateEditor
                  value={messageTemplate}
                  onChange={setMessageTemplate}
                  rows={5}
                  required
                  insertLabel={t("clientSms.insertPlaceholder")}
                />
                <p className="text-xs text-muted-foreground">{t("clientSms.templateVars")}</p>
              </div>
              <Button type="submit" disabled={creatingAutomation}>
                <Plus className="mr-2 size-4" />
                {t("clientSms.addAutomation")}
              </Button>
            </form>

            <div className="space-y-3">
              {(automations ?? []).length === 0 ? (
                <p className="text-sm text-muted-foreground">{t("clientSms.noAutomations")}</p>
              ) : (
                (automations ?? []).map((automation) => (
                  <div
                    key={automation.id}
                    className="rounded-lg border border-border/70 bg-background/40 p-3"
                  >
                    <div className="mb-2 flex items-start justify-between gap-2">
                      <div>
                        <p className="font-medium">{automation.name}</p>
                        <Badge variant="secondary" className="mt-1">
                          {t(`clientDashboard.status.${automation.trigger_status}`)}
                        </Badge>
                      </div>
                      <div className="flex items-center gap-2">
                        <Switch
                          checked={automation.is_active}
                          disabled={updatingAutomation}
                          onCheckedChange={() => void toggleAutomation(automation.id, automation.is_active)}
                        />
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => void removeAutomation(automation.id)}
                        >
                          <Trash2 className="size-4" />
                        </Button>
                      </div>
                    </div>
                    <p className="line-clamp-3 text-sm text-muted-foreground">
                      {automation.message_template}
                    </p>
                  </div>
                ))
              )}
            </div>
          </CardContent>
        </Card>
      ) : null}

      {isAdmin ? (
        <Card className="border-border/70 bg-card/50">
          <CardHeader>
            <CardTitle className="text-base">{t("clientSms.templatesTitle")}</CardTitle>
            <CardDescription>{t("clientSms.templatesHint")}</CardDescription>
          </CardHeader>
          <CardContent className="grid gap-6 lg:grid-cols-2">
            <form onSubmit={(e) => void submitTemplate(e)} className="space-y-3">
              <div className="space-y-1">
                <Label>{t("clientSms.templateName")}</Label>
                <Input
                  value={templateName}
                  onChange={(e) => setTemplateName(e.target.value)}
                  placeholder={t("clientSms.templateNamePlaceholder")}
                  required
                />
              </div>
              <div className="space-y-1">
                <Label>{t("clientSms.templateBody")}</Label>
                <SmsTemplateEditor
                  value={templateBody}
                  onChange={setTemplateBody}
                  rows={5}
                  required
                  insertLabel={t("clientSms.insertPlaceholder")}
                />
              </div>
              <Button type="submit" disabled={creatingTemplate}>
                <Plus className="mr-2 size-4" />
                {t("clientSms.addTemplate")}
              </Button>
            </form>

            <div className="space-y-3">
              {(templates ?? []).length === 0 ? (
                <p className="text-sm text-muted-foreground">{t("clientSms.noTemplates")}</p>
              ) : (
                (templates ?? []).map((template) => (
                  <div
                    key={template.id}
                    className="rounded-lg border border-border/70 bg-background/40 p-3"
                  >
                    <div className="mb-2 flex items-start justify-between gap-2">
                      <p className="font-medium">{template.name}</p>
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => void removeTemplate(template.id)}
                      >
                        <Trash2 className="size-4" />
                      </Button>
                    </div>
                    <p className="line-clamp-3 text-sm text-muted-foreground">{template.body}</p>
                  </div>
                ))
              )}
            </div>
          </CardContent>
        </Card>
      ) : null}

      <Card className="border-border/70 bg-card/50">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <MessageSquare className="size-4" />
            {t("clientSms.recentMessages")}
          </CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{t("clientSms.colLead")}</TableHead>
                <TableHead>{t("clientSms.colPhone")}</TableHead>
                <TableHead>{t("clientSms.colMessage")}</TableHead>
                <TableHead>{t("clientSms.colStatus")}</TableHead>
                <TableHead>{t("clientSms.colCost")}</TableHead>
                <TableHead>{t("clientSms.colSentAt")}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {recentMessages.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={6} className="h-16 text-center text-muted-foreground">
                    {t("clientSms.noMessages")}
                  </TableCell>
                </TableRow>
              ) : (
                recentMessages.map((msg) => {
                  const lead = msg.customer_leads;
                  const leadName = lead
                    ? `${lead.first_name ?? ""} ${lead.last_name ?? ""}`.trim()
                    : "";
                  return (
                    <TableRow key={msg.id}>
                      <TableCell>{leadName || t("clientDashboard.na")}</TableCell>
                      <TableCell className="font-mono text-xs">{msg.to_phone}</TableCell>
                      <TableCell className="max-w-[280px] truncate">{msg.body}</TableCell>
                      <TableCell>
                        <Badge variant="outline">{msg.delivery_status}</Badge>
                      </TableCell>
                      <TableCell>${(msg.cost_cents / 100).toFixed(2)}</TableCell>
                      <TableCell className="text-muted-foreground">
                        {new Date(msg.created_at).toLocaleString()}
                      </TableCell>
                    </TableRow>
                  );
                })
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <Card className="border-border/70 bg-card/50">
        <CardHeader>
          <CardTitle className="text-base">{t("clientSms.transactionsTitle")}</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{t("clientSms.colType")}</TableHead>
                <TableHead>{t("clientSms.colAmount")}</TableHead>
                <TableHead>{t("clientSms.colDescription")}</TableHead>
                <TableHead>{t("clientSms.colSentAt")}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {recentTransactions.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={4} className="h-16 text-center text-muted-foreground">
                    {t("clientSms.noTransactions")}
                  </TableCell>
                </TableRow>
              ) : (
                recentTransactions.map((tx) => (
                  <TableRow key={tx.id}>
                    <TableCell>
                      <Badge variant={tx.tx_type === "credit" ? "default" : "secondary"}>
                        {tx.tx_type}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      {tx.tx_type === "credit" ? "+" : "-"}${(tx.amount_cents / 100).toFixed(2)}
                    </TableCell>
                    <TableCell>{tx.description}</TableCell>
                    <TableCell className="text-muted-foreground">
                      {new Date(tx.created_at).toLocaleString()}
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}
