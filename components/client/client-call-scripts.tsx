"use client";

import { useState } from "react";
import { toast } from "sonner";
import { ClipboardCopy, FileText, Pencil, Plus, Trash2 } from "lucide-react";
import {
  useCreateCallScriptMutation,
  useDeleteCallScriptMutation,
  useGetCallScriptsQuery,
  useGetClientMeQuery,
  useUpdateCallScriptMutation,
} from "@/lib/api/client-api";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { useI18n } from "@/components/providers/i18n-provider";

export function ClientCallScripts() {
  const { t } = useI18n();
  const { data: me } = useGetClientMeQuery();
  const { data: scripts, isLoading } = useGetCallScriptsQuery();
  const [createScript, { isLoading: creating }] = useCreateCallScriptMutation();
  const [updateScript, { isLoading: updating }] = useUpdateCallScriptMutation();
  const [deleteScript] = useDeleteCallScriptMutation();

  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [title, setTitle] = useState("");
  const [content, setContent] = useState("");
  const [viewScriptId, setViewScriptId] = useState<string | null>(null);

  const isAdmin = me?.role === "customer_admin" && me?.is_active;
  const activeView = (scripts ?? []).find((s) => s.id === viewScriptId) ?? null;

  function openCreate() {
    setEditingId(null);
    setTitle("");
    setContent("");
    setDialogOpen(true);
  }

  function openEdit(id: string) {
    const script = (scripts ?? []).find((s) => s.id === id);
    if (!script) return;
    setEditingId(id);
    setTitle(script.title);
    setContent(script.content);
    setDialogOpen(true);
  }

  async function saveScript(e: React.FormEvent) {
    e.preventDefault();
    if (!isAdmin) {
      toast.error(t("clientCallScripts.adminOnly"));
      return;
    }
    try {
      if (editingId) {
        await updateScript({ id: editingId, title: title.trim(), content: content.trim() }).unwrap();
        toast.success(t("clientCallScripts.updated"));
      } else {
        await createScript({ title: title.trim(), content: content.trim() }).unwrap();
        toast.success(t("clientCallScripts.created"));
      }
      setDialogOpen(false);
    } catch (err: unknown) {
      const msg =
        err && typeof err === "object" && "data" in err
          ? String((err as { data?: unknown }).data)
          : t("clientCallScripts.saveFailed");
      toast.error(msg);
    }
  }

  async function removeScript(id: string) {
    try {
      await deleteScript({ id }).unwrap();
      if (viewScriptId === id) setViewScriptId(null);
      toast.success(t("clientCallScripts.deleted"));
    } catch {
      toast.error(t("clientCallScripts.deleteFailed"));
    }
  }

  async function copyScript(text: string) {
    try {
      await navigator.clipboard.writeText(text);
      toast.success(t("clientCallScripts.copied"));
    } catch {
      toast.error(t("clientCallScripts.copyFailed"));
    }
  }

  return (
    <div className="flex flex-1 flex-col gap-6 p-6 lg:p-8">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div className="space-y-1">
          <h1 className="text-2xl font-semibold tracking-tight">{t("clientCallScripts.title")}</h1>
          <p className="text-sm text-muted-foreground">{t("clientCallScripts.subtitle")}</p>
        </div>
        {isAdmin ? (
          <Button onClick={openCreate}>
            <Plus className="mr-2 size-4" />
            {t("clientCallScripts.addScript")}
          </Button>
        ) : null}
      </header>

      <div className="grid gap-4 lg:grid-cols-[320px_1fr]">
        <Card className="border-border/70 bg-card/50">
          <CardHeader>
            <CardTitle className="text-base">{t("clientCallScripts.scriptList")}</CardTitle>
            <CardDescription>{t("clientCallScripts.scriptListHint")}</CardDescription>
          </CardHeader>
          <CardContent className="space-y-2">
            {isLoading ? (
              <p className="text-sm text-muted-foreground">{t("clientCallScripts.loading")}</p>
            ) : (scripts ?? []).length === 0 ? (
              <p className="text-sm text-muted-foreground">{t("clientCallScripts.empty")}</p>
            ) : (
              (scripts ?? []).map((script) => (
                <button
                  key={script.id}
                  type="button"
                  onClick={() => setViewScriptId(script.id)}
                  className={`flex w-full items-center gap-2 rounded-lg border px-3 py-2 text-left text-sm transition-colors ${
                    viewScriptId === script.id
                      ? "border-primary/50 bg-primary/10 text-primary"
                      : "border-border/70 hover:bg-muted/40"
                  }`}
                >
                  <FileText className="size-4 shrink-0" />
                  <span className="truncate font-medium">{script.title}</span>
                </button>
              ))
            )}
          </CardContent>
        </Card>

        <Card className="border-border/70 bg-card/50">
          <CardHeader>
            <CardTitle className="text-base">{t("clientCallScripts.scriptContent")}</CardTitle>
          </CardHeader>
          <CardContent>
            {!activeView ? (
              <p className="text-sm text-muted-foreground">{t("clientCallScripts.selectScript")}</p>
            ) : (
              <div className="space-y-4">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <h2 className="text-lg font-semibold">{activeView.title}</h2>
                  <div className="flex gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => void copyScript(activeView.content)}
                    >
                      <ClipboardCopy className="mr-2 size-4" />
                      {t("clientCallScripts.copy")}
                    </Button>
                    {isAdmin ? (
                      <>
                        <Button variant="outline" size="sm" onClick={() => openEdit(activeView.id)}>
                          <Pencil className="mr-2 size-4" />
                          {t("clientCallScripts.edit")}
                        </Button>
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => void removeScript(activeView.id)}
                        >
                          <Trash2 className="mr-2 size-4" />
                          {t("clientCallScripts.delete")}
                        </Button>
                      </>
                    ) : null}
                  </div>
                </div>
                <pre className="whitespace-pre-wrap rounded-lg border border-border/70 bg-background/50 p-4 text-sm leading-relaxed">
                  {activeView.content}
                </pre>
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>
              {editingId ? t("clientCallScripts.editScript") : t("clientCallScripts.newScript")}
            </DialogTitle>
          </DialogHeader>
          <form onSubmit={(e) => void saveScript(e)} className="space-y-4">
            <div className="space-y-1">
              <Label>{t("clientCallScripts.fieldTitle")}</Label>
              <Input value={title} onChange={(e) => setTitle(e.target.value)} required />
            </div>
            <div className="space-y-1">
              <Label>{t("clientCallScripts.fieldContent")}</Label>
              <Textarea
                value={content}
                onChange={(e) => setContent(e.target.value)}
                rows={14}
                required
                placeholder={t("clientCallScripts.contentPlaceholder")}
              />
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setDialogOpen(false)}>
                {t("clientCallScripts.cancel")}
              </Button>
              <Button type="submit" disabled={creating || updating}>
                {t("clientCallScripts.save")}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
