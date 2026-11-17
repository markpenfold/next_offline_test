'use client'

import { useActionState, useState, useMemo, useEffect } from 'react'
import { organicSignup } from '@/actions/auth'
import {
  signUpSchema,
  accountNameSchema,
  blogSlugSchema,
  usernameSchema,
  isRestrictedText,
} from '@/lib/validations/primitives'
import styles from '@/app/styles/styles.module.css'
import { type ActionState } from '@/lib/tl_utils/types'
import { Eye, EyeOff } from 'lucide-react'
import { debounce } from '@/lib/utils/general'
import {
  checkAccountNameAvailability,
  checkBlogNameAvailability,
  checkUserNameAvailability,
} from '@/actions/utility_actions'
import { z } from 'zod'

interface OrganicSignupFormProps {
  planChoice: string
}

// hook to check field viability with Supabase
function useFieldAvailability(
  value: string,
  schema: z.ZodType<string>,
  checkFn: (val: string) => Promise<{ available: boolean }>
) {
  const [isAvailable, setIsAvailable] = useState<boolean | null>(null)
  const [isChecking, setIsChecking] = useState(false)
  const [formatError, setFormatError] = useState<string | null>(null)

  const debouncedCheck = useMemo(
    () =>
      debounce(async (val: string) => {
        if (!val.trim()) {
          setIsAvailable(null)
          setIsChecking(false)
          return
        }
        const res = await checkFn(val)
        setIsAvailable(res.available)
        setIsChecking(false)
      }, 400),
    [checkFn]
  )

  useEffect(() => {
    if (!value.trim()) {
      setIsAvailable(null)
      setFormatError(null)
      setIsChecking(false)
      debouncedCheck.cancel()
      return
    }

    const parsed = schema.safeParse(value)
    if (!parsed.success) {
      setFormatError(parsed.error.issues[0].message)
      setIsAvailable(false)
      setIsChecking(false)
      debouncedCheck.cancel()
      return
    }

    setFormatError(null)
    setIsChecking(true)
    debouncedCheck(value)

    return () => {
      setIsChecking(false)
      debouncedCheck.cancel()
    }
  }, [value, schema, debouncedCheck])

  return {
    isAvailable,
    isChecking,
    formatError,
    flush: () => debouncedCheck.flush(),
  }
}

