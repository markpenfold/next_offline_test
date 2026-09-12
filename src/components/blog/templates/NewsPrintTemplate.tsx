import styles from '@/app/styles/templates.module.css'


interface TemplateProps {
  title: string
  htmlContent: string
  authorName?: string
  authorAvatar?: string
}

export function NewsprintTemplate({ title, htmlContent }: TemplateProps) {
  return (
    <article className={`${styles.newsprintContainer} pinkNewsprint`}>
      <header className={styles.newsprintHeader}>
        <span className={styles.kicker}>Special Edition</span>
        <h1 className={styles.newsprintTitle}>{title}</h1>
        <hr className={styles.doubleRule} />
      </header>

      {/* Multi-column editorial body text */}
      <main 
        className={styles.newsprintColumns} 
        dangerouslySetInnerHTML={{ __html: htmlContent }} 
      />
    </article>
  )
}