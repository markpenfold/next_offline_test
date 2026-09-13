"use client";

import React, { useEffect, useState } from "react";
import { useEditorStore } from "@/stores/useEditorStore";
import styles from "./helpers.module.css";

export function DraftFinderModal({ editor }: { editor: any }) {
  // Pull state and actions directly from the store
  const isDrawerOpen = useEditorStore((state) => state.isDrawerOpen);
  const setIsDrawerOpen = useEditorStore((state) => state.setIsDrawerOpen);
  const availableDrafts = useEditorStore((state) => state.availableDrafts);
  const isLoadingDrafts = useEditorStore((state) => state.isLoadingDrafts);
  const fetchAvailableDrafts = useEditorStore((state) => state.fetchAvailableDrafts);
  const loadExistingDraft = useEditorStore((state) => state.loadExistingDraft);

  const [searchTerm, setSearchTerm] = useState("");
  const [loadingDraftId, setLoadingDraftId] = useState<string | null>(null);

  const handleClose = () => setIsDrawerOpen(false);

  // Fetch drafts via store when the modal opens
  useEffect(() => {
    if (isDrawerOpen) {
      fetchAvailableDrafts((purgedSlug) => {
        console.warn(`[OPFS Cleanup] Automatically purged broken draft: ${purgedSlug}`);
      });
    }
  }, [isDrawerOpen, fetchAvailableDrafts]);

  if (!isDrawerOpen) return null;

  // Filter drafts by human-readable title or directory slug
  const filteredDrafts = availableDrafts.filter(
    (d) =>
      d.title.toLowerCase().includes(searchTerm.toLowerCase()) ||
      d.slug.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const handleSelect = async (slug: string) => {
    try {
      setLoadingDraftId(slug);
      const htmlContent = await loadExistingDraft(slug);
      if (htmlContent && editor) {
        editor.commands.setContent(htmlContent);
      }
      handleClose();
    } catch (err) {
      console.error("Failed to load draft:", err);
    } finally {
      setLoadingDraftId(null);
    }
  };

  return (
    <div className={styles.overlay}>
      <div className={styles.modal}>
        {/* Header */}
        <div className={styles.header}>
          <div className={styles.titleGroup}>
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#818cf8" strokeWidth="2">
              <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"></path>
            </svg>
            <h2 className={styles.title}>Open Saved Draft</h2>
          </div>
          <button onClick={handleClose} className={styles.closeButton}>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <line x1="18" y1="6" x2="6" y2="18"></line>
              <line x1="6" y1="6" x2="18" y2="18"></line>
            </svg>
          </button>
        </div>

        {/* Search */}
        <div className={styles.searchContainer}>
          <div className={styles.searchInputWrapper}>
            <svg className={styles.searchIcon} width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <circle cx="11" cy="11" r="8"></circle>
              <line x1="21" y1="21" x2="16.65" y2="16.65"></line>
            </svg>
            <input
              type="text"
              placeholder="Search local drafts..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className={styles.searchInput}
            />
          </div>
        </div>

        {/* Draft List */}
        <div className={styles.projectList}>
          {isLoadingDrafts ? (
            <div className={styles.emptyState}>
              <div className={styles.spinner} />
              <span>Scanning OPFS drafts...</span>
            </div>
          ) : filteredDrafts.length === 0 ? (
            <div className={styles.emptyState}>
              <span>{searchTerm ? "No matching drafts found." : "No saved drafts in OPFS storage."}</span>
            </div>
          ) : (
            filteredDrafts.map((draft) => (
              <div
                key={draft.slug}
                onClick={() => handleSelect(draft.slug)}
                className={styles.projectCard}
              >
                <div className={styles.projectInfo}>
                  <span className={styles.projectName}>{draft.title}</span>
                </div>

                <button className={styles.loadButton}>
                  {loadingDraftId === draft.slug ? (
                    <div className={styles.spinner} />
                  ) : (
                    "Load"
                  )}
                </button>
              </div>
            ))
          )}
        </div>

        {/* Footer */}
        <div className={styles.footer}>
          <span>Storage: Browser OPFS</span>
          <button onClick={handleClose} className={styles.cancelButton}>
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
}