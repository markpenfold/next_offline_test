'use client'

import { useActionState, useState, useMemo, useEffect } from 'react'
import { signup } from '@/actions/auth'
import { 
  signUpSchema, 
  accountNameSchema, 
  blogSlugSchema,
  usernameSchema,
  isRestrictedText 
} from '@/lib/validations/primitives'
import styles from "@/app/styles/styles.module.css"
import { type ActionState } from '@/lib/tl_utils/types'
import { Eye, EyeOff } from 'lucide-react';
import { debounce } from '@/lib/utils/general'
import { checkAccountNameAvailability, checkBlogNameAvailability, checkUserNameAvailability } from '@/actions/utility_actions'

interface SignupFormProps {
  planChoice: string,
  inviteToken?: string
}

export function InvitedSignupForm({planChoice, inviteToken}: SignupFormProps) {
  const [state, formAction, isPending] = useActionState<ActionState, FormData>(signup, null);
  const [clientError, setClientError] = useState<string | null>(null)

  // Password state
  const [password, setPassword] = useState('')
  const hasMinLength = password.length >= 8
  const hasUppercase = /[A-Z]/.test(password)
  const hasNumber = /[0-9]/.test(password)
  const isPasswordValid = hasMinLength && hasUppercase && hasNumber;
  const [isVisible, setIsVisible] = useState(false)
 
  // Form values
  const [accountName, setAccountName] = useState('')
  const [blogName, setBlogName] = useState('')
  const [userName, setUserName] = useState('')
  const [fullNameBAD, setFullNameBAD] = useState(false)
  
  const [isBlogCustomized, setIsBlogCustomized] = useState(false)

  useEffect(() => {
    if (!isBlogCustomized) {
      setBlogName(accountName)
    }
  }, [accountName, isBlogCustomized])

  // Availability & Validation States
  const [isAccountAvailable, setIsAccountAvailable] = useState<boolean | null>(null)
  const [isBlogAvailable, setIsBlogAvailable] = useState<boolean | null>(null)
  const [isUserNameAvailable, setIsUserNameAvailable] = useState<boolean | null>(null)
  const [isCheckingAccount, setIsCheckingAccount] = useState(false)
  const [isCheckingUserName, setIsCheckingUserName] = useState(false)
  const [isCheckingBlog, setIsCheckingBlog] = useState(false)

  const [accountNameFormatError, setAccountNameFormatError] = useState<string | null>(null)
  const [blogSlugFormatError, setBlogSlugFormatError] = useState<string | null>(null)
  const [userNameFormatError, setUserNameFormatError] = useState<string | null>(null)

  const blogSlug = blogName
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-') 
    .replace(/^-+|-+$/g, '')

  const debouncedCheckAccount = useMemo(
    () =>
      debounce(async (name: string) => {
        if (!name.trim()) {
          setIsAccountAvailable(null)
          setIsCheckingAccount(false)
          return
        }
        const res = await checkAccountNameAvailability(name)
        setIsAccountAvailable(res.available)
        setIsCheckingAccount(false)
      }, 400),
    []
  )

  const debouncedCheckBlog = useMemo(
    () =>
      debounce(async (slug: string) => {
        if (!slug.trim()) {
          setIsBlogAvailable(null)
          setIsCheckingBlog(false)
          return
        }
        const res = await checkBlogNameAvailability(slug)
        setIsBlogAvailable(res.available)
        setIsCheckingBlog(false)
      }, 400),
    []
  )

  const debouncedCheckUsername = useMemo(
    () =>
      debounce(async (username: string) => {
        if (!username.trim()) {
          setIsUserNameAvailable(null)
          setIsCheckingUserName(false)
          return
        }
        const res = await checkUserNameAvailability(username)
        setIsUserNameAvailable(res.available)
        setIsCheckingUserName(false)
      }, 400),
    []
  )

  function checkFullName(inputName:string){
    if( inputName.length < 4 ) {setFullNameBAD(true)}
    else{
      setFullNameBAD(inputName.trim() ? isRestrictedText(inputName, true) : false);
    }
  }

  useEffect(() => {
    if (!accountName.trim()) {
      setIsAccountAvailable(null)
      setAccountNameFormatError(null)
      setIsCheckingAccount(false)
      debouncedCheckAccount.cancel()
      return
    }

    const parseResult = accountNameSchema.safeParse(accountName)
    if (!parseResult.success) {
      setAccountNameFormatError(parseResult.error.issues[0].message)
      setIsAccountAvailable(false)
      setIsCheckingAccount(false)
      debouncedCheckAccount.cancel()
      return
    }

    setAccountNameFormatError(null)
    setIsCheckingAccount(true)
    debouncedCheckAccount(accountName)

    return () => {
      setIsCheckingAccount(false)
      debouncedCheckAccount.cancel()
    }
  }, [accountName, debouncedCheckAccount])

  useEffect(() => {
    if (!blogSlug.trim()) {
      setIsBlogAvailable(null)
      setBlogSlugFormatError(null)
      setIsCheckingBlog(false)
      debouncedCheckBlog.cancel()
      return
    }

    const parseResult = blogSlugSchema.safeParse(blogSlug)
    if (!parseResult.success) {
      setBlogSlugFormatError(parseResult.error.issues[0].message)
      setIsBlogAvailable(false)
      setIsCheckingBlog(false)
      debouncedCheckBlog.cancel()
      return
    }

    setBlogSlugFormatError(null)
    setIsCheckingBlog(true)
    debouncedCheckBlog(blogSlug)

    return () => {
      setIsCheckingBlog(false)
      debouncedCheckBlog.cancel()
    }
  }, [blogSlug, debouncedCheckBlog])


  useEffect(() => {
    if (!userName.trim()) {
      setIsUserNameAvailable(null)
      setUserNameFormatError(null)
      setIsCheckingUserName(false)
      debouncedCheckUsername.cancel()
      return
    }

    const parseResult = usernameSchema.safeParse(userName)
    if (!parseResult.success) {
      setUserNameFormatError(parseResult.error.issues[0].message)
      setIsUserNameAvailable(false)
      setIsCheckingUserName(false)
      debouncedCheckUsername.cancel()
      return
    }

    setUserNameFormatError(null)
    setIsCheckingUserName(true)
    debouncedCheckUsername(userName)

    return () => {
      setIsCheckingUserName(false)
      debouncedCheckUsername.cancel()
    }
  }, [userName, debouncedCheckUsername])

  async function handleSubmit(formData: FormData) {
    debouncedCheckAccount.flush()
    debouncedCheckBlog.flush()
    debouncedCheckUsername.flush()
    setClientError(null)
    
    const rawData = Object.fromEntries(formData)
    const result = signUpSchema.safeParse(rawData)

    if (!result.success) {
      setClientError(result.error.issues[0].message)
      return 
    }

    if (isAccountAvailable === false || isBlogAvailable === false) {
      setClientError("Please choose an available account and blog name.")
      return
    }

    formAction(formData);
  }

  return (
    
    <div className={styles.fbox}>
      <h3>INVITED SIGN UP</h3>
      <form action={handleSubmit} className={styles.authForm} style={{ display: 'flex', flexDirection: 'column', gap: '14px', width: '100%', maxWidth: '700px', margin: '0 auto' }}>
        <h2 style={{ gridColumn: '1 / -1', marginBottom: '8px' }}>Create a new {planChoice} account</h2>

        {/* Unified Error Display */}
        {(clientError || state?.error) && (
          <p className={styles.error} style={{ gridColumn: '1 / -1' }}>{clientError || state?.error}</p>
        )}

        <input type="hidden" name="planChoice" value={planChoice} />
        {inviteToken && <input type="hidden" name="invite_token" value={inviteToken} />}

        {/* Row 1: Full Name */}
        <div style={{ display: 'grid', gridTemplateColumns: '140px 1fr 1fr', gap: '12px', alignItems: 'center', width: '100%' }}>
          <label htmlFor="full_name" style={{ margin: 0 }}>Full Name</label>
          <input 
            id="full_name" 
            name="full_name" 
            type="text" 
            placeholder="John D" 
            required 
            onChange={(e) => {
              checkFullName(e.target.value)
            }}
            style={{ width: '100%', boxSizing: 'border-box' }} 
          />
          <div style={{ fontSize: '12px' }}>
            {fullNameBAD && (
              <span style={{ color: '#dc2626' }}>✕ Name not acceptable</span>
            )}
            {!fullNameBAD && (
              <span style={{ color: '#16a34a' }}>✓</span>
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
                {userNameFormatError && <span style={{ color: '#dc2626' }}>✕ {userNameFormatError}</span>}
                {!userNameFormatError && isCheckingUserName && <span style={{ color: '#64748b' }}>Checking availability...</span>}
                {!userNameFormatError && !isCheckingUserName && isUserNameAvailable === true && <span style={{ color: '#16a34a' }}>✓</span>}
                {!userNameFormatError && !isCheckingUserName && isUserNameAvailable === false && <span style={{ color: '#dc2626' }}>✕ Username is already taken</span>}
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
                {accountNameFormatError && <span style={{ color: '#dc2626' }}>✕ {accountNameFormatError}</span>}
                {!accountNameFormatError && isCheckingAccount && <span style={{ color: '#64748b' }}>Checking availability...</span>}
                {!accountNameFormatError && !isCheckingAccount && isAccountAvailable === true && <span style={{ color: '#16a34a' }}>✓</span>}
                {!accountNameFormatError && !isCheckingAccount && isAccountAvailable === false && <span style={{ color: '#dc2626' }}>✕ Account name is already taken</span>}
              </>
            )}
          </div>
        </div>

        {/* Row 4: Blog Name */}
        <div style={{ display: 'grid', gridTemplateColumns: '140px 1fr 1fr', gap: '12px', alignItems: 'center', width: '100%' }}>
          <label htmlFor="blog_name" style={{ margin: 0 }}>Blog Name</label>
          <input 
            id="blog_name" 
            name="blog_name" 
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
          <div style={{
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
            overflow: 'hidden'
          }}>
            <span style={{ color: '#64748b', textOverflow: 'ellipsis', overflow: 'hidden', whiteSpace: 'nowrap' }}>{blogSlug || 'new-timelines'}</span>
            <span style={{ fontWeight: 500, color: '#475569', flexShrink: 0 }}>.omen.land</span>
          </div>
          <div style={{ fontSize: '12px' }}>
            {blogSlug.trim() && (
              <>
                {blogSlugFormatError && <span style={{ color: '#dc2626' }}>✕ {blogSlugFormatError}</span>}
                {!blogSlugFormatError && isCheckingBlog && <span style={{ color: '#64748b' }}>Checking URL...</span>}
                {!blogSlugFormatError && !isCheckingBlog && isBlogAvailable === true && <span style={{ color: '#16a34a' }}>✓</span>}
                {!blogSlugFormatError && !isCheckingBlog && isBlogAvailable === false && <span style={{ color: '#dc2626' }}>✕ URL is already taken</span>}
              </>
            )}
          </div>
        </div>

        {/* Row 6: Email */}
        <div style={{ display: 'grid', gridTemplateColumns: '140px 1fr 1fr', gap: '12px', alignItems: 'center', width: '100%' }}>
          <label htmlFor="email" style={{ margin: 0 }}>Email</label>
          <input id="email" name="email" type="email" placeholder="you@example.com" required autoComplete="email" style={{ width: '100%', boxSizing: 'border-box' }} />
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
                alignItems: 'center'
              }}
              aria-label={isVisible ? "Hide password" : "Show password"}
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
            disabled={
              isPending || 
              !isPasswordValid || 
              Boolean(accountNameFormatError) || 
              Boolean(blogSlugFormatError) || 
              isAccountAvailable === false || 
              isBlogAvailable === false
            }
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