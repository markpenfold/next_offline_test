import Image from "next/image"
import styles from '@/app/styles/styles.module.css'
import { cookies } from 'next/headers'
import { redirect } from 'next/navigation'
import Link from 'next/link'

export default async function ConfirmPage() {
    const cookieStore = await cookies()
    const pending = cookieStore.get('allow_confirm')
    
    if (!pending) {
        console.log('no cookie for sign up?', pending)
        redirect('/')
      }

  return (
    <div className={styles.page}>
      <main className={styles.main}>
      <h2>Confirm your sign up</h2>
        An email has been sent to your sign up address. 
        <br></br>
        Your dashboard is <Link href='/dash' className={styles.brandLink}> here</Link>
      </main>
    </div>
  );
}