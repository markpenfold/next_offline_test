"use client"
import { useEffect, useRef, useState } from "react";
import { ArrowDownToLine } from "lucide-react";
import ob1Sketch from "./ob1Sketch";
import classes from "@/app/styles/home.module.css";

export default function P5Canvas() {
  const containerRef = useRef(null);
  const [animDone, setAnimDone] = useState(false);

  useEffect(() => {
  let p5Instance;
  let cancelled = false;

  const displaySize = containerRef.current?.offsetWidth || 650;

  import("p5").then((p5Module) => {
    if (cancelled || !containerRef.current) return;

    const p5 = p5Module.default;
    p5Instance = new p5(
      (p) => ob1Sketch(p, displaySize, () => setAnimDone(true)),
      containerRef.current
    );
  });

  return () => {
    cancelled = true;
    if (p5Instance) p5Instance.remove();
  };
}, []);

  const handleDownload = () => {
    const canvas = containerRef.current?.querySelector("canvas");
    if (!canvas) return;

    // Build a datetime string like 2026-04-01_14-32
    const now = new Date();
    const stamp = now.toISOString()
      .replace('T', '_')
      .replace(/:/g, '-')
      .slice(0, 16);
    const filename = `omenland_${stamp}.png`;

    canvas.toBlob((blob) => {
      const url = URL.createObjectURL(blob);

      // Open in new tab so user can preview and choose to save
      const newTab = window.open(url, '_blank');

      // Fallback: if popups are blocked, trigger a regular download
      if (!newTab) {
        const a = document.createElement("a");
        a.href = url;
        a.download = filename;
        a.click();
      }

      URL.revokeObjectURL(url);
    }, "image/png");
  };

return (
    <div className={classes.canvasContainer}> 
      {/* 1. The Canvas stays here */}
      <div ref={containerRef} className={classes.canvas} />

      {/* 2. The Tooltip/Arrow moves here as a sibling */}
      <div className={classes.tooltipWrapper}>
          <ArrowDownToLine
            className={`${classes.left} ${animDone ? classes.visible : ""}`}
            onClick={animDone ? handleDownload : undefined}
            aria-label="Download today's logo"
          />
          <span className={classes.tooltip}>Download today's logo</span>
      </div>
    </div>
  );
}