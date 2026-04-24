"use client";

import { useGetCustomerAuditLogsQuery } from "@/lib/api/client-api";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { useI18n } from "@/components/providers/i18n-provider";

export function ClientActivity() {
  const { t } = useI18n();
  const { data: logs, isLoading, isError } = useGetCustomerAuditLogsQuery();

  if (isError) {
    return <div className="p-8 text-destructive">{t("clientActivity.couldNotLoad")}</div>;
  }

  return (
    <div className="flex flex-1 flex-col gap-6 p-6 lg:p-8">
      <header className="space-y-1">
        <h1 className="text-2xl font-semibold tracking-tight">{t("clientActivity.title")}</h1>
        <p className="text-sm text-muted-foreground">
          {t("clientActivity.subtitle")}
        </p>
      </header>

      <Card className="border-border/70 bg-card/50">
        <CardHeader>
          <CardTitle className="text-base">{t("clientActivity.auditLog")}</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{t("clientActivity.when")}</TableHead>
                <TableHead>{t("clientActivity.action")}</TableHead>
                <TableHead>{t("clientActivity.entity")}</TableHead>
                <TableHead>{t("clientActivity.details")}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading ? (
                <TableRow>
                  <TableCell colSpan={4} className="h-16 text-center">
                    {t("clientActivity.loading")}
                  </TableCell>
                </TableRow>
              ) : (logs ?? []).length === 0 ? (
                <TableRow>
                  <TableCell colSpan={4} className="h-16 text-center text-muted-foreground">
                    {t("clientActivity.empty")}
                  </TableCell>
                </TableRow>
              ) : (
                (logs ?? []).map((log) => (
                  <TableRow key={log.id}>
                    <TableCell className="whitespace-nowrap text-muted-foreground">
                      {new Date(log.created_at).toLocaleString()}
                    </TableCell>
                    <TableCell>
                      <Badge variant="outline">{log.action}</Badge>
                    </TableCell>
                    <TableCell className="text-muted-foreground">
                      {log.entity_type}
                      {log.entity_id ? ` · ${log.entity_id.slice(0, 8)}…` : ""}
                    </TableCell>
                    <TableCell className="max-w-md truncate font-mono text-xs text-muted-foreground">
                      {JSON.stringify(log.details ?? {})}
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
