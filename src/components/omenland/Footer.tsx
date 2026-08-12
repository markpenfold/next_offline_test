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
          {React.Children.map(children, (child, index) => (
            <div key={index} className={styles.footerColumn}>
              {child}
            </div>
          ))}
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