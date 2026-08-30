import { MDXRemote } from 'next-mdx-remote/rsc';
import remarkGfm from 'remark-gfm';
import matter from 'gray-matter';
import styles from '@/app/styles/markdown.module.css';

export default async function AboutPage() {
  // Read dynamically at runtime and clean trailing slashes
  const rawDomain = (
    process.env.NEXT_PUBLIC_R2_SITE_CONTENT_URL || 
    process.env.R2_ENDPOINT || 
    ''
  ).replace(/\/+$/, '');

  const R2_BASE_URL = `${rawDomain}/omenland_pages/about`;
  const targetUrl = `${R2_BASE_URL}/omenland.md`;

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

  try {
    const res = await fetch(targetUrl, {
      cache: 'no-store', // Temporarily bypass Vercel Data Cache to force a fresh hit
    });

    if (!res.ok) {
      return (
        <div style={{ color: '#ef4444', padding: '2rem', fontFamily: 'monospace' }}>
          <h3>R2 Fetch Error (HTTP {res.status})</h3>
          <p><b>Attempted URL:</b> <code>{targetUrl}</code></p>
          <p><b>Status Text:</b> {res.statusText}</p>
        </div>
      );
    }

    const rawText = await res.text();
    const { data, content } = matter(rawText);

    const heroUrl = data.heroImage
      ? data.heroImage.startsWith('http')
        ? data.heroImage
        : `${R2_BASE_URL}/${data.heroImage.replace(/^\.\//, '')}`
      : null;

    return (
      <div className={`pageContainer darkBackground ${styles.omenlandAboutLayout}`}>
        {heroUrl && (
          <div className={styles.heroWrapper}>
            <img src={heroUrl} alt={data.title || 'Hero banner'} className={styles.heroImage} />
          </div>
        )}

        <article className={styles.proseContainer}>
          {data.title && <h1 className={styles.pageTitle}>{data.title}</h1>}
          {data.subtitle && <p className={styles.pageSubtitle}>{data.subtitle}</p>}
          {data.title && <hr className={styles.divider} />}

          <MDXRemote
            source={content}
            options={{
              mdxOptions: { remarkPlugins: [remarkGfm] },
            }}
            components={mdxComponents}
          />
        </article>
      </div>
    );
  } catch (err: unknown) {
    const error = err as Error;
    return (
      <div style={{ color: '#ef4444', padding: '2rem', fontFamily: 'monospace' }}>
        <h3>Fetch Threw Exception</h3>
        <p><b>Attempted URL:</b> <code>{targetUrl}</code></p>
        <p><b>Error Message:</b> {error.message}</p>
      </div>
    );
  }
}