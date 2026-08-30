// components/common/Footer.tsx
"use client";

import React from "react";
import styles from "@/app/styles/footer.module.css";

interface FooterProps {
  children?: React.ReactNode;
  copyrightText?: string;
}

export const Footer: React.FC<FooterProps> = ({
  children,
  copyrightText = `© ${new Date().getFullYear()} Omenland. All rights reserved.`,
}) => {
  return (
    <footer className={styles.footerContainer}>
      <div className={styles.footerInner}>
        {/* 4-Column Grid Container */}
        <div className={styles.footerGrid}>
          <div className={styles.pt2}>
              <p className={styles.pt2}>Contact</p>
              <p className={styles.pt2}>About</p>
              <p className={styles.pt2}>User guide</p>
              <p className={styles.pt2}>Pricing</p>
                      </div>
        </div>

        {/* Bottom Bar */}
        {copyrightText && (
          <div className={styles.footerBottom}>
            <p className={styles.copyrightText}>{copyrightText}</p>
          </div>
        )}
      </div>
    </footer>
  );
};

export default Footer;