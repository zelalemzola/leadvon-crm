"use client";

import { useGetAdminSmsOverviewQuery } from "@/lib/api/admin-api";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { useI18n } from "@/components/providers/i18n-provider";

export function AdminSms() {
  const { t } = useI18n();
  const { data, isLoading, isError, error } = useGetAdminSmsOverviewQuery();

  if (isLoading) {
    return <p className="p-6 text-sm text-muted-foreground">{t("adminSms.loading")}</p>;
  }

  if (isError) {
    return (
      <p className="p-6 text-sm text-destructive">
        {t("adminSms.failed")} {String((error as { data?: string })?.data ?? "")}
      </p>
    );
  }

  const totals = data?.totals;

  return (
    <div className="flex flex-1 flex-col gap-6 p-6 lg:p-8">
      <header className="space-y-1">
        <h1 className="text-2xl font-semibold tracking-tight">{t("adminSms.title")}</h1>
        <p className="text-sm text-muted-foreground">{t("adminSms.subtitle")}</p>
      </header>

      <div className="grid gap-4 md:grid-cols-4">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm">{t("adminSms.orgsWithBalance")}</CardTitle>
          </CardHeader>
          <CardContent className="text-2xl font-semibold">{totals?.organizations ?? 0}</CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm">{t("adminSms.totalBalance")}</CardTitle>
          </CardHeader>
          <CardContent className="text-2xl font-semibold">
            ${((totals?.total_balance_cents ?? 0) / 100).toFixed(2)}
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm">{t("adminSms.recentMessages")}</CardTitle>
          </CardHeader>
          <CardContent className="text-2xl font-semibold">{totals?.messages_sent ?? 0}</CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm">{t("adminSms.recentSpend")}</CardTitle>
          </CardHeader>
          <CardContent className="text-2xl font-semibold">
            ${((totals?.total_sms_spend_cents ?? 0) / 100).toFixed(2)}
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">{t("adminSms.balancesTitle")}</CardTitle>
          <CardDescription>{t("adminSms.balancesHint")}</CardDescription>
        </CardHeader>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{t("adminSms.colOrganization")}</TableHead>
                <TableHead>{t("adminSms.colBalance")}</TableHead>
                <TableHead>{t("adminSms.colEstimatedSms")}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {(data?.balances ?? []).length === 0 ? (
                <TableRow>
                  <TableCell colSpan={3} className="h-16 text-center text-muted-foreground">
                    {t("adminSms.noBalances")}
                  </TableCell>
                </TableRow>
              ) : (
                (data?.balances ?? []).map((row) => {
                  const org = row.organizations;
                  const balance = Number(row.balance_cents || 0);
                  return (
                    <TableRow key={row.id}>
                      <TableCell>{org?.name ?? row.organization_id}</TableCell>
                      <TableCell>${(balance / 100).toFixed(2)}</TableCell>
                      <TableCell>{Math.floor(balance / 30)}</TableCell>
                    </TableRow>
                  );
                })
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">{t("adminSms.messagesTitle")}</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{t("adminSms.colOrganization")}</TableHead>
                <TableHead>{t("adminSms.colLead")}</TableHead>
                <TableHead>{t("adminSms.colPhone")}</TableHead>
                <TableHead>{t("adminSms.colStatus")}</TableHead>
                <TableHead>{t("adminSms.colCost")}</TableHead>
                <TableHead>{t("adminSms.colSentAt")}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {(data?.recent_messages ?? []).length === 0 ? (
                <TableRow>
                  <TableCell colSpan={6} className="h-16 text-center text-muted-foreground">
                    {t("adminSms.noMessages")}
                  </TableCell>
                </TableRow>
              ) : (
                (data?.recent_messages ?? []).map((msg) => {
                  const org = msg.organizations;
                  const lead = msg.customer_leads;
                  const leadName = lead
                    ? `${lead.first_name ?? ""} ${lead.last_name ?? ""}`.trim()
                    : "";
                  return (
                    <TableRow key={msg.id}>
                      <TableCell>{org?.name ?? msg.organization_id}</TableCell>
                      <TableCell>{leadName || "-"}</TableCell>
                      <TableCell className="font-mono text-xs">{msg.to_phone}</TableCell>
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
    </div>
  );
}
