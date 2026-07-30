"use client";

import { use, useEffect, useState } from "react";
import { CheckCircle2, FileText, Loader2, ExternalLink } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Logo } from "@/components/logo";
import { signerStatusLabel } from "@/lib/validation/signatures";

type RedeemResponse = {
  request: { id: string; title: string; message: string | null; status: string; signingOrderRequired: boolean };
  signer: { id: string; name: string; email: string; role: string | null; signing_order: number; status: string; signed_at: string | null };
  signers: { id: string; name: string; signing_order: number; status: string }[];
  document: { displayName: string; url: string | null } | null;
};

export default function PortalSignPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = use(params);
  const [state, setState] = useState<"loading" | "ready" | "error" | "done">("loading");
  const [error, setError] = useState<string | null>(null);
  const [data, setData] = useState<RedeemResponse | null>(null);
  const [typedName, setTypedName] = useState("");
  const [agreed, setAgreed] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    let cancelled = false;
    fetch("/api/portal/sign/redeem", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ token }) })
      .then(async (res) => {
        const body = await res.json();
        if (cancelled) return;
        if (!res.ok) {
          setError(body.error ?? "This signing link is invalid or has expired.");
          setState("error");
          return;
        }
        setData(body);
        setTypedName(body.signer.name ?? "");
        setState(body.signer.status === "signed" ? "done" : "ready");
      })
      .catch(() => {
        if (!cancelled) {
          setError("Something went wrong loading this signing link.");
          setState("error");
        }
      });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token]);

  async function submit() {
    if (!data || !typedName.trim() || !agreed) return;
    setSubmitting(true);
    setError(null);
    const res = await fetch("/api/portal/sign/complete", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ token, signerId: data.signer.id, signatureData: { type: "typed", typed_name: typedName.trim(), agreed_at: new Date().toISOString() } }),
    });
    const body = await res.json();
    setSubmitting(false);
    if (!res.ok) {
      setError(body.error ?? "Couldn't record your signature. Please try again.");
      return;
    }
    setState("done");
  }

  return (
    <div className="min-h-screen bg-secondary/40 flex flex-col">
      <div className="bg-brand-gradient h-1.5 w-full" />
      <div className="flex-1 flex flex-col items-center justify-center px-4 py-12">
        <div className="mb-8">
          <Logo />
        </div>
        <div className="w-full max-w-lg">
          {state === "loading" && (
            <Card>
              <CardContent className="py-10 flex items-center justify-center gap-2 text-muted-foreground">
                <Loader2 className="h-5 w-5 animate-spin" /> Loading signing request…
              </CardContent>
            </Card>
          )}

          {state === "error" && (
            <Card>
              <CardHeader>
                <CardTitle>Can&apos;t open this link</CardTitle>
              </CardHeader>
              <CardContent>
                <Alert variant="destructive">
                  <AlertDescription>{error}</AlertDescription>
                </Alert>
                <p className="text-sm text-muted-foreground mt-3">Ask your tax office to resend the signing link if you believe this is a mistake.</p>
              </CardContent>
            </Card>
          )}

          {state === "done" && data && (
            <Card>
              <CardHeader className="items-center text-center">
                <CheckCircle2 className="h-10 w-10 text-success mb-2" />
                <CardTitle>Signed</CardTitle>
                <CardDescription>Thanks, {data.signer.name}. Your signature has been recorded for &ldquo;{data.request.title}&rdquo;.</CardDescription>
              </CardHeader>
            </Card>
          )}

          {state === "ready" && data && (
            <Card>
              <CardHeader>
                <div className="flex items-center justify-between gap-2">
                  <CardTitle>{data.request.title}</CardTitle>
                  <Badge variant="secondary">{signerStatusLabel(data.signer.status)}</Badge>
                </div>
                {data.request.message && <CardDescription>{data.request.message}</CardDescription>}
              </CardHeader>
              <CardContent className="space-y-4">
                {data.document ? (
                  data.document.url ? (
                    <a
                      href={data.document.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex items-center gap-2 rounded-md border border-border p-3 text-sm hover:bg-secondary/50"
                    >
                      <FileText className="h-4 w-4 text-muted-foreground" />
                      <span className="flex-1">{data.document.displayName}</span>
                      <ExternalLink className="h-3.5 w-3.5 text-muted-foreground" />
                    </a>
                  ) : (
                    <p className="text-sm text-muted-foreground">The attached document couldn&apos;t be loaded. Contact your tax office if you need to review it first.</p>
                  )
                ) : (
                  <p className="text-sm text-muted-foreground">No document is attached to this signing request.</p>
                )}

                {data.signers.length > 1 && (
                  <div className="rounded-md border border-border p-3">
                    <p className="text-xs font-medium text-muted-foreground mb-1.5">Signers</p>
                    <ul className="space-y-1 text-sm">
                      {data.signers.map((s) => (
                        <li key={s.id} className="flex items-center justify-between">
                          <span>{s.name}</span>
                          <Badge variant="outline" className="text-[10px]">
                            {signerStatusLabel(s.status)}
                          </Badge>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}

                {error && (
                  <Alert variant="destructive">
                    <AlertDescription>{error}</AlertDescription>
                  </Alert>
                )}

                <div className="space-y-3 rounded-md border border-border p-3">
                  <div className="space-y-1">
                    <Label htmlFor="typedName">Type your full legal name to sign</Label>
                    <Input id="typedName" value={typedName} onChange={(e) => setTypedName(e.target.value)} placeholder={data.signer.name} />
                  </div>
                  <label className="flex items-start gap-2 text-xs text-muted-foreground">
                    <Checkbox checked={agreed} onCheckedChange={(v) => setAgreed(v === true)} className="mt-0.5" />
                    Typing my name above and clicking &ldquo;Sign&rdquo; constitutes my electronic signature and I agree it is legally binding.
                  </label>
                  <Button variant="brand" className="w-full" disabled={!typedName.trim() || !agreed || submitting} onClick={submit}>
                    {submitting && <Loader2 className="h-4 w-4 animate-spin" />}
                    Sign
                  </Button>
                </div>
              </CardContent>
            </Card>
          )}
        </div>
      </div>
    </div>
  );
}
