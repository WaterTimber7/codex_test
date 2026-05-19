import { useEffect, useMemo, useState, type FormEvent } from 'react'
import './App.css'

type Priority = 'low' | 'normal' | 'high'
type Filter = 'all' | 'upcoming' | 'completed' | 'overdue'

type Reminder = {
  id: string
  title: string
  dueAt: string
  notes: string
  priority: Priority
  completed: boolean
  notified: boolean
  createdAt: number
}

type Draft = {
  title: string
  dueAt: string
  notes: string
  priority: Priority
}

const STORAGE_KEY = 'ruikang-reminders-v1'
const DEFAULT_DRAFT: Draft = {
  title: '',
  dueAt: '',
  notes: '',
  priority: 'normal',
}

const priorityLabel: Record<Priority, string> = {
  low: '低',
  normal: '中',
  high: '高',
}

const priorityTone: Record<Priority, string> = {
  low: 'low',
  normal: 'normal',
  high: 'high',
}

const priorityRank: Record<Priority, number> = {
  high: 0,
  normal: 1,
  low: 2,
}

function createId() {
  return globalThis.crypto?.randomUUID?.() ?? `reminder-${Date.now()}-${Math.random()}`
}

function toLocalInputValue(date: Date) {
  const offset = date.getTimezoneOffset()
  const local = new Date(date.getTime() - offset * 60_000)
  return local.toISOString().slice(0, 16)
}

