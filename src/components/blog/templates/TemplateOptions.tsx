import React, { ReactNode } from 'react'
import styles from '@/app/styles/editor.module.css'
import { TemplateId } from '@/components/blog/blogHelpers'

export interface TemplateOption {
  id: TemplateId
  name: string
  diagram: ReactNode
}

export const TEMPLATE_OPTIONS: TemplateOption[] = [
  {
    id: 'simple-blog',
    name: 'Simple Blog',
    diagram: (
      <svg viewBox="0 0 40 50" className={styles.menuDiagramSvg}>
        <rect x="4" y="4" width="32" height="10" fill="currentColor" rx="1" />
        <rect x="8" y="18" width="24" height="18" fill="currentColor" opacity="0.6" rx="1" />
        <rect x="4" y="40" width="14" height="6" fill="currentColor" opacity="0.3" rx="1" />
        <rect x="22" y="40" width="14" height="6" fill="currentColor" opacity="0.3" rx="1" />
      </svg>
    ),
  },
  {
    id: 'newsprint',
    name: 'Newsprint',
    diagram: (
      <svg viewBox="0 0 40 50" className={styles.menuDiagramSvg}>
        <rect x="4" y="4" width="32" height="5" fill="currentColor" rx="1" />
        <rect x="4" y="11" width="32" height="8" fill="currentColor" opacity="0.8" rx="1" />
        <rect x="4" y="21" width="15" height="25" fill="currentColor" opacity="0.5" rx="1" />
        <rect x="21" y="21" width="15" height="25" fill="currentColor" opacity="0.5" rx="1" />
      </svg>
    ),
  },
  {
    id: 'split-screen',
    name: 'Split Screen',
    diagram: (
      <svg viewBox="0 0 40 50" className={styles.menuDiagramSvg}>
        <rect x="4" y="4" width="14" height="42" fill="currentColor" rx="1" />
        <rect x="21" y="4" width="15" height="18" fill="currentColor" opacity="0.6" rx="1" />
        <rect x="21" y="25" width="15" height="21" fill="currentColor" opacity="0.4" rx="1" />
      </svg>
    ),
  },
  {
    id: 'super-clean',
    name: 'Super Clean',
    diagram: (
      <svg viewBox="0 0 40 50" className={styles.menuDiagramSvg}>
        <circle cx="8" cy="7" r="2.5" fill="currentColor" />
        <rect x="13" y="5" width="23" height="3" fill="currentColor" opacity="0.5" rx="1" />
        <rect x="4" y="13" width="32" height="12" fill="currentColor" opacity="0.8" rx="1" />
        <rect x="4" y="28" width="32" height="18" fill="currentColor" opacity="0.4" rx="1" />
      </svg>
    ),
  },
]