export function OrganicSignupForm({ planChoice }: OrganicSignupFormProps) {
  const [state, formAction, isPending] = useActionState<ActionState, FormData>(organicSignup, null)
  const [clientError, setClientError] = useState<string | null>(null)

  // Password state
  const [password, setPassword] = useState('')
  const [isVisible, setIsVisible] = useState(false)
  const hasMinLength = password.length >= 8
  const hasUppercase = /[A-Z]/.test(password)
  const hasNumber = /[0-9]/.test(password)
  const isPasswordValid = hasMinLength && hasUppercase && hasNumber

  // Form values
  const [fullName, setFullName] = useState('')
  const [userName, setUserName] = useState('')
  const [accountName, setAccountName] = useState('')
  const [blogName, setBlogName] = useState('')
  const [isBlogCustomized, setIsBlogCustomized] = useState(false)

  useEffect(() => {
    if (!isBlogCustomized) {
      setBlogName(accountName)
    }
  }, [accountName, isBlogCustomized])

  const blogSlug = blogName
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')

  const isFullNameValid = fullName.trim().length >= 4 && !isRestrictedText(fullName, true)

  // Availability & format checks
  const usernameCheck = useFieldAvailability(userName, usernameSchema, checkUserNameAvailability)
  const accountCheck = useFieldAvailability(accountName, accountNameSchema, checkAccountNameAvailability)
  const blogCheck = useFieldAvailability(blogSlug, blogSlugSchema, checkBlogNameAvailability)

  const hasBlockingErrors =
    isPending ||
    !isFullNameValid ||
    !isPasswordValid ||
    Boolean(usernameCheck.formatError) ||
    Boolean(accountCheck.formatError) ||
    Boolean(blogCheck.formatError) ||
    usernameCheck.isAvailable === false ||
    accountCheck.isAvailable === false ||
    blogCheck.isAvailable === false

  async function handleSubmit(formData: FormData) {
    usernameCheck.flush()
    accountCheck.flush()
    blogCheck.flush()
    setClientError(null)

    const rawData = Object.fromEntries(formData)
    const result = signUpSchema.safeParse(rawData)

    if (!result.success) {
      setClientError(result.error.issues[0].message)
      return
    }

    if (
      usernameCheck.isAvailable === false ||
      accountCheck.isAvailable === false ||
      blogCheck.isAvailable === false
    ) {
      setClientError('Please choose an available username, account name, and blog URL.')
      return
    }

    formAction(formData)
  }

  return (
    <div className={styles.fbox}>
      <form
        action={handleSubmit}
        className={styles.authForm}
        style={{
          display: 'flex',
          flexDirection: 'column',
          gap: '14px',
          width: '100%',
          maxWidth: '700px',
          margin: '0 auto',
        }}
      >
        <h2 style={{ gridColumn: '1 / -1', marginBottom: '8px' }}>
          Create a new {planChoice} account
        </h2>

        {(clientError || state?.error) && (
          <p className={styles.error} style={{ gridColumn: '1 / -1' }}>
            {clientError || state?.error}
          </p>
        )}

        <input type="hidden" name="planChoice" value={planChoice} />

        {/* Row 1: Full Name */}
        <div style={{ display: 'grid', gridTemplateColumns: '140px 1fr 1fr', gap: '12px', alignItems: 'center', width: '100%' }}>
          <label htmlFor="full_name" style={{ margin: 0 }}>Full Name</label>
          <input
            id="full_name"
            name="full_name"
            type="text"
            placeholder="John D"
            required
            value={fullName}
            onChange={(e) => setFullName(e.target.value)}
            style={{ width: '100%', boxSizing: 'border-box' }}
          />
          <div style={{ fontSize: '12px' }}>
            {fullName.length > 0 && (
              isFullNameValid
                ? <span style={{ color: '#16a34a' }}>✓</span>
                : <span style={{ color: '#dc2626' }}>✕ Name not acceptable</span>
            )}
          </div>
        </div>

        {/* Row 2: Username */}
        <div style={{ display: 'grid', gridTemplateColumns: '140px 1fr 1fr', gap: '12px', alignItems: 'center', width: '100%' }}>
          <label htmlFor="username" style={{ margin: 0 }}>Username</label>
          <input
            id="username"
            name="username"
            type="text"
            placeholder="JD_Seer"
            required
            value={userName}
            onChange={(e) => setUserName(e.target.value)}
            style={{ width: '100%', boxSizing: 'border-box' }}
          />
          <div style={{ fontSize: '12px' }}>
            {userName.trim() && (
              <>
                {usernameCheck.formatError && <span style={{ color: '#dc2626' }}>✕ {usernameCheck.formatError}</span>}
                {!usernameCheck.formatError && usernameCheck.isChecking && <span style={{ color: '#64748b' }}>Checking availability...</span>}
                {!usernameCheck.formatError && !usernameCheck.isChecking && usernameCheck.isAvailable === true && <span style={{ color: '#16a34a' }}>✓</span>}
                {!usernameCheck.formatError && !usernameCheck.isChecking && usernameCheck.isAvailable === false && <span style={{ color: '#dc2626' }}>✕ Username is already taken</span>}
              </>
            )}
          </div>
        </div>

        {/* Row 3: Account Name */}
        <div style={{ display: 'grid', gridTemplateColumns: '140px 1fr 1fr', gap: '12px', alignItems: 'center', width: '100%' }}>
          <label htmlFor="account_name" style={{ margin: 0 }}>Account Name</label>
          <input
            id="account_name"
            name="account_name"
            type="text"
            placeholder="New timelines"
            required
            value={accountName}
            onChange={(e) => setAccountName(e.target.value)}
            style={{ width: '100%', boxSizing: 'border-box' }}
          />
          <div style={{ fontSize: '12px' }}>
            {accountName.trim() && (
              <>
                {accountCheck.formatError && <span style={{ color: '#dc2626' }}>✕ {accountCheck.formatError}</span>}
                {!accountCheck.formatError && accountCheck.isChecking && <span style={{ color: '#64748b' }}>Checking availability...</span>}
                {!accountCheck.formatError && !accountCheck.isChecking && accountCheck.isAvailable === true && <span style={{ color: '#16a34a' }}>✓</span>}
                {!accountCheck.formatError && !accountCheck.isChecking && accountCheck.isAvailable === false && <span style={{ color: '#dc2626' }}>✕ Account name is already taken</span>}
              </>
            )}
          </div>
        </div>

        {/* Row 4: Blog Name */}
        <div style={{ display: 'grid', gridTemplateColumns: '140px 1fr 1fr', gap: '12px', alignItems: 'center', width: '100%' }}>
          <label htmlFor="blog_title" style={{ margin: 0 }}>Blog Name</label>
          <input
            id="blog_title"
            name="blog_title"
            type="text"
            placeholder="New timelines"
            value={blogName}
            onChange={(e) => {
              setBlogName(e.target.value)
              setIsBlogCustomized(true)
            }}
            style={{ width: '100%', boxSizing: 'border-box' }}
          />
          <div />
        </div>

        {/* Row 5: Blog's URL Preview */}
        <div style={{ display: 'grid', gridTemplateColumns: '140px 1fr 1fr', gap: '12px', alignItems: 'center', width: '100%' }}>
          <label htmlFor="blog_url" style={{ margin: 0 }}>Your blog's URL</label>
          <input type="hidden" name="blog_slug" value={blogSlug} />
          <div
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              backgroundColor: '#f1f5f9',
              border: '1px solid #cbd5e1',
              borderRadius: '4px',
              padding: '8px 12px',
              color: '#475569',
              fontSize: '14px',
              userSelect: 'none',
              width: '100%',
              boxSizing: 'border-box',
              cursor: 'not-allowed',
              overflow: 'hidden',
            }}
          >
            <span style={{ color: '#64748b', textOverflow: 'ellipsis', overflow: 'hidden', whiteSpace: 'nowrap' }}>
              {blogSlug || 'new-timelines'}
            </span>
            <span style={{ fontWeight: 500, color: '#475569', flexShrink: 0 }}>.omen.land</span>
          </div>
          <div style={{ fontSize: '12px' }}>
            {blogSlug.trim() && (
              <>
                {blogCheck.formatError && <span style={{ color: '#dc2626' }}>✕ {blogCheck.formatError}</span>}
                {!blogCheck.formatError && blogCheck.isChecking && <span style={{ color: '#64748b' }}>Checking URL...</span>}
                {!blogCheck.formatError && !blogCheck.isChecking && blogCheck.isAvailable === true && <span style={{ color: '#16a34a' }}>✓</span>}
                {!blogCheck.formatError && !blogCheck.isChecking && blogCheck.isAvailable === false && <span style={{ color: '#dc2626' }}>✕ URL is already taken</span>}
              </>
            )}
          </div>
        </div>

        {/* Row 6: Email */}
        <div style={{ display: 'grid', gridTemplateColumns: '140px 1fr 1fr', gap: '12px', alignItems: 'center', width: '100%' }}>
          <label htmlFor="email" style={{ margin: 0 }}>Email</label>
          <input
            id="email"
            name="email"
            type="email"
            placeholder="you@example.com"
            required
            autoComplete="email"
            style={{ width: '100%', boxSizing: 'border-box' }}
          />
          <div />
        </div>

        {/* Row 7: Password */}
        <div style={{ display: 'grid', gridTemplateColumns: '140px 1fr 1fr', gap: '12px', alignItems: 'center', width: '100%' }}>
          <label htmlFor="password" style={{ margin: 0 }}>Password</label>
          <div style={{ position: 'relative', display: 'flex', alignItems: 'center', width: '100%' }}>
            <input
              id="password"
              name="password"
              type={isVisible ? 'text' : 'password'}
              placeholder="••••••••"
              required
              value={password}
              autoComplete="new-password"
              onChange={(e) => setPassword(e.target.value)}
              style={{ width: '100%', paddingRight: '40px', boxSizing: 'border-box' }}
            />
            <button
              type="button"
              onClick={() => setIsVisible(!isVisible)}
              style={{
                position: 'absolute',
                right: '10px',
                background: 'none',
                border: 'none',
                cursor: 'pointer',
                color: '#64748b',
                display: 'flex',
                alignItems: 'center',
              }}
              aria-label={isVisible ? 'Hide password' : 'Show password'}
            >
              {isVisible ? <EyeOff size={20} /> : <Eye size={20} />}
            </button>
          </div>
          <div style={{ fontSize: '12px' }}>
            {password.length > 0 && (
              <div className={styles.checklist} style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
                <div className={hasMinLength ? styles.valid : styles.invalid}>
                  {hasMinLength ? '●' : '○'} At least 8 characters
                </div>
                <div className={hasUppercase ? styles.valid : styles.invalid}>
                  {hasUppercase ? '●' : '○'} One uppercase letter
                </div>
                <div className={hasNumber ? styles.valid : styles.invalid}>
                  {hasNumber ? '●' : '○'} One number
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Row 8: Submit */}
        <div style={{ display: 'grid', gridTemplateColumns: '140px 1fr 1fr', gap: '12px', alignItems: 'center', width: '100%', marginTop: '8px' }}>
          <div />
          <button
            type="submit"
            disabled={hasBlockingErrors}
            style={{ padding: '10px', cursor: 'pointer', width: '100%' }}
          >
            {isPending ? 'Creating Account...' : 'Sign up'}
          </button>
          <div />
        </div>
      </form>
    </div>
  )
}