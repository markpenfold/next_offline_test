
'use client'

import { useState } from 'react'
import DOMPurify from 'dompurify'
import { useAppStore } from "@/providers/AppStoreProvider"
import styles from '@/app/styles/dashboard.module.css'

export function ContactUsCard() {
  const [subject, setSubject] = useState('')
  const [body, setBody] = useState('')
  const [status, setStatus] = useState<'idle' | 'submitting' | 'success' | 'error'>('idle')
  const [errorMessage, setErrorMessage] = useState('')

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setStatus('submitting')
    setErrorMessage('')

    // Read latest store state at submission time
    const profile = useAppStore((s) => s.profile)
    const activeAccount = useAppStore((s) => s.activeAccount)

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
          // Append hidden metadata to payload
          userInfo: {
            email: profile?.email || 'N/A',
            username: profile?.username || profile?.name || 'N/A',
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
<div className={styles.wideCard}>
      {status === 'success' ? (
        <div className={styles.privilegeNotice}>
          <span className={styles.ownerTextTag}>🟢 Message sent! We'll be in touch soon.</span>
        </div>
      ) : (
        <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
          <div>
            <label htmlFor="subject" style={{ display: 'block', fontWeight: 'bold', marginBottom: '0.25rem' }}>
              Subject
            </label>
            <input
              id="subject"
              type="text"
              value={subject}
              onChange={(e) => setSubject(e.target.value)}
              placeholder="How can we help?"
              required
              style={{ width: '100%', padding: '0.5rem', background:'rgba(242,242,242,0.8)' }}
            />
          </div>

          <div>
            <label htmlFor="body" style={{ display: 'block', fontWeight: 'bold', marginBottom: '0.25rem' }}>
              Message
            </label>
            <textarea
              id="body"
              rows={5}
              value={body}
              onChange={(e) => setBody(e.target.value)}
              placeholder="Describe your issue or feedback..."
              required
              style={{ width: '100%', padding: '0.5rem', background:'rgba(242,242,242,0.8)' }}
            />
          </div>

          {errorMessage && <p style={{ color: 'red', margin: 0 }}>{errorMessage}</p>}

          <button type="submit" disabled={status === 'submitting'} style={{ padding: '0.5rem 1rem', alignSelf: 'flex-start' , background:'var(--green)', color:'var(--background)'}}>
            {status === 'submitting' ? 'Sending...' : 'Send Message'}
          </button>
        </form>
      )}
    </div>
  )
}