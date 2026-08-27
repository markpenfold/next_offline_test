"use client";

import React, { useEffect, useState } from "react";
import { useDATAStore } from "@/stores/useDataStore";
import { useUIStore } from "@/stores/useUIStore";
import styles from "./helpers.module.css";

export function ProjectFinderModal() {
  // Data Store
  const accountId = useDATAStore((state) => state.accountId);
  const localProjects = useDATAStore((state) => state.localProjects);
  const refreshLocalProjects = useDATAStore((state) => state.refreshLocalProjects);
  const loadNamedProject = useDATAStore((state) => state.loadNamedProject);

  // UI Store
  const finderIsOpen = useUIStore((state) => state.finderIsOpen);
  const setFinderOpen = useUIStore((state) => state.setFinderOpen);

  const [searchTerm, setSearchTerm] = useState("");
  const [isLoading, setIsLoading] = useState(true);
  const [loadingProject, setLoadingProject] = useState<string | null>(null);

  const handleClose = () => setFinderOpen(false);

  // Fetch fresh OPFS project listings whenever the modal opens
  useEffect(() => {
    if (finderIsOpen && accountId) {
      setIsLoading(true);
      refreshLocalProjects(accountId).finally(() => setIsLoading(false));
    }
  }, [finderIsOpen, accountId, refreshLocalProjects]);

  if (!finderIsOpen) return null;

  // Filter projects stored in Zustand
  const filteredProjects = localProjects.filter((p) =>
    p.name.toLowerCase().includes(searchTerm.toLowerCase())
  );

  // Delegate project loading to `loadNamedProject`
  const handleSelect = async (projectName: string) => {
    if (!accountId) return;
    try {
      setLoadingProject(projectName);
      await loadNamedProject(projectName, accountId);
      handleClose();
    } catch (err) {
      console.error("Failed to load project via store:", err);
    } finally {
      setLoadingProject(null);
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
            <h2 className={styles.title}>Open Local Project</h2>
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
              placeholder="Search local projects..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className={styles.searchInput}
            />
          </div>
        </div>

        {/* Project List */}
        <div className={styles.projectList}>
          {isLoading ? (
            <div className={styles.emptyState}>
              <div className={styles.spinner} />
              <span>Scanning OPFS storage...</span>
            </div>
          ) : filteredProjects.length === 0 ? (
            <div className={styles.emptyState}>
              <span>{searchTerm ? "No matching projects found." : "No saved projects in OPFS storage."}</span>
            </div>
          ) : (
            filteredProjects.map((project) => (
              <div
                key={project.name}
                onClick={() => handleSelect(project.name)}
                className={styles.projectCard}
              >
                <div className={styles.projectInfo}>
                  <span className={styles.projectName}>{project.name}</span>
                </div>

                <button className={styles.loadButton}>
                  {loadingProject === project.name ? (
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