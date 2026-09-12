"use client";

import React, { useEffect, useState } from "react";
import { useEditorStore } from "@/stores/useEditorStore";
import { useAppStore } from "@/providers/AppStoreProvider";
import { getOPFSEntries } from "@/components/data/diskOPFS";
import styles from "./helpers.module.css";

interface DraftSaveModalProps {
  isOpen: boolean;
  onClose: () => void;
  editor: any;
}

export function DraftSaveModal({ isOpen, onClose, editor }: DraftSaveModalProps) {
  const activeAccount = useAppStore((state) => state.activeAccount);
  const user = useAppStore((state) => state.userId);

  const title = useEditorStore((state) => state.title);
  const setTitle = useEditorStore((state) => state.setTitle);
  const setDraftId = useEditorStore((state) => state.setDraftId);
  const persistCurrentDraft = useEditorStore((state) => state.persistCurrentDraft);

  const [draftName, setDraftName] = useState("");
  const [existingDrafts, setExistingDrafts] = useState<string[]>([]);
  const [isSaving, setIsSaving] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  useEffect(() => {
    if (!isOpen) return;

    setDraftName(title || "");
    setErrorMessage(null);

    // Fetch existing draft folders to detect duplicate/overwrite cases
    getOPFSEntries("publishing/drafts")
      .then((entries) => {
        setExistingDrafts(entries.filter((e) => (e.handle as FileSystemHandle).kind === "directory").map((e) => e.name));
      })
      .catch(() => setExistingDrafts([]));
  }, [isOpen, title]);

  if (!isOpen) return null;

  const trimmedName = draftName.trim();
  const slugifiedId = trimmedName.toLowerCase().replace(/[^a-z0-9]+/g, "-");
  const nameExists = existingDrafts.includes(slugifiedId);

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!trimmedName || !user || !activeAccount?.id || !editor) return;

    try {
      setIsSaving(true);
      setErrorMessage(null);

      // Apply chosen title & slug-based draft directory ID
      setTitle(trimmedName);
      setDraftId(slugifiedId);

      const success = await persistCurrentDraft(
        { userId: user, accountId: activeAccount.id },
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
              <path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z"></path>
              <polyline points="17 21 17 13 7 13 7 21"></polyline>
              <polyline points="7 3 7 8 15 8"></polyline>
            </svg>
            <h2 className={styles.title}>Save Draft</h2>
          </div>
          <button onClick={onClose} className={styles.closeButton}>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <line x1="18" y1="6" x2="6" y2="18"></line>
              <line x1="6" y1="6" x2="18" y2="18"></line>
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

            {nameExists && (
              <div style={{ marginTop: "0.75rem", fontSize: "0.75rem", color: "#f97316" }}>
                ℹ️ A draft named <strong>"{trimmedName}"</strong> already exists in local storage. Saving will overwrite it.
              </div>
            )}

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
                {isSaving ? (
                  <div className={styles.spinner} />
                ) : nameExists ? (
                  "Overwrite & Save"
                ) : (
                  "Save Draft"
                )}
              </button>
            </div>
          </div>
        </form>
      </div>
    </div>
  );
}