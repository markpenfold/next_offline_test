"use client";

import React, { useEffect, useState } from "react";
import { useEditorStore } from "@/stores/useEditorStore";
import { useAppStore } from "@/providers/AppStoreProvider";
import { getOPFSPosts } from "@/components/data/diskOPFS";
import styles from "./helpers.module.css";

interface NewDocModalProps {
  isOpen: boolean;
  onClose: () => void;
  editor: any;
}

export function NewDocModal({ isOpen, onClose, editor }: NewDocModalProps) {
  const activeAccount = useAppStore((state) => state.activeAccount);
  const user = useAppStore((state) => state.userId);
  const profile = useAppStore((state) => state.profile);

  const setTitle = useEditorStore((state) => state.setLiveTitle);
  const setDraftId = useEditorStore((state) => state.setDraftId);
  const initializeNewDraft = useEditorStore((state) => state.initializeNewDraft);
  const saveCurrentDraft = useEditorStore((state) => state.saveCurrentDraft);

  const [draftName, setDraftName] = useState("");
  const [existingTitles, setExistingTitles] = useState<Set<string>>(new Set());
  const [isSaving, setIsSaving] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  useEffect(() => {
    if (!isOpen) return;

    setDraftName("");
    setErrorMessage(null);

    // Fetch existing posts to warn on identical titles (optional check)
    Promise.all([
      getOPFSPosts("publishing/drafts"),
      getOPFSPosts("publishing/published"),
    ])
      .then(([drafts, published]) => {
        const titles = new Set<string>();
        drafts.forEach((d) => titles.add(d.title.trim().toLowerCase()));
        published.forEach((p) => titles.add(p.title.trim().toLowerCase()));
        setExistingTitles(titles);
      })
      .catch((err) => {
        console.error("Failed to load local post entries:", err);
        setExistingTitles(new Set());
      });
  }, [isOpen]);

  if (!isOpen) return null;

  const trimmedName = draftName.trim();
  const titleExists = existingTitles.has(trimmedName.toLowerCase());

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!trimmedName || !user || !activeAccount?.id || !editor) return;

    try {
      setIsSaving(true);
      setErrorMessage(null);

      // 1. Generate a permanent UUID for this post
      const postUuid = crypto.randomUUID();

      // 2. Clear canvas & set up fresh store state
      initializeNewDraft();
      editor.commands.clearContent();

      // 3. Assign UUID as the draftId folder key
      setDraftId(postUuid);
      setTitle(trimmedName);

      // 4. Save to OPFS under /publishing/drafts/<postUuid>/
      const success = await saveCurrentDraft(
        {
      userId: user,
      accountId: activeAccount.id,
      accountSlug: activeAccount.account_slug,
      name: profile?.display_name || activeAccount.name || activeAccount.account_slug+' Author',
    },
        editor.getHTML()
      );

      if (success) {
        onClose();
      } else {
        setErrorMessage("Failed to create document in storage.");
      }
    } catch (err: any) {
      console.error("Failed to create document:", err);
      setErrorMessage(err?.message || "An error occurred during creation.");
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className={styles.overlay}>
      <div className={styles.modal}>
        <div className={styles.header}>
          <div className={styles.titleGroup}>
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#818cf8" strokeWidth="2">
              <path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z"></path>
              <polyline points="17 21 17 13 7 13 7 21"></polyline>
              <polyline points="7 3 7 8 15 8"></polyline>
            </svg>
            <h2 className={styles.title}>New Document</h2>
          </div>
          <button onClick={onClose} className={styles.closeButton}>✕</button>
        </div>

        <form onSubmit={handleCreate}>
          <div className={styles.searchContainer}>
            <label style={{ display: "block", fontSize: "0.75rem", color: "#a3a3a3", marginBottom: "0.5rem" }}>
              Document Name / Title
            </label>
            <input
              type="text"
              placeholder="e.g. My Next Article"
              value={draftName}
              onChange={(e) => {
                setDraftName(e.target.value);
                if (errorMessage) setErrorMessage(null);
              }}
              className={styles.searchInput}
              style={{ paddingLeft: "0.75rem" }}
              autoFocus
            />

            {titleExists && (
              <div style={{ marginTop: "0.75rem", fontSize: "0.75rem", color: "#f97316" }}>
                ℹ️ Note: You already have a document named <strong>"{trimmedName}"</strong>. Both documents will exist independently under distinct IDs.
              </div>
            )}

            {errorMessage && (
              <div style={{ marginTop: "0.75rem", fontSize: "0.75rem", color: "#ef4444" }}>
                ❌ {errorMessage}
              </div>
            )}
          </div>

          <div className={styles.footer}>
            <span>Destination: Browser OPFS</span>
            <div style={{ display: "flex", gap: "0.5rem" }}>
              <button type="button" onClick={onClose} className={styles.cancelButton}>
                Cancel
              </button>
              <button
                type="submit"
                className={styles.loadButton}
                disabled={!trimmedName || isSaving}
                style={{ padding: "0.375rem 1rem" }}
              >
                {isSaving ? "Creating..." : "Create Document"}
              </button>
            </div>
          </div>
        </form>
      </div>
    </div>
  );
}