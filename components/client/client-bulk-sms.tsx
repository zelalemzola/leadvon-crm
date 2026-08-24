"use client";

import { useMemo, useState } from "react";
import { Megaphone, Send } from "lucide-react";
import { toast } from "sonner";
import {
  useBulkSendSmsMutation,
  useGetCustomerLeadsQuery,
  useGetSmsOverviewQuery,
  useGetSmsTemplatesQuery,
  type CustomerLeadSort,
} from "@/lib/api/client-api";
import { SMS_COST_CENTS } from "@/lib/sms/constants";
import { SmsTemplateEditor } from "@/components/client/sms-template-editor";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
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

export function ClientBulkSms() {
  const { t } = useI18n();
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [selected, setSelected] = useState<Record<string, boolean>>({});
  const [templateId, setTemplateId] = useState<string>("custom");
  const [message, setMessage] = useState("");
  const sort: CustomerLeadSort = "newest_added";

  const { data: overview } = useGetSmsOverviewQuery();
  const { data: templates } = useGetSmsTemplatesQuery();
  const { data, isLoading } = useGetCustomerLeadsQuery({
    search,
    status: "all",
    sort,
    page,
    pageSize: 50,
  });
  const [bulkSend, { isLoading: sending }] = useBulkSendSmsMutation();

  const rows = data?.rows ?? [];
  const total = data?.total ?? 0;
  const selectedIds = useMemo(
    () => Object.entries(selected).filter(([, v]) => v).map(([id]) => id),
    [selected]
  );
  const balanceCents = overview?.balance?.balance_cents ?? 0;
  const estimatedCost = selectedIds.length * SMS_COST_CENTS;
  const pageAllSelected =
    rows.length > 0 && rows.every((row) => selected[row.id]);

  function toggleAllOnPage(checked: boolean) {
    setSelected((prev) => {
      const next = { ...prev };
      for (const row of rows) {
        next[row.id] = checked;
      }
      return next;
    });
  }

  function applyTemplate(id: string) {
    setTemplateId(id);
    if (id === "custom") return;
    const tpl = (templates ?? []).find((item) => item.id === id);
    if (tpl) setMessage(tpl.body);
  }

  async function sendBulk() {
    if (selectedIds.length === 0) {
      toast.error(t("clientBulkSms.selectLeads"));
      return;
    }
    if (!message.trim() && templateId === "custom") {
      toast.error(t("clientBulkSms.messageRequired"));
      return;
    }
    if (balanceCents < estimatedCost) {
      toast.error(t("clientBulkSms.insufficientBalance"));
      return;
    }

    try {
      const result = await bulkSend({
        lead_ids: selectedIds,
        ...(templateId !== "custom" ? { template_id: templateId } : { message: message.trim() }),
      }).unwrap();
      toast.success(
        t("clientBulkSms.sendSuccess")
          .replace("{sent}", String(result.sent))
          .replace("{failed}", String(result.failed))
      );
      if (result.failed === 0) {
        setSelected({});
      }
    } catch (err: unknown) {
      const msg =
        err && typeof err === "object" && "data" in err
          ? String((err as { data?: unknown }).data)
          : t("clientBulkSms.sendFailed");
      toast.error(msg);
    }
  }

  return (
    <div className="flex flex-1 flex-col gap-6 p-6 lg:p-8">
      <header className="space-y-1">
        <h1 className="text-2xl font-semibold tracking-tight">{t("clientBulkSms.title")}</h1>
        <p className="text-sm text-muted-foreground">{t("clientBulkSms.subtitle")}</p>
      </header>

      <div className="grid gap-4 lg:grid-cols-[1.4fr_1fr]">
        <Card className="border-border/70 bg-card/50">
          <CardHeader>
            <CardTitle className="text-base">{t("clientBulkSms.selectLeadsTitle")}</CardTitle>
            <CardDescription>{t("clientBulkSms.selectLeadsHint")}</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <Input
              value={search}
              onChange={(e) => {
                setSearch(e.target.value);
                setPage(1);
              }}
              placeholder={t("clientBulkSms.searchPlaceholder")}
            />
            <div className="overflow-hidden rounded-lg border border-border/70">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-10">
                      <Checkbox
                        checked={pageAllSelected}
                        onCheckedChange={(v) => toggleAllOnPage(v === true)}
                        aria-label={t("clientBulkSms.selectPage")}
                      />
                    </TableHead>
                    <TableHead>{t("clientBulkSms.colLead")}</TableHead>
                    <TableHead>{t("clientBulkSms.colPhone")}</TableHead>
                    <TableHead>{t("clientBulkSms.colStatus")}</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {isLoading ? (
                    <TableRow>
                      <TableCell colSpan={4} className="h-16 text-center text-muted-foreground">
                        {t("clientBulkSms.loading")}
                      </TableCell>
                    </TableRow>
                  ) : rows.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={4} className="h-16 text-center text-muted-foreground">
                        {t("clientBulkSms.noLeads")}
                      </TableCell>
                    </TableRow>
                  ) : (
                    rows.map((row) => (
                      <TableRow key={row.id}>
                        <TableCell>
                          <Checkbox
                            checked={Boolean(selected[row.id])}
                            onCheckedChange={(v) =>
                              setSelected((prev) => ({ ...prev, [row.id]: v === true }))
                            }
                            aria-label={row.first_name}
                          />
                        </TableCell>
                        <TableCell className="font-medium">
                          {row.first_name} {row.last_name}
                        </TableCell>
                        <TableCell className="font-mono text-xs">{row.phone}</TableCell>
                        <TableCell>
                          <Badge variant="secondary">
                            {t(`clientDashboard.status.${row.status}`)}
                          </Badge>
                        </TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
            </div>
            <div className="flex items-center justify-between gap-2 text-sm text-muted-foreground">
              <span>
                {t("clientBulkSms.selectedCount").replace("{count}", String(selectedIds.length))}
              </span>
              <div className="flex items-center gap-2">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  disabled={page <= 1}
                  onClick={() => setPage((p) => Math.max(1, p - 1))}
                >
                  {t("clientBulkSms.prev")}
                </Button>
                <span>
                  {page} / {Math.max(1, Math.ceil(total / 50))}
                </span>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  disabled={page * 50 >= total}
                  onClick={() => setPage((p) => p + 1)}
                >
                  {t("clientBulkSms.next")}
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="border-border/70 bg-card/50">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <Megaphone className="size-4" />
              {t("clientBulkSms.composeTitle")}
            </CardTitle>
            <CardDescription>{t("clientBulkSms.composeHint")}</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="rounded-lg border border-border/70 bg-muted/20 p-3 text-sm">
              <p>
                {t("clientBulkSms.balance").replace(
                  "{amount}",
                  `$${(balanceCents / 100).toFixed(2)}`
                )}
              </p>
              <p className="mt-1 text-muted-foreground">
                {t("clientBulkSms.estimatedCost")
                  .replace("{count}", String(selectedIds.length))
                  .replace("{amount}", `$${(estimatedCost / 100).toFixed(2)}`)}
              </p>
            </div>

            <div className="space-y-1">
              <Label>{t("clientBulkSms.template")}</Label>
              <Select value={templateId} onValueChange={applyTemplate}>
                <SelectTrigger>
                  <SelectValue placeholder={t("clientBulkSms.templatePlaceholder")} />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="custom">{t("clientBulkSms.customMessage")}</SelectItem>
                  {(templates ?? []).map((tpl) => (
                    <SelectItem key={tpl.id} value={tpl.id}>
                      {tpl.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {(templates ?? []).length === 0 ? (
                <p className="text-xs text-muted-foreground">{t("clientBulkSms.noTemplatesHint")}</p>
              ) : null}
            </div>

            <div className="space-y-1">
              <Label>{t("clientBulkSms.message")}</Label>
              <SmsTemplateEditor
                value={message}
                onChange={(next) => {
                  setMessage(next);
                  setTemplateId("custom");
                }}
                rows={6}
                insertLabel={t("clientBulkSms.insertPlaceholder")}
                placeholder={t("clientBulkSms.messagePlaceholder")}
              />
            </div>

            <Button
              className="w-full"
              disabled={sending || selectedIds.length === 0 || !message.trim()}
              onClick={() => void sendBulk()}
            >
              <Send className="mr-2 size-4" />
              {sending
                ? t("clientBulkSms.sending")
                : t("clientBulkSms.sendButton").replace("{count}", String(selectedIds.length))}
            </Button>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
