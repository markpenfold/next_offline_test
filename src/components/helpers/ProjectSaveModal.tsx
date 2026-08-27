"use client";

import React, { useEffect, useState } from "react";
import { useDATAStore } from "@/stores/useDataStore";
import { useUIStore } from "@/stores/useUIStore";
import styles from "./helpers.module.css";

interface ProjectSaveModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export function ProjectSaveModal({ isOpen, onClose }: ProjectSaveModalProps) {
  const accountId = useDATAStore((state) => state.accountId);
  const localProjects = useDATAStore((state) => state.localProjects);
  const activeProjectName = useDATAStore((state) => state.activeProjectName);
  const activeDataViewIndexes = useDATAStore((state) => state.activeDataViewIndexes);
  
  const saveCurrentProjectAs = useDATAStore((state) => state.saveCurrentProjectAs);
  const refreshLocalProjects = useDATAStore((state) => state.refreshLocalProjects);
  const createNewProject = useDATAStore((state) => state.createNewProject);
  // Check if UI store has active builder events
  const builderEvents = useUIStore((state) => state.timelineBuilderEvents);

  const [projectName, setProjectName] = useState("");
  const [isSaving, setIsSaving] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // Sync input value with current active project name on open
  useEffect(() => {
    if (isOpen) {
      setProjectName(activeProjectName || "");
      setErrorMessage(null);
      if (accountId) {
        refreshLocalProjects(accountId);
      }
    }
  }, [isOpen, activeProjectName, accountId, refreshLocalProjects]);

  if (!isOpen) return null;

  const trimmedName = projectName.trim();
  
  // Check session state for existing data
  const hasActiveContent = 
    (activeDataViewIndexes && activeDataViewIndexes.length > 0) || 
    (builderEvents && builderEvents.length > 0);

  // Check if target name already exists in OPFS
  const nameExists = localProjects.some(
    (p) => p.name.toLowerCase() === trimmedName.toLowerCase()
  );

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!trimmedName || !accountId) return;

    try {
      setIsSaving(true);
      setErrorMessage(null);

      // Execute store save procedure
      await saveCurrentProjectAs(trimmedName, accountId);
      await refreshLocalProjects(accountId);
      
      onClose();
    } catch (err: any) {
      console.error("Failed to save project:", err);
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
            <h2 className={styles.title}>Save Project</h2>
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
              Project Title
            </label>
            <input
              type="text"
              placeholder="e.g. Bronze Age Timeline"
              value={projectName}
              onChange={(e) => {
                setProjectName(e.target.value);
                if (errorMessage) setErrorMessage(null);
              }}
              className={styles.searchInput}
              style={{ paddingLeft: "0.75rem" }}
              autoFocus
            />

            {/* Empty Session Warning */}
            {!hasActiveContent && (
              <div style={{ marginTop: "0.75rem", fontSize: "0.75rem", color: "#eab308" }}>
                ⚠️ Current session has no active timeline slots or builder events. Saving will create an empty project file.
              </div>
            )}

            {/* Existing File Collision Warning */}
            {nameExists && (
              <div style={{ marginTop: "0.75rem", fontSize: "0.75rem", color: "#f97316" }}>
                ℹ️ A project named <strong>"{trimmedName}"</strong> already exists in local storage. Saving will overwrite it.
              </div>
            )}

            {/* Error Display */}
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
                  "Save Project"
                )}
              </button>
            </div>
          </div>
        </form>

      </div>
    </div>
  );
}