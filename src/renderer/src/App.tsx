import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ChangeEvent,
  type ReactNode
} from 'react'
import * as XLSX from 'xlsx'
import {
  ArrowUpRight,
  BriefcaseBusiness,
  Building2,
  Check,
  CircleHelp,
  FilePenLine,
  FileText,
  FileUp,
  Link2,
  MapPin,
  Moon,
  Pencil,
  Pin,
  Search,
  Settings2,
  ShieldCheck,
  Sparkles,
  Sun,
  Trash2,
  Upload,
  Download,
  X
} from 'lucide-react'
import IndustryFilter from './components/IndustryFilter'
import type { Company, Job, ResumeData, Workspace } from '../../shared/data'
import { dataAPI } from './workspace-api'

type Page = 'companies' | 'resume-edit' | 'resume-upload' | 'settings'
type Theme = 'light' | 'dark' | 'system'
type Preferences = {
  localOnly: boolean
  protectSensitiveFields: boolean
  saveHistory: boolean
  pinSidebarOpen: boolean
}
type SelectedJob = { company: Company; job: Job }
type RawRow = Record<string, unknown>

const companiesKey = 'job-agent.companies.v1'
const themeKey = 'job-agent.theme.v1'
const resumeKey = 'job-agent.resume.v1'
const resumeDraftKey = 'job-agent.resume-draft.v1'
const prefsKey = 'job-agent.preferences.v1'

const starterCompanies: Company[] = [
  {
    id: 'demo-chenhai',
    name: '澄海智能',
    industry: '人工智能',
    city: '上海',
    recruitmentUrl: 'https://careers.example.com',
    jobs: [
      {
        id: 'demo-chenhai-frontend',
        title: '前端开发工程师',
        type: '校招 · 全职',
        salary: '18–25K · 15薪',
        jd: '参与智能协作产品的前端研发与体验优化。要求熟悉 React、TypeScript，理解组件化开发与浏览器基础；有数据可视化或桌面端经验优先。',
        applyUrl: 'https://careers.example.com'
      },
      {
        id: 'demo-chenhai-agent',
        title: 'Agent 应用开发实习生',
        type: '实习',
        salary: '面议',
        jd: '参与大语言模型应用与工具调用流程设计。关注提示词工程、检索增强生成和可靠性评估；能够清晰表达技术方案并持续迭代。',
        applyUrl: 'https://careers.example.com'
      }
    ]
  },
  {
    id: 'demo-zhixu',
    name: '知序科技',
    industry: '企业软件',
    city: '杭州',
    recruitmentUrl: 'https://careers.example.com',
    jobs: [
      {
        id: 'demo-zhixu-product',
        title: '产品研发工程师',
        type: '校招 · 全职',
        salary: '16–22K',
        jd: '负责企业协同平台的功能设计与实现，参与需求拆解、接口联调和质量保障。熟悉一种现代前端框架，具备良好的沟通和文档习惯。',
        applyUrl: 'https://careers.example.com'
      }
    ]
  },
  {
    id: 'demo-yunzhan',
    name: '云栈数据',
    industry: '云计算',
    city: '深圳',
    recruitmentUrl: 'https://careers.example.com',
    jobs: [
      {
        id: 'demo-yunzhan-platform',
        title: '软件研发工程师',
        type: '校招 · 全职',
        salary: '20–28K',
        jd: '参与云平台研发工具建设，协助完善服务端 API 与开发者体验。熟悉 Java、Go 或 TypeScript 中的一种，具备数据结构和网络基础。',
        applyUrl: 'https://careers.example.com'
      }
    ]
  }
]

const emptyResume: ResumeData = {
  name: '',
  targetRole: '',
  city: '',
  email: '',
  summary: '',
  experience: '',
  skills: ''
}

const defaultPreferences: Preferences = {
  localOnly: true,
  protectSensitiveFields: true,
  saveHistory: true,
  pinSidebarOpen: false
}

function readSaved<T>(key: string, fallback: T): T {
  try {
    const value = localStorage.getItem(key)
    return value === null ? fallback : (JSON.parse(value) as T)
  } catch {
    return fallback
  }
}

