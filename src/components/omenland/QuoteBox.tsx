"use client";

import { useState, useEffect } from "react";
import styles from "@/app/styles/text.module.css";
import { QUOTES, TRIGRAMS } from "@/lib/utils/constants";
import { Egg } from 'lucide-react';

interface QuoteType {
  text: string;
  source: string;
}
interface TrigramType {
  symbol: string;
  name: string;
  meaning: string;
  element: string;
}

export function QuoteBox() {
  const [quote, setQuote] = useState<QuoteType | null>(null);
  const [trigram, setTrigram] = useState<TrigramType | null>(null);

  useEffect(() => {
    const randomQuoteIndex = Math.floor(Math.random() * QUOTES.length);
    const randomTrigramIndex = Math.floor(Math.random() * 8);

    setQuote(QUOTES[randomQuoteIndex]);
    setTrigram(TRIGRAMS[randomTrigramIndex]);
  }, []);

  return (
    <div className={styles.quoteBoxContainer}>
      {/* Display Trigram Symbol instead of Lucide Icon */}
      <div 
        className={styles.quoteIcon} 
        title={`${trigram?.name} (${trigram?.meaning})`}>
        {trigram?.symbol || "☰"}
      </div>

      <div className={`${styles.quoteContent} ${quote ? styles.visible : ''}`}>
        <blockquote className={styles.quoteText}>
          "{quote?.text}"
        </blockquote>
        <cite className={styles.quoteSource}>— {quote?.source}</cite>
      </div>
    </div>
  );
}