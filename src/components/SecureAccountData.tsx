// 📄 src/components/SecureServerData.tsx
import { createClient } from '@/lib/supabase/server';
import { Database, Tables } from '@/lib/database_types'
import { SupabaseClient, QueryData } from '@supabase/supabase-js'
import { getActiveUserAccounts } from '@/lib/supabase/queries';

export default async function SecureAccoutData() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  // If unauthorized, return absolutely nothing to the client
  if (!user) return null;

  const accountList = await getActiveUserAccounts(user.id);
  
  if (!accountList || accountList.length === 0) {
    return <div>You don't own any accounts yet.</div>;
  }

  return (
    <div>
      <h3>Your Owned Accounts ({accountList.length})</h3>
      
      <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
        {accountList.map((membership) => {
          // Extract the account object from the array Supabase returned
          const accountDetails = Array.isArray(membership.accounts) 
            ? membership.accounts[0] 
            : membership.accounts;

          return (
            <div 
              key={membership.account_id} 
              style={{ border: '1px solid #cbd5e1', padding: '12px', borderRadius: '6px' }}
            >
              <p style={{ margin: 0 }}><strong>Account ID:</strong> {membership.account_id}</p>
              
              {/* 🟢 Safely access the stripe customer ID */}
              <p style={{ margin: '4px 0 0 0', color: '#475569' }}>
                <strong>Stripe Customer ID:</strong> {accountDetails?.stripe_customer_id || 'None'}
              </p>
            </div>
          );
        })}
      </div>
    </div>
  );
}
  