function makeId(): string {
  return globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(16).slice(2)}`
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : '请稍后重试。'
}

function App(): ReactNode {
  const [page, setPage] = useState<Page>('companies')
  const [companies, setCompanies] = useState<Company[]>(() =>
    readSaved(companiesKey, starterCompanies)
  )
  const [workspace, setWorkspace] = useState<Workspace | null>(null)
  const [dataReady, setDataReady] = useState(false)
  const [editingCompany, setEditingCompany] = useState<Company | null>(null)
  const [editingJob, setEditingJob] = useState<{ companyId: string; job: Job } | null>(null)
  const [theme, setTheme] = useState<Theme>(() => readSaved(themeKey, 'system'))
  const [resume, setResume] = useState<ResumeData>(() => readSaved(resumeKey, emptyResume))
  const [preferences, setPreferences] = useState<Preferences>(() => ({
    ...defaultPreferences,
    ...readSaved<Partial<Preferences>>(prefsKey, {})
  }))
  const [query, setQuery] = useState('')
  const [industryFilter, setIndustryFilter] = useState('全部行业')
  const [selectedJob, setSelectedJob] = useState<SelectedJob | null>(null)
  const [isJobDetailClosing, setIsJobDetailClosing] = useState(false)
  const [applyJob, setApplyJob] = useState<SelectedJob | null>(null)
  const [toast, setToast] = useState('')
  const [resumeFileName, setResumeFileName] = useState('')
  const [savedResume, setSavedResume] = useState(false)
  const [sidebarHovered, setSidebarHovered] = useState(false)
  const fileInput = useRef<HTMLInputElement>(null)
  const resumeInput = useRef<HTMLInputElement>(null)
  const jobDetailCloseTimer = useRef<number | null>(null)
  const requestedPage = useRef<Page>('companies')

  const navigateTo = (nextPage: Page): void => {
    if (nextPage === requestedPage.current) return
    requestedPage.current = nextPage
    setPage(nextPage)
  }

  const closeJobDetails = useCallback(
    (afterClose?: () => void): void => {
      if (!selectedJob || isJobDetailClosing) return
      setIsJobDetailClosing(true)
      jobDetailCloseTimer.current = window.setTimeout(() => {
        setSelectedJob(null)
        setIsJobDetailClosing(false)
        jobDetailCloseTimer.current = null
        afterClose?.()
      }, 210)
    },
    [isJobDetailClosing, selectedJob]
  )

  useEffect(() => {
    const media = window.matchMedia('(prefers-color-scheme: dark)')
    const update = (): void => {
      document.documentElement.dataset.theme =
        theme === 'system' ? (media.matches ? 'dark' : 'light') : theme
    }
    update()
    if (theme === 'system') media.addEventListener('change', update)
    return () => media.removeEventListener('change', update)
  }, [theme])

  useEffect(() => {
    let active = true
    dataAPI
      .load({
        companies: readSaved(companiesKey, starterCompanies),
        resume: readSaved(resumeKey, emptyResume)
      })
      .then((loaded) => {
        if (!active) return
        setWorkspace(loaded)
        setCompanies(loaded.companies)
        setResume(readSaved(resumeDraftKey, loaded.resume))
        localStorage.removeItem(companiesKey)
        localStorage.removeItem(resumeKey)
        setDataReady(true)
      })
      .catch((error) => setToast(`加载本地数据失败：${errorMessage(error)}`))
    return () => {
      active = false
    }
  }, [])
  useEffect(() => localStorage.setItem(themeKey, JSON.stringify(theme)), [theme])
  useEffect(() => {
    if (dataReady) localStorage.setItem(resumeDraftKey, JSON.stringify(resume))
  }, [dataReady, resume])
  useEffect(() => localStorage.setItem(prefsKey, JSON.stringify(preferences)), [preferences])
  useEffect(() => {
    if (!toast) return
    const timer = window.setTimeout(() => setToast(''), 3600)
    return () => window.clearTimeout(timer)
  }, [toast])

  useEffect(
    () => () => {
      if (jobDetailCloseTimer.current !== null) {
        window.clearTimeout(jobDetailCloseTimer.current)
      }
    },
    []
  )

  useEffect(() => {
    if (!selectedJob) return
    const closeOnEscape = (event: KeyboardEvent): void => {
      if (event.key === 'Escape') closeJobDetails()
    }
    window.addEventListener('keydown', closeOnEscape)
    return () => window.removeEventListener('keydown', closeOnEscape)
  }, [closeJobDetails, selectedJob])

  const industries = useMemo(
    () => [
      '全部行业',
      ...Array.from(new Set(companies.map((company) => company.industry).filter(Boolean)))
    ],
    [companies]
  )
  const visibleCompanies = useMemo(() => {
    const needle = query.trim().toLocaleLowerCase()
    return companies.filter((company) => {
      const matchesIndustry = industryFilter === '全部行业' || company.industry === industryFilter
      const text =
        `${company.name} ${company.industry} ${company.city} ${company.jobs.map((job) => job.title).join(' ')}`.toLocaleLowerCase()
      return matchesIndustry && (!needle || text.includes(needle))
    })
  }, [companies, industryFilter, query])
  const jobCount = companies.reduce((total, company) => total + company.jobs.length, 0)

  const saveCompanies = async (next: Company[]): Promise<void> => {
    const saved = await dataAPI.saveCompanies(next)
    setCompanies(saved.companies)
    setWorkspace(saved)
  }

  const saveResume = async (): Promise<void> => {
    try {
      const saved = await dataAPI.saveResume(resume)
      setWorkspace(saved)
      setSavedResume(true)
      setToast('简历资料已保存为新版本。')
    } catch (error) {
      setToast(`保存失败：${errorMessage(error)}`)
    }
  }

  const updateCompany = async (): Promise<void> => {
    if (!editingCompany) return
    if (!editingCompany.name.trim()) {
      setToast('企业名称不能为空。')
      return
    }
    try {
      await saveCompanies(
        companies.map((item) => (item.id === editingCompany.id ? editingCompany : item))
      )
      setEditingCompany(null)
      setToast('企业信息已保存。')
    } catch (error) {
      setToast(`保存失败：${errorMessage(error)}`)
    }
  }

  const deleteCompany = async (company: Company): Promise<void> => {
    if (
      !window.confirm(
        `删除「${company.name}」及其 ${company.jobs.length} 个岗位？投递意向记录仍会保留。`
      )
    )
      return
    try {
      await saveCompanies(companies.filter((item) => item.id !== company.id))
      setToast('企业已删除。')
    } catch (error) {
      setToast(`删除失败：${errorMessage(error)}`)
    }
  }

  const updateJob = async (): Promise<void> => {
    if (!editingJob) return
    if (!editingJob.job.title.trim()) {
      setToast('岗位名称不能为空。')
      return
    }
    try {
      await saveCompanies(
        companies.map((item) =>
          item.id === editingJob.companyId
            ? {
                ...item,
                jobs: item.jobs.map((job) => (job.id === editingJob.job.id ? editingJob.job : job))
              }
            : item
        )
      )
      setEditingJob(null)
      setToast('岗位信息已保存。')
    } catch (error) {
      setToast(`保存失败：${errorMessage(error)}`)
    }
  }

  const deleteJob = async (company: Company, job: Job): Promise<void> => {
    if (!window.confirm(`删除「${company.name}」的「${job.title}」岗位？`)) return
    try {
      await saveCompanies(
        companies.map((item) =>
          item.id === company.id
            ? {
                ...item,
                jobs: item.jobs.filter((candidate) => candidate.id !== job.id)
              }
            : item
        )
      )
      setToast('岗位已删除。')
    } catch (error) {
      setToast(`删除失败：${errorMessage(error)}`)
    }
  }

  const importCompanies = async (event: ChangeEvent<HTMLInputElement>): Promise<void> => {
    const file = event.target.files?.[0]
    event.target.value = ''
    if (!file) return
    if (!dataReady) {
      setToast('本地数据仍在加载，请稍后重试。')
      return
    }
    try {
      const workbook = XLSX.read(await file.arrayBuffer(), { type: 'array' })
      const firstSheet = workbook.Sheets[workbook.SheetNames[0]]
      if (!firstSheet) throw new Error('文件中没有可读取的工作表。')
      const rows = XLSX.utils.sheet_to_json<RawRow>(firstSheet, { defval: '' })
      const imported: Company[] = []
      let skipped = 0
      for (const row of rows) {
        const value = (aliases: string[]): string => {
          const entry = Object.entries(row).find(([key]) =>
            aliases.includes(key.replace(/[\s_-]/g, '').toLocaleLowerCase())
          )
          return entry ? String(entry[1] ?? '').trim() : ''
        }
        const name = value([
          '企业名称',
          '公司名称',
          '公司',
          '企业',
          'company',
          'companyname',
          'name'
        ])
        if (!name) {
          skipped += 1
          continue
        }
        const title = value(['岗位名称', '职位名称', '岗位', '职位', 'jobtitle', 'job', 'title'])
        const jd = value(['岗位描述', '职位描述', 'jd', 'description', 'jobdescription'])
        const applyUrl = value(['投递链接', '申请链接', '网申链接', 'applyurl', 'applylink'])
        const job: Job | null = title
          ? {
              id: makeId(),
              title,
              type: value(['岗位类型', '用工类型', 'jobtype', 'type']),
              salary: value(['薪资', '薪酬', 'salary']),
              jd,
              applyUrl
            }
          : null
        imported.push({
          id: makeId(),
          name,
          industry: value(['行业', '所属行业', 'industry']),
          city: value(['地点', '城市', '工作地点', 'city', 'location']),
          recruitmentUrl: value([
            '招聘链接',
            '官网链接',
            '企业招聘链接',
            'careersurl',
            'recruitmenturl',
            'url'
          ]),
          jobs: job ? [job] : []
        })
      }
      if (!imported.length) throw new Error('没有识别到企业名称。请检查表头或导入模板。')

      const merged = companies.map((company) => ({ ...company, jobs: [...company.jobs] }))
      let newCompanyCount = 0
      let newJobCount = 0
      for (const item of imported) {
        const existing = merged.find(
          (company) =>
            company.name.trim().toLocaleLowerCase() === item.name.trim().toLocaleLowerCase()
        )
        if (!existing) {
          merged.push(item)
          newCompanyCount += 1
          newJobCount += item.jobs.length
          continue
        }
        if (item.industry && !existing.industry) existing.industry = item.industry
        if (item.city && !existing.city) existing.city = item.city
        if (item.recruitmentUrl) existing.recruitmentUrl = item.recruitmentUrl
        for (const job of item.jobs) {
          const duplicate = existing.jobs.some((candidate) => candidate.title === job.title)
          if (!duplicate) {
            existing.jobs.push(job)
            newJobCount += 1
          }
        }
      }
      await saveCompanies(merged)
      navigateTo('companies')
      setToast(
        `导入完成：新增 ${newCompanyCount} 家企业、${newJobCount} 个岗位${skipped ? `，跳过 ${skipped} 行` : ''}`
      )
    } catch (error) {
      setToast(error instanceof Error ? error.message : '导入失败，请检查文件格式。')
    }
  }

  const updateResume = (key: keyof ResumeData, value: string): void => {
    setResume((current) => ({ ...current, [key]: value }))
    setSavedResume(false)
  }

  const chooseResume = (event: ChangeEvent<HTMLInputElement>): void => {
    const file = event.target.files?.[0]
    event.target.value = ''
    if (!file) return
    setResumeFileName(file.name)
    setToast(`已选择 ${file.name}。当前版本尚未解析或持久化文件内容。`)
  }

  const openJobDetails = (selection: SelectedJob): void => {
    if (jobDetailCloseTimer.current !== null) {
      window.clearTimeout(jobDetailCloseTimer.current)
      jobDetailCloseTimer.current = null
    }
    setIsJobDetailClosing(false)
    setSelectedJob(selection)
  }

  return (
    <div className={`app-shell${preferences.pinSidebarOpen ? '' : ' sidebar-auto-collapse'}`}>
      <aside
        className={`sidebar${sidebarHovered ? ' is-hovered' : ''}`}
        onPointerEnter={() => setSidebarHovered(true)}
        onPointerLeave={() => setSidebarHovered(false)}
      >
        <div className="brand">
          <div className="brand-mark">
            <Sparkles size={17} strokeWidth={2.2} />
          </div>
          <div className="brand-copy">
            <strong>求职 Agent</strong>
            <span>PERSONAL WORKSPACE</span>
          </div>
        </div>

        <div className="nav-caption">工作台</div>
        <nav className="main-nav" aria-label="主导航">
          <NavButton
            active={page === 'companies'}
            icon={<Building2 size={17} />}
            label="企业浏览"
            onClick={() => navigateTo('companies')}
          />
          <NavButton
            active={page === 'resume-edit'}
            icon={<FilePenLine size={17} />}
            label="简历修改"
            onClick={() => navigateTo('resume-edit')}
          />
          <NavButton
            active={page === 'resume-upload'}
            icon={<FileUp size={17} />}
            label="简历上传"
            onClick={() => navigateTo('resume-upload')}
          />
        </nav>

        <div className="sidebar-bottom">
          <div className="local-note">
            <ShieldCheck size={15} />
            <span>个人数据保存在本机</span>
          </div>
          <div className="sidebar-settings-row">
            <NavButton
              active={page === 'settings'}
              icon={<Settings2 size={17} />}
              label="设置"
              onClick={() => navigateTo('settings')}
            />
            <button
              className="sidebar-mode-button"
              type="button"
              title={preferences.pinSidebarOpen ? '取消固定展开' : '固定侧栏展开'}
              aria-label={preferences.pinSidebarOpen ? '取消固定展开侧栏' : '固定展开侧栏'}
              aria-pressed={preferences.pinSidebarOpen}
              onClick={() =>
                setPreferences((current) => ({
                  ...current,
                  pinSidebarOpen: !current.pinSidebarOpen
                }))
              }
            >
              <Pin size={15} />
            </button>
          </div>
          <div className="sidebar-version">
            <span className="online-dot" />
            <span className="sidebar-version-label">初步体验版</span>
            <span className="sidebar-version-number">0.1</span>
          </div>
        </div>
      </aside>

      <main className="main-panel">
        <header className="topbar">
          <div className="breadcrumb">
            <span>求职 Agent</span>
            <span className="crumb-divider">/</span>
            <strong>{pageTitle(page)}</strong>
          </div>
          <div className="topbar-right">
            <span className="agent-state">
              <span className="state-dot" /> Agent 就绪
            </span>
            <span className="topbar-divider" />
            <button
              className="icon-button"
              title="帮助"
              aria-label="帮助"
              onClick={() => setToast('帮助与使用说明将在后续版本补充。')}
            >
              <CircleHelp size={17} />
            </button>
          </div>
        </header>

        <div className="page-scroll" key={page}>
          {page === 'companies' && (
            <section className="content companies-page">
              <div className="page-heading">
                <div>
                  <div className="eyebrow">秋招工作台</div>
                  <h1>企业与岗位</h1>
                  <p>先了解岗位，再决定是否让 Agent 协助完成这一次申请。</p>
                </div>
                <button
                  className="button button-primary"
                  disabled={!dataReady}
                  onClick={() => fileInput.current?.click()}
                >
                  <Upload size={16} /> 导入企业
                </button>
                <input
                  ref={fileInput}
                  className="visually-hidden"
                  type="file"
                  accept=".xlsx,.xls,.csv,.tsv"
                  onChange={importCompanies}
                />
              </div>

              <div className="summary-strip">
                <div className="summary-item">
                  <span className="summary-icon icon-neutral">
                    <Building2 size={17} />
                  </span>
                  <span>
                    <strong>{companies.length}</strong>
                    <small>家企业</small>
                  </span>
                </div>
                <div className="summary-item">
                  <span className="summary-icon icon-accent">
                    <BriefcaseBusiness size={17} />
                  </span>
                  <span>
                    <strong>{jobCount}</strong>
                    <small>个岗位</small>
                  </span>
                </div>
                <div className="summary-note">
                  {companies.some((company) => company.id.startsWith('demo-')) && (
                    <span className="demo-label">含示例数据</span>
                  )}
                  <span>可导入 .xlsx、.xls、.csv 企业与岗位清单</span>
                </div>
              </div>

              <div className="list-toolbar">
                <div className="search-control">
                  <Search size={16} />
                  <input
                    value={query}
                    onChange={(event) => setQuery(event.target.value)}
                    placeholder="搜索企业、岗位或城市"
                    aria-label="搜索企业、岗位或城市"
                  />
                </div>
                <IndustryFilter
                  value={industryFilter}
                  onChange={setIndustryFilter}
                  options={industries.map((industry) => ({
                    value: industry,
                    count:
                      industry === '全部行业'
                        ? companies.length
                        : companies.filter((company) => company.industry === industry).length
                  }))}
                />
                <span className="result-count">显示 {visibleCompanies.length} 家</span>
              </div>

              <div className="company-list">
                {visibleCompanies.length ? (
                  visibleCompanies.map((company) => (
                    <article className="company-row" key={company.id}>
                      <div className="company-main">
                        <div className="company-avatar">{company.name.slice(0, 1)}</div>
                        <div className="company-identity">
                          <div className="company-name-line">
                            <h2>{company.name}</h2>
                            <span className="industry-tag">{company.industry || '行业未填写'}</span>
                          </div>
                          <div className="company-meta">
                            <span>
                              <MapPin size={13} />
                              {company.city || '地点未填写'}
                            </span>
                            {company.recruitmentUrl ? (
                              <a href={company.recruitmentUrl} target="_blank" rel="noreferrer">
                                <Link2 size={13} />
                                招聘主页
                                <ArrowUpRight size={12} />
                              </a>
                            ) : (
                              <span className="muted-meta">
                                <Link2 size={13} />
                                未添加招聘链接
                              </span>
                            )}
                          </div>
                        </div>
                        <span className="job-total">{company.jobs.length} 个岗位</span>
                        <div className="manage-actions">
                          <button
                            className="icon-button"
                            title="编辑企业"
                            aria-label={`编辑${company.name}`}
                            onClick={() => setEditingCompany({ ...company })}
                          >
                            <Pencil size={14} />
                          </button>
                          <button
                            className="icon-button"
                            title="删除企业"
                            aria-label={`删除${company.name}`}
                            onClick={() => void deleteCompany(company)}
                          >
                            <Trash2 size={14} />
                          </button>
                        </div>
                      </div>
                      {company.jobs.length ? (
                        <div className="job-list">
                          {company.jobs.map((job) => (
                            <div className="job-row" key={job.id}>
                              <div className="job-info">
                                <strong>{job.title}</strong>
                                <div className="job-meta">
                                  <span>{job.type || '岗位类型未填写'}</span>
                                  {job.salary && (
                                    <>
                                      <i /> <span>{job.salary}</span>
                                    </>
                                  )}
                                </div>
                              </div>
                              <div className="job-actions">
                                <button
                                  className="icon-button"
                                  title="编辑岗位"
                                  aria-label={`编辑${job.title}`}
                                  onClick={() =>
                                    setEditingJob({ companyId: company.id, job: { ...job } })
                                  }
                                >
                                  <Pencil size={14} />
                                </button>
                                <button
                                  className="icon-button"
                                  title="删除岗位"
                                  aria-label={`删除${job.title}`}
                                  onClick={() => void deleteJob(company, job)}
                                >
                                  <Trash2 size={14} />
                                </button>
                                <button
                                  className="button button-subtle"
                                  onClick={() => openJobDetails({ company, job })}
                                >
                                  查看 JD
                                </button>
                                <button
                                  className="button button-apply"
                                  onClick={() => setApplyJob({ company, job })}
                                >
                                  <ArrowUpRight size={15} />
                                  投递
                                </button>
                              </div>
                            </div>
                          ))}
                        </div>
                      ) : (
                        <div className="no-jobs">
                          这家企业暂未添加岗位信息。导入包含岗位名称的表格后会显示在这里。
                        </div>
                      )}
                    </article>
                  ))
                ) : (
                  <div className="empty-state">
                    <Search size={20} />
                    <strong>没有找到匹配企业</strong>
                    <span>试试调整搜索内容或行业筛选。</span>
                  </div>
                )}
              </div>
              <div className="page-footnote">
                <ShieldCheck size={14} /> 投递由你逐个岗位发起；本版本不会批量申请或代替你提交表单。
              </div>
            </section>
          )}

          {page === 'resume-edit' && (
            <section className="content narrow-content">
              <div className="page-heading">
                <div>
                  <div className="eyebrow">个人资料</div>
                  <h1>简历修改</h1>
                  <p>整理基础信息和经历，后续可用于岗位匹配与定制建议。</p>
                </div>
                <button
                  className="button button-primary"
                  disabled={!dataReady}
                  onClick={() => void saveResume()}
                >
                  <Check size={16} /> 保存修改
                </button>
              </div>
              <div className="form-section">
                <div className="section-title">
                  <div>
                    <h2>基本信息</h2>
                    <p>仅在本机保存，当前版本不上传至云端。</p>
                  </div>
                  <span className="local-badge">
                    <ShieldCheck size={14} />
                    本地保存
                  </span>
                </div>
                <div className="form-grid">
                  <TextField
                    label="姓名"
                    value={resume.name}
                    onChange={(value) => updateResume('name', value)}
                    placeholder="填写姓名"
                  />
                  <TextField
                    label="意向岗位"
                    value={resume.targetRole}
                    onChange={(value) => updateResume('targetRole', value)}
                    placeholder="例如：前端开发工程师"
                  />
                  <TextField
                    label="意向城市"
                    value={resume.city}
                    onChange={(value) => updateResume('city', value)}
                    placeholder="例如：杭州、上海"
                  />
                  <TextField
                    label="联系邮箱"
                    value={resume.email}
                    onChange={(value) => updateResume('email', value)}
                    placeholder="name@example.com"
                  />
                  <TextField
                    wide
                    label="个人简介"
                    value={resume.summary}
                    onChange={(value) => updateResume('summary', value)}
                    placeholder="用几句话概括你的方向、优势与求职目标"
                    multiline
                  />
                  <TextField
                    wide
                    label="项目 / 实习经历"
                    value={resume.experience}
                    onChange={(value) => updateResume('experience', value)}
                    placeholder="描述你做了什么、解决了什么问题、取得了什么结果"
                    multiline
                    rows={6}
                  />
                  <TextField
                    wide
                    label="技能与工具"
                    value={resume.skills}
                    onChange={(value) => updateResume('skills', value)}
                    placeholder="例如：React、TypeScript、Git；请只填写真实掌握的技能"
                    multiline
                    rows={3}
                  />
                </div>
                <div className="form-bottom">
                  <span>
                    {savedResume ? '修改已保存' : '草稿自动暂存；保存后纳入本地备份和版本历史'}
                  </span>
                  <button
                    className="button button-primary"
                    disabled={!dataReady}
                    onClick={() => void saveResume()}
                  >
                    保存资料
                  </button>
                </div>
              </div>
              <div className="settings-section">
                <div className="section-title">
                  <div>
                    <h2>已保存版本</h2>
                    <p>选择一个版本可恢复到编辑表单；恢复后需再次保存。</p>
                  </div>
                </div>
                {workspace?.resumeVersions.length ? (
                  workspace.resumeVersions.map((version) => (
                    <div className="about-row" key={version.id}>
                      <span>
                        {new Date(version.createdAt).toLocaleString('zh-CN')} ·{' '}
                        {version.data.targetRole || '未填写意向岗位'}
                      </span>
                      <button
                        className="button button-subtle"
                        onClick={() => {
                          setResume({ ...version.data })
                          setSavedResume(false)
                          setToast('已载入历史版本，保存后才会写入当前资料。')
                        }}
                      >
                        载入
                      </button>
                    </div>
                  ))
                ) : (
                  <p className="muted-meta">尚无已保存版本。</p>
                )}
              </div>
              <div className="info-callout">
                <Sparkles size={17} />
                <div>
                  <strong>Agent 会如何使用这些信息</strong>
                  <p>
                    后续接入后，Agent
                    可按岗位提取要求、指出经历差距并提供简历修改建议；不会自行编造经历或技能。
                  </p>
                </div>
              </div>
            </section>
          )}

          {page === 'resume-upload' && (
            <section className="content narrow-content">
              <div className="page-heading">
                <div>
                  <div className="eyebrow">简历文件</div>
                  <h1>简历上传</h1>
                  <p>选择现有简历，作为后续解析与岗位匹配的输入。</p>
                </div>
              </div>
              <div className="upload-panel">
                <input
                  ref={resumeInput}
                  className="visually-hidden"
                  type="file"
                  accept=".pdf,.doc,.docx"
                  onChange={chooseResume}
                />
                <div className="upload-icon">
                  <FileText size={22} />
                </div>
                <h2>{resumeFileName || '选择一份简历文件'}</h2>
                <p>支持 PDF、DOC、DOCX。文件只在本次体验中选择，不会上传至网络。</p>
                <button
                  className="button button-primary"
                  onClick={() => resumeInput.current?.click()}
                >
                  <Upload size={16} />
                  选择文件
                </button>
                <div className="upload-limit">
                  <ShieldCheck size={14} /> 当前版本尚未实现文件解析或持久化存储
                </div>
              </div>
              <div className="section-title upload-next">
                <div>
                  <h2>下一步</h2>
                  <p>上传功能接入后，Agent 将先展示识别结果供你校对。</p>
                </div>
              </div>
              <div className="upload-steps">
                <div>
                  <span>01</span>
                  <strong>解析简历结构</strong>
                  <small>提取教育、经历、技能等信息</small>
                </div>
                <div>
                  <span>02</span>
                  <strong>校对识别结果</strong>
                  <small>修正错漏，保留真实经历</small>
                </div>
                <div>
                  <span>03</span>
                  <strong>用于岗位分析</strong>
                  <small>按单个岗位生成匹配依据</small>
                </div>
              </div>
            </section>
          )}

          {page === 'settings' && (
            <section className="content narrow-content settings-page">
              <div className="page-heading">
                <div>
                  <div className="eyebrow">偏好与隐私</div>
                  <h1>设置</h1>
                  <p>调整界面外观和个人数据处理偏好。</p>
                </div>
              </div>
              <div className="settings-section">
                <div className="section-title">
                  <div>
                    <h2>外观</h2>
                    <p>选择应用的颜色主题。</p>
                  </div>
                </div>
                <div className="theme-options">
                  <ThemeOption
                    active={theme === 'light'}
                    icon={<Sun size={17} />}
                    label="日间"
                    onClick={() => setTheme('light')}
                  />
                  <ThemeOption
                    active={theme === 'dark'}
                    icon={<Moon size={17} />}
                    label="夜间"
                    onClick={() => setTheme('dark')}
                  />
                  <ThemeOption
                    active={theme === 'system'}
                    icon={<Settings2 size={17} />}
                    label="跟随系统"
                    onClick={() => setTheme('system')}
                  />
                </div>
              </div>
              <div className="settings-section">
                <div className="section-title">
                  <div>
                    <h2>隐私与 Agent 行为</h2>
                    <p>首版仅保存偏好；真实投递流程尚未接入。</p>
                  </div>
                </div>
                <PreferenceRow
                  title="数据默认保存在本机"
                  description="不将简历和企业清单发送到服务端。"
                  checked={preferences.localOnly}
                  onChange={(checked) =>
                    setPreferences((current) => ({ ...current, localOnly: checked }))
                  }
                />
                <PreferenceRow
                  title="敏感或不确定字段交由我处理"
                  description="后续网申遇到隐私字段、验证码或不确定答案时暂停自动填写。"
                  checked={preferences.protectSensitiveFields}
                  onChange={(checked) =>
                    setPreferences((current) => ({ ...current, protectSensitiveFields: checked }))
                  }
                />
                <PreferenceRow
                  title="保存单岗位投递记录"
                  description="只记录你明确点击投递的岗位，不支持批量申请。"
                  checked={preferences.saveHistory}
                  onChange={(checked) =>
                    setPreferences((current) => ({ ...current, saveHistory: checked }))
                  }
                />
              </div>
              <div className="settings-section settings-about">
                <div className="section-title">
                  <div>
                    <h2>应用信息</h2>
                    <p>求职 Agent · Windows 桌面应用</p>
                  </div>
                  <span className="version-tag">初步体验版 0.1</span>
                </div>
                <div className="about-row">
                  <span>本地数据范围</span>
                  <strong>此设备上的应用存储</strong>
                </div>
                <div className="about-row">
                  <span>自动网申</span>
                  <strong className="coming-soon">尚未连接招聘平台</strong>
                </div>
              </div>
              <div className="settings-section">
                <div className="section-title">
                  <div>
                    <h2>本地数据</h2>
                    <p>备份包含企业岗位、简历资料与历史版本、投递意向记录，请妥善保管文件。</p>
                  </div>
                </div>
                <div className="data-actions">
                  <button
                    className="button button-secondary"
                    onClick={async () => {
                      try {
                        if (await dataAPI.backup()) setToast('本地数据已备份。')
                      } catch (error) {
                        setToast(`备份失败：${errorMessage(error)}`)
                      }
                    }}
                  >
                    <Download size={15} /> 导出备份
                  </button>
                  <button
                    className="button button-secondary"
                    disabled={!dataReady}
                    onClick={async () => {
                      if (
                        !window.confirm(
                          '恢复会覆盖当前企业、简历与投递意向数据。请先导出备份。确定继续？'
                        )
                      )
                        return
                      try {
                        const restored = await dataAPI.restore()
                        if (!restored) return
                        setWorkspace(restored)
                        setCompanies(restored.companies)
                        setResume(restored.resume)
                        setDataReady(true)
                        setSavedResume(true)
                        setToast('数据已恢复。')
                      } catch (error) {
                        setToast(`恢复失败：${errorMessage(error)}`)
                      }
                    }}
                  >
                    <Upload size={15} /> 从备份恢复
                  </button>
                </div>
                <div className="section-title history-heading">
                  <div>
                    <h2>投递意向</h2>
                    <p>仅是本地记录，不代表已提交网申。</p>
                  </div>
                </div>
                {workspace?.applicationIntents.length ? (
                  workspace.applicationIntents.map((intent) => (
                    <div className="about-row" key={intent.id}>
                      <span>
                        {intent.companyName} · {intent.jobTitle}
                      </span>
                      <strong>{new Date(intent.createdAt).toLocaleDateString('zh-CN')}</strong>
                    </div>
                  ))
                ) : (
                  <p className="muted-meta">暂无投递意向。</p>
                )}
              </div>
              <div className="settings-help">
                <CircleHelp size={16} />
                <span>
                  企业 Excel
                  导入支持公司名称、行业、城市、招聘链接、岗位名称、岗位类型、薪资、岗位描述和投递链接等列。
                </span>
              </div>
            </section>
          )}
        </div>
      </main>

      {selectedJob && (
        <>
          <button
            className={`drawer-backdrop${isJobDetailClosing ? ' is-closing' : ''}`}
            aria-label="关闭岗位详情"
            onClick={() => closeJobDetails()}
          />
          <section
            className={`detail-modal${isJobDetailClosing ? ' is-closing' : ''}`}
            role="dialog"
            aria-modal="true"
            aria-label="岗位详情"
          >
            <div className="drawer-header">
              <div>
                <span className="eyebrow">岗位详情</span>
                <h2>{selectedJob.job.title}</h2>
              </div>
              <button
                className="icon-button"
                title="关闭"
                aria-label="关闭"
                onClick={() => closeJobDetails()}
              >
                <X size={18} />
              </button>
            </div>
            <div className="drawer-scroll">
              <div className="drawer-facts">
                <span>{selectedJob.job.type || '岗位类型未填写'}</span>
                {selectedJob.job.salary && <span>{selectedJob.job.salary}</span>}
              </div>
              <section className="drawer-section">
                <h3>职位描述</h3>
                <p className="jd-copy">
                  {selectedJob.job.jd || '这条岗位记录暂未填写 JD。你可以通过 Excel 导入岗位描述。'}
                </p>
              </section>
              <section className="drawer-section agent-preview">
                <div className="agent-preview-heading">
                  <span className="agent-icon">
                    <Sparkles size={15} />
                  </span>
                  <h3>Agent 岗位分析</h3>
                </div>
                <p>
                  添加简历资料并接入分析能力后，这里将展示岗位要求、匹配依据和经历差距。当前不会生成虚构的匹配分数。
                </p>
                <button
                  className="text-action"
                  onClick={() => {
                    closeJobDetails(() => navigateTo('resume-edit'))
                  }}
                >
                  完善简历资料 <ArrowUpRight size={14} />
                </button>
              </section>
              <section className="drawer-section">
                <h3>投递准备</h3>
                <div className="check-row">
                  <span className="check-empty" />
                  简历资料已完善
                </div>
                <div className="check-row">
                  <span className="check-empty" />
                  已核对岗位描述
                </div>
              </section>
            </div>
            <div className="drawer-footer">
              <button className="button button-secondary" onClick={() => closeJobDetails()}>
                关闭
              </button>
              <button
                className="button button-apply"
                onClick={() => {
                  const selection = selectedJob
                  closeJobDetails(() => setApplyJob(selection))
                }}
              >
                <ArrowUpRight size={15} />
                投递此岗位
              </button>
            </div>
          </section>
        </>
      )}

      {applyJob && (
        <div
          className="modal-backdrop"
          role="presentation"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) setApplyJob(null)
          }}
        >
          <section
            className="apply-modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="apply-title"
          >
            <button
              className="icon-button modal-close"
              title="关闭"
              aria-label="关闭"
              onClick={() => setApplyJob(null)}
            >
              <X size={18} />
            </button>
            <span className="modal-symbol">
              <BriefcaseBusiness size={20} />
            </span>
            <div className="eyebrow">单岗位投递</div>
            <h2 id="apply-title">{applyJob.job.title}</h2>
            <p>
              你已明确选择这个岗位。后续版本将由 Agent
              协助完成该岗位的网申流程，并在提交前处理需要你确认的信息。
            </p>
            <div className="modal-notice">
              <ShieldCheck size={16} />
              <span>当前体验版尚未接入招聘网站，未打开网页、填写信息或提交申请。</span>
            </div>
            <div className="modal-actions">
              <button className="button button-secondary" onClick={() => setApplyJob(null)}>
                返回岗位列表
              </button>
              <button
                className="button button-primary"
                onClick={async () => {
                  if (!preferences.saveHistory) {
                    setToast('请先在设置中开启“保存单岗位投递记录”。')
                    return
                  }
                  try {
                    const saved = await dataAPI.addIntent(applyJob.company.id, applyJob.job.id)
                    setWorkspace(saved)
                    setApplyJob(null)
                    setToast('已记录这次单岗位投递意向；尚未提交真实网申。')
                  } catch (error) {
                    setToast(errorMessage(error))
                  }
                }}
              >
                记录投递意向
              </button>
            </div>
          </section>
        </div>
      )}

      {editingCompany && (
        <div
          className="modal-backdrop"
          role="presentation"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) setEditingCompany(null)
          }}
        >
          <section className="edit-modal" role="dialog" aria-modal="true" aria-label="编辑企业">
            <div className="edit-modal-header">
              <h2>编辑企业</h2>
              <button
                className="icon-button"
                title="关闭"
                aria-label="关闭"
                onClick={() => setEditingCompany(null)}
              >
                <X size={18} />
              </button>
            </div>
            <div className="form-grid">
              {(
                [
                  ['name', '企业名称'],
                  ['industry', '行业'],
                  ['city', '地点'],
                  ['recruitmentUrl', '招聘链接']
                ] as const
              ).map(([key, label]) => (
                <TextField
                  key={key}
                  wide={key === 'recruitmentUrl'}
                  label={label}
                  placeholder=""
                  value={editingCompany[key]}
                  onChange={(value) =>
                    setEditingCompany((current) => (current ? { ...current, [key]: value } : null))
                  }
                />
              ))}
            </div>
            <div className="edit-modal-footer">
              <button className="button button-secondary" onClick={() => setEditingCompany(null)}>
                取消
              </button>
              <button className="button button-primary" onClick={() => void updateCompany()}>
                保存
              </button>
            </div>
          </section>
        </div>
      )}

      {editingJob && (
        <div
          className="modal-backdrop"
          role="presentation"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) setEditingJob(null)
          }}
        >
          <section className="edit-modal" role="dialog" aria-modal="true" aria-label="编辑岗位">
            <div className="edit-modal-header">
              <h2>编辑岗位</h2>
              <button
                className="icon-button"
                title="关闭"
                aria-label="关闭"
                onClick={() => setEditingJob(null)}
              >
                <X size={18} />
              </button>
            </div>
            <div className="form-grid">
              {(
                [
                  ['title', '岗位名称'],
                  ['type', '岗位类型'],
                  ['salary', '薪资'],
                  ['applyUrl', '投递链接'],
                  ['jd', '岗位描述']
                ] as const
              ).map(([key, label]) => (
                <TextField
                  key={key}
                  wide={key === 'jd' || key === 'applyUrl'}
                  multiline={key === 'jd'}
                  label={label}
                  placeholder=""
                  value={editingJob.job[key]}
                  onChange={(value) =>
                    setEditingJob((current) =>
                      current ? { ...current, job: { ...current.job, [key]: value } } : null
                    )
                  }
                />
              ))}
            </div>
            <div className="edit-modal-footer">
              <button className="button button-secondary" onClick={() => setEditingJob(null)}>
                取消
              </button>
              <button className="button button-primary" onClick={() => void updateJob()}>
                保存
              </button>
            </div>
          </section>
        </div>
      )}

      {toast && (
        <div className="toast" role="status">
          <span className="toast-mark">
            <Check size={14} />
          </span>
          {toast}
          <button className="toast-close" aria-label="关闭提示" onClick={() => setToast('')}>
            <X size={14} />
          </button>
        </div>
      )}
    </div>
  )
}

function pageTitle(page: Page): string {
  return {
    companies: '企业浏览',
    'resume-edit': '简历修改',
    'resume-upload': '简历上传',
    settings: '设置'
  }[page]
}

function NavButton({
  active,
  icon,
  label,
  onClick
}: {
  active: boolean
  icon: ReactNode
  label: string
  onClick: () => void
}): ReactNode {
  return (
    <button
      className={`nav-button${active ? ' active' : ''}`}
      onClick={onClick}
      aria-current={active ? 'page' : undefined}
      title={label}
    >
      {icon}
      <span>{label}</span>
      {active && <span className="nav-indicator" />}
    </button>
  )
}

function TextField({
  label,
  value,
  onChange,
  placeholder,
  wide,
  multiline,
  rows = 4
}: {
  label: string
  value: string
  onChange: (value: string) => void
  placeholder: string
  wide?: boolean
  multiline?: boolean
  rows?: number
}): ReactNode {
  return (
    <label className={`form-field${wide ? ' field-wide' : ''}`}>
      <span>{label}</span>
      {multiline ? (
        <textarea
          value={value}
          rows={rows}
          onChange={(event) => onChange(event.target.value)}
          placeholder={placeholder}
        />
      ) : (
        <input
          value={value}
          onChange={(event) => onChange(event.target.value)}
          placeholder={placeholder}
        />
      )}
    </label>
  )
}

function ThemeOption({
  active,
  icon,
  label,
  onClick
}: {
  active: boolean
  icon: ReactNode
  label: string
  onClick: () => void
}): ReactNode {
  return (
    <button
      className={`theme-option${active ? ' selected' : ''}`}
      onClick={onClick}
      aria-pressed={active}
    >
      {icon}
      <span>{label}</span>
      {active && <Check size={15} className="theme-check" />}
    </button>
  )
}

function PreferenceRow({
  title,
  description,
  checked,
  onChange
}: {
  title: string
  description: string
  checked: boolean
  onChange: (checked: boolean) => void
}): ReactNode {
  return (
    <label className="preference-row">
      <span className="preference-copy">
        <strong>{title}</strong>
        <small>{description}</small>
      </span>
      <input
        type="checkbox"
        checked={checked}
        onChange={(event) => onChange(event.target.checked)}
      />
      <span className="switch" aria-hidden="true" />
    </label>
  )
}

export default App
