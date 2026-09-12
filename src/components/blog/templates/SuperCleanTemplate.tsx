import styles from './templates.module.css'

interface TemplateProps {
  title: string
  htmlContent: string
  authorName?: string
  authorAvatar?: string
}

export function SuperCleanTemplate({ title, htmlContent, authorName, authorAvatar }: TemplateProps) {
  return (
    <article className={styles.cleanContainer}>
      {/* Minimal Top Bar with Author Details */}
      <div className={styles.cleanMetaBar}>
        {authorAvatar && <img src={authorAvatar} alt={authorName} className={styles.miniAvatar} />}
        <span>{authorName || 'Anonymous'}</span>
      </div>

      <h1 className={styles.cleanTitle}>{title}</h1>

      <main 
        className={styles.cleanContent} 
        dangerouslySetInnerHTML={{ __html: htmlContent }} 
      />
    </article>
  )
}