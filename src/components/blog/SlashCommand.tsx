import { Extension } from '@tiptap/core'
import Suggestion, { SuggestionOptions } from '@tiptap/suggestion'
import tippy, { Instance as TippyInstance } from 'tippy.js'
import { ReactRenderer } from '@tiptap/react'
import React, { forwardRef, useEffect, useImperativeHandle, useState } from 'react'
import { Bold, Heading2, Heading3, Heading4, Image as ImageIcon, List, Quote } from 'lucide-react'

import styles from '@/app/styles/editor.module.css'

export interface SlashCommandOptions {
  onImageUpload?: (file: File) => void
  suggestion: Omit<SuggestionOptions, 'editor'>
}

export const COMMANDS = [
  {
    title: 'Heading 2',
    icon: Heading2,
    command: ({ editor, range }: any) => {
      editor.chain().focus().deleteRange(range).setNode('heading', { level: 2 }).run()
    },
  },
  {
    title: 'Heading 3',
    icon: Heading3,
    command: ({ editor, range }: any) => {
      editor.chain().focus().deleteRange(range).setNode('heading', { level: 3 }).run()
    },
  },
  {
    title: 'Heading 4',
    icon: Heading4,
    command: ({ editor, range }: any) => {
      editor.chain().focus().deleteRange(range).setNode('heading', { level: 4 }).run()
    },
  },
  {
    title: 'Image',
    icon: ImageIcon,
    command: ({ editor, range }: any) => {
      // 1. Capture exact cursor position before deleting slash text
      const pos = range.from

      // 2. Clear slash command string
      editor.chain().focus().deleteRange(range).run()

      const input = document.createElement('input')
      input.type = 'file'
      input.accept = 'image/*'

      input.onchange = () => {
        const file = input.files?.[0]
        const onImageUpload = (
          editor.extensionManager.extensions.find(
            (ext: any) => ext.name === 'slashCommand'
          )?.options as any
        )?.onImageUpload

        if (file && typeof onImageUpload === 'function') {
          // Pass file, editor instance, AND exact insertion position
          onImageUpload(file, editor, pos)
        }
      }

      input.click()
    },
  },
  {
    title: 'Bullet List',
    icon: List,
    command: ({ editor, range }: any) => {
      editor.chain().focus().deleteRange(range).toggleBulletList().run()
    },
  },
  {
    title: 'Quote',
    icon: Quote,
    command: ({ editor, range }: any) => {
      editor.chain().focus().deleteRange(range).toggleBlockquote().run()
    },
  },
  {
    title: 'Bold Text',
    icon: Bold,
    command: ({ editor, range }: any) => {
      editor.chain().focus().deleteRange(range).toggleBold().run()
    },
  },
]

const CommandList = forwardRef((props: any, ref) => {
  const [selectedIndex, setSelectedIndex] = useState(0)

  const selectItem = (index: number) => {
    const item = props.items[index]
    if (item) {
      props.command(item)
    }
  }

  useEffect(() => setSelectedIndex(0), [props.items])

  useImperativeHandle(ref, () => ({
    onKeyDown: ({ event }: { event: KeyboardEvent }) => {
      if (event.key === 'ArrowUp') {
        setSelectedIndex((selectedIndex + props.items.length - 1) % props.items.length)
        return true
      }
      if (event.key === 'ArrowDown') {
        setSelectedIndex((selectedIndex + 1) % props.items.length)
        return true
      }
      if (event.key === 'Enter') {
        selectItem(selectedIndex)
        return true
      }
      return false
    },
  }))

  if (!props.items.length) {
    return <div className={styles.slashMenuEmpty}>No results</div>
  }

  return (
    <div className={styles.slashMenuContainer}>
      {props.items.map((item: any, index: number) => {
        const Icon = item.icon
        const isSelected = index === selectedIndex
        return (
          <button
            key={item.title}
            type="button"
            onClick={() => selectItem(index)}
            className={`${styles.slashMenuItem} ${isSelected ? styles.slashMenuItemActive : ''}`}
          >
            <Icon size={16} />
            <span>{item.title}</span>
          </button>
        )
      })}
    </div>
  )
})

CommandList.displayName = 'CommandList'

export const SlashCommand = Extension.create<SlashCommandOptions>({
  name: 'slashCommand',

  addOptions() {
    return {
      onImageUpload: undefined,
      suggestion: {
        char: '/',
        command: ({ editor, range, props }: any) => {
          props.command({ editor, range })
        },
      },
    }
  },

  addProseMirrorPlugins() {
    return [
      Suggestion({
        editor: this.editor,
        ...this.options.suggestion,
      }),
    ]
  },
})

export const renderItems = () => {
  let component: ReactRenderer | null = null
  let popup: TippyInstance[] | null = null

  return {
    onStart: (props: any) => {
      component = new ReactRenderer(CommandList, {
        props,
        editor: props.editor,
      })

      if (!props.clientRect) return

      popup = tippy('body', {
        getReferenceClientRect: props.clientRect,
        appendTo: () => document.body,
        content: component.element,
        showOnCreate: true,
        interactive: true,
        trigger: 'manual',
        placement: 'bottom-start',
      })
    },

    onUpdate(props: any) {
      component?.updateProps(props)

      if (!props.clientRect) return

      popup?.[0]?.setProps({
        getReferenceClientRect: props.clientRect,
      })
    },

    onKeyDown(props: any) {
      if (props.event.key === 'Escape') {
        popup?.[0]?.hide()
        return true
      }
      return (component?.ref as any)?.onKeyDown(props)
    },

    onExit() {
      popup?.[0]?.destroy()
      component?.destroy()
    },
  }
}