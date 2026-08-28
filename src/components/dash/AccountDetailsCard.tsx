'use client'

import { useAppStore } from "@/providers/AppStoreProvider"
import styles from '@/app/styles/dashboard.module.css'

export default function AccountDetailsCard() {
  const profile = useAppStore((s) => s.profile)
  const allAccounts = useAppStore((s) => s.accounts) || []
  
  // Global active session state
  const currentAccount = useAppStore((s) => s.activeAccount)
  const setCurrentAccount = useAppStore((s) => s.setActiveAccount)

  // 1. Guard rails for initializing states
  if (!profile || !currentAccount) {
    return (
      <div className={styles.gridCard}>
        <p className={styles.loadingText}>Loading workspace details...</p>
      </div>
    )
  }

  return (
    
<>
      {/* =========================================================
          🟢 THE INTERACTIVE HOT-SWAP DROPDOWN
          Only renders if the user belongs to more than 1 workspace
         ========================================================= */}
      {allAccounts.length > 1 && (
        <div className={styles.dropdownContainer}>
          <label htmlFor="workspace-select" className={styles.dropdownLabel}>
            Switch Workspace:
          </label>
          <select
            id="workspace-select"
            className={styles.workspaceSelect}
            value={currentAccount.id}
            onChange={(e) => {
              const selected = allAccounts.find(acc => acc.id === e.target.value)
              if (selected) setCurrentAccount(selected)
            }}
          >
            {allAccounts.map((account) => (
              <option key={account.id} value={account.id}>
                {account.name} {account.role === 'owner' ? '(Owner)' : '(Team)'}
              </option>
            ))}
          </select>
        </div>
      )}

      {/* =========================================================
          CORE WORKSPACE METRICS & DATA
         ========================================================= */}
      <div className={styles.cardContent}>
        <h3><strong>Workspace:</strong> {currentAccount.name}</h3>
        <p><strong>Account ID:</strong> {currentAccount.id}</p>
        <p><strong>Plan Details:</strong> {currentAccount.plan_name.toUpperCase()}</p>
        <p><strong>Subscription Status:</strong> {currentAccount.subscription_status || 'Active'}</p>
        <p><strong>Account Owner:</strong> {profile.email || 'N/A'}</p>
        
        {/* Dynamic Contextual Privilege Badge */}
        <div className={styles.privilegeNotice}>
          {currentAccount.role === 'owner' ? (
            <span className={styles.ownerTextTag}>🟢 Full Admin Access</span>
          ) : (
            <span className={styles.teamTextTag}>🔵 Team Collaborator</span>
          )}
        </div>
      </div>
  </>
  )
}