import {
  FileText,
  Upload,
  ShieldCheck,
  LoaderCircle,
  ExternalLink,
  Trash2,
  Check
} from 'lucide-react'
import { useState, type ReactNode } from 'react'
import type { ResumeData, ResumeDocument, Workspace } from '../../../shared/data'
import { resumeFields } from '../../../shared/resume'
import { dataAPI } from '../workspace-api'

export type ReviewDraft = { fields: ResumeData; selected: (keyof ResumeData)[] }

function hasReviewChanges(doc: ResumeDocument, draft: ReviewDraft): boolean {
  return resumeFields.some(
    ({ key }) =>
      doc.fields[key] !== draft.fields[key] ||
      doc.selectedFields.includes(key) !== draft.selected.includes(key)
  )
}

type Props = {
  workspace: Workspace | null
  resume: ResumeData
  busy: boolean
  setBusy: (busy: boolean) => void
  drafts: Record<string, ReviewDraft>
  setDraft: (id: string, draft: ReviewDraft) => void
  activeId: string
  setActiveId: (id: string) => void
  onWorkspace: (workspace: Workspace) => void
  onConfirmed: (workspace: Workspace) => void
}

export default function ResumeUpload(props: Props): ReactNode {
  const {
    workspace,
    resume,
    busy,
    setBusy,
    drafts,
    setDraft,
    activeId,
    setActiveId,
    onWorkspace,
    onConfirmed
  } = props
  const [error, setError] = useState('')
  const documents = workspace?.resumeDocuments ?? []
  const doc = documents.find((entry) => entry.id === activeId) ?? documents[0]
  const draft = doc
    ? (drafts[doc.id] ?? { fields: doc.fields, selected: doc.selectedFields })
    : null
  const dirty = doc && draft && hasReviewChanges(doc, draft)
  const run = async (action: () => Promise<void>): Promise<void> => {
    setError('')
    setBusy(true)
    try {
      await action()
    } catch (error) {
      setError(
        error instanceof Error
          ? error.message.replace(/^Error invoking remote method '[^']+': Error: /, '')
          : '操作失败，请重试。'
      )
    } finally {
      setBusy(false)
    }
  }
  const selectField = (key: keyof ResumeData, checked: boolean): void => {
    if (!doc || !draft) return
    setDraft(doc.id, {
      ...draft,
      selected: checked ? [...draft.selected, key] : draft.selected.filter((item) => item !== key)
    })
  }
  const changeField = (key: keyof ResumeData, value: string): void => {
    if (!doc || !draft) return
    setDraft(doc.id, {
      fields: { ...draft.fields, [key]: value },
      selected: draft.selected.includes(key) ? draft.selected : [...draft.selected, key]
    })
  }
  const deleteDocument = (doc: ResumeDocument): void => {
    if (
      !window.confirm(
        `删除「${doc.fileName}」的本机副本、解析原文和校对记录？已保存的简历资料与历史版本会保留。此操作不可撤销，备份文件仍包含原有副本。`
      )
    )
      return
    void run(async () => {
      onWorkspace(await dataAPI.deleteResumeDocument(doc.id))
      setActiveId('')
    })
  }

  return (
    <section className="content resume-upload-page">
      <div className="page-heading">
        <div>
          <div className="eyebrow">简历文件</div>
          <h1>简历上传与校对</h1>
          <p>从文件提取文字，对照原文检查后，再写入你的简历资料。</p>
        </div>
        <button
          className="button button-primary"
          disabled={busy || !workspace}
          onClick={() =>
            void run(async () => {
              const imported = await dataAPI.importResume()
              if (imported) {
                onWorkspace(imported.workspace)
                setActiveId(imported.documentId)
              }
            })
          }
        >
          {busy ? <LoaderCircle size={16} className="resume-spinner" /> : <Upload size={16} />}
          {busy ? '正在处理…' : '导入简历'}
        </button>
      </div>
      <div className="resume-format-note">
        <ShieldCheck size={15} />
        <span>仅在本机处理 · PDF / DOCX · 单文件 ≤ 10 MB · PDF ≤ 30 页 · 最多保留 10 份</span>
      </div>
      <p className="muted-meta">
        扫描件请先转为文字；旧版 .doc 请另存为 .docx。解析不会自动改写或补充个人事实。
      </p>
      {error && (
        <div className="resume-error" role="alert">
          {error}
        </div>
      )}
      {busy && (
        <div className="resume-progress" role="status">
          正在选择文件、解析或保存，请稍候。你可以切换页面，解析会在后台继续。
        </div>
      )}
      {!documents.length ? (
        <div className="upload-panel">
          <div className="upload-icon">
            <FileText size={24} />
          </div>
          <h2>从一份已有简历开始</h2>
          <p>
            导入文件后，左侧查看提取原文，右侧逐项校对。
            <br />
            确认前，你的现有简历资料保持不变。
          </p>
          <div className="upload-limit">01 导入文件 -&gt; 02 人工校对 -&gt; 03 确认保存</div>
        </div>
      ) : (
        <>
          <div className="resume-document-list" aria-label="已导入简历">
            {documents.map((entry) => (
              <button
                key={entry.id}
                disabled={busy}
                className={`resume-document${doc?.id === entry.id ? ' is-active' : ''}`}
                onClick={() => {
                  setActiveId(entry.id)
                  setError('')
                }}
              >
                <FileText size={17} />
                <span>
                  <strong>{entry.fileName}</strong>
                  <small>
                    {new Date(entry.importedAt).toLocaleString('zh-CN')} ·{' '}
                    {Math.ceil(entry.size / 1024)} KB
                  </small>
                </span>
                <span className="resume-status">
                  {drafts[entry.id] && hasReviewChanges(entry, drafts[entry.id])
                    ? '待保存'
                    : entry.status === 'confirmed'
                      ? '已确认'
                      : '待校对'}
                </span>
              </button>
            ))}
          </div>
          {doc && draft && (
            <>
              <div className="resume-review-heading">
                <div>
                  <h2>人工校对</h2>
                  <p>勾选要写入的字段，未勾选项保留当前简历草稿。空白字段也可手动补充。</p>
                </div>
                <div className="data-actions">
                  <button
                    className="button button-secondary"
                    disabled={busy}
                    onClick={() => void run(() => dataAPI.openResumeOriginal(doc.id))}
                  >
                    <ExternalLink size={14} /> 打开原文件
                  </button>
                  <button
                    className="icon-button"
                    disabled={busy}
                    aria-label="删除此简历文件"
                    title="删除此简历文件"
                    onClick={() => deleteDocument(doc)}
                  >
                    <Trash2 size={16} />
                  </button>
                </div>
              </div>
              <div className="resume-warnings">
                {doc.warnings.map((warning, index) => (
                  <p key={index}>{warning}</p>
                ))}
              </div>
              <div className="resume-review-grid">
                <section className="resume-source">
                  <div className="resume-pane-heading">
                    <h3>提取原文</h3>
                    <span>{doc.rawText.length.toLocaleString()} 字符</span>
                  </div>
                  <pre tabIndex={0} aria-label="简历提取原文">
                    {doc.rawText}
                  </pre>
                </section>
                <section className="resume-review-fields">
                  <div className="resume-pane-heading">
                    <h3>结构化资料</h3>
                    <span>{draft.selected.length} 项已选</span>
                  </div>
                  {resumeFields.map(({ key, label, multiline }) => (
                    <div className="resume-review-field" key={key}>
                      <label className="resume-field-check">
                        <input
                          type="checkbox"
                          disabled={busy}
                          checked={draft.selected.includes(key)}
                          onChange={(event) => selectField(key, event.target.checked)}
                        />
                        <span>{label}</span>
                        {!draft.fields[key] && <small>未识别 / 待补充</small>}
                      </label>
                      {multiline ? (
                        <textarea
                          aria-label={`校对${label}`}
                          rows={key === 'experience' ? 6 : 3}
                          value={draft.fields[key]}
                          disabled={busy}
                          onChange={(event) => changeField(key, event.target.value)}
                          placeholder="对照原文补充，或不勾选此项"
                        />
                      ) : (
                        <input
                          aria-label={`校对${label}`}
                          value={draft.fields[key]}
                          disabled={busy}
                          onChange={(event) => changeField(key, event.target.value)}
                          placeholder="未识别，可手动填写"
                        />
                      )}
                      {draft.selected.includes(key) &&
                        resume[key] !== draft.fields[key] &&
                        resume[key] && (
                          <details className="resume-current">
                            <summary>将替换当前草稿内容</summary>
                            <p>{resume[key]}</p>
                          </details>
                        )}
                    </div>
                  ))}
                </section>
              </div>
              <div className="resume-confirm-bar">
                <span role="status">
                  {dirty
                    ? '校对有未保存修改；切换页面会保留，退出前请暂存。'
                    : doc.status === 'confirmed'
                      ? '已写入简历资料并保存为历史版本。'
                      : '解析记录已保存，等待你确认。'}
                </span>
                <div className="data-actions">
                  <button
                    className="button button-secondary"
                    disabled={busy}
                    onClick={() =>
                      void run(async () => {
                        onWorkspace(
                          await dataAPI.saveResumeReview(doc.id, draft.fields, draft.selected)
                        )
                      })
                    }
                  >
                    暂存校对
                  </button>
                  <button
                    className="button button-primary"
                    disabled={
                      busy || !draft.selected.length || (doc.status === 'confirmed' && !dirty)
                    }
                    onClick={() => {
                      const selectedLabels = resumeFields
                        .filter(({ key }) => draft.selected.includes(key))
                        .map(({ label }) => label)
                        .join('、')
                      const emptyLabels = resumeFields
                        .filter(
                          ({ key }) => draft.selected.includes(key) && !draft.fields[key].trim()
                        )
                        .map(({ label }) => label)
                      if (
                        !window.confirm(
                          `将已勾选的 ${draft.selected.length} 项（${selectedLabels}）写入简历，未勾选项保留当前草稿，并保存一个新版本。${emptyLabels.length ? `\n注意：${emptyLabels.join('、')}为空，确认将清空这些字段。` : ''}\n请确认已对照原文件完成校对。`
                        )
                      )
                        return
                      void run(async () => {
                        const saved = await dataAPI.confirmResumeReview(
                          doc.id,
                          draft.fields,
                          draft.selected,
                          resume
                        )
                        onConfirmed(saved)
                      })
                    }}
                  >
                    <Check size={15} /> 确认并写入简历
                  </button>
                </div>
              </div>
            </>
          )}
        </>
      )}
    </section>
  )
}