function formatDateTime(value: string) {
  if (!value) return '未设置'
  return new Intl.DateTimeFormat('zh-CN', {
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(value))
}

function formatDateTimeLong(value: string) {
  if (!value) return ''
  return new Intl.DateTimeFormat('zh-CN', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(value))
}

function minutesUntil(value: string) {
  const diff = new Date(value).getTime() - Date.now()
  return Math.round(diff / 60000)
}

function loadReminders(): Reminder[] {
  try {
    const stored = localStorage.getItem(STORAGE_KEY)
    if (!stored) {
      return [
        {
          id: createId(),
          title: '下午 4 点前提交周报',
          dueAt: toLocalInputValue(new Date(Date.now() + 1000 * 60 * 45)),
          notes: '补充本周进展和下周计划。',
          priority: 'high',
          completed: false,
          notified: false,
          createdAt: Date.now(),
        },
        {
          id: createId(),
          title: '晚上 8 点整理桌面',
          dueAt: toLocalInputValue(new Date(Date.now() + 1000 * 60 * 180)),
          notes: '把明天要带走的文件放一起。',
          priority: 'normal',
          completed: false,
          notified: false,
          createdAt: Date.now(),
        },
      ]
    }

    const parsed = JSON.parse(stored) as Reminder[]
    if (!Array.isArray(parsed)) return []

    return parsed.filter((item) => item && typeof item.id === 'string')
  } catch {
    return []
  }
}

function App() {
  const [reminders, setReminders] = useState<Reminder[]>(() => loadReminders())
  const [draft, setDraft] = useState<Draft>(DEFAULT_DRAFT)
  const [filter, setFilter] = useState<Filter>('all')
  const [alert, setAlert] = useState<string | null>(null)
  const [now, setNow] = useState(() => Date.now())

  useEffect(() => {
    if (reminders.length === 0) {
      localStorage.removeItem(STORAGE_KEY)
    } else {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(reminders))
    }
  }, [reminders])

  useEffect(() => {
    const interval = window.setInterval(() => {
      const currentNow = Date.now()
      setNow(currentNow)
      const triggered: string[] = []

      setReminders((current) =>
        current.map((item) => {
          if (item.completed) {
            return item
          }

          const dueTime = new Date(item.dueAt).getTime()
          if (Number.isNaN(dueTime) || dueTime > currentNow || item.notified) {
            return item
          }

          triggered.push(item.title)
          return { ...item, notified: true }
        }),
      )

      if (triggered.length > 0) {
        setAlert(`提醒已到期：${triggered.join('、')}`)
      }
    }, 30_000)

    return () => window.clearInterval(interval)
  }, [])

  const sortedReminders = useMemo(() => {
    return [...reminders].sort((a, b) => {
      const priorityDiff = priorityRank[a.priority] - priorityRank[b.priority]
      if (priorityDiff !== 0) return priorityDiff

      const aDone = a.completed ? 1 : 0
      const bDone = b.completed ? 1 : 0
      if (aDone !== bDone) return aDone - bDone
      return new Date(a.dueAt).getTime() - new Date(b.dueAt).getTime()
    })
  }, [reminders])

  const visibleReminders = useMemo(() => {
    return sortedReminders.filter((item) => {
      const overdue = !item.completed && new Date(item.dueAt).getTime() < now

      switch (filter) {
        case 'upcoming':
          return !item.completed && !overdue
        case 'completed':
          return item.completed
        case 'overdue':
          return overdue
        default:
          return true
      }
    })
  }, [filter, now, sortedReminders])

  const stats = useMemo(() => {
    return reminders.reduce(
      (acc, item) => {
        const dueTime = new Date(item.dueAt).getTime()
        const overdue = !item.completed && dueTime < now

        acc.total += 1
        if (item.completed) acc.completed += 1
        if (overdue) acc.overdue += 1
        if (!item.completed && !overdue) acc.upcoming += 1
        return acc
      },
      { total: 0, completed: 0, overdue: 0, upcoming: 0 },
    )
  }, [now, reminders])

  const nextReminder = useMemo(() => {
    return reminders
      .filter((item) => !item.completed)
      .sort((a, b) => new Date(a.dueAt).getTime() - new Date(b.dueAt).getTime())[0]
  }, [reminders])

  function updateReminder(id: string, updater: (item: Reminder) => Reminder) {
    setReminders((current) => current.map((item) => (item.id === id ? updater(item) : item)))
  }

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()

    if (!draft.title.trim() || !draft.dueAt) {
      setAlert('请输入标题和提醒时间。')
      return
    }

    setReminders((current) => [
      {
        id: createId(),
        title: draft.title.trim(),
        dueAt: new Date(draft.dueAt).toISOString(),
        notes: draft.notes.trim(),
        priority: draft.priority,
        completed: false,
        notified: false,
        createdAt: Date.now(),
      },
      ...current,
    ])

    setDraft(DEFAULT_DRAFT)
    setAlert('已添加提醒。')
  }

  function handleSnooze(id: string, minutes: number) {
    updateReminder(id, (item) => ({
      ...item,
      dueAt: new Date(Date.now() + minutes * 60_000).toISOString(),
      notified: false,
    }))
    setAlert(`已顺延 ${minutes} 分钟。`)
  }

  const overdueCount = reminders.filter(
    (item) => !item.completed && new Date(item.dueAt).getTime() < now,
  ).length

  return (
    <main className="app-shell">
      <section className="hero">
        <div className="hero-copy">
          <p className="eyebrow">React · 本地提醒</p>
          <h1>待办事项提醒工具</h1>
          <p className="lede">
            记录待办、设置提醒时间、跟踪到期状态，并把今天要处理的事情放在一页里。
          </p>

          <div className="stats">
            <article>
              <span>总计</span>
              <strong>{stats.total}</strong>
            </article>
            <article>
              <span>待处理</span>
              <strong>{stats.upcoming}</strong>
            </article>
            <article>
              <span>已完成</span>
              <strong>{stats.completed}</strong>
            </article>
            <article className={overdueCount > 0 ? 'alert' : ''}>
              <span>逾期</span>
              <strong>{stats.overdue}</strong>
            </article>
          </div>
        </div>

        <aside className="next-panel">
          <p>下一条提醒</p>
          {nextReminder ? (
            <>
              <h2>{nextReminder.title}</h2>
              <div className="meta-row">
                <span className={`pill ${priorityTone[nextReminder.priority]}`}>
                  {priorityLabel[nextReminder.priority]}
                </span>
                <span>{formatDateTime(nextReminder.dueAt)}</span>
              </div>
              <p className="next-text">
                {nextReminder.completed
                  ? '已完成'
                  : minutesUntil(nextReminder.dueAt) <= 0
                    ? '已经到期'
                    : `还有 ${minutesUntil(nextReminder.dueAt)} 分钟`}
              </p>
            </>
          ) : (
            <p className="next-text">暂无待提醒事项。</p>
          )}
        </aside>
      </section>

      {alert ? (
        <div className="banner" role="status">
          <span>{alert}</span>
          <button type="button" onClick={() => setAlert(null)}>
            关闭
          </button>
        </div>
      ) : null}

      <section className="content-grid">
        <form className="panel form-panel" onSubmit={handleSubmit}>
          <div className="panel-head">
            <h2>新增提醒</h2>
            <p>先填标题和时间，其他字段可选。</p>
          </div>

          <label>
            <span>标题</span>
            <input
              value={draft.title}
              onChange={(event) =>
                setDraft((current) => ({ ...current, title: event.target.value }))
              }
              placeholder="例如：提交项目评审稿"
            />
          </label>

          <div className="two-up">
            <label>
              <span>提醒时间</span>
              <input
                type="datetime-local"
                value={draft.dueAt}
                onChange={(event) =>
                  setDraft((current) => ({ ...current, dueAt: event.target.value }))
                }
              />
            </label>

            <label>
              <span>优先级</span>
              <select
                value={draft.priority}
                onChange={(event) =>
                  setDraft((current) => ({
                    ...current,
                    priority: event.target.value as Priority,
                  }))
                }
              >
                <option value="low">低</option>
                <option value="normal">中</option>
                <option value="high">高</option>
              </select>
            </label>
          </div>

          <label>
            <span>备注</span>
            <textarea
              rows={4}
              value={draft.notes}
              onChange={(event) =>
                setDraft((current) => ({ ...current, notes: event.target.value }))
              }
              placeholder="补充链接、地点、负责人等信息"
            />
          </label>

          <button className="primary" type="submit">
            添加提醒
          </button>
        </form>

        <section className="panel list-panel">
          <div className="panel-head">
            <div>
              <h2>消息提示列表</h2>
              <p>完成、顺延和删除都在这里处理。</p>
            </div>

            <div className="filters" role="tablist" aria-label="提醒筛选">
              {(['all', 'upcoming', 'completed', 'overdue'] as Filter[]).map((item) => (
                <button
                  key={item}
                  type="button"
                  className={filter === item ? 'filter active' : 'filter'}
                  onClick={() => setFilter(item)}
                >
                  {item === 'all' ? '全部' : item === 'upcoming' ? '待处理' : item === 'completed' ? '已完成' : '逾期'}
                </button>
              ))}
            </div>
          </div>

          <div className="list">
            {visibleReminders.length === 0 ? (
              <div className="empty-state">
                <strong>当前没有符合筛选条件的提醒。</strong>
                <span>可以先添加一条任务，或者切换到“全部”查看。</span>
              </div>
            ) : (
              visibleReminders.map((item) => {
                const overdue = !item.completed && new Date(item.dueAt).getTime() < now
                return (
                  <article key={item.id} className={`task ${item.completed ? 'done' : ''}`}>
                    <div className="task-main">
                      <div className="task-top">
                        <h3>{item.title}</h3>
                        <span className={`pill ${priorityTone[item.priority]}`}>
                          {priorityLabel[item.priority]}
                        </span>
                      </div>
                      <p>{item.notes || '没有备注。'}</p>
                      <div className="task-meta">
              <span>{formatDateTimeLong(item.dueAt)}</span>
                        <span>{item.completed ? '已完成' : overdue ? '已逾期' : '未到期'}</span>
                      </div>
                    </div>

                    <div className="actions">
                      <button
                        type="button"
                        className="ghost"
                        onClick={() =>
                          updateReminder(item.id, (current) => ({
                            ...current,
                            completed: !current.completed,
                            notified: current.completed ? current.notified : true,
                          }))
                        }
                      >
                        {item.completed ? '恢复' : '完成'}
                      </button>
                      <button
                        type="button"
                        className="ghost"
                        onClick={() => handleSnooze(item.id, 10)}
                        disabled={item.completed}
                      >
                        顺延 10 分钟
                      </button>
                      <button
                        type="button"
                        className="ghost danger"
                        onClick={() =>
                          setReminders((current) => current.filter((currentItem) => currentItem.id !== item.id))
                        }
                      >
                        删除
                      </button>
                    </div>
                  </article>
                )
              })
            )}
          </div>
        </section>
      </section>
    </main>
  )
}

export default App
