import { useEditorStore, } from '@/stores/useEditorStore'
import styles from './templates.module.css'
import {TemplateId} from './blogHelpers'
interface TemplateOption {
  id: TemplateId
  name: string
  diagram: React.ReactNode
}

export const TEMPLATES: TemplateOption[] = [
  {
    id: 'simple-blog',
    name: 'Simple Blog',
    diagram: (
      <svg viewBox="0 0 40 60" className={styles.diagramSvg}>
        <rect x="4" y="4" width="32" height="14" fill="currentColor" rx="1" />
        <rect x="8" y="22" width="24" height="22" fill="currentColor" opacity="0.6" rx="1" />
        <rect x="4" y="48" width="14" height="8" fill="currentColor" opacity="0.3" rx="1" />
        <rect x="22" y="48" width="14" height="8" fill="currentColor" opacity="0.3" rx="1" />
      </svg>
    ),
  },
  {
    id: 'newsprint',
    name: 'Newsprint',
    diagram: (
      <svg viewBox="0 0 40 60" className={styles.diagramSvg}>
        <rect x="4" y="4" width="32" height="6" fill="currentColor" rx="1" />
        <rect x="4" y="12" width="32" height="10" fill="currentColor" opacity="0.8" rx="1" />
        <rect x="4" y="24" width="15" height="32" fill="currentColor" opacity="0.5" rx="1" />
        <rect x="21" y="24" width="15" height="32" fill="currentColor" opacity="0.5" rx="1" />
      </svg>
    ),
  },
  {
    id: 'split-screen',
    name: 'Split Screen',
    diagram: (
      <svg viewBox="0 0 40 60" className={styles.diagramSvg}>
        <rect x="4" y="4" width="15" height="52" fill="currentColor" rx="1" />
        <rect x="21" y="4" width="15" height="24" fill="currentColor" opacity="0.6" rx="1" />
        <rect x="21" y="30" width="15" height="26" fill="currentColor" opacity="0.4" rx="1" />
      </svg>
    ),
  },
  {
    id: 'super-clean',
    name: 'Super Clean',
    diagram: (
      <svg viewBox="0 0 40 60" className={styles.diagramSvg}>
        <circle cx="8" cy="8" r="3" fill="currentColor" />
        <rect x="14" y="6" width="22" height="4" fill="currentColor" opacity="0.5" rx="1" />
        <rect x="4" y="16" width="32" height="16" fill="currentColor" opacity="0.8" rx="1" />
        <rect x="4" y="36" width="32" height="20" fill="currentColor" opacity="0.4" rx="1" />
      </svg>
    ),
  },
]

export function TemplatePicker() {
  const currentTemplate = useEditorStore((s) => s.templateId)
  const setTemplateId = useEditorStore((s) => s.setTemplateId)

  return (
    <div className={styles.pickerContainer}>
      <span className={styles.label}>Layout Template</span>
      <div className={styles.grid}>
        {TEMPLATES.map((tmpl) => (
          <button
            key={tmpl.id}
            type="button"
            onClick={() => setTemplateId(tmpl.id)}
            className={`${styles.card} ${currentTemplate === tmpl.id ? styles.activeCard : ''}`}
            title={tmpl.name}
          >
            <div className={styles.diagramWrapper}>{tmpl.diagram}</div>
            <span className={styles.templateName}>{tmpl.name}</span>
          </button>
        ))}
      </div>
    </div>
  )
}