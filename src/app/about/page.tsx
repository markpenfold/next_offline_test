import { MDXRemote } from 'next-mdx-remote/rsc';
import remarkGfm from 'remark-gfm';
import matter from 'gray-matter';
import styles from '@/app/styles/markdown.module.css';

const R2_PUBLIC_URL = process.env.NEXT_PUBLIC_R2_SITE_CONTENT_URL || '';
const R2_BASE_URL = `${R2_PUBLIC_URL}/omenland_pages/about`;

const mdxComponents = {
  img: (props: React.ImgHTMLAttributes<HTMLImageElement>) => {
    const rawSrc = typeof props.src === 'string' ? props.src : '';
    const src = rawSrc.startsWith('http') 
      ? rawSrc 
      : `${R2_BASE_URL}/${rawSrc.replace(/^\.\//, '')}`;
      
    return (
      <span className={styles.centeredImageWrapper}>
        <img {...props} src={src} className={styles.markdownImage} alt={props.alt || ''} />
        {props.alt && <span className={styles.imageCaption}>{props.alt}</span>}
      </span>
    );
  },
};

export default async function AboutPage() {
  const targetUrl = `${R2_BASE_URL}/omenland.md`;

  const res = await fetch(targetUrl, {
    cache: process.env.NODE_ENV === 'development' ? 'no-store' : 'default',
    next: { revalidate: process.env.NODE_ENV === 'development' ? 0 : 3600 },
  });

  if (!res.ok) {
    return <div className={styles.error}>Failed to load content from R2.</div>;
  }

  const rawText = await res.text();
  
  // Extract frontmatter metadata (data) and body text (content)
  const { data, content } = matter(rawText);

  // Resolve hero image URL if specified in frontmatter
  const heroUrl = data.heroImage
    ? data.heroImage.startsWith('http')
      ? data.heroImage
      : `${R2_BASE_URL}/${data.heroImage.replace(/^\.\//, '')}`
    : null;

  return (
    <div className={`pageContainer darkBackground ${styles.omenlandAboutLayout}`}>
      {/* 1. Full-Width Hero Image from Frontmatter */}
      {heroUrl && (
        <div className={styles.heroWrapper}>
          <img src={heroUrl} alt={data.title || 'Hero image'} className={styles.heroImage} />
        </div>
      )}

      <article className={styles.proseContainer}>
        {/* 2. Structured Header & Subhead from Frontmatter */}
        {data.title && <h1 className={styles.pageTitle}>{data.title}</h1>}
        {data.subtitle && <p className={styles.pageSubtitle}>{data.subtitle}</p>}


        {/* 3. Render pure Markdown body */}
        <MDXRemote
          source={content}
          options={{
            mdxOptions: {
              remarkPlugins: [remarkGfm],
            },
          }}
          components={mdxComponents}
        />
      </article>
    </div>
  );
}