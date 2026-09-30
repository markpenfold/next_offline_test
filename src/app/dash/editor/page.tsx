import {WritingTool} from '@/components/blog/WritingTool'
import { SiteNav } from "@/components/identity/SiteNav"
import { Footer } from '@/components/omenland/Footer'

export default function EditorPage() {
  return (
    
<div className='pageContainer'>
    <SiteNav />
    <div className='section'>
      <WritingTool />
    </div>
        <div className='section'>
      <Footer />
    </div>
      </div>

  )
}