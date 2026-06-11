// 📄 src/components/SecureServerData.tsx
import { createClient } from '@/lib/supabase/server';
import { Database, Tables } from '@/lib/database_types'
import { SupabaseClient, QueryData } from '@supabase/supabase-js'
import { getAllUserAccountsWithRoles } from '@/lib/supabase/queries';

export async function YourAccounts() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  // If unauthorized, return absolutely nothing to the client
  if (!user) return null;

  // 1. Fetch your flattened account array
  const accountList = await getAllUserAccountsWithRoles(user.id);

  if (accountList.length === 0) {
    return <div>You are not associated with any workspaces or accounts yet.</div>;
  }

  // 2. 🟢 Split the master list into two specialized sub-arrays
  const ownedAccounts = accountList.filter(acc => acc.role === 'owner');
  const sharedAccounts = accountList.filter(acc => acc.role !== 'owner');

  return (
    <div style={{ maxWidth: '600px', margin: 'auto', padding: '20px', fontFamily: 'sans-serif' }}>
      
      {/* SECTION 1: OWNED ACCOUNTS */}
      <h3 style={{ borderBottom: '2px solid #10b981', paddingBottom: '6px', color: '#0f766e' }}>
        🛡️ Workspaces You Own ({ownedAccounts.length})
      </h3>
      {ownedAccounts.length === 0 ? (
        <p style={{ color: '#64748b', fontSize: '0.9rem' }}>You don't own any workspaces yet.</p>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '12px', marginBottom: '30px' }}>
          {ownedAccounts.map((account) => (
            <div 
              key={account.account_id} 
              style={{ border: '1px solid #10b981', padding: '16px', borderRadius: '8px', backgroundColor: '#f0fdf4' }}
            >
              <strong>ID: {account.account_id}</strong>
              <p style={{ margin: '8px 0 0 0', fontSize: '0.85rem', color: '#166534' }}>
                Stripe Customer ID: <code>{account.stripe_customer_id || 'Missing ID'}</code>
              </p>
            </div>
          ))}
        </div>
      )}

      {/* SECTION 2: SHARED ACCOUNTS */}
      <h3 style={{ borderBottom: '2px solid #64748b', paddingBottom: '6px', color: '#334155', marginTop: '40px' }}>
        👥 Shared Workspaces ({sharedAccounts.length})
      </h3>
      {sharedAccounts.length === 0 ? (
        <p style={{ color: '#64748b', fontSize: '0.9rem' }}>You haven't been added to any shared workspaces yet.</p>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
          {sharedAccounts.map((account) => (
            <div 
              key={account.account_id} 
              style={{ border: '1px solid #cbd5e1', padding: '16px', borderRadius: '8px', backgroundColor: '#ffffff' }}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <strong>ID: {account.account_id}</strong>
                <span style={{
                  padding: '4px 8px',
                  borderRadius: '4px',
                  fontSize: '0.75rem',
                  fontWeight: 'bold',
                  textTransform: 'uppercase',
                  backgroundColor: '#e2e8f0',
                  color: '#475569'
                }}>
                  {account.role}
                </span>
              </div>
              <p style={{ margin: '8px 0 0 0', fontSize: '0.85rem', color: '#94a3b8' }}>
                <i>Billing managed by owner</i>
              </p>
            </div>
          ))}
        </div>
      )}

    </div>
  );
}