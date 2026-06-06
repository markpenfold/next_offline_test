
import Link from 'next/link'
import classes from '@/app/styles/styles.module.css'

// this page needs a support email form
export default function AuthError() {
    return (
      <div>
        <main >
         <div className={classes.p4}>
        <h2> There seems to have been an error with your sign up.</h2>
        Please <Link href="/signup" className={classes.brandLink}>try again</Link>
    </div>
        </main>
      </div>
    );
  }