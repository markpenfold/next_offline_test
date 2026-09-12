import { SimpleBlogTemplate } from './SimpleBlogTemplate'
import { NewsprintTemplate } from './NewsPrintTemplate'
import { SplitScreenTemplate } from './SplitScreenTemplate'
import { SuperCleanTemplate } from './SuperCleanTemplate'
import { TemplateId } from '@/components/blog/blogHelpers'

interface PostRendererProps {
  post: {
    title: string
    htmlContent: string
    templateId: TemplateId
    authorName?: string
    authorAvatar?: string
  }
}

export function PostRenderer({ post }: PostRendererProps) {
  switch (post.templateId) {
    case 'newsprint':
      return <NewsprintTemplate {...post} />
    case 'split-screen':
      return <SplitScreenTemplate {...post} />
    case 'super-clean':
      return <SuperCleanTemplate {...post} />
    case 'simple-blog':
    default:
      return <SimpleBlogTemplate {...post} />
  }
}