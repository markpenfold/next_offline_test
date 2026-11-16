"use client";

import React, { useEffect, useState } from "react";
import { useEditorStore } from "@/stores/useEditorStore";
import { useAppStore } from "@/providers/AppStoreProvider";
import styles from "./helpers.module.css";

interface DraftSaveModalProps {
  isOpen: boolean;
  onClose: () => void;
  editor: any;
}

export function DraftSaveModal({ isOpen, onClose, editor }: DraftSaveModalProps) {
  const activeAccount = useAppStore((state) => state.activeAccount);
  const user = useAppStore((state) => state.userId);
  const profile = useAppStore((s) => s.profile);

  // Grab title and setTitle from editor store alongside saveCurrentDraft
  const title = useEditorStore((state) => state.liveTitle);
  const subTitle = useEditorStore((state) => state.liveSubTitle);
  const setTitle = useEditorStore((state) => state.setLiveTitle);
  const saveCurrentDraft = useEditorStore((state) => state.saveCurrentDraft);
  
  const [draftName, setDraftName] = useState("");
  const [isSaving, setIsSaving] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  useEffect(() => {
    if (!isOpen) return;
    setDraftName(title || "");
    setErrorMessage(null);
  }, [isOpen, title]);

  if (!isOpen) return null;

  const trimmedName = draftName.trim();

  const handleSave = async (e: React.SubmitEvent) => {
    e.preventDefault();
    if (!trimmedName || !user || !activeAccount?.id || !editor) return;

    try {
      setIsSaving(true);
      setErrorMessage(null);

      // Sync user-modified draft name back into store title before saving
      setTitle(trimmedName);

      const success = await saveCurrentDraft(
        {
          userId: user,
          accountId: activeAccount.id,
          name: profile?.display_name || activeAccount.name || "Anon",
          accountSlug: activeAccount.account_slug,
        },
        editor.getHTML()
      );

      if (success) {
        onClose();
      } else {
        setErrorMessage("Failed to write draft to storage.");
      }
    } catch (err: any) {
      console.error("Failed to save draft:", err);
      setErrorMessage(err?.message || "An error occurred while saving.");
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className={styles.overlay}>
      <div className={styles.modal}>
        {/* Header */}
        <div className={styles.header}>
          <div className={styles.titleGroup}>
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#818cf8" strokeWidth="2">
              <path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z" />
              <polyline points="17 21 17 13 7 13 7 21" />
              <polyline points="7 3 7 8 15 8" />
            </svg>
            <h2 className={styles.title}>Save Draft</h2>
          </div>
          <button onClick={onClose} className={styles.closeButton}>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <line x1="18" y1="6" x2="6" y2="18" />
              <line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
        </div>

        {/* Save Form */}
        <form onSubmit={handleSave}>
          <div className={styles.searchContainer}>
            <label style={{ display: "block", fontSize: "0.75rem", color: "#a3a3a3", marginBottom: "0.5rem" }}>
              Draft Name / Title
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

            {errorMessage && (
              <div style={{ marginTop: "0.75rem", fontSize: "0.75rem", color: "#ef4444" }}>
                ❌ {errorMessage}
              </div>
            )}
          </div>

          {/* Footer */}
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
                {isSaving ? <div className={styles.spinner} /> : "Save Draft"}
              </button>
            </div>
          </div>
        </form>
      </div>
    </div>
  );
}