import { marked } from 'marked';
import fm from 'front-matter';
import styles from '@/app/styles/markdown.module.css';
import { SiteNav } from '@/components/identity/SiteNav';

interface Attributes {
  title?: string;
  subtitle?: string;
  heroImage?: string;
  date?: string;
}

export default async function AboutPage() {
  const R2_BASE_URL = 'https://pub-7035fb577eda471c9f2d2e8910da1021.r2.dev/omenland_pages/about';

  // Customize marked image rendering
  const renderer = new marked.Renderer();
  renderer.image = ({ href, title, text }) => {
    // Rewrite relative ./ paths to full R2 bucket URLs
    const isAbsolute = href.startsWith('http://') || href.startsWith('https://');
    const cleanHref = href.replace(/^\.\//, '');
    const src = isAbsolute ? href : `${R2_BASE_URL}/${cleanHref}`;
    
    return `
      <span class="${styles.centeredImageWrapper}">
        <img src="${src}" alt="${text || ''}" crossOrigin="anonymous" class="${styles.markdownImage}" />
        ${text ? `<span class="${styles.imageCaption}">${text}</span>` : ''}
      </span>
    `;
  };

  let htmlContent = '';
  let attributes: Attributes = {};

  try {
    const res = await fetch(`${R2_BASE_URL}/omenland.md`, { cache: 'no-store' });
    
    if (res.ok) {
      const rawText = await res.text();
      const { attributes: parsedAttrs, body } = fm<Attributes>(rawText);
      attributes = parsedAttrs;

      // Pass custom renderer into marked.parse
      htmlContent = await marked.parse(body, { renderer });
    }
  } catch (err) {
    htmlContent = `<p style="color: red;">Failed to load markdown content.</p>`;
  }

  const heroUrl = attributes.heroImage 
    ? `${R2_BASE_URL}/${attributes.heroImage.replace(/^\.\//, '')}`
    : `${R2_BASE_URL}/hero.png`;

  return (
    <>
      <SiteNav />
      <div className={`pageContainer darkBackground ${styles.omenlandAboutLayout}`}>
        {heroUrl && (
          <div className={styles.heroWrapper}>
            <img 
              src={heroUrl} 
              crossOrigin="anonymous" 
              alt={attributes.title || 'Hero banner'} 
              className={styles.heroImage} 
            />
          </div>
        )}

        <article className={styles.proseContainer}>
          {attributes.title && <h1 className={styles.pageTitle}>{attributes.title}</h1>}
          {attributes.subtitle && <p className={styles.pageSubtitle}>{attributes.subtitle}</p>}
          {(attributes.title || attributes.subtitle) && <hr className={styles.divider} />}

          <div 
            className={styles.markdownContent}
            dangerouslySetInnerHTML={{ __html: htmlContent }} 
          />
        </article>
      </div>
    </>
  );
}