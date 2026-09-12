'use client'

import { useState } from 'react'
import DOMPurify from 'dompurify'
import { useAppStore } from "@/providers/AppStoreProvider"
import styles from '@/app/styles/dashboard.module.css'
import { Send } from 'lucide-react';

export function ContactUsCard() {
  const [subject, setSubject] = useState('')
  const [body, setBody] = useState('')
  const [status, setStatus] = useState<'idle' | 'submitting' | 'success' | 'error'>('idle')
  const [errorMessage, setErrorMessage] = useState('')
  const profile = useAppStore((s) => s.profile)
  const activeAccount = useAppStore((s) => s.activeAccount)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setStatus('submitting')
    setErrorMessage('')

    const cleanSubject = DOMPurify.sanitize(subject.trim())
    const cleanBody = DOMPurify.sanitize(body.trim())

    if (!cleanSubject || !cleanBody) {
      setErrorMessage('Subject and message body cannot be empty.')
      setStatus('error')
      return
    }

    try {
      const response = await fetch('/api/contact', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          subject: cleanSubject,
          body: cleanBody,
          userInfo: {
            email: profile?.email || 'N/A',
            username: profile?.username || profile?.full_name || 'N/A',
            tier: activeAccount?.plan_name?.toUpperCase() || 'FREE',
            workspaceId: activeAccount?.id || 'N/A',
            workspaceName: activeAccount?.name || 'N/A',
          },
        }),
      })

      if (!response.ok) throw new Error('Failed to send message.')

      setStatus('success')
      setSubject('')
      setBody('')
    } catch (err: any) {
      setErrorMessage(err.message || 'An error occurred while sending.')
      setStatus('error')
    }
  }

  return (
    <div className={styles.gridCard}>
      <div className={styles.cardHeader}>
        <div className={styles.headerTitleGroup}>
        <Send size={21} strokeWidth={1.8} className={styles.headerIcon} />
        <h1 className={styles.AccountCardHeader}>Contact Us</h1>
        </div>
      </div>

      <form onSubmit={handleSubmit} className={styles.cardForm}>
        <div className={styles.cardBody}>
          <div className={styles.profileFieldsGroup}>
            {/* Subject Field */}
            <div className={styles.fieldBlock}>
              <div className={styles.inputLine}>
                <div className={styles.labelCol}>
                  <label htmlFor="subject" className={styles.fieldLabel}>
                    Subject
                  </label>
                </div>
                <input
                  id="subject"
                  type="text"
                  value={subject}
                  onChange={(e) => setSubject(e.target.value)}
                  placeholder="How can we help?"
                  required
                  className={styles.textInput}
                />
              </div>
            </div>

            {/* Message Field */}
            <div className={styles.fieldBlock}>
              <div className={styles.inputLine}>
                <div className={styles.labelCol}>
                  <label htmlFor="body" className={styles.fieldLabel}>
                    Message
                  </label>
                  <span className={styles.fieldHelpText}>
                    Describe your issue or feedback
                  </span>
                </div>
                <textarea
                  id="body"
                  rows={5}
                  value={body}
                  onChange={(e) => setBody(e.target.value)}
                  placeholder="Tell us what's on your mind..."
                  required
                  className={styles.textareaInput}
                />
              </div>
            </div>
          </div>
        </div>

        {/* Pinned Card Footer */}
        <div className={styles.cardFooter}>
          <div className={styles.globalSaveRow}>
            <div className={styles.commitNote}>

            </div>
            <button
              type="submit"
              disabled={status === 'submitting'}
              className="fullButtonGreen btn"
            >
              {status === 'submitting' ? 'Sending...' : 'Send Message'}
            </button>
          </div>

          {/* Feedback Messages */}
          {status === 'success' && (
            <div className={styles.statusRow}>
              <span className={styles.successMsg}>
                🟢 Message sent! We'll be in touch soon.
              </span>
            </div>
          )}

          {status === 'error' && errorMessage && (
            <div className={styles.statusRow}>
              <span className={styles.errorMsg}>
                {errorMessage}
              </span>
            </div>
          )}
        </div>
      </form>
    </div>
  )
}