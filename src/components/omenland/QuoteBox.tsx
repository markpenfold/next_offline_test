"use client";

import { useState, useEffect } from "react";
import styles from "@/app/styles/text.module.css";
import { QUOTES } from "@/lib/utils/constants";
import { Egg } from 'lucide-react';

interface QuoteType {
  text: string;
  source: string;
}

export function QuoteBox() {
  const [quote, setQuote] = useState<QuoteType | null>(null);

  useEffect(() => {
    // Select a random quote after the component mounts on the client
    const randomIndex = Math.floor(Math.random() * QUOTES.length);
    setQuote(QUOTES[randomIndex]);
  }, []);

  // Avoid rendering until the client picks a quote to prevent hydration flashes
  // 👈 Render an empty box with reserved height instead of null
  if (!quote) {
    return <div className={styles.quoteBoxContainer} />;
  }

  return (
    <div className={styles.quoteBoxContainer}>
      <Egg size={64} strokeWidth={1.5} className={styles.quoteIcon} />
      <blockquote className={styles.quoteText}>
        "{quote.text}"
      </blockquote>
      <cite className={styles.quoteSource}>— {quote.source}</cite>
    </div>
  );
}