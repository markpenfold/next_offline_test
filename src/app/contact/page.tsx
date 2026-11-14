'use client'

import classes from '@/app/styles/pricing.module.css'

import { useAppStore } from "@/providers/AppStoreProvider";
import { SiteNav } from '@/components/identity/SiteNav'
import { ContactUsCard } from '@/components/dash/ContactUsCard';
import {Footer} from '@/components/omenland/Footer'

export default function ContactPage() {   
  const currentTier = useAppStore((s) => s.tier);
  const profile = useAppStore((s) => s.profile);
  const activeAccount = useAppStore((s) => s.activeAccount);

  return (
    <>
      <SiteNav />
      <div className={classes.pageContainer}>

        <ContactUsCard/>
 
      </div>
             <Footer />
    </>
  )
}