"use client";

import React, { ReactNode } from "react";
import styles from "@/app/styles/omenland.module.css";

interface WindowBarProps {
  title: string;
  icon?: ReactNode;
  children?: ReactNode; // Context-specific actions (Min/Max, Save, Menu actions)
  className?: string;
}

export function WindowBar({ title, icon, children, className = "" }: WindowBarProps) {
  return (
    <div className={`${styles.windowBar} ${className}`}>
      {/* Left: Window Icon + Title */}
      <div className={styles.windowBarTitleGroup}>
        {icon && <span className={styles.windowBarIcon}>{icon}</span>}
        <span className={styles.windowBarTitle}>{title}</span>
      </div>

      {/* Right: Custom Action Buttons passed via children */}
      {children && <div className={styles.windowBarActions}>{children}</div>}
    </div>
  );
}

// Reusable IconButton for top bar actions to keep markup clean & uniform
interface WindowBarIconButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  icon: ReactNode;
  tooltip: string;
}

export function WindowBarIconButton({ icon, tooltip, className = "", ...props }: WindowBarIconButtonProps) {
  return (
    <button
      {...props}
      title={tooltip}
      className={`${styles.windowBarBtn} ${className}`}
    >
      {icon}
    </button>
  );
}