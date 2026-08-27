// components/modals/ModalManager.tsx
"use client";

import { useUIStore } from "@/stores/useUIStore";
import { ProjectFinderModal } from "@/components/helpers/ProjectFinderModal";
import { ProjectSaveModal } from "@/components/helpers/ProjectSaveModal";

export function ModalManager() {
  const isFinderOpen = useUIStore((state) => state.finderIsOpen);
  const setFinderOpen = useUIStore((state) => state.setFinderOpen);
  const isSaverOpen = useUIStore((state) => state.saverIsOpen);
  const setSaverOpen = useUIStore((state) => state.setSaverOpen);

  return (
    <>
      <ProjectFinderModal />
      <ProjectSaveModal />
    </>
  );
}