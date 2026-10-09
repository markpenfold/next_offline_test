"use client"

import { useEditorStore } from '@/stores/useEditorStore'
import { useAppStore } from '@/providers/AppStoreProvider'

export function BlogCard(){

    const activeAccount = useAppStore((s) => s.activeAccount)
    const user = useAppStore((s) => s.userId)
    const profile = useAppStore((s) => s.profile)
    const authStatus = useAppStore((s) => s.authStatus)


  return (
    <div>blog details</div>
  )

}