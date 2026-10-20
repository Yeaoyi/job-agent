import type { ResumeData } from './data'

export const emptyResume: ResumeData = {
  name: '',
  phone: '',
  targetRole: '',
  city: '',
  email: '',
  summary: '',
  education: '',
  experience: '',
  skills: ''
}

export const resumeFields: { key: keyof ResumeData; label: string; multiline?: boolean }[] = [
  { key: 'name', label: '姓名' },
  { key: 'phone', label: '联系电话' },
  { key: 'email', label: '联系邮箱' },
  { key: 'targetRole', label: '意向岗位' },
  { key: 'city', label: '意向城市' },
  { key: 'summary', label: '个人简介', multiline: true },
  { key: 'education', label: '教育经历', multiline: true },
  { key: 'experience', label: '项目 / 实习 / 工作经历', multiline: true },
  { key: 'skills', label: '技能与工具', multiline: true }
]

export const resumeKeys = resumeFields.map(({ key }) => key)

// Only recognize explicit labels/sections; never infer qualifications or invent content.
export function extractResumeFields(text: string): ResumeData {
  const fields = { ...emptyResume }
  const lines = text
    .replace(/\r\n?/g, '\n')
    .split('\n')
    .map((line) => line.trim())
  const labels: Partial<Record<keyof ResumeData, string>> = {
    name: '姓名|Name',
    phone: '联系电话|联系方式|手机号码|手机号|电话|手机|Phone|Mobile',
    email: '联系邮箱|电子邮箱|邮箱|E-?mail',
    targetRole: '求职意向|意向岗位|应聘岗位|目标岗位|Target Role',
    city: '意向城市|期望城市|求职城市|意向地点'
  }
  const stop =
    '(?=\\s+(?:姓名|电话|手机|邮箱|求职意向|意向岗位|意向城市|年龄|性别|学历)\\s*[:：]|[|｜]|$)'
  for (const [key, label] of Object.entries(labels)) {
    const match = text.match(
      new RegExp(`(?:^|[\\s|｜])(?:${label})\\s*[:：]\\s*(.+?)${stop}`, 'im')
    )
    if (match) fields[key as keyof ResumeData] = match[1].trim()
  }
  fields.email = text.match(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i)?.[0] ?? ''
  const phone = text.match(/(?:\+?86[ -]?)?(?<!\d)1[3-9]\d(?:[ -]?\d){8}(?!\d)/)
  if (phone) fields.phone = phone[0]
  const headings: { pattern: RegExp; key?: keyof ResumeData }[] = [
    { pattern: /^(个人简介|个人总结|自我评价|个人优势|Profile|Summary)$/i, key: 'summary' },
    { pattern: /^(教育背景|教育经历|教育信息|Education)$/i, key: 'education' },
    {
      pattern:
        /^(项目经历|项目经验|实习经历|工作经历|工作经验|实践经历|校园经历|Experience|Projects?)$/i,
      key: 'experience'
    },
    { pattern: /^(专业技能|个人技能|技能清单|技术栈|技能与工具|技能|Skills?)$/i, key: 'skills' },
    {
      pattern:
        /^(基本信息|个人信息|获奖经历|荣誉奖项|证书|兴趣爱好|联系方式|求职意向|Awards?|Certifications?)$/i
    }
  ]
  let section: keyof ResumeData | undefined
  for (const line of lines) {
    const heading = headings.find(({ pattern }) => pattern.test(line.replace(/[：:]$/, '').trim()))
    if (heading) {
      section = heading.key
      continue
    }
    if (section && line) fields[section] += `${fields[section] ? '\n' : ''}${line}`
  }
  return fields
}

export function mergeReviewedResume(
  base: ResumeData,
  fields: ResumeData,
  selected: (keyof ResumeData)[]
): ResumeData {
  const next = { ...base }
  for (const key of selected) next[key] = fields[key]
  return next
}
