import React from 'react'
import { LocalPostEntry } from '@/components/data/diskOPFS'
import styles from '@/app/styles/editor.module.css'

interface DocumentListViewProps {
  title: string
  items: LocalPostEntry[]
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
    <div className={styles.container}>
      <header className={styles.header}>
        <h1>{title}</h1>
      </header>

      {items.length === 0 ? (
        <div className={styles.emptyState}>{emptyMessage}</div>
      ) : (
        <ul className={styles.list}>
          {items.map((item) => (
            <li 
              key={item.slug} 
              className={styles.row}
              onClick={() => onSelect(item.slug)}
            >
              <span className={styles.docTitle}>{item.title}</span>
              <span className={styles.docDate}>
                {new Date(item.updatedAt).toLocaleDateString(undefined, {
                  year: 'numeric',
                  month: 'short',
                  day: 'numeric',
                })}
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}