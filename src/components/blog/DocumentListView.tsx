import React from 'react'
import { BlogPost } from '@/components/blog/blogHelpers'
import styles from '@/app/styles/editor.module.css'

interface DocumentListViewProps {
  title: string
  items: BlogPost[]
  onSelect: (slug: string) => void
  emptyMessage: string
}

export const DocumentListView: React.FC<DocumentListViewProps> = ({
  title,
  items,
  onSelect,
  emptyMessage,
}) => {
  return (
  <div className="pageContainer p24 mw750">
    <header className={styles.header}>
      <h1>{title}</h1>
    </header>

    {items.length === 0 ? (
      <div className={styles.emptyState}>{emptyMessage}</div>
    ) : (
      <div className={styles.tableWrapper}>
        {/* Table Column Headers */}
        <div className={styles.listHeader}>
          <span className={styles.headerTitle}>Title</span>
          <span className={styles.headerDate}>Last edited</span>
        </div>

        <ul className={styles.list}>
          {items.map((item) => (
            <li 
              key={item.id} 
              className={styles.row}
              onClick={() => onSelect(item.id)}
            >
              <span className={styles.docTitle}>{item.title}</span>
              <span className={styles.docDate}>
                {new Date(item.dateLastEdited).toLocaleDateString(undefined, {
                  year: 'numeric',
                  month: 'short',
                  day: 'numeric',
                })}
              </span>
            </li>
          ))}
        </ul>
      </div>
    )}
  </div>
)
}