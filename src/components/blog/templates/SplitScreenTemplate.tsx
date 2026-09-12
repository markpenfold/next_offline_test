import styles from './templates.module.css'

interface TemplateProps {
  title: string
  htmlContent: string
  authorName?: string
  authorAvatar?: string
}


export function SplitScreenTemplate({ title, htmlContent }: TemplateProps) {
  return (
    <article className={styles.splitGrid}>
      {/* Pinned Left Editorial Header Panel */}
      <aside className={`${styles.splitSidebar} pinkNewsprint`}>
        <div className={styles.stickyWrapper}>
          <h1 className={styles.splitTitle}>{title}</h1>
        </div>
      </aside>

      {/* Fluid Right Content Column */}
      <main 
        className={styles.splitMain} 
        dangerouslySetInnerHTML={{ __html: htmlContent }} 
      />
    </article>
  )
}