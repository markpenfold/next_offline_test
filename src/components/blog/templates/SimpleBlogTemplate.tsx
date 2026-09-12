import styles from './templates.module.css'

interface TemplateProps {
  title: string
  htmlContent: string
  authorName?: string
  authorAvatar?: string
}

export function SimpleBlogTemplate({ title, htmlContent, authorName, authorAvatar }: TemplateProps) {
  return (
    <article className={styles.simpleContainer}>
      <header className={styles.simpleHeader}>
        <h1 className={styles.mainTitle}>{title}</h1>
      </header>

      {/* Centralized text & media canvas */}
      <main 
        className={styles.simpleContent} 
        dangerouslySetInnerHTML={{ __html: htmlContent }} 
      />

      {/* Appended Bio Footer */}
      <footer className={`${styles.simpleBioFooter} pinkNewsprint`}>
        {authorAvatar && <img src={authorAvatar} alt={authorName} className={styles.avatar} />}
        <div>
          <h4>Written by {authorName || 'Author'}</h4>
          <p>Published in Independent Journal</p>
        </div>
      </footer>
    </article>
  )
}