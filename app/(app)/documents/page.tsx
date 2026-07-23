"use client";

import { useEffect, useState } from "react";
import { Plus, Upload, LayoutTemplate, Download, Check, X, Eye, EyeOff, Trash2 } from "lucide-react";
import { supabase } from "@/lib/supabase";
import type { Document, Client } from "@/lib/types";
import StatusPill from "@/components/StatusPill";
import RequestDocumentModal from "@/components/RequestDocumentModal";
import UploadDocumentModal from "@/components/UploadDocumentModal";
import ApplyDocumentTemplateModal from "@/components/ApplyDocumentTemplateModal";

type DocumentRow = Document & { clientName: string };

export default function DocumentsPage() {
  const [docs, setDocs] = useState<DocumentRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showRequest, setShowRequest] = useState(false);
  const [showUpload, setShowUpload] = useState(false);
  const [showTemplate, setShowTemplate] = useState(false);
  const [statusFilter, setStatusFilter] = useState<string>("all");

  async function load() {
    setLoading(true);
    const { data, error } = await supabase
      .from("documents")
      .select("*")
      .order("created_at", { ascending: false });

    if (error) {
      setError(error.message);
      setLoading(false);
      return;
    }

    const list = (data as Document[]) ?? [];
    const clientIds = Array.from(new Set(list.map((d) => d.client_id)));
    let clientsMap = new Map<string, string>();
    if (clientIds.length > 0) {
      const { data: clientsData } = await supabase
        .from("clients")
        .select("id, first_name, last_name, business_name, client_type")
        .in("id", clientIds);
      (clientsData as Client[] | null)?.forEach((c) => {
        const name =
          c.client_type === "business" && c.business_name
            ? c.business_name
            : `${c.first_name} ${c.last_name}`.trim();
        clientsMap.set(c.id, name);
      });
    }

    setDocs(list.map((d) => ({ ...d, clientName: clientsMap.get(d.client_id) ?? "—" })));
    setError(null);
    setLoading(false);
  }

  useEffect(() => {
    load();
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") return;
    if (new URLSearchParams(window.location.search).get("new") === "1") {
      setShowRequest(true);
      window.history.replaceState(null, "", window.location.pathname);
    }
  }, []);

  async function handleDownload(doc: Document) {
    if (!doc.storage_path) return;
    const { data, error } = await supabase.storage
      .from("verexahq-client-documents")
      .createSignedUrl(doc.storage_path, 60);
    if (error || !data) {
      setError(error?.message ?? "Could not generate download link.");
      return;
    }
    window.open(data.signedUrl, "_blank");
  }

  async function handleAccept(doc: Document) {
    const { error } = await supabase.rpc("accept_client_document", { p_document_id: doc.id });
    if (!error) load();
    else setError(error.message);
  }

  async function handleReject(doc: Document) {
    const reason = window.prompt("Reason for rejecting this document?");
    if (!reason) return;
    const { error } = await supabase.rpc("reject_client_document", {
      p_document_id: doc.id,
      p_rejection_reason: reason,
    });
    if (!error) load();
    else setError(error.message);
  }

  async function toggleVisibility(doc: Document) {
    const { error } = await supabase
      .from("documents")
      .update({ is_visible_to_client: !doc.is_visible_to_client })
      .eq("id", doc.id);
    if (!error) load();
  }

  async function handleDelete(doc: Document) {
    if (!window.confirm(`Delete "${doc.document_name}"? This can't be undone.`)) return;
    if (doc.storage_path) {
      await supabase.storage.from("verexahq-client-documents").remove([doc.storage_path]);
    }
    const { error } = await supabase.from("documents").delete().eq("id", doc.id);
    if (!error) load();
    else setError(error.message);
  }

  const visible = docs.filter((d) => statusFilter === "all" || d.document_status === statusFilter);
  const statuses = Array.from(new Set(docs.map((d) => d.document_status)));

  return (
    <div>
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between mb-4 border-b border-line pb-3">
        <div>
          <div className="text-[11px] uppercase tracking-widest text-muted font-semibold mb-1">
            Client Files
          </div>
          <h1 className="font-slab text-2xl font-bold text-ink">Documents</h1>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <button
            onClick={() => setShowTemplate(true)}
            className="flex items-center gap-1.5 text-xs font-semibold px-3 py-1.5 rounded-sm border border-line text-ink"
          >
            <LayoutTemplate size={13} /> Apply Template
          </button>
          <button
            onClick={() => setShowRequest(true)}
            className="flex items-center gap-1.5 text-xs font-semibold px-3 py-1.5 rounded-sm border border-line text-ink"
          >
            <Plus size={13} /> Request
          </button>
          <button
            onClick={() => setShowUpload(true)}
            className="flex items-center gap-1.5 bg-ink text-white text-sm font-semibold px-3.5 py-2 rounded-sm hover:bg-[#14273A] transition-colors"
          >
            <Upload size={15} /> Upload
          </button>
        </div>
      </div>

      {error && (
        <div className="text-sm text-brick bg-brick/10 border border-brick/30 rounded-sm px-4 py-3 mb-4">
          {error}
        </div>
      )}

      {statuses.length > 0 && (
        <div className="flex flex-wrap gap-2 mb-4">
          <button
            onClick={() => setStatusFilter("all")}
            className="text-xs font-semibold px-3 py-1.5 rounded-sm border"
            style={{
              borderColor: statusFilter === "all" ? "#0D1B2A" : "#DDE3EC",
              backgroundColor: statusFilter === "all" ? "#0D1B2A" : "white",
              color: statusFilter === "all" ? "white" : "#0D1B2A",
            }}
          >
            All
          </button>
          {statuses.map((s) => (
            <button
              key={s}
              onClick={() => setStatusFilter(s)}
              className="text-xs font-semibold px-3 py-1.5 rounded-sm border"
              style={{
                borderColor: statusFilter === s ? "#0D1B2A" : "#DDE3EC",
                backgroundColor: statusFilter === s ? "#0D1B2A" : "white",
                color: statusFilter === s ? "white" : "#0D1B2A",
              }}
            >
              {s}
            </button>
          ))}
        </div>
      )}

      <div className="bg-white border border-line rounded-sm divide-y divide-paperDim">
        {loading && <div className="px-5 py-6 text-sm text-muted">Loading documents…</div>}
        {!loading && visible.length === 0 && (
          <div className="px-5 py-6 text-sm text-muted">No documents yet.</div>
        )}
        {visible.map((d) => (
          <div key={d.id} className="flex items-center justify-between px-5 py-3.5">
            <div>
              <div className="font-semibold text-ink text-sm">{d.document_name}</div>
              <div className="text-xs text-muted mt-0.5">
                {d.clientName} {d.document_category ? `· ${d.document_category}` : ""}
              </div>
            </div>
            <div className="flex items-center gap-3">
              <StatusPill status={d.document_status} />
              <button
                onClick={() => toggleVisibility(d)}
                className="text-muted hover:text-ink"
                title={d.is_visible_to_client ? "Visible to client" : "Hidden from client"}
              >
                {d.is_visible_to_client ? <Eye size={15} /> : <EyeOff size={15} />}
              </button>
              {d.storage_path && (
                <button onClick={() => handleDownload(d)} className="text-muted hover:text-ink">
                  <Download size={15} />
                </button>
              )}
              {["Received", "Under Review", "uploaded", "received"].includes(d.document_status) && (
                <>
                  <button onClick={() => handleAccept(d)} className="text-green hover:opacity-70">
                    <Check size={15} />
                  </button>
                  <button onClick={() => handleReject(d)} className="text-brick hover:opacity-70">
                    <X size={15} />
                  </button>
                </>
              )}
              <button onClick={() => handleDelete(d)} className="text-muted hover:text-brick">
                <Trash2 size={14} />
              </button>
            </div>
          </div>
        ))}
      </div>

      {showRequest && (
        <RequestDocumentModal onClose={() => setShowRequest(false)} onSaved={load} />
      )}
      {showUpload && <UploadDocumentModal onClose={() => setShowUpload(false)} onSaved={load} />}
      {showTemplate && (
        <ApplyDocumentTemplateModal onClose={() => setShowTemplate(false)} onSaved={load} />
      )}
    </div>
  );
}
