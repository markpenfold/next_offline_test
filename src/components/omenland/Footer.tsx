// components/common/Footer.tsx
"use client";

import React from "react";
import styles from "@/app/styles/footer.module.css";
import Link from 'next/link'


interface FooterProps {
  children?: React.ReactNode;
  copyrightText?: string;
}

export function Footer({
  children,
  copyrightText = `© ${new Date().getFullYear()} Omenland. All rights reserved.`,
}: FooterProps) {
  return (
    <footer className={styles.footerContainer}>
      
      
      
      
      
      <div className={styles.footerInner}>
        {/* Optional top slot */}
        {children && <div className={styles.footerGrid}>{children}</div>}

        {/* Centered Navigation Links (Above Border) */}
        <div className={styles.footerNav}>
          <Link href="/contact" className={styles.footerLink}>Contact</Link>
          <Link href="/about" className={styles.footerLink}>About</Link>
          <Link href="/docs" className={styles.footerLink}>User guide</Link>
          <Link href="/pricing" className={styles.footerLink}>Pricing</Link>
          <Link href="/pricing" className={styles.footerLink}>Sign Up</Link>
          <Link href="/blog" className={styles.footerLink}>Blog</Link>
        </div>

        {/* Bottom Bar with Left-Aligned Copyright (Below Border) */}
        {copyrightText && (
          <div className={styles.footerBottom}>
            <p className={styles.copyrightText}>{copyrightText}</p>
          </div>
        )}
      </div>
    </footer>
  );
}